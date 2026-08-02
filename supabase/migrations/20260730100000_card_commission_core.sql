-- Custom Card Commission Service — core schema, payment ledger and money gates.
-- Specs: OP-CCS-PRD-001 §7.2, OP-CCS-TDD-001 §3.1–3.2.1.
--
-- This is step 1 of the TDD's implementation order, and it is a gate: nothing
-- that reads money may be built until the ledger exists. The whole feature
-- rests on one idea — an order has NO "paid" boolean anywhere. Its financial
-- position is always `sum(verified payments)` measured against `total_tzs`, so
-- partial payments, overpayments, top-ups and discounts fall out of the model
-- instead of each needing its own special case.
--
-- Two money gates sit on top of that sum:
--   Gate 1  deposit_satisfied()  blocks the DESIGN QUEUE. No salaried designer
--                                time is spent before the deposit lands.
--   Gate 2  fully_settled()      blocks the ASSET. Approval releases the
--                                invoice, never the file.
--
-- ── Deviations from TDD §3.1, and why ──────────────────────────────────────
--
-- 1. Identity columns are adapted to this database rather than copied. The TDD
--    writes `user_id text` (a raw Clerk id) and `event_id references events(id)`.
--    Neither exists here: this schema resolves Clerk subjects to `users.id`
--    (UUID) through `requesting_user_id()`, which is what every RLS policy in
--    the repo is already written against, and the events table is
--    `wedding_events`. Using the TDD's literal types would make every policy
--    on this table incompatible with every other policy in the database.
--
-- 2. Staff are `workforce_employees(id)`, not Clerk ids — matching
--    `invitation_card_designs.assigned_to`, the design queue that shipped
--    alongside this feature.
--
-- 3. The `order_ledger` view is NOT the literal SQL in TDD §3.2.1, which has
--    two defects: it filters `p.purpose in ('deposit','adjustment','discount')`
--    when 'adjustment' is a payment *channel* and not a member of the
--    payment_purpose enum at all (a hard type error), and it counts negative
--    discount rows as *payments*, which makes a discount increase the amount
--    outstanding. The model below keeps the spec's stated intent — one sum, no
--    stored booleans, negative discount rows — while being arithmetically
--    correct. See the view's own comment for the full derivation.

-- ─────────────────────────────────────────────────────────────────────────────
--  Catalogue: packages and categories
-- ─────────────────────────────────────────────────────────────────────────────

