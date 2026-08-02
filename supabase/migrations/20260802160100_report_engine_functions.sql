-- Report engine — periods, transitions, autosave and obligation generation.
--
-- WHY THESE ARE IN THE DATABASE
--
--   The state machine is a security boundary. "Locked reports are immutable"
--   and "submitted reports cannot be silently edited" have to hold against any
--   caller, including a future route nobody has written yet. Enforcing them in
--   one function that takes the row lock beats enforcing them in every action.
--
--   Autosave is a concurrency problem. Two tabs saving the same draft is the
--   normal case, not the edge case, and "read revision then write" races. The
--   revision check and the write happen in one statement here.
--
--   Obligation generation must be idempotent. The job runs hourly; a unique
--   constraint plus ON CONFLICT DO NOTHING is what makes running it twice
--   produce one obligation rather than two.
--
-- Errors raise ERRCODE P0001 with stable dotted tokens, mapped by
-- lib/reports/errors.ts under an exact-match whitelist. No database string ever
-- reaches the browser.
--
-- Every function is SECURITY DEFINER and revoked from anon/authenticated:
-- PostgREST would otherwise expose the whole engine as an unauthenticated RPC.

-- =============================================================================
-- Periods — mirrors lib/reports/periods.ts
-- =============================================================================

-- Fixed origin for biweekly periods. Without an anchor, "every two weeks" means
-- different fortnights depending on when the job first ran.
CREATE OR REPLACE FUNCTION public.report_period_for(p_cadence text, p_date date)
RETURNS TABLE (period_start date, period_end date, period_label text)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_week_start date;
  v_weeks      integer;
  v_start      date;
  v_quarter    integer;
BEGIN
  CASE p_cadence
    WHEN 'daily' THEN
      RETURN QUERY SELECT p_date, p_date, to_char(p_date, 'DD Mon YYYY');

    WHEN 'weekly' THEN
      v_start := p_date - (EXTRACT(ISODOW FROM p_date)::integer - 1);
      RETURN QUERY SELECT v_start, v_start + 6, 'Week of ' || to_char(v_start, 'DD Mon YYYY');

    WHEN 'biweekly' THEN
      v_week_start := p_date - (EXTRACT(ISODOW FROM p_date)::integer - 1);
      -- floor(), not integer division: Postgres truncates toward zero, which
      -- would misalign every period before the anchor date.
      v_weeks := floor((v_week_start - DATE '2026-01-05')::numeric / 7);
      -- Positive modulo, so parity is right for negative week counts too.
      IF ((v_weeks % 2) + 2) % 2 = 0 THEN
        v_start := v_week_start;
      ELSE
        v_start := v_week_start - 7;
      END IF;
      RETURN QUERY SELECT v_start, v_start + 13, 'Fortnight of ' || to_char(v_start, 'DD Mon YYYY');

    WHEN 'monthly' THEN
      v_start := date_trunc('month', p_date)::date;
      RETURN QUERY SELECT v_start, (v_start + interval '1 month - 1 day')::date,
                          to_char(v_start, 'FMMonth YYYY');

    WHEN 'quarterly' THEN
      v_quarter := floor((EXTRACT(MONTH FROM p_date)::integer - 1) / 3);
      v_start := make_date(EXTRACT(YEAR FROM p_date)::integer, v_quarter * 3 + 1, 1);
      RETURN QUERY SELECT v_start, (v_start + interval '3 months - 1 day')::date,
                          'Q' || (v_quarter + 1) || ' ' || EXTRACT(YEAR FROM p_date)::integer;

    ELSE
      -- 'ad_hoc' and anything unrecognised have no period. Returning no rows
      -- rather than guessing keeps the generator from inventing obligations.
      RETURN;
  END CASE;
END;
$$;

