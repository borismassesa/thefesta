-- OpusPass Wallet Entry Pass — PR 1: admission counters + atomic admit RPC
--
-- Groundwork for partial group admission ("2 of 4 admitted") and for the
-- wallet passes that will later render the remaining allowance. Deliberately
-- NOT a new `admissions` table: guest_invitations already IS the admission
-- record (unique per guest+event) and is read by the scanner, the couple's
-- RSVP dashboard, seating and admin reporting. A parallel table would fork
-- the source of truth, which is exactly what the wallet design must avoid.
--
-- Check-in today is boolean (checked_in_at IS NULL) and first-scan-wins. This
-- migration turns it into a bounded counter while keeping every existing
-- reader working:
--   checked_in_at / _by / _door -> the FIRST successful admission
--   checked_in_party_size       -> mirrors checked_in_count (deprecated)
--
-- The first-entry fields are deliberately singular and frozen. A party that
-- arrives across two doors cannot be described by one door label, so the
-- per-admission truth lives in checkin_scan_events; these columns answer only
-- "when did this pass first come through, and who waved it in".
--
-- checked_in_party_size carries no information checked_in_count does not, and
-- should be dropped once the dashboards, the admin check-in console and the
-- arrivals poll read the counter directly.

-- ---------------------------------------------------------------------------
-- 1) Counter columns
-- ---------------------------------------------------------------------------

ALTER TABLE guest_invitations
  ADD COLUMN IF NOT EXISTS entry_allowance INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS checked_in_count INT NOT NULL DEFAULT 0;

-- Backfill BEFORE the CHECK constraints go on, so a bad legacy row fails the
-- migration loudly here rather than at some later door scan.
--
-- entry_allowance comes from the RSVP'd headcount. GREATEST(...,1) because
-- party_size has a NOT NULL default of 1 but nothing has ever stopped a
-- writer storing 0, and an allowance of 0 would admit nobody.
UPDATE guest_invitations
SET entry_allowance = GREATEST(COALESCE(party_size, 1), 1)
WHERE entry_allowance IS DISTINCT FROM GREATEST(COALESCE(party_size, 1), 1);

-- Historical admissions: do NOT assume everyone who was checked in arrived
-- with their full party. checked_in_party_size is what the attendant actually
-- confirmed at the door and is the only honest figure; party_size is the
-- fallback for rows admitted before that column existed (the old 3-arg RPC
-- recorded the whole party), and 1 is the last resort.
UPDATE guest_invitations
SET checked_in_count = LEAST(
      GREATEST(COALESCE(checked_in_party_size, party_size, 1), 1),
      entry_allowance
    )
WHERE checked_in_at IS NOT NULL;

-- Rows never scanned stay at 0, which is already the column default.

ALTER TABLE guest_invitations
  DROP CONSTRAINT IF EXISTS guest_invitations_entry_allowance_positive,
  DROP CONSTRAINT IF EXISTS guest_invitations_checked_in_count_non_negative,
  DROP CONSTRAINT IF EXISTS guest_invitations_checked_in_count_within_allowance;

ALTER TABLE guest_invitations
  ADD CONSTRAINT guest_invitations_entry_allowance_positive
    CHECK (entry_allowance >= 1),
  ADD CONSTRAINT guest_invitations_checked_in_count_non_negative
    CHECK (checked_in_count >= 0),
  ADD CONSTRAINT guest_invitations_checked_in_count_within_allowance
    CHECK (checked_in_count <= entry_allowance);

COMMENT ON COLUMN guest_invitations.entry_allowance IS
  'How many people this admission may admit in total. Follows party_size via trg_guest_invitations_sync_allowance unless set explicitly.';
COMMENT ON COLUMN guest_invitations.checked_in_count IS
  'How many of the allowance have walked in. Source of truth for admission; 0 means not yet arrived.';
COMMENT ON COLUMN guest_invitations.checked_in_party_size IS
  'DEPRECATED: mirrors checked_in_count for existing readers. Drop once dashboards read checked_in_count.';
COMMENT ON COLUMN guest_invitations.checked_in_at IS
  'FIRST successful admission. Frozen: later partial admissions do not move it.';
COMMENT ON COLUMN guest_invitations.checked_in_by IS
  'Attendant who made the FIRST admission. Frozen. Per-admission attribution lives in checkin_scan_events.';
