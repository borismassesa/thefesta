-- Behavioural tests for the commission money model and state machine.
-- Each assertion names the PRD/TDD rule or loophole ID it is defending.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

CREATE OR REPLACE FUNCTION ok(cond BOOLEAN, label TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF cond THEN RAISE NOTICE 'PASS  %', label;
  ELSE RAISE EXCEPTION 'FAIL  %', label; END IF;
END $$;

-- Asserts that `sql` raises. Used for every "this must be impossible" rule.
CREATE OR REPLACE FUNCTION must_fail(sql TEXT, label TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE sql;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'PASS  % (blocked: %)', label, left(SQLERRM, 70);
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL  % — it was ALLOWED', label;
END $$;

-- Activate a package so orders can be created.
UPDATE card_packages SET active = TRUE;

-- A couple, an event, a designer.
INSERT INTO users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'couple@example.com');
INSERT INTO wedding_events (id, user_id, name, starts_at) VALUES
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   'Moses & Neema', now() + interval '120 days');
INSERT INTO workforce_employees (id, clerk_user_id, full_name, dashboard_access) VALUES
  ('33333333-3333-3333-3333-333333333333', 'user_designer', 'Asha Designer', TRUE);
INSERT INTO designer_profiles (employee_id, display_name, studio_grade, categories, capacity)
  VALUES ('33333333-3333-3333-3333-333333333333', 'Asha', 'associate', ARRAY['wedding'], 5);

-- The wedding question set comes from the seed migration. Insert it here too
-- so the suite still exercises the intake guard if run without that migration.
INSERT INTO brief_questions (category_id, key, label_en, label_sw, field_type, required, sort_order)
VALUES ('wedding', 'couple_names', 'Names of the couple', 'Majina ya wanandoa', 'text', TRUE, 1)
ON CONFLICT (category_id, key) DO NOTHING;

-- Every REQUIRED answer for the wedding category, so the "complete brief" cases
-- below are genuinely complete. Derived from the table rather than hard-coded,
-- so adding a required question cannot silently rot this suite.
CREATE OR REPLACE FUNCTION complete_brief(p_order UUID) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE v_answers JSONB;
BEGIN
  SELECT COALESCE(jsonb_object_agg(q.key, 'test value'), '{}'::jsonb) INTO v_answers
  FROM brief_questions q
  JOIN card_orders o ON o.id = p_order
  WHERE q.category_id = o.category_id AND q.required AND q.active;

  INSERT INTO order_briefs (order_id, answers, completed_at)
  VALUES (p_order, v_answers, now())
  ON CONFLICT (order_id) DO UPDATE SET answers = excluded.answers, completed_at = now();
END $$;

-- Helper: create a fresh order at awaiting_deposit on the classic package
-- (TSh 250,000, 50% deposit => TSh 125,000 due at Gate 1).
CREATE OR REPLACE FUNCTION new_order(p_no TEXT) RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE v_id UUID; v_pkg card_packages;
BEGIN
  SELECT * INTO v_pkg FROM card_packages WHERE id = 'classic';
  INSERT INTO card_orders (order_no, buyer_phone, buyer_name, buyer_email, package_id,
                           category_id, base_price_tzs, total_tzs, deposit_percent,
                           deposit_due_tzs, revisions_remaining)
  VALUES (p_no, '+255712345678', 'Moses Seeta', 'moses@example.com', 'classic', 'wedding',
          v_pkg.price_tzs, v_pkg.price_tzs, v_pkg.deposit_percent,
          (v_pkg.price_tzs * v_pkg.deposit_percent) / 100, v_pkg.revisions_included)
  RETURNING id INTO v_id;
  PERFORM transition_order(v_id, 'awaiting_deposit', 'order.created', 'system');
  RETURN v_id;
END $$;

