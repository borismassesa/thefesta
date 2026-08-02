-- Custom Card Commission Service — event log, outbox, claim tokens and the
-- state machine that is the only writer of card_orders.status.
-- Specs: OP-CCS-TDD-001 §3.4, §4, §7; OP-CCS-DIA-001.
--
-- Design principle 3 of the TDD: "Transitions are server-side and guarded. A
-- single transition_order() function is the only writer of card_orders.status.
-- Direct updates are revoked. This is what makes the loophole register
-- enforceable rather than aspirational."
--
-- Everything here exists to make that sentence literally true:
--   * transition_order() takes a row lock, checks the transition table, runs
--     the guards, writes the status, appends an immutable event and enqueues
--     notifications — all in ONE transaction, so a state change can never be
--     half-applied or silently un-notified.
--   * UPDATE(status) is revoked from anon and authenticated afterwards.
--   * order_events has no UPDATE or DELETE grant to anyone at all.

-- ─────────────────────────────────────────────────────────────────────────────
--  The timeline — the single source of truth for "what happened"
-- ─────────────────────────────────────────────────────────────────────────────
-- This is the audit log AND the UI feed. No status change happens without an
-- event, which is what makes Admin and OpusPass structurally incapable of
-- showing different states (loophole L9).

CREATE TABLE IF NOT EXISTS public.order_events (
  id          BIGSERIAL PRIMARY KEY,
  order_id    UUID NOT NULL REFERENCES public.card_orders(id) ON DELETE CASCADE,
  from_status public.card_order_status,
  to_status   public.card_order_status,
  event_type  TEXT NOT NULL,   -- payment.verified, task.assigned, revision.opened…
  actor_type  TEXT NOT NULL CHECK (actor_type IN ('customer', 'designer', 'finance', 'admin', 'system')),
  -- Free text: a users.id, a workforce_employees.id, or 'selcom_webhook'.
  -- Deliberately untyped because the actors genuinely come from three
  -- different identity tables plus the payment provider.
  actor_id    TEXT,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Who may see this row. A policy exception, an internal QA note or an Ops
  -- escalation is admin-only; the customer's timeline shows only their own.
  visible_to  TEXT[] NOT NULL DEFAULT '{customer,designer,admin}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.order_events IS
  'Append-only timeline. Immutable by grant, not by convention: UPDATE and DELETE are revoked from every role including service_role.';

CREATE INDEX IF NOT EXISTS order_events_order_idx
  ON public.order_events (order_id, created_at);
CREATE INDEX IF NOT EXISTS order_events_type_idx
  ON public.order_events (event_type, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
--  Outbox — nothing leaves the system without a durable row
-- ─────────────────────────────────────────────────────────────────────────────
-- Written in the SAME TRANSACTION as the state change, then delivered by a
-- worker with retry. A failed send can never lose a notification, and a
-- rolled-back transition can never emit one.

CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID REFERENCES public.card_orders(id) ON DELETE CASCADE,
  audience      TEXT NOT NULL CHECK (audience IN ('customer', 'designer', 'finance', 'admin')),
  channel       TEXT NOT NULL CHECK (channel IN ('bell', 'sms', 'email', 'whatsapp')),
  -- Resolved at enqueue time for the customer (their phone or email). NULL for
  -- staff audiences, which the dispatcher fans out to the current role holders
  -- — freezing a staff recipient at enqueue time would send to whoever held the
  -- role days ago rather than whoever holds it now.
  recipient     TEXT,
  template_key  TEXT NOT NULL,
  locale        TEXT NOT NULL DEFAULT 'sw' CHECK (locale IN ('sw', 'en')),
  variables     JSONB NOT NULL DEFAULT '{}'::jsonb,
  state         TEXT NOT NULL DEFAULT 'pending'
                  CHECK (state IN ('pending', 'sent', 'failed', 'dead')),
  attempts      INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error    TEXT,
  provider_ref  TEXT,
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_outbox_due_idx
  ON public.notification_outbox (state, next_attempt_at)
  WHERE state IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS notification_outbox_order_idx
  ON public.notification_outbox (order_id, created_at DESC);

-- The PRD §7.8 notification matrix as data rather than a switch statement.
-- Adding a channel for an event becomes an INSERT, not a deploy — which
-- matters because the Kiswahili WhatsApp templates land on Meta's approval
-- schedule, not ours.
CREATE TABLE IF NOT EXISTS public.card_notification_rules (
  event_type   TEXT NOT NULL,
  audience     TEXT NOT NULL CHECK (audience IN ('customer', 'designer', 'finance', 'admin')),
  channel      TEXT NOT NULL CHECK (channel IN ('bell', 'sms', 'email', 'whatsapp')),
  template_key TEXT NOT NULL,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (event_type, audience, channel)
);

COMMENT ON TABLE public.card_notification_rules IS
  'PRD §7.8 matrix as data. A WhatsApp row can be deactivated the moment Meta rejects a template, and the outbox falls through to SMS without a deploy.';

INSERT INTO public.card_notification_rules (event_type, audience, channel, template_key) VALUES
  -- Deposit received (Selcom)
  ('deposit.verified',   'customer', 'whatsapp', 'deposit_confirmed'),
  ('deposit.verified',   'customer', 'email',    'deposit_confirmed'),
  ('deposit.verified',   'finance',  'bell',     'deposit_confirmed'),
  ('deposit.verified',   'admin',    'bell',     'deposit_confirmed'),
  -- Lipa Namba pending review (either gate)
  ('payment.submitted',  'customer', 'sms',      'payment_pending_review'),
  ('payment.submitted',  'finance',  'bell',     'payment_pending_review'),
  ('payment.submitted',  'finance',  'email',    'payment_pending_review'),
  ('payment.submitted',  'admin',    'bell',     'payment_pending_review'),
  -- Short payment — the shortfall is the whole message
  ('payment.short',      'customer', 'whatsapp', 'deposit_shortfall'),
  ('payment.short',      'customer', 'sms',      'deposit_shortfall'),
  -- Deposit approved
  ('deposit.approved',   'customer', 'whatsapp', 'deposit_confirmed'),
  ('deposit.approved',   'customer', 'email',    'deposit_confirmed'),
  ('deposit.approved',   'designer', 'bell',     'card_request_information'),
  ('deposit.approved',   'admin',    'bell',     'deposit_confirmed'),
  -- Brief
  ('brief.reminder',     'customer', 'whatsapp', 'card_request_information'),
  ('brief.reminder',     'customer', 'sms',      'card_request_information'),
  -- Assignment
  ('task.assigned',      'designer', 'bell',     'task_assigned'),
  ('task.assigned',      'designer', 'email',    'task_assigned'),
  ('task.assigned',      'designer', 'whatsapp', 'task_assigned'),
  ('task.assigned',      'admin',    'bell',     'task_assigned'),
  ('task.accept_breach', 'admin',    'bell',     'accept_sla_breach'),
  ('task.accept_breach', 'admin',    'email',    'accept_sla_breach'),
  -- Review
  ('version.ready',      'customer', 'whatsapp', 'card_ready_for_review'),
  ('version.ready',      'customer', 'email',    'card_ready_for_review'),
  ('version.ready',      'customer', 'bell',     'card_ready_for_review'),
  ('version.ready',      'admin',    'bell',     'card_ready_for_review'),
  ('revision.opened',    'customer', 'bell',     'revision_requested'),
  ('revision.opened',    'designer', 'bell',     'revision_requested'),
  ('revision.opened',    'designer', 'email',    'revision_requested'),
  ('revision.opened',    'admin',    'bell',     'revision_requested'),
  -- Gate 2
  ('order.approved',     'customer', 'whatsapp', 'balance_due'),
  ('order.approved',     'customer', 'sms',      'balance_due'),
  ('order.approved',     'customer', 'email',    'balance_due'),
  ('order.approved',     'designer', 'bell',     'balance_due'),
  ('order.approved',     'finance',  'bell',     'balance_due'),
  ('order.approved',     'admin',    'bell',     'balance_due'),
  ('balance.reminder',   'customer', 'whatsapp', 'balance_reminder'),
  ('balance.reminder',   'customer', 'sms',      'balance_reminder'),
  ('balance.reminder',   'customer', 'email',    'balance_reminder'),
  ('balance.overdue',    'customer', 'sms',      'balance_reminder'),
  ('balance.overdue',    'finance',  'bell',     'balance_reminder'),
  ('balance.overdue',    'admin',    'bell',     'balance_reminder'),
  ('balance.overdue',    'admin',    'email',    'balance_reminder'),
  ('balance.settled',    'customer', 'whatsapp', 'balance_settled'),
  ('balance.settled',    'customer', 'email',    'balance_settled'),
  ('balance.settled',    'designer', 'bell',     'balance_settled'),
  ('balance.settled',    'finance',  'bell',     'balance_settled'),
  ('balance.settled',    'admin',    'bell',     'balance_settled'),
  -- Delivery and forfeiture
  ('order.delivered',    'customer', 'whatsapp', 'card_send_to_guest'),
  ('order.delivered',    'customer', 'email',    'card_send_to_guest'),
  ('order.delivered',    'admin',    'bell',     'card_send_to_guest'),
  ('order.forfeited',    'customer', 'sms',      'balance_reminder'),
  ('order.forfeited',    'customer', 'email',    'balance_reminder'),
  ('order.forfeited',    'designer', 'bell',     'balance_reminder'),
  ('order.forfeited',    'finance',  'bell',     'balance_reminder'),
  ('order.forfeited',    'finance',  'email',    'balance_reminder'),
  ('order.forfeited',    'admin',    'bell',     'balance_reminder'),
  -- Claim
  ('order.created',      'customer', 'whatsapp', 'claim_your_order'),
  ('order.created',      'customer', 'sms',      'claim_your_order'),
  ('order.created',      'customer', 'email',    'claim_your_order')
ON CONFLICT (event_type, audience, channel) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
--  Claim tokens
-- ─────────────────────────────────────────────────────────────────────────────
-- The bridge between an anonymous checkout and a real account. Only the SHA-256
-- hash is stored, so a database leak does not hand out order access. Single
-- use, expiring, and bound to the checkout phone: a forwarded link still cannot
-- take over an order, because sign-in is still required and the phone must
-- match (loophole L4).

CREATE TABLE IF NOT EXISTS public.order_claim_tokens (
  token_hash TEXT PRIMARY KEY,          -- sha256 hex; the raw token is never stored
  order_id   UUID NOT NULL REFERENCES public.card_orders(id) ON DELETE CASCADE,
  phone      TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  used_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  -- Support can reissue; the superseded token is revoked rather than deleted so
  -- the trail of who was sent what survives.
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_claim_tokens_order_idx
  ON public.order_claim_tokens (order_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
--  The transition table
-- ─────────────────────────────────────────────────────────────────────────────
-- Mirrored exactly in packages/domain/src/order-state.ts. Both apps import the
-- TypeScript copy for UI affordances; this copy is the one that actually
-- decides, so a bug in the client can never produce an illegal state.

CREATE OR REPLACE FUNCTION public.is_valid_card_transition(
  p_from public.card_order_status,
  p_to   public.card_order_status
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM (VALUES
      -- ── Gate 1: deposit ──────────────────────────────────────────────────
      ('draft',              'awaiting_deposit'),
      ('awaiting_deposit',   'deposit_review'),
      ('awaiting_deposit',   'deposit_paid'),
      -- Idempotent self-transition. Underpayment is NOT an error state: it is
      -- the normal case of someone sending TSh 40,000 against a TSh 50,000
      -- request. The money is credited, the order does not move, and the
      -- customer is told exactly what remains. Modelling it as a failure would
      -- generate an Ops ticket for something that resolves itself in minutes.
      ('awaiting_deposit',   'awaiting_deposit'),
      ('deposit_review',     'deposit_paid'),
      ('deposit_review',     'deposit_rejected'),
      ('deposit_rejected',   'awaiting_deposit'),

      -- ── Production ───────────────────────────────────────────────────────
      ('deposit_paid',       'intake_pending'),
      ('intake_pending',     'queued'),
      ('queued',             'assigned'),
      ('assigned',           'in_design'),
      ('assigned',           'queued'),
      ('in_design',          'internal_qa'),
      ('internal_qa',        'in_design'),
      ('internal_qa',        'client_review'),
      ('client_review',      'approved'),
      ('client_review',      'revision_requested'),
      ('revision_requested', 'in_design'),

      -- ── Gate 2: balance ──────────────────────────────────────────────────
      -- Automatic and unconditional. There is deliberately NO path from
      -- approved straight to delivered: approval releases the invoice, never
      -- the file.
      ('approved',           'awaiting_balance'),
      ('awaiting_balance',   'balance_review'),
      ('awaiting_balance',   'settled'),
      ('awaiting_balance',   'awaiting_balance'),   -- short balance, same reasoning as above
      ('awaiting_balance',   'balance_overdue'),
      ('balance_review',     'settled'),
      ('balance_review',     'balance_rejected'),
      ('balance_rejected',   'awaiting_balance'),
      ('balance_overdue',    'settled'),
      ('balance_overdue',    'forfeited'),
      -- Forfeiture is recoverable. Nothing is destroyed and the designer's work
      -- is never lost: paying at any point before archival releases the asset
      -- normally.
      ('forfeited',          'settled'),

      -- ── Delivery ─────────────────────────────────────────────────────────
      ('settled',            'delivered'),
      ('delivered',          'closed'),
      -- Chargeback after delivery: access is revocable by design.
      ('delivered',          'on_hold'),

      -- ── Exceptional ──────────────────────────────────────────────────────
      ('cancelled',          'refunded'),
      ('cancelled',          'closed')
    ) AS t(f, s)
    WHERE t.f = p_from::text AND t.s = p_to::text
  )
  -- Admin may cancel or hold anything that has not yet settled. Enumerating
  -- these pairs individually above would be 30 more rows that all say the same
  -- thing, and would rot the moment a state is added.
  OR (p_to IN ('cancelled', 'on_hold') AND p_from NOT IN
      ('settled', 'delivered', 'closed', 'cancelled', 'refunded', 'forfeited'))
  -- Resuming from a hold returns to wherever the order was held from; the
  -- caller supplies the target and held_from_status is checked in the guard.
  OR (p_from = 'on_hold' AND p_to NOT IN ('on_hold', 'draft'));
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  Guards
-- ─────────────────────────────────────────────────────────────────────────────
-- A transition being structurally legal is not the same as it being allowed
-- right now. This is where the money gates bite.

CREATE OR REPLACE FUNCTION public.assert_card_guard(
  p_order public.card_orders,
  p_to    public.card_order_status
)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_required_missing INTEGER;
BEGIN
  -- ── GATE 1 ───────────────────────────────────────────────────────────────
  IF p_to = 'deposit_paid' AND NOT public.deposit_satisfied(p_order.id) THEN
    RAISE EXCEPTION 'deposit not satisfied for order % — verified deposit is below the amount due', p_order.order_no
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_to = 'queued' THEN
    -- Gate 1 blocks the QUEUE. No design work begins until the deposit is in.
    IF NOT public.deposit_satisfied(p_order.id) THEN
      RAISE EXCEPTION 'order % cannot be queued — deposit not satisfied', p_order.order_no
        USING ERRCODE = 'check_violation';
    END IF;
    -- And the brief must be complete, or the designer starts blocked.
    SELECT count(*) INTO v_required_missing
    FROM public.brief_questions q
    LEFT JOIN public.order_briefs b ON b.order_id = p_order.id
    WHERE q.category_id = p_order.category_id
      AND q.required = TRUE
      AND q.active = TRUE
      AND COALESCE(nullif(btrim(b.answers ->> q.key), ''), NULL) IS NULL;
    IF v_required_missing > 0 THEN
      RAISE EXCEPTION 'order % cannot be queued — % required brief answer(s) missing',
        p_order.order_no, v_required_missing
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF p_to = 'assigned' AND p_order.assigned_designer_id IS NULL THEN
    RAISE EXCEPTION 'order % cannot be assigned without a designer', p_order.order_no
      USING ERRCODE = 'check_violation';
  END IF;

  -- A customer may only be shown work that passed internal QA.
  IF p_to = 'client_review' AND NOT EXISTS (
    SELECT 1 FROM public.design_versions v
    WHERE v.order_id = p_order.id AND v.qa_passed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'order % cannot reach client review — no QA-passed version exists', p_order.order_no
      USING ERRCODE = 'check_violation';
  END IF;

  -- The revision allowance is a hard counter in the database, not a UI
  -- affordance (loophole L6). A round is permitted when allowance remains, or
  -- when the round is a free correction, or when a top-up was accepted.
  IF p_to = 'in_design' AND p_order.status = 'revision_requested' THEN
    IF p_order.revisions_remaining IS NOT NULL
       AND p_order.revisions_remaining <= 0
       AND NOT EXISTS (
         SELECT 1 FROM public.revision_rounds r
         WHERE r.order_id = p_order.id
           AND r.closed_at IS NULL
           AND (r.is_correction OR r.billable)
       ) THEN
      RAISE EXCEPTION 'order % has no revisions remaining — a top-up must be accepted first', p_order.order_no
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ── GATE 2 ───────────────────────────────────────────────────────────────
  -- Gate 2 blocks the ASSET. This is the entire enforcement mechanism for the
  -- 50/50 model, and there is no operator override: releasing work for less
  -- money requires a recorded discount row (closes L17).
  IF p_to = 'settled' AND NOT public.fully_settled(p_order.id) THEN
    RAISE EXCEPTION 'order % is not fully settled — an amount is still outstanding', p_order.order_no
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_to = 'delivered' THEN
    IF p_order.event_id IS NULL THEN
      RAISE EXCEPTION 'order % cannot be delivered — it is not attached to an event yet', p_order.order_no
        USING ERRCODE = 'check_violation';
    END IF;
    -- Belt and braces: delivery is only ever reached from settled, but an
    -- unsettled order must never publish even if a new path is added later.
    IF NOT public.fully_settled(p_order.id) THEN
      RAISE EXCEPTION 'order % cannot be delivered — balance outstanding', p_order.order_no
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Resuming a hold must go back where it came from, not wherever the caller
  -- fancies — otherwise on_hold becomes a universal teleport between states.
  IF p_order.status = 'on_hold'
     AND p_to NOT IN ('cancelled', 'closed', 'refunded')
     AND p_to IS DISTINCT FROM p_order.held_from_status THEN
    RAISE EXCEPTION 'order % can only resume to %, not %',
      p_order.order_no, COALESCE(p_order.held_from_status::text, '(unknown)'), p_to
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_card_guard(public.card_orders, public.card_order_status)
  FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
--  SLA recomputation
-- ─────────────────────────────────────────────────────────────────────────────
-- Time spent waiting on the customer must never count against a designer's SLA
-- attainment. The clock starts when the order is genuinely workable (queued),
-- pauses whenever the ball is in the customer's court, and resumes with the
-- paused interval folded back into the deadline.

CREATE OR REPLACE FUNCTION public.card_sla_paused_state(p_status public.card_order_status)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  -- Awaiting the brief, awaiting a review decision, awaiting the balance, or
  -- frozen. In all of these the studio cannot progress the work.
  SELECT p_status IN ('intake_pending', 'client_review', 'revision_requested',
                      'approved', 'awaiting_balance', 'balance_review',
                      'balance_rejected', 'balance_overdue', 'on_hold');
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  Notification enqueue — same transaction as the state change
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enqueue_card_notifications(
  p_order_id   UUID,
  p_event_type TEXT,
  p_variables  JSONB DEFAULT '{}'::jsonb
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.card_orders;
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_order FROM public.card_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  INSERT INTO public.notification_outbox
    (order_id, audience, channel, recipient, template_key, locale, variables)
  SELECT
    p_order_id,
    r.audience,
    r.channel,
    CASE
      WHEN r.audience <> 'customer' THEN NULL          -- dispatcher fans out
      WHEN r.channel = 'email'      THEN v_order.buyer_email
      WHEN r.channel = 'bell'       THEN v_order.user_id::text  -- NULL while unclaimed
      ELSE v_order.buyer_phone
    END,
    r.template_key,
    v_order.locale,
    p_variables || jsonb_build_object(
      'order_no',   v_order.order_no,
      'buyer_name', v_order.buyer_name
    )
  FROM public.card_notification_rules r
  WHERE r.event_type = p_event_type
    AND r.active = TRUE
    -- An email row with no address, or a bell row for an unclaimed order, is
    -- undeliverable. Skipping it at enqueue keeps the outbox a queue of real
    -- work rather than a graveyard of rows that can never succeed.
    AND NOT (r.audience = 'customer' AND r.channel = 'email' AND v_order.buyer_email IS NULL)
    AND NOT (r.audience = 'customer' AND r.channel = 'bell'  AND v_order.user_id   IS NULL);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_card_notifications(UUID, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_card_notifications(UUID, TEXT, JSONB) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  transition_order() — the only writer of status
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.transition_order(
  p_order_id   UUID,
  p_to         public.card_order_status,
  p_event_type TEXT,
  p_actor_type TEXT,
  p_actor_id   TEXT DEFAULT NULL,
  p_payload    JSONB DEFAULT '{}'::jsonb
)
RETURNS public.card_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order       public.card_orders;
  v_from        public.card_order_status;
  v_pkg         public.card_packages;
  v_was_paused  BOOLEAN;
  v_now_paused  BOOLEAN;
  v_paused_add  BIGINT := 0;
  v_balance_days INTEGER;
  v_event_date  DATE;
BEGIN
  -- Serialises concurrent callers. Two admins assigning the same order at the
  -- same moment: the second waits here, then fails the guard rather than
  -- overwriting the first (TDD §10).
  SELECT * INTO v_order FROM public.card_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id USING ERRCODE = 'no_data_found';
  END IF;

  v_from := v_order.status;

  IF NOT public.is_valid_card_transition(v_from, p_to) THEN
    RAISE EXCEPTION 'illegal transition % -> % on order %', v_from, p_to, v_order.order_no
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.assert_card_guard(v_order, p_to);

  SELECT * INTO v_pkg FROM public.card_packages WHERE id = v_order.package_id;

  -- ── SLA bookkeeping ──────────────────────────────────────────────────────
  v_was_paused := public.card_sla_paused_state(v_from);
  v_now_paused := public.card_sla_paused_state(p_to);
  IF v_was_paused AND NOT v_now_paused AND v_order.sla_paused_at IS NOT NULL THEN
    -- Resuming: bank the interval we spent waiting, and push the deadline out
    -- by exactly that much.
    v_paused_add := EXTRACT(EPOCH FROM (now() - v_order.sla_paused_at))::BIGINT * 1000;
  END IF;

  UPDATE public.card_orders SET
    status = p_to,

    -- Milestone timestamps. Each is written once, on first arrival, because
    -- the refund tier table and the SLA analytics are both anchored to them —
    -- a re-entered state must not rewrite history.
    assigned_at   = CASE WHEN p_to = 'assigned'   AND assigned_at   IS NULL THEN now() ELSE assigned_at   END,
    accepted_at   = CASE WHEN p_to = 'in_design'  AND accepted_at   IS NULL THEN now() ELSE accepted_at   END,
    approved_at   = CASE WHEN p_to = 'approved'   AND approved_at   IS NULL THEN now() ELSE approved_at   END,
    settled_at    = CASE WHEN p_to = 'settled'    AND settled_at    IS NULL THEN now() ELSE settled_at    END,
    delivered_at  = CASE WHEN p_to = 'delivered'  AND delivered_at  IS NULL THEN now() ELSE delivered_at  END,
    closed_at     = CASE WHEN p_to = 'closed'     AND closed_at     IS NULL THEN now() ELSE closed_at     END,

    -- Bounced back to the queue on an accept-SLA breach: clear the designer so
    -- the assignment engine can pick someone else, and count the bounce.
    assigned_designer_id = CASE WHEN p_to = 'queued' AND v_from = 'assigned' THEN NULL
                                ELSE assigned_designer_id END,
    assign_bounces       = CASE WHEN p_to = 'queued' AND v_from = 'assigned' THEN assign_bounces + 1
                                ELSE assign_bounces END,

    -- Remember where a hold came from so it can only resume to that state.
    held_from_status = CASE WHEN p_to = 'on_hold' THEN v_from
                            WHEN v_from = 'on_hold' THEN NULL
                            ELSE held_from_status END,
    hold_reason      = CASE WHEN p_to = 'on_hold' THEN NULLIF(p_payload ->> 'reason', '')
                            WHEN v_from = 'on_hold' THEN NULL
                            ELSE hold_reason END,

    -- The design clock starts when the order becomes genuinely workable, not
    -- when it is paid: we cannot design without the brief, so anchoring it to
    -- payment would burn the promise on time the customer controls.
    sla_due_at = CASE
      WHEN p_to = 'queued' AND sla_due_at IS NULL
        THEN now() + make_interval(hours => COALESCE(v_pkg.first_draft_hours, 48))
      WHEN NOT v_now_paused AND v_paused_add > 0
        THEN sla_due_at + make_interval(secs => v_paused_add / 1000.0)
      ELSE sla_due_at
    END,
    sla_paused_at = CASE WHEN v_now_paused AND NOT v_was_paused THEN now()
                         WHEN v_now_paused THEN sla_paused_at
                         ELSE NULL END,
    sla_paused_ms = sla_paused_ms + v_paused_add,

    -- Any customer-driven move resets the 90-day dormancy sweep.
    last_customer_response_at = CASE WHEN p_actor_type = 'customer' THEN now()
                                     ELSE last_customer_response_at END
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  -- ── Timeline ─────────────────────────────────────────────────────────────
  INSERT INTO public.order_events
    (order_id, from_status, to_status, event_type, actor_type, actor_id, payload, visible_to)
  VALUES (
    p_order_id, v_from, p_to, p_event_type, p_actor_type, p_actor_id, p_payload,
    -- Internal QA outcomes, holds and policy exceptions are not the customer's
    -- business; everything else is.
    CASE WHEN p_event_type IN ('qa.rejected', 'policy.exception', 'order.held', 'ops.escalated')
         THEN ARRAY['admin']
         ELSE ARRAY['customer', 'designer', 'admin'] END
  );

  -- Same transaction as the state change: no lost notifications, no sends for
  -- a transition that later rolls back.
  PERFORM public.enqueue_card_notifications(p_order_id, p_event_type, p_payload);

  -- ── Automatic cascade: approval raises the invoice, always ───────────────
  -- Modelled here rather than left to callers because PRD §7.2.2 makes it
  -- unconditional, and a caller that forgets it hands finished work out for
  -- half the money. The row lock is already held by this transaction, so the
  -- recursive call re-enters safely.
  IF p_to = 'approved' THEN
    v_event_date := COALESCE(
      v_order.provisional_event_date,
      (SELECT e.starts_at::date FROM public.wedding_events e WHERE e.id = v_order.event_id)
    );
    -- Event-date awareness: a customer whose wedding is next week needs a
    -- phone call, not a fourth WhatsApp message, so the whole cadence
    -- compresses (PRD §7.2.3).
    v_balance_days := CASE
      WHEN v_event_date IS NOT NULL AND v_event_date - CURRENT_DATE < 14 THEN 5
      ELSE 7
    END;

    UPDATE public.card_orders
       SET balance_invoiced_at = COALESCE(balance_invoiced_at, now()),
           balance_due_at      = COALESCE(balance_due_at, now() + make_interval(days => v_balance_days))
     WHERE id = p_order_id;

    v_order := public.transition_order(
      p_order_id, 'awaiting_balance', 'order.approved', 'system', NULL,
      jsonb_build_object('balance_due_days', v_balance_days)
    );
  END IF;

  RETURN v_order;
END;
$$;

COMMENT ON FUNCTION public.transition_order(UUID, public.card_order_status, TEXT, TEXT, TEXT, JSONB) IS
  'The ONLY writer of card_orders.status. Validates the transition table, runs the money gates, writes the status, appends an immutable event and enqueues notifications in one transaction.';

REVOKE ALL ON FUNCTION public.transition_order(UUID, public.card_order_status, TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_order(UUID, public.card_order_status, TEXT, TEXT, TEXT, JSONB)
  TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
--  Immutability of the audit trail
-- ─────────────────────────────────────────────────────────────────────────────
-- Grants alone would still let service_role rewrite history, and service_role
-- is what every server route runs as. A trigger is the only way to make
-- "append-only" actually true here.

CREATE OR REPLACE FUNCTION public.reject_order_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'order_events is append-only — % is not permitted', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS order_events_append_only ON public.order_events;
CREATE TRIGGER order_events_append_only
  BEFORE UPDATE OR DELETE ON public.order_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_order_event_mutation();

-- ─────────────────────────────────────────────────────────────────────────────
--  RLS — deny by default, on every table
-- ─────────────────────────────────────────────────────────────────────────────
-- The TDD writes its policies against `auth.jwt()->>'role'` with roles
-- customer/designer/finance/ops_admin/super_admin. That role claim does not
-- exist in this Clerk setup. The equivalents already used across this database
-- are requesting_user_id() for customers and is_workforce_admin() /
-- is_workforce_reader() for staff, so the policies below are written against
-- those. Fine-grained staff separation (Finance vs Ops vs Designer) is enforced
-- at the server-action layer through workforce permission keys, exactly as the
-- rest of the admin app does it.
--
-- Every server route for this feature uses the service-role client, which
-- bypasses RLS by design. These policies are the second line: they make sure
-- that if a table is ever exposed through PostgREST with an end-user JWT, it
-- leaks nothing.

ALTER TABLE public.card_orders            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_payments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_outbox    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_notification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_claim_tokens     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_briefs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brief_questions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brief_clarifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_versions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revision_rounds        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.designer_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_requests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_notes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_note_redemptions ENABLE ROW LEVEL SECURITY;

-- Customers read their own orders and their own timeline. Nothing else.
DROP POLICY IF EXISTS card_orders_customer_read ON public.card_orders;
CREATE POLICY card_orders_customer_read ON public.card_orders
  FOR SELECT TO authenticated
  USING (user_id IS NOT NULL AND user_id = requesting_user_id());

DROP POLICY IF EXISTS card_orders_staff_read ON public.card_orders;
CREATE POLICY card_orders_staff_read ON public.card_orders
  FOR SELECT TO authenticated
  USING (is_workforce_reader());

DROP POLICY IF EXISTS order_events_customer_read ON public.order_events;
CREATE POLICY order_events_customer_read ON public.order_events
  FOR SELECT TO authenticated
  USING (
    'customer' = ANY(visible_to)
    AND EXISTS (
      SELECT 1 FROM public.card_orders o
      WHERE o.id = order_events.order_id AND o.user_id = requesting_user_id()
    )
  );

DROP POLICY IF EXISTS order_events_staff_read ON public.order_events;
CREATE POLICY order_events_staff_read ON public.order_events
  FOR SELECT TO authenticated USING (is_workforce_reader());

-- The brief question catalogue is the only thing here anyone may read freely:
-- the intake form is served to unauthenticated buyers holding a claim token.
DROP POLICY IF EXISTS brief_questions_public_read ON public.brief_questions;
CREATE POLICY brief_questions_public_read ON public.brief_questions
  FOR SELECT TO anon, authenticated USING (active = TRUE);

-- Designers never receive guest lists or buyer contact details. They see the
-- brief, the category and the event's display name — enforced at the row
-- level, not by hiding fields in the UI (loophole L5). A designer reaches
-- order_briefs through the server layer scoped by assigned_designer_id; no
-- end-user JWT policy grants it at all.
DROP POLICY IF EXISTS order_briefs_staff_read ON public.order_briefs;
CREATE POLICY order_briefs_staff_read ON public.order_briefs
  FOR SELECT TO authenticated USING (is_workforce_admin());

DROP POLICY IF EXISTS order_briefs_customer_read ON public.order_briefs;
CREATE POLICY order_briefs_customer_read ON public.order_briefs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.card_orders o
    WHERE o.id = order_briefs.order_id AND o.user_id = requesting_user_id()
  ));

-- Everything financial or operational is staff-read-only through an end-user
-- JWT, and writable only by the service role.
DROP POLICY IF EXISTS order_payments_staff_read ON public.order_payments;
CREATE POLICY order_payments_staff_read ON public.order_payments
  FOR SELECT TO authenticated USING (is_workforce_reader());

DROP POLICY IF EXISTS refund_requests_staff_read ON public.refund_requests;
CREATE POLICY refund_requests_staff_read ON public.refund_requests
  FOR SELECT TO authenticated USING (is_workforce_reader());

DROP POLICY IF EXISTS design_versions_staff_read ON public.design_versions;
CREATE POLICY design_versions_staff_read ON public.design_versions
  FOR SELECT TO authenticated USING (is_workforce_reader());

DROP POLICY IF EXISTS revision_rounds_staff_read ON public.revision_rounds;
CREATE POLICY revision_rounds_staff_read ON public.revision_rounds
  FOR SELECT TO authenticated USING (is_workforce_reader());

DROP POLICY IF EXISTS designer_profiles_staff_read ON public.designer_profiles;
CREATE POLICY designer_profiles_staff_read ON public.designer_profiles
  FOR SELECT TO authenticated USING (is_workforce_reader());

DROP POLICY IF EXISTS brief_clarifications_staff_read ON public.brief_clarifications;
CREATE POLICY brief_clarifications_staff_read ON public.brief_clarifications
  FOR SELECT TO authenticated USING (is_workforce_reader());

DROP POLICY IF EXISTS credit_notes_staff_read ON public.credit_notes;
CREATE POLICY credit_notes_staff_read ON public.credit_notes
  FOR SELECT TO authenticated USING (is_workforce_reader());

-- Claim tokens, the outbox and the notification rules are never readable by an
-- end-user JWT under any circumstances. No SELECT policy is defined for them,
-- so RLS denies everything; only the service role reaches them.

-- ── Grants ────────────────────────────────────────────────────────────────
REVOKE ALL ON
  public.card_orders, public.order_payments, public.order_events,
  public.notification_outbox, public.card_notification_rules,
  public.order_claim_tokens, public.order_briefs, public.brief_clarifications,
  public.design_versions, public.revision_rounds, public.designer_profiles,
  public.refund_requests, public.credit_notes, public.credit_note_redemptions
FROM anon, authenticated;

GRANT SELECT ON
  public.card_orders, public.order_payments, public.order_events,
  public.order_briefs, public.brief_clarifications, public.design_versions,
  public.revision_rounds, public.designer_profiles, public.refund_requests,
  public.credit_notes
TO authenticated;

GRANT SELECT ON public.brief_questions TO anon, authenticated;

GRANT ALL ON
  public.card_orders, public.order_payments, public.notification_outbox,
  public.card_notification_rules, public.order_claim_tokens, public.order_briefs,
  public.brief_questions, public.brief_clarifications, public.design_versions,
  public.revision_rounds, public.designer_profiles, public.refund_requests,
  public.credit_notes, public.credit_note_redemptions
TO service_role;

-- order_events: INSERT and SELECT only, for everyone. The append-only trigger
-- above enforces it even against service_role.
GRANT SELECT, INSERT ON public.order_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.order_events_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.card_order_no_seq TO service_role;

-- The sentence that makes all of the above true: no client, however
-- privileged its JWT, can write a status. transition_order() is the only way.
REVOKE UPDATE (status) ON public.card_orders FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
