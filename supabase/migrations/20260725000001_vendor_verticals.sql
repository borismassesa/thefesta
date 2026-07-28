-- Vendor verticals — which OpusFesta surface a vendor belongs to.
--
-- Until now "what kind of vendor is this?" was implicit in
-- `vendor_categories.sells_products`, a boolean that only answered "does this
-- vendor list goods?". That is not enough: attire & rings vendors also sell
-- goods, but they belong on their own storefront surface, NOT in the gift
-- registry. And because nothing filtered by vendor type, product vendors leaked
-- into the public wedding-vendor directory alongside caterers and venues.
--
-- `vertical` makes it explicit and single-valued:
--   service       — wedding service vendors (MC, caterer, venue, photographer…)
--                   → public vendor directory, bookings, leads, packages
--   gift_shop     — product vendors whose goods appear in the gift registry
--   attire_rings  — attire, jewellery and rings vendors (their own surface)
--
-- Source of truth is `vendor_categories.vertical` (a business category belongs
-- to exactly one vertical). It is denormalised onto `vendors.vertical` so every
-- public surface is a single indexed `.eq('vertical', …)` instead of a join.
-- `sells_products` stays as the "has a Products tab" flag and is now simply
-- `vertical <> 'service'`.

-- ── vendor_categories.vertical ──────────────────────────────────────────────

ALTER TABLE public.vendor_categories
  ADD COLUMN IF NOT EXISTS vertical text NOT NULL DEFAULT 'service';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendor_categories_vertical_check'
  ) THEN
    ALTER TABLE public.vendor_categories
      ADD CONSTRAINT vendor_categories_vertical_check
      CHECK (vertical IN ('service', 'gift_shop', 'attire_rings'));
  END IF;
END $$;

-- Existing product categories (home-kitchen / decor-gifts / linens) are all
-- registry shops — they were seeded by 20260724000002 with sells_products=true.
UPDATE public.vendor_categories
   SET vertical = 'gift_shop'
 WHERE sells_products = true
   AND vertical = 'service';

-- Attire & rings business categories. These sell products on the same rails as
-- the registry shops (products / product_order_lines / vendor_earnings) but
-- surface on the attire-and-rings pages, never in the gift registry.
INSERT INTO public.vendor_categories
  (slug, label, profile_label, db_value, icon, sort_order, sells_products, vertical)
VALUES
  ('bridal-wear', 'Bridal wear & gowns',   'Bridal wear', 'Bridal Wear', 'Shirt',  20, true, 'attire_rings'),
  ('suits',       'Suits & menswear',      'Suits',       'Suits',       'Shirt',  21, true, 'attire_rings'),
  ('rings',       'Wedding & engagement rings', 'Rings',  'Rings',       'Gem',    22, true, 'attire_rings'),
  ('jewelry',     'Jewellery & accessories', 'Jewellery', 'Jewellery',   'Gem',    23, true, 'attire_rings')
ON CONFLICT (slug) DO UPDATE
  SET vertical       = EXCLUDED.vertical,
      sells_products = EXCLUDED.sells_products;

-- ── vendors.vertical ────────────────────────────────────────────────────────
--
-- Denormalised from the chosen business category at submit time. Defaults to
-- 'service' so every existing vendor row keeps its current (directory) placement
-- and no live listing changes when this migration lands.

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS vertical text NOT NULL DEFAULT 'service';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendors_vertical_check'
  ) THEN
    ALTER TABLE public.vendors
      ADD CONSTRAINT vendors_vertical_check
      CHECK (vertical IN ('service', 'gift_shop', 'attire_rings'));
  END IF;
END $$;

-- Backfill from the category the vendor actually picked. `vendors.category` is
-- text with an FK to vendor_categories(db_value) (see 20260611000002), so this
-- is an exact match, not a heuristic.
UPDATE public.vendors v
   SET vertical = c.vertical
  FROM public.vendor_categories c
 WHERE v.category = c.db_value
   AND c.vertical <> 'service'
   AND v.vertical = 'service';

-- Every public surface filters on this, usually together with onboarding_status.
CREATE INDEX IF NOT EXISTS idx_vendors_vertical_status
  ON public.vendors (vertical, onboarding_status);

-- ── product_categories.vertical ─────────────────────────────────────────────
--
-- The guest-facing browse taxonomy splits the same way: registry shoppers must
-- not see wedding gowns in "Kitchen & Dining", and the attire pages must not
-- show cookware. Existing categories were all seeded for the registry.

ALTER TABLE public.product_categories
  ADD COLUMN IF NOT EXISTS vertical text NOT NULL DEFAULT 'gift_shop';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_categories_vertical_check'
  ) THEN
    ALTER TABLE public.product_categories
      ADD CONSTRAINT product_categories_vertical_check
      CHECK (vertical IN ('gift_shop', 'attire_rings'));
  END IF;
END $$;

INSERT INTO public.product_categories (slug, label, icon, sort_order, vertical)
VALUES
  ('bridal-gowns',    'Bridal Gowns',           'Shirt',    20, 'attire_rings'),
  ('suits-menswear',  'Suits & Menswear',       'Shirt',    21, 'attire_rings'),
  ('wedding-rings',   'Wedding Rings',          'Gem',      22, 'attire_rings'),
  ('engagement-rings','Engagement Rings',       'Gem',      23, 'attire_rings'),
  ('jewelry',         'Jewellery & Accessories','Sparkles', 24, 'attire_rings')
ON CONFLICT (slug) DO UPDATE SET vertical = EXCLUDED.vertical;

CREATE INDEX IF NOT EXISTS idx_product_categories_vertical
  ON public.product_categories (vertical, sort_order);

NOTIFY pgrst, 'reload schema';
