-- Report engine — schema.
--
-- WHAT CHANGES AND WHY
--
-- The existing system (report_templates + workforce_reports, 20260526000001)
-- got the important idea right: a report is a template plus content, not a
-- hand-built form per report type. What it cannot do is everything that happens
-- AFTER someone presses submit.
--
--   A template is mutable. Editing it rewrites the meaning of every report ever
--   filed against it, because `sections` has no version. The snapshot on each
--   submission softens this but does not fix it: two reports filed a week apart
--   can no longer be compared.
--
--   status is ('draft','submitted'). There is no review, no return for
--   correction, no acceptance, no lock. A submitted report can be silently
--   edited by re-upserting the same (template, employee, date) key.
--
--   Nothing is owed. A report exists once somebody writes one, so "who has not
--   filed their monthly report" is unanswerable.
--
-- This migration adds the missing half. report_templates is EVOLVED rather than
-- replaced (it is referenced by live rows), its `sections` become version 1 of a
-- versioned definition, and the submission lifecycle gets its own tables.
--
-- workforce_reports is NOT dropped. /workforce/reports and the existing PDF read
-- it, and the backfill migration copies its rows forward rather than moving
-- them, so the old surface keeps working while the new one takes over.
--
-- THE SHAPE
--
--   Definition   report_templates -> report_template_versions   (immutable once published)
--                report_template_assignments                     (who owes it)
--   Obligation   report_obligations                              (generated, never typed)
--   Filing       report_submissions                              (one per obligation)
--                report_submission_versions                      (immutable, one per submit)
--   Review       report_reviews, report_comments
--   Evidence     report_attachments

-- =============================================================================
-- report_templates — evolved
-- =============================================================================
ALTER TABLE report_templates
  -- What the template is scoped to. The first five report TYPES in the design
  -- are cadences (already on this table); these last three are scopes, which is
  -- a different axis: a monthly report can be department-specific.
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'organisation',
  -- Days after the period ENDS before the report is due. A monthly report
  -- cannot be written before the month has happened.
  ADD COLUMN IF NOT EXISTS due_offset_days integer NOT NULL DEFAULT 3,
  -- Days after the due date before it counts as overdue. Stops a report due on
  -- a Saturday going red before anyone is back at work.
  ADD COLUMN IF NOT EXISTS grace_days integer NOT NULL DEFAULT 1,
  -- When false, a submission is accepted on arrival with no reviewer step.
  ADD COLUMN IF NOT EXISTS requires_review boolean NOT NULL DEFAULT true,
  -- Whether the author may send a PDF copy by email at submit. Off by default:
  -- a report leaving the platform is a disclosure decision, not a convenience.
  ADD COLUMN IF NOT EXISTS allow_email_copy boolean NOT NULL DEFAULT false,
  -- How many closed periods to generate on first activation. Bounded so
  -- switching a template on does not invent a year of retrospective debt.
  ADD COLUMN IF NOT EXISTS backfill_periods integer NOT NULL DEFAULT 1,
  -- Days after acceptance before the background job locks the report.
  ADD COLUMN IF NOT EXISTS lock_after_days integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

DO $$
BEGIN
  ALTER TABLE report_templates
    ADD CONSTRAINT report_templates_scope_check
    CHECK (scope IN ('organisation', 'department', 'role', 'project', 'individual'));
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE report_templates
    ADD CONSTRAINT report_templates_offsets_check
    CHECK (due_offset_days BETWEEN 0 AND 90
           AND grace_days BETWEEN 0 AND 60
           AND backfill_periods BETWEEN 0 AND 24
           AND lock_after_days BETWEEN 0 AND 365);
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

-- The original CHECK allowed ('any','once','daily','weekly','monthly') and was
-- widened once already. Restate it by definition rather than by name so the
-- five real cadences are the five the engine computes periods for.
DO $$
DECLARE
  c text;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'report_templates' AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%cadence%'
  LOOP
    EXECUTE format('ALTER TABLE report_templates DROP CONSTRAINT %I', c);
  END LOOP;
END
$$;

-- 'ad_hoc' is kept for templates filed on request rather than on a cycle. The
-- obligation generator skips it: there is no period to be late for.
UPDATE report_templates SET cadence = 'ad_hoc' WHERE cadence IN ('any', 'once');

ALTER TABLE report_templates
  ADD CONSTRAINT report_templates_cadence_check
  CHECK (cadence IN ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'ad_hoc'));

