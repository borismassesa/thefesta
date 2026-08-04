-- Report engine — backfill.
--
-- Brings the pre-existing system into the versioned model:
--
--   1. Every report_templates.sections becomes version 1 of that template, in
--      the new field vocabulary, and is published.
--   2. Every workforce_reports row becomes a report_submission plus, if it was
--      submitted, an immutable report_submission_version.
--
-- COPY, NOT MOVE. workforce_reports is left exactly as it is: /workforce/reports
-- and the existing PDF still read it, and a backfill that deletes its source
-- cannot be run twice or checked afterwards. The old surface keeps working
-- while the new one takes over, and the old table can be dropped later once
-- nothing reads it.
--
-- Idempotent. Re-running inserts nothing new, because both steps are guarded by
-- NOT EXISTS on their natural key.

-- =============================================================================
-- Field-type translation
-- =============================================================================
-- The old vocabulary was ten types shaped around one team's reports; the new one
-- is seventeen general types. The mapping below is lossy in one direction only:
-- a bullets list becomes a repeatable_list of one text column, which renders and
-- validates the same but is no longer a special case in the renderer.
--
--   text              -> long_text
--   short_text        -> short_text
--   department_select -> department_select
--   number            -> number
--   bullets           -> repeatable_list  [ item ]
--   grouped_bullets   -> repeatable_list  [ group, item ]
--   metrics_table     -> table            [ name, this_period, last_period, target ]
--   goal_list         -> table            [ goal, owner, target_date ]
--   blocker_list      -> table            [ blocker, waiting_on, since ]
--   followup_list     -> table            [ goal, status, note ]
CREATE OR REPLACE FUNCTION public.report_convert_legacy_section(p_section jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_type   text := p_section ->> 'type';
  v_key    text := p_section ->> 'id';
  v_label  text := COALESCE(p_section ->> 'title', 'Untitled');
  v_req    boolean := COALESCE((p_section ->> 'required')::boolean, false);
  v_help   text := p_section ->> 'help';
  v_base   jsonb;
BEGIN
  IF v_key IS NULL THEN RETURN NULL; END IF;

  v_base := jsonb_build_object(
    'key', v_key,
    'label', v_label,
    'required', v_req
  );
  IF v_help IS NOT NULL THEN
    v_base := v_base || jsonb_build_object('help', v_help);
  END IF;
  IF p_section ? 'placeholder' THEN
    v_base := v_base || jsonb_build_object('placeholder', p_section ->> 'placeholder');
  END IF;

  RETURN CASE v_type
    WHEN 'text' THEN v_base || '{"type":"long_text"}'::jsonb
    WHEN 'short_text' THEN v_base || '{"type":"short_text"}'::jsonb
    WHEN 'department_select' THEN v_base || '{"type":"department_select"}'::jsonb
    WHEN 'number' THEN v_base || '{"type":"number"}'::jsonb
    WHEN 'bullets' THEN v_base || jsonb_build_object(
      'type', 'repeatable_list',
      'subFields', jsonb_build_array(
        jsonb_build_object('key', 'item', 'label', 'Item', 'type', 'short_text', 'required', true)
      ))
    WHEN 'grouped_bullets' THEN v_base || jsonb_build_object(
      'type', 'repeatable_list',
      'subFields', jsonb_build_array(
        jsonb_build_object('key', 'group', 'label', 'Group', 'type', 'short_text'),
        jsonb_build_object('key', 'item', 'label', 'Item', 'type', 'short_text', 'required', true)
      ))
    WHEN 'metrics_table' THEN v_base || jsonb_build_object(
      'type', 'table',
      'subFields', jsonb_build_array(
        jsonb_build_object('key', 'name', 'label', 'Metric', 'type', 'short_text', 'required', true),
        jsonb_build_object('key', 'this_period', 'label', 'This period', 'type', 'number'),
        jsonb_build_object('key', 'last_period', 'label', 'Last period', 'type', 'number'),
        jsonb_build_object('key', 'target', 'label', 'Target', 'type', 'number')
      ))
    WHEN 'goal_list' THEN v_base || jsonb_build_object(
      'type', 'table',
      'subFields', jsonb_build_array(
        jsonb_build_object('key', 'goal', 'label', 'Goal', 'type', 'short_text', 'required', true),
        jsonb_build_object('key', 'owner', 'label', 'Owner', 'type', 'short_text'),
        jsonb_build_object('key', 'target_date', 'label', 'Target date', 'type', 'date')
      ))
    WHEN 'blocker_list' THEN v_base || jsonb_build_object(
      'type', 'table',
      'subFields', jsonb_build_array(
        jsonb_build_object('key', 'blocker', 'label', 'Blocker', 'type', 'short_text', 'required', true),
        jsonb_build_object('key', 'waiting_on', 'label', 'Waiting on', 'type', 'short_text'),
        jsonb_build_object('key', 'since', 'label', 'Since', 'type', 'date')
      ))
    WHEN 'followup_list' THEN v_base || jsonb_build_object(
      'type', 'table',
      'subFields', jsonb_build_array(
        jsonb_build_object('key', 'goal', 'label', 'Goal', 'type', 'short_text'),
        jsonb_build_object('key', 'status', 'label', 'Status', 'type', 'short_text'),
        jsonb_build_object('key', 'note', 'label', 'Note', 'type', 'long_text')
      ))
    -- An unrecognised legacy type becomes long text rather than being dropped.
    -- Losing a question from a template is worse than rendering it as prose.
    ELSE v_base || '{"type":"long_text"}'::jsonb
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.report_convert_legacy_section(jsonb)
  FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 1. Templates -> version 1
-- =============================================================================
DO $$
DECLARE
  t          record;
  v_fields   jsonb;
  v_version  uuid;
  v_count    integer := 0;
BEGIN
  FOR t IN SELECT * FROM report_templates LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM report_template_versions v WHERE v.template_id = t.id
    );

    SELECT COALESCE(jsonb_agg(converted) FILTER (WHERE converted IS NOT NULL), '[]'::jsonb)
      INTO v_fields
    FROM (
      SELECT report_convert_legacy_section(section) AS converted
      FROM jsonb_array_elements(COALESCE(t.sections, '[]'::jsonb)) AS section
    ) x;

    INSERT INTO report_template_versions (
      template_id, version, fields, recipient_rules, change_note, published_at
    ) VALUES (
      t.id,
      1,
      jsonb_build_object('sections', jsonb_build_array(
        jsonb_build_object('key', 'main', 'title', t.name, 'fields', v_fields)
      )),
      -- The old system had the author pick a recipient per submission. The
      -- closest faithful default is the direct manager, which is what most of
      -- those picks were; templates that need something else get an explicit
      -- rule when someone next edits them.
      '[{"source":"direct_manager"}]'::jsonb,
      'Imported from the pre-versioning template.',
      now()
    )
    RETURNING id INTO v_version;

    UPDATE report_templates SET active_version_id = v_version WHERE id = t.id;
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'report engine: created % template version(s)', v_count;
END
$$;

