-- Daily Tracker — seed and backfill.
--
-- Brings md_tracker forward without moving it: its engines become tracking_units
-- of kind 'brand', and its entries stay where they are so
-- /workforce/daily-tracker keeps working.
--
-- Idempotent throughout: every insert is guarded by ON CONFLICT or NOT EXISTS.

-- =============================================================================
-- 1. The default daily cycle
-- =============================================================================
-- Without a cycle nothing generates, so the module ships with one rather than
-- requiring setup before it does anything. 18:00 EAT with an hour's grace
-- matches the working day the attendance module already seeds.
INSERT INTO tracking_cycles (slug, name, cadence, deadline_time, grace_minutes, schedule_id)
SELECT 'daily-execution', 'Daily execution tracker', 'daily', '18:00', 60, s.id
FROM work_schedules s
WHERE s.is_default
ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- 2. md_tracker engines -> brand units
-- =============================================================================
-- THE POINT OF THIS MODULE'S DESIGN, demonstrated: OpusFesta, OpusPass and
-- OpusStudio arrive as ROWS read out of another table. No brand name appears in
-- any migration, any CHECK constraint, or any line of application code.
DO $$
DECLARE
  v_count integer := 0;
BEGIN
  IF to_regclass('public.md_tracker_engines') IS NULL THEN
    RAISE NOTICE 'tracker: md_tracker_engines absent, skipping brand import';
    RETURN;
  END IF;

  INSERT INTO tracking_units (kind, slug, name, owner_employee_id, sort_order, metadata)
  SELECT
    'brand',
    e.slug,
    e.name,
    -- The legacy tracker moved from one md_employee_id to an ordered
    -- md_employee_ids array in 20260701000007. Keep the first permanent MD as
    -- the stable owner, falling back to the acting MD only when none is set.
    COALESCE(e.md_employee_ids[1], e.acting_md_employee_id),
    e.sort_order,
    jsonb_build_object('imported_from', 'md_tracker_engines', 'engine_id', e.id)
  FROM md_tracker_engines e
  ON CONFLICT (slug) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'tracker: imported % brand unit(s)', v_count;
END
$$;

-- Each imported brand gets its MD as the owner assignment, so the people who
-- were already filling in the MD tracker keep their responsibility rather than
-- having to be re-assigned by hand.
INSERT INTO tracking_assignments (cycle_id, unit_id, employee_id, role, effective_from, note)
SELECT c.id, u.id, u.owner_employee_id, 'owner', CURRENT_DATE,
       'Imported from md_tracker engine ownership.'
FROM tracking_units u
CROSS JOIN tracking_cycles c
WHERE u.kind = 'brand'
  AND u.owner_employee_id IS NOT NULL
  AND c.slug = 'daily-execution'
  AND NOT EXISTS (
    SELECT 1 FROM tracking_assignments a
    WHERE a.cycle_id = c.id AND a.unit_id = u.id AND a.role = 'owner'
  );

-- =============================================================================
-- 3. Department units
-- =============================================================================
-- One unit per department that actually has employees. Derived rather than
-- listed, so the nine canonical departments are not written down a second time
-- where they can drift from the CHECK constraint that defines them.
INSERT INTO tracking_units (kind, slug, name, department, sort_order)
SELECT DISTINCT
  'department',
  'dept-' || regexp_replace(lower(e.department), '[^a-z0-9]+', '-', 'g'),
  e.department,
  e.department,
  200
FROM workforce_employees e
WHERE e.department IS NOT NULL
  AND e.status IN ('Active', 'On Leave', 'Onboarding')
ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- 4. Employee units for people who already track daily
-- =============================================================================
-- Deliberately NOT every employee. Creating a unit and an assignment for the
-- whole company would start generating a daily obligation for everyone the
-- moment this migration lands, which is a decision for People Ops to make
-- deliberately rather than a side effect of a schema change.
--
-- Only the MDs already using the tracker get one, matching who is already
-- expected to file.
INSERT INTO tracking_units (kind, slug, name, employee_id, owner_employee_id, sort_order)
SELECT DISTINCT
  'employee',
  'emp-' || e.employee_code,
  e.full_name,
  e.id,
  e.id,
  300
FROM workforce_employees e
WHERE e.status IN ('Active', 'On Leave', 'Onboarding')
  AND EXISTS (
    SELECT 1 FROM tracking_units u WHERE u.kind = 'brand' AND u.owner_employee_id = e.id
  )
ON CONFLICT (slug) DO NOTHING;

NOTIFY pgrst, 'reload schema';