-- Package definitions drive SLA, revision allowance and price. The client is
-- never trusted for any of them: checkout recomputes the amount from this row.
CREATE TABLE IF NOT EXISTS public.card_packages (
  id                 TEXT PRIMARY KEY,          -- essential | classic | elegant | signature
  name_en            TEXT NOT NULL,
  name_sw            TEXT NOT NULL,
  price_tzs          INTEGER NOT NULL CHECK (price_tzs >= 0),

  -- The Tanzanian commissioning convention is 50% up front, 50% on completion,
  -- but it is a COLUMN, not a constant: a rush job or a corporate client can be
  -- set to 100% up front, and a repeat customer to 30%, without a code change
  -- (PRD §7.2.1). Nothing in the codebase may hard-code 50.
  deposit_percent    INTEGER NOT NULL DEFAULT 50
                       CHECK (deposit_percent BETWEEN 1 AND 100),

  first_draft_hours  INTEGER NOT NULL CHECK (first_draft_hours > 0),
  -- NULL means unlimited under fair use (Signature). A number is a hard ceiling
  -- enforced in the database, never in the UI (loophole L6).
  revisions_included INTEGER CHECK (revisions_included >= 0),
  -- Fair-use ceiling for unlimited packages, so "unlimited" still terminates.
  revisions_fair_use INTEGER CHECK (revisions_fair_use > 0),
  topup_price_tzs    INTEGER NOT NULL CHECK (topup_price_tzs >= 0),
  auto_approve_days  INTEGER NOT NULL CHECK (auto_approve_days > 0),

  active             BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.card_packages IS
  'Commission package tiers. Price, deposit split, SLA and revision allowance all live here so none of them is hard-coded in application code.';
COMMENT ON COLUMN public.card_packages.revisions_included IS
  'NULL = unlimited under fair use (see revisions_fair_use). A number is a hard, database-enforced ceiling.';

CREATE TABLE IF NOT EXISTS public.card_categories (
  id         TEXT PRIMARY KEY,   -- wedding | send_off | kitchen_party | corporate | birthday | graduation
  name_en    TEXT NOT NULL,
  name_sw    TEXT NOT NULL,
  -- Categories whose cards carry a scannable entrance pass need a QR slot in
  -- the delivered SVG; the validator enforces it only for these (TDD §6.2).
  ticketed   BOOLEAN NOT NULL DEFAULT FALSE,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.card_categories IS
  'Commission card categories. Each drives its own structured brief question set (brief_questions).';

-- ─────────────────────────────────────────────────────────────────────────────
--  Order status: one enum, one column, one writer
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'card_order_status') THEN
    CREATE TYPE public.card_order_status AS ENUM (
      -- Gate 1: deposit
      'draft', 'awaiting_deposit', 'deposit_review', 'deposit_rejected', 'deposit_paid',
      -- Production (every preview watermarked)
      'intake_pending', 'queued', 'assigned', 'in_design', 'internal_qa',
      'client_review', 'revision_requested', 'approved',
      -- Gate 2: balance
      'awaiting_balance', 'balance_review', 'balance_rejected', 'balance_overdue', 'settled',
      -- Terminal / exceptional
      'delivered', 'closed', 'on_hold', 'cancelled', 'refunded', 'forfeited'
    );
  END IF;
END $$;

-- Named `card_order_status` rather than the TDD's `order_status`: this database
-- already carries `invitation_order_status` and a bare `order_status` would
-- read as the shared one. The prefix keeps the two systems visibly distinct.

-- ─────────────────────────────────────────────────────────────────────────────
--  Orders
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.card_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Human reference shown to the buyer and quoted as the Lipa Namba payment
  -- reference, e.g. OP-CC-2026-0001. Generated by next_card_order_no().
  order_no          TEXT NOT NULL UNIQUE,
  status            public.card_order_status NOT NULL DEFAULT 'draft',

  -- ── Identity: nullable ON PURPOSE. This is how anonymous checkout works ──
  -- The buyer is never blocked by "select your event" (PRD §7.1). An order can
  -- run all the way through design unclaimed; only `delivered` requires an
  -- event, and that is the one thing the claim flow guarantees.
  user_id           UUID REFERENCES public.users(id) ON DELETE SET NULL,
  event_id          UUID REFERENCES public.wedding_events(id) ON DELETE SET NULL,

  -- The real identity anchor in this market. Required at checkout, E.164.
  buyer_phone       TEXT NOT NULL CHECK (buyer_phone ~ '^\+?[0-9]{9,15}$'),
  buyer_name        TEXT NOT NULL CHECK (length(btrim(buyer_name)) > 0),
  buyer_email       TEXT,
  locale            TEXT NOT NULL DEFAULT 'sw' CHECK (locale IN ('sw', 'en')),

  -- Captured at checkout when no event exists yet; used to create or match one
  -- at claim time, and to drive the event-date-aware balance chase cadence.
  provisional_event_name TEXT,
  provisional_event_date DATE,

  package_id        TEXT NOT NULL REFERENCES public.card_packages(id),
  category_id       TEXT NOT NULL REFERENCES public.card_categories(id),

  -- ── Money ────────────────────────────────────────────────────────────────
  -- Whole shillings. TZS has no circulating subunit, and integer arithmetic
  -- keeps a ledger that must sum exactly free of the rounding drift that
  -- numeric/float money invites.
  base_price_tzs    INTEGER NOT NULL CHECK (base_price_tzs >= 0),
  -- base + accepted revision top-ups. The ONLY mutable money figure on the
  -- order; everything else is derived from order_payments. Discounts do not
  -- move it — they are credit rows in the ledger (see order_ledger).
  total_tzs         INTEGER NOT NULL CHECK (total_tzs >= 0),
  -- Both snapshotted at checkout and never recomputed, so a later change to
  -- the package price cannot retroactively alter what this buyer was asked for.
  deposit_percent   INTEGER NOT NULL CHECK (deposit_percent BETWEEN 1 AND 100),
  deposit_due_tzs   INTEGER NOT NULL CHECK (deposit_due_tzs >= 0),
  currency          TEXT NOT NULL DEFAULT 'TZS',

  -- NULL = unlimited under fair use, mirroring card_packages.revisions_included
  -- at the moment of purchase.
  revisions_remaining INTEGER CHECK (revisions_remaining >= 0),
  revisions_used      INTEGER NOT NULL DEFAULT 0 CHECK (revisions_used >= 0),

  -- ── Production ───────────────────────────────────────────────────────────
  assigned_designer_id UUID REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  assigned_at       TIMESTAMPTZ,
  accepted_at       TIMESTAMPTZ,
  -- How many times this order has bounced back to the queue on an accept-SLA
  -- breach. Capped at 2, then Ops is alerted rather than looping (loophole L8).
  assign_bounces    INTEGER NOT NULL DEFAULT 0 CHECK (assign_bounces >= 0),
  sla_due_at        TIMESTAMPTZ,
  -- Set while the clock is paused: awaiting customer input, or on hold. Time
  -- spent waiting on the customer must never count against a designer.
  sla_paused_at     TIMESTAMPTZ,
  -- Accumulated paused time, folded back into sla_due_at on resume.
  sla_paused_ms     BIGINT NOT NULL DEFAULT 0 CHECK (sla_paused_ms >= 0),

  approved_at       TIMESTAMPTZ,
  -- Set on approval; starts the balance chase cadence (PRD §7.2.3).
  balance_invoiced_at TIMESTAMPTZ,
  -- invoiced_at + window, compressed when the event date is near.
  balance_due_at    TIMESTAMPTZ,
  settled_at        TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  closed_at         TIMESTAMPTZ,

  -- ── Policy bookkeeping (PRD §7.11) ───────────────────────────────────────
  postponements_used INTEGER NOT NULL DEFAULT 0 CHECK (postponements_used >= 0),
  -- Drives the 90-day dormancy sweep. Touched by any customer action.
  last_customer_response_at TIMESTAMPTZ,
  -- Archived orders are restorable and never deleted.
  archived_at       TIMESTAMPTZ,
  -- Where the order was before on_hold, so it can be resumed to the same place.
  held_from_status  public.card_order_status,
  hold_reason       TEXT,

  -- Prevents a double-tapped pay button becoming two commissions. Keyed on
  -- phone + package + a coarse time bucket by the checkout route (loophole L12).
  idempotency_key   TEXT UNIQUE,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- An order can only be delivered into an event that exists. The state machine
  -- also guards this, but a CHECK means no code path anywhere can bypass it.
  CONSTRAINT card_orders_delivered_needs_event
    CHECK (status NOT IN ('delivered', 'closed') OR event_id IS NOT NULL)
);

