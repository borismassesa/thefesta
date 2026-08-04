-- Leave — the ledger, the lifecycle, and the integrations.
--
-- WHY IN THE DATABASE
--
--   The overlap guard and the balance check must hold against any caller. Two
--   requests submitted at the same instant is the normal case for a team
--   booking December, and "read then insert" races.
--
--   The ledger must stay the only way a balance moves. Keeping the arithmetic
--   in one function that also writes the transaction means there is no path
--   that changes a number without recording why.
--
--   Approval scope has to be checked where the decision is made, not in the UI
--   that offers the button.
--
-- Errors raise ERRCODE P0001 with stable dotted tokens, mapped by
-- lib/leave/errors.ts under an exact-match whitelist.

-- =============================================================================
-- Leave year
-- =============================================================================
-- Calendar year, matching the existing workforce leave-balance code. A policy
-- with an anniversary-based year would set this per employee; that is not a
-- thing OpusFesta does, and inventing it unused would be a second code path
-- nobody exercises.
CREATE OR REPLACE FUNCTION public.leave_year_bounds(p_date date)
RETURNS TABLE (year_start date, year_end date)
LANGUAGE sql IMMUTABLE
AS $$
  SELECT date_trunc('year', p_date)::date,
         (date_trunc('year', p_date) + interval '1 year - 1 day')::date;
$$;

