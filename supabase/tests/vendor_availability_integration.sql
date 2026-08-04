\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.va_ok(condition BOOLEAN, label TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT COALESCE(condition, false) THEN
    RAISE EXCEPTION 'FAIL: %', label;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.va_must_fail(statement TEXT, label TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;

  RAISE EXCEPTION 'FAIL: expected rejection for %', label;
END;
$$;

INSERT INTO public.users (id, email, password, name)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'va-owner-1@example.invalid', 'test-only', 'Owner One'),
  ('22222222-2222-2222-2222-222222222222', 'va-manager@example.invalid', 'test-only', 'Manager'),
  ('33333333-3333-3333-3333-333333333333', 'va-staff@example.invalid', 'test-only', 'Staff'),
  ('44444444-4444-4444-4444-444444444444', 'va-outsider@example.invalid', 'test-only', 'Outsider'),
  ('55555555-5555-5555-5555-555555555555', 'va-owner-2@example.invalid', 'test-only', 'Owner Two');

INSERT INTO public.vendors (id, slug, user_id, business_name, category)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'va-vendor-one', '11111111-1111-1111-1111-111111111111', 'Vendor One', 'Photographers'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'va-vendor-two', '55555555-5555-5555-5555-555555555555', 'Vendor Two', 'Photographers');

INSERT INTO public.vendor_memberships (vendor_id, user_id, role, status)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'manager', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'staff', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', 'owner', 'active');

SELECT pg_temp.va_ok(
  (SELECT count(*) FROM public.get_vendor_availability(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2028-02-29', '2028-02-29'
  )) = 1,
  'one-day range returns one row'
);

SELECT pg_temp.va_ok(
  (SELECT count(*) FROM public.get_vendor_availability(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2028-02-27', '2028-03-02'
  )) = 5,
  'leap-year and month-boundary range is inclusive'
);

SELECT pg_temp.va_ok(
  (SELECT count(*) FROM public.get_vendor_availability(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2027-12-30', '2028-01-02'
  )) = 4,
  'year-boundary range is inclusive'
);

SELECT pg_temp.va_ok(
  (SELECT bool_and(is_available) FROM public.get_vendor_availability(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2029-01-01', '2029-01-03'
  )),
  'missing rows default to available'
);

SELECT pg_temp.va_ok(
  (SELECT array_agg(date) FROM public.get_vendor_availability(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2029-01-01', '2029-01-03'
  )) = ARRAY['2029-01-01'::date, '2029-01-02'::date, '2029-01-03'::date],
  'range results are ordered ascending'
);

SELECT pg_temp.va_ok(
  (SELECT count(*) FROM public.get_vendor_availability(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2029-01-03', '2029-01-01'
  )) = 0,
  'start date after end date returns zero rows'
);

SELECT pg_temp.va_ok(
  (SELECT count(*) FROM public.get_vendor_availability(NULL, '2029-01-01', '2029-01-02')) = 0
  AND public.check_vendor_availability(NULL, '2029-01-01') IS NULL,
  'null arguments have explicit empty/null behavior'
);

INSERT INTO public.vendor_availability (vendor_id, date, is_available, reason)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2029-02-01', false, 'Test block');

SELECT pg_temp.va_ok(
  (SELECT NOT is_available AND reason = 'Test block'
   FROM public.get_vendor_availability(
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2029-02-01', '2029-02-01'
   )),
  'explicit unavailable row returns false and its reason'
);

UPDATE public.vendor_availability
SET is_available = true, reason = 'Available by vendor'
WHERE vendor_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND date = '2029-02-01';

