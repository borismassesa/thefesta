-- Office geolocation for My Clock.
--
-- Turns on required geofencing for the OpusFesta standard schedule and anchors
-- Standard day / Saturday templates to the office:
--
--   Samaki Wabichi Annex, Mbezi Beach,
--   P.O.Box 7787 Dar es Salaam, Tanzania
--
-- Pin from Google Maps "Opus Festa":
--   https://maps.google.com/?q=-6.7248731,39.2132484
--   lat -6.7248731, lng 39.2132484

UPDATE public.work_schedules
   SET geolocation_mode = 'required',
       geofence_radius_m = 300,
       description = 'Monday to Saturday, 09:00 to 17:00 East Africa Time. 30-minute entitled break. In-office punches require being at Samaki Wabichi Annex, Mbezi Beach.',
       updated_at = now()
 WHERE name = 'OpusFesta standard';

UPDATE public.shift_templates t
   SET location_label = 'Samaki Wabichi Annex, Mbezi Beach',
       latitude = -6.7248731,
       longitude = 39.2132484,
       geofence_radius_m = 300,
       updated_at = now()
  FROM public.work_schedules s
 WHERE t.schedule_id = s.id
   AND s.name = 'OpusFesta standard'
   AND t.name IN ('Standard day', 'Saturday');

-- =============================================================================
-- attendance_clock_out — enforce geofence when the schedule requires it
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
  v_now      timestamptz := now();
  v_session  attendance_sessions%ROWTYPE;
  sched      work_schedules%ROWTYPE;
  tpl        shift_templates%ROWTYPE;
  v_radius   integer;
  v_distance double precision;
  v_geo_ok   boolean;
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

  -- Same contract as clock in: required means verify, optional only records.
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
    v_radius := COALESCE(tpl.geofence_radius_m, sched.geofence_radius_m);
    v_distance := attendance_distance_m(p_latitude, p_longitude, tpl.latitude, tpl.longitude);
    v_geo_ok := v_distance <= v_radius;
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

COMMENT ON FUNCTION public.attendance_clock_out(uuid, text, inet, text, double precision, double precision, double precision, text) IS
  'Closes the open session. When the schedule geolocation_mode is required, the punch must be inside the shift geofence — same rule as clock in.';

NOTIFY pgrst, 'reload schema';
