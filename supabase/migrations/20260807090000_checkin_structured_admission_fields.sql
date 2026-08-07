-- Check-in reporting, step 2: structured admission fields
-- (docs/CHECKIN_REPORT_TEMPLATES_SPEC.md section 7.1)
--
-- How a guest was admitted is currently recoverable only by regex-parsing a
-- display string. checkin_scan_events.checked_in_by is assembled in
-- apps/opus_pass/src/app/api/checkin/scan/route.ts as:
--
--   "{attendant} ({door}) [{identifierType}]" + optional " (manual: {reason})"
--
-- e.g. "Boris Massesa (Main Gate) [roster_pick] (manual: QR could not be
-- scanned)". Deriving a client-facing "Manual Admissions: 3" by parsing that
-- breaks silently the first time someone edits the label, so the report cannot
-- carry the number until the facts are columns.
--
-- TWO fields, not one. `roster_pick` says how the invitation was RESOLVED;
-- "manual" says which operational PATH the attendant took. They correlate
-- today but need not forever: searching by Pass ID and then overriding is
-- manual without being a roster pick. Collapsing them now would bake today's
-- coincidence into the audit trail.
--
-- checked_in_by is left exactly as it is. Every existing reader keeps working,
-- and the label stays the human-readable audit line it always was.

-- ---------------------------------------------------------------------------
-- 1) Columns
-- ---------------------------------------------------------------------------

ALTER TABLE checkin_scan_events
  -- How the invitation was found.
  ADD COLUMN IF NOT EXISTS resolution_method TEXT,
  -- Which path the attendant took to admit them.
  ADD COLUMN IF NOT EXISTS admission_mode TEXT,
  -- Why the attendant admitted by hand. Required by the API for every manual
  -- path; NULL on a scan.
  ADD COLUMN IF NOT EXISTS manual_reason TEXT,
  -- The person, without the door/identifier/reason decoration.
  ADD COLUMN IF NOT EXISTS attendant_name TEXT;

-- Constraints are NOT NULL-tolerant on purpose: every row written before this
-- migration has NULLs that no backfill can honestly resolve, and the report
-- model renders NULL as "not recorded" rather than as zero.
ALTER TABLE checkin_scan_events
  DROP CONSTRAINT IF EXISTS checkin_scan_events_resolution_method_check;
ALTER TABLE checkin_scan_events
  ADD CONSTRAINT checkin_scan_events_resolution_method_check
  CHECK (resolution_method IS NULL OR resolution_method IN
    ('credential', 'pass_id', 'legacy_entry_code', 'roster_pick'));

ALTER TABLE checkin_scan_events
  DROP CONSTRAINT IF EXISTS checkin_scan_events_admission_mode_check;
ALTER TABLE checkin_scan_events
  ADD CONSTRAINT checkin_scan_events_admission_mode_check
  CHECK (admission_mode IS NULL OR admission_mode IN ('scan', 'manual'));

-- Counting manual admissions for one event is the report's hot path.
CREATE INDEX IF NOT EXISTS idx_checkin_scan_events_mode
  ON checkin_scan_events(event_id, admission_mode)
  WHERE admission_mode IS NOT NULL;

COMMENT ON COLUMN checkin_scan_events.resolution_method IS
  'How the invitation was resolved: credential | pass_id | legacy_entry_code | roster_pick. NULL on rows written before this column existed.';
COMMENT ON COLUMN checkin_scan_events.admission_mode IS
  'Operational path: scan (QR presented) | manual (attendant admitted by hand). Deliberately separate from resolution_method.';
COMMENT ON COLUMN checkin_scan_events.manual_reason IS
  'Why a manual admission was made. NULL on scans. Internal/operational: never shown on a client-facing report.';
COMMENT ON COLUMN checkin_scan_events.attendant_name IS
  'Attendant display name, undecorated. A typed label, not a verified account: attributable, not authenticated.';

-- ---------------------------------------------------------------------------
-- 2) Backfill from the existing labels
-- ---------------------------------------------------------------------------
--
-- Only rows matching the known shape are filled. A label that does not match
-- stays NULL and surfaces as "not recorded" rather than being guessed at,
-- which is the whole point of moving off the parse.
--
-- Ordering matters: attendant_name is derived from the raw label, so it is
-- taken before anything else rewrites the column (nothing does, but the
-- statement is written to be re-runnable).