SELECT pg_temp.va_ok(
  (SELECT is_available AND reason = 'Available by vendor'
   FROM public.get_vendor_availability(
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2029-02-01', '2029-02-01'
   )),
  'explicit available row preserves its reason'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

INSERT INTO public.vendor_availability (vendor_id, date, is_available, reason)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2030-01-01', false, 'Owner block')
ON CONFLICT (vendor_id, date)
DO UPDATE SET is_available = EXCLUDED.is_available, reason = EXCLUDED.reason;

SELECT pg_temp.va_ok(
  (SELECT count(*) FROM public.vendor_availability
   WHERE vendor_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') > 0,
  'owner can read own availability'
);

SELECT pg_temp.va_ok(
  (SELECT count(*) FROM public.vendor_availability
   WHERE vendor_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') = 0,
  'owner cannot directly read another vendor availability'
);

SELECT pg_temp.va_must_fail(
  $$SELECT * FROM public.get_vendor_availability(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2030-01-01', '2030-01-02'
  )$$,
  'owner RPC read for another vendor'
);

SELECT pg_temp.va_must_fail(
  $$INSERT INTO public.vendor_availability (vendor_id, date)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2030-01-01')$$,
  'duplicate vendor/date'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',
  true
);

UPDATE public.vendor_availability
SET reason = 'Manager update'
WHERE vendor_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND date = '2030-01-01';

SELECT pg_temp.va_ok(
  (SELECT reason = 'Manager update'
   FROM public.vendor_availability
   WHERE vendor_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND date = '2030-01-01'),
  'manager can update own vendor availability'
);

RESET ROLE;
UPDATE public.vendor_availability
SET updated_at = '2000-01-01 00:00:00+00'
WHERE vendor_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND date = '2030-01-01';

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);
UPDATE public.vendor_availability
SET reason = 'Trigger update'
WHERE vendor_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND date = '2030-01-01';
RESET ROLE;

SELECT pg_temp.va_ok(
  (SELECT updated_at > '2000-01-01 00:00:00+00'
   FROM public.vendor_availability
   WHERE vendor_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND date = '2030-01-01'),
  'updated_at trigger advances the timestamp'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

SELECT pg_temp.va_ok(
  (SELECT count(*) FROM public.get_vendor_availability(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2030-01-01', '2030-01-02'
  )) = 2,
  'staff can read own vendor availability through the RPC'
);

SELECT pg_temp.va_must_fail(
  $$INSERT INTO public.vendor_availability (vendor_id, date)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2030-01-02')$$,
  'staff availability write'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}',
  true
);

SELECT pg_temp.va_must_fail(
  $$SELECT * FROM public.get_vendor_availability(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2030-01-01', '2030-01-02'
  )$$,
  'unrelated authenticated RPC read'
);

SELECT pg_temp.va_must_fail(
  $$INSERT INTO public.vendor_availability (vendor_id, date)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2030-01-03')$$,
  'unrelated authenticated write'
);

RESET ROLE;
SET LOCAL ROLE service_role;
INSERT INTO public.vendor_availability (vendor_id, date, is_available)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2030-02-01', true);
SELECT pg_temp.va_ok(
  (SELECT count(*) FROM public.get_vendor_availability(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2030-02-01', '2030-02-01'
  )) = 1,
  'service role can write and execute the RPC'
);
RESET ROLE;

SELECT pg_temp.va_ok(
  has_table_privilege('authenticated', 'public.vendor_availability', 'SELECT')
  AND has_table_privilege('authenticated', 'public.vendor_availability', 'INSERT')
  AND has_table_privilege('authenticated', 'public.vendor_availability', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.vendor_availability', 'DELETE')
  AND NOT has_table_privilege('anon', 'public.vendor_availability', 'SELECT'),
  'table grants are least-privilege for client roles'
);

SELECT pg_temp.va_ok(
  has_function_privilege(
    'authenticated',
    'public.get_vendor_availability(uuid,date,date)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'service_role',
    'public.get_vendor_availability(uuid,date,date)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.get_vendor_availability(uuid,date,date)',
    'EXECUTE'
  ),
  'RPC execute grants exclude anonymous callers'
);

SELECT pg_temp.va_ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(
      COALESCE(p.proacl, acldefault('f', p.proowner))
    ) acl
    WHERE p.oid IN (
      'public.get_vendor_availability(uuid,date,date)'::regprocedure,
      'public.check_vendor_availability(uuid,date)'::regprocedure
    )
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC has no RPC execute grant'
);

SELECT pg_temp.va_ok(
  (SELECT relrowsecurity FROM pg_class
   WHERE oid = 'public.vendor_availability'::regclass)
  AND (
    SELECT count(*) = 3
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vendor_availability'
      AND roles = ARRAY['authenticated']::name[]
  ),
  'RLS is enabled with three authenticated-only policies'
);

SELECT pg_temp.va_ok(
  (SELECT count(*) = 4
   FROM pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'vendor_availability'
     AND indexname IN (
       'idx_vendor_availability_vendor_id',
       'idx_vendor_availability_date',
       'idx_vendor_availability_vendor_date',
       'idx_vendor_availability_available'
     )),
  'four canonical availability indexes exist exactly once'
);

SELECT pg_temp.va_ok(
  EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.vendor_availability'::regclass
      AND tgname = 'update_vendor_availability_updated_at'
      AND tgenabled = 'O'
      AND NOT tgisinternal
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.inquiries'::regclass
      AND tgname = 'sync_inquiry_availability'
      AND NOT tgisinternal
  ),
  'updated_at trigger is enabled and inquiry sync remains disabled'
);

SELECT pg_temp.va_ok(
  (SELECT NOT prosecdef
          AND provolatile = 's'
          AND array_to_string(proconfig, ',') LIKE 'search_path=%'
   FROM pg_proc
   WHERE oid = 'public.get_vendor_availability(uuid,date,date)'::regprocedure),
  'range RPC is stable security-invoker with an explicit search_path'
);

ROLLBACK;

SELECT 'VENDOR AVAILABILITY TESTS PASSED' AS result;