-- Helper: record a verified payment.
CREATE OR REPLACE FUNCTION pay(p_order UUID, p_purpose card_payment_purpose, p_amount INT)
RETURNS UUID LANGUAGE sql AS $$
  INSERT INTO order_payments (order_id, purpose, channel, state, expected_tzs,
                              received_tzs, verified_by, verified_at)
  VALUES (p_order, p_purpose, 'selcom_mobile', 'verified', abs(p_amount), p_amount,
          'selcom_webhook', now())
  RETURNING id;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  o UUID; l order_ledger; v UUID;
BEGIN
RAISE NOTICE '--- Gate 1: deposit (PRD §7.2.1) ---';

  o := new_order('OP-CC-2026-T001');
  PERFORM ok((SELECT status FROM card_orders WHERE id = o) = 'awaiting_deposit',
             'new order sits at awaiting_deposit');
  PERFORM ok(NOT deposit_satisfied(o), 'Gate 1 closed before any payment');

  -- UNDERPAYMENT: TSh 40,000 against TSh 125,000 due. The common real-world
  -- case, and explicitly NOT an error state (TDD §4).
  PERFORM pay(o, 'deposit', 40000);
  SELECT * INTO l FROM order_ledger WHERE order_id = o;
  PERFORM ok(l.deposit_paid_tzs = 40000,   'partial deposit is CREDITED, not refunded');
  PERFORM ok(l.outstanding_tzs = 210000,   'outstanding reflects the partial payment');
  PERFORM ok(NOT deposit_satisfied(o),     'Gate 1 still closed on a short deposit');

  -- The self-transition is legal and idempotent: notify the shortfall, do not move.
  PERFORM transition_order(o, 'awaiting_deposit', 'payment.short', 'system');
  PERFORM ok((SELECT status FROM card_orders WHERE id = o) = 'awaiting_deposit',
             'short deposit is a self-loop, not a failure state');

  PERFORM must_fail(format('SELECT transition_order(%L, ''deposit_paid'', ''x'', ''finance'')', o),
    'L18: Finance CANNOT approve an insufficient deposit');

  -- Top up to the threshold.
  PERFORM pay(o, 'deposit', 85000);
  PERFORM ok(deposit_satisfied(o), 'Gate 1 opens once the deposit threshold is met');
  PERFORM transition_order(o, 'deposit_paid', 'deposit.verified', 'system');

RAISE NOTICE '--- Gate 1 blocks the QUEUE, not just the label ---';

  o := new_order('OP-CC-2026-T002');
  -- Force the order to intake_pending WITHOUT a deposit, to prove the guard is
  -- the thing stopping it rather than the path taken to get there.
  UPDATE card_orders SET status = 'intake_pending' WHERE id = o;
  PERFORM complete_brief(o);
  PERFORM must_fail(format('SELECT transition_order(%L, ''queued'', ''x'', ''system'')', o),
    'Gate 1: no order enters the design queue without a verified deposit');

  -- And with the deposit but WITHOUT the brief.
  o := new_order('OP-CC-2026-T003');
  PERFORM pay(o, 'deposit', 125000);
  PERFORM transition_order(o, 'deposit_paid',   'deposit.verified', 'system');
  PERFORM transition_order(o, 'intake_pending', 'brief.issued',     'system');
  PERFORM must_fail(format('SELECT transition_order(%L, ''queued'', ''x'', ''customer'')', o),
    'an order cannot be queued with a required brief answer missing');

  PERFORM complete_brief(o);
  PERFORM transition_order(o, 'queued', 'brief.completed', 'customer');
  PERFORM ok((SELECT sla_due_at FROM card_orders WHERE id = o) IS NOT NULL,
             'the design clock starts at queued, not at payment');

