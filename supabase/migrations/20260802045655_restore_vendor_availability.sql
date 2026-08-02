-- Restore Vendor Availability after confirmed production schema drift.
--
-- Migration 007 is corrected in source only so clean-from-zero databases can
-- progress. Production retains the original 007 history record, so this
-- forward migration independently reconciles both known states:
--   1. production, where the table is absent but its functions remain; and
--   2. clean databases, where migrations 007 and 009 already created it.
--
-- This migration does not restore inquiry synchronization. Its legacy trigger
-- misses accepted-inquiry date/vendor changes and was deliberately left absent
-- by 20260724170000. Availability remains vendor-managed until that workflow is
-- redesigned and verified separately.

SELECT pg_advisory_xact_lock(
  hashtextextended('public.vendor_availability:20260802045655', 0)
);

DO $$
DECLARE
  expected RECORD;
  actual_type TEXT;
  actual_not_null BOOLEAN;
  actual_default TEXT;
  availability_table REGCLASS;
  id_attnum SMALLINT;
  vendor_attnum SMALLINT;
  date_attnum SMALLINT;
  vendors_id_attnum SMALLINT;
BEGIN
  IF to_regclass('public.vendors') IS NULL THEN
    RAISE EXCEPTION 'vendor availability reconciliation requires public.vendors';
  END IF;

  IF to_regtype('public.vendor_member_role') IS NULL THEN
    RAISE EXCEPTION 'vendor availability reconciliation requires public.vendor_member_role';
  END IF;

  IF to_regprocedure('public.is_vendor_member(uuid,vendor_member_role[])') IS NULL THEN
    RAISE EXCEPTION 'vendor availability reconciliation requires public.is_vendor_member(uuid, vendor_member_role[])';
  END IF;

  IF to_regprocedure('public.update_updated_at_column()') IS NULL THEN
    RAISE EXCEPTION 'vendor availability reconciliation requires public.update_updated_at_column()';
  END IF;

  availability_table := to_regclass('public.vendor_availability');

  IF availability_table IS NULL THEN
    CREATE TABLE public.vendor_availability (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      is_available BOOLEAN DEFAULT true,
      reason TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (vendor_id, date)
    );

    availability_table := 'public.vendor_availability'::regclass;
  END IF;

  FOR expected IN
    SELECT *
    FROM (VALUES
      ('id', 'uuid', true),
      ('vendor_id', 'uuid', true),
      ('date', 'date', true),
      ('is_available', 'boolean', false),
      ('reason', 'text', false),
      ('created_at', 'timestamp with time zone', false),
      ('updated_at', 'timestamp with time zone', false)
    ) AS required(column_name, type_name, not_null)
  LOOP
    SELECT
      format_type(a.atttypid, a.atttypmod),
      a.attnotnull,
      pg_get_expr(ad.adbin, ad.adrelid)
    INTO actual_type, actual_not_null, actual_default
    FROM pg_attribute a
    LEFT JOIN pg_attrdef ad
      ON ad.adrelid = a.attrelid
     AND ad.adnum = a.attnum
    WHERE a.attrelid = availability_table
      AND a.attname = expected.column_name
      AND a.attnum > 0
      AND NOT a.attisdropped;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'public.vendor_availability is incompatible: missing column %', expected.column_name;
    END IF;

    IF actual_type <> expected.type_name THEN
      RAISE EXCEPTION
        'public.vendor_availability is incompatible: column % has type %, expected %',
        expected.column_name,
        actual_type,
        expected.type_name;
    END IF;

    IF actual_not_null <> expected.not_null THEN
      RAISE EXCEPTION
        'public.vendor_availability is incompatible: column % nullability differs',
        expected.column_name;
    END IF;

    IF expected.column_name = 'id'
       AND (actual_default IS NULL OR actual_default NOT ILIKE '%uuid_generate_v4%') THEN
      RAISE EXCEPTION 'public.vendor_availability is incompatible: id default differs';
    ELSIF expected.column_name = 'is_available'
       AND COALESCE(actual_default, '') NOT IN ('true', 'true::boolean') THEN
      RAISE EXCEPTION 'public.vendor_availability is incompatible: is_available default differs';
    ELSIF expected.column_name IN ('created_at', 'updated_at')
       AND (
         actual_default IS NULL
         OR (actual_default NOT ILIKE '%CURRENT_TIMESTAMP%' AND actual_default NOT ILIKE '%now()%')
       ) THEN
      RAISE EXCEPTION
        'public.vendor_availability is incompatible: column % default differs',
        expected.column_name;
    ELSIF expected.column_name IN ('vendor_id', 'date', 'reason')
       AND actual_default IS NOT NULL THEN
      RAISE EXCEPTION
        'public.vendor_availability is incompatible: column % has an unexpected default',
        expected.column_name;
    END IF;
  END LOOP;

  SELECT attnum INTO id_attnum
  FROM pg_attribute
  WHERE attrelid = availability_table AND attname = 'id' AND NOT attisdropped;

  SELECT attnum INTO vendor_attnum
  FROM pg_attribute
  WHERE attrelid = availability_table AND attname = 'vendor_id' AND NOT attisdropped;

  SELECT attnum INTO date_attnum
  FROM pg_attribute
  WHERE attrelid = availability_table AND attname = 'date' AND NOT attisdropped;

  SELECT attnum INTO vendors_id_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.vendors'::regclass AND attname = 'id' AND NOT attisdropped;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = availability_table
      AND contype = 'p'
      AND conkey <> ARRAY[id_attnum]::smallint[]
  ) THEN
    RAISE EXCEPTION 'public.vendor_availability is incompatible: primary key is not id';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = availability_table
      AND contype = 'p'
      AND conkey = ARRAY[id_attnum]::smallint[]
  ) THEN
    ALTER TABLE public.vendor_availability
      ADD CONSTRAINT vendor_availability_pkey PRIMARY KEY (id);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = availability_table
      AND contype = 'f'
      AND vendor_attnum = ANY(conkey)
      AND NOT (
        conkey = ARRAY[vendor_attnum]::smallint[]
        AND confrelid = 'public.vendors'::regclass
        AND confkey = ARRAY[vendors_id_attnum]::smallint[]
        AND confdeltype = 'c'
      )
  ) THEN
    RAISE EXCEPTION 'public.vendor_availability is incompatible: vendor_id foreign key differs';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = availability_table
      AND contype = 'f'
      AND conkey = ARRAY[vendor_attnum]::smallint[]
      AND confrelid = 'public.vendors'::regclass
      AND confkey = ARRAY[vendors_id_attnum]::smallint[]
      AND confdeltype = 'c'
  ) THEN
    ALTER TABLE public.vendor_availability
      ADD CONSTRAINT vendor_availability_vendor_id_fkey
      FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = availability_table
      AND contype = 'u'
      AND conkey = ARRAY[vendor_attnum, date_attnum]::smallint[]
  ) THEN
    ALTER TABLE public.vendor_availability
      ADD CONSTRAINT vendor_availability_vendor_id_date_key UNIQUE (vendor_id, date);
  END IF;
