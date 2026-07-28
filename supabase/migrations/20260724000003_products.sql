-- Product commerce — the products table.
--
-- One row per sellable good, owned by a vendor (vendor-portfolios bucket
-- hosts the images under {vendorId}/storefront/products/). Moderated like
-- storefront sections: vendors edit freely, edits reset status to 'pending',
-- and only admin-approved + vendor-published products from ACTIVE vendors are
-- publicly readable — the same visibility gate the vendors table uses.

CREATE TABLE IF NOT EXISTS public.products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id     uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  category_slug text REFERENCES public.product_categories(slug),
  name          text NOT NULL,
  slug          text NOT NULL,
  description   text,
  highlights    text[] NOT NULL DEFAULT '{}',
  -- TZS integer, Tanzania-first: no fractional money, no free-text prices.
  price_tzs     integer NOT NULL CHECK (price_tzs > 0),
  compare_at_price_tzs integer CHECK (compare_at_price_tzs > price_tzs),
  images        text[] NOT NULL DEFAULT '{}',
  -- NULL = untracked (always orderable); made_to_order also skips decrement.
  stock_quantity integer CHECK (stock_quantity >= 0),
  made_to_order boolean NOT NULL DEFAULT false,
  status        text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('draft', 'pending', 'approved', 'rejected')),
  rejection_note text,
  -- The vendor's own visibility toggle, independent of moderation.
  published     boolean NOT NULL DEFAULT true,
  sort_order    int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_vendor_slug
  ON public.products(vendor_id, slug);
CREATE INDEX IF NOT EXISTS idx_products_public
  ON public.products(category_slug, sort_order)
  WHERE status = 'approved' AND published;

CREATE OR REPLACE FUNCTION public.set_products_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_updated_at ON public.products;
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_products_updated_at();

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Guests/shoppers: only live products from active vendors.
DROP POLICY IF EXISTS "products_public_read" ON public.products;
CREATE POLICY "products_public_read"
  ON public.products FOR SELECT
  USING (
    status = 'approved'
    AND published
    AND EXISTS (
      SELECT 1 FROM public.vendors v
      WHERE v.id = vendor_id AND v.onboarding_status = 'active'
    )
  );

-- Vendor owner/managers: full control of their own products (mirrors the
-- vendors owner-write policies from 20260625000001).
DROP POLICY IF EXISTS "products_vendor_member_all" ON public.products;
CREATE POLICY "products_vendor_member_all"
  ON public.products FOR ALL
  USING (
    is_vendor_member(vendor_id, ARRAY['owner', 'manager']::vendor_member_role[])
  )
  WITH CHECK (
    is_vendor_member(vendor_id, ARRAY['owner', 'manager']::vendor_member_role[])
  );

-- Platform admins: everything (moderation).
DROP POLICY IF EXISTS "products_admin_all" ON public.products;
CREATE POLICY "products_admin_all"
  ON public.products FOR ALL
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

NOTIFY pgrst, 'reload schema';