COMMENT ON COLUMN guest_invitations.checked_in_door IS
  'Door of the FIRST admission. Frozen. A party split across doors is only reconstructable from checkin_scan_events.';

-- ---------------------------------------------------------------------------
-- 2) Admission mutation ledger (audit + idempotency)
-- ---------------------------------------------------------------------------
--
-- A boolean check-in was idempotent for free: re-running it hit
-- `checked_in_at IS NULL` and did nothing. A counter is not. A scanner that
-- retries a request whose response was lost to a dropped venue connection
-- would admit the same people twice.
--
-- So every mutation carries a client-generated request id, claimed here
-- before the counter moves. The claim is the idempotency key AND the audit
-- row, and it is also the durable per-admission record that the frozen
-- first-entry columns on guest_invitations cannot express.

CREATE TABLE IF NOT EXISTS checkin_scan_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Generated per user-initiated admission attempt, reused verbatim across
  -- that attempt's retries. UNIQUE is what makes the retry a no-op: the
  -- second caller cannot proceed past this insert, so idempotency rests on a
  -- database constraint rather than on application ordering.
  request_id UUID NOT NULL UNIQUE,

  -- The claim is BOUND to one invitation and event. A request id presented
  -- against a different guest is a conflict, never a replay.
  guest_invitation_id UUID NOT NULL REFERENCES guest_invitations(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES wedding_events(id) ON DELETE CASCADE,

  result TEXT NOT NULL DEFAULT 'in_progress',
  -- People admitted by THIS mutation. Negative for a downward amendment.
  admitted_count INT NOT NULL DEFAULT 0,
  -- The response as it was originally answered, so a replay reproduces it
  -- exactly instead of reporting whatever the row happens to say later.
  total_after INT,
  allowance_after INT,

  -- Which code path called in. Exists so the legacy wrapper's usage can be
  -- measured and its removal justified with evidence rather than assumption.
  source TEXT NOT NULL DEFAULT 'api',
  -- Required for amendments; the audit trail must always explain a headcount
  -- that was corrected by hand.
  reason TEXT,

  checked_in_by TEXT,
  checked_in_door TEXT,

  -- clock_timestamp(), not now(): now() is transaction time, so several
  -- ledger rows written in one transaction would share a timestamp and the
  -- ledger would lose its own ordering.
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_checkin_scan_events_event
  ON checkin_scan_events(event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkin_scan_events_invitation
  ON checkin_scan_events(guest_invitation_id);
CREATE INDEX IF NOT EXISTS idx_checkin_scan_events_source
  ON checkin_scan_events(source, created_at DESC);

-- Door devices never hold a Supabase session; every write here goes through
-- the SECURITY DEFINER functions below, called with the service-role client
-- after the API route has verified the door bearer token. Nothing is
-- reachable via anon/authenticated RLS.
ALTER TABLE checkin_scan_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE checkin_scan_events IS
  'Append-only ledger of admission mutations. Idempotency key (request_id) and per-admission audit. The durable record of WHICH door admitted WHICH part of a party.';

-- Allowance corrections that were silently absorbed rather than applied as
-- asked. Kept separate from the admission ledger: this records a change to
-- what a pass MAY admit, not an admission.
CREATE TABLE IF NOT EXISTS guest_invitation_allowance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_invitation_id UUID NOT NULL REFERENCES guest_invitations(id) ON DELETE CASCADE,
  requested_allowance INT NOT NULL,
  effective_allowance INT NOT NULL,
  checked_in_count INT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_allowance_events_invitation
  ON guest_invitation_allowance_events(guest_invitation_id, created_at DESC);

ALTER TABLE guest_invitation_allowance_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE guest_invitation_allowance_events IS
  'Records every allowance change that was floored rather than applied verbatim, with both the requested and effective value.';

-- ---------------------------------------------------------------------------
-- 3) Keep entry_allowance in step with party_size
-- ---------------------------------------------------------------------------
--
-- party_size is written from several places (the public RSVP page, the
-- WhatsApp webhook, the couple's dashboard, admin tooling). Rather than
-- update every writer and hope none is added later, the allowance tracks the
-- RSVP'd headcount by default. An explicit entry_allowance write always wins,
-- which is what a "VIP admits 6" override will use.

CREATE OR REPLACE FUNCTION guest_invitations_sync_entry_allowance()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_requested INT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Only the column default (1) is treated as "caller didn't say"; any
    -- other supplied value is an explicit choice and is left alone.
    IF NEW.entry_allowance = 1 THEN
      NEW.entry_allowance := GREATEST(COALESCE(NEW.party_size, 1), 1);
    END IF;
    NEW.entry_allowance := GREATEST(NEW.entry_allowance, 1);
    RETURN NEW;
  END IF;

  -- A downward correction of the counter is a reversal, and reversals must
  -- carry a reason and an audit row. amend_guest_invitation_checkin() sets a
  -- transaction-local flag to mark itself as that authorised path; anything
  -- else lowering the counter is a stray write and is refused.
  IF NEW.checked_in_count < OLD.checked_in_count
     AND COALESCE(current_setting('opuspass.checkin_amend', TRUE), '') <> 'on' THEN
    RAISE EXCEPTION
      'checked_in_count may only be lowered by amend_guest_invitation_checkin() (invitation %)',
      NEW.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.entry_allowance IS NOT DISTINCT FROM OLD.entry_allowance
     AND NEW.party_size IS DISTINCT FROM OLD.party_size THEN
    -- Derived from the RSVP'd headcount. A guest editing their own RSVP down
    -- after part of their party has arrived must not have that edit fail, so
    -- this path FLOORS at the people already inside and records the gap.
    v_requested := GREATEST(COALESCE(NEW.party_size, 1), 1);
    NEW.entry_allowance := GREATEST(v_requested, OLD.checked_in_count, 1);

    IF NEW.entry_allowance <> v_requested THEN
      INSERT INTO guest_invitation_allowance_events (
        guest_invitation_id, requested_allowance, effective_allowance,
        checked_in_count, reason
      ) VALUES (
        NEW.id, v_requested, NEW.entry_allowance, OLD.checked_in_count,
        'party_size lowered below the headcount already admitted'
      );
    END IF;
  ELSIF NEW.entry_allowance IS DISTINCT FROM OLD.entry_allowance THEN
    -- An EXPLICIT allowance write is an operator decision, so it is not
    -- silently rewritten. Cutting an allowance below the people already
    -- admitted is almost certainly a mistake, and a loud failure is far
    -- easier to audit than a quietly adjusted number.
    --
    -- Compared against NEW.checked_in_count, not OLD: the invariant being
    -- protected is "an allowance may not sit below the people who are inside",
    -- and after this statement that is the new count. A statement that
    -- reverses an admission and lowers the allowance together therefore lands
    -- on a valid end state instead of being refused for a headcount it is
    -- itself clearing. Raising the count past the allowance is still caught by
    -- the bounding CHECK, and lowering it still needs the amend path above.
    IF NEW.entry_allowance < NEW.checked_in_count THEN
      RAISE EXCEPTION
        'entry_allowance % is below the % already admitted on invitation % (reverse the check-in first)',
        NEW.entry_allowance, NEW.checked_in_count, NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.entry_allowance := GREATEST(NEW.entry_allowance, 1);
  END IF;

  -- Floor at 1 only. Deliberately NOT floored at NEW.checked_in_count: doing
  -- that would let a direct `SET checked_in_count = 99` drag the allowance up
  -- with it and quietly turn the bounding CHECK into a no-op. Every path that
  -- legitimately needs the count as a floor uses OLD.checked_in_count above.
  NEW.entry_allowance := GREATEST(NEW.entry_allowance, 1);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guest_invitations_sync_allowance ON guest_invitations;
CREATE TRIGGER trg_guest_invitations_sync_allowance
  BEFORE INSERT OR UPDATE ON guest_invitations
  FOR EACH ROW EXECUTE FUNCTION guest_invitations_sync_entry_allowance();

-- ---------------------------------------------------------------------------
-- 4) Atomic, bounded, idempotent admit
-- ---------------------------------------------------------------------------
--
-- Output column names deliberately avoid guest_invitations column names, so
-- the function body never has to disambiguate an OUT parameter from a column.
--
-- NOTE ON RSVP STATE: the admitted state in this schema is 'attending'
-- (pending | attending | declined | maybe), not 'confirmed'. Gating on
-- 'confirmed' would reject every real guest.

DROP FUNCTION IF EXISTS checkin_admit_guest(UUID, UUID, INT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS checkin_admit_guest(UUID, UUID, INT, TEXT, TEXT, UUID, TEXT);

CREATE FUNCTION checkin_admit_guest(
  p_guest_invitation_id UUID,
  p_event_id UUID,
  p_admit_count INT DEFAULT NULL,   -- NULL = admit the whole remaining allowance
  p_checked_in_by TEXT DEFAULT NULL,
  p_checked_in_door TEXT DEFAULT NULL,
  p_request_id UUID DEFAULT NULL,   -- idempotency key; NULL disables replay protection
  p_source TEXT DEFAULT 'api'
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
  v_result     TEXT;
BEGIN
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'checkin_admit_guest requires p_event_id';
  END IF;

  -- Read by id ALONE so a pass for another event can be reported as such
  -- rather than as a generic "not found", which would leave an attendant
  -- unable to tell a fake pass from a right-guest-wrong-day pass.
  SELECT * INTO v_inv FROM guest_invitations WHERE id = p_guest_invitation_id;

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
      request_id, guest_invitation_id, event_id, checked_in_by, checked_in_door, source
    ) VALUES (
      p_request_id, v_inv.id, v_inv.event_id, p_checked_in_by, p_checked_in_door,
      COALESCE(p_source, 'api')
    )
    ON CONFLICT (request_id) DO NOTHING;

    GET DIAGNOSTICS v_claim_rows = ROW_COUNT;

    IF v_claim_rows = 0 THEN
      SELECT * INTO v_prior FROM checkin_scan_events WHERE request_id = p_request_id;

      -- A replay is only a replay for the guest it was claimed against.
      -- Re-presenting an id under a different invitation or event would
      -- otherwise return that other guest's "admitted" and wave this one
      -- through on someone else's admission.
      IF v_prior.guest_invitation_id <> p_guest_invitation_id
         OR v_prior.event_id <> p_event_id THEN
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

  IF FOUND THEN
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

COMMENT ON FUNCTION checkin_admit_guest(UUID, UUID, INT, TEXT, TEXT, UUID, TEXT) IS
  'Atomically admits up to the remaining entry_allowance for one guest_invitation. Idempotent per p_request_id, which is bound to the invitation it was claimed against. Service-role only.';

-- SECURITY DEFINER without this is an open door: Postgres grants EXECUTE to
-- PUBLIC by default and PostgREST exposes every public-schema function as an
-- RPC, so anyone holding the anon key could admit guests. Same lockdown the
-- old checkin_guest_invitation() needed in 20260722000003.
REVOKE ALL ON FUNCTION checkin_admit_guest(UUID, UUID, INT, TEXT, TEXT, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION checkin_admit_guest(UUID, UUID, INT, TEXT, TEXT, UUID, TEXT)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 5) Authorised amendment / reversal
-- ---------------------------------------------------------------------------
--
-- The one path allowed to lower checked_in_count. Replaces the amend route's
-- direct UPDATE, which wrote checked_in_party_size on its own and would now
-- leave two disagreeing headcounts in the same row.
--
-- A correction is a TOTAL, not a delta: "3 of 4 actually arrived" sets the
-- count to 3 regardless of what it was. 0 is a full reversal and clears the
-- first-entry metadata, so the "timestamped iff admitted" invariant that the
-- couple's dashboard relies on still holds.

DROP FUNCTION IF EXISTS amend_guest_invitation_checkin(UUID, UUID, INT, TEXT, TEXT, UUID);

CREATE FUNCTION amend_guest_invitation_checkin(
  p_guest_invitation_id UUID,
  p_event_id UUID,
  p_new_count INT,
  p_reason TEXT,
  p_amended_by TEXT DEFAULT NULL,
  p_request_id UUID DEFAULT NULL
) RETURNS TABLE (
  result TEXT,
  is_replay BOOLEAN,
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
  v_updated    guest_invitations;
  v_prior      checkin_scan_events;
  v_claim_rows INT := 0;
  v_delta      INT;
BEGIN
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'amend_guest_invitation_checkin requires p_event_id';
  END IF;
  -- A hand-corrected headcount with no stated reason is exactly the entry a
  -- later dispute cannot resolve.
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'amend_guest_invitation_checkin requires a reason';
  END IF;

  SELECT * INTO v_inv FROM guest_invitations WHERE id = p_guest_invitation_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, FALSE, 0, 0, NULL::TIMESTAMPTZ, 0;
    RETURN;
  END IF;

  IF v_inv.event_id <> p_event_id THEN
    RETURN QUERY SELECT 'wrong_event'::TEXT, FALSE, v_inv.checked_in_count, v_inv.entry_allowance,
                        v_inv.checked_in_at, COALESCE(v_inv.party_size, 1);
    RETURN;
  END IF;

  IF p_new_count IS NULL OR p_new_count < 0 OR p_new_count > v_inv.entry_allowance THEN
    RETURN QUERY SELECT 'invalid_count'::TEXT, FALSE, v_inv.checked_in_count, v_inv.entry_allowance,
                        v_inv.checked_in_at, COALESCE(v_inv.party_size, 1);
    RETURN;
  END IF;

  IF v_inv.checked_in_count = 0 THEN
    RETURN QUERY SELECT 'not_checked_in'::TEXT, FALSE, v_inv.checked_in_count, v_inv.entry_allowance,
                        v_inv.checked_in_at, COALESCE(v_inv.party_size, 1);
    RETURN;
  END IF;

  IF p_request_id IS NOT NULL THEN
    INSERT INTO checkin_scan_events (
      request_id, guest_invitation_id, event_id, checked_in_by, source, reason
    ) VALUES (
      p_request_id, v_inv.id, v_inv.event_id, p_amended_by, 'amend', p_reason
    )
    ON CONFLICT (request_id) DO NOTHING;

    GET DIAGNOSTICS v_claim_rows = ROW_COUNT;

    IF v_claim_rows = 0 THEN
      SELECT * INTO v_prior FROM checkin_scan_events WHERE request_id = p_request_id;
      IF v_prior.guest_invitation_id <> p_guest_invitation_id
         OR v_prior.event_id <> p_event_id THEN
        RETURN QUERY SELECT 'request_conflict'::TEXT, FALSE,
                            v_inv.checked_in_count, v_inv.entry_allowance,
                            v_inv.checked_in_at, COALESCE(v_inv.party_size, 1);
        RETURN;
      END IF;
      RETURN QUERY SELECT COALESCE(v_prior.result, 'in_progress'), TRUE,
                          COALESCE(v_prior.total_after, v_inv.checked_in_count),
                          COALESCE(v_prior.allowance_after, v_inv.entry_allowance),
                          v_inv.checked_in_at, COALESCE(v_inv.party_size, 1);
      RETURN;
    END IF;
  END IF;

  -- Marks this transaction as the authorised lowering path for the trigger.
  -- Transaction-local (third argument TRUE), so it cannot leak into a later
  -- statement on a pooled connection.
  PERFORM set_config('opuspass.checkin_amend', 'on', TRUE);

  UPDATE guest_invitations gi
  SET checked_in_count = p_new_count,
      checked_in_party_size = NULLIF(p_new_count, 0),
      -- A full reversal takes the pass back to "never arrived", so the
      -- first-entry metadata goes with it. Anything else leaves the original
      -- arrival intact.
      checked_in_at = CASE WHEN p_new_count = 0 THEN NULL ELSE gi.checked_in_at END,
      checked_in_by = CASE WHEN p_new_count = 0 THEN NULL ELSE gi.checked_in_by END,
      checked_in_door = CASE WHEN p_new_count = 0 THEN NULL ELSE gi.checked_in_door END
  WHERE gi.id = p_guest_invitation_id
    AND gi.event_id = p_event_id
    AND p_new_count <= gi.entry_allowance
  RETURNING * INTO v_updated;

  PERFORM set_config('opuspass.checkin_amend', 'off', TRUE);

  IF NOT FOUND THEN
    -- The allowance moved under us between the read and the write.
    SELECT * INTO v_inv FROM guest_invitations WHERE id = p_guest_invitation_id;
    IF p_request_id IS NOT NULL THEN
      UPDATE checkin_scan_events
      SET result = 'invalid_count', total_after = v_inv.checked_in_count,
          allowance_after = v_inv.entry_allowance, completed_at = clock_timestamp()
      WHERE request_id = p_request_id;
    END IF;
    RETURN QUERY SELECT 'invalid_count'::TEXT, FALSE, v_inv.checked_in_count, v_inv.entry_allowance,
                        v_inv.checked_in_at, COALESCE(v_inv.party_size, 1);
    RETURN;
  END IF;

  v_delta := v_updated.checked_in_count - v_inv.checked_in_count;

  IF p_request_id IS NOT NULL THEN
    UPDATE checkin_scan_events
    SET result = 'amended', admitted_count = v_delta,
        total_after = v_updated.checked_in_count,
        allowance_after = v_updated.entry_allowance,
        completed_at = clock_timestamp()
    WHERE request_id = p_request_id;
  END IF;

  RETURN QUERY SELECT 'amended'::TEXT, FALSE, v_updated.checked_in_count, v_updated.entry_allowance,
                      v_updated.checked_in_at, COALESCE(v_updated.party_size, 1);
END;
$$;

COMMENT ON FUNCTION amend_guest_invitation_checkin(UUID, UUID, INT, TEXT, TEXT, UUID) IS
  'The only authorised path to lower checked_in_count. Sets a total (0 = full reversal), requires a reason, writes an audit row. Service-role only.';

REVOKE ALL ON FUNCTION amend_guest_invitation_checkin(UUID, UUID, INT, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION amend_guest_invitation_checkin(UUID, UUID, INT, TEXT, TEXT, UUID)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 6) Deprecated compatibility wrapper — TEMPORARY EXCEPTION, NOT A SUPPORTED API
-- ---------------------------------------------------------------------------
--
-- apps/opus_scanner (the superseded web PWA) still calls the old signature.
-- It is not deployed, but dropping the function outright would also break any
-- ad-hoc tooling, so the old name keeps working with its old contract:
-- returns the row on success, an all-NULL row when the guest is already in.
--
-- It is strictly weaker than checkin_admit_guest:
--   - cannot verify event context (the old signature carries no event id)
--   - has no caller-supplied idempotency key, so retries are NOT replayed
--   - preserves the older, looser authorisation semantics
--
-- Two deliberate safety reductions relative to the old behaviour:
--   1. It admits EXACTLY ONE person per call and ignores p_checked_in_party_size.
--      It never infers the remaining allowance, so a legacy client cannot
--      move the counter by more than 1. This is a behaviour change: the old
--      function admitted the whole party in one call.
--   2. It mints its own request id so every legacy call still lands in the
--      audit ledger tagged source = 'legacy_rpc_wrapper'.
--
-- REMOVAL CONDITION: drop this function once apps/opus_scanner is retired or
-- migrated AND no rows with source = 'legacy_rpc_wrapper' have been written
-- for an agreed observation period. Check with:
--   SELECT max(created_at), count(*) FROM checkin_scan_events
--    WHERE source = 'legacy_rpc_wrapper';

CREATE OR REPLACE FUNCTION checkin_guest_invitation(
  p_guest_invitation_id UUID,
  p_checked_in_by TEXT,
  p_checked_in_door TEXT,
  p_checked_in_party_size INT DEFAULT NULL
) RETURNS guest_invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
  v_result   TEXT;
  v_row      guest_invitations;
BEGIN
  SELECT event_id INTO v_event_id FROM guest_invitations WHERE id = p_guest_invitation_id;
  IF v_event_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT result INTO v_result
  FROM checkin_admit_guest(
    p_guest_invitation_id,
    v_event_id,
    1,                    -- never p_checked_in_party_size; see note above
    p_checked_in_by,
    p_checked_in_door,
    gen_random_uuid(),    -- audit attribution only; grants no replay protection
    'legacy_rpc_wrapper'
  );

  IF v_result <> 'admitted' THEN
    RETURN NULL; -- old contract: NULL row means "already checked in"
  END IF;

  SELECT * INTO v_row FROM guest_invitations WHERE id = p_guest_invitation_id;
  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION checkin_guest_invitation(UUID, TEXT, TEXT, INT) IS
  'DEPRECATED: compatibility wrapper for apps/opus_scanner only; remove after client retirement. Admits exactly 1, no event scoping, no idempotency. Calls are tagged source=legacy_rpc_wrapper in checkin_scan_events.';

REVOKE ALL ON FUNCTION checkin_guest_invitation(UUID, TEXT, TEXT, INT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION checkin_guest_invitation(UUID, TEXT, TEXT, INT)
  TO service_role;