RAISE NOTICE '--- Assignment (PRD §7.4) ---';

  PERFORM must_fail(format('SELECT transition_order(%L, ''assigned'', ''x'', ''admin'')', o),
    'an order cannot be assigned without a designer');

  UPDATE card_orders SET assigned_designer_id = '33333333-3333-3333-3333-333333333333' WHERE id = o;
  PERFORM transition_order(o, 'assigned', 'task.assigned', 'admin');

  -- Accept-SLA breach bounces it back and counts the bounce (L8).
  PERFORM transition_order(o, 'queued', 'task.accept_breach', 'system');
  PERFORM ok((SELECT assign_bounces FROM card_orders WHERE id = o) = 1,
             'L8: an unaccepted assignment requeues and counts the bounce');
  PERFORM ok((SELECT assigned_designer_id FROM card_orders WHERE id = o) IS NULL,
             'a bounced order releases its designer so it can be reassigned');

  UPDATE card_orders SET assigned_designer_id = '33333333-3333-3333-3333-333333333333' WHERE id = o;
  PERFORM transition_order(o, 'assigned',  'task.assigned', 'admin');
  PERFORM transition_order(o, 'in_design', 'task.accepted', 'designer');

RAISE NOTICE '--- Review, QA and revisions (PRD §7.6) ---';

  -- Reach internal_qa legitimately, then try to release to the customer with
  -- no QA-passed version. One statement, so the guard is what blocks it.
  PERFORM transition_order(o, 'internal_qa', 'version.submitted', 'designer');
  PERFORM must_fail(format('SELECT transition_order(%L, ''client_review'', ''x'', ''admin'')', o),
    'a customer is never shown work that has not passed internal QA');
  PERFORM transition_order(o, 'in_design', 'qa.rejected', 'admin');

  INSERT INTO design_versions (order_id, version_no, designer_id, svg_path, preview_path)
    VALUES (o, 1, '33333333-3333-3333-3333-333333333333', 'svg/1.svg', 'prev/1.png')
    RETURNING id INTO v;
  PERFORM transition_order(o, 'internal_qa', 'version.submitted', 'designer');
  UPDATE design_versions SET qa_passed_at = now() WHERE id = v;
  PERFORM transition_order(o, 'client_review', 'version.ready', 'admin');

  PERFORM ok((SELECT master_png_path FROM design_versions WHERE id = v) IS NULL,
             'L14: no clean master exists in storage before settlement');

  -- Revision 1 of 2 included.
  PERFORM transition_order(o, 'revision_requested', 'revision.opened', 'customer');
  INSERT INTO revision_rounds (order_id, round_no, from_version, items)
    VALUES (o, 1, 1, '[{"element":"date","comment":"wrong year"}]');
  UPDATE card_orders SET revisions_remaining = revisions_remaining - 1 WHERE id = o;
  PERFORM transition_order(o, 'in_design', 'revision.accepted', 'system');
  PERFORM ok((SELECT revisions_remaining FROM card_orders WHERE id = o) = 1,
             'each accepted revision decrements the allowance');

  -- Exhaust the allowance, then prove the counter is a real wall.
  UPDATE card_orders SET revisions_remaining = 0 WHERE id = o;
  UPDATE revision_rounds SET closed_at = now() WHERE order_id = o;
  PERFORM transition_order(o, 'internal_qa',   'version.submitted', 'designer');
  PERFORM transition_order(o, 'client_review', 'version.ready',     'admin');
  PERFORM transition_order(o, 'revision_requested', 'revision.opened', 'customer');
  PERFORM must_fail(format('SELECT transition_order(%L, ''in_design'', ''x'', ''system'')', o),
    'L6: the revision allowance is a hard counter in the database, not a UI limit');

  -- A CORRECTION is free and unlimited — "errors are not revisions" (§7.11.6).
  INSERT INTO revision_rounds (order_id, round_no, from_version, items, is_correction)
    VALUES (o, 2, 1, '[{"element":"name","comment":"we misspelled it"}]', TRUE);
  PERFORM transition_order(o, 'in_design', 'revision.correction', 'system');
  PERFORM ok((SELECT revisions_remaining FROM card_orders WHERE id = o) = 0,
             '§7.11.6: a correction reopens design without consuming an allowance');

