-- My Work — tasks, projects, calendar and meetings.
--
-- WHAT THIS REPLACES
--
-- workforce_tasks (20260525000002) is a GENERATED table: rows are instances
-- minted from a recurring assignment, keyed (assignment, employee, occurrence).
-- That is the right shape for "file your daily report" and the wrong shape for
-- everything else. It cannot express a task that belongs to a project, has a
-- dependency, has an estimate, or is owned by one person and done by another.
-- Its status set is ('Todo','In Progress','Done','Skipped') — no blocked, no
-- review, no cancelled.
--
-- workforce_tasks is NOT dropped: the tracker prefills from it and
-- /workforce/my-tasks reads it. The backfill copies its rows into `tasks`.
--
-- projects and project_members ALREADY EXIST, created deliberately thin by the
-- report engine (20260802160000) so project_select and project_manager had
-- something to point at. They are EXTENDED here rather than recreated.
--
-- THE ACCESS RULE
--
-- "Do not grant employees unrestricted access to all company projects." There
-- is no query in this module that lists tasks or projects without going through
-- task_is_visible_to() / project_is_visible_to(), which resolve visibility from
-- assignment, ownership, project membership, or an explicit admin permission
-- passed in by the caller. A task nobody connected you to is a task you cannot
-- name.

-- =============================================================================
-- projects — extended
-- =============================================================================
ALTER TABLE projects
  -- Private by default. A project nobody added you to should not be readable
  -- just because you can guess a uuid.
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'members'
    CHECK (visibility IN ('members', 'department', 'organisation')),
  ADD COLUMN IF NOT EXISTS health text NOT NULL DEFAULT 'on_track'
    CHECK (health IN ('on_track', 'at_risk', 'off_track', 'paused')),
  ADD COLUMN IF NOT EXISTS sponsor_employee_id uuid
    REFERENCES workforce_employees(id) ON DELETE SET NULL,
  -- Ties a project to a tracking unit so a project's tasks and its daily
  -- tracker entries are the same subject rather than two unrelated lists.
  ADD COLUMN IF NOT EXISTS tracking_unit_id uuid
    REFERENCES tracking_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- =============================================================================
-- project_milestones
-- =============================================================================
CREATE TABLE IF NOT EXISTS project_milestones (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'in_progress', 'met', 'missed', 'cancelled')),
  -- Snapshotted when the milestone is closed, so "we hit it late" survives a
  -- later edit to due_date.
  completed_on date,
  owner_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_milestones_project
  ON project_milestones (project_id, due_date);

