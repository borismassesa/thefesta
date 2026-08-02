-- Notification retry config moves to Supabase Vault.
--
-- WHY THIS EXISTS
-- 20260801183202 read its config from `current_setting('app.settings.*')`,
-- following the pattern the md-tracker and pledge-reminder crons already use.
-- On this project that pattern cannot be configured: hosted Supabase denies
-- `ALTER DATABASE ... SET` to the dashboard role with
--
--   ERROR: 42501: permission denied to set parameter
--
-- The workaround that was reached for instead was inlining set_config() calls
-- with the literal secret into `cron.job.command`. That works, but it stores a
-- production credential in plaintext in a table that `anon` and `authenticated`
-- both hold SELECT on, and which lands in every database backup and every
-- schema dump. A cron schedule is not a secret store.
--
-- Vault is. `vault.decrypted_secrets` is encrypted at rest, is not exposed
-- over PostgREST, and is readable only by roles explicitly granted access.
-- The cron command goes back to a bare function call with no secret in it.
--
-- NOTE ON THE OTHER CRONS: trigger_md_tracker_nudge() and
-- trigger_pledge_reminders() still use current_setting(), and no
-- `app.settings.*` values exist on this project, so both have been no-ops for
-- their entire lifetime. They are left alone here rather than changed as a
-- side effect of an approvals migration, but they need the same treatment.

-- ---------------------------------------------------------------------------
-- Read config from Vault
-- ---------------------------------------------------------------------------
-- Falls back to current_setting() so an environment that CAN set database
-- parameters keeps working, and so this is safe to apply before the secret is
-- stored. With neither source available it no-ops with a notice, exactly as
-- before, rather than erroring every ten minutes.
CREATE OR REPLACE FUNCTION public.trigger_notification_retry()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  base_url TEXT;
  secret   TEXT;
BEGIN
  SELECT decrypted_secret INTO base_url
    FROM vault.decrypted_secrets WHERE name = 'opus_admin_base_url';
  SELECT decrypted_secret INTO secret
    FROM vault.decrypted_secrets WHERE name = 'notification_retry_secret';

  base_url := coalesce(base_url, current_setting('app.settings.opus_admin_base_url', true));
  secret   := coalesce(secret,   current_setting('app.settings.notification_retry_secret', true));

  IF base_url IS NULL OR secret IS NULL THEN
    RAISE NOTICE 'notification retry not triggered: store opus_admin_base_url and notification_retry_secret in Vault';
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

REVOKE ALL ON FUNCTION public.trigger_notification_retry() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_notification_retry() TO service_role;

COMMENT ON FUNCTION public.trigger_notification_retry() IS
  'Fires /api/notifications/retry. Reads its base URL and bearer secret from Vault (falling back to app.settings.* where those can be set). Never accepts them as arguments, so no caller can put a credential in cron.job.command.';

-- ---------------------------------------------------------------------------
-- Put the schedule back to a bare call
-- ---------------------------------------------------------------------------
-- cron.schedule upserts by job name, so this replaces the command that carried
-- the inlined secret. The old command text survives in nothing except database
-- backups taken while it was in place.
DO $$
BEGIN
  PERFORM cron.schedule(
    'notification-email-retry',
    '*/10 * * * *',
    'SELECT public.trigger_notification_retry();'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'could not reschedule notification-email-retry: %', SQLERRM;
END $$;

NOTIFY pgrst, 'reload schema';
