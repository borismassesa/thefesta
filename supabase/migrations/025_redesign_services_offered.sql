-- Historical clean-build correction for migration 025.
--
-- The original migration attempted to replace services_offered TEXT[] with a
-- JSONB array of {title, description} objects. Its CHECK constraint contained
-- a PostgreSQL-prohibited subquery, so it could not apply on a clean database.
-- Production and all active application clients use nullable TEXT[] service-
-- title lists, which remain the canonical model.
--
-- Production migration history intentionally retains the original statements.
-- This source-only correction makes clean-from-zero builds reproducible. A
-- future richer service model requires a separate explicit product migration.

DO $$
DECLARE
  services_type TEXT;
BEGIN
  IF to_regclass('public.vendors') IS NULL THEN
    RAISE EXCEPTION 'migration 025 requires public.vendors';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.vendors'::regclass
      AND attname = 'services_offered_new'
      AND attnum > 0
      AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'migration 025 found unexpected public.vendors.services_offered_new';
  END IF;

  SELECT format_type(atttypid, atttypmod)
  INTO services_type
  FROM pg_attribute
  WHERE attrelid = 'public.vendors'::regclass
    AND attname = 'services_offered'
    AND attnum > 0
    AND NOT attisdropped;

  IF services_type IS NULL THEN
    RAISE EXCEPTION 'migration 025 requires public.vendors.services_offered';
  END IF;

  IF services_type <> 'text[]' THEN
    RAISE EXCEPTION
      'migration 025 expected public.vendors.services_offered text[], found %',
      services_type;
  END IF;
END;
$$;

ALTER TABLE public.vendors
  ALTER COLUMN services_offered SET DEFAULT '{}'::text[];

COMMENT ON COLUMN public.vendors.services_offered IS
  'Nullable list of service-title strings. Rich service objects require a separate product migration.';
