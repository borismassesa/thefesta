-- Schedules the nightly attendance maintenance job.
--
-- WHY THIS EXISTS
--
-- Two of the module's guarantees are only true if something runs on a schedule:
--
--   A session left open accrues forever. Someone who forgets to clock out on
--   Friday afternoon shows sixty-odd hours by Monday, and the first anyone
--   notices is payroll. attendance_auto_close_stale_sessions() closes it at the
--   scheduled end and flags it as a missed clock-out.
--
--   A missing clock-in is invisible. Nothing happened, so there is no row to
--   look at. attendance_detect_missing_punches() finds scheduled working days
--   with no session, skipping approved leave and public holidays, and the
--   endpoint notifies the employee so they can raise a correction while they
--   still remember the day.
--
-- Neither job invents attendance. The first records a close at a time the
-- employee was scheduled to finish; the second only reports.
--
-- One-time setup, same pattern as the notification retry worker:
--   ALTER DATABASE postgres SET app.settings.opus_admin_base_url = 'https://admin.opusfesta.com';
--   ALTER DATABASE postgres SET app.settings.attendance_cron_secret = '<matches ATTENDANCE_CRON_SECRET on Vercel>';
--
-- Until both are set the trigger no-ops with a notice rather than failing, so
-- applying this migration is safe in an environment that has not been
-- configured yet.

CREATE OR REPLACE FUNCTION public.trigger_attendance_maintenance()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  base_url TEXT := current_setting('app.settings.opus_admin_base_url', true);
  secret   TEXT := current_setting('app.settings.attendance_cron_secret', true);
BEGIN
  IF base_url IS NULL OR secret IS NULL THEN
    RAISE NOTICE 'attendance maintenance not triggered: set app.settings.opus_admin_base_url and app.settings.attendance_cron_secret';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := base_url || '/api/attendance/maintenance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- Fires an authenticated HTTP request carrying the cron secret. PostgREST would
-- otherwise publish it as an endpoint anyone with the anon key could call.
REVOKE ALL ON FUNCTION public.trigger_attendance_maintenance() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_attendance_maintenance() TO service_role;

COMMENT ON FUNCTION public.trigger_attendance_maintenance() IS
  'Fires /api/attendance/maintenance, which auto-closes stale sessions and reports missing punches. Scheduled hourly by pg_cron. Service-role only.';

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  CREATE EXTENSION IF NOT EXISTS pg_net;

  -- Hourly, not nightly.
  --
  -- A once-a-day sweep at 02:00 EAT would leave an overnight worker's genuinely
  -- open session hanging for hours and would not close a day shift until the
  -- next morning. Hourly means a forgotten clock-out is corrected within the
  -- hour after its cutoff, and the missing-punch detector still only reports
  -- yesterday, so running it twelve times a day changes nothing except how
  -- quickly the first report lands. Both jobs are idempotent.
  PERFORM cron.schedule(
    'attendance-maintenance',
    '7 * * * *',
    $cron$SELECT public.trigger_attendance_maintenance();$cron$
  );
EXCEPTION WHEN OTHERS THEN
  -- A local or branch database without pg_cron/pg_net must still be able to
  -- apply this migration. The endpoint can be driven manually there.
  RAISE NOTICE 'attendance maintenance schedule skipped: %', SQLERRM;
END
$$;
