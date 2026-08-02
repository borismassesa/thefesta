-- Leave — seed and backfill.
--
-- Seeds the nine leave types the goal names plus a default policy for each,
-- then brings the existing data forward: workforce_leave_policies' entitlements
-- become policy rows, workforce_employees.leave_balance_days becomes an OPENING
-- BALANCE transaction, and approved workforce_leave_requests become requests
-- with their days expanded and their usage posted.
--
-- The opening-balance step is the important one. The old system's balance was a
-- number nobody could explain; turning it into a ledger entry that says
-- "imported opening balance" means every future balance reconciles from the
-- ledger, including the part that predates the ledger.
--
-- Idempotent: every insert is guarded.

-- =============================================================================
-- 1. Leave types
-- =============================================================================
INSERT INTO leave_types (code, name, is_balance_based, is_paid, requires_document, allows_partial_day, allows_hourly, sort_order)
VALUES
  ('annual',        'Annual leave',        true,  true,  false, true,  true,  10),
  ('sick',          'Sick leave',          false, true,  true,  true,  false, 20),
  ('maternity',     'Maternity leave',     false, true,  true,  false, false, 30),
  ('paternity',     'Paternity leave',     false, true,  true,  false, false, 40),
  ('bereavement',   'Bereavement leave',   false, true,  false, false, false, 50),
  ('study',         'Study leave',         true,  true,  true,  true,  false, 60),
  ('unpaid',        'Unpaid leave',        false, false, false, true,  false, 70),
  ('compensatory',  'Compensatory leave',  true,  true,  false, true,  true,  80)
ON CONFLICT (code) DO NOTHING;

-- Any additional type configured in the old system arrives as a custom type,
-- rather than being silently dropped because it was not on the list above.
INSERT INTO leave_types (code, name, is_balance_based, is_paid, sort_order)
SELECT lower(regexp_replace(wp.leave_type, '[^a-zA-Z0-9]+', '_', 'g')),
       wp.label,
       wp.counts_against_annual_balance,
       true,
       wp.display_order + 100
FROM workforce_leave_policies wp
WHERE NOT EXISTS (
  SELECT 1 FROM leave_types t
  WHERE t.code = lower(regexp_replace(wp.leave_type, '[^a-zA-Z0-9]+', '_', 'g'))
)
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- 2. Default policies
-- =============================================================================
-- Tanzanian statutory minimum for annual leave is 28 days, which is what the
-- existing workforce code already defaults to.
INSERT INTO leave_policies (
  leave_type_id, name, annual_entitlement_days, accrual_method,
  max_carryover_days, carryover_expires_after_months, min_notice_days,
  suppresses_attendance, suppresses_tracker, suppresses_reports, approval_chain
)
SELECT
  t.id,
  t.name || ' (standard)',
  CASE t.code
    WHEN 'annual' THEN COALESCE(
      (SELECT wp.annual_entitlement_days FROM workforce_leave_policies wp
        WHERE wp.counts_against_annual_balance AND wp.annual_entitlement_days IS NOT NULL
        LIMIT 1), 28)
    WHEN 'sick' THEN 14
    WHEN 'maternity' THEN 84
    WHEN 'paternity' THEN 3
    WHEN 'bereavement' THEN 5
    WHEN 'study' THEN 10
    WHEN 'compensatory' THEN 0
    ELSE 0
  END,
  CASE WHEN t.code = 'annual' THEN 'upfront' ELSE 'none' END,
  CASE WHEN t.code = 'annual' THEN 5 ELSE 0 END,
  CASE WHEN t.code = 'annual' THEN 3 ELSE NULL END,
  CASE t.code WHEN 'annual' THEN 7 WHEN 'study' THEN 14 ELSE 0 END,
  true,
  true,
  -- Only maternity leave excuses reporting by default: it is the one type long
  -- enough that expecting a monthly report would be absurd.
  t.code = 'maternity',
  '[{"step":1,"approver":"direct_manager"}]'::jsonb
FROM leave_types t
WHERE NOT EXISTS (SELECT 1 FROM leave_policies p WHERE p.leave_type_id = t.id);

-- Everyone gets the standard policies until People Ops assigns something else.
INSERT INTO leave_policy_assignments (policy_id, assignee_type, effective_from, priority, note)
SELECT p.id, 'everyone', CURRENT_DATE, 900, 'Seeded default assignment.'
FROM leave_policies p
WHERE NOT EXISTS (
  SELECT 1 FROM leave_policy_assignments a WHERE a.policy_id = p.id
);

-- =============================================================================
-- 3. Opening balances from the old numeric column
-- =============================================================================
DO $$
DECLARE
  e        record;
  v_type   uuid;
  v_year   date;
  v_count  integer := 0;
