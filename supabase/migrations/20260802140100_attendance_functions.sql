-- Time and Attendance — transitions, recalculation, corrections, background jobs.
--
-- WHY THE LOGIC IS IN THE DATABASE
--
-- Two of this module's guarantees cannot be made anywhere else:
--
--   Server time is authoritative. Every stored punch time is now(), evaluated
--   inside the transaction. There is no parameter through which a caller can
--   supply a timestamp for a live punch, so a wrong browser clock, a replayed
--   request and a doctored payload all produce the same correct time.
--
--   Duplicate clock-ins are transactionally prevented. Reading the state and
--   then inserting is a race no amount of application care closes: two requests
--   both read 'off_clock' and both insert. Here the partial unique index
--   uniq_attendance_open_session decides it, one INSERT gets 23505, and the
--   function turns that into the same refusal the caller would have got from a
--   clean serial run.
--
-- ERROR CONTRACT
--
-- Failures raise ERRCODE 'P0001' with a stable dotted token as the message
-- ('attendance.already_clocked_in'). The application maps known tokens to text
-- it wrote itself and collapses everything else to a generic message, so no
-- database string is ever rendered. See lib/attendance/errors.ts.
--
-- All functions are SECURITY DEFINER and revoked from PUBLIC/anon/authenticated:
-- they bypass RLS by design, and PostgREST would otherwise expose the whole
-- module as an unauthenticated RPC surface. Authorization happens in server
-- code, above these, where the employee has been resolved from the Clerk
-- session.

-- =============================================================================
-- Helpers
-- =============================================================================

-- The calendar day a moment belongs to, in a schedule's timezone.
CREATE OR REPLACE FUNCTION public.attendance_business_date(
  p_at timestamptz,
  p_timezone text
)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p_at AT TIME ZONE p_timezone)::date;
$$;

-- Great-circle distance in metres. Used for geofence checks, where the
-- distances are small enough that the spherical approximation is far more
-- precise than consumer GPS.
CREATE OR REPLACE FUNCTION public.attendance_distance_m(
  p_lat_a double precision, p_lng_a double precision,
  p_lat_b double precision, p_lng_b double precision
)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 6371000 * 2 * asin(sqrt(
    power(sin(radians(p_lat_b - p_lat_a) / 2), 2) +
    cos(radians(p_lat_a)) * cos(radians(p_lat_b)) *
    power(sin(radians(p_lng_b - p_lng_a) / 2), 2)
  ));
$$;

