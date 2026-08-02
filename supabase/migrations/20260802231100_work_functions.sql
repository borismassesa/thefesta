-- My Work — visibility, dependency gating, domain events and the calendar.
--
-- WHY IN THE DATABASE
--
--   Visibility is the security boundary. "Employees only see authorized tasks
--   and projects" has to hold for any caller, so it is one function every read
--   goes through rather than a filter each query remembers to apply.
--
--   Dependency gating has to be checked where the status changes. A UI that
--   hides the Complete button is a courtesy; task_set_status() is the control.
--
--   Domain events must be written in the same transaction as the change they
--   describe, or the tracker learns about completions that were rolled back.
--
-- Errors raise ERRCODE P0001 with stable dotted tokens, mapped by
-- lib/work/errors.ts under an exact-match whitelist.

-- =============================================================================
-- Visibility
-- =============================================================================
-- A project is visible when the employee is a member, manages or sponsors it,
-- when it is department-scoped and they are in that department, when it is
-- organisation-scoped, or when the caller holds an admin permission.
--
-- 'members' is the DEFAULT, so a project nobody added you to stays invisible.
CREATE OR REPLACE FUNCTION public.project_is_visible_to(
  p_project_id uuid,
  p_employee_id uuid,
  p_is_admin boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_is_admin OR EXISTS (
    SELECT 1 FROM projects pr
    LEFT JOIN workforce_employees e ON e.id = p_employee_id
    WHERE pr.id = p_project_id
      AND pr.archived_at IS NULL
      AND (
        pr.visibility = 'organisation'
        OR pr.manager_id = p_employee_id
        OR pr.sponsor_employee_id = p_employee_id
        OR (pr.visibility = 'department' AND pr.department IS NOT NULL AND pr.department = e.department)
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = pr.id AND pm.employee_id = p_employee_id
        )
      )
  );
$$;

-- A task is visible when the employee owns it, is assigned to it, created it,
-- or can see its project. A task with no project is visible only to the people
-- directly connected to it, which is what stops a personal task leaking to a
-- whole department.
CREATE OR REPLACE FUNCTION public.task_is_visible_to(
  p_task_id uuid,
  p_employee_id uuid,
  p_is_admin boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_is_admin OR EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = p_task_id
      AND t.deleted_at IS NULL
      AND (
        t.owner_employee_id = p_employee_id
        OR t.created_by_employee_id = p_employee_id
        OR EXISTS (
          SELECT 1 FROM task_assignments ta
          WHERE ta.task_id = t.id AND ta.employee_id = p_employee_id
            AND ta.unassigned_at IS NULL
        )
        OR (t.project_id IS NOT NULL
            AND project_is_visible_to(t.project_id, p_employee_id, false))
      )
  );
$$;

-- The id set a list query may consider. Every read in lib/work/queries.ts
-- intersects with this rather than filtering afterwards, so a task that is not
-- visible is never fetched in the first place.
CREATE OR REPLACE FUNCTION public.task_visible_ids(
  p_employee_id uuid,
  p_is_admin boolean DEFAULT false
)
RETURNS TABLE (task_id uuid)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT t.id
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND (
      p_is_admin
      OR t.owner_employee_id = p_employee_id
      OR t.created_by_employee_id = p_employee_id
      OR EXISTS (
        SELECT 1 FROM task_assignments ta
        WHERE ta.task_id = t.id AND ta.employee_id = p_employee_id AND ta.unassigned_at IS NULL
      )
      OR (t.project_id IS NOT NULL AND project_is_visible_to(t.project_id, p_employee_id, false))
    );
$$;

