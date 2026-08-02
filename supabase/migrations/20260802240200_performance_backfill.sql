-- Goals and Performance — the opening position.
--
-- Everything here is guarded by NOT EXISTS or ON CONFLICT DO NOTHING, so
-- re-running it imports nothing twice. It creates the current cycle, its goal
-- periods, and the review shells that make the module usable on the day it goes
-- live. It does NOT invent goals for people: a goal somebody did not write is
-- not a goal, and a screen full of them is worse than an empty one.

DO $backfill$
DECLARE
  v_year      integer := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  v_cycle     uuid;
  v_code      text;
  v_period    uuid;
  v_goal      uuid;
  v_created   integer := 0;
  q           integer;
  rec         record;
BEGIN
  v_code := 'PC-' || v_year;

  -- ---------------------------------------------------------------------
  -- 1. The current cycle
  -- ---------------------------------------------------------------------
  SELECT id INTO v_cycle FROM performance_cycles WHERE code = v_code;

  IF v_cycle IS NULL THEN
    INSERT INTO performance_cycles (
      code, name, description, starts_on, ends_on, stage,
      weight_total_required, weight_tolerance,
      min_goals_per_employee, max_goals_per_employee,
      rating_scale_min, rating_scale_max, rating_scale_labels
    ) VALUES (
      v_code,
      v_year || ' performance cycle',
      'Annual cycle. Goals are set at the start, reviewed at the midpoint, and closed with a conversation.',
      make_date(v_year, 1, 1),
      make_date(v_year, 12, 31),
      'goal_setting',
      100, 0,
      3, 8,
      1, 5,
      -- The scale is frozen on the cycle and copied onto every rating, so a
      -- later change cannot re-interpret an old number.
      '[
        {"value":1,"label":"Below expectations","descriptor":"Consistently short of what the role needs."},
        {"value":2,"label":"Partially meets","descriptor":"Delivers some of it, with support."},
        {"value":3,"label":"Meets expectations","descriptor":"Does the job well. This is the target, not a criticism."},
        {"value":4,"label":"Exceeds","descriptor":"Regularly does more than the role asks."},
        {"value":5,"label":"Outstanding","descriptor":"Sets the standard others are measured against."}
      ]'::jsonb
    )
    RETURNING id INTO v_cycle;
    RAISE NOTICE 'created performance cycle %', v_code;
  END IF;

  -- ---------------------------------------------------------------------
  -- 2. Quarterly goal periods
  -- ---------------------------------------------------------------------
  FOR q IN 1..4 LOOP
    IF NOT EXISTS (
      SELECT 1 FROM goal_periods
      WHERE cycle_id = v_cycle AND name = 'Q' || q || ' ' || v_year
    ) THEN
      INSERT INTO goal_periods (cycle_id, name, kind, starts_on, ends_on, is_open)
      VALUES (
        v_cycle,
        'Q' || q || ' ' || v_year,
        'quarter',
        make_date(v_year, (q - 1) * 3 + 1, 1),
        (make_date(v_year, (q - 1) * 3 + 1, 1) + INTERVAL '3 months - 1 day')::date,
        -- Only the quarter we are actually in accepts new goals.
        CURRENT_DATE BETWEEN make_date(v_year, (q - 1) * 3 + 1, 1)
                         AND (make_date(v_year, (q - 1) * 3 + 1, 1) + INTERVAL '3 months - 1 day')::date
      );
    END IF;
  END LOOP;

  -- ---------------------------------------------------------------------
  -- 3. Company goals from the growth KPI targets
  -- ---------------------------------------------------------------------
  --
  -- growth_kpi_targets already holds real company objectives with a number
  -- attached: "this many vendors a month". Those ARE company goals, and
  -- retyping them here would create two versions of the same target that drift
  -- apart. Guarded by to_regclass because the growth module is not present in
  -- every database.
  IF to_regclass('public.growth_kpi_targets') IS NOT NULL THEN
    FOR rec IN
      EXECUTE 'SELECT id, category, kpi_key, monthly_target FROM growth_kpi_targets'
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM goals WHERE reference = 'GROWTH-' || rec.id
      ) THEN
        INSERT INTO goals (
          reference, title, description, level, cycle_id,
          start_date, due_date, visibility, measurement_method,
          approval_status, status, weight
        ) VALUES (
          'GROWTH-' || rec.id,
          initcap(replace(rec.kpi_key, '_', ' ')) || ' (' || rec.category || ')',
          'Imported from the growth KPI framework. The monthly target is the key result below.',
          'company',
          v_cycle,
          make_date(v_year, 1, 1),
          make_date(v_year, 12, 31),
          'organisation',
          'key_results',
          -- Company goals are set, not proposed. They arrive approved.
          'approved',
          'on_track',
          0
        )
        RETURNING id INTO v_goal;

        INSERT INTO goal_key_results (
          goal_id, title, measurement_type, start_value, target_value,
          current_value, direction, unit
        ) VALUES (
          v_goal,
          'Monthly target',
          'number',
          0,
          rec.monthly_target,
          0,
          'increase',
          rec.kpi_key
        );

        v_created := v_created + 1;
      END IF;
    END LOOP;
    RAISE NOTICE 'imported % company goals from growth KPI targets', v_created;
  ELSE
    RAISE NOTICE 'growth_kpi_targets is not present; no company goals imported';
  END IF;

  -- ---------------------------------------------------------------------
  -- 4. Brand goals, scoped to the tracking units the tracker already has
  -- ---------------------------------------------------------------------
  --
  -- No brand is named here. The units are rows, which is the whole point of
  -- tracking_units: adding OpusStudio to this list is an INSERT, not a
  -- migration. A brand goal is created empty, for whoever owns that brand to
  -- fill in, because the alternative is guessing their targets for them.
  FOR rec IN SELECT id, name FROM tracking_units WHERE kind = 'brand' AND is_active LOOP
    IF NOT EXISTS (
      SELECT 1 FROM goals WHERE reference = 'BRAND-' || rec.id || '-' || v_year
    ) THEN
      INSERT INTO goals (
        reference, title, description, level, tracking_unit_id, cycle_id,
        start_date, due_date, visibility, measurement_method,
        approval_status, status, weight
      ) VALUES (
        'BRAND-' || rec.id || '-' || v_year,
        rec.name || ' ' || v_year,
        'Set the targets for this brand under here. Employee goals can align to it.',
        'brand',
        rec.id,
        v_cycle,
        make_date(v_year, 1, 1),
        make_date(v_year, 12, 31),
        'organisation',
        'key_results',
        'draft',
        'not_started',
        0
      );
    END IF;
  END LOOP;

  -- ---------------------------------------------------------------------
  -- 5. Review shells
  -- ---------------------------------------------------------------------
  --
  -- A review row exists from the start of the cycle in state 'not_started', so
  -- an employee can see what is coming rather than having it appear the week it
  -- is due. reviewer_employee_id is frozen to today's manager: if somebody
  -- changes manager in June, this review still belongs to whoever actually
  -- managed them through it.
  --
  -- A manager review is only created where there IS a manager. A review nobody
  -- can write is a permanent overdue item.
  v_created := 0;
  FOR rec IN
    SELECT id, manager_id FROM workforce_employees
    WHERE status IN ('Active', 'On Leave', 'Onboarding')
  LOOP
    INSERT INTO performance_reviews (cycle_id, employee_id, kind, reviewer_employee_id, state)
    VALUES (v_cycle, rec.id, 'self', rec.id, 'not_started')
    ON CONFLICT (cycle_id, employee_id, kind) DO NOTHING;

    IF rec.manager_id IS NOT NULL AND rec.manager_id <> rec.id THEN
      INSERT INTO performance_reviews (cycle_id, employee_id, kind, reviewer_employee_id, state)
      VALUES (v_cycle, rec.id, 'manager', rec.manager_id, 'not_started')
      ON CONFLICT (cycle_id, employee_id, kind) DO NOTHING;
    END IF;

    v_created := v_created + 1;
  END LOOP;
  RAISE NOTICE 'review shells prepared for % employees', v_created;