-- =============================================================================
-- 2. workforce_reports -> report_submissions (+ versions)
-- =============================================================================
DO $$
DECLARE
  r           record;
  v_submission uuid;
  v_version_id uuid;
  v_fields    jsonb;
  v_state     text;
  v_count     integer := 0;
BEGIN
  FOR r IN
    SELECT wr.*, rt.active_version_id, rt.cadence
    FROM workforce_reports wr
    LEFT JOIN report_templates rt ON rt.id = wr.template_id
    WHERE wr.template_id IS NOT NULL
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM report_submissions s
      WHERE s.employee_id = r.employee_id
        AND s.template_id = r.template_id
        AND s.period_start = r.report_date
    );

    -- The old status vocabulary was ('draft','submitted') with no review, so a
    -- submitted legacy report maps to 'submitted' and not to 'accepted':
    -- claiming somebody signed these off would be inventing a decision.
    v_state := CASE WHEN r.status = 'submitted' THEN 'submitted' ELSE 'draft' END;

    INSERT INTO report_submissions (
      template_id, template_version_id, employee_id,
      period_start, period_end, period_label,
      state, draft_content, draft_revision,
      current_version, submitted_at,
      prepared_by_name, prepared_by_role, created_at
    ) VALUES (
      r.template_id, r.active_version_id, r.employee_id,
      r.report_date, COALESCE(r.period_end, r.report_date),
      to_char(r.report_date, 'DD Mon YYYY'),
      v_state, COALESCE(r.content, '{}'::jsonb), 0,
      CASE WHEN v_state = 'submitted' THEN 1 ELSE 0 END,
      r.submitted_at,
      r.prepared_by_name, r.prepared_by_role, r.created_at
    )
    RETURNING id INTO v_submission;

    IF v_state = 'submitted' THEN
      -- The snapshot the legacy row carried is the structure this report was
      -- actually written against, so the PDF still renders it faithfully.
      SELECT COALESCE(jsonb_agg(converted) FILTER (WHERE converted IS NOT NULL), '[]'::jsonb)
        INTO v_fields
      FROM (
        SELECT report_convert_legacy_section(section) AS converted
        FROM jsonb_array_elements(
          COALESCE(r.template_snapshot -> 'sections', '[]'::jsonb)
        ) AS section
      ) x;

      INSERT INTO report_submission_versions (
        submission_id, version, content, field_snapshot, template_version_id,
        author_employee_id, reason, created_at
      ) VALUES (
        v_submission, 1, COALESCE(r.content, '{}'::jsonb),
        jsonb_build_object('sections', jsonb_build_array(
          jsonb_build_object('key', 'main', 'title', 'Report', 'fields', v_fields)
        )),
        r.active_version_id, r.employee_id, 'submit',
        COALESCE(r.submitted_at, r.created_at)
      )
      RETURNING id INTO v_version_id;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'report engine: imported % legacy submission(s)', v_count;
END
$$;

-- =============================================================================
-- 3. Assignments for imported templates
-- =============================================================================
-- The old system offered a template to a department via report_templates.departments
-- and had no concept of who OWED it. Turn each department listing into an
-- assignment so obligations start generating; a template with no departments was
-- offered to everyone.
INSERT INTO report_template_assignments (template_id, assignee_type, department, effective_from, note)
SELECT t.id, 'department', d, CURRENT_DATE, 'Imported from template departments.'
FROM report_templates t
CROSS JOIN LATERAL unnest(t.departments) AS d
WHERE t.is_active
  AND NOT EXISTS (
    SELECT 1 FROM report_template_assignments a
    WHERE a.template_id = t.id AND a.assignee_type = 'department' AND a.department = d
  );

INSERT INTO report_template_assignments (template_id, assignee_type, effective_from, note)
SELECT t.id, 'everyone', CURRENT_DATE, 'Imported: template was offered to all departments.'
FROM report_templates t
WHERE t.is_active
  AND COALESCE(array_length(t.departments, 1), 0) = 0
  AND NOT EXISTS (
    SELECT 1 FROM report_template_assignments a WHERE a.template_id = t.id
  );

NOTIFY pgrst, 'reload schema';
