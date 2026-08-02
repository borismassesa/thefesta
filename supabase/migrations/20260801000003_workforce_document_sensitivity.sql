-- =============================================================================
-- PR A — Employee document sensitivity classes
-- =============================================================================
-- Implements section 3.4 of docs/WORKSPACE_WORKFORCE_ARCHITECTURE.md.
--
-- Document access becomes a TWO-FACTOR decision:
--   the permission key says WHETHER you can read documents at all,
--   the sensitivity class says WHICH ones.
--
-- Splitting documents out of workforce.employees.read matters because a
-- manager who can see a profile must not automatically see salary letters,
-- medical notes, disciplinary records, identity documents or bank details.
--
-- Policy lives in lib/workforce/documents.ts (pure, unit-tested). This
-- migration only adds the column the policy reads.
-- =============================================================================

ALTER TABLE workforce_employee_documents
  ADD COLUMN IF NOT EXISTS sensitivity text NOT NULL
    DEFAULT 'people_ops_confidential';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'workforce_employee_documents_sensitivity_check'
  ) THEN
    ALTER TABLE workforce_employee_documents
      ADD CONSTRAINT workforce_employee_documents_sensitivity_check
      CHECK (sensitivity IN (
        'shared_with_employee',
        'manager_confidential',
        'people_ops_confidential',
        'payroll_confidential',
        'legal_confidential',
        'restricted'
      ));
  END IF;
END $$;

COMMENT ON COLUMN workforce_employee_documents.sensitivity IS
  'Who may read this document. Named for the AUDIENCE, not the subject: shared_with_employee is readable by the employee, their direct manager and People Ops. Existing rows default to people_ops_confidential so this migration can never WIDEN access; reclassification is a deliberate, audited People Ops action.';

-- Partial index for the Workspace Documents surface, which reads exactly one
-- class for exactly one employee.
CREATE INDEX IF NOT EXISTS idx_workforce_employee_documents_shared
  ON workforce_employee_documents (employee_id)
  WHERE sensitivity = 'shared_with_employee';

-- Verification: the default must not have widened anything. Every pre-existing
-- row should be people_ops_confidential, i.e. visible to nobody who could not
-- already see it.
DO $$
DECLARE leaked integer;
BEGIN
  SELECT count(*) INTO leaked
    FROM workforce_employee_documents
   WHERE sensitivity NOT IN (
     'shared_with_employee', 'manager_confidential', 'people_ops_confidential',
     'payroll_confidential', 'legal_confidential', 'restricted'
   );
  IF leaked > 0 THEN
    RAISE EXCEPTION 'Document sensitivity backfill left % row(s) in an invalid class', leaked;
  END IF;
  RAISE NOTICE
    'Document sensitivity applied. Existing rows default to people_ops_confidential; People Ops must reclassify before Workspace Documents (Phase 6) shows anything to employees.';
END $$;

NOTIFY pgrst, 'reload schema';
