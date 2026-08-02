-- Time and Attendance — schema.
--
-- Replaces the flat `workforce_time_punches` log (20260712000004) as the system
-- of record for time worked. That log could answer "are you clocked in" and
-- nothing else: no breaks, no scheduled shift to measure against, no way to
-- correct a mistake without editing the evidence, and a daily summary that
-- could not represent an overnight shift or a second session in one day.
--
-- It is NOT dropped here. It keeps receiving nothing new, the old timesheet
-- views keep reading it, and a later migration can backfill sessions from it.
--
-- THE SHAPE OF THIS MODULE
--
--   Policy      work_schedules -> shift_templates -> employee_shift_assignments
--               holiday_calendars
--   Evidence    attendance_punches        append-only, never edited, never deleted
--   Derived     attendance_sessions       one work session, rebuilt from punches
--               attendance_breaks         one break within a session
--   Repair      attendance_corrections    request + decision + before/after state
--   Payroll     timesheets -> timesheet_entries
--
-- Two rules hold the whole thing together:
--
--   1. Punches are evidence and are immutable. A correction NEVER rewrites a
--      punch. It records what was asked for, who decided, and the resulting
--      adjustment as new rows, so the original record of what the clock
--      actually saw survives an audit.
--
--   2. Session state changes are transactions in the database, not sequences of
--      application writes. Every transition goes through a function in
--      20260802140100_attendance_functions.sql which takes its timestamp from
--      now(). The browser clock is display only; it never reaches a stored
--      value.

-- =============================================================================
-- work_schedules — the policy an employee's time is measured against
-- =============================================================================
CREATE TABLE IF NOT EXISTS work_schedules (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL UNIQUE CHECK (length(btrim(name)) > 0),
  description text,
  -- All of this schedule's clock arithmetic happens in this timezone: which
  -- calendar day a punch belongs to, when a shift was due to start, whether a
  -- date is a weekend. Stored per schedule rather than per employee because a
  -- shift pattern is what has a timezone; a person just works one.
  timezone text NOT NULL DEFAULT 'Africa/Dar_es_Salaam'
    CHECK (length(btrim(timezone)) > 0),

  -- ISO weekdays (Mon=1 … Sun=7) that count as the working week. Anything
  -- outside this set is weekend work: it still pays, and it is flagged so it
  -- can be paid differently.
  working_weekdays smallint[] NOT NULL DEFAULT '{1,2,3,4,5}',

  standard_daily_minutes integer NOT NULL DEFAULT 480
    CHECK (standard_daily_minutes BETWEEN 1 AND 1440),
  standard_weekly_minutes integer NOT NULL DEFAULT 2400
    CHECK (standard_weekly_minutes BETWEEN 1 AND 10080),
  -- Minutes past standard_daily_minutes before overtime accrues. 0 means every
  -- minute over standard counts.
  overtime_daily_threshold_minutes integer NOT NULL DEFAULT 0
    CHECK (overtime_daily_threshold_minutes >= 0),

  -- Grace windows. Arriving inside grace_late_minutes is on time; leaving
  -- inside grace_early_minutes is a full day. Without these, every commute
  -- delay in Dar es Salaam traffic becomes a disciplinary data point.
  grace_late_minutes integer NOT NULL DEFAULT 10 CHECK (grace_late_minutes >= 0),
  grace_early_minutes integer NOT NULL DEFAULT 10 CHECK (grace_early_minutes >= 0),

  -- Breaks that do not reduce payable time (a paid tea break). When false, the
  -- break minutes are subtracted from payable time.
  breaks_are_paid boolean NOT NULL DEFAULT false,

  -- 'off'      — never ask the browser for a position.
  -- 'optional' — record it when the employee allows it; never block a punch.
  -- 'required' — a punch without a position inside the geofence is refused.
  --
  -- 'required' is a real decision with a real cost: a denied browser permission
  -- or a bad GPS fix stops someone clocking in for a shift they are physically
  -- at. Default 'off'; turn it on per schedule, deliberately.
  geolocation_mode text NOT NULL DEFAULT 'off'
    CHECK (geolocation_mode IN ('off', 'optional', 'required')),
  -- Fallback radius when a shift template does not set its own.
  geofence_radius_m integer NOT NULL DEFAULT 250 CHECK (geofence_radius_m > 0),

  -- When true, hours are not payable until the employee submits the period's
  -- timesheet and it is approved.
  requires_timesheet_submission boolean NOT NULL DEFAULT false,
  timesheet_period text NOT NULL DEFAULT 'weekly'
    CHECK (timesheet_period IN ('weekly', 'biweekly', 'monthly')),

  -- Hours after a session's scheduled end (or after it opened, when there is no
  -- schedule) before the nightly job closes it as 'auto_closed'.
  auto_close_after_hours integer NOT NULL DEFAULT 16
    CHECK (auto_close_after_hours BETWEEN 1 AND 72),

  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (array_length(working_weekdays, 1) BETWEEN 1 AND 7)
);

