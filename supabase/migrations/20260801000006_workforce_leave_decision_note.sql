-- =============================================================================
-- Leave decisions: capture WHO decided and WHY
-- =============================================================================
-- Two gaps closed together, because they are the same gap seen twice.
--
-- 1. decision_note did not exist. An approver could change the outcome of
--    someone's leave with no way to say why. For a rejection especially, the
--    employee saw only "Rejected" with no explanation, and the approver had
--    nowhere to record the conversation that led to it.
--
-- 2. reviewed_by pointed at admin_whitelist — the legacy table superseded by
--    workforce_employees — and was NEVER written. decideLeaveRequest only ever
--    set status and reviewed_at. So no leave request in the system records who
--    approved it, and the column could not have held a valid id even if it
--    had been written.
--
-- Together these mean a decided request currently carries no accountability at
-- all: not who, not why. Phase 3C recorded the actor in the audit log as a
-- stopgap; this puts it on the row where joins and the UI can reach it.
--
-- 3. The deduction rule was wrong. Only 'Annual' drew down the balance, but
--    company policy is a single 28-day pool covering every leave type. Fixed
--    in the function below.
--
--    NOT BACKFILLED, deliberately. Existing approved Sick, Compassionate,
--    Maternity, Paternity and Unpaid leave was never deducted, so current
--    balances overstate what people have left — one employee reads 28 of 28
--    remaining against 98 approved days. Correcting that is a People Ops
--    decision, not a migration's: it means deciding whether historical leave
--    counts retroactively, what happens to anyone it would push negative, and
--    whether Unpaid should count at all. A blind UPDATE here would silently
--    zero several people's allowance.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Repoint reviewed_by
-- ---------------------------------------------------------------------------
-- Safe to drop and recreate: nothing writes this column, so no live data
-- depends on the old target. Verified below rather than assumed.
DO $$
DECLARE non_null_count integer;
BEGIN
  SELECT count(*) INTO non_null_count
    FROM workforce_leave_requests WHERE reviewed_by IS NOT NULL;
  IF non_null_count > 0 THEN
    RAISE EXCEPTION
      'reviewed_by holds % non-null admin_whitelist reference(s). Map them to workforce_employees before repointing this FK.',
      non_null_count;
  END IF;
END $$;

ALTER TABLE workforce_leave_requests
  DROP CONSTRAINT IF EXISTS workforce_leave_requests_reviewed_by_fkey;

ALTER TABLE workforce_leave_requests
  ADD CONSTRAINT workforce_leave_requests_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES workforce_employees(id) ON DELETE SET NULL;

COMMENT ON COLUMN workforce_leave_requests.reviewed_by IS
  'The workforce_employees row that approved or rejected this request. Previously referenced admin_whitelist (legacy) and was never written, so decisions carried no attribution.';

-- ---------------------------------------------------------------------------
-- 2. Decision note
-- ---------------------------------------------------------------------------
ALTER TABLE workforce_leave_requests
  ADD COLUMN IF NOT EXISTS decision_note text;

COMMENT ON COLUMN workforce_leave_requests.decision_note IS
  'Optional note from the approver explaining the decision. Visible to the employee on their own request. Distinct from `reason`, which is the employee''s own justification for asking.';

-- ---------------------------------------------------------------------------
-- 3. Extend the atomic decision function
-- ---------------------------------------------------------------------------
-- Same transaction guarantees as 20260801000005: the transition, the balance
-- adjustment, the attribution and the note all commit together or not at all.
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
  v_req   workforce_leave_requests%ROWTYPE;
  v_after integer;
BEGIN
  IF p_decision NOT IN ('Approved', 'Rejected') THEN
    RAISE EXCEPTION 'Decision must be Approved or Rejected, got %', p_decision
      USING ERRCODE = 'check_violation';
  END IF;

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

  -- EVERY leave type draws down the 28-day allowance, not just Annual. The
  -- previous rule deducted only for Annual, so months of approved Sick or
  -- Compassionate leave left the balance untouched. See the note on
  -- affectsBalance() in leave-calculation.ts, and the backfill caveat in the
  -- migration header.
  IF p_decision = 'Approved' THEN
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

COMMENT ON FUNCTION public.workforce_decide_leave_request(uuid, text, uuid, text) IS
  'Atomically transition a Pending leave request, adjust the Annual balance, and record the reviewer and their note. Authorisation is enforced in the application before this is invoked.';

-- The 3-argument signature is replaced by the 4-argument one. Drop it so the
-- old shape cannot be called with attribution silently omitted.
DROP FUNCTION IF EXISTS public.workforce_decide_leave_request(uuid, text, uuid);

-- SECURITY DEFINER + PostgREST would otherwise publish an unauthenticated
-- approval endpoint. Re-applied because the signature changed.
REVOKE EXECUTE ON FUNCTION public.workforce_decide_leave_request(uuid, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.workforce_decide_leave_request(uuid, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.workforce_decide_leave_request(uuid, text, uuid, text) FROM authenticated;

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