-- =============================================================================
-- The state machine — mirrors lib/reports/state.ts
-- =============================================================================
-- Returns the target state, or NULL when the move is not allowed. Kept as data
-- rather than a chain of IFs so the table can be read against state.ts.
CREATE OR REPLACE FUNCTION public.report_transition_target(
  p_from text,
  p_action text,
  p_actor_role text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT t.to_state
  FROM (VALUES
    ('draft',        'submit',                'submitted',    ARRAY['owner','admin']),
    ('submitted',    'start_review',          'under_review', ARRAY['reviewer','admin']),
    ('resubmitted',  'start_review',          'under_review', ARRAY['reviewer','admin']),
    ('submitted',    'return_for_correction', 'returned',     ARRAY['reviewer','admin']),
    ('under_review', 'return_for_correction', 'returned',     ARRAY['reviewer','admin']),
    ('resubmitted',  'return_for_correction', 'returned',     ARRAY['reviewer','admin']),
    -- Owner only. A reviewer who could resubmit could rewrite somebody's report
    -- and file it under their name.
    ('returned',     'resubmit',              'resubmitted',  ARRAY['owner']),
    ('submitted',    'accept',                'accepted',     ARRAY['reviewer','admin']),
    ('under_review', 'accept',                'accepted',     ARRAY['reviewer','admin']),
    ('resubmitted',  'accept',                'accepted',     ARRAY['reviewer','admin']),
    ('accepted',     'lock',                  'locked',       ARRAY['admin','system']),
    ('accepted',     'reopen',                'returned',     ARRAY['admin']),
    ('draft',        'cancel',                'cancelled',    ARRAY['owner','admin']),
    ('submitted',    'cancel',                'cancelled',    ARRAY['owner','admin']),
    ('under_review', 'cancel',                'cancelled',    ARRAY['owner','admin']),
    ('returned',     'cancel',                'cancelled',    ARRAY['owner','admin']),
    ('resubmitted',  'cancel',                'cancelled',    ARRAY['owner','admin']),
    ('draft',        'waive',                 'waived',       ARRAY['admin']),
    ('submitted',    'waive',                 'waived',       ARRAY['admin']),
    ('under_review', 'waive',                 'waived',       ARRAY['admin']),
    ('returned',     'waive',                 'waived',       ARRAY['admin']),
    ('resubmitted',  'waive',                 'waived',       ARRAY['admin'])
  ) AS t(from_state, action, to_state, actors)
  WHERE t.from_state = p_from
    AND t.action = p_action
    AND p_actor_role = ANY (t.actors)
  LIMIT 1;
$$;

-- =============================================================================
-- report_save_draft — autosave without clobbering a newer draft
-- =============================================================================
-- The caller states the revision it read. If the stored revision has moved on,
-- another tab (or another device) saved in the meantime and this save is
-- refused. Returning the newer revision lets the client offer recovery instead
-- of silently losing whichever copy lost the race.
CREATE OR REPLACE FUNCTION public.report_save_draft(
  p_submission_id uuid,
  p_employee_id uuid,
  p_content jsonb,
  p_expected_revision integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  s report_submissions%ROWTYPE;
BEGIN
  SELECT * INTO s FROM report_submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'report.not_found' USING ERRCODE = 'P0001';
  END IF;
  -- Ownership is checked here as well as in the action: this function is the
  -- last gate before the write, and it is the one that holds the lock.
  IF s.employee_id <> p_employee_id THEN
    RAISE EXCEPTION 'report.not_owner' USING ERRCODE = 'P0001';
  END IF;
  IF s.state NOT IN ('draft', 'returned') THEN
    RAISE EXCEPTION 'report.not_editable' USING ERRCODE = 'P0001';
  END IF;
  IF s.draft_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'report.draft_conflict' USING ERRCODE = 'P0001';
  END IF;

  UPDATE report_submissions
     SET draft_content = p_content,
         draft_revision = draft_revision + 1,
         draft_updated_at = now()
   WHERE id = p_submission_id;

  RETURN s.draft_revision + 1;
END;
$$;

-- =============================================================================
-- report_file — submit or resubmit, minting an immutable version
-- =============================================================================
CREATE OR REPLACE FUNCTION public.report_file(
  p_submission_id uuid,
  p_employee_id uuid,
  p_actor_role text,
  p_field_snapshot jsonb,
  p_recipients jsonb,
  p_email_copy boolean DEFAULT false,
  p_prepared_by_name text DEFAULT NULL,
  p_prepared_by_role text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  s          report_submissions%ROWTYPE;
  v_action   text;
  v_target   text;
  v_version  integer;
  v_version_id uuid;
  v_requires_review boolean;
BEGIN
  SELECT * INTO s FROM report_submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'report.not_found' USING ERRCODE = 'P0001';
  END IF;
  IF s.employee_id <> p_employee_id THEN
    RAISE EXCEPTION 'report.not_owner' USING ERRCODE = 'P0001';
  END IF;

  v_action := CASE WHEN s.state = 'returned' THEN 'resubmit' ELSE 'submit' END;
  v_target := report_transition_target(s.state, v_action, p_actor_role);
  IF v_target IS NULL THEN
    IF s.state IN ('locked', 'cancelled', 'waived') THEN
      RAISE EXCEPTION 'report.immutable' USING ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION 'report.invalid_transition' USING ERRCODE = 'P0001';
  END IF;

  -- The version is cut from the DRAFT content, which is the thing the employee
  -- has been editing. Taking content from the request instead would let a
  -- filing differ from what autosave last stored.
  v_version := s.current_version + 1;
  INSERT INTO report_submission_versions (
    submission_id, version, content, field_snapshot, template_version_id,
    author_employee_id, reason
  ) VALUES (
    p_submission_id, v_version, s.draft_content, p_field_snapshot, s.template_version_id,
    p_employee_id, v_action
  )
  RETURNING id INTO v_version_id;

  SELECT COALESCE(t.requires_review, true) INTO v_requires_review
  FROM report_templates t WHERE t.id = s.template_id;

  -- A template with no review step is accepted on arrival. Leaving it in
  -- 'submitted' forever would make every such report look permanently pending.
  IF NOT v_requires_review THEN
    v_target := 'accepted';
  END IF;

  UPDATE report_submissions
     SET state = v_target,
         current_version = v_version,
         submitted_at = COALESCE(submitted_at, now()),
         accepted_at = CASE WHEN v_target = 'accepted' THEN now() ELSE accepted_at END,
         recipients = p_recipients,
         email_copy_requested = p_email_copy,
         prepared_by_name = COALESCE(p_prepared_by_name, prepared_by_name),
         prepared_by_role = COALESCE(p_prepared_by_role, prepared_by_role)
   WHERE id = p_submission_id;

  -- Attachments uploaded against the draft belong to the version just filed.
  UPDATE report_attachments
     SET submission_version_id = v_version_id
   WHERE submission_id = p_submission_id AND submission_version_id IS NULL;

  IF s.obligation_id IS NOT NULL THEN
    UPDATE report_obligations
       SET state = CASE WHEN v_target = 'accepted' THEN 'accepted' ELSE 'submitted' END
     WHERE id = s.obligation_id;
  END IF;

  -- Recorded under the action that actually happened. report_reviews is the
  -- full history of the report, not a reviewer-only log, so a filing appears in
  -- it alongside the decisions made about it.
  INSERT INTO report_reviews (
    submission_id, submission_version_id, reviewer_employee_id, action, from_state, to_state
  ) VALUES (
    p_submission_id, v_version_id, p_employee_id, v_action, s.state, v_target
  );

  RETURN v_version;
END;
$$;

-- =============================================================================
-- report_review_action — every reviewer decision
-- =============================================================================
CREATE OR REPLACE FUNCTION public.report_review_action(
  p_submission_id uuid,
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
  s        report_submissions%ROWTYPE;
  v_target text;
  v_version_id uuid;
BEGIN
  SELECT * INTO s FROM report_submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'report.not_found' USING ERRCODE = 'P0001';
  END IF;

  IF s.state IN ('locked', 'cancelled', 'waived') THEN
    RAISE EXCEPTION 'report.immutable' USING ERRCODE = 'P0001';
  END IF;

  v_target := report_transition_target(s.state, p_action, p_actor_role);
  IF v_target IS NULL THEN
    -- Distinguish "you may not" from "not from here", because the two have
    -- different fixes and the employee is told which.
    IF report_transition_target(s.state, p_action, 'admin') IS NOT NULL THEN
      RAISE EXCEPTION 'report.not_permitted' USING ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION 'report.invalid_transition' USING ERRCODE = 'P0001';
  END IF;

  -- Returning a report without saying why is how a correction loop becomes a
  -- guessing game.
  IF p_action IN ('return_for_correction', 'reopen', 'waive')
     AND (p_note IS NULL OR length(btrim(p_note)) = 0) THEN
    RAISE EXCEPTION 'report.reason_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_version_id
  FROM report_submission_versions
  WHERE submission_id = p_submission_id
  ORDER BY version DESC LIMIT 1;

  UPDATE report_submissions
     SET state = v_target,
         reviewed_at = CASE WHEN p_action = 'start_review' THEN now() ELSE reviewed_at END,
         accepted_at = CASE WHEN v_target = 'accepted' THEN now() ELSE accepted_at END,
         locked_at = CASE WHEN v_target = 'locked' THEN now() ELSE locked_at END,
         cancelled_at = CASE WHEN v_target = 'cancelled' THEN now() ELSE cancelled_at END,
         waived_at = CASE WHEN v_target = 'waived' THEN now() ELSE waived_at END,
         returned_count = CASE WHEN v_target = 'returned' THEN returned_count + 1 ELSE returned_count END,
         -- A returned report gets its draft seeded from the version just
         -- rejected, so the author corrects their own words rather than
         -- starting from an empty form. The old version is untouched.
         draft_content = CASE
           WHEN v_target = 'returned'
           THEN COALESCE((SELECT content FROM report_submission_versions
                          WHERE submission_id = p_submission_id
                          ORDER BY version DESC LIMIT 1), draft_content)
           ELSE draft_content END,
         draft_revision = CASE WHEN v_target = 'returned' THEN draft_revision + 1 ELSE draft_revision END
   WHERE id = p_submission_id;

  INSERT INTO report_reviews (
    submission_id, submission_version_id, reviewer_employee_id, reviewer_clerk_id,
    action, from_state, to_state, note
  ) VALUES (
    p_submission_id, v_version_id, p_actor_employee_id, p_actor_clerk_id,
    p_action, s.state, v_target, p_note
  );

  IF s.obligation_id IS NOT NULL THEN
    UPDATE report_obligations
       SET state = CASE
             WHEN v_target = 'accepted' THEN 'accepted'
             WHEN v_target = 'waived' THEN 'waived'
             WHEN v_target = 'cancelled' THEN 'cancelled'
             WHEN v_target = 'returned' THEN 'open'
             ELSE state END,
           waived_by = CASE WHEN v_target = 'waived' THEN p_actor_employee_id ELSE waived_by END,
           waived_reason = CASE WHEN v_target = 'waived' THEN p_note ELSE waived_reason END,
           waived_at = CASE WHEN v_target = 'waived' THEN now() ELSE waived_at END
     WHERE id = s.obligation_id;
  END IF;

  RETURN v_target;
END;
$$;

-- =============================================================================
-- report_generate_obligations — the background job
-- =============================================================================
-- Walks active templates, expands their assignments to employees, and raises an
-- obligation for each CLOSED period inside the backfill window. Idempotent: the
-- unique key plus ON CONFLICT DO NOTHING means running it hourly produces one
-- obligation per employee per period.
--
-- Never generates for a period still running: a report cannot be owed for a
-- month that has not happened.
CREATE OR REPLACE FUNCTION public.report_generate_obligations(p_today date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today   date := COALESCE(p_today, (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date);
  tpl       record;
  emp       record;
  per       record;
  v_cursor  date;
  v_due     date;
  v_created integer := 0;
  i         integer;
BEGIN
  FOR tpl IN
    SELECT t.*, t.active_version_id AS version_id
    FROM report_templates t
    WHERE t.is_active
      AND t.archived_at IS NULL
      AND t.cadence <> 'ad_hoc'
      AND t.active_version_id IS NOT NULL
  LOOP
    -- Which employees owe this template, from its active assignments. Only
    -- currently-employed people: chasing a leaver for last month's report is
    -- noise, and chasing a terminated one is worse.
    FOR emp IN
      SELECT DISTINCT e.id, e.start_date
      FROM report_template_assignments a
      JOIN workforce_employees e ON (
            (a.assignee_type = 'employee'   AND e.id = a.employee_id)
         OR (a.assignee_type = 'department' AND e.department = a.department)
         OR (a.assignee_type = 'everyone')
         OR (a.assignee_type = 'role'       AND e.dashboard_role_id = a.role_id)
         OR (a.assignee_type = 'project'    AND EXISTS (
               SELECT 1 FROM project_members pm
               WHERE pm.project_id = a.project_id AND pm.employee_id = e.id))
      )
      WHERE a.template_id = tpl.id
        AND a.is_active
        AND a.effective_from <= v_today
        AND (a.effective_to IS NULL OR a.effective_to >= v_today)
        AND e.status IN ('Active', 'On Leave', 'Onboarding')
    LOOP
      v_cursor := v_today;
      FOR i IN 1..GREATEST(tpl.backfill_periods, 1) LOOP
        -- Step back one period at a time from today, taking only periods that
        -- have finished. A set-returning function that returns no rows leaves
        -- the record's fields NULL rather than the record itself NULL, so the
        -- check has to be on a field.
        SELECT * INTO per FROM report_period_for(tpl.cadence, v_cursor);
        EXIT WHEN per.period_start IS NULL;

        IF per.period_end >= v_today THEN
          v_cursor := per.period_start - 1;
          SELECT * INTO per FROM report_period_for(tpl.cadence, v_cursor);
          EXIT WHEN per.period_start IS NULL;
        END IF;
        EXIT WHEN per.period_end >= v_today;

        -- Do not raise obligations from before the employee joined. Someone
        -- hired in July does not owe June's report.
        EXIT WHEN per.period_end < emp.start_date;

        v_due := per.period_end + tpl.due_offset_days;

        INSERT INTO report_obligations (
          template_id, template_version_id, employee_id,
          period_start, period_end, period_label, due_date, state
        ) VALUES (
          tpl.id, tpl.version_id, emp.id,
          per.period_start, per.period_end, per.period_label, v_due, 'open'
        )
        ON CONFLICT (template_id, employee_id, period_start) DO NOTHING;

        IF FOUND THEN v_created := v_created + 1; END IF;

        v_cursor := per.period_start - 1;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN v_created;
END;
$$;

-- =============================================================================
-- report_mark_overdue / report_lock_accepted — the rest of the job
-- =============================================================================
CREATE OR REPLACE FUNCTION public.report_mark_overdue(p_today date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := COALESCE(p_today, (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date);
  v_count integer;
BEGIN
  WITH moved AS (
    UPDATE report_obligations o
       SET state = 'overdue'
      FROM report_templates t
     WHERE t.id = o.template_id
       AND o.state = 'open'
       AND v_today > o.due_date + t.grace_days
    RETURNING o.id
  )
  SELECT count(*) INTO v_count FROM moved;
  RETURN v_count;
END;
$$;

-- Accepted reports seal after the template's window. Locking is separate from
-- accepting on purpose: acceptance is a judgement, locking is the moment the
-- record stops being changeable, and leaving a gap means a mistake caught the
-- same week can still be reopened.
CREATE OR REPLACE FUNCTION public.report_lock_accepted(p_today date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r       record;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT s.id, s.state
    FROM report_submissions s
    JOIN report_templates t ON t.id = s.template_id
    WHERE s.state = 'accepted'
      AND s.accepted_at IS NOT NULL
      AND now() > s.accepted_at + make_interval(days => t.lock_after_days)
    FOR UPDATE OF s SKIP LOCKED
  LOOP
    PERFORM report_review_action(r.id, 'lock', NULL, 'system', NULL, 'Locked automatically.');
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- =============================================================================
-- Access control
-- =============================================================================
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'report_period_for(text, date)',
    'report_transition_target(text, text, text)',
    'report_save_draft(uuid, uuid, jsonb, integer)',
    'report_file(uuid, uuid, text, jsonb, jsonb, boolean, text, text)',
    'report_review_action(uuid, text, uuid, text, text, text)',
    'report_generate_obligations(date)',
    'report_mark_overdue(date)',
    'report_lock_accepted(date)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';
