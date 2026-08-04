-- Goals and Performance — authorization, the stage machine, and the audit rules.
--
-- Every function here is SECURITY DEFINER and every one of them is revoked from
-- PUBLIC, anon and authenticated at the bottom of the file. They run as the
-- owner precisely so they can enforce a rule the caller cannot skip, which
-- makes them the last thing that should be callable from a browser.
--
-- ERROR TOKENS. Failures raise ERRCODE P0001 with a stable dotted token and
-- NOTHING ELSE. A review's contents are the most sensitive text in this system;
-- a message like 'permission denied for review of Jane Mushi' would leak the
-- fact of the review, its subject, and often its outcome. The TypeScript side
-- maps tokens to sentences we wrote.

-- =============================================================================
-- Who is whose manager
-- =============================================================================
--
-- DIRECT REPORTS ONLY. "Managers only review eligible direct reports" is the
-- acceptance criterion, and this is where it is decided. Walking the manager
-- chain would let a department head open the review of somebody four levels
-- down whom they have never worked with. If a skip-level review is wanted, it
-- is a review row with kind='skip_level' and a named reviewer, not an implicit
-- consequence of the org chart.
CREATE OR REPLACE FUNCTION public.performance_is_manager_of(
  p_manager_id uuid,
  p_employee_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workforce_employees e
    WHERE e.id = p_employee_id
      AND e.manager_id = p_manager_id
      AND p_manager_id IS NOT NULL
      AND p_manager_id <> p_employee_id
  );
$$;

-- =============================================================================
-- Goal visibility
-- =============================================================================
--
-- Looser than a review on purpose. A company goal everybody can read is the
-- point of having one. A private goal is still private, and an employee goal
-- defaults to 'manager', meaning the owner and their manager.
CREATE OR REPLACE FUNCTION public.goal_is_visible_to(
  p_goal_id uuid,
  p_employee_id uuid,
  p_is_admin boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_is_admin OR EXISTS (
    SELECT 1
    FROM goals g
    LEFT JOIN workforce_employees viewer ON viewer.id = p_employee_id
    WHERE g.id = p_goal_id
      AND g.deleted_at IS NULL
      AND (
        g.owner_employee_id = p_employee_id
        OR g.created_by_employee_id = p_employee_id
        -- A manager sees their direct reports' goals whatever the setting,
        -- short of 'private'.
        OR (g.visibility <> 'private' AND performance_is_manager_of(p_employee_id, g.owner_employee_id))
        OR g.visibility = 'organisation'
        OR (g.visibility = 'department' AND viewer.department IS NOT NULL
            AND viewer.department = COALESCE(g.department, viewer.department || '~'))
        -- Team scope resolves through the project the goal hangs off.
        OR (g.visibility = 'team' AND g.project_id IS NOT NULL
            AND project_is_visible_to(g.project_id, p_employee_id, false))
        -- Company and brand goals are the shared context everybody works
        -- against. Hiding them defeats alignment.
        OR (g.level IN ('company', 'brand') AND g.visibility <> 'private')
      )
  );
$$;

-- =============================================================================
-- Alignment: no inversions, no loops
-- =============================================================================
CREATE OR REPLACE FUNCTION public.goal_level_rank(p_level text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_level
    WHEN 'company' THEN 1
    WHEN 'brand' THEN 2
    WHEN 'department' THEN 3
    WHEN 'team' THEN 4
    WHEN 'employee' THEN 5
    ELSE 99
  END;
$$;

CREATE OR REPLACE FUNCTION public.goal_assert_alignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_level text;
  v_cycle_found boolean;
BEGIN
  IF NEW.parent_goal_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT level INTO v_parent_level FROM goals WHERE id = NEW.parent_goal_id;
  IF v_parent_level IS NULL THEN
    RAISE EXCEPTION 'goal.parent_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- A goal may not roll up to something BELOW it. A company goal that reports
  -- to an employee goal inverts the whole tree, and every rollup after it is
  -- wrong.
  IF goal_level_rank(NEW.level) < goal_level_rank(v_parent_level) THEN
    RAISE EXCEPTION 'goal.alignment_inverted' USING ERRCODE = 'P0001';
  END IF;

  -- Walk up from the proposed parent. If we arrive back at this goal, the edge
  -- closes a loop, and every goal in it becomes permanently unrollupable.
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_goal_id, 1 AS depth
    FROM goals WHERE id = NEW.parent_goal_id
    UNION ALL
    SELECT g.id, g.parent_goal_id, a.depth + 1
    FROM goals g
    JOIN ancestors a ON g.id = a.parent_goal_id
    WHERE a.depth < 50
  )
  SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = NEW.id) INTO v_cycle_found;

  IF v_cycle_found THEN
    RAISE EXCEPTION 'goal.alignment_cycle' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_goal_assert_alignment ON goals;
CREATE TRIGGER trg_goal_assert_alignment
  BEFORE INSERT OR UPDATE OF parent_goal_id, level ON goals
  FOR EACH ROW EXECUTE FUNCTION goal_assert_alignment();

