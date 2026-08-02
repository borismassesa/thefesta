-- Leave, Scheduling and Employee Availability — schema.
--
-- WHAT THIS REPLACES
--
-- workforce_leave_requests (20260512000004) is a single table with a start
-- date, an end date, an integer `days`, and a `status`. workforce_employees
-- carries a `leave_balance_days` integer beside it. That shape cannot answer
-- the questions leave actually raises:
--
--   Where did this balance come from? It is one number somebody typed. There is
--   no accrual, no carryover, no expiry, and no way to see why it changed.
--   Correcting a mistake means overwriting the evidence of the mistake.
--
--   Can you take a half day? No. `days` is an integer over a date range.
--
--   Did two requests overlap? Nothing stops them.
--
--   Who may approve? Nothing checks.
--
-- Neither old table is dropped: /workforce/leave still reads them, and the
-- backfill copies rows forward rather than moving them.
--
-- THE CENTRAL DECISION: A LEDGER, NOT A NUMBER
--
-- leave_transactions is the source of truth. Every change to a balance is a
-- row: an opening balance, an accrual, a usage, a reversal, an adjustment, a
-- carryover, an expiry. leave_balances is a CACHE that
-- leave_reconcile_balance() recomputes by summing the ledger, and a test proves
-- the two agree.
--
-- This is why cancelling approved leave adds a reversal rather than deleting
-- the usage: the ledger says what happened, and a ledger you can delete from is
-- not a ledger. It is also why a manual adjustment demands a reason — an
-- unexplained entry in a balance history is worse than no history.

