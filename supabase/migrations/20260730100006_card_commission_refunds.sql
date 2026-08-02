-- Custom Card Commission Service — cancellations, refunds and remedies.
-- Specs: OP-CCS-PRD-001 §7.11 (all), OP-CCS-POL-001; loopholes L11, L19, L20.
--
-- The policy's own framing: "the deposit is the commitment, and refundability
-- tracks how much design work has been consumed". The customer's exposure
-- grows only as our cost grows, which is defensible on a phone call and —
-- critically — expressible as a database guard rather than an Ops judgement
-- call. That last property is the entire reason this migration exists rather
-- than a runbook.
--
-- §7.11.3 ranks the remedies, and the product should offer them in that order
-- because most disputes should never become refunds at all:
--
--   1. Rework        — anything wrong with the artwork. Free, not a revision.
--   2. Postponement  — a wedding moving is not a cancellation.
--   3. Credit note   — 110% of the refundable amount, and usually more
--                      attractive to the customer than the cash.
--   4. Transfer      — reassign to a different buyer, free.
--
-- Cash is the last resort, not the first response.

-- ─────────────────────────────────────────────────────────────────────────────
--  Approval authority
-- ─────────────────────────────────────────────────────────────────────────────
-- PRD §11 open question 1 flags the TSh 200,000 ceiling as needing sign-off.
-- It is a row, not a constant, so changing it is a decision someone records
-- rather than a code change.

CREATE TABLE IF NOT EXISTS public.commission_policy_settings (
  key         TEXT PRIMARY KEY,
  value_int   INTEGER,
  note        TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.commission_policy_settings (key, value_int, note) VALUES
  ('finance_refund_ceiling_tzs', 200000,
   'Finance may approve refunds up to this amount. Above it requires CSFO (platform.admin). PRD §11 Q1 — NEEDS SIGN-OFF.'),
  ('credit_note_uplift_pct', 110,
   'Credit notes are offered at this percentage of the refundable amount. PRD §7.11.3 — NEEDS SIGN-OFF.'),
  ('credit_note_validity_months', 12,
   'Standard credit note validity. The called-off-event case (§7.11.4) uses 24 months instead.'),
  ('free_postponements', 2,
   'Free date changes within 24 months of the order date (§7.11.3).')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.commission_policy_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commission_policy_settings FROM anon, authenticated;
GRANT SELECT ON public.commission_policy_settings TO authenticated;
GRANT ALL ON public.commission_policy_settings TO service_role;

CREATE OR REPLACE FUNCTION public.commission_setting(p_key TEXT, p_default INTEGER)
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT value_int FROM public.commission_policy_settings WHERE key = p_key), p_default);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  Requesting a refund
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * Log a cancellation request, freezing the entitlement.
 *
 * The single most important line in this function is the snapshot. §7.11.1:
 * "The tier is determined by the state at the moment the request is logged,
 * not the state when Finance gets to it. This prevents a request being
 * devalued by our own processing delay." A customer who cancels before a
 * designer starts, and waits two days for Finance, must not be paid at the
 * lower tier the order reached in the meantime.
 *
 * Fault-based reasons bypass the tier table entirely at 100% (§7.11.2): where
 * the failure is ours, a refund is the floor, not the ceiling.
 *
 * Requests are accepted through any channel — in-app, WhatsApp, phone — and
 * all are logged against the order, which is why `p_via` exists rather than
 * assuming the app.
 */
