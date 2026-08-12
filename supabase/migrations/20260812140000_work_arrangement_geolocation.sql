-- Work arrangement drives geolocation, not a blanket schedule rule.
--
-- Employees are office / hybrid / remote. The schedule may still say
-- geolocation_mode = 'required' (the office policy), but the effective mode
-- for a punch is:
--
--   office  → schedule mode (required)
--   hybrid  → optional  (record when available; never block)
--   remote  → off       (never ask, never block)
--   field   → schedule mode softened to optional at least
--
-- work_arrangement on workforce_employees is the default. A shift assignment
-- work_mode still wins for a specific day when set.

-- ---------------------------------------------------------------------------
-- 1. Employee default arrangement
-- ---------------------------------------------------------------------------
ALTER TABLE public.workforce_employees
  ADD COLUMN IF NOT EXISTS work_arrangement text;

UPDATE public.workforce_employees
   SET work_arrangement = CASE
     WHEN lower(location) = 'remote' THEN 'remote'
     ELSE 'office'
   END
 WHERE work_arrangement IS NULL;

ALTER TABLE public.workforce_employees
  ALTER COLUMN work_arrangement SET DEFAULT 'office';

ALTER TABLE public.workforce_employees
  ALTER COLUMN work_arrangement SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workforce_employees_work_arrangement_check'
  ) THEN
    ALTER TABLE public.workforce_employees
      ADD CONSTRAINT workforce_employees_work_arrangement_check
      CHECK (work_arrangement IN ('office', 'hybrid', 'remote'));
  END IF;
END $$;

COMMENT ON COLUMN public.workforce_employees.work_arrangement IS
  'Default place-of-work for attendance geolocation: office (fence required when schedule requires it), hybrid (optional), remote (off).';

-- ---------------------------------------------------------------------------
-- 2. Allow hybrid on attendance work_mode columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.shift_templates DROP CONSTRAINT IF EXISTS shift_templates_work_mode_check;
ALTER TABLE public.shift_templates
  ADD CONSTRAINT shift_templates_work_mode_check
  CHECK (work_mode IN ('office', 'hybrid', 'remote', 'field'));

ALTER TABLE public.employee_shift_assignments DROP CONSTRAINT IF EXISTS employee_shift_assignments_work_mode_check;
ALTER TABLE public.employee_shift_assignments
  ADD CONSTRAINT employee_shift_assignments_work_mode_check
  CHECK (work_mode IS NULL OR work_mode IN ('office', 'hybrid', 'remote', 'field'));

ALTER TABLE public.attendance_sessions DROP CONSTRAINT IF EXISTS attendance_sessions_work_mode_check;
ALTER TABLE public.attendance_sessions
  ADD CONSTRAINT attendance_sessions_work_mode_check
  CHECK (work_mode IN ('office', 'hybrid', 'remote', 'field'));