END
$backfill$;

-- =============================================================================
-- The standard sections of a manager review
-- =============================================================================
--
-- Created for every manager review that has none, so a reviewer opens a
-- structure rather than a blank page. The calibration section is created
-- 'calibration_only' from the start: it is never shown to the employee, and
-- making that the default removes the chance of somebody creating it visible by
-- accident.
INSERT INTO review_sections (review_id, code, title, section_type, visibility, sort_order)
SELECT r.id, s.code, s.title, s.section_type, s.visibility, s.sort_order
FROM performance_reviews r
CROSS JOIN (VALUES
  ('goals',        'Goals and delivery',        'goal_review',      'employee_visible', 10),
  ('competencies', 'How the work was done',     'competency',       'employee_visible', 20),
  ('strengths',    'What is working',           'narrative',        'employee_visible', 30),
  ('growth',       'Where to grow next',        'narrative',        'employee_visible', 40),
  ('manager_note', 'Reviewer working notes',    'narrative',        'manager_only',     50),
  ('calibration',  'Calibration discussion',    'calibration_note', 'calibration_only', 60)
) AS s(code, title, section_type, visibility, sort_order)
WHERE r.kind = 'manager'
  AND r.state <> 'closed'
  AND NOT EXISTS (SELECT 1 FROM review_sections rs WHERE rs.review_id = r.id)
ON CONFLICT (review_id, code) DO NOTHING;

-- A self-review is the employee's own account, so it gets its own, shorter set.
-- There is no manager_only or calibration section on a self-review: nothing
-- written by the employee about themselves should be hidden from them.
INSERT INTO review_sections (review_id, code, title, section_type, visibility, sort_order)
SELECT r.id, s.code, s.title, s.section_type, s.visibility, s.sort_order
FROM performance_reviews r
CROSS JOIN (VALUES
  ('achievements', 'What I delivered',            'narrative', 'employee_visible', 10),
  ('challenges',   'What got in the way',         'narrative', 'employee_visible', 20),
  ('learning',     'What I learned',              'narrative', 'employee_visible', 30),
  ('support',      'What I need to do better',    'narrative', 'employee_visible', 40)
) AS s(code, title, section_type, visibility, sort_order)
WHERE r.kind = 'self'
  AND r.state <> 'closed'
  AND NOT EXISTS (SELECT 1 FROM review_sections rs WHERE rs.review_id = r.id)
ON CONFLICT (review_id, code) DO NOTHING;