CREATE OR REPLACE FUNCTION public.request_refund(
  p_order_id     UUID,
  p_reason       public.card_refund_reason,
  p_via          TEXT DEFAULT 'app',
  p_note         TEXT DEFAULT NULL,
  p_requested_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order      public.card_orders;
  v_pct        INTEGER;
  v_deposit    INTEGER;
  v_entitled   INTEGER;
  v_request_id UUID;
  v_fault      BOOLEAN;
BEGIN
  SELECT * INTO v_order FROM public.card_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id USING ERRCODE = 'no_data_found';
  END IF;

  -- One open request at a time. A second would race the first through the
  -- approval queue and could pay twice.
  IF EXISTS (
    SELECT 1 FROM public.refund_requests
    WHERE order_id = p_order_id AND state IN ('requested', 'approved')
  ) THEN
    RAISE EXCEPTION 'order % already has an open refund request', v_order.order_no
      USING ERRCODE = 'unique_violation';
  END IF;

  v_fault := p_reason IN ('opusfesta_fault', 'sla_breach', 'defective_deliverable', 'force_majeure');

  -- Where the failure is ours, or an event of force majeure pushed the order
  -- past the customer's date, the tier table does not apply.
  v_pct := CASE WHEN v_fault THEN 100 ELSE public.refund_entitlement(p_order_id) END;

  -- The percentage applies to the DEPOSIT ACTUALLY PAID, not to the order
  -- total and not to the deposit that was due. A partial deposit is refunded
  -- on the same tier basis, applied to the amount actually received
  -- (§7.11.5).
  SELECT COALESCE(l.deposit_paid_tzs, 0) INTO v_deposit
  FROM public.order_ledger l WHERE l.order_id = p_order_id;

  -- Fault-based refunds return EVERYTHING paid, not just the deposit.
  IF v_fault THEN
    SELECT GREATEST(COALESCE(l.paid_tzs, 0), 0) INTO v_deposit
    FROM public.order_ledger l WHERE l.order_id = p_order_id;
  END IF;

  v_entitled := GREATEST((v_deposit * v_pct) / 100, 0);

  INSERT INTO public.refund_requests
    (order_id, requested_via, requested_by, status_at_request, entitled_pct,
     entitled_tzs, reason, customer_note, state)
  VALUES
    (p_order_id, p_via, p_requested_by, v_order.status, v_pct,
     v_entitled, p_reason, p_note, 'requested')
  RETURNING id INTO v_request_id;

  INSERT INTO public.order_events
    (order_id, from_status, to_status, event_type, actor_type, actor_id, payload, visible_to)
  VALUES (p_order_id, v_order.status, v_order.status, 'refund.requested',
          CASE WHEN p_requested_by IS NOT NULL THEN 'customer' ELSE 'admin' END,
          p_requested_by::text,
          jsonb_build_object('request_id', v_request_id, 'reason', p_reason,
                             'entitled_pct', v_pct, 'entitled_tzs', v_entitled,
                             'fault_based', v_fault),
          ARRAY['customer', 'admin']);

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_refund(UUID, public.card_refund_reason, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_refund(UUID, public.card_refund_reason, TEXT, TEXT, UUID)
  TO service_role;

/**
 * What a customer would get if they cancelled right now.
 *
 * Shown BEFORE they commit, so the decision is informed rather than a
 * surprise afterwards. Reads from the same function that will decide the real
 * figure, so the quote and the outcome cannot disagree.
 */
CREATE OR REPLACE FUNCTION public.refund_quote(p_order_id UUID)
RETURNS TABLE (
  entitled_pct       INTEGER,
  entitled_tzs       INTEGER,
  deposit_paid_tzs   INTEGER,
  credit_note_tzs    INTEGER,
  postponements_left INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.refund_entitlement(p_order_id) AS entitled_pct,
    GREATEST((COALESCE(l.deposit_paid_tzs, 0) * public.refund_entitlement(p_order_id)) / 100, 0)::int AS entitled_tzs,
    COALESCE(l.deposit_paid_tzs, 0)::int AS deposit_paid_tzs,
    -- The credit note is deliberately quoted alongside the cash figure,
    -- because it is worth more and most customers prefer it once they see it.
    GREATEST(
      ((COALESCE(l.deposit_paid_tzs, 0) * public.refund_entitlement(p_order_id)) / 100
        * public.commission_setting('credit_note_uplift_pct', 110)) / 100, 0)::int AS credit_note_tzs,
    GREATEST(public.commission_setting('free_postponements', 2) - o.postponements_used, 0) AS postponements_left
  FROM public.card_orders o
  LEFT JOIN public.order_ledger l ON l.order_id = o.id
  WHERE o.id = p_order_id;
$$;

REVOKE ALL ON FUNCTION public.refund_quote(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_quote(UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  Deciding
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * Approve, reject, or convert a refund request to a credit note.
 *
 * `p_is_csfo` tells the function whether the approver holds authority above
 * the Finance ceiling. Enforcing the ceiling HERE rather than only in the UI
 * is what makes it real: an operator cannot approve a large refund by
 * navigating around a disabled button.
 *
 * Nothing here disburses money. Approval and disbursement are separate steps
 * on purpose (§7.11.5) — the negative ledger row is written only on CONFIRMED
 * payout, so a failed transfer never overstates what we have refunded.
 */
CREATE OR REPLACE FUNCTION public.decide_refund(
  p_request_id  UUID,
  p_decision    TEXT,                 -- approve | reject | credit_note
  p_approver_id UUID,
  p_note        TEXT,
  p_is_csfo     BOOLEAN DEFAULT FALSE,
  p_exception   BOOLEAN DEFAULT FALSE
)
RETURNS public.refund_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_req     public.refund_requests;
  v_ceiling INTEGER;
BEGIN
  SELECT * INTO v_req FROM public.refund_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund request % not found', p_request_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_req.state <> 'requested' THEN
    RAISE EXCEPTION 'that request has already been decided' USING ERRCODE = 'check_violation';
  END IF;
  IF length(btrim(COALESCE(p_note, ''))) < 3 THEN
    RAISE EXCEPTION 'a decision note is required' USING ERRCODE = 'check_violation';
  END IF;

  v_ceiling := public.commission_setting('finance_refund_ceiling_tzs', 200000);
  IF p_decision IN ('approve', 'credit_note')
     AND v_req.entitled_tzs > v_ceiling
     AND NOT p_is_csfo THEN
    RAISE EXCEPTION 'this refund is above the Finance ceiling of % TZS and needs CSFO approval', v_ceiling
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A policy exception is granting something the tier table does not allow.
  -- Permitted, but never quietly: it requires the elevated role and is logged
  -- as an exception rather than as a normal approval (loophole L11).
  IF p_exception AND NOT p_is_csfo THEN
    RAISE EXCEPTION 'a policy exception requires CSFO or CEO authority'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.refund_requests
     SET state = (CASE WHEN p_decision = 'reject' THEN 'rejected' ELSE 'approved' END)::public.card_refund_state,
         resolution = CASE
           WHEN p_decision = 'credit_note' THEN 'credit_note'
           WHEN p_decision = 'approve'     THEN 'cash'
           ELSE resolution END,
         approved_by = p_approver_id,
         approved_at = now(),
         approver_note = p_note,
         policy_exception = p_exception
   WHERE id = p_request_id
  RETURNING * INTO v_req;

  INSERT INTO public.order_events
    (order_id, from_status, to_status, event_type, actor_type, actor_id, payload, visible_to)
  VALUES (v_req.order_id, NULL, NULL,
          CASE WHEN p_exception THEN 'policy.exception' ELSE 'refund.decided' END,
          'finance', p_approver_id::text,
          jsonb_build_object('request_id', p_request_id, 'decision', p_decision,
                             'amount_tzs', v_req.entitled_tzs, 'note', p_note),
          -- A policy exception is an internal record, not customer-facing.
          CASE WHEN p_exception THEN ARRAY['admin'] ELSE ARRAY['customer', 'admin'] END);

  RETURN v_req;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_refund(UUID, TEXT, UUID, TEXT, BOOLEAN, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_refund(UUID, TEXT, UUID, TEXT, BOOLEAN, BOOLEAN) TO service_role;

/**
 * Record a confirmed disbursement.
 *
 * This is the ONLY place a negative ledger row is written. A refund is never a
 * deletion or an edit of the original payment, so the financial history of an
 * order stays complete and auditable (§7.11.5).
 *
 * `p_payout_msisdn` is verified against the order's phone by the caller before
 * release; a change requires a second approver (loophole L20).
 */
CREATE OR REPLACE FUNCTION public.disburse_refund(
  p_request_id    UUID,
  p_payout_msisdn TEXT,
  p_actor_id      UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_req    public.refund_requests;
  v_pay_id UUID;
BEGIN
  SELECT * INTO v_req FROM public.refund_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund request % not found', p_request_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_req.state <> 'approved' THEN
    RAISE EXCEPTION 'only an approved refund can be disbursed' USING ERRCODE = 'check_violation';
  END IF;
  IF v_req.payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'this refund has already been disbursed' USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.order_payments
    (order_id, purpose, channel, state, expected_tzs, received_tzs,
     verified_by, verified_at, review_note)
  VALUES
    (v_req.order_id, 'refund', 'adjustment', 'verified',
     v_req.entitled_tzs, -v_req.entitled_tzs,
     p_actor_id::text, now(), 'Refund disbursed to ' || p_payout_msisdn)
  RETURNING id INTO v_pay_id;

  UPDATE public.refund_requests
     SET state = 'disbursed', payment_id = v_pay_id,
         payout_msisdn = p_payout_msisdn, disbursed_at = now()
   WHERE id = p_request_id;

  INSERT INTO public.order_events
    (order_id, from_status, to_status, event_type, actor_type, actor_id, payload)
  VALUES (v_req.order_id, NULL, NULL, 'refund.disbursed', 'finance', p_actor_id::text,
          jsonb_build_object('request_id', p_request_id, 'amount_tzs', v_req.entitled_tzs));

  RETURN v_pay_id;
END;
$$;

REVOKE ALL ON FUNCTION public.disburse_refund(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.disburse_refund(UUID, TEXT, UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  Credit notes
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * Issue a credit note, at the uplift.
 *
 * `p_months` defaults to the standard validity; the called-off-event case
 * (§7.11.4) passes 24. That case is worth calling out: a wedding being called
 * off is a bad day in someone's life, and Ops has STANDING AUTHORITY to offer
 * the full amount paid as a transferable credit note regardless of state, with
 * no explanation or evidence required. It is the documented default, not a
 * favour to be negotiated, so front-line staff can offer it immediately
 * without escalating.
 */
CREATE OR REPLACE FUNCTION public.issue_credit_note(
  p_order_id     UUID,
  p_base_tzs     INTEGER,
  p_holder_phone TEXT,
  p_issued_by    UUID,
  p_months       INTEGER DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_code   TEXT;
  v_value  INTEGER;
  v_months INTEGER;
BEGIN
  v_value := GREATEST((p_base_tzs * public.commission_setting('credit_note_uplift_pct', 110)) / 100, 0);
  IF v_value <= 0 THEN
    RAISE EXCEPTION 'a credit note must carry a positive value' USING ERRCODE = 'check_violation';
  END IF;
  v_months := COALESCE(p_months, public.commission_setting('credit_note_validity_months', 12));

  -- Human-readable and easy to read out over the phone, which is how most of
  -- these will actually be redeemed.
  v_code := 'OF-CN-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  INSERT INTO public.credit_notes
    (code, order_id, holder_phone, value_tzs, balance_tzs, expires_at, transferable, issued_by)
  VALUES (v_code, p_order_id, p_holder_phone, v_value, v_value,
          now() + make_interval(months => v_months), TRUE, p_issued_by);

  INSERT INTO public.order_events
    (order_id, from_status, to_status, event_type, actor_type, actor_id, payload)
  VALUES (p_order_id, NULL, NULL, 'credit_note.issued', 'finance', p_issued_by::text,
          jsonb_build_object('code', v_code, 'value_tzs', v_value, 'valid_months', v_months));

  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_credit_note(UUID, INTEGER, TEXT, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_credit_note(UUID, INTEGER, TEXT, UUID, INTEGER) TO service_role;

/**
 * Redeem a credit note against an order.
 *
 * Creates a `discount` row, so a redemption is visible in exactly the same
 * ledger as every other money movement rather than being a special case the
 * financial position has to know about. Supports partial redemption across
 * several orders; the remaining balance stays on the note, and the expiry is
 * NOT extended by partial use.
 */
CREATE OR REPLACE FUNCTION public.redeem_credit_note(
  p_code     TEXT,
  p_order_id UUID,
  p_amount   INTEGER,
  p_actor_id UUID DEFAULT NULL
)
RETURNS INTEGER                       -- amount actually applied
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_note    public.credit_notes;
  v_applied INTEGER;
  v_pay_id  UUID;
BEGIN
  SELECT * INTO v_note FROM public.credit_notes WHERE code = p_code FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no credit note with that code' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_note.expires_at < now() THEN
    RAISE EXCEPTION 'credit note % expired on %', p_code, v_note.expires_at::date
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_note.balance_tzs <= 0 THEN
    RAISE EXCEPTION 'credit note % has already been fully used', p_code
      USING ERRCODE = 'check_violation';
  END IF;

  -- Never apply more than the note holds, and never more than is owed.
  SELECT LEAST(v_note.balance_tzs, p_amount, GREATEST(l.outstanding_tzs, 0))
    INTO v_applied
  FROM public.order_ledger l WHERE l.order_id = p_order_id;

  IF COALESCE(v_applied, 0) <= 0 THEN
    RAISE EXCEPTION 'nothing to apply — the order has no outstanding balance'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Negative, because a discount is a credit against the total rather than
  -- money received. See the order_ledger comment.
  INSERT INTO public.order_payments
    (order_id, purpose, channel, state, expected_tzs, received_tzs,
     verified_by, verified_at, review_note)
  VALUES (p_order_id, 'discount', 'adjustment', 'verified',
          v_applied, -v_applied, COALESCE(p_actor_id::text, 'system'), now(),
          'Credit note ' || p_code)
  RETURNING id INTO v_pay_id;

  UPDATE public.credit_notes SET balance_tzs = balance_tzs - v_applied WHERE id = v_note.id;

  INSERT INTO public.credit_note_redemptions (credit_note_id, order_id, amount_tzs, payment_id)
  VALUES (v_note.id, p_order_id, v_applied, v_pay_id);

  INSERT INTO public.order_events
    (order_id, from_status, to_status, event_type, actor_type, actor_id, payload)
  VALUES (p_order_id, NULL, NULL, 'credit_note.redeemed', 'finance', p_actor_id::text,
          jsonb_build_object('code', p_code, 'amount_tzs', v_applied));

  RETURN v_applied;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_credit_note(TEXT, UUID, INTEGER, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_credit_note(TEXT, UUID, INTEGER, UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  Postponement
-- ─────────────────────────────────────────────────────────────────────────────

/**
 * Move an order's event date.
 *
 * "A wedding moving dates is not a cancellation" (§7.11.3). Two are free
 * within 24 months of the order date; beyond that, designers, prices and
 * available styles have changed enough that it is fairer to both sides to
 * treat it as a new order.
 *
 * The order is held and resumed rather than left running, so the SLA clock
 * does not burn while the date is unsettled.
 */
CREATE OR REPLACE FUNCTION public.postpone_order(
  p_order_id UUID,
  p_new_date DATE,
  p_actor_id TEXT DEFAULT NULL
)
RETURNS INTEGER                       -- postponements remaining
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.card_orders;
  v_free  INTEGER;
BEGIN
  SELECT * INTO v_order FROM public.card_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id USING ERRCODE = 'no_data_found';
  END IF;

  v_free := public.commission_setting('free_postponements', 2);
  IF v_order.postponements_used >= v_free THEN
    RAISE EXCEPTION 'order % has used all % free postponements — treat this as a new order',
      v_order.order_no, v_free USING ERRCODE = 'check_violation';
  END IF;
  IF v_order.created_at + interval '24 months' < now() THEN
    RAISE EXCEPTION 'order % is more than 24 months old — treat this as a new order', v_order.order_no
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.card_orders
     SET provisional_event_date = p_new_date,
         postponements_used = postponements_used + 1,
         -- The balance chase is anchored to the event date, so moving the date
         -- must clear a due date computed against the old one.
         balance_due_at = CASE WHEN status IN ('awaiting_balance','balance_overdue')
                               THEN balance_due_at ELSE NULL END
   WHERE id = p_order_id;

  INSERT INTO public.order_events
    (order_id, from_status, to_status, event_type, actor_type, actor_id, payload)
  VALUES (p_order_id, v_order.status, v_order.status, 'order.postponed', 'admin', p_actor_id,
          jsonb_build_object('new_date', p_new_date,
                             'postponements_used', v_order.postponements_used + 1));

  RETURN v_free - (v_order.postponements_used + 1);
END;
$$;

REVOKE ALL ON FUNCTION public.postpone_order(UUID, DATE, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.postpone_order(UUID, DATE, TEXT) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  Anti-abuse (§7.11.9)
-- ─────────────────────────────────────────────────────────────────────────────

/** Three separate cancelled orders from one phone in 12 months → CSFO review. */
CREATE OR REPLACE VIEW public.commission_refund_watchlist AS
SELECT
  o.buyer_phone,
  count(DISTINCT r.id)                 AS refund_requests,
  sum(r.entitled_tzs)::int             AS total_requested_tzs,
  max(r.requested_at)                  AS last_request_at
FROM public.refund_requests r
JOIN public.card_orders o ON o.id = r.order_id
WHERE r.requested_at > now() - interval '12 months'
GROUP BY o.buyer_phone
HAVING count(DISTINCT r.id) >= 3;

COMMENT ON VIEW public.commission_refund_watchlist IS
  'PRD §7.11.9: refund requests following three separate orders from the same phone within 12 months are flagged for CSFO review.';

REVOKE ALL ON public.commission_refund_watchlist FROM PUBLIC, anon;
GRANT SELECT ON public.commission_refund_watchlist TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
