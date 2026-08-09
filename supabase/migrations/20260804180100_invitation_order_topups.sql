-- Topping up sending capacity on a card the couple already owns.
--
-- A couple who bought 121 invitations and has 38 left cannot buy 20 more today.
-- The dashboard's "Top up" link drops them into the catalogue, where the only
-- thing on offer is a NEW card: a new design job, a new 48-hour production wait,
-- a 50-guest minimum, and artwork that is not the one they already sent to 83
-- people. That is not a top-up, it is a second purchase.
--
-- A top-up is a child order. It carries no design work of its own; it inherits
-- the parent's frozen release and adds guests to the same event's pool. The
-- entitlement query already sums `items[].guests` across released paid orders
-- scoped to an event, so a correctly-formed child order needs NO change to that
-- math — which is the reason this shape was chosen over a separate credits
-- ledger that would have to be reconciled against orders forever.
--
-- What this migration adds is the identity that makes such a child order safe:
-- who its parent is, which exact release it inherits, what it was charged per
-- guest, and a key that stops a browser refresh buying it twice.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.invitation_orders
  -- 'purchase' — a normal order: a card is chosen, designed, approved, released.
  -- 'topup'    — extra capacity on a card an earlier order already released.
  ADD COLUMN IF NOT EXISTS order_kind TEXT NOT NULL DEFAULT 'purchase'
    CHECK (order_kind IN ('purchase', 'topup')),

  -- The original purchase this top-up draws its card, event and price from.
  -- RESTRICT, not CASCADE: deleting a purchase that has paid top-ups hanging
  -- off it would silently delete capacity the couple paid for.
  ADD COLUMN IF NOT EXISTS parent_order_id UUID
    REFERENCES public.invitation_orders (id) ON DELETE RESTRICT,

  -- The exact frozen artefact these extra guests will receive.
  --
  -- This is the whole point of storing it. Resolving "the current release of
  -- the parent's design" at send time would mean a re-approval between the
  -- top-up and the send changes which artwork the topped-up guests get, while
  -- the first 83 keep the old one. Two hundred people would receive two
  -- different cards from one purchase. The release is pinned here, at purchase.
  ADD COLUMN IF NOT EXISTS topup_release_id UUID
    REFERENCES public.invitation_card_design_releases (id) ON DELETE RESTRICT,

  -- Per-guest price actually charged, in TZS. Copied from the parent's line at
  -- purchase time and never re-derived: the CMS tier price is editable, so
  -- reading it back next year would misstate what this order cost.
  ADD COLUMN IF NOT EXISTS topup_unit_price NUMERIC(12, 2)
    CHECK (topup_unit_price IS NULL OR topup_unit_price >= 0),

  -- Client-supplied key, scoped per user. Two initiate calls carrying the same
  -- key are the same intent (a refresh, a double tap, a retry after a timeout),
  -- and must not become two orders.
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

COMMENT ON COLUMN public.invitation_orders.order_kind IS
  'purchase = a card was bought and designed; topup = extra capacity on a parent order''s already-released card.';
COMMENT ON COLUMN public.invitation_orders.parent_order_id IS
  'For a top-up: the original purchase whose card, event and per-guest price it inherits. Always a purchase, never another top-up.';
COMMENT ON COLUMN public.invitation_orders.topup_release_id IS
  'The exact release these extra guests receive, pinned at purchase so a later re-approval cannot split one purchase across two artworks.';
COMMENT ON COLUMN public.invitation_orders.topup_unit_price IS
  'TZS per guest actually charged, frozen. Tier prices change; this must not.';

-- ---------------------------------------------------------------------------
-- Shape: the two kinds have different required fields
-- ---------------------------------------------------------------------------

-- A purchase carries none of the top-up fields; a top-up carries all of them.
-- Stated as one constraint so neither half can drift into a partially-filled
-- row that later code has to guess about.
ALTER TABLE public.invitation_orders
  DROP CONSTRAINT IF EXISTS invitation_orders_topup_shape;
ALTER TABLE public.invitation_orders
  ADD CONSTRAINT invitation_orders_topup_shape CHECK (
    (order_kind = 'purchase'
      AND parent_order_id IS NULL
      AND topup_release_id IS NULL
      AND topup_unit_price IS NULL)
    OR
    (order_kind = 'topup'
      AND parent_order_id IS NOT NULL
      AND topup_release_id IS NOT NULL
      AND topup_unit_price IS NOT NULL)
  );