-- =============================================================================
-- Key result attainment
-- =============================================================================
--
-- Six measurement types, one function. Milestone and boolean are not arithmetic
-- and are handled first; the other four are the same sum with a different unit
-- on the front, which is exactly why they share a table.
CREATE OR REPLACE FUNCTION public.key_result_attainment(p_key_result_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  kr        goal_key_results%ROWTYPE;
  v_total   integer;
  v_done    integer;
  v_span    numeric;
  v_moved   numeric;
BEGIN
  SELECT * INTO kr FROM goal_key_results WHERE id = p_key_result_id;
  IF kr.id IS NULL THEN RETURN 0; END IF;

  IF kr.measurement_type = 'boolean' THEN
    RETURN CASE WHEN kr.is_achieved THEN 100 ELSE 0 END;
  END IF;

  IF kr.measurement_type = 'milestone' THEN
    SELECT count(*), count(*) FILTER (WHERE COALESCE((m ->> 'done')::boolean, false))
      INTO v_total, v_done
    FROM jsonb_array_elements(COALESCE(kr.definition -> 'milestones', '[]'::jsonb)) m;
    IF COALESCE(v_total, 0) = 0 THEN
      RETURN CASE WHEN kr.is_achieved THEN 100 ELSE 0 END;
    END IF;
    RETURN round((v_done::numeric / v_total) * 100, 2);
  END IF;

  -- number, percentage, currency, custom_score.
  v_span := kr.target_value - kr.start_value;
  IF v_span = 0 THEN RETURN 0; END IF;
  v_moved := kr.current_value - kr.start_value;

  -- 'decrease' targets have a negative span, and dividing one by the other
  -- gives the right answer without a second branch: going from 40 to 10 with a
  -- target of 10 is -30 / -30 = 100%.
  RETURN GREATEST(0, LEAST(100, round((v_moved / v_span) * 100, 2)));
END;
$$;

-- =============================================================================
-- Goal progress
-- =============================================================================
--
-- Rolls key results up into the goal, weighted where weights were set and
-- evenly where they were not. This is arithmetic over things a human typed, and
-- it stops at the goal: nothing here writes a rating.
CREATE OR REPLACE FUNCTION public.goal_recalculate_progress(p_goal_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_method   text;
  v_weighted numeric;
  v_weights  numeric;
  v_progress numeric;
BEGIN
  SELECT measurement_method INTO v_method FROM goals WHERE id = p_goal_id;
  IF v_method IS NULL THEN
    RAISE EXCEPTION 'goal.not_found' USING ERRCODE = 'P0001';
  END IF;

  -- A goal measured some other way keeps whatever its owner typed. Overwriting
  -- it from an empty key result list would silently zero it.
  IF v_method <> 'key_results' THEN
    RETURN (SELECT progress FROM goals WHERE id = p_goal_id);
  END IF;

  SELECT
    SUM(key_result_attainment(kr.id) * CASE WHEN kr.weight > 0 THEN kr.weight ELSE 1 END),
    SUM(CASE WHEN kr.weight > 0 THEN kr.weight ELSE 1 END)
  INTO v_weighted, v_weights
  FROM goal_key_results kr
  WHERE kr.goal_id = p_goal_id;

  IF COALESCE(v_weights, 0) = 0 THEN
    RETURN (SELECT progress FROM goals WHERE id = p_goal_id);
  END IF;

  v_progress := round(v_weighted / v_weights, 2);

  UPDATE goals
     SET progress = v_progress,
         progress_source = 'key_results',
         progress_updated_at = now(),
         updated_at = now()
   WHERE id = p_goal_id;

  RETURN v_progress;
END;
$$;

-- =============================================================================
-- Weight validation against cycle policy
-- =============================================================================
--
-- Returns a verdict rather than raising, because the goal-setting screen needs
-- to SHOW somebody they are at 80 of 100 while they are still typing. The
-- raising version is the approval gate below.
CREATE OR REPLACE FUNCTION public.goal_validate_weights(
  p_employee_id uuid,
  p_cycle_id uuid
)
RETURNS TABLE (
  total_weight numeric,
  required_weight numeric,
  tolerance numeric,
  goal_count integer,
  min_goals integer,
  max_goals integer,
  is_valid boolean,
  problem text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c performance_cycles%ROWTYPE;
  v_total numeric;
  v_count integer;
BEGIN
  SELECT * INTO c FROM performance_cycles WHERE id = p_cycle_id;
  IF c.id IS NULL THEN
    RAISE EXCEPTION 'performance.cycle_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- Cancelled and deleted goals are excluded: they are part of the history but
  -- not part of what the employee is committing to.
  SELECT COALESCE(SUM(weight), 0), count(*)
    INTO v_total, v_count
  FROM goals
  WHERE owner_employee_id = p_employee_id
    AND cycle_id = p_cycle_id
    AND level = 'employee'
    AND deleted_at IS NULL
    AND status <> 'cancelled'
    AND approval_status <> 'rejected';

  total_weight := v_total;
  required_weight := c.weight_total_required;
  tolerance := c.weight_tolerance;
  goal_count := v_count;
  min_goals := c.min_goals_per_employee;
  max_goals := c.max_goals_per_employee;

  IF v_count < c.min_goals_per_employee THEN
    is_valid := false;
    problem := 'too_few_goals';
  ELSIF c.max_goals_per_employee IS NOT NULL AND v_count > c.max_goals_per_employee THEN
    is_valid := false;
    problem := 'too_many_goals';
  ELSIF abs(v_total - c.weight_total_required) > c.weight_tolerance THEN
    is_valid := false;
    problem := CASE WHEN v_total > c.weight_total_required THEN 'weight_over' ELSE 'weight_under' END;
  ELSE
    is_valid := true;
    problem := NULL;
  END IF;

  RETURN NEXT;
END;
$$;

-- =============================================================================
-- Goal writes
-- =============================================================================
CREATE OR REPLACE FUNCTION public.goal_update_progress(
  p_goal_id uuid,
  p_employee_id uuid,
  p_progress numeric,
  p_note text DEFAULT NULL,
  p_is_admin boolean DEFAULT false
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g goals%ROWTYPE;
  v_old numeric;
BEGIN
  IF p_progress IS NULL OR p_progress < 0 OR p_progress > 100 THEN
    RAISE EXCEPTION 'goal.progress_out_of_range' USING ERRCODE = 'P0001';
  END IF;

  -- Locked for the duration so two updates cannot interleave and lose one.
  SELECT * INTO g FROM goals WHERE id = p_goal_id AND deleted_at IS NULL FOR UPDATE;
  IF g.id IS NULL OR NOT goal_is_visible_to(p_goal_id, p_employee_id, p_is_admin) THEN
    RAISE EXCEPTION 'goal.not_found' USING ERRCODE = 'P0001';
  END IF;

  -- Seeing a goal is not owning it. A department goal is readable by the whole
  -- department and movable by its owner.
  IF NOT p_is_admin
     AND g.owner_employee_id IS DISTINCT FROM p_employee_id
     AND NOT performance_is_manager_of(p_employee_id, g.owner_employee_id) THEN
    RAISE EXCEPTION 'goal.not_owner' USING ERRCODE = 'P0001';
  END IF;

  IF g.status IN ('achieved', 'missed', 'cancelled') THEN
    RAISE EXCEPTION 'goal.closed' USING ERRCODE = 'P0001';
  END IF;

  v_old := g.progress;

  UPDATE goals
     SET progress = p_progress,
         progress_source = 'manual',
         progress_updated_at = now(),
         updated_at = now()
   WHERE id = p_goal_id;

  INSERT INTO goal_updates (
    goal_id, author_employee_id, update_type,
    previous_progress, new_progress, body
  ) VALUES (
    p_goal_id, p_employee_id, 'progress',
    v_old, p_progress, COALESCE(p_note, '')
  );

  RETURN p_progress;
END;
$$;

CREATE OR REPLACE FUNCTION public.goal_submit_for_approval(
  p_goal_id uuid,
  p_employee_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g goals%ROWTYPE;
  v  record;
BEGIN
  SELECT * INTO g FROM goals WHERE id = p_goal_id AND deleted_at IS NULL FOR UPDATE;
  IF g.id IS NULL OR NOT goal_is_visible_to(p_goal_id, p_employee_id, false) THEN
    RAISE EXCEPTION 'goal.not_found' USING ERRCODE = 'P0001';
  END IF;
  IF g.owner_employee_id IS DISTINCT FROM p_employee_id THEN
    RAISE EXCEPTION 'goal.not_owner' USING ERRCODE = 'P0001';
  END IF;
  IF g.approval_status = 'approved' THEN
    RAISE EXCEPTION 'goal.already_approved' USING ERRCODE = 'P0001';
  END IF;

  -- THE WEIGHT GATE. Checked here rather than on every insert, because a set of
  -- goals is only ever valid as a set.
  IF g.cycle_id IS NOT NULL AND g.level = 'employee' THEN
    SELECT * INTO v FROM goal_validate_weights(p_employee_id, g.cycle_id);
    IF NOT v.is_valid THEN
      -- USING MESSAGE rather than a format string: the token is chosen at
      -- runtime, and RAISE's '%' would want a parameter for it.
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = CASE v.problem
          WHEN 'weight_over'    THEN 'goal.weights_over'
          WHEN 'weight_under'   THEN 'goal.weights_under'
          WHEN 'too_few_goals'  THEN 'goal.too_few'
          WHEN 'too_many_goals' THEN 'goal.too_many'
          ELSE 'goal.weights_invalid'
        END;
    END IF;
  END IF;

  UPDATE goals
     SET approval_status = 'pending_approval', updated_at = now()
   WHERE id = p_goal_id;

  INSERT INTO goal_updates (goal_id, author_employee_id, update_type, body)
  VALUES (p_goal_id, p_employee_id, 'approval', 'Submitted for approval');

  RETURN 'pending_approval';
END;
$$;

CREATE OR REPLACE FUNCTION public.goal_decide_approval(
  p_goal_id uuid,
  p_manager_id uuid,
  p_decision text,
  p_note text DEFAULT NULL,
  p_is_hr boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g goals%ROWTYPE;
  v_status text;
BEGIN
  IF p_decision NOT IN ('approve', 'reject', 'request_changes') THEN
    RAISE EXCEPTION 'goal.unknown_decision' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO g FROM goals WHERE id = p_goal_id AND deleted_at IS NULL FOR UPDATE;
  IF g.id IS NULL THEN
    RAISE EXCEPTION 'goal.not_found' USING ERRCODE = 'P0001';
  END IF;

  -- Nobody approves their own goals, HR included. That is the entire point of
  -- an approval step.
  IF g.owner_employee_id = p_manager_id THEN
    RAISE EXCEPTION 'goal.self_approval' USING ERRCODE = 'P0001';
  END IF;

  IF NOT p_is_hr AND NOT performance_is_manager_of(p_manager_id, g.owner_employee_id) THEN
    RAISE EXCEPTION 'goal.not_manager' USING ERRCODE = 'P0001';
  END IF;

  IF g.approval_status <> 'pending_approval' THEN
    RAISE EXCEPTION 'goal.not_pending' USING ERRCODE = 'P0001';
  END IF;

  IF p_decision <> 'approve' AND length(btrim(COALESCE(p_note, ''))) = 0 THEN
    RAISE EXCEPTION 'goal.decision_note_required' USING ERRCODE = 'P0001';
  END IF;

  v_status := CASE p_decision
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    ELSE 'changes_requested'
  END;

  UPDATE goals
     SET approval_status = v_status,
         approved_by_employee_id = p_manager_id,
         approved_at = CASE WHEN p_decision = 'approve' THEN now() ELSE NULL END,
         approval_note = p_note,
         status = CASE WHEN p_decision = 'approve' AND status = 'not_started'
                       THEN 'on_track' ELSE status END,
         updated_at = now()
   WHERE id = p_goal_id;

  INSERT INTO goal_updates (goal_id, author_employee_id, update_type, body)
  VALUES (p_goal_id, p_manager_id, 'approval',
          v_status || COALESCE(': ' || p_note, ''));

  RETURN v_status;
END;
$$;

-- Append-only history. A progress log that can be rewritten proves nothing at
-- review time, which is the only time anybody reads it.
CREATE OR REPLACE FUNCTION public.goal_updates_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'goal.history_immutable' USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_goal_updates_append_only ON goal_updates;
CREATE TRIGGER trg_goal_updates_append_only
  BEFORE UPDATE OR DELETE ON goal_updates
  FOR EACH ROW EXECUTE FUNCTION goal_updates_append_only();

-- =============================================================================
-- The performance cycle stage machine
-- =============================================================================
CREATE OR REPLACE FUNCTION public.performance_stage_rank(p_stage text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_stage
    WHEN 'goal_setting'            THEN 1
    WHEN 'manager_approval'        THEN 2
    WHEN 'active_cycle'            THEN 3
    WHEN 'mid_cycle_check_in'      THEN 4
    WHEN 'self_review'             THEN 5
    WHEN 'manager_review'          THEN 6
    WHEN 'calibration'             THEN 7
    WHEN 'final_review'            THEN 8
    WHEN 'employee_acknowledgment' THEN 9
    WHEN 'development_planning'    THEN 10
    WHEN 'closed'                  THEN 11
    ELSE 0
  END;
$$;

-- The cycle moves forward one stage at a time, and only HR moves it. Going
-- backwards is possible but only before calibration: once managers have
-- compared people against each other, reopening goal setting would change the
-- basis they were compared on.
CREATE OR REPLACE FUNCTION public.performance_cycle_advance(
  p_cycle_id uuid,
  p_to_stage text,
  p_actor_employee_id uuid,
  p_is_hr boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c performance_cycles%ROWTYPE;
  v_from integer;
  v_to   integer;
BEGIN
  IF NOT p_is_hr THEN
    RAISE EXCEPTION 'performance.not_permitted' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO c FROM performance_cycles WHERE id = p_cycle_id FOR UPDATE;
  IF c.id IS NULL THEN
    RAISE EXCEPTION 'performance.cycle_not_found' USING ERRCODE = 'P0001';
  END IF;

  v_from := performance_stage_rank(c.stage);
  v_to   := performance_stage_rank(p_to_stage);

  IF v_to = 0 THEN
    RAISE EXCEPTION 'performance.unknown_stage' USING ERRCODE = 'P0001';
  END IF;
  IF c.stage = 'closed' THEN
    RAISE EXCEPTION 'performance.cycle_closed' USING ERRCODE = 'P0001';
  END IF;
  -- One stage at a time forwards. Skipping self-review to get to calibration
  -- means calibrating on nothing.
  IF v_to > v_from + 1 THEN
    RAISE EXCEPTION 'performance.stage_skipped' USING ERRCODE = 'P0001';
  END IF;
  IF v_to < v_from AND v_from >= performance_stage_rank('calibration') THEN
    RAISE EXCEPTION 'performance.stage_locked' USING ERRCODE = 'P0001';
  END IF;

  UPDATE performance_cycles
     SET stage = p_to_stage,
         stage_entered_at = now(),
         closed_at = CASE WHEN p_to_stage = 'closed' THEN now() ELSE NULL END,
         closed_by_employee_id = CASE WHEN p_to_stage = 'closed' THEN p_actor_employee_id ELSE NULL END,
         updated_at = now()
   WHERE id = p_cycle_id;

  -- Closing the cycle closes every finalised review under it. A review left
  -- open under a closed cycle is a door nobody is watching.
  IF p_to_stage = 'closed' THEN
    UPDATE performance_reviews
       SET state = 'closed', closed_at = now(), updated_at = now()
     WHERE cycle_id = p_cycle_id
       AND state IN ('finalised', 'acknowledged');
  END IF;

  RETURN p_to_stage;
END;
$$;

-- =============================================================================
-- Review visibility — the strictest rule in the codebase
-- =============================================================================
--
-- FOUR PEOPLE, AND NO FIFTH. The subject, the named reviewer, the subject's
-- DIRECT manager, and HR. Not the department head, not a project lead, not
-- somebody who happens to hold workforce.read.
--
-- A self-review is narrower still: it is the employee's own words about
-- themselves, and their manager reads it because it was written for them.
CREATE OR REPLACE FUNCTION public.performance_can_view_review(
  p_review_id uuid,
  p_employee_id uuid,
  p_is_hr boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_is_hr OR EXISTS (
    SELECT 1
    FROM performance_reviews r
    WHERE r.id = p_review_id
      AND (
        r.employee_id = p_employee_id
        OR r.reviewer_employee_id = p_employee_id
        OR performance_is_manager_of(p_employee_id, r.employee_id)
      )
  );
$$;

-- May this person WRITE the review? Narrower again: the subject writes their
-- own self-review, the named reviewer writes theirs, and HR can act throughout.
-- A direct manager who is not the named reviewer can read but not write, which
-- is what makes the frozen reviewer_employee_id meaningful.
CREATE OR REPLACE FUNCTION public.performance_can_edit_review(
  p_review_id uuid,
  p_employee_id uuid,
  p_is_hr boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_is_hr OR EXISTS (
    SELECT 1
    FROM performance_reviews r
    WHERE r.id = p_review_id
      AND (
        (r.kind = 'self' AND r.employee_id = p_employee_id)
        OR (r.kind <> 'self' AND r.reviewer_employee_id = p_employee_id)
      )
  );
$$;

-- Which SECTIONS this reader may see.
--
-- 'calibration_only' is filtered for the employee here and nowhere else, so
-- there is one place to check rather than a rule every caller must remember.
-- Note the employee never sees it even when the review is closed and
-- acknowledged: closing does not declassify it.
CREATE OR REPLACE FUNCTION public.performance_visible_sections(
  p_review_id uuid,
  p_employee_id uuid,
  p_is_hr boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  code text,
  title text,
  section_type text,
  visibility text,
  body text,
  author_employee_id uuid,
  sort_order integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r performance_reviews%ROWTYPE;
  v_is_subject boolean;
  v_is_manager boolean;
BEGIN
  SELECT * INTO r FROM performance_reviews WHERE performance_reviews.id = p_review_id;
  IF r.id IS NULL OR NOT performance_can_view_review(p_review_id, p_employee_id, p_is_hr) THEN
    RAISE EXCEPTION 'performance.review_not_found' USING ERRCODE = 'P0001';
  END IF;

  v_is_subject := (r.employee_id = p_employee_id);
  v_is_manager := (r.reviewer_employee_id = p_employee_id)
                  OR performance_is_manager_of(p_employee_id, r.employee_id);

  RETURN QUERY
  SELECT s.id, s.code, s.title, s.section_type, s.visibility, s.body,
         s.author_employee_id, s.sort_order
  FROM review_sections s
  WHERE s.review_id = p_review_id
    AND (
      p_is_hr
      OR (s.visibility = 'employee_visible' AND (v_is_subject OR v_is_manager))
      OR (s.visibility = 'manager_only' AND v_is_manager AND NOT v_is_subject)
      OR (s.visibility = 'calibration_only' AND v_is_manager AND NOT v_is_subject)
    )
  ORDER BY s.sort_order, s.code;
END;
$$;

-- =============================================================================
-- Ratings — append-only, never computed
-- =============================================================================
--
-- Setting a rating that already exists SUPERSEDES it: the old row stays, gains
-- superseded_at, and points forwards. Reading "the rating" means reading the
-- live row; reading "what happened" means reading all of them.
CREATE OR REPLACE FUNCTION public.review_set_rating(
  p_review_id uuid,
  p_employee_id uuid,
  p_competency_id uuid,
  p_goal_id uuid,
  p_rating numeric,
  p_rationale text,
  p_change_reason text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_is_hr boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r         performance_reviews%ROWTYPE;
  c         performance_cycles%ROWTYPE;
  v_prev    review_ratings%ROWTYPE;
  v_new_id  uuid;
  v_source  text;
BEGIN
  IF num_nonnulls(p_competency_id, p_goal_id) <> 1 THEN
    RAISE EXCEPTION 'performance.rating_subject_required' USING ERRCODE = 'P0001';
  END IF;
  IF length(btrim(COALESCE(p_rationale, ''))) = 0 THEN
    RAISE EXCEPTION 'performance.rationale_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO r FROM performance_reviews WHERE id = p_review_id FOR UPDATE;
  IF r.id IS NULL OR NOT performance_can_view_review(p_review_id, p_employee_id, p_is_hr) THEN
    RAISE EXCEPTION 'performance.review_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF NOT performance_can_edit_review(p_review_id, p_employee_id, p_is_hr) THEN
    RAISE EXCEPTION 'performance.not_reviewer' USING ERRCODE = 'P0001';
  END IF;

  -- THE IMMUTABILITY RULE. A closed review takes no writes. The only way in is
  -- review_open_correction(), which needs HR and records a reason; it leaves
  -- the review in 'correction_open', which this permits.
  IF r.state = 'closed' THEN
    RAISE EXCEPTION 'performance.review_closed' USING ERRCODE = 'P0001';
  END IF;
  IF r.state IN ('acknowledged', 'finalised') AND NOT p_is_hr THEN
    RAISE EXCEPTION 'performance.review_finalised' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO c FROM performance_cycles WHERE id = r.cycle_id;

  IF p_rating < c.rating_scale_min OR p_rating > c.rating_scale_max THEN
    RAISE EXCEPTION 'performance.rating_out_of_scale' USING ERRCODE = 'P0001';
  END IF;

  v_source := COALESCE(
    p_source,
    CASE
      WHEN r.state = 'correction_open' THEN 'hr_correction'
      WHEN r.kind = 'self' THEN 'self'
      WHEN r.kind = 'skip_level' THEN 'skip_level'
      ELSE 'manager'
    END
  );

  SELECT * INTO v_prev
  FROM review_ratings
  WHERE review_id = p_review_id
    AND superseded_at IS NULL
    AND ((p_competency_id IS NOT NULL AND competency_id = p_competency_id)
      OR (p_goal_id IS NOT NULL AND goal_id = p_goal_id))
  FOR UPDATE;

  IF v_prev.id IS NOT NULL AND length(btrim(COALESCE(p_change_reason, ''))) = 0 THEN
    -- Changing a rating somebody has already seen without saying why is the
    -- exact thing the audit exists to prevent.
    RAISE EXCEPTION 'performance.change_reason_required' USING ERRCODE = 'P0001';
  END IF;

  -- ORDER MATTERS. The id is minted first so the OLD row can be retired
  -- BEFORE the new one is inserted. The partial unique index counts every row
  -- with superseded_at IS NULL, so inserting first would put two live ratings
  -- on the same competency in the table at once and collide with it. Retiring
  -- first also keeps the append-only trigger to a single UPDATE, which is all
  -- it permits.
  v_new_id := uuid_generate_v4();

  IF v_prev.id IS NOT NULL THEN
    UPDATE review_ratings
       SET superseded_at = now(), superseded_by_rating_id = v_new_id
     WHERE id = v_prev.id;
  END IF;

  INSERT INTO review_ratings (
    id, review_id, competency_id, goal_id, rating, rating_label,
    scale_min, scale_max, rated_by_employee_id, source, rationale,
    supersedes_rating_id, change_reason
  ) VALUES (
    v_new_id, p_review_id, p_competency_id, p_goal_id, p_rating,
    (SELECT l ->> 'label' FROM jsonb_array_elements(c.rating_scale_labels) l
      WHERE (l ->> 'value')::numeric = p_rating LIMIT 1),
    c.rating_scale_min, c.rating_scale_max, p_employee_id, v_source, p_rationale,
    v_prev.id, p_change_reason
  );

  RETURN v_new_id;
END;
$$;

-- Append-only, with one exception: stamping a row as superseded. Everything
-- else about a rating row is frozen from the moment it is written.
CREATE OR REPLACE FUNCTION public.review_ratings_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'performance.rating_immutable' USING ERRCODE = 'P0001';
  END IF;

  IF OLD.superseded_at IS NOT NULL THEN
    RAISE EXCEPTION 'performance.rating_immutable' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.superseded_at IS NULL THEN
    RAISE EXCEPTION 'performance.rating_immutable' USING ERRCODE = 'P0001';
  END IF;

  -- Every other column must be untouched.
  IF (NEW.review_id, NEW.competency_id, NEW.goal_id, NEW.rating, NEW.rationale,
      NEW.rated_by_employee_id, NEW.source, NEW.scale_min, NEW.scale_max,
      NEW.created_at)
     IS DISTINCT FROM
     (OLD.review_id, OLD.competency_id, OLD.goal_id, OLD.rating, OLD.rationale,
      OLD.rated_by_employee_id, OLD.source, OLD.scale_min, OLD.scale_max,
      OLD.created_at) THEN
    RAISE EXCEPTION 'performance.rating_immutable' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_review_ratings_append_only ON review_ratings;
CREATE TRIGGER trg_review_ratings_append_only
  BEFORE UPDATE OR DELETE ON review_ratings
  FOR EACH ROW EXECUTE FUNCTION review_ratings_append_only();

-- Sections of a closed review are frozen too, or the narrative could be edited
-- around a rating that cannot be.
CREATE OR REPLACE FUNCTION public.review_sections_respect_closure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state text;
BEGIN
  SELECT state INTO v_state FROM performance_reviews
  WHERE id = COALESCE(NEW.review_id, OLD.review_id);

  IF v_state = 'closed' THEN
    RAISE EXCEPTION 'performance.review_closed' USING ERRCODE = 'P0001';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_review_sections_closure ON review_sections;
CREATE TRIGGER trg_review_sections_closure
  BEFORE INSERT OR UPDATE OR DELETE ON review_sections
  FOR EACH ROW EXECUTE FUNCTION review_sections_respect_closure();

-- =============================================================================
-- Review lifecycle
-- =============================================================================
CREATE OR REPLACE FUNCTION public.review_submit(
  p_review_id uuid,
  p_employee_id uuid,
  p_is_hr boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r performance_reviews%ROWTYPE;
BEGIN
  SELECT * INTO r FROM performance_reviews WHERE id = p_review_id FOR UPDATE;
  IF r.id IS NULL OR NOT performance_can_view_review(p_review_id, p_employee_id, p_is_hr) THEN
    RAISE EXCEPTION 'performance.review_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF NOT performance_can_edit_review(p_review_id, p_employee_id, p_is_hr) THEN
    RAISE EXCEPTION 'performance.not_reviewer' USING ERRCODE = 'P0001';
  END IF;
  IF r.state NOT IN ('not_started', 'in_progress') THEN
    RAISE EXCEPTION 'performance.already_submitted' USING ERRCODE = 'P0001';
  END IF;

  UPDATE performance_reviews
     SET state = 'submitted', submitted_at = now(), updated_at = now()
   WHERE id = p_review_id;

  RETURN 'submitted';
END;
$$;

CREATE OR REPLACE FUNCTION public.review_finalise(
  p_review_id uuid,
  p_employee_id uuid,
  p_overall_rating numeric,
  p_summary text,
  p_is_hr boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r performance_reviews%ROWTYPE;
  c performance_cycles%ROWTYPE;
BEGIN
  SELECT * INTO r FROM performance_reviews WHERE id = p_review_id FOR UPDATE;
  IF r.id IS NULL OR NOT performance_can_view_review(p_review_id, p_employee_id, p_is_hr) THEN
    RAISE EXCEPTION 'performance.review_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF NOT performance_can_edit_review(p_review_id, p_employee_id, p_is_hr) THEN
    RAISE EXCEPTION 'performance.not_reviewer' USING ERRCODE = 'P0001';
  END IF;

  -- Nobody finalises their own manager review. A self-review is finalised by
  -- its subject because that is what a self-review is.
  IF r.kind <> 'self' AND r.employee_id = p_employee_id THEN
    RAISE EXCEPTION 'performance.self_review_not_permitted' USING ERRCODE = 'P0001';
  END IF;

  IF r.state = 'closed' THEN
    RAISE EXCEPTION 'performance.review_closed' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO c FROM performance_cycles WHERE id = r.cycle_id;
  IF p_overall_rating IS NOT NULL
     AND (p_overall_rating < c.rating_scale_min OR p_overall_rating > c.rating_scale_max) THEN
    RAISE EXCEPTION 'performance.rating_out_of_scale' USING ERRCODE = 'P0001';
  END IF;

  -- An overall rating with nothing under it is a number somebody made up. At
  -- least one component rating must exist first.
  IF p_overall_rating IS NOT NULL AND r.kind <> 'self' AND NOT EXISTS (
    SELECT 1 FROM review_ratings
    WHERE review_id = p_review_id AND superseded_at IS NULL
  ) THEN
    RAISE EXCEPTION 'performance.no_component_ratings' USING ERRCODE = 'P0001';
  END IF;

  UPDATE performance_reviews
     SET state = 'finalised',
         overall_rating = p_overall_rating,
         overall_rating_label = (
           SELECT l ->> 'label' FROM jsonb_array_elements(c.rating_scale_labels) l
           WHERE (l ->> 'value')::numeric = p_overall_rating LIMIT 1
         ),
         rating_scale_min = c.rating_scale_min,
         rating_scale_max = c.rating_scale_max,
         summary = COALESCE(p_summary, summary),
         finalised_at = now(),
         finalised_by_employee_id = p_employee_id,
         correction_opened_at = NULL,
         updated_at = now()
   WHERE id = p_review_id;

  RETURN 'finalised';
END;
$$;

-- Only the subject acknowledges, and acknowledging is not agreeing.
CREATE OR REPLACE FUNCTION public.review_acknowledge(
  p_review_id uuid,
  p_employee_id uuid,
  p_note text DEFAULT NULL,
  p_disagrees boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r performance_reviews%ROWTYPE;
BEGIN
  SELECT * INTO r FROM performance_reviews WHERE id = p_review_id FOR UPDATE;
  IF r.id IS NULL OR NOT performance_can_view_review(p_review_id, p_employee_id, false) THEN
    RAISE EXCEPTION 'performance.review_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- A manager cannot acknowledge on somebody's behalf. That signature has to
  -- be the employee's or it means nothing.
  IF r.employee_id <> p_employee_id THEN
    RAISE EXCEPTION 'performance.not_subject' USING ERRCODE = 'P0001';
  END IF;
  IF r.state <> 'finalised' THEN
    RAISE EXCEPTION 'performance.not_finalised' USING ERRCODE = 'P0001';
  END IF;
  IF p_disagrees AND length(btrim(COALESCE(p_note, ''))) = 0 THEN
    RAISE EXCEPTION 'performance.disagreement_note_required' USING ERRCODE = 'P0001';
  END IF;

  UPDATE performance_reviews
     SET state = 'acknowledged',
         acknowledged_at = now(),
         acknowledgment_note = p_note,
         employee_disagrees = p_disagrees,
         updated_at = now()
   WHERE id = p_review_id;

  RETURN 'acknowledged';
END;
$$;

-- THE CORRECTION WORKFLOW. The one authorized door into a closed review.
-- HR only, a reason is mandatory, and the reason is written onto the review
-- where the employee can see it.
CREATE OR REPLACE FUNCTION public.review_open_correction(
  p_review_id uuid,
  p_employee_id uuid,
  p_reason text,
  p_is_hr boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r performance_reviews%ROWTYPE;
BEGIN
  IF NOT p_is_hr THEN
    RAISE EXCEPTION 'performance.not_permitted' USING ERRCODE = 'P0001';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'performance.correction_reason_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO r FROM performance_reviews WHERE id = p_review_id FOR UPDATE;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'performance.review_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF r.state NOT IN ('closed', 'acknowledged', 'finalised') THEN
    RAISE EXCEPTION 'performance.nothing_to_correct' USING ERRCODE = 'P0001';
  END IF;

  UPDATE performance_reviews
     SET state = 'correction_open',
         correction_opened_at = now(),
         correction_opened_by_employee_id = p_employee_id,
         correction_reason = p_reason,
         updated_at = now()
   WHERE id = p_review_id;

  RETURN 'correction_open';
END;
$$;

-- =============================================================================
-- Feedback visibility
-- =============================================================================
--
-- Three separate questions, and they have different answers:
--   can you see that feedback was REQUESTED,
--   can you see the ANSWER,
--   can you see WHO wrote it.
-- Collapsing them is how an anonymous 360 stops being anonymous.
CREATE OR REPLACE FUNCTION public.feedback_can_view_response(
  p_request_id uuid,
  p_employee_id uuid,
  p_is_hr boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_is_hr OR EXISTS (
    SELECT 1 FROM feedback_requests q
    WHERE q.id = p_request_id
      AND (
        -- The person who wrote it always reads back their own words.
        q.respondent_employee_id = p_employee_id
        -- The subject, but ONLY when the request was marked as shared. This
        -- clause is written to be exhaustive for the subject: people usually
        -- request their own 360, so a plain OR on requested_by would hand them
        -- the very responses somebody marked as not for them.
        OR (q.subject_employee_id = p_employee_id AND q.shared_with_subject)
        OR (q.subject_employee_id <> p_employee_id AND (
              -- The person who asked for it.
              q.requested_by_employee_id = p_employee_id
              -- The subject's direct manager, because they write the review.
              OR performance_is_manager_of(p_employee_id, q.subject_employee_id)
            ))
      )
  );
$$;

-- Feedback for one subject, with anonymity applied at READ time.
CREATE OR REPLACE FUNCTION public.feedback_for_subject(
  p_subject_employee_id uuid,
  p_viewer_employee_id uuid,
  p_cycle_id uuid DEFAULT NULL,
  p_is_hr boolean DEFAULT false
)
RETURNS TABLE (
  request_id uuid,
  relationship text,
  is_anonymous boolean,
  status text,
  respondent_label text,
  strengths text,
  improvements text,
  overall_score integer,
  submitted_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_subject boolean := (p_subject_employee_id = p_viewer_employee_id);
  v_is_manager boolean := performance_is_manager_of(p_viewer_employee_id, p_subject_employee_id);
BEGIN
  IF NOT (p_is_hr OR v_is_subject OR v_is_manager) THEN
    RAISE EXCEPTION 'performance.feedback_not_permitted' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    q.id,
    q.relationship,
    q.is_anonymous,
    q.status,
    -- THE UNMASKING RULE. An anonymous respondent is named to nobody through
    -- this function, HR included: HR can reach the row directly if they must
    -- act on something, and that is a deliberate, separate act.
    CASE
      WHEN q.is_anonymous THEN 'Anonymous (' || q.relationship || ')'
      ELSE COALESCE(e.full_name, q.respondent_name, 'Unnamed')
    END,
    -- The subject sees the answer only when the request was shared with them.
    CASE WHEN v_is_subject AND NOT q.shared_with_subject THEN NULL ELSE fr.strengths END,
    CASE WHEN v_is_subject AND NOT q.shared_with_subject THEN NULL ELSE fr.improvements END,
    CASE WHEN v_is_subject AND NOT q.shared_with_subject THEN NULL ELSE fr.overall_score END,
    fr.submitted_at
  FROM feedback_requests q
  LEFT JOIN feedback_responses fr ON fr.request_id = q.id
  LEFT JOIN workforce_employees e ON e.id = q.respondent_employee_id
  WHERE q.subject_employee_id = p_subject_employee_id
    AND (p_cycle_id IS NULL OR q.cycle_id = p_cycle_id)
  ORDER BY fr.submitted_at DESC NULLS LAST, q.created_at DESC;
END;
$$;

-- =============================================================================
-- Evidence, and the line it does not cross
-- =============================================================================
--
-- Gathers what somebody actually did in a period: tasks completed, tracker
-- items, reports filed, goal progress. It returns COUNTS AND LINKS for a human
-- to read.
--
-- It deliberately does not return, and there is deliberately no function that
-- returns, a suggested rating. "The system must not automatically calculate
-- final performance ratings from activity volume alone" is not satisfied by
-- computing one and labelling it a suggestion: a number on the screen next to
-- the rating box is the rating, whatever it is called.
CREATE OR REPLACE FUNCTION public.performance_evidence(
  p_employee_id uuid,
  p_viewer_employee_id uuid,
  p_from date,
  p_to date,
  p_is_hr boolean DEFAULT false
)
RETURNS TABLE (
  source text,
  ref_id uuid,
  occurred_on date,
  title text,
  detail text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (p_is_hr
          OR p_employee_id = p_viewer_employee_id
          OR performance_is_manager_of(p_viewer_employee_id, p_employee_id)) THEN
    RAISE EXCEPTION 'performance.evidence_not_permitted' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT 'task'::text, t.id, t.completed_at::date, t.title,
         COALESCE(p.name, 'No project')
  FROM tasks t
  LEFT JOIN projects p ON p.id = t.project_id
  WHERE t.deleted_at IS NULL
    AND t.status = 'completed'
    AND t.completed_at::date BETWEEN p_from AND p_to
    AND (t.owner_employee_id = p_employee_id
      OR EXISTS (SELECT 1 FROM task_assignments ta
                 WHERE ta.task_id = t.id AND ta.employee_id = p_employee_id
                   AND ta.unassigned_at IS NULL))

  UNION ALL

  SELECT 'report'::text, s.id, s.submitted_at::date,
         COALESCE(rt.name, 'Report'), s.state
  FROM report_submissions s
  LEFT JOIN report_obligations o ON o.id = s.obligation_id
  LEFT JOIN report_templates rt ON rt.id = o.template_id
  WHERE s.employee_id = p_employee_id
    AND s.submitted_at IS NOT NULL
    AND s.submitted_at::date BETWEEN p_from AND p_to

  UNION ALL

  SELECT 'tracker'::text, e.id, e.entry_date, 'Daily tracker',
         e.status
  FROM tracker_entries e
  WHERE e.employee_id = p_employee_id
    AND e.entry_date BETWEEN p_from AND p_to
    AND e.status IN ('submitted', 'reviewed', 'approved')

  UNION ALL

  SELECT 'goal_update'::text, u.id, u.created_at::date, g.title,
         COALESCE(u.body, '')
  FROM goal_updates u
  JOIN goals g ON g.id = u.goal_id
  WHERE g.owner_employee_id = p_employee_id
    AND g.deleted_at IS NULL
    AND u.created_at::date BETWEEN p_from AND p_to
    AND u.update_type IN ('progress', 'evidence')

  ORDER BY 3 DESC NULLS LAST;
END;
$$;

-- =============================================================================
-- Lock the doors
-- =============================================================================
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default, and PostgREST
-- exposes anything the anon or authenticated role can execute as an HTTP
-- endpoint. Without these REVOKEs, every function above would be a public API
-- taking an arbitrary employee id.
DO $lock$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'performance_is_manager_of(uuid,uuid)',
    'goal_is_visible_to(uuid,uuid,boolean)',
    'goal_assert_alignment()',
    'key_result_attainment(uuid)',
    'goal_recalculate_progress(uuid)',
    'goal_validate_weights(uuid,uuid)',
    'goal_update_progress(uuid,uuid,numeric,text,boolean)',
    'goal_submit_for_approval(uuid,uuid)',
    'goal_decide_approval(uuid,uuid,text,text,boolean)',
    'performance_cycle_advance(uuid,text,uuid,boolean)',
    'performance_can_view_review(uuid,uuid,boolean)',
    'performance_can_edit_review(uuid,uuid,boolean)',
    'performance_visible_sections(uuid,uuid,boolean)',
    'review_set_rating(uuid,uuid,uuid,uuid,numeric,text,text,text,boolean)',
    'review_submit(uuid,uuid,boolean)',
    'review_finalise(uuid,uuid,numeric,text,boolean)',
    'review_acknowledge(uuid,uuid,text,boolean)',
    'review_open_correction(uuid,uuid,text,boolean)',
    'feedback_can_view_response(uuid,uuid,boolean)',
    'feedback_for_subject(uuid,uuid,uuid,boolean)',
    'performance_evidence(uuid,uuid,date,date,boolean)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;
EXCEPTION
  WHEN undefined_object THEN
    -- A local database without Supabase's roles. The REVOKE from PUBLIC is the
    -- one that matters and has already run.
    NULL;
END
$lock$;
