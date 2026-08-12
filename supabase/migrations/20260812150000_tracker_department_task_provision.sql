-- Daily Tracker — provision from department + assigned tasks.
--
-- Product rule: every active employee with a department owes a personal daily
-- tracker entry. Department is the organisational parent; assigned My Work tasks
-- prefill the day's planned/completed items.
--
-- Previously only brand MDs received tracking_assignments, so the Workspace
-- Daily Tracker empty-stated for everyone else even though department units
-- already existed.

-- =============================================================================
-- 1. Ensure a department unit exists for a department name
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tracker_ensure_department_unit(p_department text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dept text := btrim(p_department);
  v_slug text;
  v_id   uuid;
BEGIN
  IF v_dept IS NULL OR v_dept = '' THEN
    RETURN NULL;
  END IF;

  v_slug := 'dept-' || regexp_replace(lower(v_dept), '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '-+', '-', 'g');
  v_slug := trim(both '-' from v_slug);

  SELECT id INTO v_id FROM tracking_units WHERE slug = v_slug;
  IF v_id IS NOT NULL THEN
    UPDATE tracking_units
       SET name = v_dept,
           department = v_dept,
           is_active = true,
           updated_at = now()
     WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO tracking_units (kind, slug, name, department, sort_order)
  VALUES ('department', v_slug, v_dept, v_dept, 200)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.tracker_ensure_department_unit(text) IS
  'Idempotently creates or refreshes a department tracking unit from a workforce department name.';

-- =============================================================================
-- 2. Ensure an employee unit + owner assignment (and manager reviewer)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tracker_ensure_employee_unit(p_employee_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  e            workforce_employees%ROWTYPE;
  v_dept_id    uuid;
  v_unit_id    uuid;
  v_cycle_id   uuid;
  v_slug       text;
  v_assign_id  uuid;
BEGIN
  SELECT * INTO e FROM workforce_employees WHERE id = p_employee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tracker.employee_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- No department → nothing to provision. The UI keeps the empty state.
  IF e.department IS NULL OR btrim(e.department) = '' THEN
    RETURN NULL;
  END IF;

  -- Only people who are currently expected to work.
  IF e.status NOT IN ('Active', 'On Leave', 'Onboarding') THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_cycle_id FROM tracking_cycles WHERE slug = 'daily-execution' AND is_active;
  IF v_cycle_id IS NULL THEN
    RAISE EXCEPTION 'tracker.cycle_missing' USING ERRCODE = 'P0001';
  END IF;

  v_dept_id := tracker_ensure_department_unit(e.department);

  v_slug := 'emp-' || lower(e.employee_code);
  v_slug := regexp_replace(v_slug, '[^a-z0-9-]+', '-', 'g');

  SELECT id INTO v_unit_id
  FROM tracking_units
  WHERE kind = 'employee' AND employee_id = e.id
  LIMIT 1;

  IF v_unit_id IS NULL THEN
    INSERT INTO tracking_units (
      kind, slug, name, employee_id, owner_employee_id, parent_unit_id, sort_order, metadata
    ) VALUES (
      'employee',
      v_slug,
      e.full_name,
      e.id,
      e.id,
      v_dept_id,
      300,
      jsonb_build_object('provisioned_from', 'department', 'department', e.department)
    )
    ON CONFLICT (slug) DO UPDATE
      SET name = EXCLUDED.name,
          employee_id = EXCLUDED.employee_id,
          owner_employee_id = EXCLUDED.owner_employee_id,
          parent_unit_id = EXCLUDED.parent_unit_id,
          is_active = true,
          updated_at = now()
    RETURNING id INTO v_unit_id;
  ELSE
    UPDATE tracking_units
       SET name = e.full_name,
           owner_employee_id = e.id,
           parent_unit_id = COALESCE(v_dept_id, parent_unit_id),
           is_active = true,
           metadata = COALESCE(metadata, '{}'::jsonb)
             || jsonb_build_object('provisioned_from', 'department', 'department', e.department),
           updated_at = now()
     WHERE id = v_unit_id;
  END IF;

  -- Owner assignment — this is what makes Daily Tracker visible.
  SELECT id INTO v_assign_id
  FROM tracking_assignments
  WHERE cycle_id = v_cycle_id
    AND unit_id = v_unit_id
    AND employee_id = e.id
    AND role = 'owner'
    AND is_active
  LIMIT 1;

  IF v_assign_id IS NULL THEN
    INSERT INTO tracking_assignments (
      cycle_id, unit_id, employee_id, role, effective_from, note
    ) VALUES (
      v_cycle_id, v_unit_id, e.id, 'owner', CURRENT_DATE,
      'Auto-provisioned from department ' || e.department || '.'
    )
    RETURNING id INTO v_assign_id;
  END IF;

  -- Manager reviews the personal unit when one is set.
  IF e.manager_id IS NOT NULL AND e.manager_id <> e.id THEN
    IF NOT EXISTS (
      SELECT 1
      FROM tracking_assignments
      WHERE cycle_id = v_cycle_id
        AND unit_id = v_unit_id
        AND employee_id = e.manager_id
        AND role = 'reviewer'
        AND is_active
    ) THEN
      INSERT INTO tracking_assignments (
        cycle_id, unit_id, employee_id, role, effective_from, note
      ) VALUES (
        v_cycle_id, v_unit_id, e.manager_id, 'reviewer', CURRENT_DATE,
        'Manager reviewer for ' || e.full_name || '.'
      );
    END IF;
  END IF;

  RETURN v_unit_id;
END;
$$;

COMMENT ON FUNCTION public.tracker_ensure_employee_unit(uuid) IS
  'Creates the personal daily-execution tracking unit and owner assignment for an employee, parented under their department unit.';

-- =============================================================================
-- 3. Backfill every active employee who has a department
-- =============================================================================
DO $$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT id
    FROM workforce_employees
    WHERE status IN ('Active', 'On Leave', 'Onboarding')
      AND department IS NOT NULL
      AND btrim(department) <> ''
  LOOP
    IF tracker_ensure_employee_unit(r.id) IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'tracker: provisioned % employee unit(s) from department', v_count;
END
$$;

-- =============================================================================
-- 4. Keep new/updated employees in sync
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tracker_employees_provision_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IN ('Active', 'On Leave', 'Onboarding')
     AND NEW.department IS NOT NULL
     AND btrim(NEW.department) <> '' THEN
    PERFORM tracker_ensure_employee_unit(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tracker_employees_provision ON workforce_employees;
CREATE TRIGGER trg_tracker_employees_provision
  AFTER INSERT OR UPDATE OF department, status, manager_id, full_name, employee_code
  ON workforce_employees
  FOR EACH ROW
  EXECUTE FUNCTION public.tracker_employees_provision_trigger();

-- =============================================================================
-- 5. Prefill from My Work tasks (assigned) as well as legacy workforce_tasks
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

  -- ---- My Work: tasks completed today (assignee) ----
  FOR t IN
    SELECT tk.id, tk.title
    FROM tasks tk
    JOIN task_assignments ta
      ON ta.task_id = tk.id
     AND ta.employee_id = e.employee_id
     AND ta.unassigned_at IS NULL
     AND ta.role IN ('assignee', 'collaborator')
    WHERE tk.status = 'completed'
      AND tk.completed_at IS NOT NULL
      AND (tk.completed_at AT TIME ZONE 'Africa/Dar_es_Salaam')::date = e.entry_date
    LIMIT 20
  LOOP
    INSERT INTO tracker_entry_items (entry_id, kind, title, status, source, linked_task_id, sort_order)
    VALUES (p_entry_id, 'completed', t.title, 'done', 'prefill_task', t.id, 5)
    ON CONFLICT DO NOTHING;
    v_count := v_count + 1;
  END LOOP;

  -- ---- My Work: open assigned tasks due today or already overdue ----
  FOR t IN
    SELECT tk.id, tk.title, tk.due_date, tk.status, tk.blocker_reason
    FROM tasks tk
    JOIN task_assignments ta
      ON ta.task_id = tk.id
     AND ta.employee_id = e.employee_id
     AND ta.unassigned_at IS NULL
     AND ta.role IN ('assignee', 'collaborator')
    WHERE tk.status IN ('planned', 'in_progress', 'blocked', 'in_review')
      AND (
        tk.due_date IS NULL
        OR tk.due_date <= e.entry_date
        OR tk.status IN ('in_progress', 'blocked')
      )
    ORDER BY
      CASE WHEN tk.status = 'blocked' THEN 0
           WHEN tk.due_date IS NOT NULL AND tk.due_date < e.entry_date THEN 1
           WHEN tk.due_date = e.entry_date THEN 2
           ELSE 3 END,
      tk.due_date NULLS LAST
    LIMIT 30
  LOOP
    IF t.status = 'blocked' THEN
      INSERT INTO tracker_entry_items (
        entry_id, kind, title, detail, status, source, linked_task_id, sort_order
      ) VALUES (
        p_entry_id, 'blocker', t.title,
        COALESCE(NULLIF(btrim(t.blocker_reason), ''), 'Blocked'),
        'blocked', 'prefill_blocked', t.id, 15
      )
      ON CONFLICT DO NOTHING;
    ELSIF t.due_date IS NOT NULL AND t.due_date < e.entry_date THEN
      INSERT INTO tracker_entry_items (
        entry_id, kind, title, detail, status, source, linked_task_id, sort_order
      ) VALUES (
        p_entry_id, 'planned', t.title, 'Overdue since ' || t.due_date,
        'in_progress', 'prefill_overdue', t.id, 20
      )
      ON CONFLICT DO NOTHING;
    ELSE
      INSERT INTO tracker_entry_items (
        entry_id, kind, title, detail, status, source, linked_task_id, sort_order
      ) VALUES (
        p_entry_id, 'planned', t.title,
        CASE WHEN t.due_date = e.entry_date THEN 'Due today' ELSE '' END,
        CASE WHEN t.status = 'in_progress' THEN 'in_progress' ELSE 'not_started' END,
        'prefill_task', t.id, 10
      )
      ON CONFLICT DO NOTHING;
    END IF;
    v_count := v_count + 1;
  END LOOP;

  -- ---- Legacy workforce_tasks completed on the day ----
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

  -- ---- Legacy workforce_tasks already overdue ----
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

  -- ---- hours actually logged, from the attendance module ----
  SELECT COALESCE(SUM(s.payable_minutes), 0) INTO v_minutes
  FROM attendance_sessions s
  WHERE s.employee_id = e.employee_id AND s.business_date = e.entry_date;

  -- ---- projects reaching their end date within the week ----
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
  'Prefills a daily entry from My Work task assignments, legacy workforce tasks, attendance hours, and near project milestones.';

GRANT EXECUTE ON FUNCTION public.tracker_ensure_department_unit(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.tracker_ensure_employee_unit(uuid) TO service_role;

-- =============================================================================
-- 6. Ensure today's entry exists for one employee (page-load path)
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
  -- Make sure the personal unit exists first.
  PERFORM tracker_ensure_employee_unit(p_employee_id);

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

COMMENT ON FUNCTION public.tracker_ensure_today_entry(uuid) IS
  'Idempotently creates today''s daily tracker entry for an employee''s owner units and prefills from assigned tasks.';

GRANT EXECUTE ON FUNCTION public.tracker_ensure_today_entry(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