-- A top-up must belong to an event: its whole purpose is to raise one event's
-- pool, and the entitlement query ignores orders with no event_id. An order
-- that cannot be counted is money taken for nothing.
ALTER TABLE public.invitation_orders
  DROP CONSTRAINT IF EXISTS invitation_orders_topup_needs_event;
ALTER TABLE public.invitation_orders
  ADD CONSTRAINT invitation_orders_topup_needs_event CHECK (
    order_kind <> 'topup' OR event_id IS NOT NULL
  );

-- ---------------------------------------------------------------------------
-- Chains are not allowed
-- ---------------------------------------------------------------------------

-- A top-up of a top-up would make "which release, which price, which event"
-- a walk up an arbitrarily long chain, and every reader would have to
-- implement that walk identically. Everything resolves against the original
-- purchase, one hop, always. This cannot be a CHECK (it reads another row),
-- so it is a trigger.
-- search_path is pinned empty: every reference inside is schema-qualified, so
-- nothing here resolves through a caller-controlled path. Without it, a role
-- with a mutable search_path could shadow `invitation_orders` and defeat the
-- ownership check below.
CREATE OR REPLACE FUNCTION public.enforce_invitation_order_topup_parent()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  parent RECORD;
BEGIN
  IF NEW.order_kind <> 'topup' THEN
    RETURN NEW;
  END IF;

  SELECT id, order_kind, status, event_id, user_id
    INTO parent
    FROM public.invitation_orders
   WHERE id = NEW.parent_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'top-up parent % does not exist', NEW.parent_order_id;
  END IF;

  IF parent.order_kind <> 'purchase' THEN
    RAISE EXCEPTION 'a top-up cannot be the parent of another top-up (order %)', parent.id;
  END IF;

  IF parent.status <> 'paid' THEN
    RAISE EXCEPTION 'top-up parent % is not paid', parent.id;
  END IF;

  IF parent.event_id IS DISTINCT FROM NEW.event_id THEN
    RAISE EXCEPTION 'top-up event % does not match parent event %', NEW.event_id, parent.event_id;
  END IF;

  -- Ownership. The API resolves the parent from the signed-in couple, but this
  -- is the layer that cannot be bypassed by a future caller that forgets to.
  IF parent.user_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'top-up owner does not match parent order %', parent.id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_invitation_order_topup_parent() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS invitation_orders_topup_parent ON public.invitation_orders;
CREATE TRIGGER invitation_orders_topup_parent
  BEFORE INSERT OR UPDATE OF order_kind, parent_order_id, event_id, user_id
  ON public.invitation_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invitation_order_topup_parent();

-- The release must belong to the parent's own design. Enforced here rather than
-- trusted from the caller: pinning SOME release is useless if it can be a
-- release of somebody else's card.
CREATE OR REPLACE FUNCTION public.enforce_invitation_order_topup_release()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  owner_order UUID;
BEGIN
  IF NEW.order_kind <> 'topup' THEN
    RETURN NEW;
  END IF;

  SELECT d.order_id
    INTO owner_order
    FROM public.invitation_card_design_releases r
    JOIN public.invitation_card_designs d ON d.id = r.design_id
   WHERE r.id = NEW.topup_release_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'top-up release % does not exist', NEW.topup_release_id;
  END IF;

  IF owner_order IS DISTINCT FROM NEW.parent_order_id THEN
    RAISE EXCEPTION 'top-up release % does not belong to parent order %',
      NEW.topup_release_id, NEW.parent_order_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_invitation_order_topup_release() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS invitation_orders_topup_release ON public.invitation_orders;
CREATE TRIGGER invitation_orders_topup_release
  BEFORE INSERT OR UPDATE OF order_kind, parent_order_id, topup_release_id
  ON public.invitation_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invitation_order_topup_release();

-- ---------------------------------------------------------------------------
-- Idempotency
-- ---------------------------------------------------------------------------

-- Scoped per user, not global: two couples generating the same key must not
-- collide. Partial, so the overwhelming majority of rows (no key) cost nothing.
CREATE UNIQUE INDEX IF NOT EXISTS invitation_orders_idempotency_key_uidx
  ON public.invitation_orders (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS invitation_orders_parent_idx
  ON public.invitation_orders (parent_order_id)
  WHERE parent_order_id IS NOT NULL;

-- The designer queue reads paid+reviewed orders and must skip top-ups. Keeping
-- the flag indexed means that exclusion stays cheap as top-ups accumulate.
CREATE INDEX IF NOT EXISTS invitation_orders_kind_idx
  ON public.invitation_orders (order_kind)
  WHERE order_kind <> 'purchase';
