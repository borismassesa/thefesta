-- Check-in reporting, step 3: event lifecycle + immutable report snapshots
-- (docs/CHECKIN_REPORT_TEMPLATES_SPEC.md sections 3, 7.2, 7.3)
--
-- Two problems, one migration.
--
-- 1) There is no lifecycle at all. wedding_events has starts_at and ends_at
--    and nothing that says the door has shut. The client report therefore had
--    no gate: the same download served the night before the wedding and the
--    morning after, which is how a keepsake ended up wrapped around a 3%
--    turnout figure taken twelve hours before anyone arrived.
--
--    Closing the gate and issuing the permanent record are SEPARATE moments.
--    Doors may shut at midnight while the coordinator fixes two mistakes the
--    next morning. One timestamp for both would mean reopening a whole event
--    to correct a table number.
--
--      LIVE  --close check-in-->  CLOSED  --finalize report-->  FINAL
--        ^                          ^ |                           |
--        +---- reopen gate ---------+ +---- reopen report --------+
--                                        (supersedes immediately)
--
-- 2) "Frozen" cannot mean "the live tables happen to still produce the same
--    answer". Invitations get edited, seats reassigned, RSVPs corrected, and
--    Meta keeps posting delivery receipts for days. Any of those silently
--    changes a report regenerated a year later. So finalization PERSISTS the
--    canonical model, and the client report renders from that copy forever.
--
-- The immutable artifact is the model, not the PDF. The document can be
-- re-rendered whenever fonts or layout improve; the numbers cannot move
-- because they are never re-derived.

-- ---------------------------------------------------------------------------
-- 1) Lifecycle columns
-- ---------------------------------------------------------------------------

ALTER TABLE wedding_events
  ADD COLUMN IF NOT EXISTS checkin_closed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checkin_closed_by   UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS checkin_reopened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS report_finalized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS report_finalized_by UUID REFERENCES users(id);

-- A report cannot be final while the door is still open. Enforced here rather
-- than in the RPCs alone, so no future writer can invent a fourth state.
ALTER TABLE wedding_events
  DROP CONSTRAINT IF EXISTS wedding_events_finalized_requires_closed;
ALTER TABLE wedding_events
  ADD CONSTRAINT wedding_events_finalized_requires_closed
  CHECK (report_finalized_at IS NULL OR checkin_closed_at IS NOT NULL);

COMMENT ON COLUMN wedding_events.checkin_closed_at IS
  'Entry operations ended. Corrections are still possible and no client report exists yet.';
COMMENT ON COLUMN wedding_events.report_finalized_at IS
  'A snapshot has been written and the client report is available and immutable. Never set without checkin_closed_at.';

