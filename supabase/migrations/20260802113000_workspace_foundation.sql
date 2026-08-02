-- Workspace foundation — employee identity, access state, preferences and the
-- workspace activity stream.
--
-- Workspace is the employee self-service area of opus_admin (/workspace/*). It
-- is the "my work" module: every row it shows or writes belongs to the
-- authenticated employee. No Workspace surface accepts an employee_id from the
-- browser — identity is resolved server-side from the Clerk session, and this
-- migration supplies the columns and tables that resolution depends on.
--
-- Table mapping. The goal's recommended core-table list is satisfied by the
-- schema this codebase already has, plus the two tables added here:
--
--   employees                      -> workforce_employees (existing)
--   employee_user_links            -> workforce_employees.clerk_user_id
--                                     (UNIQUE, one Clerk account per employee)
--                                     plus the 'workspace.identity.linked'
--                                     event written to workspace_activity_events
--   employment_records             -> workforce_employee_records (existing)
--   employee_manager_relationships -> workforce_employees.manager_id (existing)
--   departments / positions /
--   work_locations                 -> workforce_employees.department /
--                                     .job_title / .location CHECK-constrained
--                                     columns (existing). Deliberately not
--                                     promoted to their own tables here: doing
--                                     so is an HR-module migration, not an
--                                     identity one, and would rewrite every
--                                     existing /workforce query.
--   teams                          -> not modelled yet. OpusFesta org structure
--                                     is department-level today.
--   workspace_preferences          -> added below
--   activity_events                -> workspace_activity_events (added below)
--   audit_events                   -> audit_log (existing, see lib/audit-log.ts)

-- ---------------------------------------------------------------------------
-- 1. Employee lifecycle states
-- ---------------------------------------------------------------------------
-- Workspace maps employment status to an access state. Two states the access
-- policy needs had no way to be recorded:
--
--   Suspended  — employment continues, access is withdrawn pending an outcome.
--   Terminated — employment ended involuntarily. Distinct from Resigned, which
--                keeps a documents-only window so a leaver can collect their
--                own payslips and letters.
--
-- Existing rows are untouched; the constraint only widens.
--
-- The old constraint is found by what it CONSTRAINS, not by a guessed name.
-- `workforce_employees_status_check` is what Postgres would have named the
-- inline column CHECK, but if it were ever named anything else, dropping by
-- name would silently no-op and the new constraint would sit alongside the old
-- one — leaving 'Suspended' still rejected, in a way nothing would surface
-- until someone tried to suspend an employee.
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'workforce_employees'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%Resigned%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.workforce_employees DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END
$$;

ALTER TABLE workforce_employees
  ADD CONSTRAINT workforce_employees_status_check
  CHECK (status IN (
    'Active', 'On Leave', 'Onboarding', 'Resigned', 'Suspended', 'Terminated'
  ));

COMMENT ON COLUMN workforce_employees.status IS
  'Employment lifecycle state. Drives the Workspace access state (see lib/workspace/access.ts): Active/On Leave/Onboarding -> full, Resigned -> documents_only, Suspended -> read_only, Terminated -> denied. Any value not in this list is treated as denied by the application.';

-- ---------------------------------------------------------------------------
-- 2. Email lookup for identity resolution
-- ---------------------------------------------------------------------------
-- Step 2 of Workspace identity resolution matches the authenticated email
-- against workforce_employees.email, case-insensitively. The existing UNIQUE
-- constraint is case-SENSITIVE, so 'A@opusfesta.com' and 'a@opusfesta.com' can
-- both exist and a case-insensitive lookup would match two rows. The resolver
-- treats that as ambiguous and refuses to guess, but the cheaper fix is to stop
-- it being representable.
--
-- The unique index is created only when the live data allows it. If duplicates
-- already exist we fall back to a plain index (the lookup still needs to be
-- indexed) and leave a NOTICE — resolving the duplicates is a People Ops
-- decision, not something a migration should make by deleting a row.
CREATE INDEX IF NOT EXISTS idx_workforce_employees_email_lower
  ON workforce_employees (lower(email));

DO $$
DECLARE
  duplicate_count integer;
BEGIN
  SELECT count(*) INTO duplicate_count
  FROM (
    SELECT lower(email)
    FROM workforce_employees
    GROUP BY lower(email)
    HAVING count(*) > 1
  ) dupes;

  IF duplicate_count = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_workforce_employees_email_lower
      ON workforce_employees (lower(email));
  ELSE
    RAISE NOTICE
      'workspace: % case-insensitive duplicate employee email(s) found; skipping unique index. Workspace identity resolution will refuse to resolve these accounts until People Ops merges them.',
      duplicate_count;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. workspace_preferences — per-employee Workspace settings
-- ---------------------------------------------------------------------------
-- One row per employee, created lazily on first write. Everything here is the
-- employee's own choice about their own Workspace; nothing in it grants access.
CREATE TABLE IF NOT EXISTS workspace_preferences (
  employee_id uuid PRIMARY KEY
    REFERENCES workforce_employees(id) ON DELETE CASCADE,
  -- IANA timezone used to render the employee's day (shift, tasks due today).
  -- Defaults to OpusFesta's operating timezone rather than NULL so every
  -- Workspace read has a timezone without a fallback branch.
  timezone text NOT NULL DEFAULT 'Africa/Dar_es_Salaam'
    CHECK (length(btrim(timezone)) > 0),
  locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'sw')),
  -- Home dashboard card order / hidden cards. Shape is owned by the client
  -- (see workspace/_lib/home-layout.ts); unknown keys must be ignored.
  home_layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Employee's own opt-out of the Workspace daily email digest. Channel-level
  -- notification preferences stay in staff_notification_preferences.
  digest_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE workspace_preferences IS
  'Per-employee Workspace settings (timezone, locale, home layout, digest opt-out). SERVICE ROLE ONLY — RLS enabled with no policies; the admin app writes it after resolving the employee from the Clerk session. Contains no access grants.';

-- ---------------------------------------------------------------------------
-- 4. workspace_activity_events — the employee-scoped activity stream
-- ---------------------------------------------------------------------------
-- Fulfils the `activity_events` role in the Workspace design. Named with the
-- workspace_ prefix because `activity_events` is too generic for a shared
-- public schema that already carries workflow_events (domain events published
-- for fan-out) and audit_log (security/authorization events).
--
-- The three are not interchangeable:
--   workflow_events           — "this happened to a record", fans out to staff
--                               notifications.
--   audit_log                 — "someone was allowed or denied something",
--                               read by /insights/audit.
--   workspace_activity_events — "this happened in one employee's Workspace",
--                               read back to that employee as their own feed.
--
-- Append-only: no UPDATE or DELETE path exists in the application, and the
-- trigger below enforces it at the database rather than by convention.
CREATE TABLE IF NOT EXISTS workspace_activity_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Whose Workspace this belongs to. Every read is filtered on this column.
  employee_id uuid NOT NULL
    REFERENCES workforce_employees(id) ON DELETE CASCADE,
  -- Dot-namespaced and caller-authored, e.g. 'workspace.identity.linked',
  -- 'workspace.timeclock.punched'. Free text so a new Workspace surface does
  -- not need a migration to start recording.
  event_type text NOT NULL CHECK (length(btrim(event_type)) > 0),
  -- Short human-readable line rendered in the feed.
  summary text NOT NULL CHECK (length(btrim(summary)) > 0),
  -- What it was about, as 'table:id'. Nullable — some events are not about a
  -- specific row (a sign-in, an identity link).
  target_resource text,
  -- Who caused it. Usually the same employee; differs when an admin acts on
  -- the employee's Workspace on their behalf.
  actor_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  actor_clerk_id text,
  -- Ids and enums only. This is read back to the employee, and it is not a
  -- place to park another person's data.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_activity_employee
  ON workspace_activity_events (employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_activity_type
  ON workspace_activity_events (event_type, created_at DESC);

COMMENT ON TABLE workspace_activity_events IS
  'Append-only per-employee Workspace activity feed. SERVICE ROLE ONLY — RLS enabled with no policies. Reads are always filtered by employee_id resolved from the Clerk session; the browser never supplies it.';

-- Append-only enforcement. Mirrors the approvals audit trigger: a log that can
-- be edited after the fact is not a log.
CREATE OR REPLACE FUNCTION public.workspace_activity_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'workspace_activity_events is append-only (attempted %)', TG_OP;
END
$$;

DROP TRIGGER IF EXISTS trg_workspace_activity_append_only
  ON workspace_activity_events;
CREATE TRIGGER trg_workspace_activity_append_only
  BEFORE UPDATE OR DELETE ON workspace_activity_events
  FOR EACH ROW EXECUTE FUNCTION public.workspace_activity_events_append_only();

-- ---------------------------------------------------------------------------
-- 5. Access control
-- ---------------------------------------------------------------------------
-- RLS on, no policies: PostgREST denies every authenticated role, the admin
-- app's service-role client bypasses RLS. Same posture as workflow_events.
-- Workspace authorization is enforced in server code, where the employee has
-- already been resolved from the session.
ALTER TABLE workspace_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_activity_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON workspace_preferences FROM anon, authenticated;
REVOKE ALL ON workspace_activity_events FROM anon, authenticated;
GRANT ALL ON TABLE workspace_preferences TO service_role;
GRANT ALL ON TABLE workspace_activity_events TO service_role;

-- The trigger function is not an API surface. Postgres grants EXECUTE to
-- PUBLIC by default and PostgREST would otherwise expose it as an RPC.
REVOKE ALL ON FUNCTION public.workspace_activity_events_append_only()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. updated_at maintenance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.workspace_preferences_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.workspace_preferences_touch_updated_at()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_workspace_preferences_updated_at
  ON workspace_preferences;
CREATE TRIGGER trg_workspace_preferences_updated_at
  BEFORE UPDATE ON workspace_preferences
  FOR EACH ROW EXECUTE FUNCTION public.workspace_preferences_touch_updated_at();

NOTIFY pgrst, 'reload schema';