-- Exactly one default schedule. Employees with no assignment fall back to it,
-- so "which schedule applies" always has an answer.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_work_schedules_default
  ON work_schedules ((is_default)) WHERE is_default;

-- =============================================================================
-- shift_templates — a named shift inside a schedule
-- =============================================================================
CREATE TABLE IF NOT EXISTS shift_templates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id uuid NOT NULL REFERENCES work_schedules(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),

  start_time time NOT NULL,
  end_time time NOT NULL,
  -- Generated, not stored by hand: an end at or before the start means the
  -- shift runs past midnight. Every overnight calculation keys off this rather
  -- than re-deriving the comparison at each call site and getting it wrong once.
  crosses_midnight boolean GENERATED ALWAYS AS (end_time <= start_time) STORED,

  unpaid_break_minutes integer NOT NULL DEFAULT 0
    CHECK (unpaid_break_minutes >= 0 AND unpaid_break_minutes < 1440),

  work_mode text NOT NULL DEFAULT 'office'
    CHECK (work_mode IN ('office', 'remote', 'field')),

  -- Geofence anchor. Null latitude/longitude means this shift has no location
  -- to check against, and a schedule set to 'required' will refuse rather than
  -- silently pass — a geofence that cannot be evaluated must not be treated as
  -- a geofence that was satisfied.
  location_label text,
  latitude double precision CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision CHECK (longitude BETWEEN -180 AND 180),
  geofence_radius_m integer CHECK (geofence_radius_m > 0),

  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (schedule_id, name),
  -- A position is a pair. Half of one is a bug, not a partial answer.
  CHECK ((latitude IS NULL) = (longitude IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_shift_templates_schedule
  ON shift_templates (schedule_id) WHERE active;

-- =============================================================================
-- employee_shift_assignments — who works what, effective-dated
-- =============================================================================
-- Two row shapes, distinguished by weekday:
--
--   weekday IS NULL     the employee follows this schedule (and, if a template
--                       is given, that shift on every working day).
--   weekday = 1..7      on that ISO weekday the employee works this template.
--                       Overrides the schedule-level row for that day.
--
-- Effective-dated rather than mutated so last month's timesheet still recomputes
-- against the shift that was actually in force last month.
CREATE TABLE IF NOT EXISTS employee_shift_assignments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id uuid NOT NULL REFERENCES workforce_employees(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES work_schedules(id) ON DELETE CASCADE,
  shift_template_id uuid REFERENCES shift_templates(id) ON DELETE SET NULL,
  weekday smallint CHECK (weekday BETWEEN 1 AND 7),

  -- Per-assignment override of the template's work mode, for the person who
  -- works the standard shift but from home.
  work_mode text CHECK (work_mode IN ('office', 'remote', 'field')),

  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,

  assigned_by uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_employee_shift_assignments_lookup
  ON employee_shift_assignments (employee_id, effective_from DESC);

-- =============================================================================
-- holiday_calendars — public holidays
-- =============================================================================
-- schedule_id NULL means the holiday applies to every schedule. Tanzanian
-- public holidays are national; the per-schedule column exists for the case of
-- a client site that closes on a day the office does not.
CREATE TABLE IF NOT EXISTS holiday_calendars (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id uuid REFERENCES work_schedules(id) ON DELETE CASCADE,
  holiday_date date NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  country_code text NOT NULL DEFAULT 'TZ' CHECK (length(country_code) = 2),
  -- Paid holidays credit the standard day even with no session. Unpaid ones
  -- only mark the date so worked time on it can be flagged.
  is_paid boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- NULLS NOT DISTINCT so a second global entry for the same date collides
-- instead of quietly duplicating. Without it, NULL schedule_id would make every
-- global row unique against every other.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_holiday_calendars_date
  ON holiday_calendars (schedule_id, holiday_date) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_holiday_calendars_date
  ON holiday_calendars (holiday_date);

-- =============================================================================
-- attendance_sessions — one work session
-- =============================================================================
-- A session is DERIVED. It is rebuilt from its punches by
-- attendance_recalculate_session(), so a correction changes a session by adding
-- punches and recalculating, never by hand-editing the numbers.
--
-- STATE. The employee-level state 'off_clock' is deliberately absent from this
-- CHECK: it is not a session, it is the absence of an open one. The application
-- derives it (see lib/attendance/state.ts) so there is no such thing as a
-- stored row claiming to be an employee who is not working.
--
--   clocked_in         open, working
--   on_break           open, on a break
--   clocked_out        closed normally by the employee
--   auto_closed        closed by the nightly job because it was left open
--   pending_correction closed, and a correction request is awaiting a decision
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id uuid NOT NULL REFERENCES workforce_employees(id) ON DELETE CASCADE,

  -- The calendar day this session is attributed to, in the schedule's timezone.
  -- For an overnight shift this is the day it STARTED, so a Monday night shift
  -- ending Tuesday morning is one Monday session rather than two half days.
  business_date date NOT NULL,

  state text NOT NULL DEFAULT 'clocked_in'
    CHECK (state IN ('clocked_in', 'on_break', 'clocked_out', 'auto_closed', 'pending_correction')),

  opened_at timestamptz NOT NULL,
  closed_at timestamptz,

  schedule_id uuid REFERENCES work_schedules(id) ON DELETE SET NULL,
  shift_template_id uuid REFERENCES shift_templates(id) ON DELETE SET NULL,
  -- Resolved at clock-in from the template and business_date, with the
  -- crosses_midnight day carried. Snapshotted rather than recomputed so a later
  -- edit to the template cannot retroactively make someone late.
  scheduled_start timestamptz,
  scheduled_end timestamptz,

  work_mode text NOT NULL DEFAULT 'office'
    CHECK (work_mode IN ('office', 'remote', 'field')),
  location_label text,

  -- Derived totals, all in minutes. Rewritten wholesale by
  -- attendance_recalculate_session().
  worked_minutes integer NOT NULL DEFAULT 0 CHECK (worked_minutes >= 0),
  break_minutes integer NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
  payable_minutes integer NOT NULL DEFAULT 0 CHECK (payable_minutes >= 0),
  overtime_minutes integer NOT NULL DEFAULT 0 CHECK (overtime_minutes >= 0),

  is_late boolean NOT NULL DEFAULT false,
  late_minutes integer NOT NULL DEFAULT 0 CHECK (late_minutes >= 0),
  is_early_departure boolean NOT NULL DEFAULT false,
  early_departure_minutes integer NOT NULL DEFAULT 0 CHECK (early_departure_minutes >= 0),

  -- Flagged by the nightly detector, not by the employee.
  missing_clock_out boolean NOT NULL DEFAULT false,
  auto_closed_at timestamptz,

  is_weekend boolean NOT NULL DEFAULT false,
  is_holiday boolean NOT NULL DEFAULT false,

  -- True while any correction against this session is pending. Kept as a column
  -- so the timesheet can refuse to lock a period with unresolved disputes.
  correction_pending boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (closed_at IS NULL OR closed_at >= opened_at),
  -- Open states have no close time; closed states must have one.
  CHECK (
    (state IN ('clocked_in', 'on_break') AND closed_at IS NULL)
    OR
    (state IN ('clocked_out', 'auto_closed', 'pending_correction') AND closed_at IS NOT NULL)
  )
);

-- THE CONCURRENCY GUARANTEE.
--
-- At most one open session per employee, enforced by the database. Two
-- simultaneous clock-ins (a double-tap, two tabs, a retried request) cannot
-- both succeed: the second gets 23505 and the transition function turns that
-- into 'attendance.already_clocked_in'. Application-level "check then insert"
-- would race; this cannot.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_attendance_open_session
  ON attendance_sessions (employee_id)
  WHERE state IN ('clocked_in', 'on_break');

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_employee_date
  ON attendance_sessions (employee_id, business_date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_open
  ON attendance_sessions (opened_at) WHERE state IN ('clocked_in', 'on_break');

-- =============================================================================
-- attendance_punches — the evidence, append-only
-- =============================================================================
-- Every stored punch time comes from now() inside a transition function. There
-- is no code path that writes a client-supplied timestamp, which is what makes
-- this table evidence rather than testimony.
CREATE TABLE IF NOT EXISTS attendance_punches (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id uuid NOT NULL REFERENCES workforce_employees(id) ON DELETE CASCADE,
  -- Nullable so a punch can survive a session being rebuilt, and so an
  -- unmatched punch is still recorded rather than discarded.
  session_id uuid REFERENCES attendance_sessions(id) ON DELETE SET NULL,

  punch_type text NOT NULL
    CHECK (punch_type IN ('in', 'out', 'break_start', 'break_end')),
  punched_at timestamptz NOT NULL DEFAULT now(),

  source text NOT NULL DEFAULT 'web'
    CHECK (source IN ('web', 'kiosk', 'mobile', 'admin_manual', 'auto_close', 'correction')),

  ip_address inet,
  user_agent text,
  latitude double precision CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision CHECK (longitude BETWEEN -180 AND 180),
  accuracy_m double precision CHECK (accuracy_m >= 0),
  -- NULL means no geofence was evaluated (mode 'off', or no anchor). Never
  -- conflate that with true.
  geofence_ok boolean,
  distance_m double precision,
  location_label text,
  note text,

  -- Who caused it. Differs from employee_id when People Ops punches on
  -- someone's behalf or a correction is applied.
  actor_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  actor_clerk_id text,
  -- Set when this punch exists because a correction was approved. The original
  -- punch it corrects is never touched.
  correction_id uuid,

  created_at timestamptz NOT NULL DEFAULT now(),

  CHECK ((latitude IS NULL) = (longitude IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_attendance_punches_employee_at
  ON attendance_punches (employee_id, punched_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_punches_session
  ON attendance_punches (session_id, punched_at);

-- Append-only, enforced by the database. An employee cannot modify an original
-- attendance record, and neither can an admin, and neither can a bug: the only
-- way to change what a session says is to add a punch and recalculate.
CREATE OR REPLACE FUNCTION public.attendance_punches_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- session_id is the one exception: recalculation re-links punches to a
  -- rebuilt session. Nothing about what was observed may change.
  IF TG_OP = 'UPDATE'
     AND NEW.id = OLD.id
     AND NEW.employee_id = OLD.employee_id
     AND NEW.punch_type = OLD.punch_type
     AND NEW.punched_at = OLD.punched_at
     AND NEW.source = OLD.source
     AND NEW.latitude IS NOT DISTINCT FROM OLD.latitude
     AND NEW.longitude IS NOT DISTINCT FROM OLD.longitude
     AND NEW.actor_clerk_id IS NOT DISTINCT FROM OLD.actor_clerk_id
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'attendance_punches is append-only (attempted % on %)', TG_OP, OLD.id
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_punches_append_only ON attendance_punches;
CREATE TRIGGER trg_attendance_punches_append_only
  BEFORE UPDATE OR DELETE ON attendance_punches
  FOR EACH ROW EXECUTE FUNCTION public.attendance_punches_append_only();

-- =============================================================================
-- attendance_breaks — one break within a session
-- =============================================================================
CREATE TABLE IF NOT EXISTS attendance_breaks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id uuid NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  break_type text NOT NULL DEFAULT 'rest'
    CHECK (break_type IN ('rest', 'meal', 'personal', 'other')),
  is_paid boolean NOT NULL DEFAULT false,
  start_punch_id uuid REFERENCES attendance_punches(id) ON DELETE SET NULL,
  end_punch_id uuid REFERENCES attendance_punches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

-- One open break per session. Same reasoning as the open-session index: two
-- concurrent "start break" calls cannot both win.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_attendance_open_break
  ON attendance_breaks (session_id) WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_breaks_session
  ON attendance_breaks (session_id, started_at);

-- =============================================================================
-- attendance_corrections — request, decision and adjustment, kept apart
-- =============================================================================
-- The three are separate columns on purpose. Collapsing them into one edited
-- record is what makes an attendance system unauditable: you can no longer tell
-- what the clock saw, what the employee claimed, and what a manager allowed.
CREATE TABLE IF NOT EXISTS attendance_corrections (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id uuid NOT NULL REFERENCES workforce_employees(id) ON DELETE CASCADE,
  session_id uuid REFERENCES attendance_sessions(id) ON DELETE SET NULL,
  business_date date NOT NULL,

  kind text NOT NULL CHECK (kind IN (
    'missing_clock_in', 'missing_clock_out', 'wrong_clock_in', 'wrong_clock_out',
    'missing_break', 'wrong_break', 'whole_day', 'other'
  )),

  -- ---- The request ----
  requested_by_employee_id uuid NOT NULL
    REFERENCES workforce_employees(id) ON DELETE CASCADE,
  request_reason text NOT NULL CHECK (length(btrim(request_reason)) > 0),
  -- What the employee is asking for: { clock_in_at, clock_out_at, break_minutes }.
  -- These are CLAIMS. They are not applied until a decision approves them, and
  -- applying them adds punches with source='correction' rather than editing any.
  requested_changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_at timestamptz NOT NULL DEFAULT now(),

  -- ---- The decision ----
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  decided_by_clerk_id text,
  decision_note text,
  decided_at timestamptz,

  -- ---- The adjustment ----
  -- Snapshots taken at the moment the correction is applied. This is the
  -- "before-state and after-state" an override has to record: not a diff
  -- computed later from rows that have since changed again.
  before_state jsonb,
  after_state jsonb,
  applied_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (status = 'pending' OR decided_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_attendance_corrections_employee
  ON attendance_corrections (employee_id, business_date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_corrections_pending
  ON attendance_corrections (status, requested_at) WHERE status = 'pending';

-- One open request per session, so an employee cannot queue five contradictory
-- claims against the same day and have a manager approve two of them.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_attendance_correction_open
  ON attendance_corrections (employee_id, business_date, session_id)
  NULLS NOT DISTINCT
  WHERE status = 'pending';

ALTER TABLE attendance_punches
  DROP CONSTRAINT IF EXISTS attendance_punches_correction_id_fkey;
ALTER TABLE attendance_punches
  ADD CONSTRAINT attendance_punches_correction_id_fkey
  FOREIGN KEY (correction_id) REFERENCES attendance_corrections(id) ON DELETE SET NULL;

-- =============================================================================
-- timesheets / timesheet_entries — the payroll surface
-- =============================================================================
CREATE TABLE IF NOT EXISTS timesheets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id uuid NOT NULL REFERENCES workforce_employees(id) ON DELETE CASCADE,
  schedule_id uuid REFERENCES work_schedules(id) ON DELETE SET NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,

  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'submitted', 'approved', 'rejected', 'locked')),

  total_worked_minutes integer NOT NULL DEFAULT 0 CHECK (total_worked_minutes >= 0),
  total_break_minutes integer NOT NULL DEFAULT 0 CHECK (total_break_minutes >= 0),
  total_payable_minutes integer NOT NULL DEFAULT 0 CHECK (total_payable_minutes >= 0),
  total_overtime_minutes integer NOT NULL DEFAULT 0 CHECK (total_overtime_minutes >= 0),

  submitted_at timestamptz,
  decided_by_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (employee_id, period_start),
  CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_timesheets_employee_period
  ON timesheets (employee_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_timesheets_status
  ON timesheets (status, period_start DESC);

-- One row per day per session, so a day with two sessions has two entries and
-- the total is still the sum of what happened rather than a flattened guess.
CREATE TABLE IF NOT EXISTS timesheet_entries (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  timesheet_id uuid NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
  session_id uuid REFERENCES attendance_sessions(id) ON DELETE SET NULL,
  business_date date NOT NULL,

  worked_minutes integer NOT NULL DEFAULT 0 CHECK (worked_minutes >= 0),
  break_minutes integer NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
  payable_minutes integer NOT NULL DEFAULT 0 CHECK (payable_minutes >= 0),
  overtime_minutes integer NOT NULL DEFAULT 0 CHECK (overtime_minutes >= 0),

  is_weekend boolean NOT NULL DEFAULT false,
  is_holiday boolean NOT NULL DEFAULT false,
  is_late boolean NOT NULL DEFAULT false,
  late_minutes integer NOT NULL DEFAULT 0 CHECK (late_minutes >= 0),
  is_early_departure boolean NOT NULL DEFAULT false,
  early_departure_minutes integer NOT NULL DEFAULT 0 CHECK (early_departure_minutes >= 0),

  source text NOT NULL DEFAULT 'session'
    CHECK (source IN ('session', 'holiday_credit', 'correction', 'manual')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_timesheet_entries_row
  ON timesheet_entries (timesheet_id, business_date, session_id) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_timesheet
  ON timesheet_entries (timesheet_id, business_date);

-- =============================================================================
-- updated_at maintenance
-- =============================================================================
CREATE OR REPLACE FUNCTION public.attendance_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.attendance_touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.attendance_punches_append_only() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'work_schedules', 'shift_templates', 'employee_shift_assignments',
    'attendance_sessions', 'attendance_corrections', 'timesheets'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.attendance_touch_updated_at()',
      t, t
    );
  END LOOP;
END
$$;

-- =============================================================================
-- Access control
-- =============================================================================
-- RLS on, no policies: PostgREST denies every authenticated role and the admin
-- app's service-role client bypasses RLS. Attendance authorization lives in
-- server code, where the employee has already been resolved from the session
-- (lib/workspace/guards.ts). Payroll-relevant rows are not something to expose
-- on a client-side policy and hope the policy is right.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'work_schedules', 'shift_templates', 'employee_shift_assignments',
    'holiday_calendars', 'attendance_sessions', 'attendance_punches',
    'attendance_breaks', 'attendance_corrections', 'timesheets', 'timesheet_entries'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END
$$;

COMMENT ON TABLE attendance_punches IS
  'Append-only attendance evidence. Every punched_at comes from now() inside a transition function; no client timestamp is ever stored. SERVICE ROLE ONLY. Corrections add punches with source=correction and never edit these rows.';
COMMENT ON TABLE attendance_sessions IS
  'One work session, DERIVED from attendance_punches by attendance_recalculate_session(). At most one open session per employee, enforced by uniq_attendance_open_session. SERVICE ROLE ONLY.';
COMMENT ON TABLE attendance_corrections IS
  'Attendance repair: request, decision and resulting adjustment stored separately, with before_state/after_state snapshotted at apply time. SERVICE ROLE ONLY.';

-- =============================================================================
-- Default schedule
-- =============================================================================
-- Without a default there is no answer to "which policy applies to this
-- employee", and the first clock-in of a new hire fails. Seeded to OpusFesta's
-- actual working week: Monday to Friday, 08:00 to 17:00 EAT, one unpaid hour.
INSERT INTO work_schedules (name, description, timezone, working_weekdays, is_default)
VALUES (
  'OpusFesta standard',
  'Monday to Friday, 08:00 to 17:00 East Africa Time, one unpaid lunch hour.',
  'Africa/Dar_es_Salaam',
  '{1,2,3,4,5}',
  true
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO shift_templates (schedule_id, name, start_time, end_time, unpaid_break_minutes, work_mode)
SELECT id, 'Standard day', '08:00', '17:00', 60, 'office'
FROM work_schedules WHERE name = 'OpusFesta standard'
ON CONFLICT (schedule_id, name) DO NOTHING;

NOTIFY pgrst, 'reload schema';