-- =============================================================================
-- leave_types — rows, not an enum
-- =============================================================================
-- Annual, Sick, Maternity, Paternity, Bereavement, Study, Unpaid, Compensatory
-- and anything else are ROWS. The same lesson as brands in the tracker: a new
-- leave type is an INSERT, not a migration, and Tanzanian labour law changing
-- its mind about a category should not need a deploy.
CREATE TABLE IF NOT EXISTS leave_types (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code text NOT NULL UNIQUE CHECK (length(btrim(code)) > 0),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text,

  -- Does taking it draw down a balance? Sick leave in many policies does not.
  is_balance_based boolean NOT NULL DEFAULT true,
  -- Does it reach payroll as paid time?
  is_paid boolean NOT NULL DEFAULT true,
  -- Requires a certificate, a court document, an admission letter.
  requires_document boolean NOT NULL DEFAULT false,
  -- Whether a fraction of a day is allowed at all. Maternity leave is not
  -- taken in half days.
  allows_partial_day boolean NOT NULL DEFAULT true,
  allows_hourly boolean NOT NULL DEFAULT false,

  colour text NOT NULL DEFAULT '#9FE870',
  sort_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- leave_policies — the rules for a type
-- =============================================================================
CREATE TABLE IF NOT EXISTS leave_policies (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  leave_type_id uuid NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),

  -- Entitlement, in days per leave year.
  annual_entitlement_days numeric(6,2) NOT NULL DEFAULT 0
    CHECK (annual_entitlement_days >= 0),
  -- 'upfront'  the whole entitlement lands on the first day of the leave year
  -- 'monthly'  a twelfth accrues each month
  -- 'none'     no accrual; the balance only moves by adjustment
  accrual_method text NOT NULL DEFAULT 'upfront'
    CHECK (accrual_method IN ('upfront', 'monthly', 'none')),
  -- Days of service before any of it can be taken.
  waiting_period_days integer NOT NULL DEFAULT 0 CHECK (waiting_period_days >= 0),

  -- Carryover into the next leave year, and when it dies. Unlimited carryover
  -- turns leave into a liability nobody planned for; zero carryover makes
  -- December a scramble. Both are policy, so both are configurable.
  max_carryover_days numeric(6,2) NOT NULL DEFAULT 0 CHECK (max_carryover_days >= 0),
  carryover_expires_after_months integer CHECK (carryover_expires_after_months IS NULL OR carryover_expires_after_months > 0),

  min_notice_days integer NOT NULL DEFAULT 0 CHECK (min_notice_days >= 0),
  max_consecutive_days integer CHECK (max_consecutive_days IS NULL OR max_consecutive_days > 0),
  -- May the balance go below zero? Some employers allow borrowing against next
  -- year; most do not.
  allow_negative_balance boolean NOT NULL DEFAULT false,

  -- Ordered approval steps: [{ step, approver }] where approver is one of
  -- direct_manager | department_lead | named_employee | role_holder | hr.
  -- Rules, not people, for the same reason report recipients are.
  approval_chain jsonb NOT NULL DEFAULT '[{"step":1,"approver":"direct_manager"}]'::jsonb,

  -- Does approved leave of this type suppress the daily tracker and the
  -- attendance missed-entry sweep? True for real absence; a policy could set it
  -- false for something like study leave taken alongside normal duties.
  suppresses_attendance boolean NOT NULL DEFAULT true,
  suppresses_tracker boolean NOT NULL DEFAULT true,
  -- Report obligations are suppressed only "where policy permits" — a monthly
  -- report is usually still owed after a week off, so this defaults to false.
  suppresses_reports boolean NOT NULL DEFAULT false,

  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leave_policies_type ON leave_policies (leave_type_id) WHERE is_active;

-- =============================================================================
-- leave_policy_assignments — who is governed by which policy
-- =============================================================================
CREATE TABLE IF NOT EXISTS leave_policy_assignments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id uuid NOT NULL REFERENCES leave_policies(id) ON DELETE CASCADE,

  assignee_type text NOT NULL
    CHECK (assignee_type IN ('employee', 'department', 'employment_type', 'everyone')),
  employee_id uuid REFERENCES workforce_employees(id) ON DELETE CASCADE,
  department text,
  employment_type text,

  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  -- More specific assignments win. An employee-level policy beats a
  -- department one, which beats 'everyone'.
  priority integer NOT NULL DEFAULT 100,

  assigned_by uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (
    (assignee_type = 'employee'        AND employee_id IS NOT NULL AND department IS NULL AND employment_type IS NULL) OR
    (assignee_type = 'department'      AND department IS NOT NULL AND employee_id IS NULL AND employment_type IS NULL) OR
    (assignee_type = 'employment_type' AND employment_type IS NOT NULL AND employee_id IS NULL AND department IS NULL) OR
    (assignee_type = 'everyone'        AND employee_id IS NULL AND department IS NULL AND employment_type IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_leave_policy_assignments_employee
  ON leave_policy_assignments (employee_id) WHERE is_active;

-- =============================================================================
-- leave_transactions — THE LEDGER
-- =============================================================================
-- Append-only. Every movement of every balance is a row here, and
-- leave_balances is derived from it. The kinds are deliberately explicit rather
-- than a signed number with a note: "why did I lose four days in January" must
-- be answerable from the row itself.
CREATE TABLE IF NOT EXISTS leave_transactions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id uuid NOT NULL REFERENCES workforce_employees(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  policy_id uuid REFERENCES leave_policies(id) ON DELETE SET NULL,
  -- Which leave year this belongs to, as its first day.
  leave_year_start date NOT NULL,

  kind text NOT NULL CHECK (kind IN (
    'opening_balance', 'accrual', 'usage', 'reversal',
    'adjustment', 'carryover', 'expiry'
  )),
  -- Positive credits the balance, negative debits it. Usage and expiry are
  -- negative; accrual, carryover and opening are positive; adjustment and
  -- reversal can be either.
  days numeric(7,3) NOT NULL CHECK (days <> 0),

  -- What caused it.
  request_id uuid,
  -- For a reversal: the transaction being reversed. Never null on a reversal,
  -- so "what did this undo" is answerable.
  reverses_transaction_id uuid REFERENCES leave_transactions(id) ON DELETE SET NULL,

  -- Required for adjustments and reversals. An unexplained entry in a balance
  -- history is worse than no history.
  reason text,
  actor_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  actor_clerk_id text,

  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),

  CHECK (kind <> 'adjustment' OR (reason IS NOT NULL AND length(btrim(reason)) > 0)),
  CHECK (kind <> 'reversal' OR (reason IS NOT NULL AND length(btrim(reason)) > 0)),
  CHECK (kind <> 'reversal' OR reverses_transaction_id IS NOT NULL),
  CHECK (kind NOT IN ('usage', 'expiry') OR days < 0),
  CHECK (kind NOT IN ('accrual', 'carryover', 'opening_balance') OR days > 0)
);

CREATE INDEX IF NOT EXISTS idx_leave_transactions_balance
  ON leave_transactions (employee_id, leave_type_id, leave_year_start);
CREATE INDEX IF NOT EXISTS idx_leave_transactions_request
  ON leave_transactions (request_id);

-- The ledger is append-only. Correcting a mistake means adding a reversal or an
-- adjustment, never editing the row that recorded it.
CREATE OR REPLACE FUNCTION public.leave_transactions_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'leave.ledger_immutable' USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_leave_transactions_append_only ON leave_transactions;
CREATE TRIGGER trg_leave_transactions_append_only
  BEFORE UPDATE OR DELETE ON leave_transactions
  FOR EACH ROW EXECUTE FUNCTION public.leave_transactions_append_only();

-- =============================================================================
-- leave_balances — a CACHE of the ledger
-- =============================================================================
-- Never authoritative. leave_reconcile_balance() recomputes every column here
-- by summing leave_transactions, and the verification suite proves the two
-- agree. It exists so the balance page is one indexed read instead of an
-- aggregate over a growing ledger.
CREATE TABLE IF NOT EXISTS leave_balances (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id uuid NOT NULL REFERENCES workforce_employees(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  leave_year_start date NOT NULL,
  leave_year_end date NOT NULL,

  opening_days numeric(7,3) NOT NULL DEFAULT 0,
  accrued_days numeric(7,3) NOT NULL DEFAULT 0,
  carryover_days numeric(7,3) NOT NULL DEFAULT 0,
  used_days numeric(7,3) NOT NULL DEFAULT 0,
  adjusted_days numeric(7,3) NOT NULL DEFAULT 0,
  expired_days numeric(7,3) NOT NULL DEFAULT 0,
  -- The sum of the ledger. Can be negative where the policy allows borrowing.
  balance_days numeric(7,3) NOT NULL DEFAULT 0,

  -- Days locked up by requests that are submitted or under review. NOT part of
  -- the ledger: nothing has been taken yet. Held separately so the employee can
  -- see "12 days, 3 pending" rather than discovering at approval time that the
  -- balance they were looking at was already spoken for.
  pending_days numeric(7,3) NOT NULL DEFAULT 0,

  reconciled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (employee_id, leave_type_id, leave_year_start)
);

CREATE INDEX IF NOT EXISTS idx_leave_balances_employee
  ON leave_balances (employee_id, leave_year_start DESC);

COMMENT ON TABLE leave_balances IS
  'CACHE of leave_transactions, rebuilt by leave_reconcile_balance(). Never edit these numbers directly: the ledger is the source of truth, and a hand-edited balance is a balance nobody can explain.';

-- =============================================================================
-- leave_requests
-- =============================================================================
CREATE TABLE IF NOT EXISTS leave_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id uuid NOT NULL REFERENCES workforce_employees(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
  policy_id uuid REFERENCES leave_policies(id) ON DELETE SET NULL,

  start_date date NOT NULL,
  end_date date NOT NULL,
  -- Working days actually consumed, summed from leave_request_days. Holidays
  -- and rest days inside the range contribute nothing, which is why this is
  -- computed rather than (end - start + 1).
  total_days numeric(7,3) NOT NULL DEFAULT 0 CHECK (total_days >= 0),

  state text NOT NULL DEFAULT 'draft' CHECK (state IN (
    'draft', 'submitted', 'under_review', 'approved',
    'rejected', 'returned', 'cancelled', 'withdrawn'
  )),

  reason text NOT NULL DEFAULT '',
  contact_during_leave text,

  -- Approval chain progress. The chain itself is snapshotted from the policy at
  -- submission, so editing a policy does not change what an in-flight request
  -- must clear.
  approval_chain jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_step integer NOT NULL DEFAULT 1,
  -- Append-only decision trail: [{ step, approver_id, decision, note, at }].
  approval_trail jsonb NOT NULL DEFAULT '[]'::jsonb,

  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  decision_note text,
  cancelled_at timestamptz,
  cancelled_by_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  cancellation_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee
  ON leave_requests (employee_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_leave_requests_state
  ON leave_requests (state, start_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_active_range
  ON leave_requests (employee_id, start_date, end_date)
  WHERE state IN ('submitted', 'under_review', 'approved');

-- =============================================================================
-- leave_request_days — one row per day, which is what makes partial days work
-- =============================================================================
-- A date range with an integer day count cannot express a half day, cannot skip
-- a public holiday in the middle, and cannot be checked for overlap against
-- another request's half day. One row per day can do all three.
CREATE TABLE IF NOT EXISTS leave_request_days (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id uuid NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  -- Denormalised so the overlap check and the suppression lookup are one
  -- indexed read rather than a join through the request.
  employee_id uuid NOT NULL REFERENCES workforce_employees(id) ON DELETE CASCADE,
  leave_date date NOT NULL,

  portion text NOT NULL DEFAULT 'full'
    CHECK (portion IN ('full', 'half_am', 'half_pm', 'hours')),
  hours numeric(4,2) CHECK (hours IS NULL OR (hours > 0 AND hours <= 24)),
  -- The fraction of a working day this consumes. 1.0 for a full day, 0.5 for a
  -- half, hours/standard for hourly. The overlap guard sums this.
  day_fraction numeric(4,3) NOT NULL DEFAULT 1
    CHECK (day_fraction > 0 AND day_fraction <= 1),

  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (request_id, leave_date, portion),
  CHECK (portion <> 'hours' OR hours IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_leave_request_days_lookup
  ON leave_request_days (employee_id, leave_date);

-- THE OVERLAP GUARD.
--
-- A partial unique index cannot express "a full day conflicts with a half day
-- but two halves are fine", so the rule is enforced as a trigger that sums the
-- fractions already committed for that employee on that date across every
-- ACTIVE request. Rejected, cancelled and withdrawn requests free their days
-- again, which is what makes cancelling useful.
CREATE OR REPLACE FUNCTION public.leave_request_days_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_committed numeric(6,3);
  v_state     text;
BEGIN
  SELECT state INTO v_state FROM leave_requests WHERE id = NEW.request_id;
  -- A draft reserves nothing. People build drafts for dates they may never
  -- take, and blocking on them would make the calendar unusable.
  IF v_state IS NULL OR v_state = 'draft' THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(d.day_fraction), 0) INTO v_committed
  FROM leave_request_days d
  JOIN leave_requests r ON r.id = d.request_id
  WHERE d.employee_id = NEW.employee_id
    AND d.leave_date = NEW.leave_date
    AND d.id <> NEW.id
    AND r.state IN ('submitted', 'under_review', 'approved');

  IF v_committed + NEW.day_fraction > 1.0001 THEN
    RAISE EXCEPTION 'leave.overlapping_request' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leave_request_days_no_overlap ON leave_request_days;
CREATE TRIGGER trg_leave_request_days_no_overlap
  BEFORE INSERT OR UPDATE ON leave_request_days
  FOR EACH ROW EXECUTE FUNCTION public.leave_request_days_no_overlap();

-- =============================================================================
-- leave_documents
-- =============================================================================
CREATE TABLE IF NOT EXISTS leave_documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id uuid NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES workforce_employees(id) ON DELETE CASCADE,

  file_name text NOT NULL CHECK (length(btrim(file_name)) > 0),
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  document_type text NOT NULL DEFAULT 'supporting'
    CHECK (document_type IN ('supporting', 'medical_certificate', 'court_document', 'admission_letter', 'other')),

  uploaded_by uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leave_documents_request ON leave_documents (request_id);

-- =============================================================================
-- employee_availability — the derived calendar
-- =============================================================================
-- One row per employee per date, saying whether they are available and why not.
-- Rebuilt from approved leave, the work schedule and the holiday calendar, so
-- "who is in on Thursday" is one indexed read rather than a join across three
-- modules for every person on the team.
CREATE TABLE IF NOT EXISTS employee_availability (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id uuid NOT NULL REFERENCES workforce_employees(id) ON DELETE CASCADE,
  availability_date date NOT NULL,

  status text NOT NULL DEFAULT 'available' CHECK (status IN (
    'available', 'on_leave', 'partial_leave', 'public_holiday', 'rest_day', 'not_employed'
  )),
  -- 1.0 available all day, 0.5 for a half day of leave, 0 for none.
  available_fraction numeric(4,3) NOT NULL DEFAULT 1
    CHECK (available_fraction >= 0 AND available_fraction <= 1),

  leave_type_id uuid REFERENCES leave_types(id) ON DELETE SET NULL,
  leave_request_id uuid REFERENCES leave_requests(id) ON DELETE SET NULL,
  note text,

  computed_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (employee_id, availability_date)
);

CREATE INDEX IF NOT EXISTS idx_employee_availability_date
  ON employee_availability (availability_date, status);

-- =============================================================================
-- holiday_calendars — already created by the attendance module
-- =============================================================================
-- 20260802140000_attendance_schema.sql created it, and the attendance and
-- tracker modules already read it. Extended here rather than duplicated: two
-- holiday tables would be two answers to "is the office open".
ALTER TABLE holiday_calendars
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS observed_date date,
  ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN holiday_calendars.observed_date IS
  'When the holiday is actually taken, if different from the date it commemorates (a Sunday holiday observed on the Monday).';

-- =============================================================================
-- Foreign key from transactions to requests
-- =============================================================================
ALTER TABLE leave_transactions
  DROP CONSTRAINT IF EXISTS leave_transactions_request_id_fkey;
ALTER TABLE leave_transactions
  -- SET NULL, not CASCADE: deleting a request must never erase the ledger
  -- entries that recorded its effect on somebody's balance.
  ADD CONSTRAINT leave_transactions_request_id_fkey
  FOREIGN KEY (request_id) REFERENCES leave_requests(id) ON DELETE SET NULL;

-- =============================================================================
-- updated_at
-- =============================================================================
CREATE OR REPLACE FUNCTION public.leave_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'leave_types', 'leave_policies', 'leave_policy_assignments',
    'leave_balances', 'leave_requests'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.leave_touch_updated_at()', t, t);
  END LOOP;
END
$$;

-- =============================================================================
-- Access control
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'leave_types', 'leave_policies', 'leave_policy_assignments',
    'leave_balances', 'leave_transactions', 'leave_requests',
    'leave_request_days', 'leave_documents', 'employee_availability'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION public.leave_transactions_append_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.leave_request_days_no_overlap() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.leave_touch_updated_at() FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE leave_transactions IS
  'THE LEDGER. Append-only; leave_balances is derived from it by leave_reconcile_balance(). Cancelling approved leave adds a reversal rather than deleting the usage, because a ledger you can delete from is not a ledger. SERVICE ROLE ONLY.';

NOTIFY pgrst, 'reload schema';
