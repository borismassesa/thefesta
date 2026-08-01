-- Section A: schema, constraint and privilege verification for
-- 20260731000001_staff_notifications.sql
--
-- Run this in the DEVELOPMENT project immediately after applying the
-- migration. Every row comes back with pass = true/false; a single false is a
-- no-go. Read-only: it inspects catalogs and never writes.
--
--   psql "$SUPABASE_DEV_DB_URL" -f supabase/verification/notifications-schema-checks.sql
--
-- or paste into the development project's SQL editor.

WITH checks AS (

  -- ---- Objects exist -----------------------------------------------------
  SELECT 'A1 workflow_events table' AS check_name,
         to_regclass('public.workflow_events') IS NOT NULL AS pass,
         coalesce(to_regclass('public.workflow_events')::text, 'missing') AS detail
  UNION ALL
  SELECT 'A2 staff_notifications table',
         to_regclass('public.staff_notifications') IS NOT NULL,
         coalesce(to_regclass('public.staff_notifications')::text, 'missing')
  UNION ALL
  SELECT 'A3 staff_notification_preferences table',
         to_regclass('public.staff_notification_preferences') IS NOT NULL,
         coalesce(to_regclass('public.staff_notification_preferences')::text, 'missing')
  UNION ALL
  SELECT 'A4 claim_notification_emails function',
         EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'claim_notification_emails'),
         'expected 1 function'

  -- ---- Idempotency constraint --------------------------------------------
  UNION ALL
  SELECT 'A5 unique(event_id, employee_id, channel)',
         EXISTS (
           SELECT 1 FROM pg_indexes
           WHERE schemaname = 'public'
             AND tablename = 'staff_notifications'
             AND indexdef ILIKE '%UNIQUE%'
             AND indexdef ILIKE '%event_id%'
             AND indexdef ILIKE '%employee_id%'
             AND indexdef ILIKE '%channel%'
         ),
         'the constraint that makes fan-out idempotent'

  -- ---- Check constraints --------------------------------------------------
  UNION ALL
  SELECT 'A6 delivery_status enum constraint',
         EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.staff_notifications'::regclass
                   AND contype = 'c'
                   AND pg_get_constraintdef(oid) ILIKE '%delivery_status%'
                   AND pg_get_constraintdef(oid) ILIKE '%abandoned%'),
         'pending/sending/sent/failed/abandoned'
  UNION ALL
  SELECT 'A7 bell rows cannot enter email delivery states',
         EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.staff_notifications'::regclass
                   AND conname = 'staff_notifications_bell_delivery'),
         'CHECK (channel <> ''bell'' OR delivery_status = ''sent'')'
  UNION ALL
  SELECT 'A8 channel constraint',
         EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.staff_notifications'::regclass
                   AND contype = 'c'
                   AND pg_get_constraintdef(oid) ILIKE '%channel%'
                   AND pg_get_constraintdef(oid) ILIKE '%email%'),
         'bell | email'

  -- ---- Indexes ------------------------------------------------------------
  UNION ALL
  SELECT 'A9 retryable-email partial index',
         EXISTS (SELECT 1 FROM pg_indexes
                 WHERE schemaname = 'public'
                   AND indexname = 'idx_staff_notifications_deliverable'
                   AND indexdef ILIKE '%WHERE%'
                   AND indexdef ILIKE '%pending%'),
         'drives the claim query'
  UNION ALL
  SELECT 'A10 unread bell partial index',
         EXISTS (SELECT 1 FROM pg_indexes
                 WHERE schemaname = 'public'
                   AND indexname = 'idx_staff_notifications_unread'),
         'drives the bell badge'

  -- ---- SECURITY DEFINER hardening ----------------------------------------
  UNION ALL
  SELECT 'A11 claim function is SECURITY DEFINER',
         EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public'
                   AND p.proname = 'claim_notification_emails'
                   AND p.prosecdef),
         'prosecdef = true'
  UNION ALL
  SELECT 'A12 claim function has a fixed search_path',
         EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public'
                   AND p.proname = 'claim_notification_emails'
                   AND array_to_string(coalesce(p.proconfig, '{}'), ',') ILIKE '%search_path%'),
         'without this, SECURITY DEFINER is a privilege-escalation vector'
  UNION ALL
  SELECT 'A13 claim function uses FOR UPDATE SKIP LOCKED',
         EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public'
                   AND p.proname = 'claim_notification_emails'
                   AND pg_get_functiondef(p.oid) ILIKE '%FOR UPDATE SKIP LOCKED%'),
         'the anti-double-send mechanism'
  UNION ALL
  SELECT 'A14 claim function honours max_attempts',
         EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public'
                   AND p.proname = 'claim_notification_emails'
                   AND pg_get_functiondef(p.oid) ILIKE '%attempt_count < p_max_attempts%'),
         'stops an undeliverable address retrying forever'
  UNION ALL
  SELECT 'A15 claim function honours next_attempt_at',
         EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public'
                   AND p.proname = 'claim_notification_emails'
                   AND pg_get_functiondef(p.oid) ILIKE '%next_attempt_at%'),
         'backoff eligibility'

  -- ---- Privileges: the part most likely to be wrong -----------------------
  UNION ALL
  SELECT 'A16 PUBLIC cannot execute claim function',
         NOT has_function_privilege('public', 'public.claim_notification_emails(integer,integer)', 'EXECUTE'),
         'Postgres grants EXECUTE to PUBLIC by default'
  UNION ALL
  SELECT 'A17 anon cannot execute claim function',
         NOT has_function_privilege('anon', 'public.claim_notification_emails(integer,integer)', 'EXECUTE'),
         'otherwise PostgREST exposes it unauthenticated'
  UNION ALL
  SELECT 'A18 authenticated cannot execute claim function',
         NOT has_function_privilege('authenticated', 'public.claim_notification_emails(integer,integer)', 'EXECUTE'),
         'any signed-in user could otherwise mutate delivery state'
  UNION ALL
  SELECT 'A19 service_role CAN execute claim function',
         has_function_privilege('service_role', 'public.claim_notification_emails(integer,integer)', 'EXECUTE'),
         'the worker must be able to call it'

  -- ---- RLS ----------------------------------------------------------------
  UNION ALL
  SELECT 'A20 RLS enabled on all three tables',
         (SELECT bool_and(rowsecurity) FROM pg_tables
          WHERE schemaname = 'public'
            AND tablename IN ('workflow_events','staff_notifications','staff_notification_preferences')),
         'defence in depth behind the service-role client'
  UNION ALL
  SELECT 'A21 workflow_events has no write policy',
         NOT EXISTS (SELECT 1 FROM pg_policies
                     WHERE schemaname = 'public' AND tablename = 'workflow_events'
                       AND cmd <> 'SELECT'),
         'the audit trail must not be writable over the wire'
  UNION ALL
  SELECT 'A22 staff_notifications restricts reads to the owner',
         EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'staff_notifications'
                   AND cmd = 'SELECT' AND qual ILIKE '%workforce_employees%'),
         'one person must not read another person''s inbox'
)
SELECT
  check_name,
  CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result,
  detail
FROM checks
ORDER BY
  -- Failures first: the point of this file is to surface them.
  pass ASC,
  check_name ASC;

-- Summary line. Anything other than 0 failures is a no-go.
-- SELECT count(*) FILTER (WHERE NOT pass) AS failures FROM checks;