END;
$$;

-- Preserve the four legacy index definitions. Each block first looks for an
-- equivalent index under any name and fails on a conflicting canonical name.
DO $$
DECLARE
  availability_table REGCLASS := 'public.vendor_availability'::regclass;
BEGIN
  IF to_regclass('public.idx_vendor_availability_vendor_id') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_index i
       WHERE i.indexrelid = to_regclass('public.idx_vendor_availability_vendor_id')
         AND i.indrelid = availability_table
         AND i.indnkeyatts = 1
         AND NOT i.indisunique
         AND i.indpred IS NULL
         AND pg_get_indexdef(i.indexrelid, 1, true) = 'vendor_id'
     ) THEN
    RAISE EXCEPTION 'index idx_vendor_availability_vendor_id has an incompatible definition';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = availability_table
      AND i.indnkeyatts = 1
      AND NOT i.indisunique
      AND i.indpred IS NULL
      AND pg_get_indexdef(i.indexrelid, 1, true) = 'vendor_id'
  ) THEN
    CREATE INDEX idx_vendor_availability_vendor_id
      ON public.vendor_availability (vendor_id);
  END IF;

  IF to_regclass('public.idx_vendor_availability_date') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_index i
       WHERE i.indexrelid = to_regclass('public.idx_vendor_availability_date')
         AND i.indrelid = availability_table
         AND i.indnkeyatts = 1
         AND NOT i.indisunique
         AND i.indpred IS NULL
         AND pg_get_indexdef(i.indexrelid, 1, true) = 'date'
     ) THEN
    RAISE EXCEPTION 'index idx_vendor_availability_date has an incompatible definition';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = availability_table
      AND i.indnkeyatts = 1
      AND NOT i.indisunique
      AND i.indpred IS NULL
      AND pg_get_indexdef(i.indexrelid, 1, true) = 'date'
  ) THEN
    CREATE INDEX idx_vendor_availability_date
      ON public.vendor_availability (date);
  END IF;

  IF to_regclass('public.idx_vendor_availability_vendor_date') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_index i
       WHERE i.indexrelid = to_regclass('public.idx_vendor_availability_vendor_date')
         AND i.indrelid = availability_table
         AND i.indnkeyatts = 2
         AND NOT i.indisunique
         AND i.indpred IS NULL
         AND pg_get_indexdef(i.indexrelid, 1, true) = 'vendor_id'
         AND pg_get_indexdef(i.indexrelid, 2, true) = 'date'
     ) THEN
    RAISE EXCEPTION 'index idx_vendor_availability_vendor_date has an incompatible definition';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = availability_table
      AND i.indnkeyatts = 2
      AND NOT i.indisunique
      AND i.indpred IS NULL
      AND pg_get_indexdef(i.indexrelid, 1, true) = 'vendor_id'
      AND pg_get_indexdef(i.indexrelid, 2, true) = 'date'
  ) THEN
    CREATE INDEX idx_vendor_availability_vendor_date
      ON public.vendor_availability (vendor_id, date);
  END IF;

  IF to_regclass('public.idx_vendor_availability_available') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_index i
       WHERE i.indexrelid = to_regclass('public.idx_vendor_availability_available')
         AND i.indrelid = availability_table
         AND i.indnkeyatts = 2
         AND NOT i.indisunique
         AND pg_get_indexdef(i.indexrelid, 1, true) = 'vendor_id'
         AND pg_get_indexdef(i.indexrelid, 2, true) = 'is_available'
         AND regexp_replace(pg_get_expr(i.indpred, i.indrelid, true), '[()]', '', 'g')
             IN ('is_available = false', 'NOT is_available')
     ) THEN
    RAISE EXCEPTION 'index idx_vendor_availability_available has an incompatible definition';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = availability_table
      AND i.indnkeyatts = 2
      AND NOT i.indisunique
      AND pg_get_indexdef(i.indexrelid, 1, true) = 'vendor_id'
      AND pg_get_indexdef(i.indexrelid, 2, true) = 'is_available'
      AND regexp_replace(pg_get_expr(i.indpred, i.indrelid, true), '[()]', '', 'g')
          IN ('is_available = false', 'NOT is_available')
  ) THEN
    CREATE INDEX idx_vendor_availability_available
      ON public.vendor_availability (vendor_id, is_available)
      WHERE is_available = false;
  END IF;