BEGIN
  SELECT id INTO v_type FROM leave_types WHERE code = 'annual';
  IF v_type IS NULL THEN RETURN; END IF;
  SELECT year_start INTO v_year FROM leave_year_bounds(CURRENT_DATE);

  FOR e IN
    SELECT id, leave_balance_days
    FROM workforce_employees
    WHERE COALESCE(leave_balance_days, 0) > 0
      AND status IN ('Active', 'On Leave', 'Onboarding', 'Suspended')
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM leave_transactions
      WHERE employee_id = e.id AND leave_type_id = v_type
        AND leave_year_start = v_year AND kind = 'opening_balance'
    );

    INSERT INTO leave_transactions (
      employee_id, leave_type_id, leave_year_start, kind, days,
      reason, effective_date
    ) VALUES (
      e.id, v_type, v_year, 'opening_balance', e.leave_balance_days,
      'Imported from workforce_employees.leave_balance_days', v_year
    );

    PERFORM leave_reconcile_balance(e.id, v_type, v_year);
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'leave: imported % opening balance(s)', v_count;
END
$$;

-- =============================================================================
-- 4. Existing leave requests
-- =============================================================================
DO $$
DECLARE
  lr       record;
  v_type   uuid;
  v_req    uuid;
  v_state  text;
  v_count  integer := 0;
BEGIN
  FOR lr IN
    SELECT * FROM workforce_leave_requests
    WHERE start_date IS NOT NULL AND end_date IS NOT NULL
  LOOP
    SELECT id INTO v_type FROM leave_types
     WHERE code = lower(regexp_replace(COALESCE(lr.leave_type, 'annual'), '[^a-zA-Z0-9]+', '_', 'g'));
    CONTINUE WHEN v_type IS NULL;

    CONTINUE WHEN EXISTS (
      SELECT 1 FROM leave_requests r
      WHERE r.employee_id = lr.employee_id
        AND r.leave_type_id = v_type
        AND r.start_date = lr.start_date
        AND r.end_date = lr.end_date
    );

    v_state := CASE lr.status
      WHEN 'Approved' THEN 'approved'
      WHEN 'Rejected' THEN 'rejected'
      WHEN 'Cancelled' THEN 'cancelled'
      ELSE 'submitted'
    END;

    INSERT INTO leave_requests (
      employee_id, leave_type_id, policy_id, start_date, end_date,
      state, reason, submitted_at, created_at
    ) VALUES (
      lr.employee_id, v_type,
      leave_resolve_policy(lr.employee_id, v_type, lr.start_date),
      lr.start_date, lr.end_date,
      v_state, COALESCE(lr.reason, 'Imported'), lr.submitted_at, lr.created_at
    )
    RETURNING id INTO v_req;

    -- Expand the range into days. The overlap trigger is live, so an imported
    -- request that genuinely conflicts with another will fail loudly here
    -- rather than being imported into an inconsistent state.
    BEGIN
      PERFORM leave_expand_days(v_req, 'full', NULL);
      IF v_state = 'approved' THEN
        PERFORM leave_post_usage(v_req, NULL);
        PERFORM leave_refresh_availability(lr.employee_id, lr.start_date, lr.end_date);
      END IF;
      v_count := v_count + 1;
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      -- Overlapping legacy data. Keep the request as a record but drop it back
      -- to a state that reserves nothing, so the import completes and People
      -- Ops can resolve the clash.
      UPDATE leave_requests SET state = 'draft',
             reason = COALESCE(reason, '') || ' [imported with a date clash; needs review]'
       WHERE id = v_req;
      DELETE FROM leave_request_days WHERE request_id = v_req;
    END;
  END LOOP;

  RAISE NOTICE 'leave: imported % request(s)', v_count;
END
$$;

-- =============================================================================
-- 5. Annual entitlement for the current year
-- =============================================================================
-- Upfront policies grant the whole entitlement on the first day of the leave
-- year. Without this, everybody's balance is whatever they carried in, and the
-- first person to request leave is told they have none.
DO $$
DECLARE
  e        record;
  v_year   date;
  v_count  integer := 0;
BEGIN
  SELECT year_start INTO v_year FROM leave_year_bounds(CURRENT_DATE);

  FOR e IN
    SELECT emp.id AS employee_id, p.id AS policy_id, p.leave_type_id,
           p.annual_entitlement_days
    FROM workforce_employees emp
    JOIN leave_policies p ON p.is_active AND p.accrual_method = 'upfront'
                         AND p.annual_entitlement_days > 0
    WHERE emp.status IN ('Active', 'On Leave', 'Onboarding')
      AND leave_resolve_policy(emp.id, p.leave_type_id, CURRENT_DATE) = p.id
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM leave_transactions
      WHERE employee_id = e.employee_id AND leave_type_id = e.leave_type_id
        AND leave_year_start = v_year AND kind = 'accrual'
    );

    INSERT INTO leave_transactions (
      employee_id, leave_type_id, policy_id, leave_year_start,
      kind, days, effective_date, reason
    ) VALUES (
      e.employee_id, e.leave_type_id, e.policy_id, v_year,
      'accrual', e.annual_entitlement_days, v_year, 'Annual entitlement'
    );

    PERFORM leave_reconcile_balance(e.employee_id, e.leave_type_id, v_year);
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'leave: granted % annual entitlement(s)', v_count;
END
$$;

NOTIFY pgrst, 'reload schema';