COMMENT ON TABLE public.card_orders IS
  'One bespoke card commission. status is written ONLY by transition_order(); direct UPDATE of the column is revoked from anon and authenticated.';
COMMENT ON COLUMN public.card_orders.total_tzs IS
  'base_price_tzs + accepted revision top-ups. Discounts do NOT reduce this — they are negative credit rows in order_payments, so the ledger stays a single sum and the contracted price stays reportable.';
COMMENT ON COLUMN public.card_orders.deposit_due_tzs IS
  'Snapshotted at checkout, never recomputed. A later package price change must not alter what this buyer was asked to pay.';

CREATE INDEX IF NOT EXISTS card_orders_status_sla_idx
  ON public.card_orders (status, sla_due_at);
CREATE INDEX IF NOT EXISTS card_orders_balance_due_idx
  ON public.card_orders (status, balance_due_at)
  WHERE status IN ('awaiting_balance', 'balance_overdue');
CREATE INDEX IF NOT EXISTS card_orders_designer_idx
  ON public.card_orders (assigned_designer_id, status)
  WHERE assigned_designer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS card_orders_buyer_phone_idx
  ON public.card_orders (buyer_phone);
CREATE INDEX IF NOT EXISTS card_orders_user_idx
  ON public.card_orders (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS card_orders_event_idx
  ON public.card_orders (event_id) WHERE event_id IS NOT NULL;

-- Human-readable, gap-tolerant order numbers. A sequence (not a count) so two
-- concurrent checkouts can never mint the same reference — that reference is
-- what a buyer types into Lipa Namba, so a collision is a misallocated payment.
CREATE SEQUENCE IF NOT EXISTS public.card_order_no_seq;

CREATE OR REPLACE FUNCTION public.next_card_order_no()
RETURNS TEXT
LANGUAGE sql
VOLATILE
SET search_path TO 'public'
AS $$
  SELECT 'OP-CC-' || to_char(now(), 'YYYY') || '-'
      || lpad(nextval('public.card_order_no_seq')::text, 4, '0');
$$;

REVOKE ALL ON FUNCTION public.next_card_order_no() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_card_order_no() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  Payments: an order has MANY, never one
-- ─────────────────────────────────────────────────────────────────────────────
-- The 50/50 convention means at minimum two, and in practice often three or
-- four once partial deposits and top-ups are involved.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'card_payment_channel') THEN
    CREATE TYPE public.card_payment_channel AS ENUM
      ('selcom_card', 'selcom_mobile', 'lipa_namba', 'adjustment');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'card_payment_purpose') THEN
    CREATE TYPE public.card_payment_purpose AS ENUM
      ('deposit', 'balance', 'topup', 'refund', 'discount');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'card_payment_state') THEN
    CREATE TYPE public.card_payment_state AS ENUM
      ('initiated', 'pending_review', 'verified', 'rejected', 'void');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.order_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES public.card_orders(id) ON DELETE CASCADE,
  purpose         public.card_payment_purpose NOT NULL,
  channel         public.card_payment_channel NOT NULL,
  state           public.card_payment_state NOT NULL DEFAULT 'initiated',

  -- What was asked for at the time, versus what actually arrived. They differ
  -- constantly: the common real-world case is a buyer sending TSh 40,000
  -- against a TSh 50,000 request. That is an underpayment, not an error.
  expected_tzs    INTEGER NOT NULL,
  received_tzs    INTEGER,

  provider_ref    TEXT,   -- Selcom transaction id, or the Lipa Namba reference
  -- Makes a replayed webhook a no-op rather than a double credit (loophole L2).
  idempotency_key TEXT UNIQUE,
  evidence_path   TEXT,   -- private storage path of the buyer's screenshot

  -- 'selcom_webhook' or a workforce_employees.id. A payment may only move an
  -- order forward when state = 'verified' AND verified_by IS NOT NULL, which is
  -- what closes L1 (fake Lipa Namba reference) and L2 (spoofed webhook).
  verified_by     TEXT,
  verified_at     TIMESTAMPTZ,
  review_note     TEXT,
  raw_payload     JSONB,  -- full webhook body, kept for reconciliation

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Signed-amount discipline. Money in is positive, money out is negative, and
  -- the sign is a constraint rather than a convention so no writer can invert
  -- one and quietly corrupt every downstream sum.
  CONSTRAINT order_payments_sign_matches_purpose CHECK (
    received_tzs IS NULL
    OR (purpose IN ('deposit', 'balance', 'topup') AND received_tzs >= 0)
    OR (purpose IN ('refund', 'discount') AND received_tzs <= 0)
  ),
  -- A verified payment must record what arrived and who confirmed it. Without
  -- this, "verified" could mean nothing at all.
  CONSTRAINT order_payments_verified_is_complete CHECK (
    state <> 'verified'
    OR (received_tzs IS NOT NULL AND verified_by IS NOT NULL AND verified_at IS NOT NULL)
  )
);

