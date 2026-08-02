-- Goals, Performance and Employee Development.
--
-- WHAT MAKES THIS MODULE DIFFERENT FROM THE OTHERS
--
-- Everything else in Workspace is operational: a punch, a task, a leave day.
-- This is the record of what the company thinks of a person. It decides pay,
-- promotion and exit. Three consequences run through the whole schema:
--
--  1. AUTHORIZATION IS STRICTER THAN ANYWHERE ELSE. Task visibility asks "are
--     you connected to this?". Review visibility asks "are you the subject,
--     their manager, or HR?" and nothing else opens it. There is no department
--     or organisation visibility level for a review, because there is no
--     legitimate reading of "my department can see my performance review".
--
--  2. RATINGS ARE NEVER COMPUTED. Tracker entries, tasks and reports feed
--     EVIDENCE, and evidence is a link a human chose to attach. review_ratings
--     has no 'system' source and no numeric input from activity volume: there
--     is no code path by which filing more reports raises a rating. Somebody
--     decides, signs their name, and writes why.
--
--  3. NOTHING IS EDITED IN PLACE. review_ratings is append-only; a change
--     supersedes rather than overwrites, so "you were a 3 before they talked to
--     your manager" survives. That is what makes "all rating changes are
--     audited" true by construction rather than by discipline.
--
-- GOALS EXISTED AS A DANGLING REFERENCE
--
-- tracker_entry_items.linked_goal_id and tasks.linked_goal_id are plain uuids
-- with no foreign key, left that way because goals had nowhere to point. They
-- are wired up at the end of this file.

-- =============================================================================
-- competencies — the shared vocabulary
-- =============================================================================
--
-- A competency library rather than free text per review, so "Communication"
-- means one thing across the company and a rating can be compared year on year.
-- Levels are DATA (jsonb), not columns, because the ladder differs by role and
-- hard-coding five levels guarantees a sixth is needed.
CREATE TABLE IF NOT EXISTS competencies (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code text NOT NULL UNIQUE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text,
  category text NOT NULL DEFAULT 'core'
    CHECK (category IN ('core', 'leadership', 'functional', 'values')),
  -- Which roles or departments it applies to. Empty means everyone.
  applies_to_departments text[] NOT NULL DEFAULT '{}',
  applies_to_job_titles text[] NOT NULL DEFAULT '{}',
  -- [{ level: 1, label: 'Developing', descriptor: '…' }, …]
  level_descriptors jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competencies_active
  ON competencies(is_active, sort_order) WHERE is_active;

-- =============================================================================
-- performance_cycles — the eleven stages
-- =============================================================================
--
-- The stage is a single column with a CHECK rather than a set of booleans, so
-- there is exactly one answer to "where are we?". Movement between stages goes
-- through performance_cycle_advance(), which is the only place the order is
-- written down.
CREATE TABLE IF NOT EXISTS performance_cycles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code text NOT NULL UNIQUE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text,

  starts_on date NOT NULL,
  ends_on date NOT NULL,

  stage text NOT NULL DEFAULT 'goal_setting' CHECK (stage IN (
    'goal_setting',
    'manager_approval',
    'active_cycle',
    'mid_cycle_check_in',
    'self_review',
    'manager_review',
    'calibration',
    'final_review',
    'employee_acknowledgment',
    'development_planning',
    'closed'
  )),
  stage_entered_at timestamptz NOT NULL DEFAULT now(),

  -- WEIGHT POLICY. Goal weights are validated against these, per employee, at
  -- the approval gate. Enforcing per row is impossible: you cannot build up to
  -- 100 one goal at a time if every insert must already total 100.
  weight_total_required numeric(6,2) NOT NULL DEFAULT 100,
  weight_tolerance numeric(6,2) NOT NULL DEFAULT 0
    CHECK (weight_tolerance >= 0),
  min_goals_per_employee integer NOT NULL DEFAULT 1 CHECK (min_goals_per_employee >= 0),
  max_goals_per_employee integer CHECK (max_goals_per_employee IS NULL OR max_goals_per_employee > 0),
  requires_manager_approval boolean NOT NULL DEFAULT true,

  -- The rating scale for this cycle. Changing the scale mid-cycle would make
  -- two reviews incomparable, so it is frozen here and copied onto each rating.
  rating_scale_min integer NOT NULL DEFAULT 1,
  rating_scale_max integer NOT NULL DEFAULT 5,
  -- [{ value: 3, label: 'Meets expectations', descriptor: '…' }, …]
  rating_scale_labels jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Calibration is where managers compare people side by side. What is said
  -- there is never shown to the employee, so it needs its own switch rather
  -- than riding on the cycle being closed.
  calibration_enabled boolean NOT NULL DEFAULT true,

  closed_at timestamptz,
  closed_by_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (ends_on >= starts_on),
  CHECK (rating_scale_max > rating_scale_min)
);

