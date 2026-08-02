-- Daily Tracker and Weekly Execution Review — schema.
--
-- WHAT THIS REPLACES
--
-- md_tracker (20260701000004) got the core idea right and proved it: the three
-- OpusFesta brands are ROWS in md_tracker_engines, not values in an enum, so
-- adding a fourth engine has never needed a migration. That property is kept and
-- generalised here.
--
-- What it cannot do:
--   Only brands can be tracked. There is no way to track a person, a team, a
--   department, a project or an initiative, which is most of the company.
--   Entries are free text in fixed columns, so "what carried over" is prose and
--   nothing links to the task, project or goal it is about.
--   Nothing is ever owed. An entry exists once someone types one, so a day
--   nobody filled in looks identical to a day nobody worked.
--   Status has no 'missed' and no notion of a non-working day, so a public
--   holiday and a skipped Tuesday are the same blank cell.
--
-- md_tracker is NOT dropped: /workforce/daily-tracker still reads it, and the
-- backfill copies its engines forward as tracking_units rather than moving them.
--
-- THE SHAPE
--
--   What is tracked   tracking_units        employee | team | department |
--                                           brand | project | initiative
--   How often         tracking_cycles       cadence, deadline, timezone, schedule
--   Who owes it       tracking_assignments
--   The record        tracker_entries -> tracker_entry_items
--   The conversation  tracker_reviews, tracker_comments
--   The rollup        weekly_summaries

