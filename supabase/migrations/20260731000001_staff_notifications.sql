-- Staff notification subsystem — event log, per-recipient notifications and
-- delivery preferences.
--
-- WHY THIS EXISTS
-- Modules currently send their own email inline. The Approvals module calls
-- Resend directly from a server action, which means: no record that a
-- notification was owed, no user preference, no retry, no dedupe, and a send
-- failure after the state transition has already committed loses the message
-- silently. Every module that grows notifications repeats that.
--
-- The model here is publish-then-fan-out. A module records what *happened*
-- (workflow_events) and the notification layer decides who hears about it,
-- through which channel (staff_notifications), subject to what each person
-- asked for (staff_notification_preferences).
--
-- NAMING: `workflow_events`, not `approval_events`. The table carries an
-- `entity_type` precisely so leave, payroll, recruitment and procurement can
-- publish to it without a second events table. Naming it after the first
-- caller would have guaranteed that second table.
--
-- AUDIENCE: staff only. A `notifications` table already exists (see
-- 20260613000003) but its `user_id` references `public.users`, which is
-- couples, and its type CHECK is OpusPass-specific. Staff live in
-- `workforce_employees`. Widening the couple table would put OpusPass RLS at
-- risk for no gain, so these are separate. Column names are chosen so a
-- couple-facing inbox could migrate onto this shape later if that's ever
-- actually wanted.