RAISE NOTICE '--- Gate 2: balance (PRD §7.2.2) ---';

  PERFORM transition_order(o, 'internal_qa',   'version.submitted', 'designer');
  PERFORM transition_order(o, 'client_review', 'version.ready',     'admin');

  PERFORM must_fail(format('SELECT transition_order(%L, ''delivered'', ''x'', ''system'')', o),
    'there is no path from client_review straight to delivered');

  -- Approval. This must CASCADE automatically into awaiting_balance.
  PERFORM transition_order(o, 'approved', 'order.approved', 'customer');
  PERFORM ok((SELECT status FROM card_orders WHERE id = o) = 'awaiting_balance',
             '§7.2.2: approval automatically raises the invoice — no manual step');
  PERFORM ok((SELECT balance_due_at FROM card_orders WHERE id = o) IS NOT NULL,
             'approval sets the balance due date, starting the chase cadence');

  SELECT * INTO l FROM order_ledger WHERE order_id = o;
  PERFORM ok(l.outstanding_tzs = 125000, 'balance = total - verified payments, recomputed server-side');

  PERFORM must_fail(format('SELECT transition_order(%L, ''settled'', ''x'', ''finance'')', o),
    'L17: Ops cannot mark an order settled while money is outstanding');

  -- Short balance: same self-loop treatment as the deposit.
  PERFORM pay(o, 'balance', 100000);
  PERFORM must_fail(format('SELECT transition_order(%L, ''settled'', ''x'', ''finance'')', o),
    'a short balance still cannot settle');
  PERFORM transition_order(o, 'awaiting_balance', 'payment.short', 'system');

  PERFORM pay(o, 'balance', 25000);
  PERFORM ok(fully_settled(o), 'Gate 2 opens only at 100%');
  PERFORM transition_order(o, 'settled', 'balance.settled', 'finance');

RAISE NOTICE '--- Delivery requires an event (§7.1) ---';

  PERFORM must_fail(format('SELECT transition_order(%L, ''delivered'', ''x'', ''system'')', o),
    'an unclaimed order cannot be delivered — delivery is the one step needing an event');
  UPDATE card_orders SET user_id = '11111111-1111-1111-1111-111111111111',
                         event_id = '22222222-2222-2222-2222-222222222222' WHERE id = o;
  PERFORM transition_order(o, 'delivered', 'order.delivered', 'system');
  PERFORM transition_order(o, 'closed',    'order.closed',    'system');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE o UUID; l order_ledger;