COMMENT ON TABLE public.order_payments IS
  'Every money movement on a commission. Append-only in practice: a refund is a NEW negative row, never an edit or deletion of the original payment, so an order financial history is always complete and auditable.';
COMMENT ON COLUMN public.order_payments.received_tzs IS
  'Signed. Positive for money in (deposit/balance/topup), negative for money out or credited (refund/discount). NULL until the payment resolves.';

-- One verified payment per provider reference. Partial, because many rows
-- legitimately have no reference yet (initiated Selcom pushes, adjustments).
CREATE UNIQUE INDEX IF NOT EXISTS order_payments_provider_ref_key
  ON public.order_payments (provider_ref)
  WHERE provider_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_payments_order_idx
  ON public.order_payments (order_id, purpose, state);
-- Drives the Finance queue: everything awaiting a human, oldest first.
CREATE INDEX IF NOT EXISTS order_payments_review_queue_idx
  ON public.order_payments (state, created_at)
  WHERE state = 'pending_review';

-- ─────────────────────────────────────────────────────────────────────────────
--  Derived financial position — the single source of money truth
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Every money question is answered by this one view. No boolean is stored
-- anywhere, so there is nothing to keep in sync and nothing to drift.
--
--   credits_tzs        Σ discount rows (negative). A discount is a credit we
--                      grant, not a payment the customer made, so it reduces
--                      what is OWED rather than inflating what was PAID.
--   effective_total    total_tzs + credits_tzs. What this customer must
--                      actually settle. total_tzs stays the contracted price,
--                      which keeps discounting visible in revenue reporting
--                      instead of silently erasing it.
--   paid_tzs           Σ deposit + balance + topup + refund rows. Refunds are
--                      negative, so a refunded order correctly shows less paid.
--   outstanding_tzs    effective_total − paid. Drives Gate 2.
--   deposit_paid_tzs   Σ deposit rows only. Drives Gate 1.
--
-- Only `verified` rows count. An initiated or pending-review payment is a
-- claim, not money.
DROP VIEW IF EXISTS public.order_ledger;
CREATE VIEW public.order_ledger AS
SELECT
  o.id                AS order_id,
  o.total_tzs,
  o.deposit_due_tzs,
  COALESCE(SUM(p.received_tzs) FILTER (
    WHERE p.state = 'verified' AND p.purpose = 'discount'), 0)::INTEGER      AS credits_tzs,
  (o.total_tzs + COALESCE(SUM(p.received_tzs) FILTER (
    WHERE p.state = 'verified' AND p.purpose = 'discount'), 0))::INTEGER     AS effective_total_tzs,
  COALESCE(SUM(p.received_tzs) FILTER (
    WHERE p.state = 'verified'
      AND p.purpose IN ('deposit', 'balance', 'topup', 'refund')), 0)::INTEGER AS paid_tzs,
  COALESCE(SUM(p.received_tzs) FILTER (
    WHERE p.state = 'verified' AND p.purpose = 'deposit'), 0)::INTEGER       AS deposit_paid_tzs,
  (o.total_tzs
     + COALESCE(SUM(p.received_tzs) FILTER (
         WHERE p.state = 'verified' AND p.purpose = 'discount'), 0)
     - COALESCE(SUM(p.received_tzs) FILTER (
         WHERE p.state = 'verified'
           AND p.purpose IN ('deposit', 'balance', 'topup', 'refund')), 0)
  )::INTEGER                                                                 AS outstanding_tzs
