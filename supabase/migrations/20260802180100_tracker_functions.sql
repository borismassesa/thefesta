-- Daily Tracker — day resolution, deadlines, generation, carry-over, rollup.
--
-- WHY IN THE DATABASE
--
--   'missed' must be calculated, not chosen. If an employee can select it, it
--   is either never selected or selected out of guilt, and the number stops
--   meaning anything. tracker_mark_missed() is the only writer, it runs on a
--   schedule, and it refuses to touch a day that was suppressed.
--
--   Suppression has to be right or the tracker punishes people for being on
--   approved leave. Rest day, public holiday and approved leave are resolved in
--   one place, tracker_day_state(), used by both generation and missed-marking
--   so the two can never disagree.
--
--   Carry-over must be idempotent. The job runs hourly; a unique index on
--   carried_from_item_id plus ON CONFLICT DO NOTHING is what stops an
--   unfinished item being duplicated once an hour, compounding all week.
--
-- Errors raise ERRCODE P0001 with stable dotted tokens, mapped by
-- lib/tracker/errors.ts under an exact-match whitelist.

-- =============================================================================
-- Schedule resolution
-- =============================================================================
-- Unit schedule, else cycle schedule, else the default. Always resolves, so a
-- unit created without one still has a timezone and a working week.
CREATE OR REPLACE FUNCTION public.tracker_resolve_schedule(
  p_unit_id uuid,
  p_cycle_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT u.schedule_id FROM tracking_units u WHERE u.id = p_unit_id),
    (SELECT c.schedule_id FROM tracking_cycles c WHERE c.id = p_cycle_id),
    (SELECT s.id FROM work_schedules s WHERE s.is_default AND s.active LIMIT 1)
  );
$$;

-- =============================================================================
-- tracker_day_state — is an entry owed on this date, and if not, why
-- =============================================================================
-- The single answer to "should this person be tracking today". Precedence is
-- deliberate and ordered from strongest to weakest:
--
--   not_employed   they had not started, or had left
--   approved_leave beats everything else a person can be doing
--   public_holiday closes the office
--   rest_day       outside the schedule's working week
--
-- Leave outranks holiday so someone on a fortnight's leave that contains a
-- public holiday gets one consistent reason rather than a mixed run.
CREATE OR REPLACE FUNCTION public.tracker_day_state(
  p_employee_id uuid,
  p_schedule_id uuid,
  p_date date
)
RETURNS TABLE (is_working boolean, reason text)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  sched work_schedules%ROWTYPE;
BEGIN
  IF p_employee_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM workforce_employees e
    WHERE e.id = p_employee_id
      AND (e.start_date > p_date OR e.status IN ('Resigned', 'Terminated'))
  ) THEN
    RETURN QUERY SELECT false, 'not_employed'::text; RETURN;
  END IF;

  IF p_employee_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM workforce_leave_requests lr
    WHERE lr.employee_id = p_employee_id
      AND lr.status = 'Approved'
      AND p_date BETWEEN lr.start_date AND lr.end_date
  ) THEN
    RETURN QUERY SELECT false, 'approved_leave'::text; RETURN;
  END IF;

  SELECT * INTO sched FROM work_schedules WHERE id = p_schedule_id;

  IF EXISTS (
    SELECT 1 FROM holiday_calendars h
    WHERE h.holiday_date = p_date
      AND (h.schedule_id IS NULL OR h.schedule_id = p_schedule_id)
  ) THEN
    RETURN QUERY SELECT false, 'public_holiday'::text; RETURN;
  END IF;

  IF sched.id IS NOT NULL
     AND NOT (EXTRACT(ISODOW FROM p_date)::smallint = ANY (sched.working_weekdays)) THEN
    RETURN QUERY SELECT false, 'rest_day'::text; RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;

