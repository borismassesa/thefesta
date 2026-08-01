-- Schedules the staff-notification email retry worker.
--
-- WHY THIS EXISTS
-- staff_notifications was built so a notification is an obligation rather than
-- a best-effort side effect: the row is written before the provider is called,
-- the render payload is persisted with the event, and a failed send lands in
-- 'failed' with a next_attempt_at. claim_notification_emails() was added in
-- 20260801154336 for a worker to drain that queue.
--
-- No worker existed. Nothing in the application called the function, so every
-- obligation recorded for later was recorded and then ignored. An approval
-- decided while Resend was down notified nobody, permanently, with the row
-- still sitting in 'pending'. /api/notifications/retry is that worker; this
-- schedules it.
--
-- One-time setup, same pattern as the md-tracker nudge and pledge reminders:
--   ALTER DATABASE postgres SET app.settings.opus_admin_base_url = 'https://admin.opusfesta.com';
--   ALTER DATABASE postgres SET app.settings.notification_retry_secret = '<matches NOTIFICATION_RETRY_CRON_SECRET on Vercel>';
--
-- Until both are set the trigger no-ops with a notice rather than failing, so
-- applying this migration is safe in an environment that has not been
-- configured yet.

CREATE OR REPLACE FUNCTION public.trigger_notification_retry()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  base_url TEXT := current_setting('app.settings.opus_admin_base_url', true);
  secret   TEXT := current_setting('app.settings.notification_retry_secret', true);
BEGIN
  IF base_url IS NULL OR secret IS NULL THEN
    RAISE NOTICE 'notification retry not triggered: set app.settings.opus_admin_base_url and app.settings.notification_retry_secret';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := base_url || '/api/notifications/retry',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- Postgres grants EXECUTE to PUBLIC by default and PostgREST would expose this
-- as an endpoint that fires an authenticated HTTP request carrying the cron
-- secret. Service role only.
REVOKE ALL ON FUNCTION public.trigger_notification_retry() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_notification_retry() TO service_role;

COMMENT ON FUNCTION public.trigger_notification_retry() IS
  'Fires /api/notifications/retry, which drains the staff_notifications email queue via claim_notification_emails(). Scheduled every 10 minutes by pg_cron. Service-role only.';

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  CREATE EXTENSION IF NOT EXISTS pg_net;
  -- Every 10 minutes. The worker claims with FOR UPDATE SKIP LOCKED, so an
  -- overlapping tick takes disjoint rows rather than double-sending. Frequent
  -- enough that a brief provider outage costs minutes, not a day; the
  -- exponential backoff in the worker keeps a longer outage from burning the
  -- five-attempt budget in the first hour.
  PERFORM cron.schedule(
    'notification-email-retry',
    '*/10 * * * *',
    'SELECT public.trigger_notification_retry();'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'notification retry cron scheduling skipped (enable pg_cron + pg_net to automate): %', SQLERRM;
END $$;

NOTIFY pgrst, 'reload schema';