FROM public.card_orders o
LEFT JOIN public.order_payments p ON p.order_id = o.id
GROUP BY o.id;

COMMENT ON VIEW public.order_ledger IS
  'The financial position of every commission, derived not stored. Replaces TDD §3.2.1, whose literal SQL referenced a non-existent purpose value and counted negative discounts as payments (making a discount increase the amount outstanding).';

-- The view is invoked through SECURITY DEFINER gate functions and the
-- service-role client; it must not be readable directly by end users, who
-- would otherwise see every order's finances.
REVOKE ALL ON public.order_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.order_ledger TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  The two gates
-- ─────────────────────────────────────────────────────────────────────────────
-- These are the entire enforcement mechanism. transition_order() calls
-- deposit_satisfied() before `queued` and fully_settled() before `settled`.
-- There is no code path to delivery that skips them, and no Ops button that
-- overrides them: an operator who wants to release work for less money must
-- record a discount row, which is itself audited (closes L17, L18).

-- Gate 1 — may this order enter the design queue?
CREATE OR REPLACE FUNCTION public.deposit_satisfied(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- LEAST(deposit_due, effective_total) matters: a discount can legitimately
  -- drop the effective total below a deposit figure snapshotted at the full
  -- price. Without the floor, a heavily discounted order could pay everything
  -- it owes and still never open Gate 1.
  SELECT l.deposit_paid_tzs >= LEAST(l.deposit_due_tzs, GREATEST(l.effective_total_tzs, 0))
  FROM public.order_ledger l
  WHERE l.order_id = p_order_id;
$$;

-- Gate 2 — may the finished asset be released?
CREATE OR REPLACE FUNCTION public.fully_settled(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT l.outstanding_tzs <= 0
  FROM public.order_ledger l
  WHERE l.order_id = p_order_id;
$$;

-- SECURITY DEFINER functions are granted to PUBLIC by default, and PostgREST
-- exposes anything executable as an unauthenticated RPC. Revoke, then grant
-- only to service_role.
REVOKE ALL ON FUNCTION public.deposit_satisfied(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fully_settled(UUID)     FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deposit_satisfied(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.fully_settled(UUID)     TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  updated_at
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_card_commission_row()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS card_orders_touch ON public.card_orders;
CREATE TRIGGER card_orders_touch
  BEFORE UPDATE ON public.card_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_card_commission_row();

DROP TRIGGER IF EXISTS card_packages_touch ON public.card_packages;
CREATE TRIGGER card_packages_touch
  BEFORE UPDATE ON public.card_packages
  FOR EACH ROW EXECUTE FUNCTION public.touch_card_commission_row();

-- ─────────────────────────────────────────────────────────────────────────────
--  Seed
-- ─────────────────────────────────────────────────────────────────────────────
--
-- SLA, revision allowance and auto-approve windows are taken verbatim from
-- PRD §7.5. Prices are NOT in the PRD (§11 open questions 6 and 8 leave both
-- package pricing and top-up pricing unset), so every package is seeded
-- INACTIVE with placeholder amounts. An inactive package cannot be sold — this
-- is deliberate. Shipping with invented prices would mean taking real money at
-- a number nobody signed off. Set the real prices, then flip `active`.

INSERT INTO public.card_packages
  (id, name_en, name_sw, price_tzs, deposit_percent, first_draft_hours,
   revisions_included, revisions_fair_use, topup_price_tzs, auto_approve_days,
   active, sort_order)
VALUES
  ('essential', 'Essential', 'Msingi',      150000, 50, 72,    1, NULL, 25000, 5, FALSE, 1),
  ('classic',   'Classic',   'Klasiki',     250000, 50, 48,    2, NULL, 25000, 5, FALSE, 2),
  ('elegant',   'Elegant',   'Maridadi',    400000, 50, 36,    3, NULL, 25000, 7, FALSE, 3),
  ('signature', 'Signature', 'Saini',       650000, 50, 24, NULL,    6, 25000, 7, FALSE, 4)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.card_categories (id, name_en, name_sw, ticketed, sort_order)
VALUES
  ('wedding',       'Wedding',       'Harusi',           TRUE,  1),
  ('send_off',      'Send-off',      'Send Off',         TRUE,  2),
  ('kitchen_party', 'Kitchen party', 'Kitchen Party',    TRUE,  3),
  ('corporate',     'Corporate',     'Kampuni',          FALSE, 4),
  ('birthday',      'Birthday',      'Siku ya Kuzaliwa', FALSE, 5),
  ('graduation',    'Graduation',    'Mahafali',         FALSE, 6)
ON CONFLICT (id) DO NOTHING;

-- Catalogue is public-readable (checkout must price without a session); orders
-- and payments are locked down in the RLS migration that follows.
ALTER TABLE public.card_packages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS card_packages_public_read ON public.card_packages;
CREATE POLICY card_packages_public_read ON public.card_packages
  FOR SELECT TO anon, authenticated USING (active = TRUE);

DROP POLICY IF EXISTS card_categories_public_read ON public.card_categories;
CREATE POLICY card_categories_public_read ON public.card_categories
  FOR SELECT TO anon, authenticated USING (active = TRUE);

GRANT SELECT ON public.card_packages, public.card_categories TO anon, authenticated;
GRANT ALL    ON public.card_packages, public.card_categories TO service_role;

NOTIFY pgrst, 'reload schema';