UPDATE checkin_scan_events
SET resolution_method = substring(checked_in_by from '\[([a-z_]+)\]')
WHERE resolution_method IS NULL
  AND checked_in_by ~ '\[(credential|pass_id|legacy_entry_code|roster_pick)\]';

-- The API requires a manual reason for every non-QR path, so "(manual: ...)"
-- present is the reliable marker of a manual admission. Its ABSENCE is only
-- meaningful once we know the label was written in this format at all, hence
-- the identifier-bracket guard: a label from some other writer tells us
-- nothing and must stay NULL.
UPDATE checkin_scan_events
SET admission_mode = CASE
      WHEN checked_in_by ~ '\(manual: ' THEN 'manual'
      ELSE 'scan'
    END
WHERE admission_mode IS NULL
  AND checked_in_by ~ '\[(credential|pass_id|legacy_entry_code|roster_pick)\]';

UPDATE checkin_scan_events
SET manual_reason = substring(checked_in_by from '\(manual: (.*)\)$')
WHERE manual_reason IS NULL
  AND checked_in_by ~ '\(manual: ';

-- Everything before the first " (" is the person. Guarded on the same shape so
-- a free-text label from elsewhere is not mistaken for a name.
UPDATE checkin_scan_events
SET attendant_name = NULLIF(btrim(split_part(checked_in_by, ' (', 1)), '')
WHERE attendant_name IS NULL
  AND checked_in_by ~ '\[(credential|pass_id|legacy_entry_code|roster_pick)\]';

-- ---------------------------------------------------------------------------
-- 3) checkin_admit_guest gains the four fields
-- ---------------------------------------------------------------------------
--
-- Written INSIDE the claim rather than tagged afterwards. The credential tag
-- in the scan route is a best-effort post-admission UPDATE, which is right for
-- a value that only annotates; these four decide a number the couple reads, so
-- a dropped write would silently under-report manual admissions — exactly the
-- silent-breakage this migration exists to remove.
--
-- DROP then CREATE, not CREATE OR REPLACE: replace cannot change a signature,
-- so it would leave a second overload behind and every 7-argument call would
-- fail as ambiguous. Dropping inside the migration transaction means there is
-- no window where the function is missing.
--
-- The body below is UNCHANGED from 20260802210000 except for the four columns
-- added to the claim INSERT. Every concurrency guarantee (the FOR UPDATE
-- snapshot, the request_id claim, the single-statement admission decision, the
-- transaction-local writer flag) is reproduced verbatim.

DROP FUNCTION IF EXISTS checkin_admit_guest(UUID, UUID, INT, TEXT, TEXT, UUID, TEXT);