-- =============================================================================
-- Dependency gating
-- =============================================================================
-- How many blocking dependencies are still open. Only dependencies flagged
-- blocks_completion count: a 'related' link is information, and gating on every
-- link makes people delete links rather than record them.
CREATE OR REPLACE FUNCTION public.task_blocking_dependencies(p_task_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COUNT(*)::integer
  FROM task_dependencies d
  JOIN tasks blocker ON blocker.id = d.depends_on_task_id
  WHERE d.task_id = p_task_id
    AND d.blocks_completion
    AND blocker.deleted_at IS NULL
    -- A cancelled blocker does not block: the work is not going to happen, and
    -- leaving it as a gate would strand everything behind it forever.
    AND blocker.status NOT IN ('completed', 'cancelled');
$$;

-- =============================================================================
-- task_set_status — the one writer of task status
-- =============================================================================
CREATE OR REPLACE FUNCTION public.task_set_status(
  p_task_id uuid,
  p_employee_id uuid,
  p_status text,
  p_note text DEFAULT NULL,
  p_is_admin boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  t          tasks%ROWTYPE;
  v_blocking integer;
BEGIN
  SELECT * INTO t FROM tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND OR t.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'task.not_found' USING ERRCODE = 'P0001';
  END IF;

  -- Visibility is necessary but not sufficient: seeing a project's task does
  -- not mean you may move it. Only the owner, an active assignee, or an admin
  -- can change status.
  IF NOT task_is_visible_to(p_task_id, p_employee_id, p_is_admin) THEN
    RAISE EXCEPTION 'task.not_found' USING ERRCODE = 'P0001';
  END IF;
  IF NOT p_is_admin
     AND t.owner_employee_id IS DISTINCT FROM p_employee_id
     AND NOT EXISTS (
       SELECT 1 FROM task_assignments ta
       WHERE ta.task_id = p_task_id AND ta.employee_id = p_employee_id
         AND ta.unassigned_at IS NULL
     )
  THEN
    RAISE EXCEPTION 'task.not_assigned' USING ERRCODE = 'P0001';
  END IF;

  IF t.status IN ('completed', 'cancelled') AND p_status NOT IN ('in_progress', 'planned') THEN
    RAISE EXCEPTION 'task.already_closed' USING ERRCODE = 'P0001';
  END IF;

  IF p_status = 'blocked' AND (p_note IS NULL OR length(btrim(p_note)) = 0) THEN
    -- A blocked task with no reason is a task nobody can unblock.
    RAISE EXCEPTION 'task.blocker_reason_required' USING ERRCODE = 'P0001';
  END IF;

  -- THE DEPENDENCY GATE.
  IF p_status = 'completed' THEN
    v_blocking := task_blocking_dependencies(p_task_id);
    IF v_blocking > 0 THEN
      RAISE EXCEPTION 'task.blocked_by_dependency' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE tasks
     SET status = p_status,
         blocker_reason = CASE WHEN p_status = 'blocked' THEN p_note
                               WHEN p_status IN ('in_progress', 'completed') THEN NULL
                               ELSE blocker_reason END,
         blocked_since = CASE WHEN p_status = 'blocked' THEN COALESCE(blocked_since, CURRENT_DATE)
                              WHEN p_status <> 'blocked' THEN NULL
                              ELSE blocked_since END,
         completed_at = CASE WHEN p_status = 'completed' THEN now()
                             WHEN t.status = 'completed' THEN NULL
                             ELSE completed_at END,
         completed_by_employee_id = CASE WHEN p_status = 'completed' THEN p_employee_id
                                         WHEN t.status = 'completed' THEN NULL
                                         ELSE completed_by_employee_id END,
         cancelled_at = CASE WHEN p_status = 'cancelled' THEN now() ELSE cancelled_at END,
         cancellation_reason = CASE WHEN p_status = 'cancelled' THEN p_note ELSE cancellation_reason END
   WHERE id = p_task_id;

  -- The event is written in the SAME transaction as the change. A consumer
  -- must never learn about a completion that was rolled back.
  INSERT INTO task_activity_events (
    task_id, event_type, from_status, to_status, summary, metadata, actor_employee_id
  ) VALUES (
    p_task_id,
    CASE p_status
      WHEN 'completed' THEN 'task.completed'
      WHEN 'cancelled' THEN 'task.cancelled'
      WHEN 'blocked' THEN 'task.blocked'
      ELSE 'task.status_changed'
    END,
    t.status, p_status,
    COALESCE(p_note, format('Moved from %s to %s', t.status, p_status)),
    jsonb_build_object(
      'projectId', t.project_id,
      'linkedTrackerItemId', t.linked_tracker_item_id,
      'linkedGoalId', t.linked_goal_id,
      'estimatedMinutes', t.estimated_minutes,
      'actualMinutes', t.actual_minutes
    ),
    p_employee_id
  );

  RETURN p_status;
END;
$$;

-- =============================================================================
-- task_soft_delete — nothing is ever really removed
-- =============================================================================
CREATE OR REPLACE FUNCTION public.task_soft_delete(
  p_task_id uuid,
  p_employee_id uuid,
  p_reason text,
  p_is_admin boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  t tasks%ROWTYPE;
BEGIN
  SELECT * INTO t FROM tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND OR t.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'task.not_found' USING ERRCODE = 'P0001';
  END IF;
  IF NOT p_is_admin AND t.owner_employee_id IS DISTINCT FROM p_employee_id
     AND t.created_by_employee_id IS DISTINCT FROM p_employee_id THEN
    RAISE EXCEPTION 'task.not_permitted' USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'task.reason_required' USING ERRCODE = 'P0001';
  END IF;

  UPDATE tasks
     SET deleted_at = now(),
         deleted_by_employee_id = p_employee_id,
         cancellation_reason = COALESCE(cancellation_reason, p_reason)
   WHERE id = p_task_id;

  -- The trail stays readable after the row is hidden. That is what makes a
  -- deleted task auditable rather than gone.
  INSERT INTO task_activity_events (
    task_id, event_type, from_status, to_status, summary, actor_employee_id
  ) VALUES (
    p_task_id, 'task.deleted', t.status, t.status, p_reason, p_employee_id
  );
END;
$$;

-- =============================================================================
-- task_consume_completion_events — the bridge to the tracker
-- =============================================================================
-- Reads unconsumed 'task.completed' events and marks the linked tracker item
-- done. The task module does not reach into tracker tables directly; it
-- publishes an event and this consumer applies it, so either module can change
-- without the other being rewritten.
CREATE OR REPLACE FUNCTION public.task_consume_completion_events(p_limit integer DEFAULT 200)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  ev      record;
  v_count integer := 0;
BEGIN
  FOR ev IN
    SELECT e.id, e.task_id, e.metadata, t.title, t.linked_tracker_item_id
    FROM task_activity_events e
    JOIN tasks t ON t.id = e.task_id
    WHERE e.consumed_at IS NULL
      AND e.event_type = 'task.completed'
    ORDER BY e.created_at
    LIMIT GREATEST(1, p_limit)
    FOR UPDATE OF e SKIP LOCKED
  LOOP
    IF ev.linked_tracker_item_id IS NOT NULL THEN
      -- Only move an item that is still open. A tracker item already carried
      -- over or waived must not be silently reopened as done.
      UPDATE tracker_entry_items
         SET status = 'done'
       WHERE id = ev.linked_tracker_item_id
         AND status IN ('not_started', 'in_progress', 'blocked');
    END IF;

    UPDATE task_activity_events SET consumed_at = now() WHERE id = ev.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- =============================================================================
-- work_calendar — one calendar, merged on read
-- =============================================================================
-- Combines the eight sources the design calls for. Nothing is copied: leave,
-- holidays, shifts, task due dates, report deadlines and tracker deadlines are
-- read from the modules that own them, so the calendar cannot drift from them.
--
-- TIMEZONE. Every row carries entry_date computed in p_timezone, so a task due
-- at 23:00 EAT lands on the right day rather than tomorrow in UTC.
CREATE OR REPLACE FUNCTION public.work_calendar(
  p_employee_id uuid,
  p_from date,
  p_to date,
  p_timezone text DEFAULT 'Africa/Dar_es_Salaam',
  p_is_admin boolean DEFAULT false
)
RETURNS TABLE (
  source text,
  entry_date date,
  starts_at timestamptz,
  ends_at timestamptz,
  all_day boolean,
  title text,
  detail text,
  ref_id uuid
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  -- 1. Meetings and check-ins the employee organises or attends.
  SELECT 'meeting', (ce.starts_at AT TIME ZONE p_timezone)::date,
         ce.starts_at, ce.ends_at, ce.is_all_day, ce.title,
         COALESCE(ce.location, ce.kind), ce.id
  FROM calendar_events ce
  WHERE ce.status <> 'cancelled'
    AND (ce.starts_at AT TIME ZONE p_timezone)::date BETWEEN p_from AND p_to
    AND (
      ce.organiser_employee_id = p_employee_id
      OR ce.attendees @> jsonb_build_array(jsonb_build_object('employeeId', p_employee_id))
    )

  UNION ALL

  -- 2. Task due dates, restricted to tasks the employee may see.
  SELECT 'task', t.due_date, NULL::timestamptz, NULL::timestamptz, true, t.title,
         t.status, t.id
  FROM tasks t
  WHERE t.due_date BETWEEN p_from AND p_to
    AND t.deleted_at IS NULL
    AND t.status NOT IN ('completed', 'cancelled')
    AND t.id IN (SELECT task_id FROM task_visible_ids(p_employee_id, p_is_admin))

  UNION ALL

  -- 3. Approved leave.
  SELECT 'leave', d.leave_date, NULL::timestamptz, NULL::timestamptz, d.day_fraction >= 1,
         lt.name, r.state, r.id
  FROM leave_request_days d
  JOIN leave_requests r ON r.id = d.request_id
  JOIN leave_types lt ON lt.id = r.leave_type_id
  WHERE d.employee_id = p_employee_id
    AND r.state = 'approved'
    AND d.leave_date BETWEEN p_from AND p_to

  UNION ALL

  -- 4. Public holidays.
  SELECT 'holiday', COALESCE(h.observed_date, h.holiday_date),
         NULL::timestamptz, NULL::timestamptz, true, h.name, 'Public holiday', h.id
  FROM holiday_calendars h
  WHERE COALESCE(h.observed_date, h.holiday_date) BETWEEN p_from AND p_to

  UNION ALL

  -- 5. Rostered shifts, from the attendance module's schedule.
  SELECT 'shift', gs.day::date, NULL::timestamptz, NULL::timestamptz, true,
         tpl.name, tpl.start_time::text || ' to ' || tpl.end_time::text, tpl.id
  FROM generate_series(p_from, p_to, interval '1 day') gs(day)
  CROSS JOIN LATERAL attendance_resolve_schedule(p_employee_id, gs.day::date) r
  JOIN shift_templates tpl ON tpl.id = r.shift_template_id
  JOIN work_schedules sc ON sc.id = r.schedule_id
  WHERE EXTRACT(ISODOW FROM gs.day)::smallint = ANY (sc.working_weekdays)

  UNION ALL

  -- 6. Report deadlines the employee owes.
  SELECT 'report_due', o.due_date, NULL::timestamptz, NULL::timestamptz, true,
         rt.name, o.period_label, o.id
  FROM report_obligations o
  JOIN report_templates rt ON rt.id = o.template_id
  WHERE o.employee_id = p_employee_id
    AND o.state IN ('open', 'overdue')
    AND o.due_date BETWEEN p_from AND p_to

  UNION ALL

  -- 7. Tracker deadlines.
  SELECT 'tracker_due', te.entry_date, te.deadline_at, te.deadline_at, false,
         u.name, te.status, te.id
  FROM tracker_entries te
  JOIN tracking_units u ON u.id = te.unit_id
  WHERE te.employee_id = p_employee_id
    AND te.suppression_reason IS NULL
    AND te.status IN ('not_started', 'in_progress')
    AND te.entry_date BETWEEN p_from AND p_to

  UNION ALL

  -- 8. Project milestones on projects the employee can see.
  SELECT 'milestone', m.due_date, NULL::timestamptz, NULL::timestamptz, true,
         m.name, p.name, m.id
  FROM project_milestones m
  JOIN projects p ON p.id = m.project_id
  WHERE m.due_date BETWEEN p_from AND p_to
    AND m.status NOT IN ('met', 'cancelled')
    AND project_is_visible_to(m.project_id, p_employee_id, p_is_admin);
$$;

-- =============================================================================
-- Access control
-- =============================================================================
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'project_is_visible_to(uuid, uuid, boolean)',
    'task_is_visible_to(uuid, uuid, boolean)',
    'task_visible_ids(uuid, boolean)',
    'task_blocking_dependencies(uuid)',
    'task_set_status(uuid, uuid, text, text, boolean)',
    'task_soft_delete(uuid, uuid, text, boolean)',
    'task_consume_completion_events(integer)',
    'work_calendar(uuid, date, date, text, boolean)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';
