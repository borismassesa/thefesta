-- Workspace scheduled workers read their URL and bearer credentials from
-- Supabase Vault.
--
-- Hosted Supabase does not allow the dashboard role to run
-- `ALTER DATABASE ... SET app.settings.*`. The original Workspace cron
-- migrations deliberately no-op when those settings are absent, which leaves
-- stale attendance sessions open and stops automatic report, tracker and
-- leave maintenance. Notification retry already uses Vault for the same
-- hosted-project constraint (20260802020000_notification_retry_vault.sql).
--
-- Keep current_setting() as a fallback for self-hosted/local environments, but
-- prefer encrypted Vault values in production. No credential is accepted as a
-- function argument or written into cron.job.command.

CREATE OR REPLACE FUNCTION public.trigger_attendance_maintenance()
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
    FROM vault.decrypted_secrets WHERE name = 'attendance_cron_secret';

  base_url := coalesce(base_url, current_setting('app.settings.opus_admin_base_url', true));
  secret   := coalesce(secret, current_setting('app.settings.attendance_cron_secret', true));

  IF base_url IS NULL OR secret IS NULL THEN
    RAISE NOTICE 'attendance maintenance not triggered: store opus_admin_base_url and attendance_cron_secret in Vault';
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

CREATE OR REPLACE FUNCTION public.trigger_report_maintenance()
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
    FROM vault.decrypted_secrets WHERE name = 'reports_cron_secret';

  base_url := coalesce(base_url, current_setting('app.settings.opus_admin_base_url', true));
  secret   := coalesce(secret, current_setting('app.settings.reports_cron_secret', true));

  IF base_url IS NULL OR secret IS NULL THEN
    RAISE NOTICE 'report maintenance not triggered: store opus_admin_base_url and reports_cron_secret in Vault';
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

CREATE OR REPLACE FUNCTION public.trigger_tracker_maintenance()
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
    FROM vault.decrypted_secrets WHERE name = 'tracker_cron_secret';

  base_url := coalesce(base_url, current_setting('app.settings.opus_admin_base_url', true));
  secret   := coalesce(secret, current_setting('app.settings.tracker_cron_secret', true));

  IF base_url IS NULL OR secret IS NULL THEN
    RAISE NOTICE 'tracker maintenance not triggered: store opus_admin_base_url and tracker_cron_secret in Vault';
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

CREATE OR REPLACE FUNCTION public.trigger_leave_maintenance()
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
    FROM vault.decrypted_secrets WHERE name = 'leave_cron_secret';

  base_url := coalesce(base_url, current_setting('app.settings.opus_admin_base_url', true));
  secret   := coalesce(secret, current_setting('app.settings.leave_cron_secret', true));

  IF base_url IS NULL OR secret IS NULL THEN
    RAISE NOTICE 'leave maintenance not triggered: store opus_admin_base_url and leave_cron_secret in Vault';
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

REVOKE ALL ON FUNCTION public.trigger_attendance_maintenance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trigger_report_maintenance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trigger_tracker_maintenance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trigger_leave_maintenance() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.trigger_attendance_maintenance() TO service_role;
GRANT EXECUTE ON FUNCTION public.trigger_report_maintenance() TO service_role;
GRANT EXECUTE ON FUNCTION public.trigger_tracker_maintenance() TO service_role;
GRANT EXECUTE ON FUNCTION public.trigger_leave_maintenance() TO service_role;

COMMENT ON FUNCTION public.trigger_attendance_maintenance() IS
  'Fires attendance maintenance using encrypted Vault configuration, with app.settings fallback for self-hosted environments. Service-role only.';
COMMENT ON FUNCTION public.trigger_report_maintenance() IS
  'Fires report maintenance using encrypted Vault configuration, with app.settings fallback for self-hosted environments. Service-role only.';
COMMENT ON FUNCTION public.trigger_tracker_maintenance() IS
  'Fires tracker maintenance using encrypted Vault configuration, with app.settings fallback for self-hosted environments. Service-role only.';
COMMENT ON FUNCTION public.trigger_leave_maintenance() IS
  'Fires leave maintenance using encrypted Vault configuration, with app.settings fallback for self-hosted environments. Service-role only.';

NOTIFY pgrst, 'reload schema';