CREATE INDEX IF NOT EXISTS idx_performance_cycles_stage
  ON performance_cycles(stage, starts_on DESC);

-- =============================================================================
-- goal_periods — when goals are measured
-- =============================================================================
--
-- Separate from the cycle because the two genuinely differ: an annual review
-- cycle contains four quarterly goal periods, and a company OKR period can
-- exist with no review attached to it at all.
CREATE TABLE IF NOT EXISTS goal_periods (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  cycle_id uuid REFERENCES performance_cycles(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  kind text NOT NULL DEFAULT 'quarter'
    CHECK (kind IN ('month', 'quarter', 'half_year', 'year', 'custom')),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  -- Goals can still be proposed and edited while this is open.
  is_open boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),

  CHECK (ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS idx_goal_periods_window
  ON goal_periods(starts_on, ends_on);

-- =============================================================================
-- goals — the alignment tree
-- =============================================================================
--
-- ALIGNMENT. level says where a goal sits; parent_goal_id says what it rolls up
-- to. Both are needed: level without a parent gives you five unconnected lists,
-- and a parent without a level lets an employee goal become the parent of a
-- company goal. goal_assert_alignment() enforces that a child never sits above
-- its parent, and rejects cycles.
--
-- BRANDS ARE DATA. A brand goal points at a tracking_unit, the same rows the
-- daily tracker uses. No brand is named anywhere in this schema, so adding one
-- is an INSERT rather than a migration.
CREATE TABLE IF NOT EXISTS goals (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference text UNIQUE,

  title text NOT NULL CHECK (length(btrim(title)) > 0),
  description text NOT NULL DEFAULT '',

  level text NOT NULL DEFAULT 'employee'
    CHECK (level IN ('company', 'brand', 'department', 'team', 'employee')),
  parent_goal_id uuid REFERENCES goals(id) ON DELETE SET NULL,

  -- Who is answerable. An employee goal always has one; a company goal may be
  -- owned by whoever sponsors it.
  owner_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  created_by_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,

  -- Scope for the non-employee levels.
  tracking_unit_id uuid REFERENCES tracking_units(id) ON DELETE SET NULL,
  department text,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,

  cycle_id uuid REFERENCES performance_cycles(id) ON DELETE SET NULL,
  period_id uuid REFERENCES goal_periods(id) ON DELETE SET NULL,

  start_date date,
  due_date date,

  -- Contribution to the owner's total for the period. Validated as a SUM
  -- against the cycle policy, not per row.
  weight numeric(6,2) NOT NULL DEFAULT 0 CHECK (weight >= 0 AND weight <= 1000),

  status text NOT NULL DEFAULT 'not_started' CHECK (status IN (
    'not_started', 'on_track', 'at_risk', 'off_track',
    'achieved', 'partially_achieved', 'missed', 'cancelled'
  )),

  -- Who may READ the goal. Reviews have no such setting; goals do, because a
  -- company goal is meant to be read by everyone and a personal development
  -- goal is not.
  visibility text NOT NULL DEFAULT 'manager'
    CHECK (visibility IN ('private', 'manager', 'team', 'department', 'organisation')),

  progress numeric(5,2) NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  -- Rolled up from key results, or typed in by the owner. Recorded so a reader
  -- knows whether the number is arithmetic or an opinion.
  progress_source text NOT NULL DEFAULT 'manual'
    CHECK (progress_source IN ('manual', 'key_results')),
  progress_updated_at timestamptz,

  measurement_method text NOT NULL DEFAULT 'key_results' CHECK (measurement_method IN (
    'key_results', 'milestones', 'percentage', 'binary', 'qualitative'
  )),

  approval_status text NOT NULL DEFAULT 'draft' CHECK (approval_status IN (
    'draft', 'pending_approval', 'approved', 'changes_requested', 'rejected'
  )),
  approved_by_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  approved_at timestamptz,
  approval_note text,

  -- Soft delete, like tasks. A cancelled goal is part of the record of the
  -- period; deleting the row would make the weights stop adding up in
  -- retrospect.
  deleted_at timestamptz,
  deleted_by_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date),
  -- An employee goal without an owner is nobody's.
  CHECK (level <> 'employee' OR owner_employee_id IS NOT NULL),
  -- A goal cannot be its own parent.
  CHECK (parent_goal_id IS NULL OR parent_goal_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_goals_owner
  ON goals(owner_employee_id, cycle_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_goals_parent
  ON goals(parent_goal_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_goals_level
  ON goals(level, cycle_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_goals_period
  ON goals(period_id) WHERE deleted_at IS NULL;

-- =============================================================================
-- goal_key_results — six measurement types
-- =============================================================================
--
-- ONE TABLE, SIX TYPES. A number, a percentage, a currency amount and a custom
-- score are all "start here, aim for there, currently at this", so they share
-- start_value/target_value/current_value and differ only in how they are
-- rendered and how a percentage is derived. Milestone and boolean are the two
-- that are not arithmetic, and they are the reason attainment is a function
-- rather than a generated column.
CREATE TABLE IF NOT EXISTS goal_key_results (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  goal_id uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,

  title text NOT NULL CHECK (length(btrim(title)) > 0),
  description text,

  measurement_type text NOT NULL DEFAULT 'number' CHECK (measurement_type IN (
    'number', 'percentage', 'currency', 'milestone', 'boolean', 'custom_score'
  )),

  start_value numeric(18,4) NOT NULL DEFAULT 0,
  target_value numeric(18,4),
  current_value numeric(18,4) NOT NULL DEFAULT 0,

  -- 'increase' or 'decrease'. Cutting response time from 40 to 10 is progress,
  -- and without this the arithmetic reads it as failure.
  direction text NOT NULL DEFAULT 'increase'
    CHECK (direction IN ('increase', 'decrease')),

  unit text,
  currency text NOT NULL DEFAULT 'TZS',

  -- For 'milestone': [{ label: '…', done: false }, …]. For 'custom_score': the
  -- score labels. Both are data because their shape is per key result.
  definition jsonb NOT NULL DEFAULT '{}'::jsonb,

  weight numeric(6,2) NOT NULL DEFAULT 0 CHECK (weight >= 0),
  sort_order integer NOT NULL DEFAULT 0,

  is_achieved boolean NOT NULL DEFAULT false,
  achieved_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Anything arithmetic needs somewhere to aim at. Milestone and boolean do
  -- not: they are done or they are not.
  CHECK (
    measurement_type IN ('milestone', 'boolean')
    OR target_value IS NOT NULL
  ),
  -- A target equal to the start makes attainment a division by zero.
  CHECK (
    measurement_type IN ('milestone', 'boolean')
    OR target_value <> start_value
  )
);

CREATE INDEX IF NOT EXISTS idx_key_results_goal
  ON goal_key_results(goal_id, sort_order);

-- =============================================================================
-- goal_updates — progress, with its evidence
-- =============================================================================
--
-- Append-only. A progress history that can be edited is worth nothing in a
-- review: "it was at 90% all quarter" has to be checkable against what was said
-- at the time.
--
-- EVIDENCE IS A LINK SOMEBODY CHOSE. linked_task_id, linked_report_id and
-- linked_tracker_entry_id point at work that already exists. Nothing walks
-- those links to compute a rating; they are there so a claim can be checked.
CREATE TABLE IF NOT EXISTS goal_updates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  goal_id uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  key_result_id uuid REFERENCES goal_key_results(id) ON DELETE CASCADE,

  author_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  author_name text,

  update_type text NOT NULL DEFAULT 'progress' CHECK (update_type IN (
    'progress', 'status_change', 'evidence', 'comment', 'approval', 'correction'
  )),

  previous_value numeric(18,4),
  new_value numeric(18,4),
  previous_progress numeric(5,2),
  new_progress numeric(5,2),
  previous_status text,
  new_status text,

  body text NOT NULL DEFAULT '',

  -- Evidence links. Never traversed to produce a number.
  linked_task_id uuid,
  linked_report_submission_id uuid,
  linked_tracker_entry_id uuid,
  attachment_url text,
  attachment_name text,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_goal_updates_goal
  ON goal_updates(goal_id, created_at DESC);

-- =============================================================================
-- check_ins — the conversation, recorded
-- =============================================================================
--
-- Two columns for what was said: employee_notes and manager_notes, written by
-- different people and both visible to both. There is no private manager field
-- here on purpose. A one-to-one where the manager keeps a hidden note is a
-- calibration comment, and that belongs in review_sections where its visibility
-- rules are explicit.
CREATE TABLE IF NOT EXISTS check_ins (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  cycle_id uuid REFERENCES performance_cycles(id) ON DELETE SET NULL,
  employee_id uuid NOT NULL REFERENCES workforce_employees(id) ON DELETE CASCADE,
  manager_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,

  kind text NOT NULL DEFAULT 'mid_cycle' CHECK (kind IN (
    'weekly', 'monthly', 'mid_cycle', 'ad_hoc', 'probation', 'return_to_work'
  )),

  scheduled_for date,
  held_at timestamptz,

  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'employee_prepared', 'held', 'missed', 'cancelled')),

  employee_notes text NOT NULL DEFAULT '',
  manager_notes text NOT NULL DEFAULT '',
  agreed_actions text NOT NULL DEFAULT '',

  -- Where the employee says how they are actually doing. Not a rating and never
  -- read as one.
  employee_sentiment text CHECK (employee_sentiment IS NULL OR employee_sentiment IN (
    'thriving', 'steady', 'stretched', 'struggling'
  )),

  employee_acknowledged_at timestamptz,
  manager_acknowledged_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_check_ins_employee
  ON check_ins(employee_id, scheduled_for DESC);

-- =============================================================================
-- feedback_requests / feedback_responses
-- =============================================================================
--
-- WHY THE REQUEST AND THE RESPONSE ARE SEPARATE TABLES. A request is addressed
-- to somebody and may go unanswered; a response is a thing that was written.
-- Merging them means a declined request and an empty answer are the same row.
--
-- ANONYMITY IS A PROPERTY OF THE REQUEST, DECIDED WHEN IT IS SENT. Deciding
-- afterwards would let whoever reads it choose to unmask the author, which is
-- the one thing an anonymous respondent was promised would not happen.
CREATE TABLE IF NOT EXISTS feedback_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  cycle_id uuid REFERENCES performance_cycles(id) ON DELETE SET NULL,

  -- Who the feedback is ABOUT.
  subject_employee_id uuid NOT NULL REFERENCES workforce_employees(id) ON DELETE CASCADE,
  -- Who is being ASKED.
  respondent_employee_id uuid REFERENCES workforce_employees(id) ON DELETE CASCADE,
  -- External respondents (a client, a partner) have no employee row.
  respondent_email text,
  respondent_name text,

  requested_by_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,

  relationship text NOT NULL DEFAULT 'peer' CHECK (relationship IN (
    'manager', 'peer', 'direct_report', 'skip_level', 'cross_functional', 'external'
  )),

  -- [{ id, prompt, type }] where type is text | rating | choice.
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  message text,

  is_anonymous boolean NOT NULL DEFAULT false,
  -- Whether the SUBJECT may read the answer, as opposed to only their manager
  -- and HR. Upward feedback about a manager is routinely not shown to them
  -- verbatim.
  shared_with_subject boolean NOT NULL DEFAULT true,

  due_date date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'sent', 'submitted', 'declined', 'expired', 'cancelled'
  )),
  sent_at timestamptz,
  responded_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Somebody has to be asked.
  CHECK (respondent_employee_id IS NOT NULL OR respondent_email IS NOT NULL),
  -- Asking somebody to review themselves is a self-review, which is a different
  -- table with different rules.
  CHECK (respondent_employee_id IS NULL OR respondent_employee_id <> subject_employee_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_requests_subject
  ON feedback_requests(subject_employee_id, cycle_id);
CREATE INDEX IF NOT EXISTS idx_feedback_requests_respondent
  ON feedback_requests(respondent_employee_id, status);

CREATE TABLE IF NOT EXISTS feedback_responses (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id uuid NOT NULL REFERENCES feedback_requests(id) ON DELETE CASCADE,

  -- Kept even when the request is anonymous. Anonymity is enforced when the
  -- response is READ, not by throwing the author away: an anonymous channel
  -- with no accountability at all is how it gets abused, and HR must still be
  -- able to act on something defamatory.
  author_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,

  -- { questionId: answer }
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  strengths text NOT NULL DEFAULT '',
  improvements text NOT NULL DEFAULT '',
  -- Free comment the respondent marks as being for the manager only.
  private_to_requester text,

  -- An overall number the respondent may give. It is one input a human reads,
  -- never averaged into a final rating by the system.
  overall_score integer,

  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- One response per request. A second one is an edit, and edits to feedback
  -- are not a thing we allow.
  UNIQUE (request_id)
);

-- =============================================================================
-- performance_reviews — the record itself
-- =============================================================================
--
-- One row per (cycle, employee, kind). Self-review and manager review are
-- separate rows rather than columns on one, because they are written by
-- different people, at different stages, with different visibility, and one can
-- be complete while the other has not started.
CREATE TABLE IF NOT EXISTS performance_reviews (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  cycle_id uuid NOT NULL REFERENCES performance_cycles(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES workforce_employees(id) ON DELETE CASCADE,

  kind text NOT NULL DEFAULT 'manager'
    CHECK (kind IN ('self', 'manager', 'skip_level', 'final')),

  -- Frozen when the review is created. If somebody changes manager in March,
  -- the review still belongs to whoever actually managed them.
  reviewer_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,

  state text NOT NULL DEFAULT 'not_started' CHECK (state IN (
    'not_started', 'in_progress', 'submitted', 'in_calibration',
    'finalised', 'acknowledged', 'closed', 'correction_open'
  )),

  -- The one number that matters, and the reason most of this file exists.
  -- NULL until a human sets it. There is no default and no computation.
  overall_rating numeric(4,2),
  overall_rating_label text,
  -- Copied from the cycle so a later change to the scale cannot silently
  -- re-interpret an old rating.
  rating_scale_min integer,
  rating_scale_max integer,

  summary text NOT NULL DEFAULT '',

  submitted_at timestamptz,
  finalised_at timestamptz,
  finalised_by_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,

  -- The employee's acknowledgment. Acknowledging is not agreeing, so there is
  -- somewhere to disagree in writing.
  acknowledged_at timestamptz,
  acknowledgment_note text,
  employee_disagrees boolean NOT NULL DEFAULT false,

  closed_at timestamptz,

  -- The correction workflow. A closed review is immutable; this is the only
  -- door, it needs HR, and it records why it was opened.
  correction_opened_at timestamptz,
  correction_opened_by_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  correction_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (cycle_id, employee_id, kind),
  -- A self-review is written by its subject; anything else must not be.
  CHECK (kind <> 'self' OR reviewer_employee_id IS NULL OR reviewer_employee_id = employee_id),
  CHECK (kind = 'self' OR reviewer_employee_id IS NULL OR reviewer_employee_id <> employee_id),
  -- Opening a correction has to say why.
  CHECK (correction_opened_at IS NULL OR length(btrim(COALESCE(correction_reason, ''))) > 0)
);

CREATE INDEX IF NOT EXISTS idx_performance_reviews_employee
  ON performance_reviews(employee_id, cycle_id);
CREATE INDEX IF NOT EXISTS idx_performance_reviews_reviewer
  ON performance_reviews(reviewer_employee_id, state);

-- =============================================================================
-- review_sections — where visibility actually lives
-- =============================================================================
--
-- THE CALIBRATION RULE. A section carries its own visibility, and
-- 'calibration_only' is never shown to the employee: not while the cycle runs,
-- not after it closes, not in the acknowledgment view. Calibration is managers
-- comparing people to each other, and half of what makes it useful is that it
-- is candid about somebody who is not in the room.
--
-- Visibility WIDENS through the cycle for some sections (a manager's comment
-- becomes employee-visible at final review) and never for calibration. That is
-- why it is a column and not a function of the review state.
CREATE TABLE IF NOT EXISTS review_sections (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_id uuid NOT NULL REFERENCES performance_reviews(id) ON DELETE CASCADE,

  code text NOT NULL,
  title text NOT NULL,
  section_type text NOT NULL DEFAULT 'narrative' CHECK (section_type IN (
    'narrative', 'competency', 'goal_review', 'rating_summary',
    'calibration_note', 'development', 'acknowledgment'
  )),

  visibility text NOT NULL DEFAULT 'employee_visible' CHECK (visibility IN (
    'employee_visible',
    'manager_only',
    'calibration_only',
    'hr_only'
  )),

  body text NOT NULL DEFAULT '',
  author_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,

  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (review_id, code)
);

CREATE INDEX IF NOT EXISTS idx_review_sections_review
  ON review_sections(review_id, sort_order);

-- =============================================================================
-- review_ratings — append-only, by construction
-- =============================================================================
--
-- "All rating changes are audited" is not a logging concern here. A rating is
-- never UPDATEd: changing one inserts a new row and stamps superseded_at on the
-- old, so the history IS the table. A partial unique index keeps exactly one
-- live row per (review, competency-or-goal), which is what makes reading it
-- simple despite that.
--
-- THERE IS NO 'system' SOURCE. Every value on this table was typed by a person
-- whose id is on the row next to their reason.
CREATE TABLE IF NOT EXISTS review_ratings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_id uuid NOT NULL REFERENCES performance_reviews(id) ON DELETE CASCADE,
  section_id uuid REFERENCES review_sections(id) ON DELETE SET NULL,

  -- A rating is either of a competency or of a goal. Exactly one.
  competency_id uuid REFERENCES competencies(id) ON DELETE SET NULL,
  goal_id uuid REFERENCES goals(id) ON DELETE SET NULL,

  rating numeric(4,2) NOT NULL,
  rating_label text,
  -- The scale this was given on, copied from the cycle.
  scale_min integer NOT NULL DEFAULT 1,
  scale_max integer NOT NULL DEFAULT 5,

  -- Who says so, and why. Both required: an unexplained rating is unarguable,
  -- and the whole acknowledgment step assumes the employee can argue.
  rated_by_employee_id uuid NOT NULL REFERENCES workforce_employees(id) ON DELETE RESTRICT,
  source text NOT NULL DEFAULT 'manager'
    CHECK (source IN ('self', 'manager', 'skip_level', 'calibration', 'hr_correction')),
  rationale text NOT NULL CHECK (length(btrim(rationale)) > 0),

  -- Set when this row replaces a previous rating.
  supersedes_rating_id uuid REFERENCES review_ratings(id) ON DELETE SET NULL,
  change_reason text,

  superseded_at timestamptz,
  -- DEFERRABLE because retiring a rating and inserting its replacement is one
  -- act. The old row has to be marked superseded BEFORE the new one is
  -- inserted, or both are briefly live and collide with the partial unique
  -- index below; that means pointing at a row that does not exist yet, which
  -- only a deferred check tolerates.
  superseded_by_rating_id uuid REFERENCES review_ratings(id) ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED,

  created_at timestamptz NOT NULL DEFAULT now(),

  CHECK (rating >= scale_min AND rating <= scale_max),
  CHECK (scale_max > scale_min),
  CHECK (num_nonnulls(competency_id, goal_id) = 1),
  -- Replacing a rating must say why. The first one has its rationale instead.
  CHECK (supersedes_rating_id IS NULL OR length(btrim(COALESCE(change_reason, ''))) > 0)
);

-- A database built before the constraint was made deferrable keeps the old,
-- immediate version, and review_set_rating() would fail on it. Re-runnable.
DO $defer$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'review_ratings_superseded_by_rating_id_fkey'
      AND NOT condeferrable
  ) THEN
    ALTER TABLE review_ratings
      DROP CONSTRAINT review_ratings_superseded_by_rating_id_fkey;
    ALTER TABLE review_ratings
      ADD CONSTRAINT review_ratings_superseded_by_rating_id_fkey
      FOREIGN KEY (superseded_by_rating_id) REFERENCES review_ratings(id)
      ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
  END IF;
END
$defer$;

-- Exactly one live rating per subject. The partial predicate is what lets the
-- superseded ones pile up behind it.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_review_rating_live_competency
  ON review_ratings(review_id, competency_id)
  WHERE superseded_at IS NULL AND competency_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_review_rating_live_goal
  ON review_ratings(review_id, goal_id)
  WHERE superseded_at IS NULL AND goal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_review_ratings_review
  ON review_ratings(review_id, created_at DESC);

-- =============================================================================
-- development_plans / development_actions
-- =============================================================================
--
-- Development sits deliberately AFTER the review in the cycle and is owned by
-- the employee. A development plan a manager writes for somebody is a
-- performance improvement plan, which is a different thing with different
-- consequences, so is_improvement_plan says which one this is rather than
-- letting the distinction blur.
CREATE TABLE IF NOT EXISTS development_plans (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id uuid NOT NULL REFERENCES workforce_employees(id) ON DELETE CASCADE,
  cycle_id uuid REFERENCES performance_cycles(id) ON DELETE SET NULL,
  review_id uuid REFERENCES performance_reviews(id) ON DELETE SET NULL,

  title text NOT NULL DEFAULT 'Development plan',
  summary text NOT NULL DEFAULT '',

  -- The employee's own words about where they want to get to.
  career_aspiration text NOT NULL DEFAULT '',
  -- Competencies this plan is aimed at.
  focus_competency_ids uuid[] NOT NULL DEFAULT '{}',

  is_improvement_plan boolean NOT NULL DEFAULT false,

  starts_on date,
  ends_on date,

  state text NOT NULL DEFAULT 'draft' CHECK (state IN (
    'draft', 'proposed', 'agreed', 'in_progress', 'completed', 'abandoned'
  )),

  manager_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  agreed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS idx_development_plans_employee
  ON development_plans(employee_id, cycle_id);

CREATE TABLE IF NOT EXISTS development_actions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id uuid REFERENCES development_plans(id) ON DELETE CASCADE,
  -- An action can stand alone. Somebody deciding on a Tuesday to learn
  -- something should not have to open a plan first.
  employee_id uuid NOT NULL REFERENCES workforce_employees(id) ON DELETE CASCADE,

  title text NOT NULL CHECK (length(btrim(title)) > 0),
  description text NOT NULL DEFAULT '',

  action_type text NOT NULL DEFAULT 'on_the_job' CHECK (action_type IN (
    'course', 'certification', 'mentoring', 'coaching', 'stretch_assignment',
    'shadowing', 'reading', 'conference', 'on_the_job', 'other'
  )),

  competency_id uuid REFERENCES competencies(id) ON DELETE SET NULL,
  -- Development often IS a goal. Linking rather than duplicating.
  linked_goal_id uuid REFERENCES goals(id) ON DELETE SET NULL,

  target_date date,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'in_progress', 'completed', 'abandoned', 'blocked')),
  progress_note text NOT NULL DEFAULT '',
  completed_on date,

  -- What the company is putting in. Nulls mean nobody has said.
  estimated_cost_tzs bigint,
  estimated_hours numeric(6,2),
  support_needed text,
  support_approved boolean,
  support_approved_by_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_development_actions_employee
  ON development_actions(employee_id, status);

-- =============================================================================
-- Access control
-- =============================================================================
-- Performance records include private feedback, ratings and development plans.
-- Browser roles receive no table privileges or RLS policies; the admin app
-- authorizes the resolved employee in server code and uses service_role.
DO $access$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'competencies', 'performance_cycles', 'goal_periods', 'goals',
    'goal_key_results', 'goal_updates', 'check_ins', 'feedback_requests',
    'feedback_responses', 'performance_reviews', 'review_sections',
    'review_ratings', 'development_plans', 'development_actions'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated',
      table_name
    );
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', table_name);
  END LOOP;
END
$access$;

-- =============================================================================
-- Wiring up the dangling goal references
-- =============================================================================
--
-- tasks.linked_goal_id and tracker_entry_items.linked_goal_id were plain uuids
-- because goals did not exist. Now they do. ON DELETE SET NULL rather than
-- CASCADE: removing a goal must not remove the work done towards it.
DO $wire$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_linked_goal_id_fkey'
  ) THEN
    -- Any id that no longer resolves is cleared first, or the constraint cannot
    -- be added at all.
    UPDATE tasks SET linked_goal_id = NULL
    WHERE linked_goal_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM goals g WHERE g.id = tasks.linked_goal_id);
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_linked_goal_id_fkey
      FOREIGN KEY (linked_goal_id) REFERENCES goals(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tracker_entry_items_linked_goal_id_fkey'
  ) THEN
    UPDATE tracker_entry_items SET linked_goal_id = NULL
    WHERE linked_goal_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM goals g WHERE g.id = tracker_entry_items.linked_goal_id);
    ALTER TABLE tracker_entry_items
      ADD CONSTRAINT tracker_entry_items_linked_goal_id_fkey
      FOREIGN KEY (linked_goal_id) REFERENCES goals(id) ON DELETE SET NULL;
  END IF;