CREATE FUNCTION checkin_admit_guest(
  p_guest_invitation_id UUID,
  p_event_id UUID,
  p_admit_count INT DEFAULT NULL,   -- NULL = admit the whole remaining allowance
  p_checked_in_by TEXT DEFAULT NULL,
  p_checked_in_door TEXT DEFAULT NULL,
  p_request_id UUID DEFAULT NULL,   -- idempotency key; NULL disables replay protection
  p_source TEXT DEFAULT 'api',
  p_resolution_method TEXT DEFAULT NULL,
  p_admission_mode TEXT DEFAULT NULL,
  p_manual_reason TEXT DEFAULT NULL,
  p_attendant_name TEXT DEFAULT NULL
) RETURNS TABLE (
  result TEXT,
  -- TRUE when this delivery changed nothing because p_request_id had already
  -- been processed. `result` still carries the ORIGINAL outcome, so a caller
  -- can render a retry exactly like the response it lost.
  is_replay BOOLEAN,
  admitted_now INT,
  total_admitted INT,
  allowance INT,
  first_admitted_at TIMESTAMPTZ,
  rsvp_party_size INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv        guest_invitations;
  v_claim_rows INT := 0;
  v_prior      checkin_scan_events;
  v_updated    guest_invitations;
  v_admitted   INT := 0;
  v_updated_rows INT := 0;
  v_result     TEXT;
BEGIN
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'checkin_admit_guest requires p_event_id';
  END IF;

  -- Read by id ALONE so a pass for another event can be reported as such
  -- rather than as a generic "not found", which would leave an attendant
  -- unable to tell a fake pass from a right-guest-wrong-day pass.
  --
  -- FOR UPDATE because admitted_now and the ledger's admitted_count are derived
  -- by subtracting this snapshot from the post-UPDATE row. Without the lock two
  -- doors admitting 2 each of a party of 4 both read count=0, and both report
  -- having admitted the whole party: the counter stays correct at 4 while the
  -- ledger sums to 6, destroying the per-door record a headcount dispute would
  -- be settled with.
  SELECT * INTO v_inv FROM guest_invitations WHERE id = p_guest_invitation_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, FALSE, 0, 0, 0, NULL::TIMESTAMPTZ, 0;
    RETURN;
  END IF;

  IF v_inv.event_id <> p_event_id THEN
    RETURN QUERY SELECT 'wrong_event'::TEXT, FALSE, 0, v_inv.checked_in_count, v_inv.entry_allowance,
                        v_inv.checked_in_at, COALESCE(v_inv.party_size, 1);
    RETURN;
  END IF;

  -- Claim the request id before touching the counter. The unique index does
  -- the serialising: a concurrent delivery of the same id blocks here until
  -- this transaction commits, then sees 0 rows inserted and replays the
  -- committed outcome. Neither delivery can reach the UPDATE below without
  -- having won the claim first.
  IF p_request_id IS NOT NULL THEN
    INSERT INTO checkin_scan_events (
      request_id, guest_invitation_id, event_id, checked_in_by, checked_in_door, source,
      resolution_method, admission_mode, manual_reason, attendant_name
    ) VALUES (
      p_request_id, v_inv.id, v_inv.event_id, p_checked_in_by, p_checked_in_door,
      COALESCE(p_source, 'api'),
      p_resolution_method, p_admission_mode, p_manual_reason, p_attendant_name
    )
    ON CONFLICT (request_id) DO NOTHING;

    GET DIAGNOSTICS v_claim_rows = ROW_COUNT;

    IF v_claim_rows = 0 THEN
      SELECT * INTO v_prior FROM checkin_scan_events WHERE request_id = p_request_id;

      -- A replay is only a replay for the guest it was claimed against.
      -- Re-presenting an id under a different invitation or event would
      -- otherwise return that other guest's "admitted" and wave this one
      -- through on someone else's admission.
      -- Both RPCs share this table's request_id space. A claim made by the
      -- amend path is not an admission, so replaying it here would answer an
      -- admission with a correction's outcome.
      IF v_prior.guest_invitation_id <> p_guest_invitation_id
         OR v_prior.event_id <> p_event_id
         OR v_prior.source = 'amend' THEN
        RETURN QUERY SELECT 'request_conflict'::TEXT, FALSE, 0,
                            v_inv.checked_in_count, v_inv.entry_allowance,
                            v_inv.checked_in_at, COALESCE(v_inv.party_size, 1);
        RETURN;
      END IF;

      -- Reproduce the original response, not the row's current state: the
      -- caller is owed the answer it lost. 'in_progress' is only reachable if
      -- the first delivery is running in a transaction that has not committed
      -- and cannot commit (it holds the claim), so it means "retry", not
      -- "nothing happened".
      RETURN QUERY SELECT COALESCE(v_prior.result, 'in_progress'), TRUE,
                          COALESCE(v_prior.admitted_count, 0),
                          COALESCE(v_prior.total_after, v_inv.checked_in_count),
                          COALESCE(v_prior.allowance_after, v_inv.entry_allowance),
                          v_inv.checked_in_at, COALESCE(v_inv.party_size, 1);
      RETURN;
    END IF;
  END IF;

  -- The whole admission decision is this one statement. Every guard is in
  -- the WHERE clause, so two doors scanning the last seat of a party at the
  -- same instant cannot both win: the loser re-evaluates the predicate after
  -- the winner commits and matches no row. The same applies to an allowance
  -- cut or an RSVP flipped to declined racing a scan.
  --
  -- COALESCE(p_admit_count, remaining) means an explicit over-count is
  -- REJECTED (the caller asked for something impossible and should be told),
  -- while an unspecified count admits whatever is left. The >= 1 guard
  -- covers both a zero/negative explicit count and an already-exhausted
  -- allowance.
  -- Opens the authorisation window for the trigger, and it is closed again
  -- immediately after the UPDATE below. The flag is transaction-local, so
  -- leaving it open would let every later statement in the SAME transaction
  -- write the counter freely — which is exactly what a caller batching an
  -- admission with other work would do by accident.
  PERFORM set_config('opuspass.checkin_writer', 'on', TRUE);

  UPDATE guest_invitations gi
  SET checked_in_count = gi.checked_in_count
                       + COALESCE(p_admit_count, gi.entry_allowance - gi.checked_in_count),
      -- First-entry metadata is written once and then frozen. Per-admission
      -- attribution belongs to checkin_scan_events.
      checked_in_at = COALESCE(gi.checked_in_at, now()),
      checked_in_by = COALESCE(gi.checked_in_by, p_checked_in_by),
      checked_in_door = COALESCE(gi.checked_in_door, p_checked_in_door),
      -- Deprecated mirror, kept in step for existing readers.
      checked_in_party_size = gi.checked_in_count
                            + COALESCE(p_admit_count, gi.entry_allowance - gi.checked_in_count)
  WHERE gi.id = p_guest_invitation_id
    AND gi.event_id = p_event_id
    AND gi.rsvp_status = 'attending'
    AND COALESCE(p_admit_count, gi.entry_allowance - gi.checked_in_count) >= 1
    AND gi.checked_in_count
      + COALESCE(p_admit_count, gi.entry_allowance - gi.checked_in_count) <= gi.entry_allowance
  RETURNING * INTO v_updated;

  -- ROW_COUNT before anything else: GET DIAGNOSTICS leaves FOUND alone, but
  -- the set_config below would set it unconditionally.
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  PERFORM set_config('opuspass.checkin_writer', 'off', TRUE);

  IF v_updated_rows > 0 THEN
    v_admitted := v_updated.checked_in_count - v_inv.checked_in_count;

    IF p_request_id IS NOT NULL THEN
      UPDATE checkin_scan_events
      SET result = 'admitted', admitted_count = v_admitted,
          total_after = v_updated.checked_in_count,
          allowance_after = v_updated.entry_allowance,
          completed_at = clock_timestamp()
      WHERE request_id = p_request_id;
    END IF;

    RETURN QUERY SELECT 'admitted'::TEXT, FALSE, v_admitted, v_updated.checked_in_count,
                        v_updated.entry_allowance, v_updated.checked_in_at,
                        COALESCE(v_updated.party_size, 1);
    RETURN;
  END IF;

  -- Nothing was admitted. Re-read to explain why with current state rather
  -- than the values read before the attempt.
  SELECT * INTO v_inv FROM guest_invitations WHERE id = p_guest_invitation_id;

  IF v_inv.rsvp_status <> 'attending' THEN
    v_result := 'not_attending';
  ELSE
    -- Either the allowance is used up, or the caller asked for more than is
    -- left. Both read the same at the door: no more entries on this pass.
    v_result := 'exhausted';
  END IF;

  IF p_request_id IS NOT NULL THEN
    UPDATE checkin_scan_events
    SET result = v_result, admitted_count = 0,
        total_after = v_inv.checked_in_count,
        allowance_after = v_inv.entry_allowance,
        completed_at = clock_timestamp()
    WHERE request_id = p_request_id;
  END IF;

  RETURN QUERY SELECT v_result, FALSE, 0, v_inv.checked_in_count, v_inv.entry_allowance,
                      v_inv.checked_in_at, COALESCE(v_inv.party_size, 1);
END;
$$;

COMMENT ON FUNCTION checkin_admit_guest(UUID, UUID, INT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'Atomically admits up to the remaining entry_allowance for one guest_invitation. Idempotent per p_request_id, which is bound to the invitation it was claimed against. Records how the invitation was resolved and whether the admission was scanned or manual. Service-role only.';

-- SECURITY DEFINER without this is an open door: Postgres grants EXECUTE to
-- PUBLIC by default and PostgREST exposes every public-schema function as an
-- RPC, so anyone holding the anon key could admit guests. The DROP above threw
-- the old grants away with the old signature, so they are re-established here
-- against the new one.
REVOKE ALL ON FUNCTION checkin_admit_guest(UUID, UUID, INT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION checkin_admit_guest(UUID, UUID, INT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;