-- =============================================================================
-- tracker_deadline_at — the instant an entry is due
-- =============================================================================
-- The cycle's local deadline_time on the entry's own date, in the resolved
-- schedule's timezone. This is what "deadlines respect timezone and work
-- schedule" means: 18:00 is 18:00 where the person works, not 18:00 UTC.
CREATE OR REPLACE FUNCTION public.tracker_deadline_at(
  p_cycle_id uuid,
  p_schedule_id uuid,
  p_date date
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_time time;
  v_tz   text;
BEGIN
  SELECT deadline_time INTO v_time FROM tracking_cycles WHERE id = p_cycle_id;
  IF v_time IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(timezone, 'Africa/Dar_es_Salaam') INTO v_tz
  FROM work_schedules WHERE id = p_schedule_id;

  RETURN (p_date + v_time) AT TIME ZONE COALESCE(v_tz, 'Africa/Dar_es_Salaam');
END;
$$;

-- =============================================================================
-- tracker_generate_entries — what is owed today
-- =============================================================================
-- Creates one entry per active owner assignment. Non-working days still get an
-- entry, marked not_working_day with its reason, rather than being skipped:
-- a visible "public holiday" is information, whereas a gap is ambiguous between
-- a holiday, a missed day, and a bug.
--
-- Idempotent through the unique key on (cycle, unit, date).
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
-- tracker_prefill_entry — do not make people retype what we already know
-- =============================================================================
-- Pulls what the platform can already prove and writes it as items marked with
-- their source, so the UI can show them as prefilled rather than pretending the
-- employee wrote them.
--
-- SOURCES THAT EXIST TODAY: completed tasks, overdue tasks, logged hours (from
-- the attendance module), and project milestones approximated by a project's
-- end date. Goal progress has no source table yet — the growth KPI tables are
-- period-based and not per-employee-per-day — so linked_goal_id is left for
-- manual linking rather than prefilled from a table that does not fit.
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
BEGIN
  SELECT * INTO e FROM tracker_entries WHERE id = p_entry_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT * INTO c FROM tracking_cycles WHERE id = e.cycle_id;
  IF NOT COALESCE(c.prefill_enabled, true) THEN RETURN 0; END IF;

  -- ---- tasks completed on the day ----
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
    VALUES (p_entry_id, 'completed', t.title, 'done', 'prefill_task', t.id, 10)
    ON CONFLICT DO NOTHING;
    v_count := v_count + 1;
  END LOOP;

  -- ---- tasks already overdue ----
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
            'prefill_overdue', t.id, 20)
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
            'prefill_milestone', t.id, 30)
    ON CONFLICT DO NOTHING;
    v_count := v_count + 1;
  END LOOP;

  v_prefill := jsonb_build_object(
    'generated_at', now(),
    'logged_minutes', v_minutes,
    'item_count', v_count,
    -- Named so the UI can say what it could NOT prefill, rather than leaving
    -- the employee to guess whether the tracker knows about their goals.
    'sources', jsonb_build_array('completed_tasks', 'overdue_tasks', 'logged_hours', 'project_milestones'),
    'unavailable_sources', jsonb_build_array('goal_progress')
  );

  UPDATE tracker_entries SET prefill = v_prefill WHERE id = p_entry_id;
  RETURN v_count;
END;
$$;