END;
$$;

ALTER TABLE public.vendor_availability ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.vendor_availability FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.vendor_availability TO authenticated;
GRANT ALL ON TABLE public.vendor_availability TO service_role;

DROP POLICY IF EXISTS "Anyone can view vendor availability" ON public.vendor_availability;
DROP POLICY IF EXISTS "Vendors can manage their own availability" ON public.vendor_availability;
DROP POLICY IF EXISTS vendor_availability_member_read ON public.vendor_availability;
DROP POLICY IF EXISTS vendor_availability_admin_insert ON public.vendor_availability;
DROP POLICY IF EXISTS vendor_availability_admin_update ON public.vendor_availability;

CREATE POLICY vendor_availability_member_read
  ON public.vendor_availability
  FOR SELECT
  TO authenticated
  USING (
    public.is_vendor_member(
      vendor_id,
      ARRAY['owner', 'manager', 'staff']::public.vendor_member_role[]
    )
  );

CREATE POLICY vendor_availability_admin_insert
  ON public.vendor_availability
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_vendor_member(
      vendor_id,
      ARRAY['owner', 'manager']::public.vendor_member_role[]
    )
  );

CREATE POLICY vendor_availability_admin_update
  ON public.vendor_availability
  FOR UPDATE
  TO authenticated
  USING (
    public.is_vendor_member(
      vendor_id,
      ARRAY['owner', 'manager']::public.vendor_member_role[]
    )
  )
  WITH CHECK (
    public.is_vendor_member(
      vendor_id,
      ARRAY['owner', 'manager']::public.vendor_member_role[]
    )
  );

DO $$
DECLARE
  proc RECORD;
