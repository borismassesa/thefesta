CREATE TABLE IF NOT EXISTS public.workforce_leave_policies (
  leave_type text PRIMARY KEY,
  label text NOT NULL CHECK (btrim(label) <> ''),
  counts_against_annual_balance boolean NOT NULL DEFAULT false,
  annual_entitlement_days integer CHECK (annual_entitlement_days IS NULL OR annual_entitlement_days > 0),
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (counts_against_annual_balance = true AND annual_entitlement_days IS NOT NULL)
    OR
    (counts_against_annual_balance = false)
  )
);

DROP TRIGGER IF EXISTS trg_workforce_leave_policies_updated_at ON public.workforce_leave_policies;
CREATE TRIGGER trg_workforce_leave_policies_updated_at
  BEFORE UPDATE ON public.workforce_leave_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.workforce_leave_policies ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.workforce_leave_policies
  TO authenticated;

GRANT ALL
  ON TABLE public.workforce_leave_policies
  TO service_role;

DROP POLICY IF EXISTS "workforce_leave_policies_read" ON public.workforce_leave_policies;
CREATE POLICY "workforce_leave_policies_read"
  ON public.workforce_leave_policies
  FOR SELECT
  TO authenticated
  USING (is_workforce_reader());

DROP POLICY IF EXISTS "workforce_leave_policies_write" ON public.workforce_leave_policies;
CREATE POLICY "workforce_leave_policies_write"
  ON public.workforce_leave_policies
  FOR ALL
  TO authenticated
  USING (is_workforce_admin())
  WITH CHECK (is_workforce_admin());

INSERT INTO public.workforce_leave_policies (
  leave_type,
  label,
  counts_against_annual_balance,
  annual_entitlement_days,
  active,
  display_order
)
VALUES
  ('Annual', 'Annual leave', true, 28, true, 10),
  ('Sick', 'Sick leave', false, NULL, true, 20),
  ('Maternity', 'Maternity leave', false, NULL, true, 30),
  ('Paternity', 'Paternity leave', false, NULL, true, 40),
  ('Compassionate', 'Compassionate leave', false, NULL, true, 50),
  ('Emergency', 'Emergency leave', false, NULL, true, 60),
  ('Study', 'Study leave', false, NULL, true, 70),
  ('Unpaid', 'Unpaid leave', false, NULL, true, 80)
ON CONFLICT (leave_type) DO UPDATE
SET
  label = EXCLUDED.label,
  counts_against_annual_balance = EXCLUDED.counts_against_annual_balance,
  annual_entitlement_days = EXCLUDED.annual_entitlement_days,
  active = EXCLUDED.active,
  display_order = EXCLUDED.display_order,
  updated_at = now();

ALTER TABLE public.workforce_leave_requests
  DROP CONSTRAINT IF EXISTS workforce_leave_requests_leave_type_check;

ALTER TABLE public.workforce_leave_requests
  DROP CONSTRAINT IF EXISTS workforce_leave_requests_leave_type_fkey;

ALTER TABLE public.workforce_leave_requests
  ADD CONSTRAINT workforce_leave_requests_leave_type_fkey
  FOREIGN KEY (leave_type)
  REFERENCES public.workforce_leave_policies (leave_type)
  ON UPDATE CASCADE
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE public.workforce_leave_requests
  VALIDATE CONSTRAINT workforce_leave_requests_leave_type_fkey;

ALTER TABLE public.workforce_employees
  ALTER COLUMN leave_balance_days SET DEFAULT 28;

UPDATE public.workforce_employees e
SET leave_balance_days = 28
WHERE e.leave_balance_days = 0
  AND e.status <> 'Resigned'
  AND NOT EXISTS (
    SELECT 1
    FROM public.workforce_leave_requests r
    JOIN public.workforce_leave_policies p ON p.leave_type = r.leave_type
    WHERE r.employee_id = e.id
      AND r.status = 'Approved'
      AND p.counts_against_annual_balance = true
  );

COMMENT ON TABLE public.workforce_leave_policies IS
  'Configurable Workforce leave types and annual balance policy.';

COMMENT ON COLUMN public.workforce_leave_policies.counts_against_annual_balance IS
  'When true, approved requests of this type consume the annual leave allowance.';

COMMENT ON COLUMN public.workforce_leave_policies.annual_entitlement_days IS
  'Annual allowance for leave policies that consume the annual balance. OpusFesta currently uses 28 days.';

NOTIFY pgrst, 'reload schema';
