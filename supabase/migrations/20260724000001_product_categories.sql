-- Product commerce (Zola-style shop) — shop taxonomy.
--
-- Product categories are the guest-facing browse taxonomy for the registry
-- shop (Kitchen, Tabletop, Linens…) and are deliberately SEPARATE from
-- vendor_categories, which classify the vendor's BUSINESS (Caterer, Venue,
-- Home & Kitchen shop…). Admin-managed like vendor_categories: add/hide
-- categories from the admin app without a code rebuild.

CREATE TABLE IF NOT EXISTS public.product_categories (
  slug        text PRIMARY KEY,
  label       text NOT NULL,
  icon        text NOT NULL DEFAULT 'Gift',
  hero_image  text,
  sort_order  int  NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed aligned with the registry shop categories already used by
-- opus_website /registry and the OpusPass gift-registry shop.
INSERT INTO public.product_categories (slug, label, icon, sort_order)
VALUES
  ('kitchen-dining',  'Kitchen & Dining',   'CookingPot',  1),
  ('tabletop-bar',    'Tabletop & Bar',     'Wine',        2),
  ('bed-bath',        'Bed & Bath',         'BedDouble',   3),
  ('home-decor',      'Home & Décor',       'Lamp',        4),
  ('outdoor-weekend', 'Outdoor & Weekend',  'TentTree',    5),
  ('gifts-keepsakes', 'Gifts & Keepsakes',  'Gift',        6)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

-- Anyone can read active categories (shop browse, portal product editor).
DROP POLICY IF EXISTS "product_categories_public_read" ON public.product_categories;
CREATE POLICY "product_categories_public_read"
  ON public.product_categories FOR SELECT
  USING (active = true);

-- Admins (role = 'admin') can do full CRUD.
DROP POLICY IF EXISTS "product_categories_admin_all" ON public.product_categories;
CREATE POLICY "product_categories_admin_all"
  ON public.product_categories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE OR REPLACE FUNCTION public.set_product_categories_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_categories_updated_at ON public.product_categories;
CREATE TRIGGER product_categories_updated_at
  BEFORE UPDATE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_product_categories_updated_at();

NOTIFY pgrst, 'reload schema';