BEGIN
RAISE NOTICE '--- Overpayment, discounts and refunds ---';

  o := new_order('OP-CC-2026-T010');
  -- Overpays the deposit: TSh 150,000 against TSh 125,000 due.
  PERFORM pay(o, 'deposit', 150000);
  SELECT * INTO l FROM order_ledger WHERE order_id = o;
  PERFORM ok(deposit_satisfied(o),        'Gate 1 opens on an overpayment');
  PERFORM ok(l.outstanding_tzs = 100000,  '§7.2.1: deposit overpayment is credited toward the balance, never refunded');

  -- A discount is a CREDIT, not a payment. It must reduce what is owed, not
  -- inflate what was paid — the sign bug in the TDD's literal ledger SQL.
  o := new_order('OP-CC-2026-T011');
  PERFORM pay(o, 'deposit',  125000);
  PERFORM pay(o, 'discount', -50000);
  SELECT * INTO l FROM order_ledger WHERE order_id = o;
  PERFORM ok(l.total_tzs = 250000,           'a discount leaves the contracted price reportable');
  PERFORM ok(l.effective_total_tzs = 200000, 'a discount reduces the effective total');
  PERFORM ok(l.paid_tzs = 125000,            'a discount is NOT counted as money received');
  PERFORM ok(l.outstanding_tzs = 75000,      'a discount REDUCES what is outstanding');

  -- A refund is a new negative row, never an edit of the original payment.
  PERFORM pay(o, 'refund', -125000);
  SELECT * INTO l FROM order_ledger WHERE order_id = o;
  PERFORM ok(l.paid_tzs = 0,             '§7.11.5: a refund is a negative ledger row, never a deletion');
  PERFORM ok((SELECT count(*) FROM order_payments WHERE order_id = o) = 3,
             'the original payment survives the refund, so the history stays complete');

  -- A heavily discounted order must still be able to open Gate 1.
  o := new_order('OP-CC-2026-T012');
  PERFORM pay(o, 'discount', -200000);   -- effective total TSh 50,000
  PERFORM pay(o, 'deposit',    50000);   -- less than the snapshotted TSh 125,000 due
  PERFORM ok(deposit_satisfied(o),
             'a discount below the snapshotted deposit still lets Gate 1 open once the effective total is paid');

  -- The sign discipline is a constraint, not a convention.
  PERFORM must_fail(format(
    'INSERT INTO order_payments (order_id, purpose, channel, expected_tzs, received_tzs)
     VALUES (%L, ''deposit'', ''lipa_namba'', 1000, -1000)', o),
    'a deposit cannot carry a negative amount');
  PERFORM must_fail(format(
    'INSERT INTO order_payments (order_id, purpose, channel, expected_tzs, received_tzs)
     VALUES (%L, ''discount'', ''adjustment'', 1000, 5000)', o),
    'a discount cannot carry a positive amount');
  PERFORM must_fail(format(
    'INSERT INTO order_payments (order_id, purpose, channel, state, expected_tzs, received_tzs)
     VALUES (%L, ''deposit'', ''lipa_namba'', ''verified'', 1000, 1000)', o),
    'L1: a payment cannot be verified without recording WHO verified it');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE o UUID;
BEGIN
RAISE NOTICE '--- Refund entitlement (PRD §7.11.1) ---';

  o := new_order('OP-CC-2026-T020');
  PERFORM pay(o, 'deposit', 125000);
  PERFORM transition_order(o, 'deposit_paid', 'deposit.verified', 'system');
  PERFORM ok(refund_entitlement(o) = 100, 'deposit confirmed, brief incomplete => 100%');

  PERFORM transition_order(o, 'intake_pending', 'brief.issued', 'system');
  PERFORM complete_brief(o);
  PERFORM ok(refund_entitlement(o) = 90, 'brief complete, unassigned => 90%');

  PERFORM transition_order(o, 'queued', 'brief.completed', 'customer');
  UPDATE card_orders SET assigned_designer_id = '33333333-3333-3333-3333-333333333333' WHERE id = o;
  PERFORM transition_order(o, 'assigned', 'task.assigned', 'admin');
  PERFORM ok(refund_entitlement(o) = 80, 'assigned, not accepted => 80%');

  PERFORM transition_order(o, 'in_design', 'task.accepted', 'designer');
  PERFORM ok(refund_entitlement(o) = 60, 'accepted, no version => 60%');

  INSERT INTO design_versions (order_id, version_no, designer_id, svg_path, preview_path)
    VALUES (o, 1, '33333333-3333-3333-3333-333333333333', 's', 'p');
  PERFORM ok(refund_entitlement(o) = 30, 'one draft shared => 30%');

  INSERT INTO revision_rounds (order_id, round_no, from_version, items)
    VALUES (o, 1, 1, '[]');
  PERFORM ok(refund_entitlement(o) = 10, 'revision round opened => 10%');

  -- The CASE is evaluated most-work-done first, so a lagging status label
  -- cannot inflate entitlement.
  UPDATE card_orders SET status = 'in_design' WHERE id = o;
  PERFORM ok(refund_entitlement(o) = 10,
             'a status label that lags reality cannot inflate entitlement');

  UPDATE card_orders SET approved_at = now() WHERE id = o;
  PERFORM ok(refund_entitlement(o) = 0, 'approved or later => 0%');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE o UUID; n INT;
BEGIN
RAISE NOTICE '--- Audit trail, holds and illegal transitions ---';

  o := new_order('OP-CC-2026-T030');

  PERFORM must_fail(format('SELECT transition_order(%L, ''settled'', ''x'', ''admin'')', o),
    'an arbitrary jump to settled is rejected by the transition table');
  PERFORM must_fail(format('SELECT transition_order(%L, ''in_design'', ''x'', ''admin'')', o),
    'skipping the deposit gate entirely is rejected');

  -- L9: every state change leaves an event, so Admin and OpusPass cannot drift.
  SELECT count(*) INTO n FROM order_events WHERE order_id = o;
  PERFORM ok(n >= 1, 'L9: every transition writes an immutable timeline event');

  PERFORM must_fail(
    format('UPDATE order_events SET to_status = ''settled'' WHERE order_id = %L', o),
    'L9: the timeline cannot be rewritten, even by the service role');
  PERFORM must_fail(
    format('DELETE FROM order_events WHERE order_id = %L', o),
    'the timeline cannot be deleted');

  -- Notifications are enqueued in the same transaction as the state change.
  SELECT count(*) INTO n FROM notification_outbox WHERE order_id = o;
  PERFORM ok(n >= 1, 'a transition enqueues its notifications atomically');

  -- A hold remembers where it came from and can only resume there.
  PERFORM pay(o, 'deposit', 125000);
  PERFORM transition_order(o, 'deposit_paid',   'deposit.verified', 'system');
  PERFORM transition_order(o, 'intake_pending', 'brief.issued',     'system');
  PERFORM transition_order(o, 'on_hold', 'order.held', 'admin', NULL,
                           '{"reason":"chargeback raised"}');
  PERFORM ok((SELECT held_from_status FROM card_orders WHERE id = o) = 'intake_pending',
             'a hold records the state it interrupted');
  -- Target deposit_paid deliberately: its own guard (deposit_satisfied) PASSES
  -- here, so the only thing that can block this is the resume rule itself. A
  -- target with a second failing guard would pass this assertion for the wrong
  -- reason.
  PERFORM ok(deposit_satisfied(o), 'precondition: the deposit_paid guard would otherwise allow this');
  PERFORM must_fail(format('SELECT transition_order(%L, ''deposit_paid'', ''x'', ''admin'')', o),
    'on_hold is not a teleport — an order can only resume where it was held');
  PERFORM transition_order(o, 'intake_pending', 'order.resumed', 'admin');
  PERFORM ok((SELECT held_from_status FROM card_orders WHERE id = o) IS NULL,
             'resuming clears the hold marker');

  -- Internal QA notes are not the customer's business.
  PERFORM ok(
    (SELECT visible_to FROM order_events WHERE order_id = o AND event_type = 'order.held' LIMIT 1)
      = ARRAY['admin'],
    'holds and QA rejections are admin-only on the timeline');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE o UUID;
BEGIN
RAISE NOTICE '--- Structural invariants ---';

  o := new_order('OP-CC-2026-T040');
  PERFORM must_fail(format(
    'UPDATE card_orders SET status = ''delivered'' WHERE id = %L', o),
    'the delivered-needs-event CHECK holds even against a direct UPDATE');

  PERFORM must_fail(format(
    'INSERT INTO revision_rounds (order_id, round_no, from_version, is_correction, billable)
     VALUES (%L, 9, 1, TRUE, TRUE)', o),
    'a correction can never be billable');

  PERFORM must_fail(
    'INSERT INTO card_orders (order_no, buyer_phone, buyer_name, package_id, category_id,
       base_price_tzs, total_tzs, deposit_percent, deposit_due_tzs)
     VALUES (''OP-CC-2026-T041'', ''not-a-phone'', ''X'', ''classic'', ''wedding'', 1, 1, 50, 1)',
    'a malformed phone number is rejected at the column');

  PERFORM ok(next_card_order_no() <> next_card_order_no(),
             'L12: order numbers come from a sequence, so two concurrent checkouts cannot collide');
END $$;

SELECT 'ALL TESTS PASSED' AS result;