-- ---------------------------------------------------------------------------
-- 2) Immutable snapshots
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS checkin_report_snapshots (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id               UUID NOT NULL REFERENCES wedding_events(id) ON DELETE CASCADE,
  report_type            TEXT NOT NULL DEFAULT 'client_final',
  version                INT  NOT NULL,
  -- CHECKIN_REPORT_MODEL_VERSION at write time. Renderers dispatch on this and
  -- refuse a version they do not know, so a year-old snapshot is never
  -- silently reinterpreted under changed semantics.
  model_version          INT  NOT NULL,
  model_json             JSONB NOT NULL,
  finalized_at           TIMESTAMPTZ NOT NULL,
  finalized_by           UUID REFERENCES users(id),
  supersedes_snapshot_id UUID REFERENCES checkin_report_snapshots(id),
  superseded_at          TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT checkin_report_snapshots_version_positive CHECK (version >= 1),
  CONSTRAINT checkin_report_snapshots_type_check
    CHECK (report_type IN ('client_final'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_report_snapshots_event_version
  ON checkin_report_snapshots(event_id, report_type, version);

-- At most one ACTIVE snapshot per event and type. This is what makes
-- "clientReportAvailable = finalized AND active snapshot exists" a fact the
-- database guarantees rather than an invariant the application hopes for. It
-- also settles the race between two concurrent finalizations: the loser's
-- INSERT fails rather than producing a second current record.
CREATE UNIQUE INDEX IF NOT EXISTS idx_report_snapshots_current
  ON checkin_report_snapshots(event_id, report_type)
  WHERE superseded_at IS NULL;

COMMENT ON TABLE checkin_report_snapshots IS
  'Append-only. The immutable canonical model behind a finalized client report. Superseded rows are retained as audit history, never deleted.';

-- Append-only, enforced. RLS is not enough on its own: the dashboard writes
-- with the service-role key, which bypasses policies entirely. Only
-- superseded_at may ever change, and only from NULL to a value — un-superseding
-- a snapshot would resurrect a stale report as the current one.
CREATE OR REPLACE FUNCTION checkin_report_snapshots_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'checkin_report_snapshots is append-only: snapshot % cannot be deleted', OLD.id;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.event_id IS DISTINCT FROM OLD.event_id
     OR NEW.report_type IS DISTINCT FROM OLD.report_type
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.model_version IS DISTINCT FROM OLD.model_version
     OR NEW.model_json IS DISTINCT FROM OLD.model_json
     OR NEW.finalized_at IS DISTINCT FROM OLD.finalized_at
     OR NEW.finalized_by IS DISTINCT FROM OLD.finalized_by
     OR NEW.supersedes_snapshot_id IS DISTINCT FROM OLD.supersedes_snapshot_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'checkin_report_snapshots is append-only: only superseded_at may change';
  END IF;

  IF OLD.superseded_at IS NOT NULL AND NEW.superseded_at IS DISTINCT FROM OLD.superseded_at THEN
    RAISE EXCEPTION 'snapshot % is already superseded', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_checkin_report_snapshots_append_only ON checkin_report_snapshots;
CREATE TRIGGER trg_checkin_report_snapshots_append_only
  BEFORE UPDATE OR DELETE ON checkin_report_snapshots
  FOR EACH ROW EXECUTE FUNCTION checkin_report_snapshots_append_only();

ALTER TABLE checkin_report_snapshots ENABLE ROW LEVEL SECURITY;

-- Owners may read their own report history. Writes go exclusively through the
-- SECURITY DEFINER functions below, so there is deliberately no INSERT policy.
DROP POLICY IF EXISTS checkin_report_snapshots_owner_read ON checkin_report_snapshots;
CREATE POLICY checkin_report_snapshots_owner_read ON checkin_report_snapshots
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM wedding_events e
      WHERE e.id = checkin_report_snapshots.event_id
        AND e.user_id = requesting_user_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 3) Lifecycle transitions
-- ---------------------------------------------------------------------------
--
-- Every transition is a function rather than an UPDATE from the app, so the
-- legal state machine lives in one place and cannot be half-applied. All are
-- SECURITY DEFINER and service-role only; the API routes authorise the actor
-- before calling.

-- LIVE -> CLOSED. Idempotent: closing an already-closed event is not an error,
-- because a coordinator tapping twice on a bad connection should not see one.
CREATE OR REPLACE FUNCTION checkin_close_event(
  p_event_id UUID,
  p_actor UUID DEFAULT NULL
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closed_at TIMESTAMPTZ;
BEGIN
  UPDATE wedding_events
  SET checkin_closed_at = COALESCE(checkin_closed_at, now()),
      checkin_closed_by = COALESCE(checkin_closed_by, p_actor)
  WHERE id = p_event_id
  RETURNING checkin_closed_at INTO v_closed_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'event % not found', p_event_id;
  END IF;

  RETURN v_closed_at;
END;
$$;

-- CLOSED -> LIVE. Reopening the GATE, which is not the same as reopening the
-- report: refused once a report is final, because that would leave a frozen
-- record describing an event still admitting guests.
CREATE OR REPLACE FUNCTION checkin_reopen_event(
  p_event_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_finalized TIMESTAMPTZ;
BEGIN
  SELECT report_finalized_at INTO v_finalized FROM wedding_events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'event % not found', p_event_id;
  END IF;
  IF v_finalized IS NOT NULL THEN
    RAISE EXCEPTION 'event % has a final report; reopen the report before reopening the gate', p_event_id;
  END IF;

  UPDATE wedding_events
  SET checkin_closed_at = NULL,
      checkin_closed_by = NULL,
      checkin_reopened_at = now()
  WHERE id = p_event_id;
END;
$$;

-- CLOSED -> FINAL, atomically.
--
-- The snapshot id and version are chosen by the CALLER and passed in, because
-- the model embeds its own identity: a rendered report must never have to join
-- mutable event state to discover which version of reality it represents. That
-- also keeps this table append-only, with no post-insert patch to write the id
-- back.
--
-- Either both the snapshot row and report_finalized_at exist, or neither does.
CREATE OR REPLACE FUNCTION checkin_finalize_report(
  p_event_id UUID,
  p_snapshot_id UUID,
  p_version INT,
  p_model_version INT,
  p_model_json JSONB,
  p_actor UUID DEFAULT NULL
) RETURNS checkin_report_snapshots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event  wedding_events;
  v_prior  UUID;
  v_row    checkin_report_snapshots;
  v_now    TIMESTAMPTZ := now();
BEGIN
  -- Locked for the same reason the admission RPC locks: two coordinators
  -- finalizing at once must not both compute "version 2".
  SELECT * INTO v_event FROM wedding_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'event % not found', p_event_id;
  END IF;

  IF v_event.checkin_closed_at IS NULL THEN
    RAISE EXCEPTION 'event % is not closed; close check-in before finalizing', p_event_id;
  END IF;

  IF v_event.report_finalized_at IS NOT NULL THEN
    RAISE EXCEPTION 'event % is already final; reopen the report before finalizing again', p_event_id;
  END IF;

  SELECT id INTO v_prior
  FROM checkin_report_snapshots
  WHERE event_id = p_event_id AND report_type = 'client_final'
  ORDER BY version DESC
  LIMIT 1;

  INSERT INTO checkin_report_snapshots (
    id, event_id, report_type, version, model_version, model_json,
    finalized_at, finalized_by, supersedes_snapshot_id
  ) VALUES (
    p_snapshot_id, p_event_id, 'client_final', p_version, p_model_version, p_model_json,
    v_now, p_actor, v_prior
  )
  RETURNING * INTO v_row;

  UPDATE wedding_events
  SET report_finalized_at = v_now,
      report_finalized_by = p_actor
  WHERE id = p_event_id;

  RETURN v_row;
END;
$$;

-- FINAL -> CLOSED.
--
-- The active snapshot is superseded HERE, at reopen, not at the next
-- finalization. A PDF must not go on presenting itself as the current record
-- while corrections are being made, so the window between reopening and
-- re-finalizing has no client report at all.
CREATE OR REPLACE FUNCTION checkin_reopen_report(
  p_event_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_finalized TIMESTAMPTZ;
BEGIN
  SELECT report_finalized_at INTO v_finalized FROM wedding_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'event % not found', p_event_id;
  END IF;
  IF v_finalized IS NULL THEN
    RAISE EXCEPTION 'event % has no final report to reopen', p_event_id;
  END IF;

  UPDATE checkin_report_snapshots
  SET superseded_at = now()
  WHERE event_id = p_event_id
    AND report_type = 'client_final'
    AND superseded_at IS NULL;

  UPDATE wedding_events
  SET report_finalized_at = NULL,
      report_finalized_by = NULL
  WHERE id = p_event_id;
END;
$$;

-- SECURITY DEFINER without this is an open door: Postgres grants EXECUTE to
-- PUBLIC by default and PostgREST exposes every public-schema function as an
-- RPC, so anyone holding the anon key could finalize or reopen a report.
REVOKE ALL ON FUNCTION checkin_close_event(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION checkin_close_event(UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION checkin_reopen_event(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION checkin_reopen_event(UUID) TO service_role;

REVOKE ALL ON FUNCTION checkin_finalize_report(UUID, UUID, INT, INT, JSONB, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION checkin_finalize_report(UUID, UUID, INT, INT, JSONB, UUID)
  TO service_role;

REVOKE ALL ON FUNCTION checkin_reopen_report(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION checkin_reopen_report(UUID) TO service_role;