BEGIN
  FOR proc IN
    SELECT p.oid::regprocedure AS identity
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_vendor_availability'
      AND NOT (
        p.pronargs = 3
        AND p.proargtypes[0] = 'uuid'::regtype
        AND p.proargtypes[1] = 'date'::regtype
        AND p.proargtypes[2] = 'date'::regtype
      )
  LOOP
    RAISE EXCEPTION 'incompatible function overload exists: %', proc.identity;
  END LOOP;

  FOR proc IN
    SELECT p.oid::regprocedure AS identity
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'check_vendor_availability'
      AND NOT (
        p.pronargs = 2
        AND p.proargtypes[0] = 'uuid'::regtype
        AND p.proargtypes[1] = 'date'::regtype
      )
  LOOP
    RAISE EXCEPTION 'incompatible function overload exists: %', proc.identity;
  END LOOP;

  IF to_regprocedure('public.get_vendor_availability(uuid,date,date)') IS NOT NULL
     AND pg_get_function_result(
       to_regprocedure('public.get_vendor_availability(uuid,date,date)')
     ) <> 'TABLE(date date, is_available boolean, reason text)' THEN
    RAISE EXCEPTION 'public.get_vendor_availability has an incompatible return type';
  END IF;

  IF to_regprocedure('public.check_vendor_availability(uuid,date)') IS NOT NULL
     AND pg_get_function_result(
       to_regprocedure('public.check_vendor_availability(uuid,date)')
     ) <> 'boolean' THEN
    RAISE EXCEPTION 'public.check_vendor_availability has an incompatible return type';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_vendor_availability(
  vendor_uuid UUID,
  start_date DATE,
  end_date DATE
)
RETURNS TABLE (
  date DATE,
  is_available BOOLEAN,
  reason TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF vendor_uuid IS NULL OR start_date IS NULL OR end_date IS NULL THEN
    RETURN;
  END IF;

  IF current_user NOT IN ('postgres', 'service_role')
     AND NOT public.is_vendor_member(
       vendor_uuid,
       ARRAY['owner', 'manager', 'staff']::public.vendor_member_role[]
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'vendor availability access denied';
  END IF;

  RETURN QUERY
  SELECT
    d.generated_date::DATE AS date,
    COALESCE(va.is_available, true) AS is_available,
    va.reason
  FROM pg_catalog.generate_series(
    start_date::timestamp,
    end_date::timestamp,
    interval '1 day'
  ) AS d(generated_date)
  LEFT JOIN public.vendor_availability va
    ON va.vendor_id = vendor_uuid
   AND va.date = d.generated_date::DATE
  ORDER BY d.generated_date;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_vendor_availability(
  vendor_uuid UUID,
  check_date DATE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  availability_status BOOLEAN;
BEGIN
  IF vendor_uuid IS NULL OR check_date IS NULL THEN
    RETURN NULL;
  END IF;

  IF current_user NOT IN ('postgres', 'service_role')
     AND NOT public.is_vendor_member(
       vendor_uuid,
       ARRAY['owner', 'manager', 'staff']::public.vendor_member_role[]
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'vendor availability access denied';
  END IF;

  SELECT COALESCE(va.is_available, true)
  INTO availability_status
  FROM public.vendor_availability va
  WHERE va.vendor_id = vendor_uuid
    AND va.date = check_date;

  RETURN COALESCE(availability_status, true);
END;
$$;

REVOKE ALL ON FUNCTION public.get_vendor_availability(UUID, DATE, DATE)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.check_vendor_availability(UUID, DATE)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_vendor_availability(UUID, DATE, DATE)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_vendor_availability(UUID, DATE)
  TO authenticated, service_role;

DROP TRIGGER IF EXISTS update_vendor_availability_updated_at
  ON public.vendor_availability;
CREATE TRIGGER update_vendor_availability_updated_at
  BEFORE UPDATE ON public.vendor_availability
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DO $$
BEGIN
  -- Keep the legacy inquiry synchronization disabled. The functions remain so
  -- this migration does not remove an API surface during a storage repair, but
  -- neither function is directly callable by end-user or service roles.
  IF to_regclass('public.inquiries') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS sync_inquiry_availability ON public.inquiries;
  END IF;

  IF to_regprocedure('public.sync_inquiry_to_availability()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.sync_inquiry_to_availability()
      FROM PUBLIC, anon, authenticated, service_role;
  END IF;

  IF to_regprocedure('public.sync_all_inquiries_to_availability()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.sync_all_inquiries_to_availability()
      FROM PUBLIC, anon, authenticated, service_role;
  END IF;
END;
$$;

COMMENT ON TABLE public.vendor_availability IS
  'Vendor-managed calendar availability restored after confirmed production schema drift.';
COMMENT ON FUNCTION public.get_vendor_availability(UUID, DATE, DATE) IS
  'Returns an inclusive availability date range for an authorized vendor member.';
COMMENT ON FUNCTION public.check_vendor_availability(UUID, DATE) IS
  'Checks one date for an authorized vendor member; missing rows default to available.';

NOTIFY pgrst, 'reload schema';
