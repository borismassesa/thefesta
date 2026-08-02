-- Minimal final-state identity and membership support for the focused Vendor
-- Availability integration suite. The full migration-chain reset remains a
-- separate gate; these definitions isolate the reconciliation migration from
-- unrelated historical migration failures.

DO $$
BEGIN
  IF to_regtype('public.vendor_member_role') IS NULL THEN
    CREATE TYPE public.vendor_member_role AS ENUM ('owner', 'manager', 'staff');
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.vendor_memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role public.vendor_member_role NOT NULL DEFAULT 'staff',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (vendor_id, user_id)
);

CREATE OR REPLACE FUNCTION public.requesting_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NULLIF(auth.jwt() ->> 'sub', '')::UUID;
$$;

CREATE OR REPLACE FUNCTION public.is_vendor_member(
  vendor_uuid UUID,
  allowed_roles public.vendor_member_role[] DEFAULT
    ARRAY['owner', 'manager', 'staff']::public.vendor_member_role[]
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    public.requesting_user_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.vendor_memberships vm
        WHERE vm.vendor_id = vendor_uuid
          AND vm.user_id = public.requesting_user_id()
          AND vm.status = 'active'
          AND vm.role = ANY(allowed_roles)
      )
      OR (
        'owner' = ANY(allowed_roles)
        AND EXISTS (
          SELECT 1
          FROM public.vendors v
          WHERE v.id = vendor_uuid
            AND v.user_id = public.requesting_user_id()
        )
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.requesting_user_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_vendor_member(UUID, public.vendor_member_role[])
  TO authenticated, service_role;
