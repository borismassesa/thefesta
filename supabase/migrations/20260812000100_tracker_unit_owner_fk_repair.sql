-- Repair tracker brand backfill owner selection.
--
-- 20260802180200 already ran in hosted environments with
-- COALESCE(md_employee_ids[1], acting_md_employee_id). Historical engine rows
-- can retain employee IDs after the employee was removed; that FK miss aborts
-- the entire guarded DO block, so brands never import.
--
-- Editing the already-applied migration does not re-run it. This forward
-- migration re-imports missing brands and fills null owners using only
-- employee IDs that still exist.

DO $$
DECLARE
  v_imported integer := 0;
  v_owners_fixed integer := 0;
BEGIN
  IF to_regclass('public.md_tracker_engines') IS NULL THEN
    RAISE NOTICE 'tracker repair: md_tracker_engines absent, skipping';
    RETURN;
  END IF;

  IF to_regclass('public.tracking_units') IS NULL THEN
    RAISE NOTICE 'tracker repair: tracking_units absent, skipping';
    RETURN;
  END IF;

  -- Brands that never landed because the original backfill aborted on FK.
  INSERT INTO tracking_units (kind, slug, name, owner_employee_id, sort_order, metadata)
  SELECT
    'brand',
    e.slug,
    e.name,
    (
      SELECT candidate.employee_id
      FROM unnest(
        COALESCE(e.md_employee_ids, '{}'::uuid[])
        || ARRAY[e.acting_md_employee_id]
      ) WITH ORDINALITY AS candidate(employee_id, priority)
      JOIN workforce_employees employee
        ON employee.id = candidate.employee_id
      ORDER BY candidate.priority
      LIMIT 1
    ),
    e.sort_order,
    jsonb_build_object('imported_from', 'md_tracker_engines', 'engine_id', e.id)
  FROM md_tracker_engines e
  ON CONFLICT (slug) DO NOTHING;

  GET DIAGNOSTICS v_imported = ROW_COUNT;

  -- Brands that imported with a null owner (or were created empty) get the
  -- first still-existing MD / acting MD from the legacy engine row.
  UPDATE tracking_units u
  SET owner_employee_id = resolved.employee_id
  FROM md_tracker_engines e
  CROSS JOIN LATERAL (
    SELECT candidate.employee_id
    FROM unnest(
      COALESCE(e.md_employee_ids, '{}'::uuid[])
      || ARRAY[e.acting_md_employee_id]
    ) WITH ORDINALITY AS candidate(employee_id, priority)
    JOIN workforce_employees employee
      ON employee.id = candidate.employee_id
    ORDER BY candidate.priority
    LIMIT 1
  ) resolved
  WHERE u.kind = 'brand'
    AND u.slug = e.slug
    AND u.owner_employee_id IS NULL
    AND resolved.employee_id IS NOT NULL;

  GET DIAGNOSTICS v_owners_fixed = ROW_COUNT;

  RAISE NOTICE 'tracker repair: imported % brand unit(s), filled % null owner(s)',
    v_imported, v_owners_fixed;
END
$$;

-- Owner assignments for brands that now have a resolvable owner.
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
