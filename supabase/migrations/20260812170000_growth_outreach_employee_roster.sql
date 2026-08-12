-- Growth Tracker — link Vendor Outreach roster to real employees.
--
-- The Excel sheet seeded aspirational names (Marketing Person 3, Studio Lead).
-- Production Admin should track living workforce_employees instead, with the
-- same target rules: Marketing carries the heavy load; everyone else owns
-- 5 signed vendors / month.

ALTER TABLE public.growth_vendor_outreach_targets
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_growth_outreach_target_employee
  ON public.growth_vendor_outreach_targets (employee_id)
  WHERE employee_id IS NOT NULL;

COMMENT ON COLUMN public.growth_vendor_outreach_targets.employee_id IS
  'Optional link to workforce_employees. When set, staff_name is kept as a display snapshot.';

-- Match existing roster rows to employees by exact full_name (case-insensitive).
UPDATE public.growth_vendor_outreach_targets t
   SET employee_id = e.id,
       staff_name = e.full_name,
       department = COALESCE(NULLIF(btrim(e.department), ''), t.department),
       updated_at = now()
  FROM public.workforce_employees e
 WHERE t.employee_id IS NULL
   AND lower(btrim(t.staff_name)) = lower(btrim(e.full_name))
   AND e.status IN ('Active', 'On Leave', 'Onboarding');

-- Fuzzy match for known sheet ↔ employee spelling differences.
UPDATE public.growth_vendor_outreach_targets t
   SET employee_id = e.id,
       staff_name = e.full_name,
       department = COALESCE(NULLIF(btrim(e.department), ''), t.department),
       updated_at = now()
  FROM public.workforce_employees e
 WHERE t.employee_id IS NULL
   AND e.status IN ('Active', 'On Leave', 'Onboarding')
   AND (
     (lower(t.staff_name) LIKE 'varsity%' AND lower(e.full_name) LIKE 'varsity%')
     OR (lower(t.staff_name) = 'finance' AND lower(e.department) LIKE 'finance%')
   );

-- Remove remaining aspirational placeholders that never matched a real person.
DELETE FROM public.growth_vendor_outreach_targets
 WHERE employee_id IS NULL
   AND (
     staff_name ILIKE 'Marketing Person%'
     OR staff_name ILIKE 'Wedding Planner%'
     OR staff_name ILIKE 'Studio Lead%'
     OR staff_name ILIKE 'Studio Asst%'
     OR staff_name IN ('CEO', 'Finance', 'Edith Kibavu')
   );

-- Ensure every active employee has a vendor outreach target row.
INSERT INTO public.growth_vendor_outreach_targets (
  staff_name,
  department,
  employee_id,
  target_outreach,
  target_meetings,
  target_signed,
  sort_order
)
SELECT
  e.full_name,
  COALESCE(NULLIF(btrim(e.department), ''), 'Unassigned'),
  e.id,
  CASE
    WHEN lower(COALESCE(e.department, '')) LIKE '%marketing%'
      OR lower(COALESCE(e.department, '')) LIKE '%content%'
      OR lower(COALESCE(e.department, '')) LIKE '%brand%'
      OR lower(COALESCE(e.department, '')) LIKE '%social%'
    THEN 25 ELSE 15
  END,
  CASE
    WHEN lower(COALESCE(e.department, '')) LIKE '%marketing%'
      OR lower(COALESCE(e.department, '')) LIKE '%content%'
      OR lower(COALESCE(e.department, '')) LIKE '%brand%'
      OR lower(COALESCE(e.department, '')) LIKE '%social%'
    THEN 14 ELSE 8
  END,
  CASE
    WHEN lower(COALESCE(e.department, '')) LIKE '%marketing%'
      OR lower(COALESCE(e.department, '')) LIKE '%content%'
      OR lower(COALESCE(e.department, '')) LIKE '%brand%'
      OR lower(COALESCE(e.department, '')) LIKE '%social%'
    THEN 8 ELSE 5
  END,
  100 + ROW_NUMBER() OVER (ORDER BY e.full_name)
FROM public.workforce_employees e
WHERE e.status IN ('Active', 'On Leave', 'Onboarding')
  AND NOT EXISTS (
    SELECT 1
    FROM public.growth_vendor_outreach_targets t
    WHERE t.employee_id = e.id
  );

-- Refresh targets/department snapshot for linked rows (keep sort_order).
UPDATE public.growth_vendor_outreach_targets t
   SET staff_name = e.full_name,
       department = COALESCE(NULLIF(btrim(e.department), ''), t.department),
       target_outreach = CASE
         WHEN lower(COALESCE(e.department, '')) LIKE '%marketing%'
           OR lower(COALESCE(e.department, '')) LIKE '%content%'
           OR lower(COALESCE(e.department, '')) LIKE '%brand%'
           OR lower(COALESCE(e.department, '')) LIKE '%social%'
         THEN 25 ELSE 15
       END,
       target_meetings = CASE
         WHEN lower(COALESCE(e.department, '')) LIKE '%marketing%'
           OR lower(COALESCE(e.department, '')) LIKE '%content%'
           OR lower(COALESCE(e.department, '')) LIKE '%brand%'
           OR lower(COALESCE(e.department, '')) LIKE '%social%'
         THEN 14 ELSE 8
       END,
       target_signed = CASE
         WHEN lower(COALESCE(e.department, '')) LIKE '%marketing%'
           OR lower(COALESCE(e.department, '')) LIKE '%content%'
           OR lower(COALESCE(e.department, '')) LIKE '%brand%'
           OR lower(COALESCE(e.department, '')) LIKE '%social%'
         THEN 8 ELSE 5
       END,
       updated_at = now()
  FROM public.workforce_employees e
 WHERE t.employee_id = e.id;

NOTIFY pgrst, 'reload schema';
