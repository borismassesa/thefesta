-- Daily Tracker is for Managing Directors only.
--
-- Rolls back the company-wide employee provisioning from
-- 20260812150000_tracker_department_task_provision.sql. Personal owner
-- assignments stay only for MDs (brand owners / md_tracker_engines). Everyone
-- else loses the auto-provisioned daily obligation.
--
-- Product rule: an MD's tracker follows their brand, their department, and the
-- tasks assigned to them and their people.

-- =============================================================================
-- 1. Who counts as a Managing Director
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tracker_is_managing_director(p_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM md_tracker_engines eng
    WHERE p_employee_id = ANY (COALESCE(eng.md_employee_ids, '{}'::uuid[]))
       OR eng.acting_md_employee_id = p_employee_id
  )
  OR EXISTS (
    SELECT 1
    FROM tracking_units u
    WHERE u.kind = 'brand'
      AND u.is_active
      AND u.owner_employee_id = p_employee_id
  )
  OR EXISTS (
    SELECT 1
    FROM tracking_assignments a
    JOIN tracking_units u ON u.id = a.unit_id
    WHERE a.employee_id = p_employee_id
      AND a.is_active
      AND a.role = 'owner'
      AND u.kind = 'brand'
      AND u.is_active
  );
$$;

COMMENT ON FUNCTION public.tracker_is_managing_director(uuid) IS
  'True when the employee is an MD or acting MD on a brand engine / brand tracking unit.';