-- =============================================================================
-- tracker_mark_missed — the system decides, not the employee
-- =============================================================================
-- An entry past its deadline plus grace, never submitted, on a working day,
-- becomes 'missed'. Suppressed days are skipped by construction: they have no
-- deadline_at, so they cannot match.
CREATE OR REPLACE FUNCTION public.tracker_mark_missed(p_now timestamptz DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now   timestamptz := COALESCE(p_now, now());
  v_count integer;
BEGIN
  WITH moved AS (
    UPDATE tracker_entries e
       SET status = 'missed'
      FROM tracking_cycles c
     WHERE c.id = e.cycle_id
       AND e.status IN ('not_started', 'in_progress')
       AND e.submitted_at IS NULL
       AND e.deadline_at IS NOT NULL
       -- Belt and braces with the deadline_at IS NULL rule above: an entry that
       -- was suppressed must never be marked missed, whatever else is true.
       AND e.suppression_reason IS NULL
       AND v_now > e.deadline_at + make_interval(mins => c.grace_minutes)
    RETURNING e.id
  )
  SELECT count(*) INTO v_count FROM moved;
  RETURN v_count;
END;
$$;

-- =============================================================================
-- tracker_carry_over — unfinished work moves, and keeps its history
-- =============================================================================
-- Copies unfinished items from one entry to the NEXT WORKING entry for the same
-- unit, linking each copy back to its source. The source item is marked
-- carried_over rather than deleted, so the day it was first raised still shows
-- it was raised.
CREATE OR REPLACE FUNCTION public.tracker_carry_over(p_from_date date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  src        record;
  item       record;
  v_target   uuid;
  v_from     date;
  v_count    integer := 0;
BEGIN
  v_from := COALESCE(p_from_date, (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date - 1);

  FOR src IN
    SELECT e.*
    FROM tracker_entries e
    JOIN tracking_cycles c ON c.id = e.cycle_id
    WHERE e.entry_date = v_from
      AND c.auto_carry_over
      AND e.suppression_reason IS NULL
      AND EXISTS (
        SELECT 1 FROM tracker_entry_items i
        WHERE i.entry_id = e.id
          AND i.kind IN ('planned', 'next_step', 'blocker')
          AND i.status IN ('not_started', 'in_progress', 'blocked')
      )
  LOOP
    -- The next entry for this unit that is actually a working day. Skipping
    -- suppressed days is why an item raised on Friday lands on Monday rather
    -- than on a Saturday nobody reads.
    SELECT e2.id INTO v_target
    FROM tracker_entries e2
    WHERE e2.cycle_id = src.cycle_id
      AND e2.unit_id = src.unit_id
      AND e2.entry_date > src.entry_date
      AND e2.suppression_reason IS NULL
    ORDER BY e2.entry_date
    LIMIT 1;

    CONTINUE WHEN v_target IS NULL;

    FOR item IN
      SELECT * FROM tracker_entry_items
      WHERE entry_id = src.id
        AND kind IN ('planned', 'next_step', 'blocker')
        AND status IN ('not_started', 'in_progress', 'blocked')
    LOOP
      -- The unique index on carried_from_item_id makes this idempotent: a
      -- second run of the job finds the copy already exists and does nothing.
      INSERT INTO tracker_entry_items (
        entry_id, kind, title, detail, status, sort_order,
        linked_task_id, linked_project_id, linked_goal_id,
        source, carried_from_item_id, carry_count
      ) VALUES (
        v_target,
        CASE WHEN item.kind = 'next_step' THEN 'planned' ELSE item.kind END,
        item.title, item.detail,
        CASE WHEN item.status = 'blocked' THEN 'blocked' ELSE 'not_started' END,
        item.sort_order,
        item.linked_task_id, item.linked_project_id, item.linked_goal_id,
        'carry_over', item.id, item.carry_count + 1
      )
      ON CONFLICT (carried_from_item_id) WHERE carried_from_item_id IS NOT NULL
      DO NOTHING;

      IF FOUND THEN
        UPDATE tracker_entry_items SET status = 'carried_over' WHERE id = item.id;
        v_count := v_count + 1;
      END IF;
    END LOOP;

    -- An entry whose items all moved on is carried_over, not done. Marking it
    -- done would claim the work finished.
    UPDATE tracker_entries
       SET status = 'carried_over'
     WHERE id = src.id
       AND status IN ('not_started', 'in_progress', 'blocked')
       AND EXISTS (
         SELECT 1 FROM tracker_entry_items i
         WHERE i.entry_id = src.id AND i.status = 'carried_over'
       );
  END LOOP;

  RETURN v_count;
END;
$$;

-- =============================================================================
-- tracker_submit_entry / tracker_review_action
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tracker_submit_entry(
  p_entry_id uuid,
  p_employee_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  e         tracker_entries%ROWTYPE;
  c         tracking_cycles%ROWTYPE;
  v_status  text;
  v_late    boolean;
BEGIN
  SELECT * INTO e FROM tracker_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tracker.not_found' USING ERRCODE = 'P0001'; END IF;
  IF e.employee_id <> p_employee_id THEN
    RAISE EXCEPTION 'tracker.not_owner' USING ERRCODE = 'P0001';
  END IF;
  IF e.status = 'waived' OR e.status = 'not_working_day' THEN
    RAISE EXCEPTION 'tracker.not_required' USING ERRCODE = 'P0001';
  END IF;
  IF e.review_status = 'accepted' THEN
    RAISE EXCEPTION 'tracker.already_accepted' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO c FROM tracking_cycles WHERE id = e.cycle_id;

  -- Backdating window. Filling in last month on the quiet is how a tracker
  -- stops being a record of what happened.
  IF e.entry_date < (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date - c.allow_backdate_days THEN
    RAISE EXCEPTION 'tracker.too_late_to_edit' USING ERRCODE = 'P0001';
  END IF;

  v_late := e.deadline_at IS NOT NULL AND now() > e.deadline_at;

  -- Submitting clears 'missed': the day was late, not skipped, and is_late
  -- records which. Overwriting the history would be wrong, but the entry's
  -- CURRENT status should describe what is now true.
  v_status := CASE
    WHEN EXISTS (
      SELECT 1 FROM tracker_entry_items i
      WHERE i.entry_id = p_entry_id AND i.status = 'blocked'
    ) THEN 'blocked'
    WHEN EXISTS (
      SELECT 1 FROM tracker_entry_items i
      WHERE i.entry_id = p_entry_id
        AND i.kind IN ('planned', 'next_step')
        AND i.status IN ('not_started', 'in_progress')
    ) THEN 'in_progress'
    ELSE 'done'
  END;

  UPDATE tracker_entries
     SET status = v_status,
         submitted_at = now(),
         is_late = v_late,
         review_status = CASE WHEN COALESCE(c.requires_review, true) THEN 'pending' ELSE 'accepted' END,
         version = version + 1
   WHERE id = p_entry_id;

  INSERT INTO tracker_reviews (
    entry_id, reviewer_employee_id, action, from_status, to_status, entry_version
  ) VALUES (
    p_entry_id, p_employee_id, 'submit', e.status, v_status, e.version + 1
  );

  RETURN v_status;
END;
$$;

-- Snapshot the entry AND its items before every decision, so returning never
-- destroys what was there. The author edits forward; the snapshot stays.
CREATE OR REPLACE FUNCTION public.tracker_review_action(
  p_entry_id uuid,
  p_action text,
  p_actor_employee_id uuid,
  p_actor_role text,
  p_actor_clerk_id text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  e          tracker_entries%ROWTYPE;
  v_snapshot jsonb;
  v_review   text;
  v_status   text;
BEGIN
  SELECT * INTO e FROM tracker_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tracker.not_found' USING ERRCODE = 'P0001'; END IF;

  IF p_actor_role NOT IN ('reviewer', 'admin') THEN
    RAISE EXCEPTION 'tracker.not_permitted' USING ERRCODE = 'P0001';
  END IF;
  IF p_action = 'waive' AND p_actor_role <> 'admin' THEN
    RAISE EXCEPTION 'tracker.not_permitted' USING ERRCODE = 'P0001';
  END IF;
  IF p_action = 'return' AND (p_note IS NULL OR length(btrim(p_note)) = 0) THEN
    RAISE EXCEPTION 'tracker.reason_required' USING ERRCODE = 'P0001';
  END IF;
  IF e.review_status = 'accepted' AND p_action NOT IN ('reopen') THEN
    RAISE EXCEPTION 'tracker.already_accepted' USING ERRCODE = 'P0001';
  END IF;
  IF e.submitted_at IS NULL AND p_action IN ('start_review', 'return', 'accept') THEN
    RAISE EXCEPTION 'tracker.not_submitted' USING ERRCODE = 'P0001';
  END IF;

  SELECT jsonb_build_object(
    'entry', to_jsonb(e),
    'items', COALESCE(
      (SELECT jsonb_agg(to_jsonb(i) ORDER BY i.sort_order, i.created_at)
       FROM tracker_entry_items i WHERE i.entry_id = p_entry_id),
      '[]'::jsonb)
  ) INTO v_snapshot;

  v_review := CASE p_action
    WHEN 'start_review' THEN 'under_review'
    WHEN 'return' THEN 'returned'
    WHEN 'accept' THEN 'accepted'
    WHEN 'reopen' THEN 'pending'
    ELSE e.review_status
  END;

  v_status := CASE WHEN p_action = 'waive' THEN 'waived' ELSE e.status END;

  UPDATE tracker_entries
     SET review_status = v_review,
         status = v_status,
         suppression_reason = CASE WHEN p_action = 'waive' THEN 'waived' ELSE suppression_reason END,
         reviewed_at = CASE WHEN p_action IN ('accept', 'return') THEN now() ELSE reviewed_at END,
         reviewed_by_employee_id = CASE WHEN p_action IN ('accept', 'return')
                                        THEN p_actor_employee_id ELSE reviewed_by_employee_id END,
         returned_count = CASE WHEN p_action = 'return' THEN returned_count + 1 ELSE returned_count END,
         version = version + 1
   WHERE id = p_entry_id;

  INSERT INTO tracker_reviews (
    entry_id, reviewer_employee_id, reviewer_clerk_id, action,
    from_status, to_status, note, entry_snapshot, entry_version
  ) VALUES (
    p_entry_id, p_actor_employee_id, p_actor_clerk_id, p_action,
    e.review_status, v_review, p_note, v_snapshot, e.version
  );

  RETURN v_review;
END;
$$;

-- =============================================================================
-- tracker_build_weekly_summary — the rollup
-- =============================================================================
-- Recomputes the aggregate from the week's entries. Never touches the authored
-- prose, and never touches an accepted or locked summary: a signed-off review
-- is a record, and silently changing its numbers underneath a manager who
-- already read them is worse than it being slightly stale.
CREATE OR REPLACE FUNCTION public.tracker_build_weekly_summary(
  p_cycle_id uuid,
  p_unit_id uuid,
  p_week_start date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_week_start date;
  v_week_end   date;
  v_id         uuid;
  v_status     text;
  v_employee   uuid;
  v_agg        jsonb;
BEGIN
  -- Weeks start Monday, matching working_weekdays' ISO numbering.
  v_week_start := p_week_start - (EXTRACT(ISODOW FROM p_week_start)::integer - 1);
  v_week_end := v_week_start + 6;

  SELECT employee_id INTO v_employee
  FROM tracking_assignments
  WHERE cycle_id = p_cycle_id AND unit_id = p_unit_id AND role = 'owner' AND is_active
  ORDER BY effective_from DESC LIMIT 1;

  INSERT INTO weekly_summaries (cycle_id, unit_id, employee_id, week_start, week_end)
  VALUES (p_cycle_id, p_unit_id, v_employee, v_week_start, v_week_end)
  ON CONFLICT (cycle_id, unit_id, week_start) DO UPDATE SET employee_id = EXCLUDED.employee_id
  RETURNING id, status INTO v_id, v_status;

  IF v_status IN ('accepted', 'locked') THEN
    RETURN v_id;
  END IF;

  SELECT jsonb_build_object(
    'entries_total', count(*),
    'entries_done', count(*) FILTER (WHERE e.status = 'done'),
    'entries_blocked', count(*) FILTER (WHERE e.status = 'blocked'),
    'entries_missed', count(*) FILTER (WHERE e.status = 'missed'),
    'entries_carried_over', count(*) FILTER (WHERE e.status = 'carried_over'),
    'entries_not_working', count(*) FILTER (WHERE e.status = 'not_working_day'),
    'entries_waived', count(*) FILTER (WHERE e.status = 'waived'),
    'entries_submitted', count(*) FILTER (WHERE e.submitted_at IS NOT NULL),
    'entries_late', count(*) FILTER (WHERE e.is_late),
    -- Working days only. Counting holidays in the denominator would make every
    -- week with a public holiday look like a week somebody skipped.
    'working_days', count(*) FILTER (WHERE e.suppression_reason IS NULL),
    'items_completed', COALESCE((
      SELECT count(*) FROM tracker_entry_items i
      JOIN tracker_entries e2 ON e2.id = i.entry_id
      WHERE e2.cycle_id = p_cycle_id AND e2.unit_id = p_unit_id
        AND e2.entry_date BETWEEN v_week_start AND v_week_end
        AND i.status = 'done'), 0),
    'items_carried', COALESCE((
      SELECT count(*) FROM tracker_entry_items i
      JOIN tracker_entries e2 ON e2.id = i.entry_id
      WHERE e2.cycle_id = p_cycle_id AND e2.unit_id = p_unit_id
        AND e2.entry_date BETWEEN v_week_start AND v_week_end
        AND i.carried_from_item_id IS NOT NULL), 0),
    'blockers_open', COALESCE((
      SELECT count(*) FROM tracker_entry_items i
      JOIN tracker_entries e2 ON e2.id = i.entry_id
      WHERE e2.cycle_id = p_cycle_id AND e2.unit_id = p_unit_id
        AND e2.entry_date BETWEEN v_week_start AND v_week_end
        AND i.kind = 'blocker' AND i.status <> 'done'), 0),
    'logged_minutes', COALESCE(SUM((e.prefill ->> 'logged_minutes')::integer), 0),
    'computed_at', now()
  ) INTO v_agg
  FROM tracker_entries e
  WHERE e.cycle_id = p_cycle_id
    AND e.unit_id = p_unit_id
    AND e.entry_date BETWEEN v_week_start AND v_week_end;

  UPDATE weekly_summaries SET aggregate = COALESCE(v_agg, '{}'::jsonb) WHERE id = v_id;
  RETURN v_id;
END;
$$;

-- =============================================================================
-- Access control
-- =============================================================================
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'tracker_resolve_schedule(uuid, uuid)',
    'tracker_day_state(uuid, uuid, date)',
    'tracker_deadline_at(uuid, uuid, date)',
    'tracker_generate_entries(date)',
    'tracker_prefill_entry(uuid)',
    'tracker_mark_missed(timestamptz)',
    'tracker_carry_over(date)',
    'tracker_submit_entry(uuid, uuid)',
    'tracker_review_action(uuid, text, uuid, text, text, text)',
    'tracker_build_weekly_summary(uuid, uuid, date)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';
