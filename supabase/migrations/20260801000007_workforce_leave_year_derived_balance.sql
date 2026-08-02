-- =============================================================================
-- Leave balance becomes DERIVED, and the allowance gains a year
-- =============================================================================
-- The company grants 28 days per year, but nothing in the system had a year.
-- workforce_employees.leave_balance_days was a single running counter,
-- decremented on approval and never reset. Three consequences:
--
--   1. The allowance never renewed. Days spent in 2026 stayed spent in 2027.
--   2. The counter drifted from reality whenever the deduction rule changed.
--      When only 'Annual' was deducted, one employee accrued 98 approved days
--      and still read 28 of 28 remaining. Three others read 0 having taken
--      nothing at all.
--   3. It sat in the concurrency surface: every approval had to mutate it.
--
-- A stored mutable counter is the wrong shape. The balance is not a fact to be
-- maintained, it is a CONSEQUENCE of approved leave within a period:
--
--     remaining = 28 + adjustments - approved days in the current leave year
--
-- Derived, drift is impossible, the annual reset is automatic, and the balance
-- leaves the concurrency surface entirely.
--
-- This migration stops the decrement. It does NOT drop the column: see below.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.workforce_decide_leave_request(
  p_request_id uuid,
  p_decision text,
  p_reviewer_employee_id uuid DEFAULT NULL,
  p_decision_note text DEFAULT NULL
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
  v_req workforce_leave_requests%ROWTYPE;
BEGIN
  IF p_decision NOT IN ('Approved', 'Rejected') THEN
    RAISE EXCEPTION 'Decision must be Approved or Rejected, got %', p_decision
      USING ERRCODE = 'check_violation';
  END IF;

  -- FOR UPDATE with the status predicate still serialises concurrent
  -- deciders, so a loser selects nothing rather than overwriting the winner.
  SELECT * INTO v_req
    FROM workforce_leave_requests
   WHERE id = p_request_id
     AND status = 'Pending'
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  UPDATE workforce_leave_requests
     SET status = p_decision,
         reviewed_at = now(),
         reviewed_by = p_reviewer_employee_id,
         decision_note = nullif(btrim(coalesce(p_decision_note, '')), ''),
         updated_at = now()
   WHERE id = v_req.id;

  -- NO balance write. The remaining allowance is computed from approved
  -- requests inside the current leave year (see leave-year.ts). Decrementing
  -- here would reintroduce the drift this migration exists to remove.
  --
  -- balance_after is returned as NULL rather than removed, so the function
  -- signature and every caller stay unchanged.
  RETURN QUERY SELECT true, v_req.employee_id, v_req.leave_type, v_req.days, NULL::integer;
END $$;

COMMENT ON FUNCTION public.workforce_decide_leave_request(uuid, text, uuid, text) IS
  'Atomically transition a Pending leave request and record the reviewer and their note. Does NOT touch leave_balance_days: the remaining allowance is derived from approved leave within the leave year. Authorisation is enforced in the application before this is invoked.';

REVOKE EXECUTE ON FUNCTION public.workforce_decide_leave_request(uuid, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.workforce_decide_leave_request(uuid, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.workforce_decide_leave_request(uuid, text, uuid, text) FROM authenticated;

-- ---------------------------------------------------------------------------
-- The column stays, with its meaning changed
-- ---------------------------------------------------------------------------
-- NOT dropped, for two reasons. Carry-over, pro-rata allowances for mid-year
-- joiners and manual corrections all need somewhere to live, and this column
-- is the natural home once it means "adjustment" rather than "balance".
-- Dropping it would also break every existing reader in one step.
--
-- Its current values are NOT migrated into that meaning, because they are
-- known to be wrong in both directions and interpreting them as adjustments
-- would bake the drift in permanently. They are simply no longer read.
COMMENT ON COLUMN workforce_employees.leave_balance_days IS
  'NO LONGER AUTHORITATIVE. Was a running balance decremented on approval; it never reset annually and drifted whenever the deduction rule changed. The remaining allowance is now derived as 28 + adjustments - approved days in the current leave year. Retained as the future home for carry-over and pro-rata adjustments; existing values are stale and unread.';

DO $$
BEGIN
  RAISE NOTICE 'leave_balance_days is no longer written or read. Remaining allowance is derived per leave year. Existing values are stale by design and need no backfill.';
END $$;

NOTIFY pgrst, 'reload schema';
