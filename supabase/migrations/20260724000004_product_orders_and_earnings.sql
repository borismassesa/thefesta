-- Product commerce — orders ride the invitation_orders engine.
--
-- The invitation_orders table + lib/payments machinery (terminal-guarded
-- transitions, webhook idempotency, Selcom adapter, admin Lipa Namba review)
-- is the platform's one battle-tested money path; template unlocks already
-- ride it as a non-invitation line kind. Product purchases join the same
-- ledger via an additive `kind` column (default keeps every existing row and
-- code path exactly as-is), plus a normalized lines table because vendor
-- earnings, stock decrement and registry linkage need relational per-line
-- queries that the items JSONB snapshot can't serve.

ALTER TABLE public.invitation_orders
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'invitation'
    CHECK (kind IN ('invitation', 'product')),
  -- {name, phone, region, city, address, notes} — guest delivery details.
  ADD COLUMN IF NOT EXISTS delivery jsonb,
  -- Stamped by finalize_product_order: whichever paid path (opus_pass Selcom
  -- transition or opus_admin Lipa Namba approval) finalizes first wins; the
  -- other becomes a no-op.
  ADD COLUMN IF NOT EXISTS product_finalized_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_invitation_orders_kind
  ON public.invitation_orders(kind, status);

-- One row per product line on a product order. product_snapshot preserves
-- {name, image, vendorName} at purchase time (products are mutable/deletable).
CREATE TABLE IF NOT EXISTS public.product_order_lines (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid NOT NULL REFERENCES public.invitation_orders(id) ON DELETE CASCADE,
  product_id     uuid NOT NULL REFERENCES public.products(id),
  vendor_id      uuid NOT NULL REFERENCES public.vendors(id),
  -- Set when this purchase fulfils a couple's registry gift.
  gift_registry_item_id uuid REFERENCES public.gift_registry_items(id) ON DELETE SET NULL,
  quantity       int NOT NULL CHECK (quantity > 0),
  unit_price_tzs integer NOT NULL,
  line_total_tzs integer NOT NULL,
  product_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- True when a manual (Lipa Namba) approval landed after stock ran out —
  -- order stays paid; surfaced as a warning in the admin fulfillment queue.
  oversold       boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pol_order  ON public.product_order_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_pol_vendor ON public.product_order_lines(vendor_id);

-- Deny-all base (service-role only), same posture as invitation_orders —
-- plus vendors may read their own sold lines for the portal earnings view.
ALTER TABLE public.product_order_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_order_lines_vendor_read" ON public.product_order_lines;
CREATE POLICY "product_order_lines_vendor_read"
  ON public.product_order_lines FOR SELECT
  USING (is_vendor_member(vendor_id, ARRAY['owner', 'manager']::vendor_member_role[]));

-- Vendor earnings ledger: one row per vendor per paid product order,
-- written only by finalize_product_order (service role). Finance pays out
-- manually via vendor_payout_methods and marks rows paid_out.
CREATE TABLE IF NOT EXISTS public.vendor_earnings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid NOT NULL REFERENCES public.invitation_orders(id),
  vendor_id      uuid NOT NULL REFERENCES public.vendors(id),
  gross_tzs      numeric(12,2) NOT NULL,
  commission_pct numeric(5,2) NOT NULL,
  commission_tzs numeric(12,2) NOT NULL,
  net_tzs        numeric(12,2) NOT NULL,
  status         text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid_out')),
  paid_out_at    timestamptz,
  paid_out_by    text,
  payout_reference text,
  payout_note    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_earnings_vendor
  ON public.vendor_earnings(vendor_id, status);

ALTER TABLE public.vendor_earnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendor_earnings_vendor_read" ON public.vendor_earnings;
CREATE POLICY "vendor_earnings_vendor_read"
  ON public.vendor_earnings FOR SELECT
  USING (is_vendor_member(vendor_id, ARRAY['owner', 'manager']::vendor_member_role[]));

DROP POLICY IF EXISTS "vendor_earnings_admin_all" ON public.vendor_earnings;
CREATE POLICY "vendor_earnings_admin_all"
  ON public.vendor_earnings FOR ALL
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

NOTIFY pgrst, 'reload schema';