-- ---------------------------------------------------------------------------
-- workflow_events — append-only record of things that happened
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflow_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- What kind of thing this happened to. 'approval_request' today.
  -- Intentionally free text: a new module should not need a migration to
  -- start publishing.
  entity_type text NOT NULL CHECK (length(btrim(entity_type)) > 0),
  entity_id uuid NOT NULL,
  -- Past-tense verb, namespaced by module: 'approval.submitted',
  -- 'approval.approved', 'approval.refused', 'approval.info_requested'.
  event_type text NOT NULL CHECK (length(btrim(event_type)) > 0),
  -- Who caused it. Nullable because some events are system-generated
  -- (reminders, escalations) and have no human actor.
  actor_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  -- Denormalised so the feed still reads correctly after an employee row is
  -- removed. An audit trail that loses its subject is not an audit trail.
  actor_name text NOT NULL DEFAULT 'System',
  -- Event-shaped payload (amounts, notes, previous status…). Consumers must
  -- treat unknown keys as optional.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_events_entity
  ON workflow_events (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_events_created
  ON workflow_events (created_at DESC);

-- ---------------------------------------------------------------------------
-- staff_notifications — one row per recipient per channel
-- ---------------------------------------------------------------------------
-- Deliberately one row per channel rather than one row with channel flags:
-- the bell and the email have independent lifecycles. An email can hard-bounce
-- while the bell entry is read and archived normally, and each needs its own
-- status without the two overwriting each other.
CREATE TABLE IF NOT EXISTS staff_notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id uuid NOT NULL REFERENCES workforce_employees(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES workflow_events(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('bell', 'email')),
  category text NOT NULL CHECK (category IN ('approvals', 'requests', 'mentions', 'system')),
  priority text NOT NULL CHECK (priority IN ('critical', 'high', 'normal', 'info')),
  title text NOT NULL,
  body text,
  -- In-app deep link, e.g. /approvals?tab=pending.
  href text,
  -- Lifecycle. Notifications are never deleted — 'dismissed' and 'archived'
  -- are terminal states, so "did we tell them?" stays answerable during an
  -- audit long after the person has cleared their bell.
  status text NOT NULL DEFAULT 'unread'
    CHECK (status IN ('unread', 'read', 'archived', 'dismissed')),
  read_at timestamptz,
  archived_at timestamptz,
  dismissed_at timestamptz,
  -- Was a recorded "do not send" overridden? Persisted so "why did I get
  -- this?" is answerable from the row rather than from someone's memory of
  -- the bypass rules. See lib/notifications/preferences.ts.
  preference_bypassed boolean NOT NULL DEFAULT false,
  bypass_reason text,

  -- ---- Email delivery state ----
  -- A unique index stops duplicate *rows*, but it does nothing to stop two
  -- workers picking up the same pending row and sending it twice. Delivery
  -- therefore has its own explicit state machine:
  --
  --   pending -> sending -> sent
  --                     \-> failed -> (retry) pending
  --                                \-> abandoned  (attempts exhausted)
  --
  -- A worker must move a row pending -> sending atomically before it sends;
  -- claim_notification_emails() below does that with FOR UPDATE SKIP LOCKED,
  -- so only the worker that wins the claim ever calls the mail provider.
  -- Bell rows are born 'sent' — there is nothing to deliver.
  delivery_status text NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sending', 'sent', 'failed', 'abandoned')),
  attempt_count integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  -- When a retry becomes eligible. Lets a worker back off without a separate
  -- scheduling table.
  next_attempt_at timestamptz,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Bell entries have no delivery to track; keeping them out of 'pending'
  -- means the claim query never has to filter them out by channel.
  CONSTRAINT staff_notifications_bell_delivery
    CHECK (channel <> 'bell' OR delivery_status = 'sent')
);

-- The bell reads "my unread, newest first" on every page load, so that path
-- gets a partial index rather than a filter over the whole table.
CREATE INDEX IF NOT EXISTS idx_staff_notifications_recipient
  ON staff_notifications (employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_notifications_unread
  ON staff_notifications (employee_id, created_at DESC)
  WHERE channel = 'bell' AND status = 'unread';
-- Drives the retry worker's claim query.
CREATE INDEX IF NOT EXISTS idx_staff_notifications_deliverable
  ON staff_notifications (next_attempt_at NULLS FIRST, created_at)
  WHERE channel = 'email' AND delivery_status IN ('pending', 'failed');
-- One notification per person per channel per event. Makes the emitter
-- idempotent: a retried server action cannot double-notify.
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_notifications_event_recipient
  ON staff_notifications (event_id, employee_id, channel);

-- ---------------------------------------------------------------------------
-- staff_notification_preferences
-- ---------------------------------------------------------------------------
-- ABSENT ROW MEANS ENABLED. Nobody is opted in by a migration; the resolver
-- treats "no preference recorded" as "send it". The alternative — default off
-- until a row exists — would mean the first approval request after this ships
-- reaches nobody, which is a silent failure of the exact kind this table is
-- meant to prevent.
--
-- Critical-priority bell entries ignore preferences entirely (enforced in the
-- emitter, not here): an approval that blocks payroll is not something an
-- individual gets to mute for everyone waiting on them.
CREATE TABLE IF NOT EXISTS staff_notification_preferences (
  employee_id uuid NOT NULL REFERENCES workforce_employees(id) ON DELETE CASCADE,
  -- Matches workflow_events.event_type, or '*' for a blanket default.
  event_type text NOT NULL,
  bell_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT true,
  -- 'immediate' sends on the event. The digest values are accepted now so the
  -- preference UI has a stable contract, but no scheduler consumes them yet —
  -- see the module README before promising a user that 'daily' works.
  digest_frequency text NOT NULL DEFAULT 'immediate'
    CHECK (digest_frequency IN ('immediate', 'daily', 'weekly', 'off')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, event_type)
);

DROP TRIGGER IF EXISTS trg_staff_notification_preferences_updated_at
  ON staff_notification_preferences;
CREATE TRIGGER trg_staff_notification_preferences_updated_at
  BEFORE UPDATE ON staff_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- claim_notification_emails — atomic pending -> sending transition
-- ---------------------------------------------------------------------------
-- The exactly-once-in-practice guarantee. Without this, two workers can both
-- SELECT the same pending row and both send it: the unique index prevents a
-- duplicate row, not a duplicate send.
--
-- FOR UPDATE SKIP LOCKED means a second concurrent caller silently skips rows
-- the first has locked rather than blocking on them, so N workers partition
-- the queue between themselves with no coordination.
--
-- `max_attempts` caps retries; a row that exhausts them becomes 'abandoned'
-- and stops being claimed, so a permanently bad address cannot be retried
-- forever. It is still readable — the obligation is on record even though
-- delivery gave up.
CREATE OR REPLACE FUNCTION public.claim_notification_emails(
  p_limit integer DEFAULT 20,
  p_max_attempts integer DEFAULT 5
)
RETURNS SETOF staff_notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT sn.id
    FROM staff_notifications sn
    WHERE sn.channel = 'email'
      AND sn.delivery_status IN ('pending', 'failed')
      AND sn.attempt_count < p_max_attempts
      AND (sn.next_attempt_at IS NULL OR sn.next_attempt_at <= now())
    ORDER BY sn.created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE staff_notifications sn
  SET delivery_status = 'sending',
      attempt_count = sn.attempt_count + 1,
      last_attempt_at = now()
  FROM claimed
  WHERE sn.id = claimed.id
  RETURNING sn.*;
END;
$$;

-- Postgres grants EXECUTE to PUBLIC by default, and PostgREST would then
-- expose this as an unauthenticated RPC that mutates delivery state. Revoke
-- first, then grant only to the service role.
REVOKE ALL ON FUNCTION public.claim_notification_emails(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_notification_emails(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.claim_notification_emails(integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_emails(integer, integer) TO service_role;

COMMENT ON FUNCTION public.claim_notification_emails(integer, integer) IS
  'Atomically claims deliverable email notifications (pending/failed -> sending) using FOR UPDATE SKIP LOCKED. Service-role only. Prevents two workers sending the same message.';

-- ---------------------------------------------------------------------------
-- RLS — read your own, write nothing. All inserts go through the service role.
-- ---------------------------------------------------------------------------
ALTER TABLE workflow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_notification_preferences ENABLE ROW LEVEL SECURITY;

-- SERVICE ROLE ONLY. No policy of any kind, so with RLS enabled PostgREST
-- denies every authenticated role for both read and write.
--
-- An earlier version of this file allowed any is_workforce_reader() to SELECT.
-- That was written when the table was expected to hold only status
-- transitions. It also holds `metadata.email_payload` — the persisted render
-- payload the retry worker needs, containing the approval subject, submitter
-- and actor addresses, and the approver's free-text decision note. A broad
-- read policy therefore made the Approvals participant-scoping rule
-- bypassable: someone who could not open a request could still read its
-- subject and refusal reason out of the event log.
--
-- The only reader in the codebase is emitWorkflowEvent(), which uses the
-- service-role client. Do not add a read policy back without first moving that
-- payload somewhere scoped.
DROP POLICY IF EXISTS workflow_events_read ON workflow_events;

DROP POLICY IF EXISTS staff_notifications_read_own ON staff_notifications;
CREATE POLICY staff_notifications_read_own ON staff_notifications
  FOR SELECT TO authenticated
  USING (
    employee_id IN (
      SELECT id FROM workforce_employees WHERE clerk_user_id = (auth.jwt() ->> 'sub')
    )
  );

-- Marking your own notification read/archived is the one mutation a signed-in
-- user may perform, and it may not reassign the row to someone else.
DROP POLICY IF EXISTS staff_notifications_update_own ON staff_notifications;
CREATE POLICY staff_notifications_update_own ON staff_notifications
  FOR UPDATE TO authenticated
  USING (
    employee_id IN (
      SELECT id FROM workforce_employees WHERE clerk_user_id = (auth.jwt() ->> 'sub')
    )
  )
  WITH CHECK (
    employee_id IN (
      SELECT id FROM workforce_employees WHERE clerk_user_id = (auth.jwt() ->> 'sub')
    )
  );

DROP POLICY IF EXISTS staff_notification_preferences_own ON staff_notification_preferences;
CREATE POLICY staff_notification_preferences_own ON staff_notification_preferences
  FOR ALL TO authenticated
  USING (
    employee_id IN (
      SELECT id FROM workforce_employees WHERE clerk_user_id = (auth.jwt() ->> 'sub')
    )
  )
  WITH CHECK (
    employee_id IN (
      SELECT id FROM workforce_employees WHERE clerk_user_id = (auth.jwt() ->> 'sub')
    )
  );

COMMENT ON TABLE workflow_events IS
  'Append-only domain events published by any module. SERVICE ROLE ONLY — RLS enabled with no policies, because metadata carries the persisted email payload (subject, addresses, decision note) needed for retry.';
COMMENT ON TABLE staff_notifications IS
  'One row per recipient per channel per event. Never deleted — archived/dismissed are terminal states so delivery stays auditable.';
COMMENT ON TABLE staff_notification_preferences IS
  'Per-employee, per-event delivery preferences. An ABSENT ROW MEANS ENABLED; critical-priority bell entries bypass preferences entirely.';

NOTIFY pgrst, 'reload schema';