-- =============================================================================
-- tracking_units — the thing being tracked
-- =============================================================================
-- One table for six kinds on purpose. A tracker entry is the same shape whoever
-- it is about, and separate tables per kind would mean six of every query, six
-- carry-over implementations, and a seventh kind needing a migration.
--
-- NO BRAND IS NAMED ANYWHERE IN THIS SCHEMA. OpusFesta, OpusPass and OpusStudio
-- are rows of kind 'brand', seeded by the backfill from md_tracker_engines. A
-- fourth brand is an INSERT.
CREATE TABLE IF NOT EXISTS tracking_units (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind text NOT NULL CHECK (kind IN (
    'employee', 'team', 'department', 'brand', 'project', 'initiative'
  )),
  slug text NOT NULL UNIQUE CHECK (length(btrim(slug)) > 0),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text,

  -- The subject, for the kinds that point at an existing record. Left null for
  -- 'brand' and 'initiative', which have no table of their own and are defined
  -- by this row.
  employee_id uuid REFERENCES workforce_employees(id) ON DELETE CASCADE,
  department text,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,

  -- Hierarchy: a team inside a department inside a brand. Used to roll a
  -- weekly summary up without hard-coding what contains what.
  parent_unit_id uuid REFERENCES tracking_units(id) ON DELETE SET NULL,

  -- Accountable for the unit. Distinct from whoever files the entry: a brand's
  -- owner is its MD, and the person filing may be their deputy.
  owner_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,

  -- Working days and timezone come from here. Null falls back to the cycle's
  -- schedule, then to the default work schedule, so every unit resolves to one.
  schedule_id uuid REFERENCES work_schedules(id) ON DELETE SET NULL,

  sort_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  -- Room for kind-specific attributes without a migration per kind.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- The subject must match the kind. A unit claiming to be a department while
  -- carrying an employee id is ambiguous, and ambiguity here means somebody is
  -- chased for the wrong thing.
  CHECK (
    (kind = 'employee'   AND employee_id IS NOT NULL AND department IS NULL AND project_id IS NULL) OR
    (kind = 'department' AND department  IS NOT NULL AND employee_id IS NULL AND project_id IS NULL) OR
    (kind = 'project'    AND project_id  IS NOT NULL AND employee_id IS NULL AND department IS NULL) OR
    (kind IN ('team', 'brand', 'initiative') AND employee_id IS NULL AND project_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_tracking_units_kind ON tracking_units (kind) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_tracking_units_parent ON tracking_units (parent_unit_id);
CREATE INDEX IF NOT EXISTS idx_tracking_units_employee ON tracking_units (employee_id);

-- =============================================================================
-- tracking_cycles — how often, and by when
-- =============================================================================
CREATE TABLE IF NOT EXISTS tracking_cycles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  cadence text NOT NULL DEFAULT 'daily' CHECK (cadence IN ('daily', 'weekly')),

  -- Local time on the entry's own date. Combined with the resolved schedule's
  -- timezone to produce the deadline instant, so 18:00 means 18:00 where the
  -- person works and not 18:00 UTC.
  deadline_time time NOT NULL DEFAULT '18:00',
  -- Minutes past the deadline before an unfilled entry is marked missed. The
  -- difference between "you are late" and "you did not do it".
  grace_minutes integer NOT NULL DEFAULT 60 CHECK (grace_minutes BETWEEN 0 AND 1440),

  -- Default working days and timezone for units that do not set their own.
  schedule_id uuid REFERENCES work_schedules(id) ON DELETE SET NULL,

  -- How far back an entry may still be filled in. 0 means today only.
  allow_backdate_days integer NOT NULL DEFAULT 2 CHECK (allow_backdate_days BETWEEN 0 AND 30),
  requires_review boolean NOT NULL DEFAULT true,
  -- Whether unfinished items roll into the next working day automatically.
  auto_carry_over boolean NOT NULL DEFAULT true,
  -- Whether to prefill from tasks, hours and milestones.
  prefill_enabled boolean NOT NULL DEFAULT true,

  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- tracking_assignments — who files for which unit
-- =============================================================================
-- The authorization root. "Employees only see tracking units assigned to them"
-- is enforced by scoping every read to the caller's rows here.
CREATE TABLE IF NOT EXISTS tracking_assignments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  cycle_id uuid NOT NULL REFERENCES tracking_cycles(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES tracking_units(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES workforce_employees(id) ON DELETE CASCADE,

  -- 'owner'       files the entry
  -- 'contributor' may add items but does not own submission
  -- 'reviewer'    reads and decides, never files
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'contributor', 'reviewer')),

  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,

  assigned_by uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  -- Why this person tracks this unit. Worth a column: an assignment nobody can
  -- explain is one nobody will remove when it stops being true.
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- One owner per unit per cycle at a time. Two people each thinking the other
-- filed today's entry is the failure this prevents.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tracking_assignment_owner
  ON tracking_assignments (cycle_id, unit_id, effective_from)
  WHERE role = 'owner' AND is_active;

CREATE INDEX IF NOT EXISTS idx_tracking_assignments_employee
  ON tracking_assignments (employee_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_tracking_assignments_unit
  ON tracking_assignments (unit_id) WHERE is_active;

-- =============================================================================
-- tracker_entries — one day, one unit
-- =============================================================================
-- STATUSES. Six describe work and two describe the absence of it:
--
--   not_started      generated, nothing filled in yet
--   in_progress      being worked
--   done             the day's commitments were met
--   blocked          stopped, with a blocker recorded
--   carried_over     unfinished, and the remainder moved to the next day
--   missed           the deadline passed with nothing submitted. SYSTEM ONLY:
--                    the CHECK below is not what stops an employee selecting it,
--                    the application is, but the column comment says so and
--                    tracker_mark_missed() is the only writer in practice.
--   not_working_day  a rest day, public holiday, or approved leave
--   waived           excused by a manager
CREATE TABLE IF NOT EXISTS tracker_entries (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  cycle_id uuid NOT NULL REFERENCES tracking_cycles(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES tracking_units(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES tracking_assignments(id) ON DELETE SET NULL,
  -- Denormalised from the assignment so an entry survives the assignment being
  -- ended, and so every read can scope on one column.
  employee_id uuid NOT NULL REFERENCES workforce_employees(id) ON DELETE CASCADE,

  entry_date date NOT NULL,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN (
    'not_started', 'in_progress', 'done', 'blocked',
    'carried_over', 'missed', 'not_working_day', 'waived'
  )),

  -- ---- the narrative ----
  progress_summary text NOT NULL DEFAULT '',
  blockers text NOT NULL DEFAULT '',
  blocker_owner_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  expected_resolution_date date,
  decisions_required text NOT NULL DEFAULT '',
  next_steps text NOT NULL DEFAULT '',

  -- ---- deadline ----
  -- Computed at generation from the cycle's deadline_time in the resolved
  -- schedule's timezone. Stored rather than derived on read so a schedule
  -- changed in October cannot retroactively make September late.
  deadline_at timestamptz,
  submitted_at timestamptz,
  is_late boolean NOT NULL DEFAULT false,

  -- ---- suppression ----
  -- Why no entry is owed. Set by generation, and the reason approved leave does
  -- not become a missed day.
  suppression_reason text CHECK (suppression_reason IN (
    'rest_day', 'public_holiday', 'approved_leave', 'not_employed', 'waived'
  )),

  -- ---- review ----
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'under_review', 'returned', 'accepted')),
  reviewed_at timestamptz,
  reviewed_by_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  returned_count integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,

  -- What was prefilled and from where, snapshotted at generation. Kept so the
  -- entry still reads correctly after the tasks it was built from have moved on.
  prefill jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (cycle_id, unit_id, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_tracker_entries_employee_date
  ON tracker_entries (employee_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_tracker_entries_unit_date
  ON tracker_entries (unit_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_tracker_entries_open
  ON tracker_entries (deadline_at)
  WHERE status IN ('not_started', 'in_progress') AND submitted_at IS NULL;

COMMENT ON COLUMN tracker_entries.status IS
  'Work status. ''missed'' is SYSTEM-CALCULATED by tracker_mark_missed() after the deadline and must not be offered to employees as a choice: self-reported misses are either never selected or selected out of guilt, and both make the number meaningless.';

-- =============================================================================
-- tracker_entry_items — the line items
-- =============================================================================
-- Priorities, completed work, blockers, decisions and next steps as ROWS rather
-- than as prose in a textarea. That is what makes carry-over possible: an
-- unfinished item can move to tomorrow and keep a link to where it came from,
-- which a paragraph cannot.
CREATE TABLE IF NOT EXISTS tracker_entry_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_id uuid NOT NULL REFERENCES tracker_entries(id) ON DELETE CASCADE,

  kind text NOT NULL CHECK (kind IN (
    'planned', 'completed', 'blocker', 'decision', 'next_step'
  )),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  detail text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN (
    'not_started', 'in_progress', 'done', 'blocked', 'carried_over', 'missed', 'waived'
  )),
  sort_order integer NOT NULL DEFAULT 100,

  -- ---- links, so nobody retypes what the platform already knows ----
  linked_task_id uuid,
  linked_project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  linked_goal_id uuid,

  -- Where this item came from. 'manual' is typed; the rest were prefilled, and
  -- saying which lets the UI mark them as such instead of pretending the
  -- employee wrote them.
  source text NOT NULL DEFAULT 'manual' CHECK (source IN (
    'manual', 'carry_over', 'prefill_task', 'prefill_overdue', 'prefill_blocked',
    'prefill_milestone', 'prefill_goal'
  )),

  -- THE CARRY-OVER LINK. Points at the item on the previous entry that this one
  -- continues. Never cleared, so a thing that slipped for six days can be
  -- followed back through all six.
  carried_from_item_id uuid REFERENCES tracker_entry_items(id) ON DELETE SET NULL,
  carry_count integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tracker_items_entry ON tracker_entry_items (entry_id, kind, sort_order);
-- One prefilled item per source record per entry. Prefill runs once at
-- generation, but a re-run must not double every completed task on the entry.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tracker_item_prefill_task
  ON tracker_entry_items (entry_id, source, linked_task_id)
  WHERE linked_task_id IS NOT NULL AND source <> 'manual';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tracker_item_prefill_project
  ON tracker_entry_items (entry_id, source, linked_project_id)
  WHERE linked_project_id IS NOT NULL AND source <> 'manual';
CREATE INDEX IF NOT EXISTS idx_tracker_items_carried ON tracker_entry_items (carried_from_item_id);
-- One carry-forward per source item. Without this a re-run of the carry-over
-- job would duplicate every unfinished item, every day, compounding.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tracker_item_carry_source
  ON tracker_entry_items (carried_from_item_id)
  WHERE carried_from_item_id IS NOT NULL;

-- =============================================================================
-- tracker_reviews — decisions, and the snapshot each was made about
-- =============================================================================
-- entry_snapshot is what makes "reviewers can return entries without destroying
-- prior versions" true. Returning does not roll anything back: the entry as it
-- stood is captured here first, the author edits forward, and the earlier text
-- is still readable afterwards.
CREATE TABLE IF NOT EXISTS tracker_reviews (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_id uuid REFERENCES tracker_entries(id) ON DELETE CASCADE,
  weekly_summary_id uuid,

  reviewer_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  reviewer_clerk_id text,
  action text NOT NULL CHECK (action IN (
    'submit', 'start_review', 'return', 'accept', 'waive', 'reopen'
  )),
  from_status text,
  to_status text,
  note text,

  -- The entry AND its items, as they were when this decision was made.
  entry_snapshot jsonb,
  entry_version integer,

  created_at timestamptz NOT NULL DEFAULT now(),

  CHECK (entry_id IS NOT NULL OR weekly_summary_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_tracker_reviews_entry ON tracker_reviews (entry_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.tracker_reviews_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'tracker.review_immutable' USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_tracker_reviews_append_only ON tracker_reviews;
CREATE TRIGGER trg_tracker_reviews_append_only
  BEFORE UPDATE OR DELETE ON tracker_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tracker_reviews_append_only();

-- =============================================================================
-- tracker_comments
-- =============================================================================
CREATE TABLE IF NOT EXISTS tracker_comments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_id uuid REFERENCES tracker_entries(id) ON DELETE CASCADE,
  weekly_summary_id uuid,
  item_id uuid REFERENCES tracker_entry_items(id) ON DELETE CASCADE,

  author_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  author_name text NOT NULL DEFAULT 'Unknown',
  body text NOT NULL CHECK (length(btrim(body)) > 0),
  visibility text NOT NULL DEFAULT 'all' CHECK (visibility IN ('all', 'internal')),
  created_at timestamptz NOT NULL DEFAULT now(),

  CHECK (entry_id IS NOT NULL OR weekly_summary_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_tracker_comments_entry ON tracker_comments (entry_id, created_at);

-- =============================================================================
-- weekly_summaries — the execution review
-- =============================================================================
CREATE TABLE IF NOT EXISTS weekly_summaries (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  cycle_id uuid NOT NULL REFERENCES tracking_cycles(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES tracking_units(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,

  week_start date NOT NULL,
  week_end date NOT NULL,

  -- ---- authored ----
  wins text NOT NULL DEFAULT '',
  missed_commitments text NOT NULL DEFAULT '',
  carried_forward text NOT NULL DEFAULT '',
  key_blockers text NOT NULL DEFAULT '',
  risks text NOT NULL DEFAULT '',
  decisions_required text NOT NULL DEFAULT '',
  next_week_priorities text NOT NULL DEFAULT '',
  -- [{ name, previous, current, target, direction }]
  kpi_movement jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- ---- computed from the week's entries ----
  -- Counts, carried items and blockers, recomputed by
  -- tracker_build_weekly_summary(). Held so a summary that was accurate when
  -- written stays readable after the entries are archived, and so a reviewer
  -- can see the numbers next to the prose.
  aggregate jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- ---- review ----
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'under_review', 'returned', 'accepted', 'locked')),
  submitted_at timestamptz,

  manager_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  manager_comment text,
  manager_commented_at timestamptz,
  -- Separate from the manager's. An executive note on a brand review is a
  -- different voice with a different audience, and folding them into one field
  -- loses who said what.
  executive_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  executive_comment text,
  executive_commented_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (cycle_id, unit_id, week_start),
  CHECK (week_end >= week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_summaries_unit
  ON weekly_summaries (unit_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_summaries_employee
  ON weekly_summaries (employee_id, week_start DESC);

ALTER TABLE tracker_reviews
  DROP CONSTRAINT IF EXISTS tracker_reviews_weekly_summary_id_fkey;
ALTER TABLE tracker_reviews
  ADD CONSTRAINT tracker_reviews_weekly_summary_id_fkey
  FOREIGN KEY (weekly_summary_id) REFERENCES weekly_summaries(id) ON DELETE CASCADE;

ALTER TABLE tracker_comments
  DROP CONSTRAINT IF EXISTS tracker_comments_weekly_summary_id_fkey;
ALTER TABLE tracker_comments
  ADD CONSTRAINT tracker_comments_weekly_summary_id_fkey
  FOREIGN KEY (weekly_summary_id) REFERENCES weekly_summaries(id) ON DELETE CASCADE;

-- =============================================================================
-- updated_at
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tracker_touch_updated_at()
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
    'tracking_units', 'tracking_cycles', 'tracking_assignments',
    'tracker_entries', 'tracker_entry_items', 'weekly_summaries'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.tracker_touch_updated_at()', t, t);
  END LOOP;
END
$$;

-- =============================================================================
-- Access control
-- =============================================================================
-- RLS on, no policies: PostgREST denies every authenticated role, the admin
-- app's service-role client bypasses it, and authorization is enforced in
-- server code where the employee has been resolved from the Clerk session.
-- Tracker entries carry blockers, decisions and performance signals; that is
-- not something to gate on a client-side policy.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tracking_units', 'tracking_cycles', 'tracking_assignments',
    'tracker_entries', 'tracker_entry_items', 'tracker_reviews',
    'tracker_comments', 'weekly_summaries'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION public.tracker_reviews_append_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tracker_touch_updated_at() FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE tracking_units IS
  'What is being tracked: employee, team, department, brand, project or initiative. Brands are ROWS, never enum values — adding OpusStudio or a fourth brand is an INSERT, not a migration.';
COMMENT ON COLUMN tracker_entry_items.carried_from_item_id IS
  'The item on the previous entry that this one continues. Never cleared, so an item that slipped for six days can be followed back through all six.';

NOTIFY pgrst, 'reload schema';