-- =============================================================================
-- 2. Sync brand owner assignments from md_tracker_engines
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tracker_ensure_md_brand_assignments(p_employee_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cycle_id uuid;
  v_count    integer := 0;
  r          record;
BEGIN
  SELECT id INTO v_cycle_id
  FROM tracking_cycles
  WHERE slug = 'daily-execution' AND is_active;
  IF v_cycle_id IS NULL THEN
    RAISE EXCEPTION 'tracker.cycle_missing' USING ERRCODE = 'P0001';
  END IF;

  FOR r IN
    SELECT DISTINCT
      u.id AS unit_id,
      md_id AS employee_id,
      eng.name AS engine_name
    FROM md_tracker_engines eng
    JOIN tracking_units u
      ON u.slug = eng.slug AND u.kind = 'brand' AND u.is_active
    CROSS JOIN LATERAL unnest(
      COALESCE(eng.md_employee_ids, '{}'::uuid[])
      || CASE
           WHEN eng.acting_md_employee_id IS NOT NULL
           THEN ARRAY[eng.acting_md_employee_id]
           ELSE '{}'::uuid[]
         END
    ) AS md_id
    JOIN workforce_employees we
      ON we.id = md_id
     AND we.status IN ('Active', 'On Leave', 'Onboarding')
    WHERE md_id IS NOT NULL
      AND (p_employee_id IS NULL OR md_id = p_employee_id)
  LOOP
    -- Keep brand ownership pointer current.
    UPDATE tracking_units
       SET owner_employee_id = COALESCE(owner_employee_id, r.employee_id),
           updated_at = now()
     WHERE id = r.unit_id
       AND owner_employee_id IS DISTINCT FROM r.employee_id
       AND owner_employee_id IS NULL;

    IF NOT EXISTS (
      SELECT 1
      FROM tracking_assignments a
      WHERE a.cycle_id = v_cycle_id
        AND a.unit_id = r.unit_id
        AND a.employee_id = r.employee_id
        AND a.role = 'owner'
        AND a.is_active
    ) THEN
      INSERT INTO tracking_assignments (
        cycle_id, unit_id, employee_id, role, effective_from, note
      ) VALUES (
        v_cycle_id, r.unit_id, r.employee_id, 'owner', CURRENT_DATE,
        'Managing Director for ' || r.engine_name || '.'
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.tracker_ensure_md_brand_assignments(uuid) IS
  'Ensures each brand MD / acting MD has an active owner assignment on the matching brand tracking unit.';

-- =============================================================================
-- 3. Replace employee-unit ensure: MD brand sync only (no company-wide units)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tracker_ensure_employee_unit(p_employee_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_unit_id uuid;
BEGIN
  IF NOT tracker_is_managing_director(p_employee_id) THEN
    RETURN NULL;
  END IF;

  PERFORM tracker_ensure_md_brand_assignments(p_employee_id);

  SELECT u.id INTO v_unit_id
  FROM tracking_assignments a
  JOIN tracking_units u ON u.id = a.unit_id
  WHERE a.employee_id = p_employee_id
    AND a.is_active
    AND a.role = 'owner'
    AND u.kind = 'brand'
    AND u.is_active
  ORDER BY u.sort_order, u.name
  LIMIT 1;

  RETURN v_unit_id;
END;
$$;

COMMENT ON FUNCTION public.tracker_ensure_employee_unit(uuid) IS
  'MD-only: syncs brand owner assignments for a Managing Director. Returns their primary brand unit id.';

-- =============================================================================
-- 4. Today entry — MD owner units only
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tracker_ensure_today_entry(p_employee_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  a          record;
  v_date     date := (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date;
  v_schedule uuid;
  v_day      record;
  v_deadline timestamptz;
  v_created  integer := 0;
  v_entry    uuid;
BEGIN
  IF NOT tracker_is_managing_director(p_employee_id) THEN
    RETURN 0;
  END IF;

  PERFORM tracker_ensure_md_brand_assignments(p_employee_id);

  FOR a IN
    SELECT ta.id AS assignment_id, ta.cycle_id, ta.unit_id, ta.employee_id
    FROM tracking_assignments ta
    JOIN tracking_cycles c ON c.id = ta.cycle_id
    JOIN tracking_units u ON u.id = ta.unit_id
    WHERE ta.employee_id = p_employee_id
      AND ta.is_active
      AND ta.role = 'owner'
      AND c.is_active
      AND c.cadence = 'daily'
      AND u.is_active
      AND u.kind = 'brand'
      AND ta.effective_from <= v_date
      AND (ta.effective_to IS NULL OR ta.effective_to >= v_date)
  LOOP
    v_schedule := tracker_resolve_schedule(a.unit_id, a.cycle_id);
    SELECT * INTO v_day FROM tracker_day_state(a.employee_id, v_schedule, v_date);
    v_deadline := tracker_deadline_at(a.cycle_id, v_schedule, v_date);

    INSERT INTO tracker_entries (
      cycle_id, unit_id, assignment_id, employee_id, entry_date,
      status, suppression_reason, deadline_at
    ) VALUES (
      a.cycle_id, a.unit_id, a.assignment_id, a.employee_id, v_date,
      CASE WHEN v_day.is_working THEN 'not_started' ELSE 'not_working_day' END,
      v_day.reason,
      CASE WHEN v_day.is_working THEN v_deadline ELSE NULL END
    )
    ON CONFLICT (cycle_id, unit_id, entry_date) DO NOTHING
    RETURNING id INTO v_entry;

    IF v_entry IS NOT NULL THEN
      v_created := v_created + 1;
      IF v_day.is_working THEN
        PERFORM tracker_prefill_entry(v_entry);
      END IF;
    END IF;
    v_entry := NULL;
  END LOOP;

  RETURN v_created;
END;
$$;

-- =============================================================================
-- 5. Trigger — only MDs
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tracker_employees_provision_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IN ('Active', 'On Leave', 'Onboarding')
     AND tracker_is_managing_director(NEW.id) THEN
    PERFORM tracker_ensure_employee_unit(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- =============================================================================
-- 6. Prefill — MD brand day includes own + department / report tasks
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tracker_prefill_entry(p_entry_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  e            tracker_entries%ROWTYPE;
  c            tracking_cycles%ROWTYPE;
  u            tracking_units%ROWTYPE;
  md           workforce_employees%ROWTYPE;
  t            record;
  v_count      integer := 0;
  v_minutes    integer := 0;
  v_prefill    jsonb := '{}'::jsonb;
  v_sources    jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO e FROM tracker_entries WHERE id = p_entry_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT * INTO c FROM tracking_cycles WHERE id = e.cycle_id;
  IF NOT COALESCE(c.prefill_enabled, true) THEN RETURN 0; END IF;
  SELECT * INTO u FROM tracking_units WHERE id = e.unit_id;
  SELECT * INTO md FROM workforce_employees WHERE id = e.employee_id;

  -- People whose assigned tasks belong on this MD day: the MD, direct reports,
  -- and (for brand units) colleagues in the MD's department.
  FOR t IN
    SELECT tk.id, tk.title, tk.due_date, tk.status, tk.blocker_reason, we.full_name AS who
    FROM tasks tk
    JOIN task_assignments ta
      ON ta.task_id = tk.id
     AND ta.unassigned_at IS NULL
     AND ta.role IN ('assignee', 'collaborator')
    JOIN workforce_employees we ON we.id = ta.employee_id
    WHERE tk.status IN ('planned', 'in_progress', 'blocked', 'in_review', 'completed')
      AND (
        ta.employee_id = e.employee_id
        OR we.manager_id = e.employee_id
        OR (
          u.kind = 'brand'
          AND md.department IS NOT NULL
          AND we.department = md.department
          AND we.status IN ('Active', 'On Leave', 'Onboarding')
        )
      )
      AND (
        (tk.status = 'completed'
          AND tk.completed_at IS NOT NULL
          AND (tk.completed_at AT TIME ZONE 'Africa/Dar_es_Salaam')::date = e.entry_date)
        OR (
          tk.status IN ('planned', 'in_progress', 'blocked', 'in_review')
          AND (
            tk.due_date IS NULL
            OR tk.due_date <= e.entry_date
            OR tk.status IN ('in_progress', 'blocked')
          )
        )
      )
    ORDER BY
      CASE WHEN tk.status = 'blocked' THEN 0
           WHEN tk.status = 'completed' THEN 1
           WHEN tk.due_date IS NOT NULL AND tk.due_date < e.entry_date THEN 2
           WHEN tk.due_date = e.entry_date THEN 3
           ELSE 4 END,
      tk.due_date NULLS LAST
    LIMIT 40
  LOOP
    IF t.status = 'completed' THEN
      INSERT INTO tracker_entry_items (entry_id, kind, title, detail, status, source, linked_task_id, sort_order)
      VALUES (
        p_entry_id, 'completed', t.title,
        CASE WHEN t.who IS DISTINCT FROM md.full_name THEN t.who ELSE '' END,
        'done', 'prefill_task', t.id, 5
      )
      ON CONFLICT DO NOTHING;
    ELSIF t.status = 'blocked' THEN
      INSERT INTO tracker_entry_items (entry_id, kind, title, detail, status, source, linked_task_id, sort_order)
      VALUES (
        p_entry_id, 'blocker', t.title,
        COALESCE(NULLIF(btrim(t.blocker_reason), ''), 'Blocked')
          || CASE WHEN t.who IS DISTINCT FROM md.full_name THEN ' — ' || t.who ELSE '' END,
        'blocked', 'prefill_blocked', t.id, 15
      )
      ON CONFLICT DO NOTHING;
    ELSIF t.due_date IS NOT NULL AND t.due_date < e.entry_date THEN
      INSERT INTO tracker_entry_items (entry_id, kind, title, detail, status, source, linked_task_id, sort_order)
      VALUES (
        p_entry_id, 'planned', t.title,
        'Overdue since ' || t.due_date
          || CASE WHEN t.who IS DISTINCT FROM md.full_name THEN ' — ' || t.who ELSE '' END,
        'in_progress', 'prefill_overdue', t.id, 20
      )
      ON CONFLICT DO NOTHING;
    ELSE
      INSERT INTO tracker_entry_items (entry_id, kind, title, detail, status, source, linked_task_id, sort_order)
      VALUES (
        p_entry_id, 'planned', t.title,
        trim(both ' —' from
          CASE WHEN t.due_date = e.entry_date THEN 'Due today' ELSE '' END
          || CASE WHEN t.who IS DISTINCT FROM md.full_name THEN ' — ' || t.who ELSE '' END
        ),
        CASE WHEN t.status = 'in_progress' THEN 'in_progress' ELSE 'not_started' END,
        'prefill_task', t.id, 10
      )
      ON CONFLICT DO NOTHING;
    END IF;
    v_count := v_count + 1;
  END LOOP;

  -- Legacy workforce_tasks for the MD themselves.
  FOR t IN
    SELECT wt.id, wt.title
    FROM workforce_tasks wt
    WHERE wt.employee_id = e.employee_id
      AND wt.status = 'Done'
      AND wt.completed_at IS NOT NULL
      AND (wt.completed_at AT TIME ZONE 'Africa/Dar_es_Salaam')::date = e.entry_date
    LIMIT 20
  LOOP
    INSERT INTO tracker_entry_items (entry_id, kind, title, status, source, linked_task_id, sort_order)
    VALUES (p_entry_id, 'completed', t.title, 'done', 'prefill_task', t.id, 25)
    ON CONFLICT DO NOTHING;
    v_count := v_count + 1;
  END LOOP;

  FOR t IN
    SELECT wt.id, wt.title, wt.due_date
    FROM workforce_tasks wt
    WHERE wt.employee_id = e.employee_id
      AND wt.status IN ('Todo', 'In Progress')
      AND wt.due_date IS NOT NULL
      AND wt.due_date < e.entry_date
    ORDER BY wt.due_date
    LIMIT 20
  LOOP
    INSERT INTO tracker_entry_items (entry_id, kind, title, detail, status, source, linked_task_id, sort_order)
    VALUES (p_entry_id, 'planned', t.title, 'Overdue since ' || t.due_date, 'in_progress',
            'prefill_overdue', t.id, 30)
    ON CONFLICT DO NOTHING;
    v_count := v_count + 1;
  END LOOP;

  SELECT COALESCE(SUM(s.payable_minutes), 0) INTO v_minutes
  FROM attendance_sessions s
  WHERE s.employee_id = e.employee_id AND s.business_date = e.entry_date;

  FOR t IN
    SELECT p.id, p.name, p.ends_on
    FROM projects p
    JOIN project_members pm ON pm.project_id = p.id AND pm.employee_id = e.employee_id
    WHERE p.status = 'active'
      AND p.ends_on IS NOT NULL
      AND p.ends_on BETWEEN e.entry_date AND e.entry_date + 7
    LIMIT 10
  LOOP
    INSERT INTO tracker_entry_items (entry_id, kind, title, detail, status, source, linked_project_id, sort_order)
    VALUES (p_entry_id, 'planned', t.name || ' milestone', 'Due ' || t.ends_on, 'not_started',
            'prefill_milestone', t.id, 40)
    ON CONFLICT DO NOTHING;
    v_count := v_count + 1;
  END LOOP;

  v_sources := jsonb_build_array(
    'md_department_tasks',
    'my_work_tasks',
    'completed_tasks',
    'overdue_tasks',
    'logged_hours',
    'project_milestones'
  );

  v_prefill := jsonb_build_object(
    'generated_at', now(),
    'logged_minutes', v_minutes,
    'item_count', v_count,
    'sources', v_sources,
    'unavailable_sources', jsonb_build_array('goal_progress')
  );

  UPDATE tracker_entries SET prefill = v_prefill WHERE id = p_entry_id;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.tracker_prefill_entry(uuid) IS
  'MD daily prefill: assigned My Work tasks for the MD, their reports, and (on brand units) their department, plus legacy tasks, hours, and milestones.';

-- =============================================================================
-- 7. Daily generation — brand (MD) units only
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tracker_generate_entries(p_date date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  a          record;
  v_date     date;
  v_schedule uuid;
  v_day      record;
  v_deadline timestamptz;
  v_created  integer := 0;
  v_entry    uuid;
BEGIN
  v_date := COALESCE(p_date, (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date);

  FOR a IN
    SELECT ta.id AS assignment_id, ta.cycle_id, ta.unit_id, ta.employee_id
    FROM tracking_assignments ta
    JOIN tracking_cycles c ON c.id = ta.cycle_id
    JOIN tracking_units u ON u.id = ta.unit_id
    WHERE ta.is_active
      AND ta.role = 'owner'
      AND c.is_active
      AND c.cadence = 'daily'
      AND u.is_active
      AND u.kind = 'brand'
      AND ta.effective_from <= v_date
      AND (ta.effective_to IS NULL OR ta.effective_to >= v_date)
  LOOP
    v_schedule := tracker_resolve_schedule(a.unit_id, a.cycle_id);
    SELECT * INTO v_day FROM tracker_day_state(a.employee_id, v_schedule, v_date);
    v_deadline := tracker_deadline_at(a.cycle_id, v_schedule, v_date);

    INSERT INTO tracker_entries (
      cycle_id, unit_id, assignment_id, employee_id, entry_date,
      status, suppression_reason, deadline_at
    ) VALUES (
      a.cycle_id, a.unit_id, a.assignment_id, a.employee_id, v_date,
      CASE WHEN v_day.is_working THEN 'not_started' ELSE 'not_working_day' END,
      v_day.reason,
      CASE WHEN v_day.is_working THEN v_deadline ELSE NULL END
    )
    ON CONFLICT (cycle_id, unit_id, entry_date) DO NOTHING
    RETURNING id INTO v_entry;

    IF v_entry IS NOT NULL THEN
      v_created := v_created + 1;
      IF v_day.is_working THEN
        PERFORM tracker_prefill_entry(v_entry);
      END IF;
    END IF;
    v_entry := NULL;
  END LOOP;

  RETURN v_created;
END;
$$;

COMMENT ON FUNCTION public.tracker_generate_entries(date) IS
  'Creates today''s owed daily entries for Managing Director brand units only.';

-- =============================================================================
-- 8. Roll back company-wide auto-provisioning
-- =============================================================================
-- Deactivate owner / reviewer assignments created by the department backfill.
UPDATE tracking_assignments a
   SET is_active = false,
       effective_to = CURRENT_DATE,
       updated_at = now()
  FROM tracking_units u
 WHERE a.unit_id = u.id
   AND u.kind = 'employee'
   AND a.is_active
   AND (
     a.note ILIKE 'Auto-provisioned from department%'
     OR a.note ILIKE 'Manager reviewer for%'
   );

-- Soft-deactivate the auto-provisioned personal units (keep brand / intentional ones).
UPDATE tracking_units
   SET is_active = false,
       updated_at = now()
 WHERE kind = 'employee'
   AND is_active
   AND metadata->>'provisioned_from' = 'department';

-- Drop stale OpusStudio MD pointer (employee no longer exists).
UPDATE md_tracker_engines
   SET md_employee_ids = ARRAY(
         SELECT x
         FROM unnest(COALESCE(md_employee_ids, '{}'::uuid[])) AS x
         WHERE EXISTS (SELECT 1 FROM workforce_employees we WHERE we.id = x)
       ),
       acting_md_employee_id = CASE
         WHEN acting_md_employee_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM workforce_employees we WHERE we.id = acting_md_employee_id)
         THEN acting_md_employee_id
         ELSE NULL
       END
 WHERE slug = 'opusstudio'
    OR EXISTS (
         SELECT 1
         FROM unnest(COALESCE(md_employee_ids, '{}'::uuid[])) AS x
         WHERE NOT EXISTS (SELECT 1 FROM workforce_employees we WHERE we.id = x)
       );

-- Sync current brand MD assignments, then generate today for MDs only.
SELECT tracker_ensure_md_brand_assignments(NULL);
SELECT tracker_generate_entries((now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date);

GRANT EXECUTE ON FUNCTION public.tracker_is_managing_director(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.tracker_ensure_md_brand_assignments(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.tracker_ensure_employee_unit(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.tracker_ensure_today_entry(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
