-- Schedules report maintenance.
--
-- WHY THIS EXISTS
--
-- "Report requirements are generated automatically" is only true if something
-- runs. Without this the engine still works, but every obligation has to be
-- created by hand, which is the situation the module was built to end: the old
-- system had no concept of a report being OWED, so "who has not filed their
-- monthly report" was unanswerable.
--
-- The endpoint does four idempotent things: generate obligations for closed
-- periods, mark the late ones overdue, lock accepted reports past their window,
-- and remind people. Reminders are rate-limited per obligation (24h, four
-- maximum), so an hourly job does not mean an hourly notification.
--
-- One-time setup, same pattern as the other cron workers:
--   ALTER DATABASE postgres SET app.settings.opus_admin_base_url = 'https://admin.opusfesta.com';
--   ALTER DATABASE postgres SET app.settings.reports_cron_secret = '<matches REPORTS_CRON_SECRET on Vercel>';
--
-- Until both are set the trigger no-ops with a notice rather than failing.

CREATE OR REPLACE FUNCTION public.trigger_report_maintenance()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  base_url TEXT := current_setting('app.settings.opus_admin_base_url', true);
  secret   TEXT := current_setting('app.settings.reports_cron_secret', true);
BEGIN
  IF base_url IS NULL OR secret IS NULL THEN
    RAISE NOTICE 'report maintenance not triggered: set app.settings.opus_admin_base_url and app.settings.reports_cron_secret';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := base_url || '/api/reports/maintenance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret
    ),
    body    := '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_report_maintenance() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_report_maintenance() TO service_role;

COMMENT ON FUNCTION public.trigger_report_maintenance() IS
  'Fires /api/reports/maintenance: generates obligations, marks overdue, locks accepted reports and sends reminders. Scheduled hourly by pg_cron. Service-role only.';

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  CREATE EXTENSION IF NOT EXISTS pg_net;

  -- Hourly at :23, offset from the attendance job at :07 so the two are not
  -- competing for the same connections every hour.
  --
  -- Hourly rather than daily because a daily report generated once at 02:00
  -- would not exist for anyone starting work before the job ran, and someone
  -- filing a report they cannot see an obligation for is the confusing case.
  -- Everything the endpoint does is idempotent, so frequency costs nothing.
  PERFORM cron.schedule(
    'report-maintenance',
    '23 * * * *',
    $cron$SELECT public.trigger_report_maintenance();$cron$
  );
EXCEPTION WHEN OTHERS THEN
  -- A local or branch database without pg_cron/pg_net must still apply this.
  RAISE NOTICE 'report maintenance schedule skipped: %', SQLERRM;
END
$$;