-- =============================================================================
-- tasks
-- =============================================================================
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference text UNIQUE,

  title text NOT NULL CHECK (length(btrim(title)) > 0),
  description text NOT NULL DEFAULT '',

  -- OWNER is accountable, ASSIGNEE does the work. They are usually the same
  -- person and occasionally are not, and collapsing them loses the distinction
  -- exactly when it matters.
  owner_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  milestone_id uuid REFERENCES project_milestones(id) ON DELETE SET NULL,

  status text NOT NULL DEFAULT 'backlog' CHECK (status IN (
    'backlog', 'planned', 'in_progress', 'blocked', 'in_review', 'completed', 'cancelled'
  )),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('urgent', 'high', 'normal', 'low')),

  start_date date,
  due_date date,
  estimated_minutes integer CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0),
  -- Accumulated from work log entries rather than typed, so it cannot disagree
  -- with what was actually recorded.
  actual_minutes integer NOT NULL DEFAULT 0 CHECK (actual_minutes >= 0),

  -- Required when status is 'blocked'. A blocked task with no reason is a task
  -- nobody can unblock.
  blocker_reason text,
  blocker_owner_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  blocked_since date,

  tags text[] NOT NULL DEFAULT '{}',

  -- Cross-module links. Unconstrained uuids on purpose: goals live in the
  -- growth module's period-based KPI tables, which have no per-task row to
  -- point at, and a foreign key to a table that may not exist in every
  -- environment would make this migration undeployable.
  linked_goal_id uuid,
  linked_tracker_item_id uuid REFERENCES tracker_entry_items(id) ON DELETE SET NULL,
  -- Where this came from, if it was generated rather than typed.
  source_workforce_task_id uuid,

  completed_at timestamptz,
  completed_by_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  cancellation_reason text,
  -- SOFT DELETE. "Deleted or cancelled tasks remain auditable" is an
  -- acceptance criterion, so nothing is ever removed: the row is hidden and
  -- its activity trail stays readable.
  deleted_at timestamptz,
  deleted_by_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,

  created_by_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date),
  CHECK (status <> 'blocked' OR (blocker_reason IS NOT NULL AND length(btrim(blocker_reason)) > 0))
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks (project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks (owner_employee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks (due_date)
  WHERE deleted_at IS NULL AND status NOT IN ('completed', 'cancelled');
CREATE INDEX IF NOT EXISTS idx_tasks_tags ON tasks USING gin (tags);

-- =============================================================================
-- task_assignments — who is doing it
-- =============================================================================
-- A separate table rather than a column, because a task can have more than one
-- assignee and because history matters: reassigning should not erase who had it
-- before.
CREATE TABLE IF NOT EXISTS task_assignments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES workforce_employees(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'assignee'
    CHECK (role IN ('assignee', 'reviewer', 'collaborator')),
  assigned_by uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  -- Set rather than deleted, so a reassignment keeps its history.
  unassigned_at timestamptz
);

-- One active assignment per person per role per task.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_task_assignment_active
  ON task_assignments (task_id, employee_id, role) WHERE unassigned_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_task_assignments_employee
  ON task_assignments (employee_id) WHERE unassigned_at IS NULL;

-- =============================================================================
-- task_dependencies
-- =============================================================================
CREATE TABLE IF NOT EXISTS task_dependencies (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,

  dependency_type text NOT NULL DEFAULT 'finish_to_start'
    CHECK (dependency_type IN ('finish_to_start', 'start_to_start', 'related')),
  -- Whether the dependency actually GATES completion, or is only informational.
  -- Configurable because a hard gate on every link makes people delete links
  -- rather than record them.
  blocks_completion boolean NOT NULL DEFAULT true,

  created_by uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on
  ON task_dependencies (depends_on_task_id);

-- A dependency cycle makes completion impossible for every task in the loop and
-- hangs any naive traversal. Rejected at write time, walking the existing graph
-- with a depth cap.
CREATE OR REPLACE FUNCTION public.task_dependencies_no_cycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_found boolean;
BEGIN
  WITH RECURSIVE walk(id, depth) AS (
    SELECT NEW.task_id, 0
    UNION ALL
    SELECT d.task_id, w.depth + 1
    FROM task_dependencies d
    JOIN walk w ON d.depends_on_task_id = w.id
    WHERE w.depth < 50
  )
  SELECT EXISTS (SELECT 1 FROM walk WHERE id = NEW.depends_on_task_id) INTO v_found;

  IF v_found THEN
    RAISE EXCEPTION 'task.dependency_cycle' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_dependencies_no_cycle ON task_dependencies;
CREATE TRIGGER trg_task_dependencies_no_cycle
  BEFORE INSERT OR UPDATE ON task_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.task_dependencies_no_cycle();

-- =============================================================================
-- task_comments / task_attachments
-- =============================================================================
CREATE TABLE IF NOT EXISTS task_comments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  author_name text NOT NULL DEFAULT 'Unknown',
  body text NOT NULL CHECK (length(btrim(body)) > 0),
  -- A progress note is a comment with intent: it appears on the task timeline
  -- and can be pulled into a tracker entry.
  is_progress_note boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments (task_id, created_at);

CREATE TABLE IF NOT EXISTS task_attachments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_name text NOT NULL CHECK (length(btrim(file_name)) > 0),
  -- Derived server-side from the task and uploader; never accepted from a
  -- client, because a caller-supplied path is a way to point a record at
  -- somebody else's file.
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  uploaded_by uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments (task_id);

-- =============================================================================
-- task_activity_events — the audit trail AND the domain event stream
-- =============================================================================
-- Two jobs in one append-only table:
--
--   AUDIT. "Deleted or cancelled tasks remain auditable" — the task row is soft
--   deleted and this trail is never touched, so what happened to it survives.
--
--   DOMAIN EVENTS. Completing a task emits 'task.completed', which the tracker
--   and goal-progress consumers read. The task module does not reach into the
--   tracker's tables; it publishes, and the consumer decides.
CREATE TABLE IF NOT EXISTS task_activity_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,

  event_type text NOT NULL CHECK (length(btrim(event_type)) > 0),
  from_status text,
  to_status text,
  summary text NOT NULL DEFAULT '',
  -- Ids and enums only. This is read back to everyone who can see the task.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  actor_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  actor_clerk_id text,

  -- Consumer bookkeeping: null until a downstream module has acted on it.
  -- Lets the tracker pick up completions it has not seen without re-processing
  -- the whole history.
  consumed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_activity_task ON task_activity_events (task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_activity_unconsumed
  ON task_activity_events (created_at) WHERE consumed_at IS NULL;

CREATE OR REPLACE FUNCTION public.task_activity_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- consumed_at is the one field a downstream consumer may stamp. Everything
  -- else about what happened is fixed.
  IF TG_OP = 'UPDATE'
     AND NEW.id = OLD.id
     AND NEW.task_id = OLD.task_id
     AND NEW.event_type = OLD.event_type
     AND NEW.from_status IS NOT DISTINCT FROM OLD.from_status
     AND NEW.to_status IS NOT DISTINCT FROM OLD.to_status
     AND NEW.summary = OLD.summary
     AND NEW.metadata = OLD.metadata
     AND NEW.created_at = OLD.created_at
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'task.activity_immutable' USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_task_activity_append_only ON task_activity_events;
CREATE TRIGGER trg_task_activity_append_only
  BEFORE UPDATE OR DELETE ON task_activity_events
  FOR EACH ROW EXECUTE FUNCTION public.task_activity_append_only();

-- =============================================================================
-- calendar_events
-- =============================================================================
-- Only REAL entries live here: meetings, check-ins, anything somebody created.
-- Leave, holidays, shifts, task due dates and report deadlines are NOT stored;
-- they are merged on read by work_calendar(), because duplicating them would
-- mean a second copy to keep in step and a calendar that disagrees with the
-- module it came from.
CREATE TABLE IF NOT EXISTS calendar_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  description text,

  kind text NOT NULL DEFAULT 'meeting' CHECK (kind IN (
    'meeting', 'performance_checkin', 'one_to_one', 'review', 'training', 'other'
  )),

  -- Instants, not local times: a meeting happens at a moment, and storing a
  -- wall-clock time would break the first time two attendees are in different
  -- timezones.
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  is_all_day boolean NOT NULL DEFAULT false,
  -- The timezone the organiser intended, so an all-day event lands on the right
  -- date and a recurrence does not drift across a DST boundary.
  timezone text NOT NULL DEFAULT 'Africa/Dar_es_Salaam',

  location text,
  meeting_url text,

  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,

  organiser_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  -- [{ employeeId, response }] where response is accepted | declined | tentative.
  attendees jsonb NOT NULL DEFAULT '[]'::jsonb,

  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'cancelled', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_window ON calendar_events (starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_organiser ON calendar_events (organiser_employee_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_attendees
  ON calendar_events USING gin (attendees);

-- =============================================================================
-- meeting_records — what actually happened
-- =============================================================================
CREATE TABLE IF NOT EXISTS meeting_records (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  calendar_event_id uuid REFERENCES calendar_events(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  held_at timestamptz NOT NULL,

  -- Who was actually there, which is regularly not who was invited.
  attendee_employee_ids uuid[] NOT NULL DEFAULT '{}',
  absent_employee_ids uuid[] NOT NULL DEFAULT '{}',

  agenda text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  decisions text NOT NULL DEFAULT '',
  -- Actions agreed. Promoted into real tasks by the application, which is why
  -- the ids are kept: so the minutes can show what became of each one.
  action_task_ids uuid[] NOT NULL DEFAULT '{}',

  recorded_by_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meeting_records_held ON meeting_records (held_at DESC);

-- =============================================================================
-- updated_at
-- =============================================================================
CREATE OR REPLACE FUNCTION public.work_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'project_milestones', 'tasks', 'calendar_events', 'meeting_records'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.work_touch_updated_at()', t, t);
  END LOOP;
END
$$;

-- =============================================================================
-- Access control
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'project_milestones', 'tasks', 'task_assignments', 'task_dependencies',
    'task_comments', 'task_attachments', 'task_activity_events',
    'calendar_events', 'meeting_records'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION public.task_dependencies_no_cycle() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.task_activity_append_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.work_touch_updated_at() FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE task_activity_events IS
  'Append-only. Both the audit trail (a soft-deleted task keeps its history) and the domain event stream (task.completed is consumed by the tracker and goal progress). SERVICE ROLE ONLY.';
COMMENT ON TABLE calendar_events IS
  'REAL calendar entries only. Leave, holidays, shifts, task due dates and report deadlines are merged on read by work_calendar() rather than copied here, so the calendar cannot disagree with the module the entry came from.';

NOTIFY pgrst, 'reload schema';
