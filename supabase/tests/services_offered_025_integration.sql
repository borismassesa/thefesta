\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.services_025_ok(condition BOOLEAN, label TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT COALESCE(condition, false) THEN
    RAISE EXCEPTION 'FAIL: %', label;
  END IF;
END;
$$;

SELECT pg_temp.services_025_ok(
  (SELECT format_type(a.atttypid, a.atttypmod) = 'text[]'
   FROM pg_attribute a
   WHERE a.attrelid = 'public.vendors'::regclass
     AND a.attname = 'services_offered'
     AND NOT a.attisdropped),
  'services_offered remains text[]'
);

SELECT pg_temp.services_025_ok(
  (SELECT NOT a.attnotnull
   FROM pg_attribute a
   WHERE a.attrelid = 'public.vendors'::regclass
     AND a.attname = 'services_offered'
     AND NOT a.attisdropped),
  'services_offered remains nullable'
);

SELECT pg_temp.services_025_ok(
  (SELECT pg_get_expr(d.adbin, d.adrelid) = '''{}''::text[]'
   FROM pg_attribute a
   JOIN pg_attrdef d
     ON d.adrelid = a.attrelid
    AND d.adnum = a.attnum
   WHERE a.attrelid = 'public.vendors'::regclass
     AND a.attname = 'services_offered'
     AND NOT a.attisdropped),
  'services_offered default is empty text[]'
);

SELECT pg_temp.services_025_ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.vendors'::regclass
      AND attname = 'services_offered_new'
      AND NOT attisdropped
  ),
  'no services_offered_new column exists'
);

SELECT pg_temp.services_025_ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.vendors'::regclass
      AND conname = 'services_offered_structure_check'
  ),
  'no abandoned JSONB structure check exists'
);

SELECT pg_temp.services_025_ok(
  (SELECT services_offered IS NULL
   FROM public.vendors
   WHERE id = '02500000-0000-4000-8000-000000000011'),
  'existing null remains null'
);

SELECT pg_temp.services_025_ok(
  (SELECT services_offered = ARRAY[]::text[]
   FROM public.vendors
   WHERE id = '02500000-0000-4000-8000-000000000012'),
  'existing empty array remains unchanged'
);

SELECT pg_temp.services_025_ok(
  (SELECT services_offered = ARRAY['Full Event Planning']::text[]
   FROM public.vendors
   WHERE id = '02500000-0000-4000-8000-000000000013'),
  'single title remains unchanged'
);

SELECT pg_temp.services_025_ok(
  (SELECT services_offered =
      ARRAY['Décor & lighting', 'Guest transport', 'Day-of coordination']::text[]
   FROM public.vendors
   WHERE id = '02500000-0000-4000-8000-000000000014'),
  'multiple, spaced, and Unicode titles remain unchanged'
);

SELECT pg_temp.services_025_ok(
  (SELECT services_offered = ARRAY['DJ', 'dj', repeat('x', 61)]::text[]
   FROM public.vendors
   WHERE id = '02500000-0000-4000-8000-000000000015'),
  'database intentionally permits duplicates and long titles'
);

INSERT INTO public.vendors (
  id,
  slug,
  user_id,
  business_name,
  category
)
VALUES (
  '02500000-0000-4000-8000-000000000016',
  'services-025-default',
  '02500000-0000-4000-8000-000000000001',
  'Default Services',
  'Venues'
);

SELECT pg_temp.services_025_ok(
  (SELECT services_offered = ARRAY[]::text[]
   FROM public.vendors
   WHERE id = '02500000-0000-4000-8000-000000000016'),
  'new rows receive the empty text[] default'
);

SELECT pg_temp.services_025_ok(
  (SELECT relrowsecurity
   FROM pg_class
   WHERE oid = 'public.vendors'::regclass),
  'vendors RLS remains enabled'
);

SELECT pg_temp.services_025_ok(
  EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.vendors'::regclass
      AND tgname = 'update_vendors_updated_at'
      AND NOT tgisinternal
  ),
  'vendors updated_at trigger remains present'
);

SELECT 'MIGRATION 025 SERVICES_OFFERED TESTS PASSED' AS result;
