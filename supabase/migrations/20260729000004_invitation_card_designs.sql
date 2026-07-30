-- Design jobs: one per card line on a paid, finance-approved order.
--
-- An order is not one card. A single 2026-07 order holds six different cards,
-- each needing its own personalisation, its own approval, and its own delivery
-- to the couple. So the unit of design work is the ORDER LINE, not the order,
-- and this table is keyed on (order_id, line_index).
--
-- The order's own fulfillment_status stays the customer-facing progress bar
-- (payment_review → confirmed → in_design → ready → delivered, already mirrored
-- in both apps). This table is the workshop behind it: who is doing the work,
-- what the couple still has to tell us, and the field values that will be
-- placed into the card's SVG layers.
--
-- Rows are created when a designer starts a job, not when an order lands. A
-- queue that derives "not started" from the absence of a row keeps the two in
-- sync automatically, and avoids writing to the database on a page view.

CREATE TABLE IF NOT EXISTS public.invitation_card_designs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  order_id UUID NOT NULL REFERENCES public.invitation_orders(id) ON DELETE CASCADE,
  -- Position in invitation_orders.items (1-based, matching SQL ordinality).
  line_index INT NOT NULL CHECK (line_index >= 1),

  -- The card being personalised. Text, not a FK: website_invitations_products.id
  -- is a slug an admin can change, and a design job must survive that.
  product_id TEXT NOT NULL,
  -- Card name frozen at the time of purchase, so renaming the catalogue entry
  -- never rewrites what a couple actually bought.
  product_name TEXT NOT NULL DEFAULT '',

  -- Quantities copied from the order line when the job starts, so a later
  -- edit to the order can't silently change a print run already in progress.
  digital_qty INT NOT NULL DEFAULT 0 CHECK (digital_qty >= 0),
  print_qty INT NOT NULL DEFAULT 0 CHECK (print_qty >= 0),

  -- awaiting_info — waiting on the couple to supply their details
  -- in_design     — designer is placing the values into the artwork
  -- in_review     — internal check before the couple sees it
  -- ready         — approved, visible to the couple
  -- delivered     — couple has it and can share it
  status TEXT NOT NULL DEFAULT 'awaiting_info'
    CHECK (status IN ('awaiting_info', 'in_design', 'in_review', 'ready', 'delivered')),

  -- Staff member doing the work. Null = unclaimed.
  assigned_to UUID REFERENCES public.workforce_employees(id) ON DELETE SET NULL,

  -- role key → value, e.g. {"couple_name_1": "Moses Seeta"}. Order-scope fields
  -- only; per-guest values (guest_name) come from the event's guest list at
  -- render time rather than being duplicated here N times.
  field_values JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(field_values) = 'object'),

  -- Roles the designer has asked the couple for but not yet received.
  requested_fields JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(requested_fields) = 'array'),

  notes TEXT NOT NULL DEFAULT '',

  info_requested_at TIMESTAMPTZ,
  info_received_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One job per card line. Also the upsert key when a designer starts a job.
  UNIQUE (order_id, line_index)
);

COMMENT ON TABLE public.invitation_card_designs IS
  'One design job per card line on an approved order. Keyed (order_id, line_index) — an order can contain several different cards.';

CREATE INDEX IF NOT EXISTS invitation_card_designs_status_idx
  ON public.invitation_card_designs (status);
CREATE INDEX IF NOT EXISTS invitation_card_designs_assigned_idx
  ON public.invitation_card_designs (assigned_to)
  WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS invitation_card_designs_order_idx
  ON public.invitation_card_designs (order_id);

-- Keep updated_at honest without every caller remembering to set it.
CREATE OR REPLACE FUNCTION public.touch_invitation_card_designs()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invitation_card_designs_touch ON public.invitation_card_designs;
CREATE TRIGGER invitation_card_designs_touch
  BEFORE UPDATE ON public.invitation_card_designs
  FOR EACH ROW EXECUTE FUNCTION public.touch_invitation_card_designs();

-- Staff-only. The couple's own view of their design comes later through a
-- scoped surface, not by opening this table to authenticated users.
ALTER TABLE public.invitation_card_designs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invitation_card_designs FROM anon, authenticated;
GRANT ALL ON public.invitation_card_designs TO service_role;
