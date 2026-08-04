-- Schedules tracker maintenance.
--
-- WHY THIS EXISTS
--
-- Two of the module's guarantees only hold if something runs on a schedule:
--
--   'missed' is calculated, not selected. tracker_mark_missed() is the only
--   writer, and if nothing calls it, an unfilled day sits in 'not_started'
--   forever and the tracker cannot answer its central question.
--
--   Unfinished work carries forward. Without the job, an item raised on Monday
--   and not finished simply disappears from Tuesday's view, which is the exact
--   failure the carry-over links were built to prevent.
--
-- Generation also runs here, so an employee opening the tracker at 08:00 finds
-- today's entry already waiting rather than having to create one.
--
-- One-time setup, same pattern as the other cron workers:
--   ALTER DATABASE postgres SET app.settings.opus_admin_base_url = 'https://admin.opusfesta.com';
--   ALTER DATABASE postgres SET app.settings.tracker_cron_secret = '<matches TRACKER_CRON_SECRET on Vercel>';
--
-- Until both are set the trigger no-ops with a notice rather than failing.

CREATE OR REPLACE FUNCTION public.trigger_tracker_maintenance()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  base_url TEXT := current_setting('app.settings.opus_admin_base_url', true);
  secret   TEXT := current_setting('app.settings.tracker_cron_secret', true);
BEGIN
  IF base_url IS NULL OR secret IS NULL THEN
    RAISE NOTICE 'tracker maintenance not triggered: set app.settings.opus_admin_base_url and app.settings.tracker_cron_secret';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := base_url || '/api/tracker/maintenance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret
    ),
    body    := '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_tracker_maintenance() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_tracker_maintenance() TO service_role;

COMMENT ON FUNCTION public.trigger_tracker_maintenance() IS
  'Fires /api/tracker/maintenance: generates entries, carries unfinished items forward, marks missed days and rebuilds weekly rollups. Scheduled hourly by pg_cron. Service-role only.';

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  CREATE EXTENSION IF NOT EXISTS pg_net;

  -- Hourly at :41, offset from attendance (:07) and reports (:23) so the three
  -- are not competing for connections on the same tick.
  --
  -- Hourly rather than nightly because the deadline is 18:00 and the grace
  -- window an hour: a once-a-day sweep would mark Monday missed on Tuesday
  -- morning, long after the employee could have fixed it.
  PERFORM cron.schedule(
    'tracker-maintenance',
    '41 * * * *',
    $cron$SELECT public.trigger_tracker_maintenance();$cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'tracker maintenance schedule skipped: %', SQLERRM;
END
$$;
