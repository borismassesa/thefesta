-- Product commerce — product-vendor business categories.
--
-- Product vendors are ordinary vendors: same onboarding, KYC, agreements and
-- moderation. What makes them "product vendors" is their business category —
-- `sells_products` marks the vendor_categories whose vendors get the Products
-- tab in the vendors portal and can list goods in the registry shop.

ALTER TABLE public.vendor_categories
  ADD COLUMN IF NOT EXISTS sells_products boolean NOT NULL DEFAULT false;

INSERT INTO public.vendor_categories (slug, label, profile_label, db_value, icon, sort_order, sells_products)
VALUES
  ('home-kitchen', 'Home & kitchen goods',  'Home & Kitchen', 'Home & Kitchen',    'CookingPot', 12, true),
  ('decor-gifts',  'Décor & gifts shop',    'Décor & Gifts',  'Decor & Gifts',     'Gift',       13, true),
  ('linens',       'Linens & textiles',     'Linens',         'Linens & Textiles', 'BedDouble',  14, true)
ON CONFLICT (slug) DO NOTHING;

NOTIFY pgrst, 'reload schema';
