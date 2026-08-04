-- My Work — backfill.
--
-- Copies workforce_tasks and intern_tasks into `tasks`. Neither source is
-- dropped: the tracker prefills from workforce_tasks and /workforce/my-tasks
-- reads both, so this is a copy that keeps the old surfaces working while the
-- new one takes over.
--
-- Idempotent through source_workforce_task_id.

DO $$
DECLARE
  wt       record;
  v_task   uuid;
  v_status text;
  v_count  integer := 0;
BEGIN
  IF to_regclass('public.workforce_tasks') IS NULL THEN
    RAISE NOTICE 'work: workforce_tasks absent, skipping';
    RETURN;
  END IF;

  FOR wt IN
    SELECT * FROM workforce_tasks
    WHERE NOT EXISTS (
      SELECT 1 FROM tasks t WHERE t.source_workforce_task_id = workforce_tasks.id
    )
  LOOP
    -- The legacy vocabulary is narrower than the new one. 'Skipped' becomes
    -- cancelled rather than completed: it was not done.
    v_status := CASE wt.status
      WHEN 'Done' THEN 'completed'
      WHEN 'In Progress' THEN 'in_progress'
      WHEN 'Skipped' THEN 'cancelled'
      ELSE 'planned'
    END;

    INSERT INTO tasks (
      title, description, owner_employee_id, status, priority,
      due_date, completed_at, cancellation_reason,
      source_workforce_task_id, created_by_employee_id, created_at,
      tags
    ) VALUES (
      wt.title, COALESCE(wt.description, ''), wt.employee_id, v_status, 'normal',
      wt.due_date, wt.completed_at,
      CASE WHEN v_status = 'cancelled' THEN 'Skipped in the previous task system' END,
      wt.id, wt.assigned_by, wt.created_at,
      ARRAY[lower(COALESCE(wt.category, 'general'))]
    )
    RETURNING id INTO v_task;

    -- The employee who owned it is also its assignee, which is what makes it
    -- appear on their new task list.
    INSERT INTO task_assignments (task_id, employee_id, role, assigned_by, assigned_at)
    VALUES (v_task, wt.employee_id, 'assignee', wt.assigned_by, wt.created_at);

    INSERT INTO task_activity_events (task_id, event_type, to_status, summary, created_at)
    VALUES (v_task, 'task.imported', v_status,
            'Imported from the previous task system', wt.created_at);

    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'work: imported % workforce task(s)', v_count;
END
$$;

DO $$
DECLARE
  it       record;
  v_task   uuid;
  v_status text;
  v_count  integer := 0;
BEGIN
  IF to_regclass('public.intern_tasks') IS NULL THEN
    RAISE NOTICE 'work: intern_tasks absent, skipping';
    RETURN;
  END IF;

  FOR it IN
    SELECT * FROM intern_tasks
    WHERE NOT EXISTS (
      SELECT 1 FROM tasks t WHERE t.source_workforce_task_id = intern_tasks.id
    )
  LOOP
    v_status := CASE it.status
      WHEN 'Done' THEN 'completed'
      WHEN 'In Progress' THEN 'in_progress'
      WHEN 'Skipped' THEN 'cancelled'
      ELSE 'planned'
    END;

    INSERT INTO tasks (
      title, description, owner_employee_id, status, priority,
      due_date, completed_at, source_workforce_task_id,
      created_by_employee_id, created_at, tags
    ) VALUES (
      it.title, COALESCE(it.description, ''), it.employee_id, v_status, 'normal',
      it.due_date, it.completed_at, it.id, it.assigned_by, it.created_at,
      ARRAY['onboarding', lower(COALESCE(it.category, 'general'))]
    )
    RETURNING id INTO v_task;

    INSERT INTO task_assignments (task_id, employee_id, role, assigned_by, assigned_at)
    VALUES (v_task, it.employee_id, 'assignee', it.assigned_by, it.created_at);

    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'work: imported % intern task(s)', v_count;
END
$$;

-- =============================================================================
-- Task references
-- =============================================================================
-- Human-readable ids, assigned once. Useful in a standup ("OF-42 is blocked")
-- in a way a uuid never is.
DO $$
DECLARE
  t       record;
  v_next  integer;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(reference, '\D', '', 'g'), '')::integer), 0) + 1
    INTO v_next FROM tasks WHERE reference IS NOT NULL;

  FOR t IN SELECT id FROM tasks WHERE reference IS NULL ORDER BY created_at LOOP
    UPDATE tasks SET reference = 'OF-' || v_next WHERE id = t.id;
    v_next := v_next + 1;
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';