-- =============================================================================
-- leave_resolve_policy — which rules govern this person for this type
-- =============================================================================
-- Most specific wins: employee, then employment type, then department, then
-- everyone. Ties break on the explicit priority column, then on how recently
-- the assignment took effect.
CREATE OR REPLACE FUNCTION public.leave_resolve_policy(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT a.policy_id
  FROM leave_policy_assignments a
  JOIN leave_policies p ON p.id = a.policy_id
  JOIN workforce_employees e ON e.id = p_employee_id
  WHERE p.leave_type_id = p_leave_type_id
    AND p.is_active
    AND a.is_active
    AND a.effective_from <= p_date
    AND (a.effective_to IS NULL OR a.effective_to >= p_date)
    AND (
      (a.assignee_type = 'employee' AND a.employee_id = p_employee_id) OR
      (a.assignee_type = 'department' AND a.department = e.department) OR
      (a.assignee_type = 'employment_type' AND a.employment_type = e.employment_type) OR
      (a.assignee_type = 'everyone')
    )
  ORDER BY
    CASE a.assignee_type
      WHEN 'employee' THEN 0
      WHEN 'employment_type' THEN 1
      WHEN 'department' THEN 2
      ELSE 3
    END,
    a.priority,
    a.effective_from DESC
  LIMIT 1;
$$;

-- =============================================================================
-- leave_reconcile_balance — the cache is rebuilt from the ledger, always
-- =============================================================================
-- This is the ONLY writer of leave_balances. Every column is a sum over
-- leave_transactions, so the cache cannot drift from the ledger: if it ever
-- disagrees, running this fixes it, and the verification suite proves it agrees
-- after every kind of movement.
CREATE OR REPLACE FUNCTION public.leave_reconcile_balance(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_year_start date
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_year_end  date;
  v_opening   numeric(7,3);
  v_accrued   numeric(7,3);
  v_carry     numeric(7,3);
  v_used      numeric(7,3);
  v_adjusted  numeric(7,3);
  v_expired   numeric(7,3);
  v_balance   numeric(7,3);
  v_pending   numeric(7,3);
BEGIN
  SELECT year_end INTO v_year_end FROM leave_year_bounds(p_year_start);

  SELECT
    COALESCE(SUM(days) FILTER (WHERE kind = 'opening_balance'), 0),
    COALESCE(SUM(days) FILTER (WHERE kind = 'accrual'), 0),
    COALESCE(SUM(days) FILTER (WHERE kind = 'carryover'), 0),
    -- Usage is stored negative; the cache reports it as a positive "used".
    COALESCE(-SUM(days) FILTER (WHERE kind = 'usage'), 0),
    -- Reversals fold into adjustments for display: both are corrections, and
    -- splitting them in the summary would need a column nobody reads.
    COALESCE(SUM(days) FILTER (WHERE kind IN ('adjustment', 'reversal')), 0),
    COALESCE(-SUM(days) FILTER (WHERE kind = 'expiry'), 0),
    COALESCE(SUM(days), 0)
  INTO v_opening, v_accrued, v_carry, v_used, v_adjusted, v_expired, v_balance
  FROM leave_transactions
  WHERE employee_id = p_employee_id
    AND leave_type_id = p_leave_type_id
    AND leave_year_start = p_year_start;

  -- Pending is NOT in the ledger. Nothing has been taken yet, so it must not
  -- move the balance; it is shown beside it so somebody planning a holiday can
  -- see what is already spoken for.
  SELECT COALESCE(SUM(d.day_fraction), 0) INTO v_pending
  FROM leave_request_days d
  JOIN leave_requests r ON r.id = d.request_id
  WHERE r.employee_id = p_employee_id
    AND r.leave_type_id = p_leave_type_id
    AND r.state IN ('submitted', 'under_review')
    AND d.leave_date BETWEEN p_year_start AND v_year_end;

  INSERT INTO leave_balances (
    employee_id, leave_type_id, leave_year_start, leave_year_end,
    opening_days, accrued_days, carryover_days, used_days,
    adjusted_days, expired_days, balance_days, pending_days, reconciled_at
  ) VALUES (
    p_employee_id, p_leave_type_id, p_year_start, v_year_end,
    v_opening, v_accrued, v_carry, v_used,
    v_adjusted, v_expired, v_balance, v_pending, now()
  )
  ON CONFLICT (employee_id, leave_type_id, leave_year_start) DO UPDATE SET
    opening_days = EXCLUDED.opening_days,
    accrued_days = EXCLUDED.accrued_days,
    carryover_days = EXCLUDED.carryover_days,
    used_days = EXCLUDED.used_days,
    adjusted_days = EXCLUDED.adjusted_days,
    expired_days = EXCLUDED.expired_days,
    balance_days = EXCLUDED.balance_days,
    pending_days = EXCLUDED.pending_days,
    reconciled_at = now();

  RETURN v_balance;
END;
$$;

-- =============================================================================
-- leave_expand_days — turn a range into the days actually consumed
-- =============================================================================
-- Skips rest days and public holidays inside the range, which is why a request
-- from Friday to Monday is two days and not four. Rebuilds from scratch each
-- time so editing a draft's dates cannot leave orphans behind.
CREATE OR REPLACE FUNCTION public.leave_expand_days(
  p_request_id uuid,
  p_portion text DEFAULT 'full',
  p_hours numeric DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r          leave_requests%ROWTYPE;
  sched      work_schedules%ROWTYPE;
  v_cursor   date;
  v_fraction numeric(4,3);
  v_total    numeric(7,3) := 0;
  v_daily    numeric(5,2);
BEGIN
  SELECT * INTO r FROM leave_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'leave.not_found' USING ERRCODE = 'P0001'; END IF;

  SELECT s.* INTO sched
  FROM work_schedules s
  WHERE s.id = COALESCE(
    (SELECT schedule_id FROM employee_shift_assignments
      WHERE employee_id = r.employee_id AND is_active_range(effective_from, effective_to, r.start_date)
      LIMIT 1),
    (SELECT id FROM work_schedules WHERE is_default AND active LIMIT 1)
  );

  v_daily := GREATEST(1, COALESCE(sched.standard_daily_minutes, 480)) / 60.0;

  v_fraction := CASE p_portion
    WHEN 'full' THEN 1.0
    WHEN 'half_am' THEN 0.5
    WHEN 'half_pm' THEN 0.5
    WHEN 'hours' THEN LEAST(1.0, GREATEST(0.001, COALESCE(p_hours, 0) / v_daily))
  END;

  DELETE FROM leave_request_days WHERE request_id = p_request_id;

  v_cursor := r.start_date;
  WHILE v_cursor <= r.end_date LOOP
    -- A rest day or a public holiday inside a leave range is not leave. Booking
    -- a fortnight over Christmas should not cost the public holidays.
    IF (sched.id IS NULL OR EXTRACT(ISODOW FROM v_cursor)::smallint = ANY (sched.working_weekdays))
       AND NOT EXISTS (
         SELECT 1 FROM holiday_calendars h
         WHERE COALESCE(h.observed_date, h.holiday_date) = v_cursor
           AND (h.schedule_id IS NULL OR h.schedule_id = sched.id)
       )
    THEN
      INSERT INTO leave_request_days (
        request_id, employee_id, leave_date, portion, hours, day_fraction
      ) VALUES (
        p_request_id, r.employee_id, v_cursor, p_portion,
        CASE WHEN p_portion = 'hours' THEN p_hours ELSE NULL END,
        v_fraction
      );
      v_total := v_total + v_fraction;
    END IF;
    v_cursor := v_cursor + 1;
  END LOOP;

  UPDATE leave_requests SET total_days = v_total WHERE id = p_request_id;
  RETURN v_total;
END;
$$;

-- Small helper so the shift-assignment lookup above reads clearly.
CREATE OR REPLACE FUNCTION public.is_active_range(
  p_from date, p_to date, p_at date
)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_from <= p_at AND (p_to IS NULL OR p_to >= p_at);
$$;

-- =============================================================================
-- leave_can_approve — reporting scope
-- =============================================================================
-- True when the approver is somewhere in the requester's management chain.
-- Walks manager_id upward with a depth cap, so a cycle in the org chart cannot
-- hang the request. HR and admins are handled by the CALLER passing
-- p_is_hr = true, because "holds workforce.write" is an application fact.
CREATE OR REPLACE FUNCTION public.leave_can_approve(
  p_approver_id uuid,
  p_employee_id uuid,
  p_is_hr boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cursor uuid;
  v_depth  integer := 0;
BEGIN
  -- Self-approval is checked FIRST, before the HR bypass. Order matters: an HR
  -- manager taking leave is exactly the case where checking HR first would let
  -- somebody sign off their own absence.
  IF p_approver_id = p_employee_id THEN RETURN false; END IF;
  IF p_is_hr THEN RETURN true; END IF;

  SELECT manager_id INTO v_cursor FROM workforce_employees WHERE id = p_employee_id;
  WHILE v_cursor IS NOT NULL AND v_depth < 10 LOOP
    IF v_cursor = p_approver_id THEN RETURN true; END IF;
    SELECT manager_id INTO v_cursor FROM workforce_employees WHERE id = v_cursor;
    v_depth := v_depth + 1;
  END LOOP;

  RETURN false;
END;
$$;

-- =============================================================================
-- leave_submit_request
-- =============================================================================
CREATE OR REPLACE FUNCTION public.leave_submit_request(
  p_request_id uuid,
  p_employee_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r          leave_requests%ROWTYPE;
  lt         leave_types%ROWTYPE;
  pol        leave_policies%ROWTYPE;
  v_year     date;
  v_balance  numeric(7,3);
  v_pending  numeric(7,3);
  v_total    numeric(7,3);
  v_docs     integer;
BEGIN
  SELECT * INTO r FROM leave_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'leave.not_found' USING ERRCODE = 'P0001'; END IF;
  IF r.employee_id <> p_employee_id THEN
    RAISE EXCEPTION 'leave.not_owner' USING ERRCODE = 'P0001';
  END IF;
  IF r.state NOT IN ('draft', 'returned') THEN
    RAISE EXCEPTION 'leave.not_editable' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO lt FROM leave_types WHERE id = r.leave_type_id;
  SELECT * INTO pol FROM leave_policies
   WHERE id = COALESCE(r.policy_id, leave_resolve_policy(r.employee_id, r.leave_type_id, r.start_date));
  IF pol.id IS NULL THEN
    RAISE EXCEPTION 'leave.no_policy' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(SUM(day_fraction), 0) INTO v_total
  FROM leave_request_days WHERE request_id = p_request_id;
  IF v_total <= 0 THEN
    -- Every day in the range was a holiday or a rest day.
    RAISE EXCEPTION 'leave.no_working_days' USING ERRCODE = 'P0001';
  END IF;

  IF pol.min_notice_days > 0
     AND r.start_date < CURRENT_DATE + pol.min_notice_days THEN
    RAISE EXCEPTION 'leave.insufficient_notice' USING ERRCODE = 'P0001';
  END IF;

  IF pol.max_consecutive_days IS NOT NULL AND v_total > pol.max_consecutive_days THEN
    RAISE EXCEPTION 'leave.exceeds_maximum' USING ERRCODE = 'P0001';
  END IF;

  IF lt.requires_document THEN
    SELECT count(*) INTO v_docs FROM leave_documents WHERE request_id = p_request_id;
    IF v_docs = 0 THEN
      RAISE EXCEPTION 'leave.document_required' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Balance check. Pending days count against you: two requests that each fit
  -- the balance but together do not must not both be submittable.
  IF lt.is_balance_based AND NOT pol.allow_negative_balance THEN
    SELECT year_start INTO v_year FROM leave_year_bounds(r.start_date);
    PERFORM leave_reconcile_balance(r.employee_id, r.leave_type_id, v_year);
    SELECT balance_days, pending_days INTO v_balance, v_pending
    FROM leave_balances
    WHERE employee_id = r.employee_id AND leave_type_id = r.leave_type_id
      AND leave_year_start = v_year;

    IF COALESCE(v_balance, 0) - COALESCE(v_pending, 0) < v_total THEN
      RAISE EXCEPTION 'leave.insufficient_balance' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Snapshot the chain, so editing the policy does not change what an
  -- in-flight request has to clear.
  UPDATE leave_requests
     SET state = 'submitted',
         policy_id = pol.id,
         total_days = v_total,
         approval_chain = pol.approval_chain,
         current_step = 1,
         submitted_at = now()
   WHERE id = p_request_id;

  -- Re-run the overlap guard now the request is active: it deliberately lets
  -- drafts through, so this is the first moment the days are really committed.
  PERFORM leave_assert_no_overlap(p_request_id);

  SELECT year_start INTO v_year FROM leave_year_bounds(r.start_date);
  PERFORM leave_reconcile_balance(r.employee_id, r.leave_type_id, v_year);

  RETURN v_total;
END;
$$;

-- Re-checks every day of a request against everybody else's committed days.
-- Needed because the row trigger skips drafts, so submission is where a draft
-- built weeks ago finally has to be conflict-free.
CREATE OR REPLACE FUNCTION public.leave_assert_no_overlap(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  d record;
  v_committed numeric(6,3);
BEGIN
  FOR d IN SELECT * FROM leave_request_days WHERE request_id = p_request_id LOOP
    SELECT COALESCE(SUM(x.day_fraction), 0) INTO v_committed
    FROM leave_request_days x
    JOIN leave_requests r ON r.id = x.request_id
    WHERE x.employee_id = d.employee_id
      AND x.leave_date = d.leave_date
      AND x.request_id <> p_request_id
      AND r.state IN ('submitted', 'under_review', 'approved');

    IF v_committed + d.day_fraction > 1.0001 THEN
      RAISE EXCEPTION 'leave.overlapping_request' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
END;
$$;

-- =============================================================================
-- leave_decide — the approval chain
-- =============================================================================
CREATE OR REPLACE FUNCTION public.leave_decide(
  p_request_id uuid,
  p_actor_employee_id uuid,
  p_decision text,
  p_note text DEFAULT NULL,
  p_is_hr boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r          leave_requests%ROWTYPE;
  v_steps    integer;
  v_state    text;
  v_year     date;
  v_trail    jsonb;
BEGIN
  SELECT * INTO r FROM leave_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'leave.not_found' USING ERRCODE = 'P0001'; END IF;
  IF r.state NOT IN ('submitted', 'under_review') THEN
    RAISE EXCEPTION 'leave.not_pending' USING ERRCODE = 'P0001';
  END IF;

  -- THE SCOPE CHECK. A manager may only decide for people who report to them,
  -- directly or through the chain. Everyone else needs HR.
  IF NOT leave_can_approve(p_actor_employee_id, r.employee_id, p_is_hr) THEN
    RAISE EXCEPTION 'leave.outside_approval_scope' USING ERRCODE = 'P0001';
  END IF;

  IF p_decision IN ('reject', 'return') AND (p_note IS NULL OR length(btrim(p_note)) = 0) THEN
    RAISE EXCEPTION 'leave.reason_required' USING ERRCODE = 'P0001';
  END IF;

  v_trail := r.approval_trail || jsonb_build_object(
    'step', r.current_step,
    'approver_id', p_actor_employee_id,
    'decision', p_decision,
    'note', p_note,
    'at', now()
  );

  v_steps := GREATEST(1, COALESCE(jsonb_array_length(r.approval_chain), 1));

  IF p_decision = 'reject' THEN
    v_state := 'rejected';
  ELSIF p_decision = 'return' THEN
    v_state := 'returned';
  ELSIF p_decision = 'approve' THEN
    -- Multi-step chains stay under review until the last approver signs.
    IF r.current_step < v_steps THEN
      v_state := 'under_review';
    ELSE
      v_state := 'approved';
    END IF;
  ELSE
    RAISE EXCEPTION 'leave.invalid_decision' USING ERRCODE = 'P0001';
  END IF;

  UPDATE leave_requests
     SET state = v_state,
         current_step = CASE WHEN p_decision = 'approve' AND r.current_step < v_steps
                             THEN r.current_step + 1 ELSE r.current_step END,
         approval_trail = v_trail,
         decided_at = CASE WHEN v_state IN ('approved','rejected') THEN now() ELSE decided_at END,
         decided_by_employee_id = CASE WHEN v_state IN ('approved','rejected')
                                       THEN p_actor_employee_id ELSE decided_by_employee_id END,
         decision_note = COALESCE(p_note, decision_note)
   WHERE id = p_request_id;

  -- Final approval is the moment the ledger moves and the rest of the platform
  -- learns about the absence.
  IF v_state = 'approved' THEN
    PERFORM leave_post_usage(p_request_id, p_actor_employee_id);
    PERFORM leave_refresh_availability(r.employee_id, r.start_date, r.end_date);
  END IF;

  SELECT year_start INTO v_year FROM leave_year_bounds(r.start_date);
  PERFORM leave_reconcile_balance(r.employee_id, r.leave_type_id, v_year);

  RETURN v_state;
END;
$$;

-- =============================================================================
-- leave_post_usage / leave_cancel — ledger movements
-- =============================================================================
CREATE OR REPLACE FUNCTION public.leave_post_usage(
  p_request_id uuid,
  p_actor_employee_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r       leave_requests%ROWTYPE;
  lt      leave_types%ROWTYPE;
  v_year  date;
  v_tx    uuid;
BEGIN
  SELECT * INTO r FROM leave_requests WHERE id = p_request_id;
  SELECT * INTO lt FROM leave_types WHERE id = r.leave_type_id;
  IF NOT lt.is_balance_based THEN RETURN NULL; END IF;

  -- Idempotent: approving twice must not debit twice.
  SELECT id INTO v_tx FROM leave_transactions
   WHERE request_id = p_request_id AND kind = 'usage' LIMIT 1;
  IF v_tx IS NOT NULL THEN RETURN v_tx; END IF;

  SELECT year_start INTO v_year FROM leave_year_bounds(r.start_date);

  INSERT INTO leave_transactions (
    employee_id, leave_type_id, policy_id, leave_year_start,
    kind, days, request_id, actor_employee_id, effective_date
  ) VALUES (
    r.employee_id, r.leave_type_id, r.policy_id, v_year,
    'usage', -r.total_days, p_request_id, p_actor_employee_id, r.start_date
  )
  RETURNING id INTO v_tx;

  RETURN v_tx;
END;
$$;

-- Cancelling approved leave REVERSES the usage. It does not delete it: the
-- ledger records that the leave was approved and then given back, which is a
-- different fact from it never having happened, and payroll may already have
-- seen the first one.
CREATE OR REPLACE FUNCTION public.leave_cancel(
  p_request_id uuid,
  p_actor_employee_id uuid,
  p_reason text,
  p_is_hr boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r        leave_requests%ROWTYPE;
  v_usage  leave_transactions%ROWTYPE;
  v_year   date;
  v_state  text;
BEGIN
  SELECT * INTO r FROM leave_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'leave.not_found' USING ERRCODE = 'P0001'; END IF;
  IF r.state IN ('cancelled', 'withdrawn', 'rejected') THEN
    RAISE EXCEPTION 'leave.already_closed' USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'leave.reason_required' USING ERRCODE = 'P0001';
  END IF;

  -- The owner may withdraw their own; anyone else needs approval scope.
  IF r.employee_id <> p_actor_employee_id
     AND NOT leave_can_approve(p_actor_employee_id, r.employee_id, p_is_hr) THEN
    RAISE EXCEPTION 'leave.outside_approval_scope' USING ERRCODE = 'P0001';
  END IF;

  -- Withdrawn is before a decision; cancelled is after. Both free the days, and
  -- the distinction is what a manager sees when they look back.
  v_state := CASE WHEN r.state = 'approved' THEN 'cancelled' ELSE 'withdrawn' END;

  IF r.state = 'approved' THEN
    SELECT * INTO v_usage FROM leave_transactions
     WHERE request_id = p_request_id AND kind = 'usage' LIMIT 1;

    IF v_usage.id IS NOT NULL THEN
      INSERT INTO leave_transactions (
        employee_id, leave_type_id, policy_id, leave_year_start,
        kind, days, request_id, reverses_transaction_id,
        reason, actor_employee_id, effective_date
      ) VALUES (
        v_usage.employee_id, v_usage.leave_type_id, v_usage.policy_id, v_usage.leave_year_start,
        'reversal', -v_usage.days, p_request_id, v_usage.id,
        p_reason, p_actor_employee_id, CURRENT_DATE
      );
    END IF;
  END IF;

  UPDATE leave_requests
     SET state = v_state,
         cancelled_at = now(),
         cancelled_by_employee_id = p_actor_employee_id,
         cancellation_reason = p_reason
   WHERE id = p_request_id;

  -- The days are free again, so availability and the balance both move back.
  PERFORM leave_refresh_availability(r.employee_id, r.start_date, r.end_date);
  SELECT year_start INTO v_year FROM leave_year_bounds(r.start_date);
  PERFORM leave_reconcile_balance(r.employee_id, r.leave_type_id, v_year);

  RETURN v_state;
END;
$$;

-- A manual correction. Demands a reason by CHECK constraint on the table, and
-- the caller writes an audit event: an unexplained change to somebody's leave
-- entitlement is the kind of thing that has to be answerable months later.
CREATE OR REPLACE FUNCTION public.leave_adjust_balance(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_year_start date,
  p_days numeric,
  p_reason text,
  p_actor_employee_id uuid,
  p_actor_clerk_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tx uuid;
BEGIN
  IF p_days = 0 THEN RAISE EXCEPTION 'leave.zero_adjustment' USING ERRCODE = 'P0001'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'leave.reason_required' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO leave_transactions (
    employee_id, leave_type_id, leave_year_start,
    kind, days, reason, actor_employee_id, actor_clerk_id
  ) VALUES (
    p_employee_id, p_leave_type_id, p_year_start,
    'adjustment', p_days, p_reason, p_actor_employee_id, p_actor_clerk_id
  )
  RETURNING id INTO v_tx;

  PERFORM leave_reconcile_balance(p_employee_id, p_leave_type_id, p_year_start);
  RETURN v_tx;
END;
$$;

-- =============================================================================
-- leave_is_on_leave — THE INTEGRATION POINT
-- =============================================================================
-- One answer to "is this person on approved leave that day", used by the
-- attendance missed-punch sweep and the tracker's day-state resolver. Both used
-- to read workforce_leave_requests directly; pointing them here means there is
-- one definition and the modules cannot disagree.
--
-- Reads the new tables AND the legacy one, so the integration keeps working for
-- leave booked before this module existed.
CREATE OR REPLACE FUNCTION public.leave_is_on_leave(
  p_employee_id uuid,
  p_date date,
  p_purpose text DEFAULT 'attendance'
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM leave_request_days d
    JOIN leave_requests r ON r.id = d.request_id
    JOIN leave_types t ON t.id = r.leave_type_id
    LEFT JOIN leave_policies p ON p.id = r.policy_id
    WHERE d.employee_id = p_employee_id
      AND d.leave_date = p_date
      AND r.state = 'approved'
      -- A half day is still a working day for the tracker: they were in for
      -- half of it and an entry is still owed. Only a full day suppresses.
      AND d.day_fraction >= 1
      AND CASE p_purpose
            WHEN 'attendance' THEN COALESCE(p.suppresses_attendance, true)
            WHEN 'tracker' THEN COALESCE(p.suppresses_tracker, true)
            WHEN 'reports' THEN COALESCE(p.suppresses_reports, false)
            ELSE true
          END
  )
  OR EXISTS (
    -- Legacy rows, so leave booked before this module still suppresses.
    SELECT 1 FROM workforce_leave_requests lr
    WHERE lr.employee_id = p_employee_id
      AND lr.status = 'Approved'
      AND p_date BETWEEN lr.start_date AND lr.end_date
  );
$$;

-- =============================================================================
-- leave_refresh_availability
-- =============================================================================
CREATE OR REPLACE FUNCTION public.leave_refresh_availability(
  p_employee_id uuid,
  p_from date,
  p_to date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cursor   date := p_from;
  sched      work_schedules%ROWTYPE;
  emp        workforce_employees%ROWTYPE;
  v_taken    numeric(4,3);
  v_status   text;
  v_type     uuid;
  v_request  uuid;
  v_count    integer := 0;
BEGIN
  SELECT * INTO emp FROM workforce_employees WHERE id = p_employee_id;
  SELECT * INTO sched FROM work_schedules WHERE is_default AND active LIMIT 1;

  WHILE v_cursor <= p_to AND v_count < 400 LOOP
    SELECT COALESCE(SUM(d.day_fraction), 0) INTO v_taken
    FROM leave_request_days d
    JOIN leave_requests r ON r.id = d.request_id
    WHERE d.employee_id = p_employee_id
      AND d.leave_date = v_cursor
      AND r.state = 'approved';

    -- Which leave, for the calendar label. Aggregating uuids is not an option
    -- (Postgres has no min(uuid)), and picking the largest booking is the more
    -- useful answer anyway when a day is split between two requests.
    SELECT r.leave_type_id, r.id INTO v_type, v_request
    FROM leave_request_days d
    JOIN leave_requests r ON r.id = d.request_id
    WHERE d.employee_id = p_employee_id
      AND d.leave_date = v_cursor
      AND r.state = 'approved'
    ORDER BY d.day_fraction DESC, r.created_at
    LIMIT 1;

    v_status := CASE
      WHEN emp.start_date > v_cursor OR emp.status IN ('Resigned', 'Terminated') THEN 'not_employed'
      WHEN v_taken >= 1 THEN 'on_leave'
      WHEN v_taken > 0 THEN 'partial_leave'
      WHEN EXISTS (
        SELECT 1 FROM holiday_calendars h
        WHERE COALESCE(h.observed_date, h.holiday_date) = v_cursor
          AND (h.schedule_id IS NULL OR h.schedule_id = sched.id)
      ) THEN 'public_holiday'
      WHEN sched.id IS NOT NULL
           AND NOT (EXTRACT(ISODOW FROM v_cursor)::smallint = ANY (sched.working_weekdays))
        THEN 'rest_day'
      ELSE 'available'
    END;

    INSERT INTO employee_availability (
      employee_id, availability_date, status, available_fraction,
      leave_type_id, leave_request_id, computed_at
    ) VALUES (
      p_employee_id, v_cursor, v_status,
      CASE WHEN v_status IN ('on_leave', 'not_employed', 'public_holiday', 'rest_day') THEN 0
           WHEN v_status = 'partial_leave' THEN GREATEST(0, 1 - v_taken)
           ELSE 1 END,
      CASE WHEN v_taken > 0 THEN v_type ELSE NULL END,
      CASE WHEN v_taken > 0 THEN v_request ELSE NULL END,
      now()
    )
    ON CONFLICT (employee_id, availability_date) DO UPDATE SET
      status = EXCLUDED.status,
      available_fraction = EXCLUDED.available_fraction,
      leave_type_id = EXCLUDED.leave_type_id,
      leave_request_id = EXCLUDED.leave_request_id,
      computed_at = now();

    v_cursor := v_cursor + 1;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- =============================================================================
-- Accrual, carryover and expiry — the background jobs
-- =============================================================================
CREATE OR REPLACE FUNCTION public.leave_accrue_monthly(p_date date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  a        record;
  v_date   date := COALESCE(p_date, CURRENT_DATE);
  v_year   date;
  v_month  date;
  v_count  integer := 0;
BEGIN
  SELECT year_start INTO v_year FROM leave_year_bounds(v_date);
  v_month := date_trunc('month', v_date)::date;

  FOR a IN
    SELECT DISTINCT e.id AS employee_id, p.id AS policy_id, p.leave_type_id,
           p.annual_entitlement_days
    FROM workforce_employees e
    CROSS JOIN LATERAL (
      SELECT lp.* FROM leave_policies lp
      WHERE lp.is_active AND lp.accrual_method = 'monthly'
    ) p
    WHERE e.status IN ('Active', 'On Leave', 'Onboarding')
      AND leave_resolve_policy(e.id, p.leave_type_id, v_date) = p.id
      AND e.start_date + p.waiting_period_days <= v_date
  LOOP
    -- Idempotent: one accrual per employee per type per month, whatever the
    -- job's schedule does.
    IF EXISTS (
      SELECT 1 FROM leave_transactions
      WHERE employee_id = a.employee_id AND leave_type_id = a.leave_type_id
        AND kind = 'accrual' AND date_trunc('month', effective_date)::date = v_month
    ) THEN CONTINUE; END IF;

    INSERT INTO leave_transactions (
      employee_id, leave_type_id, policy_id, leave_year_start,
      kind, days, effective_date, reason
    ) VALUES (
      a.employee_id, a.leave_type_id, a.policy_id, v_year,
      'accrual', ROUND(a.annual_entitlement_days / 12.0, 3), v_month,
      'Monthly accrual'
    );

    PERFORM leave_reconcile_balance(a.employee_id, a.leave_type_id, v_year);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Expires carryover that has outlived the policy's window. Recorded as an
-- expiry transaction, so the balance dropping in April is explainable.
CREATE OR REPLACE FUNCTION public.leave_expire_carryover(p_date date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b        record;
  v_date   date := COALESCE(p_date, CURRENT_DATE);
  v_count  integer := 0;
BEGIN
  FOR b IN
    SELECT lb.*, lp.carryover_expires_after_months, lp.id AS policy_id
    FROM leave_balances lb
    JOIN leave_policies lp ON lp.leave_type_id = lb.leave_type_id AND lp.is_active
    WHERE lb.carryover_days > 0
      AND lp.carryover_expires_after_months IS NOT NULL
      AND v_date >= (lb.leave_year_start + make_interval(months => lp.carryover_expires_after_months))::date
  LOOP
    IF EXISTS (
      SELECT 1 FROM leave_transactions
      WHERE employee_id = b.employee_id AND leave_type_id = b.leave_type_id
        AND leave_year_start = b.leave_year_start AND kind = 'expiry'
    ) THEN CONTINUE; END IF;

    -- Never expire more than is actually left: if the carried days were already
    -- spent, there is nothing to take back.
    INSERT INTO leave_transactions (
      employee_id, leave_type_id, policy_id, leave_year_start,
      kind, days, effective_date, reason
    ) VALUES (
      b.employee_id, b.leave_type_id, b.policy_id, b.leave_year_start,
      'expiry', -LEAST(b.carryover_days, GREATEST(b.balance_days, 0)), v_date,
      'Carryover expired'
    );

    PERFORM leave_reconcile_balance(b.employee_id, b.leave_type_id, b.leave_year_start);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- =============================================================================
-- Access control
-- =============================================================================
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'leave_year_bounds(date)',
    'is_active_range(date, date, date)',
    'leave_resolve_policy(uuid, uuid, date)',
    'leave_reconcile_balance(uuid, uuid, date)',
    'leave_expand_days(uuid, text, numeric)',
    'leave_can_approve(uuid, uuid, boolean)',
    'leave_submit_request(uuid, uuid)',
    'leave_assert_no_overlap(uuid)',
    'leave_decide(uuid, uuid, text, text, boolean)',
    'leave_post_usage(uuid, uuid)',
    'leave_cancel(uuid, uuid, text, boolean)',
    'leave_adjust_balance(uuid, uuid, date, numeric, text, uuid, text)',
    'leave_is_on_leave(uuid, date, text)',
    'leave_refresh_availability(uuid, date, date)',
    'leave_accrue_monthly(date)',
    'leave_expire_carryover(date)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';