END
$wire$;

-- =============================================================================
-- Seed: a competency library that is not brand-specific
-- =============================================================================
INSERT INTO competencies (code, name, description, category, sort_order, level_descriptors)
VALUES
  ('COMM', 'Communication',
   'Explains work clearly to the person in front of them, in writing and in the room.',
   'core', 10,
   '[{"level":1,"label":"Developing"},{"level":3,"label":"Meets expectations"},{"level":5,"label":"Role model"}]'::jsonb),
  ('OWN', 'Ownership',
   'Takes a piece of work to done without being chased, and says early when it will not land.',
   'core', 20,
   '[{"level":1,"label":"Developing"},{"level":3,"label":"Meets expectations"},{"level":5,"label":"Role model"}]'::jsonb),
  ('CLIENT', 'Client care',
   'Treats a couple or a vendor as somebody with one shot at their day, not a ticket.',
   'values', 30,
   '[{"level":1,"label":"Developing"},{"level":3,"label":"Meets expectations"},{"level":5,"label":"Role model"}]'::jsonb),
  ('CRAFT', 'Craft',
   'Quality of the actual output, judged against what the role is for.',
   'functional', 40,
   '[{"level":1,"label":"Developing"},{"level":3,"label":"Meets expectations"},{"level":5,"label":"Role model"}]'::jsonb),
  ('COLLAB', 'Collaboration',
   'Makes the people around them more effective. Shares context before being asked.',
   'core', 50,
   '[{"level":1,"label":"Developing"},{"level":3,"label":"Meets expectations"},{"level":5,"label":"Role model"}]'::jsonb),
  ('LEAD', 'Leading others',
   'Sets direction, gives feedback that lands, and grows the people reporting to them.',
   'leadership', 60,
   '[{"level":1,"label":"Developing"},{"level":3,"label":"Meets expectations"},{"level":5,"label":"Role model"}]'::jsonb)
ON CONFLICT (code) DO NOTHING;
