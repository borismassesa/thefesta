-- Product commerce — order finalization, callable from BOTH paid paths.
--
-- There are two ways a product order reaches 'paid': opus_pass's
-- transitionOrder (Selcom webhook/status poll) and opus_admin's Lipa Namba
-- approval action (which writes status='paid' directly). Stock decrement,
-- registry-claim confirmation and vendor-earnings creation must run exactly
-- once regardless of which path lands first (or if both do), so they live in
-- one idempotent SECURITY DEFINER function keyed on a product_finalized_at
-- stamp rather than in either app's code.
--
-- SECURITY DEFINER + REVOKE: exposed to service-role callers only. Without
-- the REVOKE, Postgres grants EXECUTE to PUBLIC by default and PostgREST
-- would expose this as an unauthenticated RPC.

-- p_commission_pct is the platform's cut (OpusFesta keeps this %, the vendor
-- nets the rest). 12% today; each vendor_earnings row stores the rate it was
-- computed at, so changing this default never rewrites historical earnings.
CREATE OR REPLACE FUNCTION public.finalize_product_order(
  p_order_id uuid,
  p_commission_pct numeric DEFAULT 12
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
BEGIN
  -- Idempotency gate: first caller stamps and proceeds; everyone else no-ops.
  UPDATE invitation_orders
     SET product_finalized_at = now()
   WHERE id = p_order_id
     AND kind = 'product'
     AND status = 'paid'
     AND product_finalized_at IS NULL;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Stock: guarded decrement for tracked, not-made-to-order products.
  -- A manual approval can land after stock ran out — the order stays paid,
  -- the line is flagged oversold for the fulfillment queue to resolve.
  FOR r IN
    SELECT id, product_id, quantity FROM product_order_lines
     WHERE order_id = p_order_id
  LOOP
    UPDATE products
       SET stock_quantity = stock_quantity - r.quantity
     WHERE id = r.product_id
       AND stock_quantity IS NOT NULL
       AND made_to_order = false
       AND stock_quantity >= r.quantity;
    IF NOT FOUND THEN
      UPDATE product_order_lines pol
         SET oversold = true
       WHERE pol.id = r.id
         AND EXISTS (
           SELECT 1 FROM products p
           WHERE p.id = r.product_id
             AND p.stock_quantity IS NOT NULL
             AND p.made_to_order = false
         );
    END IF;
  END LOOP;

  -- Registry: confirm the reservations this payment was holding.
  UPDATE gift_registry_claims
     SET status = 'confirmed'
   WHERE order_id = p_order_id
     AND status = 'pending_payment';

  -- Single-quantity fast path: the dashboard/public UI reads
  -- claimed_by_name straight off the item for qty<=1 gifts, so mirror the
  -- confirmed claim onto the item (never overwriting an existing claimant).
  UPDATE gift_registry_items gri
     SET claimed_by_name  = c.guest_name,
         claimed_by_phone = c.guest_phone,
         claimed_by_email = c.guest_email,
         claimed_at       = now()
    FROM gift_registry_claims c
   WHERE c.order_id = p_order_id
     AND c.status = 'confirmed'
     AND c.item_id = gri.id
     AND gri.quantity_requested <= 1
     AND gri.claimed_by_name IS NULL;

  -- Earnings: one ledger row per vendor on the order.
  INSERT INTO vendor_earnings
    (order_id, vendor_id, gross_tzs, commission_pct, commission_tzs, net_tzs)
  SELECT
    order_id,
    vendor_id,
    SUM(line_total_tzs),
    p_commission_pct,
    ROUND(SUM(line_total_tzs) * p_commission_pct / 100, 2),
    SUM(line_total_tzs) - ROUND(SUM(line_total_tzs) * p_commission_pct / 100, 2)
  FROM product_order_lines
  WHERE order_id = p_order_id
  GROUP BY order_id, vendor_id
  ON CONFLICT (order_id, vendor_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.finalize_product_order(uuid, numeric) IS
  'Runs the once-only side effects of a PAID product order: stock decrement (oversold-flagging on shortfall), registry-claim confirmation, and vendor-earnings rows. Idempotent via invitation_orders.product_finalized_at. Service-role only.';

-- Companion: a product order that dies (failed / expired / rejected) releases
-- the registry units its pending claims were holding.
CREATE OR REPLACE FUNCTION public.release_product_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE gift_registry_claims
     SET status = 'cancelled'
   WHERE order_id = p_order_id
     AND status = 'pending_payment';
END;
$$;

COMMENT ON FUNCTION public.release_product_order(uuid) IS
  'Cancels the pending_payment registry claims held by a failed/expired/rejected product order, freeing the gift for other guests. Service-role only.';

REVOKE EXECUTE ON FUNCTION public.finalize_product_order(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_product_order(uuid) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
