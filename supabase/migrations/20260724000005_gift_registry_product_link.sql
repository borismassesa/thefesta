-- Product commerce — link registry gifts to real products + purchasable claims.
--
-- 1) gift_registry_items.product_id replaces the fragile title-based dedupe
--    between the couple's list and the shop catalog, and price_tzs gives
--    gifts a numeric price the payment engine can charge (price_label stays
--    as the display string and covers cash funds' "Any amount").
-- 2) gift_registry_claims gains a lifecycle: a guest BUYING a product gift
--    reserves it at payment-initiate time (pending_payment) so nobody else
--    buys it during the manual Lipa Namba review window; the claim confirms
--    on paid and cancels on failed/expired/rejected. Claim-by-name for
--    non-product gifts keeps inserting rows as 'confirmed' (the default).

ALTER TABLE public.gift_registry_items
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS price_tzs integer CHECK (price_tzs > 0);

CREATE INDEX IF NOT EXISTS idx_gri_product
  ON public.gift_registry_items(product_id);

ALTER TABLE public.gift_registry_claims
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'pending_payment', 'cancelled')),
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.invitation_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_grc_order
  ON public.gift_registry_claims(order_id);

-- Re-teach the atomic claim RPC about the lifecycle: cancelled claims free
-- their unit; pending_payment claims still occupy one (a gift mid-purchase
-- must not be claimable by someone else).
CREATE OR REPLACE FUNCTION public.claim_gift_registry_unit(
  p_item_id uuid,
  p_user_id uuid,
  p_guest_name text,
  p_guest_phone text,
  p_guest_email text
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_quantity_requested int;
  v_current_count int;
  v_claim_id uuid;
BEGIN
  SELECT quantity_requested INTO v_quantity_requested
    FROM gift_registry_items
   WHERE id = p_item_id
   FOR UPDATE;

  IF v_quantity_requested IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_current_count
    FROM gift_registry_claims
   WHERE item_id = p_item_id
     AND status <> 'cancelled';

  IF v_current_count >= v_quantity_requested THEN
    RETURN NULL;
  END IF;

  INSERT INTO gift_registry_claims (item_id, user_id, guest_name, guest_phone, guest_email)
  VALUES (p_item_id, p_user_id, p_guest_name, p_guest_phone, p_guest_email)
  RETURNING id INTO v_claim_id;

  RETURN v_claim_id;
END;
$$;

COMMENT ON FUNCTION public.claim_gift_registry_unit(uuid, uuid, text, text, text) IS
  'Atomically claims one unit of a multi-quantity gift registry item — locks the item row so concurrent claims serialize instead of racing. Cancelled claims free their unit; pending_payment claims still occupy one. Returns the new claim id, or NULL if the gift is already fully claimed.';

NOTIFY pgrst, 'reload schema';
