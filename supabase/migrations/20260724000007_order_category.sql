-- invitation_orders.category — the product family an order belongs to, so the
-- admin Payments console can segment digital cards / thank-you cards / pledge
-- cards / gift registry / (future) attire & rings instead of lumping every
-- manual payment under "digital cards". Orthogonal to `kind` (the billing rail).
--
-- Set authoritatively at order creation (see order-category.ts); this migration
-- adds the column, backfills existing rows from what they bought, then locks it
-- down (NOT NULL + CHECK). Idempotent so it is safe to re-run.

ALTER TABLE public.invitation_orders
  ADD COLUMN IF NOT EXISTS category text;

-- Backfill: product orders are registry-shop purchases; template purchases
-- encode their type in the line item id; everything else is a digital card.
UPDATE public.invitation_orders
SET category = CASE
  WHEN kind = 'product' THEN 'gift_registry'
  WHEN EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(items) = 'array' THEN items ELSE '[]'::jsonb END
    ) AS e
    WHERE e->>'id' LIKE 'template:thank_you_card:%'
  ) THEN 'thank_you_card'
  WHEN EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(items) = 'array' THEN items ELSE '[]'::jsonb END
    ) AS e
    WHERE e->>'id' LIKE 'template:pledge_card:%'
  ) THEN 'pledge_card'
  ELSE 'digital_card'
END
WHERE category IS NULL;

ALTER TABLE public.invitation_orders
  ALTER COLUMN category SET DEFAULT 'digital_card';

ALTER TABLE public.invitation_orders
  ALTER COLUMN category SET NOT NULL;

-- Guard the allowed set. Adding a future family (e.g. more product lines) is a
-- one-line change to this constraint.
ALTER TABLE public.invitation_orders
  DROP CONSTRAINT IF EXISTS invitation_orders_category_check;
ALTER TABLE public.invitation_orders
  ADD CONSTRAINT invitation_orders_category_check
  CHECK (category IN ('digital_card', 'thank_you_card', 'pledge_card', 'gift_registry', 'attire_rings'));

-- Segmenting the Payments queue filters by category — index it alongside the
-- provider/status the admin already narrows on.
CREATE INDEX IF NOT EXISTS invitation_orders_category_idx
  ON public.invitation_orders (category);

NOTIFY pgrst, 'reload schema';
