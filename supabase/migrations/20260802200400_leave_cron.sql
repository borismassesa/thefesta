-- Schedules leave maintenance.
--
-- Three jobs that only work if something runs:
--
--   ACCRUAL. A monthly-accrual policy grants a twelfth each month. With nobody
--   running it, every such balance stays at whatever it opened with.
--
--   EXPIRY. Carried-over days that outlive the policy window have to die, and
--   they have to die as a recorded transaction so the balance dropping in April
--   is explainable rather than mysterious.
--
--   AVAILABILITY. employee_availability is a derived calendar. Approved leave
--   refreshes its own dates immediately, but a new public holiday or a changed
--   work schedule affects days nobody touched, so it is rebuilt on a rolling
--   window.
--
-- One-time setup, same pattern as the other cron workers:
--   ALTER DATABASE postgres SET app.settings.opus_admin_base_url = 'https://admin.opusfesta.com';
--   ALTER DATABASE postgres SET app.settings.leave_cron_secret = '<matches LEAVE_CRON_SECRET on Vercel>';

CREATE OR REPLACE FUNCTION public.trigger_leave_maintenance()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  base_url TEXT := current_setting('app.settings.opus_admin_base_url', true);
  secret   TEXT := current_setting('app.settings.leave_cron_secret', true);
BEGIN
  IF base_url IS NULL OR secret IS NULL THEN
    RAISE NOTICE 'leave maintenance not triggered: set app.settings.opus_admin_base_url and app.settings.leave_cron_secret';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := base_url || '/api/leave/maintenance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret
    ),
    body    := '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_leave_maintenance() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_leave_maintenance() TO service_role;

COMMENT ON FUNCTION public.trigger_leave_maintenance() IS
  'Fires /api/leave/maintenance: monthly accrual, carryover expiry and the rolling availability rebuild. Scheduled daily by pg_cron. Service-role only.';

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  CREATE EXTENSION IF NOT EXISTS pg_net;

  -- Daily at 02:53 UTC, unlike the hourly attendance/report/tracker jobs.
  --
  -- Nothing here needs to be timelier than that: accrual is monthly, expiry is
  -- a policy window measured in months, and a leave request refreshes its own
  -- availability the moment it is approved. Running it hourly would burn
  -- connections to discover nothing changed.
  PERFORM cron.schedule(
    'leave-maintenance',
    '53 2 * * *',
    $cron$SELECT public.trigger_leave_maintenance();$cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'leave maintenance schedule skipped: %', SQLERRM;
END
$$;