-- ---------------------------------------------------------------------------
-- 3. Effective geolocation helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attendance_effective_geolocation(
  p_schedule_mode text,
  p_work_mode text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(COALESCE(p_work_mode, 'office')) = 'remote' THEN 'off'
    WHEN lower(COALESCE(p_work_mode, 'office')) = 'hybrid' THEN
      CASE WHEN COALESCE(p_schedule_mode, 'off') = 'off' THEN 'off' ELSE 'optional' END
    WHEN lower(COALESCE(p_work_mode, 'office')) = 'field' THEN
      CASE
        WHEN COALESCE(p_schedule_mode, 'off') = 'required' THEN 'optional'
        ELSE COALESCE(p_schedule_mode, 'off')
      END
    ELSE COALESCE(p_schedule_mode, 'off')  -- office (in-office)
  END;
$$;

COMMENT ON FUNCTION public.attendance_effective_geolocation(text, text) IS
  'Maps schedule geolocation_mode + work_mode to the effective punch rule: remote=off, hybrid=optional, office=schedule mode.';

-- ---------------------------------------------------------------------------
-- 4. Resolve schedule — prefer assignment mode, else employee arrangement
-- ---------------------------------------------------------------------------
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
  WITH emp AS (
    SELECT work_arrangement FROM workforce_employees WHERE id = p_employee_id
  ),
  ranked AS (
    SELECT
      a.schedule_id,
      a.shift_template_id,
      COALESCE(a.work_mode, t.work_mode, e.work_arrangement, 'office') AS work_mode,
      CASE WHEN a.weekday IS NOT NULL THEN 0 ELSE 1 END AS specificity,
      a.effective_from
    FROM employee_shift_assignments a
    LEFT JOIN shift_templates t ON t.id = a.shift_template_id
    CROSS JOIN emp e
    WHERE a.employee_id = p_employee_id
      AND a.effective_from <= p_date
      AND (a.effective_to IS NULL OR a.effective_to >= p_date)
      AND (a.weekday IS NULL OR a.weekday = EXTRACT(ISODOW FROM p_date)::smallint)
    ORDER BY specificity, a.effective_from DESC
    LIMIT 1
  ),
  base AS (
    SELECT r.schedule_id, r.shift_template_id, r.work_mode FROM ranked r
    UNION ALL
    SELECT s.id, NULL::uuid, COALESCE((SELECT work_arrangement FROM emp), 'office')
    FROM work_schedules s
    WHERE s.is_default AND s.active AND NOT EXISTS (SELECT 1 FROM ranked)
    LIMIT 1
  ),
  with_template AS (
    SELECT
      b.schedule_id,
      COALESCE(
        b.shift_template_id,
        (
          SELECT t.id
          FROM shift_templates t
          WHERE t.schedule_id = b.schedule_id
            AND t.active
            AND t.name = CASE
              WHEN EXTRACT(ISODOW FROM p_date)::smallint = 6 THEN 'Saturday'
              ELSE 'Standard day'
            END
          LIMIT 1
        ),
        (
          SELECT t.id
          FROM shift_templates t
          WHERE t.schedule_id = b.schedule_id
            AND t.active
            AND NOT t.crosses_midnight
          ORDER BY t.start_time
          LIMIT 1
        )
      ) AS shift_template_id,
      b.work_mode
    FROM base b
  )
  SELECT
    w.schedule_id,
    w.shift_template_id,
    COALESCE(
      w.work_mode,
      (SELECT t.work_mode FROM shift_templates t WHERE t.id = w.shift_template_id),
      (SELECT work_arrangement FROM emp),
      'office'
    ) AS work_mode
  FROM with_template w;
$$;

-- ---------------------------------------------------------------------------
-- 5. Clock in — use effective geolocation for this work mode
-- ---------------------------------------------------------------------------
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
  v_now         timestamptz := now();
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
  v_geo_mode    text;
BEGIN
  SELECT r.schedule_id, r.shift_template_id, r.work_mode
    INTO v_sched_id, v_tpl_id, v_work_mode
  FROM attendance_resolve_schedule(p_employee_id, (v_now AT TIME ZONE v_tz)::date) r;

  IF v_sched_id IS NULL THEN
    RAISE EXCEPTION 'attendance.no_schedule' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO sched FROM work_schedules WHERE id = v_sched_id;
  v_tz := sched.timezone;
  v_bdate := attendance_business_date(v_now, v_tz);

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

  v_work_mode := COALESCE(v_work_mode, tpl.work_mode, 'office');
  v_geo_mode := attendance_effective_geolocation(sched.geolocation_mode, v_work_mode);

  IF v_geo_mode = 'required' THEN
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
  ELSIF v_geo_mode = 'optional'
        AND p_latitude IS NOT NULL AND tpl.latitude IS NOT NULL THEN
    v_radius := COALESCE(tpl.geofence_radius_m, sched.geofence_radius_m);
    v_distance := attendance_distance_m(p_latitude, p_longitude, tpl.latitude, tpl.longitude);
    v_geo_ok := v_distance <= v_radius;
  END IF;

  BEGIN
    INSERT INTO attendance_sessions (
      employee_id, business_date, state, opened_at,
      schedule_id, shift_template_id, scheduled_start, scheduled_end,
      work_mode, location_label
    ) VALUES (
      p_employee_id, v_bdate, 'clocked_in', v_now,
      v_sched_id, v_tpl_id, v_sched_start, v_sched_end,
      v_work_mode, tpl.location_label
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

-- ---------------------------------------------------------------------------
-- 6. Clock out — same effective geolocation rule
-- ---------------------------------------------------------------------------
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
  v_now      timestamptz := now();
  v_session  attendance_sessions%ROWTYPE;
  sched      work_schedules%ROWTYPE;
  tpl        shift_templates%ROWTYPE;
  v_radius   integer;
  v_distance double precision;
  v_geo_ok   boolean;
  v_geo_mode text;
BEGIN
  SELECT * INTO v_session
  FROM attendance_sessions
  WHERE employee_id = p_employee_id AND state IN ('clocked_in', 'on_break')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attendance.not_clocked_in' USING ERRCODE = 'P0001';
  END IF;

  IF v_session.schedule_id IS NOT NULL THEN
    SELECT * INTO sched FROM work_schedules WHERE id = v_session.schedule_id;
  END IF;

  IF v_session.shift_template_id IS NOT NULL THEN
    SELECT * INTO tpl FROM shift_templates WHERE id = v_session.shift_template_id;
  END IF;

  v_geo_mode := attendance_effective_geolocation(
    sched.geolocation_mode,
    COALESCE(v_session.work_mode, 'office')
  );

  IF v_geo_mode = 'required' THEN
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
  ELSIF v_geo_mode = 'optional'
        AND p_latitude IS NOT NULL AND tpl.latitude IS NOT NULL THEN
    v_radius := COALESCE(tpl.geofence_radius_m, sched.geofence_radius_m);
    v_distance := attendance_distance_m(p_latitude, p_longitude, tpl.latitude, tpl.longitude);
    v_geo_ok := v_distance <= v_radius;
  END IF;

  UPDATE attendance_breaks
     SET ended_at = v_now
   WHERE session_id = v_session.id AND ended_at IS NULL;

  INSERT INTO attendance_punches (
    employee_id, session_id, punch_type, punched_at, source,
    ip_address, user_agent, latitude, longitude, accuracy_m,
    geofence_ok, distance_m, location_label, actor_employee_id, actor_clerk_id
  ) VALUES (
    p_employee_id, v_session.id, 'out', v_now, p_source,
    p_ip, left(p_user_agent, 500), p_latitude, p_longitude, p_accuracy_m,
    v_geo_ok, v_distance, COALESCE(tpl.location_label, v_session.location_label),
    p_employee_id, p_actor_clerk_id
  );

  UPDATE attendance_sessions
     SET state = 'clocked_out', closed_at = v_now
   WHERE id = v_session.id;

  PERFORM attendance_recalculate_session(v_session.id);
  RETURN v_session.id;
END;
$$;

NOTIFY pgrst, 'reload schema';
