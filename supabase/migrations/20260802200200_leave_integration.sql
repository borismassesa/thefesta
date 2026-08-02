-- Leave — integration with attendance and the tracker.
--
-- Both modules already suppressed missed entries for approved leave, but each
-- read workforce_leave_requests directly. That was fine when it was the only
-- leave table; now there are two, and two definitions of "on leave" is exactly
-- how a module ends up marking somebody absent while another says they are on
-- holiday.
--
-- This repoints both at leave_is_on_leave(), which reads the new tables AND the
-- legacy one, and which honours the per-policy suppression flags. After this
-- there is one answer, in one place.
--
-- The two functions are recreated in full rather than patched, because Postgres
-- has no way to edit a function body in place.

-- =============================================================================
-- Attendance: the missing-punch sweep
-- =============================================================================
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
    -- One definition of "on leave", shared with the tracker. Honours the
    -- policy's suppresses_attendance flag, so a leave type that does not
    -- excuse attendance still expects a punch.
    AND NOT leave_is_on_leave(e.id, v_date, 'attendance')
    AND NOT EXISTS (
      SELECT 1 FROM attendance_sessions s
      WHERE s.employee_id = e.id AND s.business_date = v_date
    )

  UNION ALL

  SELECT s.employee_id, s.business_date, 'missing_clock_out'::text
  FROM attendance_sessions s
  WHERE s.business_date = v_date
    AND s.missing_clock_out
    AND NOT s.correction_pending;
END;
$$;

REVOKE ALL ON FUNCTION public.attendance_detect_missing_punches(date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_detect_missing_punches(date) TO service_role;

-- =============================================================================
-- Tracker: the day-state resolver
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tracker_day_state(
  p_employee_id uuid,
  p_schedule_id uuid,
  p_date date
)
RETURNS TABLE (is_working boolean, reason text)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  sched work_schedules%ROWTYPE;
BEGIN
  IF p_employee_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM workforce_employees e
    WHERE e.id = p_employee_id
      AND (e.start_date > p_date OR e.status IN ('Resigned', 'Terminated'))
  ) THEN
    RETURN QUERY SELECT false, 'not_employed'::text; RETURN;
  END IF;

  -- Same shared definition as attendance, with the tracker's own policy flag.
  -- A half day is NOT suppressed: they were in for half of it and an entry is
  -- still owed.
  IF p_employee_id IS NOT NULL AND leave_is_on_leave(p_employee_id, p_date, 'tracker') THEN
    RETURN QUERY SELECT false, 'approved_leave'::text; RETURN;
  END IF;

  SELECT * INTO sched FROM work_schedules WHERE id = p_schedule_id;

  IF EXISTS (
    SELECT 1 FROM holiday_calendars h
    WHERE COALESCE(h.observed_date, h.holiday_date) = p_date
      AND (h.schedule_id IS NULL OR h.schedule_id = p_schedule_id)
  ) THEN
    RETURN QUERY SELECT false, 'public_holiday'::text; RETURN;
  END IF;

  IF sched.id IS NOT NULL
     AND NOT (EXTRACT(ISODOW FROM p_date)::smallint = ANY (sched.working_weekdays)) THEN
    RETURN QUERY SELECT false, 'rest_day'::text; RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.tracker_day_state(uuid, uuid, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tracker_day_state(uuid, uuid, date) TO service_role;

-- =============================================================================
-- Report obligations: suppressed only where policy permits
-- =============================================================================
-- Deliberately NOT wired the same way. A monthly report is still owed after a
-- week off, so leave does not excuse it by default; leave_policies gets a
-- suppresses_reports flag for the cases where a policy says otherwise, and this
-- function is what the report generator would consult.
CREATE OR REPLACE FUNCTION public.leave_suppresses_reports(
  p_employee_id uuid,
  p_period_start date,
  p_period_end date
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  -- True only when the ENTIRE period was covered by leave whose policy excuses
  -- reporting. A week off in a month does not excuse the monthly report.
  SELECT NOT EXISTS (
    SELECT 1
    FROM generate_series(p_period_start, p_period_end, interval '1 day') AS d(day)
    WHERE NOT leave_is_on_leave(p_employee_id, d.day::date, 'reports')
  )
  AND p_period_end >= p_period_start;
$$;

REVOKE ALL ON FUNCTION public.leave_suppresses_reports(uuid, date, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leave_suppresses_reports(uuid, date, date) TO service_role;

COMMENT ON FUNCTION public.leave_is_on_leave(uuid, date, text) IS
  'The single definition of "on approved leave" for a date. Used by attendance_detect_missing_punches, tracker_day_state and leave_suppresses_reports so the modules cannot disagree. Reads the new leave tables and the legacy workforce_leave_requests.';

NOTIFY pgrst, 'reload schema';