-- Resolve which schedule and shift template govern an employee on a date.
--
-- Precedence, most specific first:
--   1. An assignment for that exact ISO weekday, in force on that date.
--   2. A schedule-level assignment (weekday IS NULL) in force on that date.
--   3. The default schedule, with no template.
--
-- Returning the default rather than nothing matters: a new hire with no
-- assignment must still be able to clock in on their first morning.
CREATE OR REPLACE FUNCTION public.attendance_resolve_schedule(
  p_employee_id uuid,
  p_date date
)
RETURNS TABLE (
  schedule_id uuid,
  shift_template_id uuid,
  work_mode text
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH ranked AS (
    SELECT
      a.schedule_id,
      a.shift_template_id,
      COALESCE(a.work_mode, t.work_mode, 'office') AS work_mode,
      -- Weekday-specific assignments outrank schedule-level ones; among equals
      -- the most recently effective wins.
      CASE WHEN a.weekday IS NOT NULL THEN 0 ELSE 1 END AS specificity,
      a.effective_from
    FROM employee_shift_assignments a
    LEFT JOIN shift_templates t ON t.id = a.shift_template_id
    WHERE a.employee_id = p_employee_id
      AND a.effective_from <= p_date
      AND (a.effective_to IS NULL OR a.effective_to >= p_date)
      AND (a.weekday IS NULL OR a.weekday = EXTRACT(ISODOW FROM p_date)::smallint)
    ORDER BY specificity, a.effective_from DESC
    LIMIT 1
  )
  SELECT r.schedule_id, r.shift_template_id, r.work_mode FROM ranked r
  UNION ALL
  SELECT s.id, NULL::uuid, 'office'
  FROM work_schedules s
  WHERE s.is_default AND s.active AND NOT EXISTS (SELECT 1 FROM ranked)
  LIMIT 1;
$$;

-- Is this date a public holiday for this schedule?
CREATE OR REPLACE FUNCTION public.attendance_is_holiday(
  p_schedule_id uuid,
  p_date date
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM holiday_calendars h
    WHERE h.holiday_date = p_date
      AND (h.schedule_id IS NULL OR h.schedule_id = p_schedule_id)
  );
$$;

-- =============================================================================
-- attendance_recalculate_session — the single place session totals are derived
-- =============================================================================
-- Rewrites every derived number on a session from its punches and breaks.
-- Called after each transition and after a correction is applied, so there is
-- exactly one implementation of "how many minutes is this worth" and a
-- correction cannot produce a total that a fresh clock-in would not.
CREATE OR REPLACE FUNCTION public.attendance_recalculate_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  s              attendance_sessions%ROWTYPE;
  sched          work_schedules%ROWTYPE;
  v_break_min    integer := 0;
  v_paid_break   integer := 0;
  v_gross_min    integer := 0;
  v_worked_min   integer := 0;
  v_payable_min  integer := 0;
  v_overtime_min integer := 0;
  v_standard     integer := 480;
  v_threshold    integer := 0;
  v_late         integer := 0;
  v_early        integer := 0;
  v_end          timestamptz;
  v_is_weekend   boolean := false;
  v_is_holiday   boolean := false;
BEGIN
  SELECT * INTO s FROM attendance_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO sched FROM work_schedules WHERE id = s.schedule_id;
  IF FOUND THEN
    v_standard  := sched.standard_daily_minutes;
    v_threshold := sched.overtime_daily_threshold_minutes;
  END IF;

  -- An open session is measured to now, so the live counter on Workspace Home
  -- is the same arithmetic as the closed one rather than a second
  -- implementation that drifts.
  v_end := COALESCE(s.closed_at, now());

  -- Completed breaks only. An open break is time not yet accounted for, and
  -- guessing its length would understate payable time for someone still on it.
  SELECT
    COALESCE(SUM(EXTRACT(EPOCH FROM (b.ended_at - b.started_at)) / 60)::integer, 0),
    COALESCE(SUM(CASE WHEN b.is_paid
                 THEN EXTRACT(EPOCH FROM (b.ended_at - b.started_at)) / 60
                 ELSE 0 END)::integer, 0)
    INTO v_break_min, v_paid_break
  FROM attendance_breaks b
  WHERE b.session_id = p_session_id AND b.ended_at IS NOT NULL;

  v_gross_min  := GREATEST(0, (EXTRACT(EPOCH FROM (v_end - s.opened_at)) / 60)::integer);
  v_worked_min := GREATEST(0, v_gross_min - v_break_min);

  -- Payable time. Paid breaks are added back; unpaid ones stay deducted.
  --
  -- NOTE: shift_templates.unpaid_break_minutes is deliberately NOT deducted
  -- here. Auto-deducting a lunch the employee may have worked through is a
  -- silent pay cut, and it is the single most common way an attendance system
  -- quietly steals time. That column describes the EXPECTED shift, and is used
  -- for scheduled-hours display only. If someone took a break, they punched it.
  v_payable_min := v_worked_min + CASE WHEN COALESCE(sched.breaks_are_paid, false)
                                       THEN v_break_min ELSE v_paid_break END;

  v_is_weekend := sched.id IS NOT NULL
    AND NOT (EXTRACT(ISODOW FROM s.business_date)::smallint = ANY (sched.working_weekdays));
  v_is_holiday := attendance_is_holiday(s.schedule_id, s.business_date);

  -- Overtime. On a weekend or public holiday every payable minute is overtime:
  -- the employee was not scheduled to be there at all. On a working day only
  -- the minutes past standard (plus any threshold) count.
  IF v_is_weekend OR v_is_holiday THEN
    v_overtime_min := v_payable_min;
  ELSIF v_payable_min > v_standard + v_threshold THEN
    v_overtime_min := v_payable_min - v_standard;
  ELSE
    v_overtime_min := 0;
  END IF;

  -- Late and early, measured against the snapshotted scheduled window so a
  -- later edit to the shift template cannot retroactively make someone late.
  IF s.scheduled_start IS NOT NULL THEN
    v_late := GREATEST(
      0,
      (EXTRACT(EPOCH FROM (s.opened_at - s.scheduled_start)) / 60)::integer
        - COALESCE(sched.grace_late_minutes, 0)
    );
    -- Report the true lateness, not the post-grace remainder: grace decides
    -- WHETHER someone is late, not by how much.
    IF v_late > 0 THEN
      v_late := (EXTRACT(EPOCH FROM (s.opened_at - s.scheduled_start)) / 60)::integer;
    END IF;
  END IF;

  -- Early departure only applies to a session that actually ended. An
  -- auto-closed session is a missing clock-out, which is a different problem
  -- and is flagged as one rather than being recorded as leaving early.
  IF s.scheduled_end IS NOT NULL AND s.closed_at IS NOT NULL AND s.state = 'clocked_out' THEN
    v_early := GREATEST(
      0,
      (EXTRACT(EPOCH FROM (s.scheduled_end - s.closed_at)) / 60)::integer
        - COALESCE(sched.grace_early_minutes, 0)
    );
    IF v_early > 0 THEN
      v_early := (EXTRACT(EPOCH FROM (s.scheduled_end - s.closed_at)) / 60)::integer;
    END IF;
  END IF;

  UPDATE attendance_sessions
     SET worked_minutes          = v_worked_min,
         break_minutes           = v_break_min,
         payable_minutes         = v_payable_min,
         overtime_minutes        = v_overtime_min,
         is_late                 = v_late > 0,
         late_minutes            = v_late,
         is_early_departure      = v_early > 0,
         early_departure_minutes = v_early,
         is_weekend              = v_is_weekend,
         is_holiday              = v_is_holiday
   WHERE id = p_session_id;
END;
$$;

-- =============================================================================
-- attendance_clock_in
-- =============================================================================
CREATE OR REPLACE FUNCTION public.attendance_clock_in(
  p_employee_id uuid,
  p_source text DEFAULT 'web',
  p_ip inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_accuracy_m double precision DEFAULT NULL,
  p_actor_clerk_id text DEFAULT NULL,
  p_actor_employee_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now         timestamptz := now();   -- the ONLY source of punch time
  v_sched_id    uuid;
  v_tpl_id      uuid;
  v_work_mode   text;
  sched         work_schedules%ROWTYPE;
  tpl           shift_templates%ROWTYPE;
  v_tz          text := 'Africa/Dar_es_Salaam';
  v_bdate       date;
  v_prev_date   date;
  v_sched_start timestamptz;
  v_sched_end   timestamptz;
  v_radius      integer;
  v_distance    double precision;
  v_geo_ok      boolean;
  v_session_id  uuid;
  v_punch_id    uuid;
BEGIN
  -- Resolve policy against the provisional local date first, so we know the
  -- timezone before we decide which day this punch belongs to.
  SELECT r.schedule_id, r.shift_template_id, r.work_mode
    INTO v_sched_id, v_tpl_id, v_work_mode
  FROM attendance_resolve_schedule(p_employee_id, (v_now AT TIME ZONE v_tz)::date) r;

  IF v_sched_id IS NULL THEN
    RAISE EXCEPTION 'attendance.no_schedule' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO sched FROM work_schedules WHERE id = v_sched_id;
  v_tz := sched.timezone;
  v_bdate := attendance_business_date(v_now, v_tz);

  -- OVERNIGHT ATTRIBUTION.
  -- Someone clocking in at 00:30 for a shift that began at 22:00 is starting
  -- YESTERDAY's shift. If the previous day's template crosses midnight and we
  -- are still inside its window, attribute the session to that day; otherwise a
  -- night worker's single shift would be split across two business dates and
  -- both days would look half-worked.
  v_prev_date := v_bdate - 1;
  IF EXISTS (
    SELECT 1
    FROM attendance_resolve_schedule(p_employee_id, v_prev_date) pr
    JOIN shift_templates pt ON pt.id = pr.shift_template_id
    WHERE pt.crosses_midnight
      AND v_now < ((v_prev_date + 1 + pt.end_time) AT TIME ZONE sched.timezone)
      AND v_now >= ((v_prev_date + pt.start_time) AT TIME ZONE sched.timezone)
  ) THEN
    v_bdate := v_prev_date;
    SELECT r.schedule_id, r.shift_template_id, r.work_mode
      INTO v_sched_id, v_tpl_id, v_work_mode
    FROM attendance_resolve_schedule(p_employee_id, v_bdate) r;
  END IF;

  IF v_tpl_id IS NOT NULL THEN
    SELECT * INTO tpl FROM shift_templates WHERE id = v_tpl_id;
    v_sched_start := (v_bdate + tpl.start_time) AT TIME ZONE v_tz;
    v_sched_end := (v_bdate + tpl.end_time
                    + CASE WHEN tpl.crosses_midnight THEN interval '1 day'
                           ELSE interval '0' END) AT TIME ZONE v_tz;
  END IF;

  -- GEOFENCE.
  -- 'required' refuses a punch it cannot verify. A missing position, or a shift
  -- with no anchor to compare against, is NOT treated as a pass: an
  -- unevaluatable geofence that silently succeeds is not a geofence.
  IF sched.geolocation_mode = 'required' THEN
    IF p_latitude IS NULL OR p_longitude IS NULL THEN
      RAISE EXCEPTION 'attendance.location_required' USING ERRCODE = 'P0001';
    END IF;
    IF tpl.id IS NULL OR tpl.latitude IS NULL THEN
      RAISE EXCEPTION 'attendance.geofence_unavailable' USING ERRCODE = 'P0001';
    END IF;
    v_radius := COALESCE(tpl.geofence_radius_m, sched.geofence_radius_m);
    v_distance := attendance_distance_m(p_latitude, p_longitude, tpl.latitude, tpl.longitude);
    v_geo_ok := v_distance <= v_radius;
    IF NOT v_geo_ok THEN
      RAISE EXCEPTION 'attendance.outside_geofence' USING ERRCODE = 'P0001';
    END IF;
  ELSIF sched.geolocation_mode = 'optional'
        AND p_latitude IS NOT NULL AND tpl.latitude IS NOT NULL THEN
    -- Recorded for the audit trail, never used to block.
    v_radius := COALESCE(tpl.geofence_radius_m, sched.geofence_radius_m);
    v_distance := attendance_distance_m(p_latitude, p_longitude, tpl.latitude, tpl.longitude);
    v_geo_ok := v_distance <= v_radius;
  END IF;

  -- THE TRANSITION. off_clock -> clocked_in.
  -- No SELECT-then-INSERT: the partial unique index is the check. A second
  -- concurrent clock-in raises 23505 here and is caught below.
  BEGIN
    INSERT INTO attendance_sessions (
      employee_id, business_date, state, opened_at,
      schedule_id, shift_template_id, scheduled_start, scheduled_end,
      work_mode, location_label
    ) VALUES (
      p_employee_id, v_bdate, 'clocked_in', v_now,
      v_sched_id, v_tpl_id, v_sched_start, v_sched_end,
      COALESCE(v_work_mode, 'office'), tpl.location_label
    )
    RETURNING id INTO v_session_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'attendance.already_clocked_in' USING ERRCODE = 'P0001';
  END;

  INSERT INTO attendance_punches (
    employee_id, session_id, punch_type, punched_at, source,
    ip_address, user_agent, latitude, longitude, accuracy_m,
    geofence_ok, distance_m, location_label, actor_employee_id, actor_clerk_id
  ) VALUES (
    p_employee_id, v_session_id, 'in', v_now, p_source,
    p_ip, left(p_user_agent, 500), p_latitude, p_longitude, p_accuracy_m,
    v_geo_ok, v_distance, tpl.location_label,
    COALESCE(p_actor_employee_id, p_employee_id), p_actor_clerk_id
  )
  RETURNING id INTO v_punch_id;

  PERFORM attendance_recalculate_session(v_session_id);
  RETURN v_session_id;
END;
$$;

-- =============================================================================
-- attendance_start_break
-- =============================================================================
CREATE OR REPLACE FUNCTION public.attendance_start_break(
  p_employee_id uuid,
  p_break_type text DEFAULT 'rest',
  p_source text DEFAULT 'web',
  p_actor_clerk_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now      timestamptz := now();
  v_session  attendance_sessions%ROWTYPE;
  v_paid     boolean := false;
  v_punch_id uuid;
  v_break_id uuid;
BEGIN
  -- FOR UPDATE serialises concurrent transitions on the same session, so
  -- "start break" twice cannot both read 'clocked_in'.
  SELECT * INTO v_session
  FROM attendance_sessions
  WHERE employee_id = p_employee_id AND state IN ('clocked_in', 'on_break')
  FOR UPDATE;

  IF NOT FOUND THEN
    -- off_clock -> start_break is not a transition.
    RAISE EXCEPTION 'attendance.not_clocked_in' USING ERRCODE = 'P0001';
  END IF;
  IF v_session.state = 'on_break' THEN
    RAISE EXCEPTION 'attendance.already_on_break' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(breaks_are_paid, false) INTO v_paid
  FROM work_schedules WHERE id = v_session.schedule_id;

  INSERT INTO attendance_punches (
    employee_id, session_id, punch_type, punched_at, source,
    actor_employee_id, actor_clerk_id
  ) VALUES (
    p_employee_id, v_session.id, 'break_start', v_now, p_source,
    p_employee_id, p_actor_clerk_id
  )
  RETURNING id INTO v_punch_id;

  BEGIN
    INSERT INTO attendance_breaks (session_id, started_at, break_type, is_paid, start_punch_id)
    VALUES (v_session.id, v_now, p_break_type, COALESCE(v_paid, false), v_punch_id)
    RETURNING id INTO v_break_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'attendance.already_on_break' USING ERRCODE = 'P0001';
  END;

  UPDATE attendance_sessions SET state = 'on_break' WHERE id = v_session.id;
  PERFORM attendance_recalculate_session(v_session.id);
  RETURN v_break_id;
END;
$$;

-- =============================================================================
-- attendance_end_break
-- =============================================================================
CREATE OR REPLACE FUNCTION public.attendance_end_break(
  p_employee_id uuid,
  p_source text DEFAULT 'web',
  p_actor_clerk_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now      timestamptz := now();
  v_session  attendance_sessions%ROWTYPE;
  v_break_id uuid;
  v_punch_id uuid;
BEGIN
  SELECT * INTO v_session
  FROM attendance_sessions
  WHERE employee_id = p_employee_id AND state IN ('clocked_in', 'on_break')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attendance.not_clocked_in' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_break_id
  FROM attendance_breaks
  WHERE session_id = v_session.id AND ended_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attendance.not_on_break' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO attendance_punches (
    employee_id, session_id, punch_type, punched_at, source,
    actor_employee_id, actor_clerk_id
  ) VALUES (
    p_employee_id, v_session.id, 'break_end', v_now, p_source,
    p_employee_id, p_actor_clerk_id
  )
  RETURNING id INTO v_punch_id;

  UPDATE attendance_breaks
     SET ended_at = v_now, end_punch_id = v_punch_id
   WHERE id = v_break_id;

  UPDATE attendance_sessions SET state = 'clocked_in' WHERE id = v_session.id;
  PERFORM attendance_recalculate_session(v_session.id);
  RETURN v_break_id;
END;
$$;

-- =============================================================================
-- attendance_clock_out
-- =============================================================================
CREATE OR REPLACE FUNCTION public.attendance_clock_out(
  p_employee_id uuid,
  p_source text DEFAULT 'web',
  p_ip inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_accuracy_m double precision DEFAULT NULL,
  p_actor_clerk_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now     timestamptz := now();
  v_session attendance_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session
  FROM attendance_sessions
  WHERE employee_id = p_employee_id AND state IN ('clocked_in', 'on_break')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attendance.not_clocked_in' USING ERRCODE = 'P0001';
  END IF;

  -- An open break is closed by clocking out rather than refusing. Someone who
  -- forgot to end their break should not be trapped on the clock; the break is
  -- closed at the same instant, which costs them nothing and keeps the session
  -- arithmetic consistent.
  UPDATE attendance_breaks
     SET ended_at = v_now
   WHERE session_id = v_session.id AND ended_at IS NULL;

  INSERT INTO attendance_punches (
    employee_id, session_id, punch_type, punched_at, source,
    ip_address, user_agent, latitude, longitude, accuracy_m,
    actor_employee_id, actor_clerk_id
  ) VALUES (
    p_employee_id, v_session.id, 'out', v_now, p_source,
    p_ip, left(p_user_agent, 500), p_latitude, p_longitude, p_accuracy_m,
    p_employee_id, p_actor_clerk_id
  );

  UPDATE attendance_sessions
     SET state = 'clocked_out', closed_at = v_now
   WHERE id = v_session.id;

  PERFORM attendance_recalculate_session(v_session.id);
  RETURN v_session.id;
END;
$$;

-- =============================================================================
-- attendance_auto_close_stale_sessions — background job
-- =============================================================================
-- Closes sessions left open past their schedule's auto_close_after_hours.
--
-- The close time is the scheduled end where one exists, NOT now(): crediting
-- someone until 3am because they forgot to clock out would inflate payroll, and
-- crediting them to their scheduled end is the defensible neutral choice. The
-- session is marked 'auto_closed' and missing_clock_out, which is what puts it
-- in front of the employee to correct.
CREATE OR REPLACE FUNCTION public.attendance_auto_close_stale_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r        record;
  v_close  timestamptz;
  v_count  integer := 0;
BEGIN
  FOR r IN
    SELECT s.*, COALESCE(sc.auto_close_after_hours, 16) AS cutoff_hours
    FROM attendance_sessions s
    LEFT JOIN work_schedules sc ON sc.id = s.schedule_id
    WHERE s.state IN ('clocked_in', 'on_break')
      AND now() > COALESCE(s.scheduled_end, s.opened_at)
                  + make_interval(hours => COALESCE(sc.auto_close_after_hours, 16))
    FOR UPDATE OF s SKIP LOCKED
  LOOP
    v_close := COALESCE(r.scheduled_end, r.opened_at);

    UPDATE attendance_breaks
       SET ended_at = LEAST(v_close, now())
     WHERE session_id = r.id AND ended_at IS NULL;

    INSERT INTO attendance_punches (
      employee_id, session_id, punch_type, punched_at, source, note, actor_employee_id
    ) VALUES (
      r.employee_id, r.id, 'out', v_close, 'auto_close',
      'Session left open; closed automatically at the scheduled end.', NULL
    );

    UPDATE attendance_sessions
       SET state = 'auto_closed',
           closed_at = v_close,
           missing_clock_out = true,
           auto_closed_at = now()
     WHERE id = r.id;

    PERFORM attendance_recalculate_session(r.id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- =============================================================================
-- attendance_detect_missing_punches — background job
-- =============================================================================
-- Finds scheduled working days with no session at all: a missing clock-in.
-- Returns the count; the caller notifies. Deliberately does not create a
-- session — the system does not know whether the person worked, and inventing
-- attendance is worse than reporting a gap.
CREATE OR REPLACE FUNCTION public.attendance_detect_missing_punches(
  p_business_date date DEFAULT NULL
)
RETURNS TABLE (employee_id uuid, business_date date, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_date date;
BEGIN
  v_date := COALESCE(
    p_business_date,
    (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date - 1
  );

  RETURN QUERY
  SELECT
    e.id,
    v_date,
    'missing_clock_in'::text
  FROM workforce_employees e
  CROSS JOIN LATERAL attendance_resolve_schedule(e.id, v_date) r
  JOIN work_schedules sc ON sc.id = r.schedule_id
  WHERE e.status IN ('Active', 'Onboarding')
    AND EXTRACT(ISODOW FROM v_date)::smallint = ANY (sc.working_weekdays)
    AND NOT attendance_is_holiday(sc.id, v_date)
    -- Not on approved leave that day.
    AND NOT EXISTS (
      SELECT 1 FROM workforce_leave_requests lr
      WHERE lr.employee_id = e.id
        AND lr.status = 'Approved'
        AND v_date BETWEEN lr.start_date AND lr.end_date
    )
    AND NOT EXISTS (
      SELECT 1 FROM attendance_sessions s
      WHERE s.employee_id = e.id AND s.business_date = v_date
    )

  UNION ALL

  -- Sessions the auto-close job had to finish. Reported so the employee is
  -- prompted to raise a correction rather than discovering it at payroll.
  SELECT s.employee_id, s.business_date, 'missing_clock_out'::text
  FROM attendance_sessions s
  WHERE s.business_date = v_date
    AND s.missing_clock_out
    AND NOT s.correction_pending;
END;
$$;

-- =============================================================================
-- attendance_apply_correction — the only way a session changes after the fact
-- =============================================================================
-- Approves a correction and applies it. What it does NOT do is edit a punch:
-- the requested times are inserted as NEW punches with source='correction',
-- carrying the correction id, and the session is rebuilt from the result.
--
-- before_state and after_state are snapshotted here, at the moment of the
-- change, because a diff reconstructed later from rows that have since moved
-- again is not evidence of what this decision did.
CREATE OR REPLACE FUNCTION public.attendance_apply_correction(
  p_correction_id uuid,
  p_decided_by_employee_id uuid,
  p_decided_by_clerk_id text DEFAULT NULL,
  p_decision_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c            attendance_corrections%ROWTYPE;
  s            attendance_sessions%ROWTYPE;
  v_now        timestamptz := now();
  v_before     jsonb;
  v_after      jsonb;
  v_in         timestamptz;
  v_out        timestamptz;
  v_session_id uuid;
  v_sched_id   uuid;
  v_tpl_id     uuid;
  v_mode       text;
BEGIN
  SELECT * INTO c FROM attendance_corrections WHERE id = p_correction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'attendance.correction_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF c.status <> 'pending' THEN
    RAISE EXCEPTION 'attendance.correction_already_decided' USING ERRCODE = 'P0001';
  END IF;
  -- Nobody approves their own correction. Self-approval would make the whole
  -- request/decision split decorative.
  IF c.requested_by_employee_id = p_decided_by_employee_id THEN
    RAISE EXCEPTION 'attendance.correction_self_approval' USING ERRCODE = 'P0001';
  END IF;

  v_in  := (c.requested_changes ->> 'clock_in_at')::timestamptz;
  v_out := (c.requested_changes ->> 'clock_out_at')::timestamptz;

  IF c.session_id IS NOT NULL THEN
    SELECT * INTO s FROM attendance_sessions WHERE id = c.session_id FOR UPDATE;
  END IF;

  v_before := CASE WHEN s.id IS NULL THEN NULL ELSE to_jsonb(s) END;

  IF s.id IS NULL THEN
    -- A whole missing day. Create the session from the approved claim.
    IF v_in IS NULL OR v_out IS NULL THEN
      RAISE EXCEPTION 'attendance.correction_incomplete' USING ERRCODE = 'P0001';
    END IF;
    SELECT r.schedule_id, r.shift_template_id, r.work_mode
      INTO v_sched_id, v_tpl_id, v_mode
    FROM attendance_resolve_schedule(c.employee_id, c.business_date) r;

    INSERT INTO attendance_sessions (
      employee_id, business_date, state, opened_at, closed_at,
      schedule_id, shift_template_id, work_mode
    ) VALUES (
      c.employee_id, c.business_date, 'clocked_out', v_in, v_out,
      v_sched_id, v_tpl_id, COALESCE(v_mode, 'office')
    )
    RETURNING id INTO v_session_id;
  ELSE
    v_session_id := s.id;
    UPDATE attendance_sessions
       SET opened_at = COALESCE(v_in, opened_at),
           closed_at = COALESCE(v_out, closed_at),
           state = CASE WHEN COALESCE(v_out, closed_at) IS NULL
                        THEN state ELSE 'clocked_out' END,
           missing_clock_out = false,
           correction_pending = false
     WHERE id = s.id;
  END IF;

  -- The adjustment, recorded as evidence rather than applied to evidence.
  IF v_in IS NOT NULL THEN
    INSERT INTO attendance_punches (
      employee_id, session_id, punch_type, punched_at, source, note,
      actor_employee_id, actor_clerk_id, correction_id
    ) VALUES (
      c.employee_id, v_session_id, 'in', v_in, 'correction',
      'Approved correction', p_decided_by_employee_id, p_decided_by_clerk_id, c.id
    );
  END IF;
  IF v_out IS NOT NULL THEN
    INSERT INTO attendance_punches (
      employee_id, session_id, punch_type, punched_at, source, note,
      actor_employee_id, actor_clerk_id, correction_id
    ) VALUES (
      c.employee_id, v_session_id, 'out', v_out, 'correction',
      'Approved correction', p_decided_by_employee_id, p_decided_by_clerk_id, c.id
    );
  END IF;

  PERFORM attendance_recalculate_session(v_session_id);
  SELECT * INTO s FROM attendance_sessions WHERE id = v_session_id;
  v_after := to_jsonb(s);

  UPDATE attendance_corrections
     SET status = 'approved',
         session_id = v_session_id,
         decided_by_employee_id = p_decided_by_employee_id,
         decided_by_clerk_id = p_decided_by_clerk_id,
         decision_note = p_decision_note,
         decided_at = v_now,
         before_state = v_before,
         after_state = v_after,
         applied_at = v_now
   WHERE id = c.id;

  -- An approved correction must reach payroll, not just the session view.
  PERFORM attendance_rebuild_timesheet(c.employee_id, c.business_date);

  RETURN v_session_id;
END;
$$;

-- =============================================================================
-- attendance_rebuild_timesheet
-- =============================================================================
-- Rebuilds the timesheet covering a date from its sessions. Idempotent: safe to
-- call after every transition and after every correction.
--
-- Refuses to touch an approved or locked timesheet. A period that has been
-- signed off is a payroll record; a late correction to it needs a human
-- decision to reopen, not a silent rewrite.
CREATE OR REPLACE FUNCTION public.attendance_rebuild_timesheet(
  p_employee_id uuid,
  p_date date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sched_id     uuid;
  sched          work_schedules%ROWTYPE;
  v_start        date;
  v_end          date;
  v_timesheet_id uuid;
  v_status       text;
BEGIN
  SELECT r.schedule_id INTO v_sched_id
  FROM attendance_resolve_schedule(p_employee_id, p_date) r;
  SELECT * INTO sched FROM work_schedules WHERE id = v_sched_id;

  -- Period bounds. Weeks start Monday, matching working_weekdays' ISO numbering.
  CASE COALESCE(sched.timesheet_period, 'weekly')
    WHEN 'weekly' THEN
      v_start := p_date - (EXTRACT(ISODOW FROM p_date)::integer - 1);
      v_end := v_start + 6;
    WHEN 'biweekly' THEN
      v_start := p_date - (EXTRACT(ISODOW FROM p_date)::integer - 1)
                 - CASE WHEN (EXTRACT(WEEK FROM p_date)::integer % 2) = 0 THEN 7 ELSE 0 END;
      v_end := v_start + 13;
    ELSE
      v_start := date_trunc('month', p_date)::date;
      v_end := (date_trunc('month', p_date) + interval '1 month - 1 day')::date;
  END CASE;

  INSERT INTO timesheets (employee_id, schedule_id, period_start, period_end)
  VALUES (p_employee_id, v_sched_id, v_start, v_end)
  ON CONFLICT (employee_id, period_start) DO UPDATE
    SET schedule_id = EXCLUDED.schedule_id
  RETURNING id, status INTO v_timesheet_id, v_status;

  IF v_status IN ('approved', 'locked') THEN
    RETURN v_timesheet_id;
  END IF;

  DELETE FROM timesheet_entries WHERE timesheet_id = v_timesheet_id;

  INSERT INTO timesheet_entries (
    timesheet_id, session_id, business_date,
    worked_minutes, break_minutes, payable_minutes, overtime_minutes,
    is_weekend, is_holiday, is_late, late_minutes,
    is_early_departure, early_departure_minutes, source
  )
  SELECT
    v_timesheet_id, s.id, s.business_date,
    s.worked_minutes, s.break_minutes, s.payable_minutes, s.overtime_minutes,
    s.is_weekend, s.is_holiday, s.is_late, s.late_minutes,
    s.is_early_departure, s.early_departure_minutes, 'session'
  FROM attendance_sessions s
  WHERE s.employee_id = p_employee_id
    AND s.business_date BETWEEN v_start AND v_end
    AND s.state IN ('clocked_out', 'auto_closed', 'pending_correction');

  UPDATE timesheets t
     SET total_worked_minutes   = COALESCE(agg.worked, 0),
         total_break_minutes    = COALESCE(agg.brk, 0),
         total_payable_minutes  = COALESCE(agg.payable, 0),
         total_overtime_minutes = COALESCE(agg.overtime, 0)
    FROM (
      SELECT
        SUM(worked_minutes) AS worked,
        SUM(break_minutes) AS brk,
        SUM(payable_minutes) AS payable,
        SUM(overtime_minutes) AS overtime
      FROM timesheet_entries WHERE timesheet_id = v_timesheet_id
    ) agg
   WHERE t.id = v_timesheet_id;

  RETURN v_timesheet_id;
END;
$$;

-- =============================================================================
-- Access control on the functions
-- =============================================================================
-- SECURITY DEFINER functions are granted EXECUTE to PUBLIC by default, and
-- PostgREST publishes them as RPC endpoints. Without these REVOKEs, anyone with
-- the anon key could clock any employee in and out by uuid.
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'attendance_business_date(timestamptz, text)',
    'attendance_distance_m(double precision, double precision, double precision, double precision)',
    'attendance_resolve_schedule(uuid, date)',
    'attendance_is_holiday(uuid, date)',
    'attendance_recalculate_session(uuid)',
    'attendance_clock_in(uuid, text, inet, text, double precision, double precision, double precision, text, uuid)',
    'attendance_start_break(uuid, text, text, text)',
    'attendance_end_break(uuid, text, text)',
    'attendance_clock_out(uuid, text, inet, text, double precision, double precision, double precision, text)',
    'attendance_auto_close_stale_sessions()',
    'attendance_detect_missing_punches(date)',
    'attendance_apply_correction(uuid, uuid, text, text)',
    'attendance_rebuild_timesheet(uuid, date)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';
