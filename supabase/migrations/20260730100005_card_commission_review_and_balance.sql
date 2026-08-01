-- Custom Card Commission Service — Phase 3 (Close the loop).
-- Specs: OP-CCS-PRD-001 §7.2.2, §7.2.3, §7.6, §7.10; OP-CCS-TDD-001 §5.3, §5.4.
--
-- This is the phase that makes the 50/50 model collectable rather than
-- optimistic. Phase 2 can produce a finished card; without what follows,
-- approval would hand that card over for half the money.
--
-- Three mechanisms, all enforced here rather than in application code:
--
--   1. The revision allowance is a hard counter, and a CORRECTION never
--      touches it. "Errors are not revisions" (PRD §7.11.6) is a promise the
--      product has to keep structurally, or every argument becomes a
--      negotiation about whether a misspelling counted.
--   2. A top-up raises total_tzs and is collected WITH the balance. One
--      payment at the end is how customers expect this to work, and it means
--      design reopens on ACCEPTANCE of the charge, not on payment of it.
--   3. The clean master is generated at SETTLEMENT. Before that it does not
--      exist in storage at all, so there is no releasable artefact for a
--      leaked URL to expose (loophole L14).

-- ─────────────────────────────────────────────────────────────────────────────
--  The auto-approve clock
-- ─────────────────────────────────────────────────────────────────────────────
-- Loophole L15 is "customer refuses to approve indefinitely to avoid
-- triggering the balance". The timer is the answer, and it needs an anchor.

ALTER TABLE public.card_orders
  ADD COLUMN IF NOT EXISTS client_review_started_at TIMESTAMPTZ;

COMMENT ON COLUMN public.card_orders.client_review_started_at IS
  'When the current review window opened. Reset on every entry to client_review, so a revision restarts the clock rather than letting an old one fire against fresh work.';

-- Stamped by the state machine itself, so no caller can forget it and quietly
-- disable the auto-approve timer for an order.
CREATE OR REPLACE FUNCTION public.card_orders_stamp_review_window()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'client_review' AND OLD.status IS DISTINCT FROM 'client_review' THEN
    NEW.client_review_started_at := now();
  ELSIF NEW.status <> 'client_review' THEN
    NEW.client_review_started_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS card_orders_review_window ON public.card_orders;
CREATE TRIGGER card_orders_review_window
  BEFORE UPDATE OF status ON public.card_orders
  FOR EACH ROW EXECUTE FUNCTION public.card_orders_stamp_review_window();

-- ─────────────────────────────────────────────────────────────────────────────
--  Revisions
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * Open a revision round.
 *
 * `p_is_correction` is the "this is an error, not a change" path from the
 * customer-facing form. It routes to rework WITHOUT decrementing the
 * allowance, and it is free and unlimited.
 *
 * Returns the round id, or raises when the allowance is spent and no top-up
 * has been accepted — the caller then offers the top-up. The counter lives
 * here rather than in the UI because L6 is "infinite free revisions".
 */
