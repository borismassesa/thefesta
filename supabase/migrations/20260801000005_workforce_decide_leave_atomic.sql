-- =============================================================================
-- Phase 3C follow-up — make leave approval ATOMIC, not merely single-winner
-- =============================================================================
-- The application decides a leave request in two independent round-trips:
--
--   1. UPDATE workforce_leave_requests SET status = … WHERE id = … AND status = 'Pending'
--   2. UPDATE workforce_employees SET leave_balance_days = …
--
-- The conditional predicate on step 1 guarantees a single WINNER, so two stale
-- approvers cannot both decide. It does not make the pair atomic. Either of
-- these can still happen:
--
--   Approved, balance NOT deducted   — step 2 fails after step 1 commits
--   Balance deducted, still Pending  — if the order were ever reversed
--
-- The first is the live risk today: an employee keeps days they have already
-- been granted, and the discrepancy is invisible because the request looks
-- correctly approved.
--
-- This function does both inside one transaction. It also takes the reviewer
-- id so attribution can be written the moment reviewed_by is repointed off
-- admin_whitelist (tracked separately); until then the parameter is accepted
-- and recorded in the return value, not stored.
--
-- AUTHORISATION IS NOT DONE HERE. The caller has already run
-- canDecideLeaveRequest (team scope OR workforce.leave.approve, and never
-- self-approval). This function is the transactional boundary only, which is
-- exactly why the REVOKE below matters: SECURITY DEFINER plus PostgREST would
-- otherwise expose an unauthenticated approval endpoint.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.workforce_decide_leave_request(
  p_request_id uuid,
  p_decision text,
  p_reviewer_employee_id uuid DEFAULT NULL
)
RETURNS TABLE (
  decided boolean,
  subject_employee_id uuid,
  leave_type text,
  days integer,
  balance_after integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_req   workforce_leave_requests%ROWTYPE;
  v_after integer;
BEGIN
  IF p_decision NOT IN ('Approved', 'Rejected') THEN
    RAISE EXCEPTION 'Decision must be Approved or Rejected, got %', p_decision
      USING ERRCODE = 'check_violation';
  END IF;

  -- FOR UPDATE serialises concurrent deciders on this row. The status
  -- predicate means a loser selects nothing rather than blocking and then
  -- overwriting the winner's decision.
  SELECT * INTO v_req
    FROM workforce_leave_requests
   WHERE id = p_request_id
     AND status = 'Pending'
   FOR UPDATE;

  IF NOT FOUND THEN
    -- Already decided, cancelled, or gone. Report it rather than raising, so
    -- the caller can show "someone else decided this first".
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  UPDATE workforce_leave_requests
     SET status = p_decision,
         reviewed_at = now(),
         updated_at = now()
   WHERE id = v_req.id;

  -- Only Annual draws down the balance, matching affectsBalance() in
  -- leave-calculation.ts. Clamped at zero, matching balanceAfter().
  IF p_decision = 'Approved' AND v_req.leave_type = 'Annual' THEN
    UPDATE workforce_employees
       SET leave_balance_days = GREATEST(0, leave_balance_days - v_req.days)
     WHERE id = v_req.employee_id
    RETURNING leave_balance_days INTO v_after;
  ELSE
    SELECT leave_balance_days INTO v_after
      FROM workforce_employees WHERE id = v_req.employee_id;
  END IF;

  RETURN QUERY SELECT true, v_req.employee_id, v_req.leave_type, v_req.days, v_after;
END $$;

COMMENT ON FUNCTION public.workforce_decide_leave_request(uuid, text, uuid) IS
  'Atomically transition a Pending leave request and adjust the Annual balance. Single transaction, so the two cannot partially commit. Authorisation is the caller''s responsibility and is enforced in the application before this is invoked.';

-- Postgres grants EXECUTE to PUBLIC by default, and PostgREST exposes any
-- reachable function as an RPC endpoint. Without this, SECURITY DEFINER would
-- turn the above into an unauthenticated "approve any leave request" call.
REVOKE EXECUTE ON FUNCTION public.workforce_decide_leave_request(uuid, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.workforce_decide_leave_request(uuid, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.workforce_decide_leave_request(uuid, text, uuid) FROM authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'workforce_decide_leave_request'
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'workforce_decide_leave_request is still executable by anon';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