-- =============================================================================
-- projects — supporting infrastructure
-- =============================================================================
-- Two declared capabilities have nothing to point at without this: the
-- `project_select` field type and the `project_manager` recipient source. There
-- is no projects table anywhere in the platform today, so rather than ship two
-- features that silently resolve to nothing, here is the minimum they need.
--
-- Deliberately thin. This is not a project-management module and should not
-- grow into one from this migration; it exists so a report can name the project
-- it is about and reach the person accountable for it.
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code text NOT NULL UNIQUE CHECK (length(btrim(code)) > 0),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text,
  department text,
  manager_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'on_hold', 'completed', 'cancelled')),
  starts_on date,
  ends_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects (status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_projects_manager ON projects (manager_id);

-- Who is on a project. Drives project-scoped report assignments: "everyone on
-- the Serengeti rollout files a weekly update".
CREATE TABLE IF NOT EXISTS project_members (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES workforce_employees(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'lead', 'sponsor')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_employee ON project_members (employee_id);

-- =============================================================================
-- report_template_versions — the definition, frozen
-- =============================================================================
-- A published version is immutable. This is what makes two reports filed months
-- apart comparable, and what lets a stored submission still render years later
-- against the exact structure it was written against.
CREATE TABLE IF NOT EXISTS report_template_versions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id uuid NOT NULL REFERENCES report_templates(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),

  -- { sections: [ { key, title, fields: [ { key, type, label, ... } ] } ] }
  -- Shape and validation live in lib/reports/fields.ts. Held as jsonb because
  -- the whole point is that adding a report type is an INSERT, not a migration.
  fields jsonb NOT NULL DEFAULT '{"sections":[]}'::jsonb,

  -- Recipient RULES, not people: [{ source, employeeId?, cc?, required? }].
  -- "Send to my direct manager" keeps working when someone changes team; a
  -- stored list quietly mails the previous manager for a year.
  recipient_rules jsonb NOT NULL DEFAULT '[]'::jsonb,

  change_note text,
  created_by uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,

  UNIQUE (template_id, version)
);

CREATE INDEX IF NOT EXISTS idx_report_template_versions_template
  ON report_template_versions (template_id, version DESC);

-- Only one unpublished draft version per template, so "edit the template" has
-- one obvious place to go.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_report_template_version_draft
  ON report_template_versions (template_id) WHERE published_at IS NULL;

-- A published version may never change. Without this the versioning is
-- decorative: anyone could edit v3 and every report filed against it would
-- silently change meaning.
CREATE OR REPLACE FUNCTION public.report_template_versions_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.published_at IS NOT NULL THEN
      RAISE EXCEPTION 'report.template_version_immutable' USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.published_at IS NULL THEN
    RETURN NEW; -- still a draft, edit freely
  END IF;

  IF NEW.fields IS DISTINCT FROM OLD.fields
     OR NEW.recipient_rules IS DISTINCT FROM OLD.recipient_rules
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.template_id IS DISTINCT FROM OLD.template_id
     OR NEW.published_at IS DISTINCT FROM OLD.published_at
  THEN
    RAISE EXCEPTION 'report.template_version_immutable' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_report_template_versions_immutable ON report_template_versions;
CREATE TRIGGER trg_report_template_versions_immutable
  BEFORE UPDATE OR DELETE ON report_template_versions
  FOR EACH ROW EXECUTE FUNCTION public.report_template_versions_immutable();

ALTER TABLE report_templates
  ADD COLUMN IF NOT EXISTS active_version_id uuid
    REFERENCES report_template_versions(id) ON DELETE SET NULL;

-- =============================================================================
-- report_template_assignments — who owes this report
-- =============================================================================
-- The input to obligation generation. Effective-dated so last quarter's
-- obligations still make sense after someone changes department.
CREATE TABLE IF NOT EXISTS report_template_assignments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id uuid NOT NULL REFERENCES report_templates(id) ON DELETE CASCADE,

  assignee_type text NOT NULL
    CHECK (assignee_type IN ('employee', 'department', 'role', 'project', 'everyone')),
  employee_id uuid REFERENCES workforce_employees(id) ON DELETE CASCADE,
  department text,
  role_id uuid REFERENCES workforce_roles(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,

  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,

  assigned_by uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  -- Exactly the target the type names, and nothing else. A row claiming to be a
  -- department assignment while carrying an employee id is ambiguous, and
  -- ambiguity here means somebody is either chased for a report they do not owe
  -- or never chased for one they do.
  CHECK (
    (assignee_type = 'employee'   AND employee_id IS NOT NULL AND department IS NULL AND role_id IS NULL AND project_id IS NULL) OR
    (assignee_type = 'department' AND department  IS NOT NULL AND employee_id IS NULL AND role_id IS NULL AND project_id IS NULL) OR
    (assignee_type = 'role'       AND role_id     IS NOT NULL AND employee_id IS NULL AND department IS NULL AND project_id IS NULL) OR
    (assignee_type = 'project'    AND project_id  IS NOT NULL AND employee_id IS NULL AND department IS NULL AND role_id IS NULL) OR
    (assignee_type = 'everyone'   AND employee_id IS NULL AND department IS NULL AND role_id IS NULL AND project_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_report_assignments_template
  ON report_template_assignments (template_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_report_assignments_employee
  ON report_template_assignments (employee_id) WHERE is_active;

-- =============================================================================
-- report_obligations — what is owed, generated not typed
-- =============================================================================
CREATE TABLE IF NOT EXISTS report_obligations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id uuid NOT NULL REFERENCES report_templates(id) ON DELETE CASCADE,
  -- The version in force when the obligation was raised. A template edited
  -- mid-period does not change what was already asked for.
  template_version_id uuid REFERENCES report_template_versions(id) ON DELETE SET NULL,
  employee_id uuid NOT NULL REFERENCES workforce_employees(id) ON DELETE CASCADE,

  period_start date NOT NULL,
  period_end date NOT NULL,
  period_label text NOT NULL,
  due_date date NOT NULL,

  state text NOT NULL DEFAULT 'open'
    CHECK (state IN ('open', 'submitted', 'accepted', 'overdue', 'waived', 'cancelled')),

  waived_by uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  waived_reason text,
  waived_at timestamptz,

  last_reminder_at timestamptz,
  reminder_count integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (period_end >= period_start),
  -- Idempotent generation: running the job twice produces one obligation.
  UNIQUE (template_id, employee_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_report_obligations_employee
  ON report_obligations (employee_id, due_date DESC);
CREATE INDEX IF NOT EXISTS idx_report_obligations_outstanding
  ON report_obligations (due_date) WHERE state IN ('open', 'overdue');

-- =============================================================================
-- report_submissions — one filing
-- =============================================================================
CREATE TABLE IF NOT EXISTS report_submissions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Null for an ad-hoc report filed without a standing obligation.
  obligation_id uuid REFERENCES report_obligations(id) ON DELETE SET NULL,
  template_id uuid NOT NULL REFERENCES report_templates(id) ON DELETE RESTRICT,
  template_version_id uuid REFERENCES report_template_versions(id) ON DELETE SET NULL,
  employee_id uuid NOT NULL REFERENCES workforce_employees(id) ON DELETE CASCADE,

  period_start date NOT NULL,
  period_end date NOT NULL,
  period_label text NOT NULL DEFAULT '',

  state text NOT NULL DEFAULT 'draft'
    CHECK (state IN (
      'draft', 'submitted', 'under_review', 'returned',
      'resubmitted', 'accepted', 'locked', 'cancelled', 'waived'
    )),

  -- ---- the working copy ----
  -- Autosave writes here. Kept separate from the filed versions so autosaving
  -- every thirty seconds does not mint hundreds of immutable rows.
  draft_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Optimistic concurrency. Every autosave states the revision it read; a save
  -- against a stale revision is refused rather than silently overwriting a
  -- newer one from another tab.
  draft_revision integer NOT NULL DEFAULT 0,
  draft_updated_at timestamptz,

  -- ---- lifecycle ----
  current_version integer NOT NULL DEFAULT 0,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  accepted_at timestamptz,
  locked_at timestamptz,
  cancelled_at timestamptz,
  waived_at timestamptz,
  returned_count integer NOT NULL DEFAULT 0,
  due_date date,

  -- Resolved at submit from the version's rules, and snapshotted so "why did I
  -- receive this" stays answerable after the org chart changes.
  recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  email_copy_requested boolean NOT NULL DEFAULT false,
  email_copy_sent_at timestamptz,

  prepared_by_name text,
  prepared_by_role text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (period_end >= period_start)
);

-- One submission per obligation. Two filings of the same monthly report is a
-- bug, not a feature, and this is where it stops.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_report_submission_obligation
  ON report_submissions (obligation_id) WHERE obligation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_report_submissions_employee
  ON report_submissions (employee_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_report_submissions_state
  ON report_submissions (state, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_report_submissions_review_queue
  ON report_submissions (submitted_at) WHERE state IN ('submitted', 'under_review', 'resubmitted');

-- =============================================================================
-- report_submission_versions — what was actually filed, frozen
-- =============================================================================
-- One row per submit or resubmit. Append-only, and the reason a returned report
-- preserves what was there before: the correction becomes version 2, and
-- version 1 still says what was originally filed.
--
-- field_snapshot carries the template version's structure at filing time, so a
-- PDF generated later renders the same document even if the template has since
-- gained, lost or renamed fields.
CREATE TABLE IF NOT EXISTS report_submission_versions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id uuid NOT NULL REFERENCES report_submissions(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),

  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  field_snapshot jsonb NOT NULL DEFAULT '{"sections":[]}'::jsonb,
  template_version_id uuid REFERENCES report_template_versions(id) ON DELETE SET NULL,

  author_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  /** 'submit' or 'resubmit'. */
  reason text NOT NULL DEFAULT 'submit',
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (submission_id, version)
);

CREATE INDEX IF NOT EXISTS idx_report_submission_versions_submission
  ON report_submission_versions (submission_id, version DESC);

CREATE OR REPLACE FUNCTION public.report_submission_versions_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'report.version_immutable' USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_report_submission_versions_append_only ON report_submission_versions;
CREATE TRIGGER trg_report_submission_versions_append_only
  BEFORE UPDATE OR DELETE ON report_submission_versions
  FOR EACH ROW EXECUTE FUNCTION public.report_submission_versions_append_only();

-- =============================================================================
-- report_reviews — every decision, kept
-- =============================================================================
CREATE TABLE IF NOT EXISTS report_reviews (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id uuid NOT NULL REFERENCES report_submissions(id) ON DELETE CASCADE,
  -- The version the decision was made ABOUT. A later resubmission does not
  -- retroactively move an earlier decision onto different content.
  submission_version_id uuid REFERENCES report_submission_versions(id) ON DELETE SET NULL,
  reviewer_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  reviewer_clerk_id text,

  -- Includes the author's own filings, so this table is the complete history of
  -- what happened to the report rather than only what reviewers did to it.
  action text NOT NULL
    CHECK (action IN (
      'submit', 'resubmit',
      'start_review', 'return_for_correction', 'accept', 'lock', 'reopen', 'waive', 'cancel'
    )),
  from_state text NOT NULL,
  to_state text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_reviews_submission
  ON report_reviews (submission_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.report_reviews_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'report.review_immutable' USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_report_reviews_append_only ON report_reviews;
CREATE TRIGGER trg_report_reviews_append_only
  BEFORE UPDATE OR DELETE ON report_reviews
  FOR EACH ROW EXECUTE FUNCTION public.report_reviews_append_only();

-- =============================================================================
-- report_comments — the conversation
-- =============================================================================
CREATE TABLE IF NOT EXISTS report_comments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id uuid NOT NULL REFERENCES report_submissions(id) ON DELETE CASCADE,
  submission_version_id uuid REFERENCES report_submission_versions(id) ON DELETE SET NULL,
  -- Set when the comment is about one field, so the form can show it inline
  -- beside the thing that needs fixing rather than in a wall at the bottom.
  field_key text,

  author_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  author_name text NOT NULL DEFAULT 'Unknown',
  body text NOT NULL CHECK (length(btrim(body)) > 0),
  -- 'internal' is reviewer-only. The author must never see it, which is why it
  -- is a column and not a convention.
  visibility text NOT NULL DEFAULT 'all' CHECK (visibility IN ('all', 'internal')),

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_comments_submission
  ON report_comments (submission_id, created_at);

-- =============================================================================
-- report_attachments
-- =============================================================================
CREATE TABLE IF NOT EXISTS report_attachments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id uuid NOT NULL REFERENCES report_submissions(id) ON DELETE CASCADE,
  -- The field it belongs to, for a `file` field. Null for a general attachment.
  field_key text,
  submission_version_id uuid REFERENCES report_submission_versions(id) ON DELETE SET NULL,

  file_name text NOT NULL CHECK (length(btrim(file_name)) > 0),
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),

  uploaded_by uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_attachments_submission
  ON report_attachments (submission_id);

-- =============================================================================
-- updated_at
-- =============================================================================
CREATE OR REPLACE FUNCTION public.report_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['report_template_assignments', 'report_obligations', 'report_submissions']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.report_touch_updated_at()', t, t);
  END LOOP;
END
$$;

-- =============================================================================
-- Access control
-- =============================================================================
-- RLS on with no policies: PostgREST denies every authenticated role and the
-- admin app's service-role client bypasses it. Authorization is enforced in
-- server code, where the employee has been resolved from the Clerk session.
-- Report content is confidential (salaries, client names, performance), and a
-- client-side policy is not where that should be decided.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'report_template_versions', 'report_template_assignments', 'report_obligations',
    'report_submissions', 'report_submission_versions', 'report_reviews',
    'report_comments', 'report_attachments', 'projects', 'project_members'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'report_template_versions_immutable()',
    'report_submission_versions_append_only()',
    'report_reviews_append_only()',
    'report_touch_updated_at()'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END
$$;

COMMENT ON TABLE report_template_versions IS
  'Immutable published report definitions. Editing a published version raises report.template_version_immutable — versioning that can be edited is decorative. SERVICE ROLE ONLY.';
COMMENT ON TABLE report_submission_versions IS
  'Append-only record of what was filed, one row per submit/resubmit, carrying the field structure at filing time so a PDF renders identically years later. SERVICE ROLE ONLY.';
COMMENT ON COLUMN report_submissions.draft_revision IS
  'Optimistic concurrency token for autosave. A save quoting a stale revision is refused rather than overwriting a newer draft from another tab.';

NOTIFY pgrst, 'reload schema';