CREATE OR REPLACE FUNCTION public.open_revision_round(
  p_order_id      UUID,
  p_items         JSONB,
  p_is_correction BOOLEAN DEFAULT FALSE,
  p_actor_id      TEXT DEFAULT NULL,
  p_requested_by  UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order    public.card_orders;
  v_round_no INTEGER;
  v_version  INTEGER;
  v_round_id UUID;
  v_billable BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_order FROM public.card_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_order.status <> 'client_review' THEN
    RAISE EXCEPTION 'order % is not open for review', v_order.order_no
      USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'a revision needs at least one requested change'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A correction is free. A revision consumes allowance unless there is none
  -- left, in which case the caller must accept a top-up first.
  IF NOT p_is_correction THEN
    IF v_order.revisions_remaining IS NOT NULL AND v_order.revisions_remaining <= 0 THEN
      RAISE EXCEPTION 'order % has no revisions remaining — a top-up must be accepted first', v_order.order_no
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  SELECT COALESCE(MAX(round_no), 0) + 1 INTO v_round_no
    FROM public.revision_rounds WHERE order_id = p_order_id;
  SELECT COALESCE(MAX(version_no), 1) INTO v_version
    FROM public.design_versions WHERE order_id = p_order_id;

  INSERT INTO public.revision_rounds
    (order_id, round_no, from_version, requested_by, items, is_correction, billable)
  VALUES (p_order_id, v_round_no, v_version, p_requested_by, p_items, p_is_correction, v_billable)
  RETURNING id INTO v_round_id;

  -- Decrement only for a real revision against a metered allowance. Signature
  -- (unlimited) carries NULL and is governed by fair use instead.
  IF NOT p_is_correction AND v_order.revisions_remaining IS NOT NULL THEN
    UPDATE public.card_orders
       SET revisions_remaining = revisions_remaining - 1,
           revisions_used = revisions_used + 1
     WHERE id = p_order_id;
  ELSIF NOT p_is_correction THEN
    UPDATE public.card_orders SET revisions_used = revisions_used + 1 WHERE id = p_order_id;
  END IF;

  PERFORM public.transition_order(
    p_order_id, 'revision_requested', 'revision.opened', 'customer', p_actor_id,
    jsonb_build_object('round_no', v_round_no, 'is_correction', p_is_correction,
                       'item_count', jsonb_array_length(p_items))
  );

  -- Straight back into design. The designer's task list is the round's items.
  PERFORM public.transition_order(
    p_order_id, 'in_design',
    CASE WHEN p_is_correction THEN 'revision.correction' ELSE 'revision.accepted' END,
    'system', NULL,
    jsonb_build_object('round_no', v_round_no)
  );

  RETURN v_round_id;
END;
$$;

REVOKE ALL ON FUNCTION public.open_revision_round(UUID, JSONB, BOOLEAN, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_revision_round(UUID, JSONB, BOOLEAN, TEXT, UUID) TO service_role;

/**
 * Accept a paid top-up so a further revision can be opened.
 *
 * The charge is added to `total_tzs` and recorded as a `topup` payment row in
 * `initiated` — NOT verified. It is collected with the balance, so no separate
 * transaction happens now and the customer pays once at the end.
 *
 * Design reopens on acceptance, not on payment. That is deliberate: making the
 * designer wait for money that is already guaranteed by the balance gate would
 * add days to a job the customer has already agreed to pay for.
 */
CREATE OR REPLACE FUNCTION public.accept_revision_topup(
  p_order_id UUID,
  p_actor_id TEXT DEFAULT NULL
)
RETURNS INTEGER                       -- the charge added, in TZS
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order  public.card_orders;
  v_price  INTEGER;
  v_pay_id UUID;
BEGIN
  SELECT * INTO v_order FROM public.card_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id USING ERRCODE = 'no_data_found';
  END IF;

  SELECT topup_price_tzs INTO v_price FROM public.card_packages WHERE id = v_order.package_id;
  IF v_price IS NULL THEN
    RAISE EXCEPTION 'no top-up price is configured for package %', v_order.package_id
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.order_payments (order_id, purpose, channel, state, expected_tzs)
  VALUES (p_order_id, 'topup', 'adjustment', 'initiated', v_price)
  RETURNING id INTO v_pay_id;

  -- The only thing that ever moves total_tzs.
  UPDATE public.card_orders
     SET total_tzs = total_tzs + v_price,
         -- Grant exactly one revision, so accepting a top-up buys one round
         -- rather than reopening the allowance indefinitely.
         revisions_remaining = COALESCE(revisions_remaining, 0) + 1
   WHERE id = p_order_id;

  INSERT INTO public.order_events
    (order_id, from_status, to_status, event_type, actor_type, actor_id, payload)
  VALUES (p_order_id, v_order.status, v_order.status, 'revision.topup_accepted',
          'customer', p_actor_id,
          jsonb_build_object('amount_tzs', v_price, 'payment_id', v_pay_id));

  RETURN v_price;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_revision_topup(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_revision_topup(UUID, TEXT) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  Settlement: the asset is released here and nowhere else
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * Record that the clean master has been produced for a settled order.
 *
 * Called by the publish worker AFTER it has written the unwatermarked file.
 * Refuses to record anything for an order that is not fully settled, so the
 * one column that says "a releasable artefact exists" can never be set on an
 * unpaid order — belt and braces around Gate 2.
 */
CREATE OR REPLACE FUNCTION public.record_master_asset(
  p_order_id UUID,
  p_version_id UUID,
  p_master_path TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.fully_settled(p_order_id) THEN
    RAISE EXCEPTION 'refusing to record a master asset for unsettled order %', p_order_id
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.design_versions
     SET master_png_path = p_master_path
   WHERE id = p_version_id AND order_id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_master_asset(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_master_asset(UUID, UUID, TEXT) TO service_role;

/** The approved version of an order — what gets published. */
CREATE OR REPLACE FUNCTION public.approved_version(p_order_id UUID)
RETURNS public.design_versions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT * FROM public.design_versions
  WHERE order_id = p_order_id AND qa_passed_at IS NOT NULL
  ORDER BY version_no DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.approved_version(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approved_version(UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  Sweeper work lists
-- ─────────────────────────────────────────────────────────────────────────────
-- The worker asks these questions every run. They are views rather than
-- application queries so the cron route, the admin dashboard and any future
-- alerting all read the same definition of "overdue".

/** client_review orders past their package's auto-approve window (L7, L15). */
CREATE OR REPLACE VIEW public.commission_auto_approve_due AS
SELECT o.id AS order_id, o.order_no, o.client_review_started_at, p.auto_approve_days
FROM public.card_orders o
JOIN public.card_packages p ON p.id = o.package_id
WHERE o.status = 'client_review'
  AND o.client_review_started_at IS NOT NULL
  AND o.client_review_started_at + make_interval(days => p.auto_approve_days) <= now();

/** Assignments not accepted inside the 2-hour window (L8). */
CREATE OR REPLACE VIEW public.commission_accept_overdue AS
SELECT o.id AS order_id, o.order_no, o.assigned_designer_id, o.assigned_at, o.assign_bounces
FROM public.card_orders o
WHERE o.status = 'assigned'
  AND o.accepted_at IS NULL
  AND o.assigned_at IS NOT NULL
  AND o.assigned_at + interval '2 hours' <= now();

/**
 * Balance chase state.
 *
 * The cadence compresses when the event is close: a customer whose wedding is
 * next week needs a phone call, not a fourth WhatsApp message (PRD §7.2.3).
 */
CREATE OR REPLACE VIEW public.commission_balance_chase AS
SELECT
  o.id AS order_id,
  o.order_no,
  o.status,
  o.balance_invoiced_at,
  o.balance_due_at,
  COALESCE(o.provisional_event_date, (SELECT e.starts_at::date FROM public.wedding_events e WHERE e.id = o.event_id)) AS event_date,
  (COALESCE(o.provisional_event_date, (SELECT e.starts_at::date FROM public.wedding_events e WHERE e.id = o.event_id)) - CURRENT_DATE) < 14 AS urgent,
  EXTRACT(EPOCH FROM (now() - o.balance_invoiced_at)) / 3600.0 AS hours_since_invoice,
  l.outstanding_tzs
FROM public.card_orders o
JOIN public.order_ledger l ON l.order_id = o.id
WHERE o.status IN ('awaiting_balance', 'balance_overdue')
  AND o.balance_invoiced_at IS NOT NULL
  AND l.outstanding_tzs > 0;

/**
 * Orders past the forfeiture window.
 *
 * 21 days from invoicing. Forfeiture retains the deposit and archives the
 * order; it does NOT destroy anything, and paying later still releases the
 * asset normally — the designer's work is never lost.
 */
CREATE OR REPLACE VIEW public.commission_forfeiture_due AS
SELECT o.id AS order_id, o.order_no, o.balance_invoiced_at
FROM public.card_orders o
WHERE o.status = 'balance_overdue'
  AND o.balance_invoiced_at IS NOT NULL
  AND o.balance_invoiced_at + interval '21 days' <= now();

/** Orders awaiting customer input for 90 days (PRD §7.11.7). Restorable. */
CREATE OR REPLACE VIEW public.commission_dormant AS
SELECT o.id AS order_id, o.order_no, o.status, o.last_customer_response_at
FROM public.card_orders o
WHERE o.archived_at IS NULL
  AND o.status IN ('awaiting_deposit', 'deposit_rejected', 'intake_pending')
  AND COALESCE(o.last_customer_response_at, o.created_at) + interval '90 days' <= now();

REVOKE ALL ON
  public.commission_auto_approve_due, public.commission_accept_overdue,
  public.commission_balance_chase, public.commission_forfeiture_due,
  public.commission_dormant
FROM PUBLIC, anon;
GRANT SELECT ON
  public.commission_auto_approve_due, public.commission_accept_overdue,
  public.commission_balance_chase, public.commission_forfeiture_due,
  public.commission_dormant
TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  Reminder bookkeeping
-- ─────────────────────────────────────────────────────────────────────────────
-- Without this the sweeper re-sends the 24h reminder on every run.

CREATE TABLE IF NOT EXISTS public.commission_reminders_sent (
  order_id   UUID NOT NULL REFERENCES public.card_orders(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,          -- balance_24h, balance_72h, brief_24h…
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, kind)
);

ALTER TABLE public.commission_reminders_sent ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commission_reminders_sent FROM anon, authenticated;
GRANT ALL ON public.commission_reminders_sent TO service_role;

/** Records a reminder, returning FALSE if it had already been sent. */
CREATE OR REPLACE FUNCTION public.claim_commission_reminder(p_order_id UUID, p_kind TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.commission_reminders_sent (order_id, kind) VALUES (p_order_id, p_kind);
  RETURN TRUE;
EXCEPTION WHEN unique_violation THEN
  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_commission_reminder(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_commission_reminder(UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
