-- OpusFesta recruitment platform domain.
--
-- This migration is intentionally additive. `workforce_jobs` and
-- `workforce_candidates` remain compatibility projections for the existing
-- Workforce UI and public application action, while the normalized tables
-- below become the canonical ATS/CRM domain.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('candidate-offers', 'candidate-offers', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.recruitment_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.recruitment_prevent_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

-- ---------------------------------------------------------------------------
-- Workforce planning, positions, requisitions, and approval routing
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.recruitment_legal_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  country_code text NOT NULL,
  currency text NOT NULL DEFAULT 'TZS',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_cost_centres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  department text,
  owner_employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_job_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  rank integer NOT NULL CHECK (rank >= 0),
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_salary_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_level_id uuid REFERENCES public.recruitment_job_levels(id) ON DELETE SET NULL,
  legal_entity_id uuid REFERENCES public.recruitment_legal_entities(id) ON DELETE SET NULL,
  location text,
  currency text NOT NULL DEFAULT 'TZS',
  minimum bigint NOT NULL CHECK (minimum >= 0),
  midpoint bigint CHECK (midpoint IS NULL OR midpoint >= 0),
  maximum bigint NOT NULL CHECK (maximum >= minimum),
  effective_from date NOT NULL,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (midpoint IS NULL OR midpoint BETWEEN minimum AND maximum)
);

CREATE TABLE IF NOT EXISTS public.recruitment_workforce_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  fiscal_year integer NOT NULL CHECK (fiscal_year BETWEEN 2020 AND 2200),
  department text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'approved', 'locked', 'archived')),
  planned_headcount integer NOT NULL DEFAULT 0 CHECK (planned_headcount >= 0),
  approved_headcount integer NOT NULL DEFAULT 0 CHECK (approved_headcount >= 0),
  planned_budget_tzs bigint NOT NULL DEFAULT 0 CHECK (planned_budget_tzs >= 0),
  owner_employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  assumptions text,
  submitted_at timestamptz,
  approved_at timestamptz,
  locked_at timestamptz,
  created_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fiscal_year, department, name)
);

CREATE TABLE IF NOT EXISTS public.recruitment_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workforce_plan_id uuid REFERENCES public.recruitment_workforce_plans(id) ON DELETE SET NULL,
  position_code text NOT NULL UNIQUE,
  title text NOT NULL,
  department text NOT NULL,
  location text NOT NULL,
  employment_type text NOT NULL,
  level text,
  cost_center text,
  job_level_id uuid REFERENCES public.recruitment_job_levels(id) ON DELETE SET NULL,
  salary_band_id uuid REFERENCES public.recruitment_salary_bands(id) ON DELETE SET NULL,
  cost_centre_id uuid REFERENCES public.recruitment_cost_centres(id) ON DELETE SET NULL,
  legal_entity_id uuid REFERENCES public.recruitment_legal_entities(id) ON DELETE SET NULL,
  budgeted_salary_min_tzs bigint CHECK (budgeted_salary_min_tzs >= 0),
  budgeted_salary_max_tzs bigint CHECK (budgeted_salary_max_tzs >= 0),
  headcount integer NOT NULL DEFAULT 1 CHECK (headcount > 0),
  filled_headcount integer NOT NULL DEFAULT 0 CHECK (filled_headcount >= 0),
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'approved', 'open', 'partially_filled', 'filled', 'frozen', 'cancelled')),
  target_start_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (budgeted_salary_max_tzs IS NULL OR budgeted_salary_min_tzs IS NULL OR budgeted_salary_max_tzs >= budgeted_salary_min_tzs),
  CHECK (filled_headcount <= headcount)
);

CREATE TABLE IF NOT EXISTS public.recruitment_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_number text NOT NULL UNIQUE,
  position_id uuid REFERENCES public.recruitment_positions(id) ON DELETE SET NULL,
  title text NOT NULL,
  department text NOT NULL,
  location text NOT NULL,
  workplace_type text NOT NULL DEFAULT 'On-site'
    CHECK (workplace_type IN ('On-site', 'Hybrid', 'Remote', 'Field-based')),
  employment_type text NOT NULL,
  brand text NOT NULL DEFAULT 'OpusFesta',
  legal_entity_id uuid REFERENCES public.recruitment_legal_entities(id) ON DELETE SET NULL,
  requisition_type text NOT NULL DEFAULT 'new_headcount'
    CHECK (requisition_type IN ('new_headcount', 'replacement', 'temporary_coverage', 'internship', 'contractor', 'seasonal', 'project_based', 'confidential_replacement')),
  replaced_employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  job_level_id uuid REFERENCES public.recruitment_job_levels(id) ON DELETE SET NULL,
  salary_band_id uuid REFERENCES public.recruitment_salary_bands(id) ON DELETE SET NULL,
  cost_centre_id uuid REFERENCES public.recruitment_cost_centres(id) ON DELETE SET NULL,
  headcount integer NOT NULL DEFAULT 1 CHECK (headcount > 0),
  openings_filled integer NOT NULL DEFAULT 0 CHECK (openings_filled >= 0),
  hiring_manager_employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  recruiter_employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  requested_by_employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  reason text NOT NULL,
  responsibilities text[] NOT NULL DEFAULT '{}',
  requirements text[] NOT NULL DEFAULT '{}',
  preferred_qualifications text[] NOT NULL DEFAULT '{}',
  required_equipment jsonb NOT NULL DEFAULT '[]'::jsonb,
  budget_confirmed boolean NOT NULL DEFAULT false,
  salary_min_tzs bigint CHECK (salary_min_tzs >= 0),
  salary_max_tzs bigint CHECK (salary_max_tzs >= 0),
  currency text NOT NULL DEFAULT 'TZS',
  target_start_date date,
  target_fill_date date,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'pending_department_approval', 'pending_people_ops_approval', 'pending_finance_approval', 'pending_executive_approval', 'changes_requested', 'approved', 'open', 'recruiting', 'on_hold', 'partially_filled', 'filled', 'rejected', 'cancelled', 'closed')),
  submitted_at timestamptz,
  approved_at timestamptz,
  opened_at timestamptz,
  closed_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (openings_filled <= headcount),
  CHECK (salary_max_tzs IS NULL OR salary_min_tzs IS NULL OR salary_max_tzs >= salary_min_tzs)
);

CREATE TABLE IF NOT EXISTS public.recruitment_requisition_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL REFERENCES public.recruitment_requisitions(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  snapshot jsonb NOT NULL,
  change_summary text,
  created_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requisition_id, version)
);

CREATE TABLE IF NOT EXISTS public.recruitment_requisition_openings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL REFERENCES public.recruitment_requisitions(id) ON DELETE CASCADE,
  opening_number integer NOT NULL CHECK (opening_number > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('planned', 'open', 'on_hold', 'filled', 'cancelled')),
  hired_application_id uuid,
  target_start_date date,
  filled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requisition_id, opening_number)
);

CREATE TABLE IF NOT EXISTS public.recruitment_approval_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL REFERENCES public.recruitment_requisitions(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence > 0),
  approver_employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  approver_role text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'changes_requested', 'skipped')),
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requisition_id, sequence),
  CHECK (approver_employee_id IS NOT NULL OR approver_role IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.recruitment_requisition_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL REFERENCES public.recruitment_requisitions(id) ON DELETE CASCADE,
  author_employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (length(btrim(body)) > 0),
  is_internal boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workforce_jobs
  ADD COLUMN IF NOT EXISTS requisition_id uuid REFERENCES public.recruitment_requisitions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workforce_jobs_requisition
  ON public.workforce_jobs (requisition_id);

-- ---------------------------------------------------------------------------
-- Job publishing, channels, localisation, and application form configuration
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.recruitment_job_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workforce_job_id uuid NOT NULL UNIQUE REFERENCES public.workforce_jobs(id) ON DELETE CASCADE,
  requisition_id uuid REFERENCES public.recruitment_requisitions(id) ON DELETE SET NULL,
  internal_title text,
  public_title text NOT NULL,
  public_summary text,
  public_description text,
  benefits text[] NOT NULL DEFAULT '{}',
  success_milestones jsonb NOT NULL DEFAULT '{}'::jsonb,
  competencies jsonb NOT NULL DEFAULT '[]'::jsonb,
  contract_duration text,
  reporting_manager_title text,
  equal_opportunity_statement text,
  privacy_notice_template text,
  language_code text NOT NULL DEFAULT 'en',
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'internal', 'unlisted')),
  is_featured boolean NOT NULL DEFAULT false,
  is_urgent boolean NOT NULL DEFAULT false,
  social_image_url text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_review', 'approved', 'scheduled', 'published', 'paused', 'closed', 'archived')),
  publish_at timestamptz,
  unpublish_at timestamptz,
  published_at timestamptz,
  closed_at timestamptz,
  canonical_url text,
  seo_title text,
  seo_description text,
  created_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (unpublish_at IS NULL OR publish_at IS NULL OR unpublish_at > publish_at)
);

CREATE TABLE IF NOT EXISTS public.recruitment_job_posting_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posting_id uuid NOT NULL REFERENCES public.recruitment_job_postings(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  snapshot jsonb NOT NULL,
  created_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (posting_id, version)
);

CREATE TABLE IF NOT EXISTS public.recruitment_pipeline_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  department text,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, department)
);

CREATE TABLE IF NOT EXISTS public.recruitment_pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES public.recruitment_pipeline_templates(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  candidate_facing_status text NOT NULL,
  stage_type text NOT NULL DEFAULT 'review'
    CHECK (stage_type IN ('application', 'review', 'screening', 'assessment', 'interview', 'check', 'offer', 'hired', 'terminal')),
  sort_order integer NOT NULL,
  service_level_hours integer CHECK (service_level_hours IS NULL OR service_level_hours > 0),
  requires_scorecards boolean NOT NULL DEFAULT false,
  automation_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pipeline_id, key),
  UNIQUE (pipeline_id, sort_order)
);

ALTER TABLE public.recruitment_job_postings
  ADD COLUMN IF NOT EXISTS pipeline_id uuid REFERENCES public.recruitment_pipeline_templates(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.recruitment_job_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posting_id uuid NOT NULL REFERENCES public.recruitment_job_postings(id) ON DELETE CASCADE,
  channel text NOT NULL,
  external_job_id text,
  external_url text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'queued', 'published', 'failed', 'closed')),
  published_at timestamptz,
  closed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (posting_id, channel)
);

CREATE TABLE IF NOT EXISTS public.recruitment_job_locations (
  posting_id uuid NOT NULL REFERENCES public.recruitment_job_postings(id) ON DELETE CASCADE,
  location_name text NOT NULL,
  country_code text,
  region text,
  city text,
  is_primary boolean NOT NULL DEFAULT false,
  PRIMARY KEY (posting_id, location_name)
);

CREATE TABLE IF NOT EXISTS public.recruitment_job_languages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posting_id uuid NOT NULL REFERENCES public.recruitment_job_postings(id) ON DELETE CASCADE,
  language_code text NOT NULL,
  public_title text NOT NULL,
  public_summary text,
  public_description text,
  responsibilities text[] NOT NULL DEFAULT '{}',
  requirements text[] NOT NULL DEFAULT '{}',
  seo_title text,
  seo_description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'published')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (posting_id, language_code)
);

CREATE TABLE IF NOT EXISTS public.recruitment_job_benefits (
  posting_id uuid NOT NULL REFERENCES public.recruitment_job_postings(id) ON DELETE CASCADE,
  benefit_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (posting_id, benefit_id)
);

CREATE TABLE IF NOT EXISTS public.recruitment_application_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posting_id uuid NOT NULL REFERENCES public.recruitment_job_postings(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  help_text text,
  question_type text NOT NULL
    CHECK (question_type IN ('short_text', 'long_text', 'number', 'date', 'yes_no', 'single_select', 'multi_select', 'file', 'url', 'rating', 'consent_checkbox')),
  requirement_stage text NOT NULL DEFAULT 'application'
    CHECK (requirement_stage IN ('application', 'before_interview', 'before_hire')),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_required boolean NOT NULL DEFAULT false,
  is_knockout boolean NOT NULL DEFAULT false,
  knockout_rule jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (posting_id, key)
);

-- ---------------------------------------------------------------------------
-- Candidate CRM, applications, sources, documents, privacy, and history
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.recruitment_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_email text NOT NULL,
  normalized_email text GENERATED ALWAYS AS (lower(btrim(primary_email))) STORED,
  full_name text NOT NULL,
  preferred_name text,
  phone text,
  country text,
  city text,
  timezone text,
  pronouns text,
  current_position text,
  current_organization text,
  years_experience numeric(4,1) CHECK (years_experience IS NULL OR years_experience >= 0),
  linkedin_url text,
  portfolio_url text,
  candidate_clerk_user_id text UNIQUE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'talent_pool', 'hired', 'do_not_contact', 'anonymized', 'deleted')),
  source_summary text,
  owner_employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (normalized_email)
);

CREATE TABLE IF NOT EXISTS public.recruitment_candidate_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.recruitment_candidates(id) ON DELETE CASCADE,
  contact_type text NOT NULL CHECK (contact_type IN ('email', 'phone', 'linkedin', 'portfolio', 'other')),
  value text NOT NULL,
  normalized_value text,
  is_primary boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, contact_type, value)
);

CREATE TABLE IF NOT EXISTS public.recruitment_candidate_demographics (
  candidate_id uuid PRIMARY KEY REFERENCES public.recruitment_candidates(id) ON DELETE CASCADE,
  voluntary_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  notice_version text NOT NULL,
  consented_at timestamptz NOT NULL,
  withdrawn_at timestamptz,
  reporting_region text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.recruitment_candidate_demographics IS
  'Optional restricted demographic data. Never join into reviewer-facing candidate queries.';

CREATE TABLE IF NOT EXISTS public.recruitment_candidate_experience (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.recruitment_candidates(id) ON DELETE CASCADE,
  organization text NOT NULL,
  title text NOT NULL,
  location text,
  started_on date,
  ended_on date,
  is_current boolean NOT NULL DEFAULT false,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_on IS NULL OR started_on IS NULL OR ended_on >= started_on)
);

CREATE TABLE IF NOT EXISTS public.recruitment_candidate_education (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.recruitment_candidates(id) ON DELETE CASCADE,
  institution text NOT NULL,
  qualification text,
  field_of_study text,
  started_on date,
  ended_on date,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_on IS NULL OR started_on IS NULL OR ended_on >= started_on)
);

CREATE TABLE IF NOT EXISTS public.recruitment_candidate_skills (
  candidate_id uuid NOT NULL REFERENCES public.recruitment_candidates(id) ON DELETE CASCADE,
  skill text NOT NULL,
  proficiency text,
  years_experience numeric(4,1) CHECK (years_experience IS NULL OR years_experience >= 0),
  PRIMARY KEY (candidate_id, skill)
);

CREATE TABLE IF NOT EXISTS public.recruitment_candidate_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.recruitment_candidates(id) ON DELETE CASCADE,
  application_id uuid,
  document_type text NOT NULL
    CHECK (document_type IN ('resume', 'cover_letter', 'portfolio', 'academic_certificate', 'professional_licence', 'assessment', 'offer', 'identity', 'background_check', 'other')),
  document_class text NOT NULL DEFAULT 'candidate_general'
    CHECK (document_class IN ('candidate_general', 'recruiter_only', 'offer_confidential', 'identity_document', 'background_check', 'employee_transfer', 'restricted')),
  requirement_stage text NOT NULL DEFAULT 'application'
    CHECK (requirement_stage IN ('application', 'before_interview', 'before_hire', 'post_offer')),
  storage_bucket text NOT NULL DEFAULT 'candidate-resumes',
  storage_path text NOT NULL,
  quarantine_storage_path text,
  original_filename text,
  mime_type text,
  byte_size bigint CHECK (byte_size IS NULL OR byte_size >= 0),
  sha256 text,
  malware_scan_status text NOT NULL DEFAULT 'pending'
    CHECK (malware_scan_status IN ('pending', 'clean', 'quarantined', 'failed')),
  malware_scan_attempts integer NOT NULL DEFAULT 0 CHECK (malware_scan_attempts >= 0),
  malware_scan_error text,
  malware_scanned_at timestamptz,
  contains_sensitive_data boolean NOT NULL DEFAULT true,
  retention_until date,
  created_by_actor_type text NOT NULL DEFAULT 'candidate',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storage_bucket, storage_path)
);

CREATE TABLE IF NOT EXISTS public.recruitment_candidate_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.recruitment_candidates(id) ON DELETE CASCADE,
  consent_type text NOT NULL
    CHECK (consent_type IN ('application_processing', 'talent_pool', 'career_updates', 'sms', 'privacy_notice')),
  notice_version text,
  granted_at timestamptz,
  withdrawn_at timestamptz,
  source text NOT NULL DEFAULT 'careers_site',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (granted_at IS NOT NULL OR withdrawn_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.recruitment_candidate_preferences (
  candidate_id uuid PRIMARY KEY REFERENCES public.recruitment_candidates(id) ON DELETE CASCADE,
  preferred_departments text[] NOT NULL DEFAULT '{}',
  preferred_locations text[] NOT NULL DEFAULT '{}',
  preferred_employment_types text[] NOT NULL DEFAULT '{}',
  salary_expectation_min bigint CHECK (salary_expectation_min IS NULL OR salary_expectation_min >= 0),
  salary_expectation_max bigint CHECK (salary_expectation_max IS NULL OR salary_expectation_max >= 0),
  currency text NOT NULL DEFAULT 'TZS',
  remote_preference text,
  earliest_start_date date,
  work_authorized boolean,
  willing_to_relocate boolean,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (salary_expectation_max IS NULL OR salary_expectation_min IS NULL OR salary_expectation_max >= salary_expectation_min)
);

CREATE TABLE IF NOT EXISTS public.recruitment_candidate_saved_jobs (
  candidate_id uuid NOT NULL REFERENCES public.recruitment_candidates(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.workforce_jobs(id) ON DELETE CASCADE,
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (candidate_id, job_id)
);

CREATE TABLE IF NOT EXISTS public.recruitment_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_candidate_tags (
  candidate_id uuid NOT NULL REFERENCES public.recruitment_candidates(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.recruitment_tags(id) ON DELETE CASCADE,
  added_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (candidate_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.recruitment_candidate_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.recruitment_candidates(id) ON DELETE CASCADE,
  application_id uuid,
  author_employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (length(btrim(body)) > 0),
  visibility text NOT NULL DEFAULT 'recruiting_team'
    CHECK (visibility IN ('recruiting_team', 'hiring_team', 'private')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_candidate_merge_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surviving_candidate_id uuid NOT NULL REFERENCES public.recruitment_candidates(id) ON DELETE RESTRICT,
  merged_candidate_id uuid NOT NULL,
  merged_snapshot jsonb NOT NULL,
  merged_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (surviving_candidate_id <> merged_candidate_id)
);

CREATE TABLE IF NOT EXISTS public.recruitment_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.recruitment_candidates(id) ON DELETE RESTRICT,
  job_id uuid NOT NULL REFERENCES public.workforce_jobs(id) ON DELETE RESTRICT,
  posting_id uuid REFERENCES public.recruitment_job_postings(id) ON DELETE SET NULL,
  legacy_workforce_candidate_id uuid UNIQUE REFERENCES public.workforce_candidates(id) ON DELETE SET NULL,
  application_reference text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('draft', 'submitted', 'under_review', 'eligibility_review', 'screening', 'hiring_manager_review', 'assessment', 'interview', 'final_interview', 'reference_check', 'offer', 'on_hold', 'hired', 'rejected', 'withdrawn', 'position_closed', 'no_response', 'duplicate', 'disqualified', 'archived')),
  pipeline_stage_id uuid REFERENCES public.recruitment_pipeline_stages(id) ON DELETE SET NULL,
  candidate_facing_status text NOT NULL DEFAULT 'Application received'
    CHECK (candidate_facing_status IN ('Application received', 'Under review', 'Next steps', 'Interview process', 'Decision made', 'Offer', 'Hired', 'Withdrawn')),
  source text NOT NULL DEFAULT 'Careers Page',
  source_detail text,
  cover_letter text,
  salary_expectation text,
  earliest_start_date date,
  work_authorized boolean,
  weekend_available boolean,
  rating numeric(3,2) CHECK (rating IS NULL OR rating BETWEEN 0 AND 5),
  disposition_code text,
  disposition_note text,
  assigned_recruiter_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  submitted_at timestamptz,
  last_stage_changed_at timestamptz NOT NULL DEFAULT now(),
  hired_at timestamptz,
  rejected_at timestamptz,
  withdrawn_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, job_id)
);

ALTER TABLE public.recruitment_candidate_documents
  DROP CONSTRAINT IF EXISTS recruitment_candidate_documents_application_id_fkey;
ALTER TABLE public.recruitment_candidate_documents
  ADD CONSTRAINT recruitment_candidate_documents_application_id_fkey
  FOREIGN KEY (application_id) REFERENCES public.recruitment_applications(id) ON DELETE SET NULL;

ALTER TABLE public.recruitment_candidate_notes
  DROP CONSTRAINT IF EXISTS recruitment_candidate_notes_application_id_fkey;
ALTER TABLE public.recruitment_candidate_notes
  ADD CONSTRAINT recruitment_candidate_notes_application_id_fkey
  FOREIGN KEY (application_id) REFERENCES public.recruitment_applications(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS public.recruitment_application_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.recruitment_applications(id) ON DELETE CASCADE,
  question_id uuid REFERENCES public.recruitment_application_questions(id) ON DELETE SET NULL,
  question_key text NOT NULL,
  question_label text NOT NULL,
  answer jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, question_key)
);

ALTER TABLE public.recruitment_requisition_openings
  DROP CONSTRAINT IF EXISTS recruitment_requisition_openings_hired_application_id_fkey;
ALTER TABLE public.recruitment_requisition_openings
  ADD CONSTRAINT recruitment_requisition_openings_hired_application_id_fkey
  FOREIGN KEY (hired_application_id) REFERENCES public.recruitment_applications(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.recruitment_application_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.recruitment_applications(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  assignment_role text NOT NULL CHECK (assignment_role IN ('recruiter', 'hiring_manager', 'reviewer', 'coordinator')),
  assigned_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  UNIQUE (application_id, employee_id, assignment_role),
  CHECK (ended_at IS NULL OR ended_at >= assigned_at)
);

CREATE TABLE IF NOT EXISTS public.recruitment_disposition_reasons (
  code text PRIMARY KEY,
  label text NOT NULL,
  category text NOT NULL,
  candidate_message_key text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.recruitment_application_dispositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.recruitment_applications(id) ON DELETE CASCADE,
  reason_code text NOT NULL REFERENCES public.recruitment_disposition_reasons(code) ON DELETE RESTRICT,
  internal_note text,
  candidate_message text,
  decision_status text NOT NULL DEFAULT 'draft' CHECK (decision_status IN ('draft', 'pending_approval', 'approved', 'sent', 'cancelled')),
  decided_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  send_at timestamptz,
  decided_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_candidate_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.recruitment_applications(id) ON DELETE CASCADE,
  reviewer_employee_id uuid NOT NULL REFERENCES public.workforce_employees(id) ON DELETE RESTRICT,
  review_type text NOT NULL CHECK (review_type IN ('eligibility', 'recruiter', 'hiring_manager', 'final', 'post_hire')),
  outcome text NOT NULL CHECK (outcome IN ('pending', 'advance', 'hold', 'reject', 'needs_information')),
  evidence text,
  confidence text CHECK (confidence IS NULL OR confidence IN ('low', 'medium', 'high')),
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, reviewer_employee_id, review_type)
);

CREATE TABLE IF NOT EXISTS public.recruitment_reference_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.recruitment_applications(id) ON DELETE CASCADE,
  referee_name text NOT NULL,
  referee_email text,
  referee_phone text,
  relationship text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'requested', 'received', 'reviewed', 'cancelled')),
  response jsonb NOT NULL DEFAULT '{}'::jsonb,
  candidate_consent_at timestamptz,
  access_token_hash text UNIQUE,
  access_expires_at timestamptz,
  requested_at timestamptz,
  received_at timestamptz,
  reviewed_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- CREATE TABLE IF NOT EXISTS does not reconcile an earlier, narrower table.
-- Keep the domain migration replay-safe for installations that piloted
-- reference checks before candidate consent and token expiry were added.
ALTER TABLE public.recruitment_reference_checks
  ADD COLUMN IF NOT EXISTS candidate_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS access_token_hash text,
  ADD COLUMN IF NOT EXISTS access_expires_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS recruitment_reference_checks_access_token_hash_key
  ON public.recruitment_reference_checks(access_token_hash)
  WHERE access_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.recruitment_background_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.recruitment_applications(id) ON DELETE CASCADE,
  check_type text NOT NULL,
  provider text,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'consent_requested', 'in_progress', 'clear', 'review_required', 'failed', 'cancelled')),
  candidate_consent_at timestamptz,
  result_summary text,
  restricted_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS recruitment_background_checks_application_type_idx
  ON public.recruitment_background_checks (application_id, check_type);

CREATE TABLE IF NOT EXISTS public.recruitment_candidate_portal_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.recruitment_candidates(id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.recruitment_applications(id) ON DELETE CASCADE,
  task_type text NOT NULL CHECK (task_type IN ('questionnaire', 'document_upload', 'availability', 'notice_acknowledgement', 'offer_response', 'signature', 'privacy_request', 'background_check_consent')),
  title text NOT NULL,
  instructions text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'expired', 'cancelled')),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_candidate_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.recruitment_candidates(id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.recruitment_applications(id) ON DELETE CASCADE,
  notice_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  version text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_application_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.recruitment_applications(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  candidate_facing_status text NOT NULL,
  reason_code text,
  note text,
  changed_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  changed_by_actor_type text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_application_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.recruitment_applications(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_name text,
  campaign text,
  medium text,
  referrer_url text,
  referral_id uuid,
  agency_submission_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, source_type, source_name)
);

-- ---------------------------------------------------------------------------
-- Scorecards, interviews, availability, feedback, and assessments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.recruitment_scorecard_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  department text,
  job_id uuid REFERENCES public.workforce_jobs(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  instructions text,
  created_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_scorecard_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.recruitment_scorecard_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  weight numeric(5,2) NOT NULL DEFAULT 1 CHECK (weight > 0),
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.recruitment_scorecard_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.recruitment_scorecard_sections(id) ON DELETE CASCADE,
  label text NOT NULL,
  description text,
  rating_scale integer NOT NULL DEFAULT 5 CHECK (rating_scale BETWEEN 2 AND 10),
  weight numeric(5,2) NOT NULL DEFAULT 1 CHECK (weight > 0),
  is_required boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.recruitment_interview_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.workforce_jobs(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, name)
);

CREATE TABLE IF NOT EXISTS public.recruitment_interview_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.recruitment_interview_plans(id) ON DELETE CASCADE,
  name text NOT NULL,
  interview_type text NOT NULL
    CHECK (interview_type IN ('phone', 'video', 'onsite', 'panel', 'working_session', 'other')),
  duration_minutes integer NOT NULL DEFAULT 45 CHECK (duration_minutes BETWEEN 5 AND 480),
  scorecard_template_id uuid REFERENCES public.recruitment_scorecard_templates(id) ON DELETE SET NULL,
  instructions text,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (plan_id, sort_order)
);

CREATE TABLE IF NOT EXISTS public.recruitment_candidate_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.recruitment_candidates(id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.recruitment_applications(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  timezone text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.recruitment_interview_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  location text,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  equipment text[] NOT NULL DEFAULT '{}',
  calendar_resource_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.recruitment_applications(id) ON DELETE CASCADE,
  interview_stage_id uuid REFERENCES public.recruitment_interview_stages(id) ON DELETE SET NULL,
  scorecard_template_id uuid REFERENCES public.recruitment_scorecard_templates(id) ON DELETE SET NULL,
  title text NOT NULL,
  interview_type text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  location text,
  meeting_url text,
  room text,
  room_id uuid REFERENCES public.recruitment_interview_rooms(id) ON DELETE SET NULL,
  candidate_instructions text,
  internal_note text,
  calendar_event_id text,
  created_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.recruitment_calendar_sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL UNIQUE REFERENCES public.recruitment_interviews(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'google_calendar',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'syncing', 'synced', 'failed', 'cancelled')),
  attempt integer NOT NULL DEFAULT 0,
  last_error text,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_interview_participants (
  interview_id uuid NOT NULL REFERENCES public.recruitment_interviews(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  participant_role text NOT NULL DEFAULT 'interviewer'
    CHECK (participant_role IN ('lead', 'interviewer', 'observer', 'coordinator')),
  response_status text NOT NULL DEFAULT 'pending'
    CHECK (response_status IN ('pending', 'accepted', 'declined', 'tentative')),
  conflict_declared boolean,
  conflict_note text,
  conflict_declared_at timestamptz,
  PRIMARY KEY (interview_id, employee_id)
);

CREATE TABLE IF NOT EXISTS public.recruitment_interview_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.recruitment_interviews(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.workforce_employees(id) ON DELETE RESTRICT,
  assigned_competencies text[] NOT NULL DEFAULT '{}',
  evidence text,
  red_flags text,
  recommendation text CHECK (recommendation IN ('strong_no', 'no', 'mixed', 'yes', 'strong_yes')),
  confidence text CHECK (confidence IS NULL OR confidence IN ('low', 'medium', 'high')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'locked')),
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (interview_id, employee_id)
);

CREATE TABLE IF NOT EXISTS public.recruitment_interview_reschedule_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.recruitment_interviews(id) ON DELETE CASCADE,
  requested_by_type text NOT NULL CHECK (requested_by_type IN ('candidate', 'employee')),
  requested_by_candidate_id uuid REFERENCES public.recruitment_candidates(id) ON DELETE SET NULL,
  requested_by_employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  reason text NOT NULL,
  proposed_slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  resolved_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requested_by_candidate_id IS NOT NULL OR requested_by_employee_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.recruitment_accommodation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.recruitment_candidates(id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.recruitment_applications(id) ON DELETE CASCADE,
  interview_id uuid REFERENCES public.recruitment_interviews(id) ON DELETE SET NULL,
  request_details text NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'in_review', 'arranged', 'declined', 'cancelled')),
  restricted_note text,
  handled_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_scorecards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.recruitment_applications(id) ON DELETE CASCADE,
  interview_id uuid REFERENCES public.recruitment_interviews(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.recruitment_scorecard_templates(id) ON DELETE RESTRICT,
  reviewer_employee_id uuid NOT NULL REFERENCES public.workforce_employees(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'locked')),
  recommendation text CHECK (recommendation IN ('strong_no', 'no', 'mixed', 'yes', 'strong_yes')),
  overall_comment text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, interview_id, reviewer_employee_id)
);

CREATE TABLE IF NOT EXISTS public.recruitment_scorecard_ratings (
  scorecard_id uuid NOT NULL REFERENCES public.recruitment_scorecards(id) ON DELETE CASCADE,
  criterion_id uuid NOT NULL REFERENCES public.recruitment_scorecard_criteria(id) ON DELETE RESTRICT,
  rating numeric(4,2) NOT NULL CHECK (rating >= 0),
  comment text,
  PRIMARY KEY (scorecard_id, criterion_id)
);

CREATE TABLE IF NOT EXISTS public.recruitment_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.recruitment_applications(id) ON DELETE CASCADE,
  assessment_type text NOT NULL,
  provider text,
  external_assessment_id text,
  title text NOT NULL,
  instructions text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'invited', 'started', 'submitted', 'reviewed', 'expired', 'cancelled')),
  due_at timestamptz,
  submitted_at timestamptz,
  score numeric(8,2),
  max_score numeric(8,2),
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewer_employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_assessment_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  assessment_type text NOT NULL,
  instructions text NOT NULL,
  time_limit_minutes integer CHECK (time_limit_minutes IS NULL OR time_limit_minutes > 0),
  rubric jsonb NOT NULL DEFAULT '[]'::jsonb,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  accommodation_guidance text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recruitment_assessments
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.recruitment_assessment_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS time_limit_minutes integer CHECK (time_limit_minutes IS NULL OR time_limit_minutes > 0),
  ADD COLUMN IF NOT EXISTS accommodation_request text,
  ADD COLUMN IF NOT EXISTS integrity_note text;

CREATE TABLE IF NOT EXISTS public.recruitment_assessment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.recruitment_assessments(id) ON DELETE CASCADE,
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt > 0),
  response jsonb NOT NULL DEFAULT '{}'::jsonb,
  storage_paths text[] NOT NULL DEFAULT '{}',
  started_at timestamptz,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, attempt)
);

CREATE TABLE IF NOT EXISTS public.recruitment_assessment_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.recruitment_assessment_submissions(id) ON DELETE CASCADE,
  reviewer_employee_id uuid NOT NULL REFERENCES public.workforce_employees(id) ON DELETE RESTRICT,
  rubric_ratings jsonb NOT NULL DEFAULT '{}'::jsonb,
  score numeric(8,2),
  recommendation text,
  comments text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'locked')),
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, reviewer_employee_id)
);

-- ---------------------------------------------------------------------------
-- Communications and delivery tracking
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.recruitment_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'in_app', 'whatsapp', 'phone_log')),
  category text NOT NULL,
  language_code text NOT NULL DEFAULT 'en',
  subject_template text,
  body_template text NOT NULL,
  variables text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, channel, language_code)
);

CREATE TABLE IF NOT EXISTS public.recruitment_message_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.recruitment_message_templates(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  subject_template text,
  body_template text NOT NULL,
  change_summary text,
  created_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

CREATE TABLE IF NOT EXISTS public.recruitment_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES public.recruitment_candidates(id) ON DELETE SET NULL,
  application_id uuid REFERENCES public.recruitment_applications(id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.recruitment_message_templates(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'in_app', 'whatsapp', 'phone_log')),
  direction text NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound', 'inbound')),
  subject text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('draft', 'queued', 'sending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'cancelled')),
  scheduled_for timestamptz,
  approval_status text NOT NULL DEFAULT 'not_required' CHECK (approval_status IN ('not_required', 'pending', 'approved', 'rejected')),
  approved_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  provider_message_id text,
  sent_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  sent_at timestamptz,
  related_entity_type text,
  related_entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS recruitment_messages_automation_dedupe_idx
  ON public.recruitment_messages (template_id, related_entity_type, related_entity_id)
  WHERE template_id IS NOT NULL AND related_entity_type IS NOT NULL AND related_entity_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.recruitment_message_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.recruitment_messages(id) ON DELETE CASCADE,
  recipient_type text NOT NULL CHECK (recipient_type IN ('to', 'cc', 'bcc')),
  address text NOT NULL,
  display_name text,
  delivery_status text,
  UNIQUE (message_id, recipient_type, address)
);

CREATE TABLE IF NOT EXISTS public.recruitment_message_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.recruitment_messages(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  provider_event_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_event_id)
);

CREATE OR REPLACE FUNCTION public.recruitment_claim_messages(p_limit integer DEFAULT 20)
RETURNS SETOF public.recruitment_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT message.id
    FROM public.recruitment_messages message
    WHERE message.status = 'queued'
      AND message.approval_status IN ('not_required', 'approved')
      AND (message.scheduled_for IS NULL OR message.scheduled_for <= now())
      AND message.channel IN ('email', 'in_app', 'sms', 'whatsapp')
    ORDER BY coalesce(message.scheduled_for, message.created_at), message.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(p_limit, 100))
  )
  UPDATE public.recruitment_messages message SET status = 'sending'
  FROM claimed WHERE message.id = claimed.id
  RETURNING message.*;
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_claim_messages(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_claim_messages(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Offers, approval, acceptance, and onboarding conversion
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.recruitment_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.recruitment_applications(id) ON DELETE RESTRICT,
  offer_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'changes_requested', 'approved', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'withdrawn', 'superseded')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  job_title text NOT NULL,
  department text,
  employment_type text,
  location text,
  workplace_type text,
  start_date date,
  expires_at timestamptz,
  currency text NOT NULL DEFAULT 'TZS',
  base_salary bigint NOT NULL CHECK (base_salary >= 0),
  pay_frequency text NOT NULL DEFAULT 'monthly',
  working_hours text,
  contract_duration text,
  conditions text[] NOT NULL DEFAULT '{}',
  probation_terms text,
  manager_employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  approved_at timestamptz,
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  withdrawn_at timestamptz,
  decline_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_offer_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.recruitment_offers(id) ON DELETE CASCADE,
  component_type text NOT NULL,
  label text NOT NULL,
  amount bigint,
  currency text NOT NULL DEFAULT 'TZS',
  frequency text,
  details text,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.recruitment_offer_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.recruitment_offers(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  snapshot jsonb NOT NULL,
  document_storage_path text,
  created_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offer_id, version)
);

CREATE TABLE IF NOT EXISTS public.recruitment_offer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.recruitment_offers(id) ON DELETE CASCADE,
  offer_version_id uuid REFERENCES public.recruitment_offer_versions(id) ON DELETE SET NULL,
  document_type text NOT NULL CHECK (document_type IN ('offer_letter', 'contract', 'benefits_summary', 'policy', 'signature_certificate', 'other')),
  storage_bucket text NOT NULL DEFAULT 'candidate-offers',
  storage_path text NOT NULL,
  mime_type text,
  byte_size bigint CHECK (byte_size IS NULL OR byte_size >= 0),
  sha256 text,
  signature_provider_id text,
  signature_status text NOT NULL DEFAULT 'not_required' CHECK (signature_status IN ('not_required', 'pending', 'viewed', 'signed', 'declined', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storage_bucket, storage_path)
);

CREATE TABLE IF NOT EXISTS public.recruitment_offer_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.recruitment_offers(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence > 0),
  approver_employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  approver_role text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'changes_requested', 'skipped')),
  note text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offer_id, sequence),
  CHECK (approver_employee_id IS NOT NULL OR approver_role IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.recruitment_offer_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.recruitment_offers(id) ON DELETE CASCADE,
  response text NOT NULL CHECK (response IN ('accepted', 'declined', 'question')),
  candidate_name text,
  candidate_email text,
  typed_signature text,
  ip_hash text,
  user_agent text,
  note text,
  responded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_offer_signature_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL UNIQUE REFERENCES public.recruitment_offer_responses(id) ON DELETE RESTRICT,
  offer_id uuid NOT NULL REFERENCES public.recruitment_offers(id) ON DELETE RESTRICT,
  offer_version integer NOT NULL CHECK (offer_version > 0),
  offer_document_id uuid REFERENCES public.recruitment_offer_documents(id) ON DELETE SET NULL,
  document_sha256 text,
  signed_name text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  ip_hash text,
  user_agent text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_hiring_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL UNIQUE REFERENCES public.recruitment_applications(id) ON DELETE RESTRICT,
  offer_id uuid UNIQUE REFERENCES public.recruitment_offers(id) ON DELETE RESTRICT,
  employee_id uuid UNIQUE REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'converted', 'failed', 'cancelled')),
  employee_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  converted_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  converted_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_pre_hire_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversion_id uuid NOT NULL REFERENCES public.recruitment_hiring_conversions(id) ON DELETE CASCADE,
  check_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'passed', 'review_required', 'failed', 'waived', 'cancelled')),
  assigned_to uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  due_at timestamptz,
  completed_at timestamptz,
  result_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_onboarding_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversion_id uuid NOT NULL REFERENCES public.recruitment_hiring_conversions(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('document', 'identity_access', 'equipment', 'orientation', 'manager_setup', 'payroll', 'policy_acknowledgement', 'other')),
  title text NOT NULL,
  description text,
  assigned_to uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked', 'cancelled')),
  due_at timestamptz,
  completed_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Talent pools, nurture campaigns, employee referrals, and agencies
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.recruitment_talent_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  owner_employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  visibility text NOT NULL DEFAULT 'recruiting' CHECK (visibility IN ('private', 'recruiting', 'company')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_talent_pool_members (
  pool_id uuid NOT NULL REFERENCES public.recruitment_talent_pools(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.recruitment_candidates(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'contacted', 'converted', 'removed')),
  added_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  PRIMARY KEY (pool_id, candidate_id)
);

CREATE TABLE IF NOT EXISTS public.recruitment_nurture_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid REFERENCES public.recruitment_talent_pools(id) ON DELETE SET NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled')),
  audience_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recruitment_nurture_campaigns
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.recruitment_message_templates(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.recruitment_referral_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  rules text,
  reward_description text,
  reward_amount_tzs bigint CHECK (reward_amount_tzs IS NULL OR reward_amount_tzs >= 0),
  eligible_departments text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  starts_on date,
  ends_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);

CREATE TABLE IF NOT EXISTS public.recruitment_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_reference text NOT NULL UNIQUE,
  program_id uuid REFERENCES public.recruitment_referral_programs(id) ON DELETE SET NULL,
  referrer_employee_id uuid NOT NULL REFERENCES public.workforce_employees(id) ON DELETE RESTRICT,
  candidate_id uuid REFERENCES public.recruitment_candidates(id) ON DELETE SET NULL,
  application_id uuid REFERENCES public.recruitment_applications(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.workforce_jobs(id) ON DELETE SET NULL,
  candidate_name text NOT NULL,
  candidate_email text NOT NULL,
  relationship text,
  endorsement text,
  resume_storage_bucket text,
  resume_storage_path text,
  resume_original_filename text,
  resume_mime_type text,
  resume_byte_size bigint CHECK (resume_byte_size IS NULL OR resume_byte_size >= 0),
  consent_confirmed_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'contacted', 'applied', 'in_process', 'hired', 'not_selected', 'withdrawn')),
  conflict_disclosure text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_referral_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid NOT NULL REFERENCES public.recruitment_referrals(id) ON DELETE CASCADE,
  author_employee_id uuid NOT NULL REFERENCES public.workforce_employees(id) ON DELETE RESTRICT,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  visibility text NOT NULL DEFAULT 'employee'
    CHECK (visibility IN ('employee', 'recruitment_private')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid NOT NULL REFERENCES public.recruitment_referrals(id) ON DELETE CASCADE,
  amount_tzs bigint NOT NULL CHECK (amount_tzs >= 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'eligible', 'approved', 'paid', 'cancelled')),
  eligibility_date date,
  approved_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referral_id)
);

CREATE TABLE IF NOT EXISTS public.recruitment_agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  contact_name text,
  contact_email text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'blocked', 'archived')),
  terms text,
  fee_percent numeric(5,2) CHECK (fee_percent IS NULL OR fee_percent BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_agency_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.recruitment_agencies(id) ON DELETE RESTRICT,
  candidate_id uuid REFERENCES public.recruitment_candidates(id) ON DELETE SET NULL,
  application_id uuid REFERENCES public.recruitment_applications(id) ON DELETE SET NULL,
  job_id uuid NOT NULL REFERENCES public.workforce_jobs(id) ON DELETE RESTRICT,
  external_reference text,
  submitted_name text NOT NULL,
  submitted_email text NOT NULL,
  submitted_by_contact_id uuid,
  consent_confirmed_at timestamptz,
  consent_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  resume_storage_bucket text,
  resume_storage_path text,
  resume_original_filename text,
  resume_mime_type text,
  resume_byte_size bigint CHECK (resume_byte_size IS NULL OR resume_byte_size >= 0),
  ownership_expires_at timestamptz,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'accepted', 'duplicate', 'rejected', 'converted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, job_id, submitted_email)
);

-- ---------------------------------------------------------------------------
-- Career-site CMS
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.careers_cms_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  locale text NOT NULL DEFAULT 'en',
  title text NOT NULL,
  seo_title text,
  seo_description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'approved', 'scheduled', 'published', 'archived')),
  scheduled_at timestamptz,
  approved_at timestamptz,
  approved_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug, locale)
);

CREATE TABLE IF NOT EXISTS public.careers_cms_page_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.careers_cms_pages(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  snapshot jsonb NOT NULL,
  created_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, version)
);

CREATE TABLE IF NOT EXISTS public.careers_cms_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.careers_cms_pages(id) ON DELETE CASCADE,
  block_type text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  image_alt_text text,
  accessibility_status text NOT NULL DEFAULT 'pending' CHECK (accessibility_status IN ('pending', 'passed', 'failed', 'not_applicable')),
  sort_order integer NOT NULL DEFAULT 0,
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.careers_cms_editorial_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.careers_cms_pages(id) ON DELETE CASCADE,
  author_employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 3000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.careers_cms_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  summary text,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  hero_image_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.careers_cms_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  address text,
  country_code text,
  timezone text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.careers_cms_benefits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  icon text,
  eligible_locations text[] NOT NULL DEFAULT '{}',
  eligible_employment_types text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recruitment_job_benefits
  DROP CONSTRAINT IF EXISTS recruitment_job_benefits_benefit_id_fkey;
ALTER TABLE public.recruitment_job_benefits
  ADD CONSTRAINT recruitment_job_benefits_benefit_id_fkey
  FOREIGN KEY (benefit_id) REFERENCES public.careers_cms_benefits(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS public.careers_cms_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer text NOT NULL,
  category text,
  locale text NOT NULL DEFAULT 'en',
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.careers_cms_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  person_name text NOT NULL,
  role_title text,
  headline text NOT NULL,
  body text NOT NULL,
  image_url text,
  video_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Governance, team scope, retention, automation, and analytics
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.recruitment_team_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  team_role text NOT NULL
    CHECK (team_role IN ('recruiter', 'hiring_manager', 'interviewer', 'approver', 'analyst', 'agency_manager')),
  department text,
  requisition_id uuid REFERENCES public.recruitment_requisitions(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.workforce_jobs(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK (department IS NOT NULL OR requisition_id IS NOT NULL OR job_id IS NOT NULL)
);

CREATE OR REPLACE FUNCTION public.recruitment_employee_has_scope(
  p_employee_id uuid,
  p_entity_type text,
  p_entity_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requisition_id uuid;
  v_job_id uuid;
  v_application_id uuid;
  v_interview_id uuid;
  v_department text;
BEGIN
  IF p_entity_type = 'candidate' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.recruitment_applications candidate_application
      WHERE candidate_application.candidate_id = p_entity_id
        AND public.recruitment_employee_has_scope(
          p_employee_id, 'application', candidate_application.id
        )
    );
  ELSIF p_entity_type = 'requisition' THEN
    SELECT r.id, r.department
      INTO v_requisition_id, v_department
    FROM public.recruitment_requisitions r WHERE r.id = p_entity_id;
  ELSIF p_entity_type = 'job' THEN
    SELECT j.requisition_id, j.id, j.department
      INTO v_requisition_id, v_job_id, v_department
    FROM public.workforce_jobs j WHERE j.id = p_entity_id;
  ELSIF p_entity_type = 'application' THEN
    SELECT j.requisition_id, a.job_id, a.id, j.department
      INTO v_requisition_id, v_job_id, v_application_id, v_department
    FROM public.recruitment_applications a
    JOIN public.workforce_jobs j ON j.id = a.job_id
    WHERE a.id = p_entity_id;
  ELSIF p_entity_type = 'interview' THEN
    SELECT j.requisition_id, a.job_id, a.id, i.id, j.department
      INTO v_requisition_id, v_job_id, v_application_id, v_interview_id, v_department
    FROM public.recruitment_interviews i
    JOIN public.recruitment_applications a ON a.id = i.application_id
    JOIN public.workforce_jobs j ON j.id = a.job_id
    WHERE i.id = p_entity_id;
  ELSIF p_entity_type = 'assessment' THEN
    SELECT j.requisition_id, a.job_id, a.id, j.department
      INTO v_requisition_id, v_job_id, v_application_id, v_department
    FROM public.recruitment_assessments assessment
    JOIN public.recruitment_applications a ON a.id = assessment.application_id
    JOIN public.workforce_jobs j ON j.id = a.job_id
    WHERE assessment.id = p_entity_id;
  ELSIF p_entity_type = 'offer' THEN
    SELECT j.requisition_id, a.job_id, a.id, j.department
      INTO v_requisition_id, v_job_id, v_application_id, v_department
    FROM public.recruitment_offers o
    JOIN public.recruitment_applications a ON a.id = o.application_id
    JOIN public.workforce_jobs j ON j.id = a.job_id
    WHERE o.id = p_entity_id;
  ELSE
    RETURN false;
  END IF;

  IF v_requisition_id IS NULL AND v_job_id IS NULL AND v_application_id IS NULL AND v_interview_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.recruitment_requisitions r
    WHERE r.id = v_requisition_id
      AND p_employee_id IN (r.hiring_manager_employee_id, r.recruiter_employee_id, r.requested_by_employee_id)
  ) OR EXISTS (
    SELECT 1 FROM public.recruitment_approval_steps s
    WHERE s.requisition_id = v_requisition_id
      AND s.approver_employee_id = p_employee_id
  ) OR EXISTS (
    SELECT 1 FROM public.recruitment_application_assignments a
    WHERE a.application_id = v_application_id
      AND a.employee_id = p_employee_id
      AND (a.ended_at IS NULL OR a.ended_at > now())
  ) OR EXISTS (
    SELECT 1 FROM public.recruitment_interview_participants p
    WHERE p.interview_id = v_interview_id
      AND p.employee_id = p_employee_id
  ) OR EXISTS (
    SELECT 1 FROM public.recruitment_team_assignments t
    WHERE t.employee_id = p_employee_id
      AND t.starts_at <= now()
      AND (t.ends_at IS NULL OR t.ends_at > now())
      AND (
        (v_requisition_id IS NOT NULL AND t.requisition_id = v_requisition_id) OR
        (v_job_id IS NOT NULL AND t.job_id = v_job_id) OR
        (v_department IS NOT NULL AND t.department = v_department)
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_employee_has_scope(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_employee_has_scope(uuid, text, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_publish_approved_requisition(
  p_requisition_id uuid,
  p_slug text,
  p_visibility text,
  p_actor_employee_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.recruitment_requisitions%ROWTYPE;
  v_job_id uuid;
BEGIN
  SELECT * INTO r
  FROM public.recruitment_requisitions
  WHERE id = p_requisition_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Requisition not found' USING ERRCODE = 'P0002'; END IF;
  IF r.status NOT IN ('approved', 'open', 'recruiting', 'partially_filled') THEN
    RAISE EXCEPTION 'Requisition must be approved before publishing' USING ERRCODE = '23514';
  END IF;
  IF r.budget_confirmed IS NOT TRUE THEN
    RAISE EXCEPTION 'Requisition budget must be confirmed before publishing' USING ERRCODE = '23514';
  END IF;
  IF r.salary_min_tzs IS NULL OR r.salary_max_tzs IS NULL THEN
    RAISE EXCEPTION 'Requisition salary band is incomplete' USING ERRCODE = '23514';
  END IF;
  IF p_visibility NOT IN ('public', 'internal', 'unlisted') THEN
    RAISE EXCEPTION 'Invalid posting visibility' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.workforce_jobs (
    slug, title, department, location, employment_type, status,
    posted_salary_min_tzs, posted_salary_max_tzs, hiring_manager,
    description, summary, responsibilities, requirements,
    preferred_qualifications, workplace_type, brand, published_at,
    requisition_id
  ) VALUES (
    p_slug, r.title, r.department, r.location, r.employment_type, 'Open',
    r.salary_min_tzs, r.salary_max_tzs,
    COALESCE((SELECT full_name FROM public.workforce_employees WHERE id = r.hiring_manager_employee_id), 'Hiring team'),
    r.reason, r.reason, r.responsibilities, r.requirements,
    r.preferred_qualifications, r.workplace_type, r.brand, now(), r.id
  )
  RETURNING id INTO v_job_id;

  INSERT INTO public.recruitment_job_postings (
    workforce_job_id, requisition_id, internal_title, public_title,
    public_summary, public_description, visibility, status, published_at,
    canonical_url, created_by
  ) VALUES (
    v_job_id, r.id, r.title, r.title, r.reason, r.reason,
    p_visibility, 'published', now(), '/careers/jobs/' || p_slug,
    p_actor_employee_id
  );

  INSERT INTO public.recruitment_requisition_openings
    (requisition_id, opening_number, status, target_start_date)
  SELECT r.id, n, 'open', r.target_start_date
  FROM generate_series(1, r.headcount) AS n
  ON CONFLICT (requisition_id, opening_number) DO NOTHING;

  UPDATE public.recruitment_requisitions
  SET status = 'recruiting', opened_at = COALESCE(opened_at, now())
  WHERE id = r.id AND status = 'approved';

  INSERT INTO public.recruitment_audit_events
    (event_type, entity_type, entity_id, actor_type, metadata)
  VALUES ('job.published', 'job', v_job_id, 'employee',
    jsonb_build_object('requisition_id', r.id, 'slug', p_slug, 'visibility', p_visibility));
  RETURN v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_publish_approved_requisition(uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_publish_approved_requisition(uuid, text, text, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_submit_requisition(
  p_requisition_id uuid,
  p_actor_employee_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.recruitment_requisitions%ROWTYPE;
  v_next_version integer;
  v_roles text[] := ARRAY['department_head', 'people_ops', 'finance'];
  v_role text;
  v_sequence integer := 0;
BEGIN
  SELECT * INTO r FROM public.recruitment_requisitions
  WHERE id = p_requisition_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Requisition not found' USING ERRCODE = 'P0002'; END IF;
  IF r.status NOT IN ('draft', 'changes_requested') THEN
    RAISE EXCEPTION 'Only draft or returned requisitions can be submitted' USING ERRCODE = '23514';
  END IF;
  IF r.hiring_manager_employee_id IS NULL OR r.recruiter_employee_id IS NULL THEN
    RAISE EXCEPTION 'Hiring manager and recruiter are required' USING ERRCODE = '23514';
  END IF;
  IF r.salary_min_tzs IS NULL OR r.salary_max_tzs IS NULL OR r.budget_confirmed IS NOT TRUE THEN
    RAISE EXCEPTION 'Salary band and confirmed budget are required' USING ERRCODE = '23514';
  END IF;
  IF r.status = 'changes_requested' THEN
    v_next_version := r.version + 1;
  ELSE
    v_next_version := r.version;
  END IF;
  IF r.salary_max_tzs >= 10000000 OR r.headcount > 3 THEN
    v_roles := array_append(v_roles, 'executive');
  END IF;

  INSERT INTO public.recruitment_requisition_versions
    (requisition_id, version, snapshot, change_summary, created_by)
  VALUES (r.id, v_next_version, to_jsonb(r), 'Submitted for approval', p_actor_employee_id)
  ON CONFLICT (requisition_id, version) DO UPDATE
    SET snapshot = EXCLUDED.snapshot, change_summary = EXCLUDED.change_summary,
        created_by = EXCLUDED.created_by, created_at = now();

  DELETE FROM public.recruitment_approval_steps WHERE requisition_id = r.id;
  FOREACH v_role IN ARRAY v_roles LOOP
    v_sequence := v_sequence + 1;
    INSERT INTO public.recruitment_approval_steps
      (requisition_id, sequence, approver_role, status)
    VALUES (r.id, v_sequence, v_role, 'pending');
  END LOOP;

  UPDATE public.recruitment_requisitions
  SET status = 'pending_department_approval', submitted_at = now(), version = v_next_version
  WHERE id = r.id;

  INSERT INTO public.recruitment_audit_events
    (event_type, entity_type, entity_id, actor_type, metadata)
  VALUES ('requisition.submitted', 'requisition', r.id, 'employee',
    jsonb_build_object('actor_employee_id', p_actor_employee_id, 'approval_steps', v_roles,
      'version', v_next_version));
  RETURN v_next_version;
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_submit_requisition(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_submit_requisition(uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_decide_requisition_step(
  p_requisition_id uuid,
  p_step_id uuid,
  p_decision text,
  p_note text,
  p_actor_employee_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.recruitment_approval_steps%ROWTYPE;
  next_role text;
  next_status text;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected', 'changes_requested') THEN
    RAISE EXCEPTION 'Invalid approval decision' USING ERRCODE = '23514';
  END IF;
  IF p_decision <> 'approved' AND length(btrim(COALESCE(p_note, ''))) = 0 THEN
    RAISE EXCEPTION 'A decision note is required' USING ERRCODE = '23514';
  END IF;

  PERFORM 1 FROM public.recruitment_requisitions
  WHERE id = p_requisition_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Requisition not found' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO s FROM public.recruitment_approval_steps
  WHERE id = p_step_id AND requisition_id = p_requisition_id FOR UPDATE;
  IF NOT FOUND OR s.status <> 'pending' THEN
    RAISE EXCEPTION 'Approval step is no longer pending' USING ERRCODE = '40001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.recruitment_approval_steps prior
    WHERE prior.requisition_id = p_requisition_id
      AND prior.sequence < s.sequence
      AND prior.status <> 'approved'
  ) THEN
    RAISE EXCEPTION 'A prior approval step is incomplete' USING ERRCODE = '23514';
  END IF;

  UPDATE public.recruitment_approval_steps
  SET status = p_decision, decision_note = p_note, decided_at = now(),
      approver_employee_id = COALESCE(approver_employee_id, p_actor_employee_id)
  WHERE id = s.id;

  IF p_decision = 'rejected' THEN
    next_status := 'rejected';
  ELSIF p_decision = 'changes_requested' THEN
    next_status := 'changes_requested';
  ELSE
    SELECT approver_role INTO next_role
    FROM public.recruitment_approval_steps
    WHERE requisition_id = p_requisition_id AND status = 'pending'
    ORDER BY sequence LIMIT 1;
    next_status := CASE
      WHEN next_role IS NULL THEN 'approved'
      WHEN next_role = 'people_ops' THEN 'pending_people_ops_approval'
      WHEN next_role = 'finance' THEN 'pending_finance_approval'
      WHEN next_role = 'executive' THEN 'pending_executive_approval'
      WHEN next_role = 'department_head' THEN 'pending_department_approval'
      ELSE 'pending_approval'
    END;
  END IF;

  UPDATE public.recruitment_requisitions SET status = next_status WHERE id = p_requisition_id;
  INSERT INTO public.recruitment_audit_events
    (event_type, entity_type, entity_id, actor_type, metadata)
  VALUES (
    'requisition.' || p_decision, 'requisition', p_requisition_id, 'employee',
    jsonb_build_object('step', s.approver_role, 'sequence', s.sequence, 'next_status', next_status)
  );
  RETURN next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_decide_requisition_step(uuid, uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_decide_requisition_step(uuid, uuid, text, text, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_candidate_withdraw_application(
  p_application_id uuid,
  p_candidate_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.recruitment_applications%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.recruitment_applications
  WHERE id = p_application_id AND candidate_id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found' USING ERRCODE = 'P0002'; END IF;
  IF a.status IN ('hired', 'rejected', 'withdrawn', 'position_closed', 'duplicate', 'disqualified', 'archived') THEN
    RAISE EXCEPTION 'Application can no longer be withdrawn' USING ERRCODE = '23514';
  END IF;
  UPDATE public.recruitment_applications
  SET status = 'withdrawn', candidate_facing_status = 'Withdrawn',
      disposition_code = 'candidate_withdrew', disposition_note = p_reason
  WHERE id = a.id;
  INSERT INTO public.recruitment_audit_events
    (event_type, entity_type, entity_id, actor_type, metadata)
  VALUES ('application.withdrawn', 'application', a.id, 'candidate',
    jsonb_build_object('candidate_id', p_candidate_id, 'reason_provided', p_reason IS NOT NULL));
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_candidate_withdraw_application(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_candidate_withdraw_application(uuid, uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_submit_reference_response(
  p_token_hash text,
  p_response jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check public.recruitment_reference_checks%ROWTYPE;
BEGIN
  IF length(COALESCE(p_token_hash, '')) <> 64 OR jsonb_typeof(COALESCE(p_response, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Reference request is invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_check FROM public.recruitment_reference_checks
  WHERE access_token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND OR v_check.status <> 'requested' OR v_check.access_expires_at < now() THEN
    RAISE EXCEPTION 'Reference request is unavailable' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(COALESCE(p_response->>'relationship_confirmation', ''))) < 2
    OR length(btrim(COALESCE(p_response->>'strengths', ''))) < 10
    OR length(btrim(COALESCE(p_response->>'comments', ''))) < 10
    OR COALESCE(p_response->>'rehire', '') NOT IN ('yes', 'no', 'unsure') THEN
    RAISE EXCEPTION 'Complete all required reference fields' USING ERRCODE = '23514';
  END IF;
  UPDATE public.recruitment_reference_checks SET
    response = p_response,
    status = 'received',
    received_at = now(),
    access_token_hash = NULL,
    updated_at = now()
  WHERE id = v_check.id;
  INSERT INTO public.recruitment_audit_events
    (event_type, entity_type, entity_id, actor_type, metadata)
  VALUES ('reference.received', 'reference_check', v_check.id, 'external_referee',
    jsonb_build_object('application_id', v_check.application_id));
  RETURN v_check.id;
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_submit_reference_response(text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_submit_reference_response(text, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_candidate_respond_background_consent(
  p_task_id uuid,
  p_candidate_id uuid,
  p_consented boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task public.recruitment_candidate_portal_tasks%ROWTYPE;
  v_check public.recruitment_background_checks%ROWTYPE;
BEGIN
  SELECT * INTO v_task FROM public.recruitment_candidate_portal_tasks
  WHERE id = p_task_id AND candidate_id = p_candidate_id
    AND task_type = 'background_check_consent'
    AND status IN ('pending', 'in_progress') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consent task is unavailable' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_check FROM public.recruitment_background_checks
  WHERE id = (v_task.payload->>'background_check_id')::uuid
    AND application_id = v_task.application_id FOR UPDATE;
  IF NOT FOUND OR v_check.status <> 'consent_requested' THEN
    RAISE EXCEPTION 'Background check request is unavailable' USING ERRCODE = '23514';
  END IF;
  UPDATE public.recruitment_background_checks SET
    candidate_consent_at = CASE WHEN p_consented THEN now() ELSE NULL END,
    status = CASE WHEN p_consented THEN 'in_progress' ELSE 'cancelled' END,
    updated_at = now()
  WHERE id = v_check.id;
  UPDATE public.recruitment_candidate_portal_tasks SET
    status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = v_task.id;
  INSERT INTO public.recruitment_audit_events
    (event_type, entity_type, entity_id, actor_type, metadata)
  VALUES ('background_check.consent_responded', 'background_check', v_check.id, 'candidate',
    jsonb_build_object('consented', p_consented, 'candidate_id', p_candidate_id));
  RETURN v_check.id;
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_candidate_respond_background_consent(uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_candidate_respond_background_consent(uuid, uuid, boolean)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_candidate_respond_offer(
  p_offer_id uuid,
  p_candidate_id uuid,
  p_response text,
  p_typed_signature text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_ip_hash text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.recruitment_offers%ROWTYPE;
  a public.recruitment_applications%ROWTYPE;
  c public.recruitment_candidates%ROWTYPE;
  v_conversion_id uuid;
  v_requisition_id uuid;
  v_response_id uuid;
  v_offer_document public.recruitment_offer_documents%ROWTYPE;
BEGIN
  IF p_response NOT IN ('accepted', 'declined', 'question') THEN
    RAISE EXCEPTION 'Invalid offer response' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO o FROM public.recruitment_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO a FROM public.recruitment_applications
  WHERE id = o.application_id AND candidate_id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Offer does not belong to candidate' USING ERRCODE = '42501'; END IF;
  SELECT * INTO c FROM public.recruitment_candidates WHERE id = p_candidate_id;
  IF o.status NOT IN ('sent', 'viewed') THEN
    RAISE EXCEPTION 'Offer is not awaiting a response' USING ERRCODE = '23514';
  END IF;
  IF o.expires_at IS NOT NULL AND o.expires_at < now() THEN
    UPDATE public.recruitment_offers SET status = 'expired' WHERE id = o.id;
    RAISE EXCEPTION 'Offer has expired' USING ERRCODE = '23514';
  END IF;
  IF p_response = 'accepted' AND length(btrim(COALESCE(p_typed_signature, ''))) < 2 THEN
    RAISE EXCEPTION 'Typed signature is required' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.recruitment_offer_responses
    (offer_id, response, candidate_name, candidate_email, typed_signature, ip_hash, user_agent, note)
  VALUES (o.id, p_response, c.full_name, c.primary_email, p_typed_signature,
    left(p_ip_hash, 128), left(p_user_agent, 500), p_note)
  RETURNING id INTO v_response_id;

  IF p_response = 'accepted' THEN
    SELECT document.* INTO v_offer_document
    FROM public.recruitment_offer_documents document
    JOIN public.recruitment_offer_versions version ON version.id = document.offer_version_id
    WHERE document.offer_id = o.id AND version.version = o.version
      AND document.document_type = 'offer_letter'
    ORDER BY document.created_at DESC LIMIT 1;
    INSERT INTO public.recruitment_offer_signature_certificates
      (response_id, offer_id, offer_version, offer_document_id, document_sha256,
       signed_name, ip_hash, user_agent, evidence)
    VALUES (v_response_id, o.id, o.version, v_offer_document.id, v_offer_document.sha256,
      btrim(p_typed_signature), left(p_ip_hash, 128), left(p_user_agent, 500),
      jsonb_build_object('method', 'typed_signature', 'candidate_id', c.id,
        'application_id', a.id, 'document_hash_present', v_offer_document.sha256 IS NOT NULL));
    UPDATE public.recruitment_offers SET status = 'accepted' WHERE id = o.id;
    UPDATE public.recruitment_applications
    SET status = 'hired', candidate_facing_status = 'Hired'
    WHERE id = a.id;
    UPDATE public.recruitment_candidates SET status = 'hired' WHERE id = c.id;
    INSERT INTO public.recruitment_hiring_conversions (application_id, offer_id, status)
    VALUES (a.id, o.id, 'pending')
    ON CONFLICT (application_id) DO UPDATE SET offer_id = EXCLUDED.offer_id
    RETURNING id INTO v_conversion_id;
    INSERT INTO public.recruitment_pre_hire_checks (conversion_id, check_type)
    VALUES
      (v_conversion_id, 'identity_and_right_to_work'),
      (v_conversion_id, 'employment_terms_confirmation'),
      (v_conversion_id, 'required_documents')
    ON CONFLICT DO NOTHING;
    INSERT INTO public.recruitment_onboarding_items
      (conversion_id, item_type, title, description)
    VALUES
      (v_conversion_id, 'document', 'Collect required employment documents', 'Collect only documents required for the approved employment terms.'),
      (v_conversion_id, 'identity_access', 'Create identity and access request', 'Provision least-privilege access for the approved role.'),
      (v_conversion_id, 'equipment', 'Assign role equipment', 'Prepare and record assigned equipment.'),
      (v_conversion_id, 'orientation', 'Schedule orientation', 'Schedule company and team orientation.'),
      (v_conversion_id, 'manager_setup', 'Manager onboarding plan', 'Prepare first-week goals and introductions.'),
      (v_conversion_id, 'payroll', 'Prepare payroll setup', 'Transfer only approved compensation details.'),
      (v_conversion_id, 'policy_acknowledgement', 'Assign policy acknowledgements', 'Assign required workplace policies.');
    UPDATE public.recruitment_offer_documents
    SET signature_status = 'signed'
    WHERE offer_id = o.id AND signature_status IN ('pending', 'viewed');
    UPDATE public.recruitment_candidate_portal_tasks
    SET status = 'completed', completed_at = now()
    WHERE candidate_id = c.id AND application_id = a.id AND task_type = 'offer_response'
      AND payload->>'offer_id' = o.id::text AND status IN ('pending', 'in_progress');
    SELECT j.requisition_id INTO v_requisition_id FROM public.workforce_jobs j WHERE j.id = a.job_id;
    IF v_requisition_id IS NOT NULL THEN
      WITH next_opening AS (
        SELECT opening.id FROM public.recruitment_requisition_openings opening
        WHERE opening.requisition_id = v_requisition_id AND opening.status = 'open'
        ORDER BY opening.opening_number LIMIT 1 FOR UPDATE
      )
      UPDATE public.recruitment_requisition_openings opening
      SET status = 'filled', hired_application_id = a.id, filled_at = now()
      FROM next_opening WHERE opening.id = next_opening.id;
      UPDATE public.recruitment_requisitions r SET
        openings_filled = (SELECT count(*) FROM public.recruitment_requisition_openings opening
          WHERE opening.requisition_id = r.id AND opening.status = 'filled'),
        status = CASE
          WHEN (SELECT count(*) FROM public.recruitment_requisition_openings opening
            WHERE opening.requisition_id = r.id AND opening.status = 'filled') >= r.headcount THEN 'filled'
          ELSE 'partially_filled'
        END,
        closed_at = CASE
          WHEN (SELECT count(*) FROM public.recruitment_requisition_openings opening
            WHERE opening.requisition_id = r.id AND opening.status = 'filled') >= r.headcount THEN now()
          ELSE r.closed_at
        END
      WHERE r.id = v_requisition_id;
    END IF;
    UPDATE public.recruitment_referrals
    SET status = 'hired', application_id = a.id, candidate_id = c.id
    WHERE (application_id = a.id OR (job_id = a.job_id AND lower(candidate_email) = c.normalized_email))
      AND status NOT IN ('withdrawn', 'not_selected');
  ELSIF p_response = 'declined' THEN
    UPDATE public.recruitment_offers
    SET status = 'declined', decline_reason = p_note
    WHERE id = o.id;
  END IF;

  INSERT INTO public.recruitment_audit_events
    (event_type, entity_type, entity_id, actor_type, metadata)
  VALUES ('offer.' || p_response, 'offer', o.id, 'candidate',
    jsonb_build_object('application_id', a.id, 'candidate_id', p_candidate_id));
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_candidate_respond_offer(uuid, uuid, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_candidate_respond_offer(uuid, uuid, text, text, text, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_candidate_submit_assessment(
  p_task_id uuid,
  p_candidate_id uuid,
  p_response jsonb,
  p_storage_paths text[] DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task public.recruitment_candidate_portal_tasks%ROWTYPE;
  assessment public.recruitment_assessments%ROWTYPE;
  v_submission_id uuid;
  v_attempt integer;
BEGIN
  SELECT * INTO task FROM public.recruitment_candidate_portal_tasks
  WHERE id = p_task_id AND candidate_id = p_candidate_id FOR UPDATE;
  IF NOT FOUND OR task.task_type <> 'questionnaire' OR task.status NOT IN ('pending', 'in_progress') THEN
    RAISE EXCEPTION 'Assessment task is not available' USING ERRCODE = '42501';
  END IF;
  IF task.due_at IS NOT NULL AND task.due_at < now() THEN
    UPDATE public.recruitment_candidate_portal_tasks SET status = 'expired' WHERE id = task.id;
    RAISE EXCEPTION 'Assessment task has expired' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO assessment FROM public.recruitment_assessments
  WHERE id = (task.payload->>'assessment_id')::uuid AND application_id = task.application_id FOR UPDATE;
  IF NOT FOUND OR assessment.status NOT IN ('invited', 'started') THEN
    RAISE EXCEPTION 'Assessment is not accepting a submission' USING ERRCODE = '23514';
  END IF;
  SELECT COALESCE(max(attempt), 0) + 1 INTO v_attempt
  FROM public.recruitment_assessment_submissions WHERE assessment_id = assessment.id;
  INSERT INTO public.recruitment_assessment_submissions
    (assessment_id, attempt, response, storage_paths, started_at, submitted_at)
  VALUES (assessment.id, v_attempt, COALESCE(p_response, '{}'::jsonb),
    COALESCE(p_storage_paths, '{}'), now(), now())
  RETURNING id INTO v_submission_id;
  UPDATE public.recruitment_assessments SET status = 'submitted', submitted_at = now()
  WHERE id = assessment.id;
  UPDATE public.recruitment_candidate_portal_tasks
  SET status = 'completed', completed_at = now() WHERE id = task.id;
  INSERT INTO public.recruitment_audit_events
    (event_type, entity_type, entity_id, actor_type, metadata)
  VALUES ('assessment.submitted', 'assessment', assessment.id, 'candidate',
    jsonb_build_object('submission_id', v_submission_id, 'attempt', v_attempt,
      'has_attachments', cardinality(COALESCE(p_storage_paths, '{}')) > 0));
  RETURN v_submission_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_candidate_submit_assessment(uuid, uuid, jsonb, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_candidate_submit_assessment(uuid, uuid, jsonb, text[])
  TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_candidate_register_document(
  p_candidate_id uuid,
  p_application_id uuid,
  p_task_id uuid,
  p_document_type text,
  p_storage_bucket text,
  p_storage_path text,
  p_original_filename text,
  p_mime_type text,
  p_byte_size bigint,
  p_sha256 text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_document_id uuid;
BEGIN
  IF p_document_type NOT IN ('resume', 'cover_letter', 'portfolio', 'academic_certificate', 'professional_licence', 'assessment', 'other') THEN
    RAISE EXCEPTION 'Invalid candidate document type' USING ERRCODE = '23514';
  END IF;
  IF p_application_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.recruitment_applications a
    WHERE a.id = p_application_id AND a.candidate_id = p_candidate_id
  ) THEN RAISE EXCEPTION 'Application does not belong to candidate' USING ERRCODE = '42501'; END IF;
  IF p_task_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.recruitment_candidate_portal_tasks task
    WHERE task.id = p_task_id AND task.candidate_id = p_candidate_id
      AND task.task_type = 'document_upload' AND task.status IN ('pending', 'in_progress')
  ) THEN RAISE EXCEPTION 'Document task is not available' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.recruitment_candidate_documents (
    candidate_id, application_id, document_type, document_class, requirement_stage,
    storage_bucket, storage_path, original_filename, mime_type, byte_size, sha256,
    malware_scan_status, contains_sensitive_data, created_by_actor_type
  ) VALUES (
    p_candidate_id, p_application_id, p_document_type, 'candidate_general',
    CASE WHEN p_task_id IS NULL THEN 'application' ELSE 'before_hire' END,
    p_storage_bucket, p_storage_path, p_original_filename, p_mime_type, p_byte_size,
    p_sha256, 'pending', true, 'candidate'
  ) RETURNING id INTO v_document_id;
  IF p_task_id IS NOT NULL THEN
    UPDATE public.recruitment_candidate_portal_tasks SET status = 'completed', completed_at = now()
    WHERE id = p_task_id;
  END IF;
  INSERT INTO public.recruitment_audit_events
    (event_type, entity_type, entity_id, actor_type, metadata)
  VALUES ('candidate.document_uploaded', 'candidate_document', v_document_id, 'candidate',
    jsonb_build_object('candidate_id', p_candidate_id, 'application_id', p_application_id,
      'task_id', p_task_id, 'document_type', p_document_type));
  RETURN v_document_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_candidate_register_document(
  uuid, uuid, uuid, text, text, text, text, text, bigint, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_candidate_register_document(
  uuid, uuid, uuid, text, text, text, text, text, bigint, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_submit_public_application(
  p_job_id uuid,
  p_payload jsonb,
  p_answers jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_posting public.recruitment_job_postings%ROWTYPE;
  v_candidate_id uuid;
  v_application_id uuid;
  v_reference text;
  v_answer jsonb;
  v_question public.recruitment_application_questions%ROWTYPE;
  v_flagged_keys text[] := ARRAY[]::text[];
  v_message_id uuid;
  v_now timestamptz := now();
BEGIN
  IF jsonb_typeof(COALESCE(p_payload, '{}'::jsonb)) <> 'object'
    OR jsonb_typeof(COALESCE(p_answers, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Invalid application payload' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_posting
  FROM public.recruitment_job_postings
  WHERE workforce_job_id = p_job_id
  FOR SHARE;
  IF NOT FOUND
    OR v_posting.status <> 'published'
    OR v_posting.visibility NOT IN ('public', 'unlisted')
    OR (v_posting.publish_at IS NOT NULL AND v_posting.publish_at > v_now)
    OR (v_posting.unpublish_at IS NOT NULL AND v_posting.unpublish_at <= v_now) THEN
    RAISE EXCEPTION 'This vacancy is not accepting applications' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workforce_jobs job
    WHERE job.id = p_job_id AND job.status = 'Open'
      AND (job.closing_date IS NULL OR job.closing_date >= current_date)
  ) THEN
    RAISE EXCEPTION 'This vacancy is not accepting applications' USING ERRCODE = '23514';
  END IF;

  IF length(btrim(COALESCE(p_payload->>'full_name', ''))) < 2
    OR p_payload->>'email' IS NULL
    OR p_payload->>'application_consent_at' IS NULL THEN
    RAISE EXCEPTION 'Required candidate data is missing' USING ERRCODE = '23502';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_answers) supplied
    WHERE NOT EXISTS (
      SELECT 1 FROM public.recruitment_application_questions question
      WHERE question.id = (supplied->>'question_id')::uuid
        AND question.posting_id = v_posting.id
        AND question.requirement_stage = 'application'
    )
  ) THEN
    RAISE EXCEPTION 'An application answer does not belong to this posting' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.recruitment_application_questions question
    WHERE question.posting_id = v_posting.id
      AND question.requirement_stage = 'application'
      AND question.is_required
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_answers) supplied
        WHERE supplied->>'question_id' = question.id::text
          AND supplied ? 'answer'
          AND supplied->'answer' <> 'null'::jsonb
          AND supplied->'answer' <> '""'::jsonb
          AND supplied->'answer' <> '[]'::jsonb
          AND supplied->'answer' <> 'false'::jsonb
      )
  ) THEN
    RAISE EXCEPTION 'A required application answer is missing' USING ERRCODE = '23502';
  END IF;

  INSERT INTO public.recruitment_candidates (
    primary_email, full_name, preferred_name, phone, country, city,
    current_position, current_organization, years_experience, linkedin_url,
    portfolio_url, source_summary, last_activity_at
  ) VALUES (
    lower(btrim(p_payload->>'email')), btrim(p_payload->>'full_name'),
    NULLIF(btrim(p_payload->>'preferred_name'), ''), NULLIF(btrim(p_payload->>'phone'), ''),
    NULLIF(btrim(p_payload->>'country'), ''), NULLIF(btrim(p_payload->>'city'), ''),
    NULLIF(btrim(p_payload->>'current_position'), ''),
    NULLIF(btrim(p_payload->>'current_organization'), ''),
    NULLIF(p_payload->>'years_experience', '')::numeric,
    NULLIF(btrim(p_payload->>'linkedin_url'), ''),
    NULLIF(btrim(p_payload->>'portfolio_url'), ''),
    'Careers Page', v_now
  )
  ON CONFLICT (normalized_email) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    preferred_name = COALESCE(EXCLUDED.preferred_name, recruitment_candidates.preferred_name),
    phone = COALESCE(EXCLUDED.phone, recruitment_candidates.phone),
    country = COALESCE(EXCLUDED.country, recruitment_candidates.country),
    city = COALESCE(EXCLUDED.city, recruitment_candidates.city),
    current_position = COALESCE(EXCLUDED.current_position, recruitment_candidates.current_position),
    current_organization = COALESCE(EXCLUDED.current_organization, recruitment_candidates.current_organization),
    years_experience = COALESCE(EXCLUDED.years_experience, recruitment_candidates.years_experience),
    linkedin_url = COALESCE(EXCLUDED.linkedin_url, recruitment_candidates.linkedin_url),
    portfolio_url = COALESCE(EXCLUDED.portfolio_url, recruitment_candidates.portfolio_url),
    last_activity_at = v_now
  RETURNING id INTO v_candidate_id;

  v_reference := COALESCE(NULLIF(p_payload->>'application_reference', ''),
    'OF-' || to_char(v_now, 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)));
  INSERT INTO public.recruitment_applications (
    candidate_id, job_id, posting_id, application_reference, status,
    candidate_facing_status, source, cover_letter, salary_expectation,
    earliest_start_date, work_authorized, weekend_available, submitted_at
  ) VALUES (
    v_candidate_id, p_job_id, v_posting.id, v_reference, 'submitted',
    'Application received', 'Careers Page', NULLIF(p_payload->>'cover_letter', ''),
    NULLIF(p_payload->>'salary_expectation', ''),
    NULLIF(p_payload->>'earliest_start_date', '')::date,
    NULLIF(p_payload->>'work_authorized', '')::boolean,
    NULLIF(p_payload->>'weekend_available', '')::boolean, v_now
  ) RETURNING id INTO v_application_id;

  INSERT INTO public.recruitment_application_sources (
    application_id, source_type, source_name, campaign, medium, referrer_url, metadata
  ) VALUES (
    v_application_id,
    CASE WHEN NULLIF(p_payload->>'utm_source', '') IS NULL THEN 'careers_site' ELSE 'campaign' END,
    COALESCE(NULLIF(p_payload->>'utm_source', ''), 'Careers website'),
    NULLIF(p_payload->>'utm_campaign', ''), NULLIF(p_payload->>'utm_medium', ''),
    NULLIF(p_payload->>'referrer_url', ''), '{"immutable_original":true}'::jsonb
  );

  IF NULLIF(p_payload->>'resume_storage_path', '') IS NOT NULL THEN
    INSERT INTO public.recruitment_candidate_documents (
      candidate_id, application_id, document_type, storage_bucket, storage_path,
      original_filename, mime_type, byte_size, malware_scan_status,
      contains_sensitive_data, created_by_actor_type
    ) VALUES (
      v_candidate_id, v_application_id, 'resume', 'careers',
      p_payload->>'resume_storage_path', NULLIF(p_payload->>'resume_filename', ''),
      NULLIF(p_payload->>'resume_mime_type', ''),
      NULLIF(p_payload->>'resume_byte_size', '')::bigint, 'pending', true, 'candidate'
    );
  END IF;

  FOR v_answer IN SELECT value FROM jsonb_array_elements(p_answers)
  LOOP
    SELECT * INTO STRICT v_question
    FROM public.recruitment_application_questions
    WHERE id = (v_answer->>'question_id')::uuid AND posting_id = v_posting.id;

    INSERT INTO public.recruitment_application_answers (
      application_id, question_id, question_key, question_label, answer
    ) VALUES (
      v_application_id, v_question.id, v_question.key, v_question.label, v_answer->'answer'
    );

    IF v_question.question_type = 'file'
      AND NULLIF(v_answer->'answer'->>'storage_path', '') IS NOT NULL THEN
      INSERT INTO public.recruitment_candidate_documents (
        candidate_id, application_id, document_type, storage_bucket, storage_path,
        original_filename, mime_type, byte_size, malware_scan_status,
        contains_sensitive_data, created_by_actor_type
      ) VALUES (
        v_candidate_id, v_application_id, 'other', 'careers',
        v_answer->'answer'->>'storage_path',
        NULLIF(v_answer->'answer'->>'original_filename', ''),
        NULLIF(v_answer->'answer'->>'mime_type', ''),
        NULLIF(v_answer->'answer'->>'byte_size', '')::bigint,
        'pending', true, 'candidate'
      );
    END IF;

    IF v_question.is_knockout
      AND v_question.knockout_rule ? 'expected'
      AND lower(btrim(v_answer->'answer' #>> '{}')) <>
          lower(btrim(v_question.knockout_rule->>'expected')) THEN
      v_flagged_keys := array_append(v_flagged_keys, v_question.key);
    END IF;
  END LOOP;

  IF cardinality(v_flagged_keys) > 0 THEN
    UPDATE public.recruitment_applications
    SET status = 'eligibility_review', candidate_facing_status = 'Under review'
    WHERE id = v_application_id;
  END IF;

  INSERT INTO public.recruitment_candidate_consents (
    candidate_id, consent_type, notice_version, granted_at, source, evidence
  )
  SELECT v_candidate_id, consent_type, p_payload->>'privacy_notice_version', v_now,
    'careers_site', jsonb_build_object('application_id', v_application_id)
  FROM unnest(ARRAY[
    'application_processing'::text,
    CASE WHEN (p_payload->>'talent_pool_consent')::boolean THEN 'talent_pool' END,
    CASE WHEN (p_payload->>'career_updates_consent')::boolean THEN 'career_updates' END
  ]) consent_type
  WHERE consent_type IS NOT NULL;

  INSERT INTO public.recruitment_messages (
    candidate_id, application_id, channel, subject, body, status, approval_status
  ) VALUES (
    v_candidate_id, v_application_id, 'email',
    'Application received — ' || v_posting.public_title,
    'Hello ' || COALESCE(NULLIF(p_payload->>'preferred_name', ''), split_part(p_payload->>'full_name', ' ', 1)) || E',\n\nWe received your application for ' || v_posting.public_title || '. Your reference is ' || v_reference || E'.\n\nThank you,\nOpusFesta People Team',
    'queued', 'not_required'
  ) RETURNING id INTO v_message_id;
  INSERT INTO public.recruitment_message_recipients (
    message_id, recipient_type, address, display_name
  ) VALUES (v_message_id, 'to', lower(btrim(p_payload->>'email')), p_payload->>'full_name');

  INSERT INTO public.recruitment_candidate_notices (
    candidate_id, application_id, notice_type, title, body, version
  ) VALUES (
    v_candidate_id, v_application_id, 'application_received', 'Application received',
    'We received your application for ' || v_posting.public_title || '. Reference: ' || v_reference || '.', '1'
  );

  INSERT INTO public.recruitment_audit_events (
    event_type, entity_type, entity_id, actor_type, metadata
  ) VALUES (
    'application.submitted', 'application', v_application_id, 'candidate',
    jsonb_build_object('job_id', p_job_id, 'posting_id', v_posting.id,
      'application_reference', v_reference, 'source', 'careers_site',
      'eligibility_review_question_keys', to_jsonb(v_flagged_keys),
      'automated_decision', false)
  );

  RETURN jsonb_build_object(
    'application_id', v_application_id,
    'candidate_id', v_candidate_id,
    'reference', v_reference,
    'eligibility_review', cardinality(v_flagged_keys) > 0
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'An application using this email already exists for this role'
      USING ERRCODE = '23505';
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_submit_public_application(uuid, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_submit_public_application(uuid, jsonb, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_transition_application(
  p_application_id uuid,
  p_target_status text,
  p_actor_employee_id uuid,
  p_reason_code text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.recruitment_applications%ROWTYPE;
  candidate_status text;
BEGIN
  SELECT * INTO a FROM public.recruitment_applications
  WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found' USING ERRCODE = 'P0002'; END IF;
  IF p_target_status = a.status THEN
    RAISE EXCEPTION 'Application is already in that state' USING ERRCODE = '23514';
  END IF;
  IF p_target_status = 'rejected' THEN
    IF p_reason_code IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.recruitment_disposition_reasons d
      WHERE d.code = p_reason_code AND d.is_active
    ) THEN
      RAISE EXCEPTION 'A valid rejection reason is required' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF p_target_status IN ('interview', 'final_interview', 'reference_check', 'offer')
    AND EXISTS (
      SELECT 1
      FROM public.recruitment_scorecards s
      WHERE s.application_id = a.id AND s.status = 'draft'
    ) THEN
    RAISE EXCEPTION 'Required scorecards must be submitted before advancing' USING ERRCODE = '23514';
  END IF;

  candidate_status := CASE
    WHEN p_target_status IN ('submitted') THEN 'Application received'
    WHEN p_target_status IN ('under_review', 'eligibility_review', 'screening', 'hiring_manager_review', 'on_hold') THEN 'Under review'
    WHEN p_target_status IN ('assessment') THEN 'Next steps'
    WHEN p_target_status IN ('interview', 'final_interview') THEN 'Interview process'
    WHEN p_target_status IN ('reference_check') THEN 'Decision made'
    WHEN p_target_status = 'offer' THEN 'Offer'
    WHEN p_target_status = 'hired' THEN 'Hired'
    WHEN p_target_status = 'withdrawn' THEN 'Withdrawn'
    ELSE 'Decision made'
  END;

  UPDATE public.recruitment_applications
  SET status = p_target_status,
      candidate_facing_status = candidate_status,
      disposition_code = CASE WHEN p_target_status = 'rejected' THEN p_reason_code ELSE disposition_code END,
      disposition_note = CASE WHEN p_target_status = 'rejected' THEN p_note ELSE disposition_note END
  WHERE id = a.id;

  IF p_target_status = 'rejected' THEN
    INSERT INTO public.recruitment_application_dispositions
      (application_id, reason_code, internal_note, decision_status, decided_by, approved_by, decided_at)
    VALUES (a.id, p_reason_code, p_note, 'approved', p_actor_employee_id, p_actor_employee_id, now());
  END IF;

  INSERT INTO public.recruitment_audit_events
    (event_type, entity_type, entity_id, actor_type, metadata)
  VALUES (
    CASE WHEN p_target_status = 'rejected' THEN 'application.rejected' ELSE 'application.stage_changed' END,
    'application', a.id, 'employee',
    jsonb_build_object('from', a.status, 'to', p_target_status, 'reason_code', p_reason_code)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_transition_application(uuid, text, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_transition_application(uuid, text, uuid, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_queue_rejection_message(
  p_application_id uuid,
  p_template_id uuid,
  p_actor_employee_id uuid,
  p_scheduled_for timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.recruitment_applications%ROWTYPE;
  c public.recruitment_candidates%ROWTYPE;
  j public.workforce_jobs%ROWTYPE;
  template public.recruitment_message_templates%ROWTYPE;
  v_message_id uuid;
  v_subject text;
  v_body text;
BEGIN
  SELECT * INTO a FROM public.recruitment_applications WHERE id = p_application_id;
  IF NOT FOUND OR a.status <> 'rejected' THEN
    RAISE EXCEPTION 'A rejected application is required' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO c FROM public.recruitment_candidates WHERE id = a.candidate_id;
  SELECT * INTO j FROM public.workforce_jobs WHERE id = a.job_id;
  SELECT * INTO template FROM public.recruitment_message_templates
  WHERE id = p_template_id AND status = 'active' AND channel = 'email'
    AND category = 'rejection';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active rejection email template is required' USING ERRCODE = '23514';
  END IF;
  v_subject := replace(replace(replace(COALESCE(template.subject_template, 'Application update'),
    '{{candidate.first_name}}', split_part(c.full_name, ' ', 1)),
    '{{candidate.full_name}}', c.full_name), '{{job.title}}', j.title);
  v_body := replace(replace(replace(template.body_template,
    '{{candidate.first_name}}', split_part(c.full_name, ' ', 1)),
    '{{candidate.full_name}}', c.full_name), '{{job.title}}', j.title);
  INSERT INTO public.recruitment_messages (
    candidate_id, application_id, template_id, channel, subject, body, status,
    scheduled_for, approval_status, sent_by
  ) VALUES (
    c.id, a.id, template.id, 'email', v_subject, v_body, 'queued',
    p_scheduled_for, 'pending', p_actor_employee_id
  ) RETURNING id INTO v_message_id;
  INSERT INTO public.recruitment_message_recipients
    (message_id, recipient_type, address, display_name)
  VALUES (v_message_id, 'to', c.primary_email, c.full_name);
  INSERT INTO public.recruitment_message_events (message_id, event_type, metadata)
  VALUES (v_message_id, 'queued_for_approval',
    jsonb_build_object('actor_employee_id', p_actor_employee_id));
  INSERT INTO public.recruitment_audit_events
    (event_type, entity_type, entity_id, actor_type, metadata)
  VALUES ('rejection.communication_queued', 'application', a.id, 'employee',
    jsonb_build_object('message_id', v_message_id, 'template_id', template.id,
      'actor_employee_id', p_actor_employee_id, 'approval_required', true));
  RETURN v_message_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_queue_rejection_message(uuid, uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_queue_rejection_message(uuid, uuid, uuid, timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_bulk_reject_applications(
  p_application_ids uuid[],
  p_actor_employee_id uuid,
  p_reason_code text,
  p_note text,
  p_template_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_application_id uuid;
  v_count integer := 0;
BEGIN
  IF cardinality(p_application_ids) < 1 OR cardinality(p_application_ids) > 100 THEN
    RAISE EXCEPTION 'Choose between 1 and 100 applications' USING ERRCODE = '23514';
  END IF;
  IF cardinality(p_application_ids) <> (
    SELECT count(DISTINCT id) FROM public.recruitment_applications
    WHERE id = ANY(p_application_ids)
  ) THEN
    RAISE EXCEPTION 'One or more applications are unavailable' USING ERRCODE = 'P0002';
  END IF;
  PERFORM 1 FROM public.recruitment_applications
  WHERE id = ANY(p_application_ids) ORDER BY id FOR UPDATE;
  FOREACH v_application_id IN ARRAY p_application_ids LOOP
    PERFORM public.recruitment_transition_application(
      v_application_id, 'rejected', p_actor_employee_id, p_reason_code, p_note
    );
    PERFORM public.recruitment_queue_rejection_message(
      v_application_id, p_template_id, p_actor_employee_id, NULL
    );
    v_count := v_count + 1;
  END LOOP;
  INSERT INTO public.recruitment_audit_events
    (event_type, entity_type, actor_type, metadata)
  VALUES ('application.bulk_rejected', 'application_batch', 'employee',
    jsonb_build_object('application_ids', p_application_ids, 'count', v_count,
      'reason_code', p_reason_code, 'template_id', p_template_id,
      'actor_employee_id', p_actor_employee_id));
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_bulk_reject_applications(uuid[], uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_bulk_reject_applications(uuid[], uuid, text, text, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_submit_employee_referral(
  p_referrer_employee_id uuid,
  p_job_id uuid,
  p_candidate_name text,
  p_candidate_email text,
  p_relationship text,
  p_endorsement text,
  p_conflict_disclosure text,
  p_resume_storage_bucket text DEFAULT NULL,
  p_resume_storage_path text DEFAULT NULL,
  p_resume_original_filename text DEFAULT NULL,
  p_resume_mime_type text DEFAULT NULL,
  p_resume_byte_size bigint DEFAULT NULL
)
RETURNS TABLE (referral_id uuid, referral_reference text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_program public.recruitment_referral_programs%ROWTYPE;
  v_referral public.recruitment_referrals%ROWTYPE;
  v_email text := lower(btrim(p_candidate_email));
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.workforce_employees e
    WHERE e.id = p_referrer_employee_id AND e.status IN ('Active', 'On Leave', 'Onboarding')
  ) THEN
    RAISE EXCEPTION 'Eligible employee not found' USING ERRCODE = '42501';
  END IF;
  IF char_length(btrim(p_candidate_name)) NOT BETWEEN 2 AND 120
    OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Candidate contact details are invalid' USING ERRCODE = '23514';
  END IF;
  IF char_length(btrim(COALESCE(p_endorsement, ''))) NOT BETWEEN 10 AND 3000 THEN
    RAISE EXCEPTION 'A meaningful endorsement is required' USING ERRCODE = '23514';
  END IF;
  IF p_resume_byte_size IS NOT NULL AND p_resume_byte_size > 10485760 THEN
    RAISE EXCEPTION 'Referral CV is too large' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workforce_jobs j
    WHERE j.id = p_job_id
      AND j.status = 'Open'
      AND (j.closing_date IS NULL OR j.closing_date >= CURRENT_DATE)
  ) THEN
    RAISE EXCEPTION 'Vacancy is not accepting referrals' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.recruitment_referrals r
    WHERE r.job_id = p_job_id
      AND lower(r.candidate_email) = v_email
      AND r.status NOT IN ('withdrawn', 'not_selected')
  ) OR EXISTS (
    SELECT 1
    FROM public.recruitment_applications a
    JOIN public.recruitment_candidates c ON c.id = a.candidate_id
    WHERE a.job_id = p_job_id AND c.normalized_email = v_email
  ) THEN
    RAISE EXCEPTION 'This person is already connected to this vacancy' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_program
  FROM public.recruitment_referral_programs p
  WHERE p.status = 'active'
    AND (p.starts_on IS NULL OR p.starts_on <= CURRENT_DATE)
    AND (p.ends_on IS NULL OR p.ends_on >= CURRENT_DATE)
  ORDER BY p.starts_on DESC NULLS LAST, p.created_at DESC
  LIMIT 1;

  INSERT INTO public.recruitment_referrals (
    referral_reference, program_id, referrer_employee_id, job_id,
    candidate_name, candidate_email, relationship, endorsement,
    resume_storage_bucket, resume_storage_path, resume_original_filename,
    resume_mime_type, resume_byte_size, consent_confirmed_at, conflict_disclosure
  ) VALUES (
    'REF-' || to_char(CURRENT_DATE, 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    v_program.id, p_referrer_employee_id, p_job_id,
    btrim(p_candidate_name), v_email, nullif(btrim(p_relationship), ''), btrim(p_endorsement),
    p_resume_storage_bucket, p_resume_storage_path, p_resume_original_filename,
    p_resume_mime_type, p_resume_byte_size, now(), nullif(btrim(p_conflict_disclosure), '')
  ) RETURNING * INTO v_referral;

  INSERT INTO public.recruitment_referral_notes
    (referral_id, author_employee_id, body, visibility)
  VALUES (v_referral.id, p_referrer_employee_id, btrim(p_endorsement), 'employee');

  IF v_program.reward_amount_tzs IS NOT NULL THEN
    INSERT INTO public.recruitment_referral_rewards (referral_id, amount_tzs)
    VALUES (v_referral.id, v_program.reward_amount_tzs);
  END IF;

  INSERT INTO public.recruitment_audit_events
    (event_type, entity_type, entity_id, actor_type, metadata)
  VALUES ('referral.submitted', 'referral', v_referral.id, 'employee',
    jsonb_build_object('job_id', p_job_id, 'referrer_employee_id', p_referrer_employee_id,
      'has_cv', p_resume_storage_path IS NOT NULL));

  RETURN QUERY SELECT v_referral.id, v_referral.referral_reference;
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_submit_employee_referral(
  uuid, uuid, text, text, text, text, text, text, text, text, text, bigint
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_submit_employee_referral(
  uuid, uuid, text, text, text, text, text, text, text, text, text, bigint
) TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_add_employee_referral_note(
  p_referral_id uuid,
  p_author_employee_id uuid,
  p_body text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_note_id uuid;
BEGIN
  IF char_length(btrim(COALESCE(p_body, ''))) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Referral note is invalid' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.recruitment_referrals r
    WHERE r.id = p_referral_id AND r.referrer_employee_id = p_author_employee_id
  ) THEN
    RAISE EXCEPTION 'Referral not found' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.recruitment_referral_notes
    (referral_id, author_employee_id, body, visibility)
  VALUES (p_referral_id, p_author_employee_id, btrim(p_body), 'employee')
  RETURNING id INTO v_note_id;

  INSERT INTO public.recruitment_audit_events
    (event_type, entity_type, entity_id, actor_type, metadata)
  VALUES ('referral.note_added', 'referral', p_referral_id, 'employee',
    jsonb_build_object('author_employee_id', p_author_employee_id));
  RETURN v_note_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_add_employee_referral_note(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_add_employee_referral_note(uuid, uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_schedule_interview(
  p_interview_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text,
  p_location text,
  p_meeting_url text,
  p_room_id uuid,
  p_candidate_instructions text,
  p_actor_employee_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i public.recruitment_interviews%ROWTYPE;
BEGIN
  SELECT * INTO i FROM public.recruitment_interviews WHERE id = p_interview_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Interview not found' USING ERRCODE = 'P0002'; END IF;
  IF i.status NOT IN ('draft', 'scheduled', 'confirmed') THEN
    RAISE EXCEPTION 'Interview can no longer be scheduled' USING ERRCODE = '23514';
  END IF;
  IF p_ends_at <= p_starts_at OR p_ends_at > p_starts_at + interval '8 hours' THEN
    RAISE EXCEPTION 'Interview time range is invalid' USING ERRCODE = '23514';
  END IF;
  IF btrim(COALESCE(p_timezone, '')) = '' THEN
    RAISE EXCEPTION 'Interview timezone is required' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.recruitment_interviews other
    WHERE other.id <> i.id AND other.application_id = i.application_id
      AND other.status IN ('scheduled', 'confirmed')
      AND tstzrange(other.starts_at, other.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) THEN
    RAISE EXCEPTION 'Candidate has a conflicting interview' USING ERRCODE = '23P01';
  END IF;
  IF p_room_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.recruitment_interviews other
    WHERE other.id <> i.id AND other.room_id = p_room_id
      AND other.status IN ('scheduled', 'confirmed')
      AND tstzrange(other.starts_at, other.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) THEN
    RAISE EXCEPTION 'Interview room is already booked' USING ERRCODE = '23P01';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.recruitment_interview_participants mine
    JOIN public.recruitment_interview_participants theirs ON theirs.employee_id = mine.employee_id
    JOIN public.recruitment_interviews other ON other.id = theirs.interview_id
    WHERE mine.interview_id = i.id AND other.id <> i.id
      AND other.status IN ('scheduled', 'confirmed')
      AND tstzrange(other.starts_at, other.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) THEN
    RAISE EXCEPTION 'An interviewer has a scheduling conflict' USING ERRCODE = '23P01';
  END IF;

  UPDATE public.recruitment_interviews SET
    starts_at = p_starts_at, ends_at = p_ends_at, timezone = p_timezone,
    location = nullif(btrim(p_location), ''), meeting_url = nullif(btrim(p_meeting_url), ''),
    room_id = p_room_id, candidate_instructions = nullif(btrim(p_candidate_instructions), ''),
    status = 'scheduled'
  WHERE id = i.id;
  INSERT INTO public.recruitment_audit_events
    (event_type, entity_type, entity_id, actor_type, metadata)
  VALUES ('interview.scheduled', 'interview', i.id, 'employee',
    jsonb_build_object('actor_employee_id', p_actor_employee_id, 'starts_at', p_starts_at,
      'ends_at', p_ends_at, 'timezone', p_timezone));
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_schedule_interview(
  uuid, timestamptz, timestamptz, text, text, text, uuid, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_schedule_interview(
  uuid, timestamptz, timestamptz, text, text, text, uuid, text, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_add_interview_participant(
  p_interview_id uuid,
  p_employee_id uuid,
  p_participant_role text,
  p_actor_employee_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i public.recruitment_interviews%ROWTYPE;
  v_template_id uuid;
BEGIN
  IF p_participant_role NOT IN ('lead', 'interviewer', 'observer', 'coordinator') THEN
    RAISE EXCEPTION 'Invalid participant role' USING ERRCODE = '23514';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_employee_id::text, 0));
  SELECT * INTO i FROM public.recruitment_interviews
  WHERE id = p_interview_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Interview not found' USING ERRCODE = 'P0002'; END IF;
  IF i.status IN ('completed', 'cancelled', 'no_show') THEN
    RAISE EXCEPTION 'Interview participants are locked' USING ERRCODE = '55000';
  END IF;
  IF i.starts_at IS NOT NULL AND i.ends_at IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.recruitment_interview_participants participant
    JOIN public.recruitment_interviews other ON other.id = participant.interview_id
    WHERE participant.employee_id = p_employee_id
      AND other.id <> i.id
      AND other.status IN ('scheduled', 'confirmed')
      AND tstzrange(other.starts_at, other.ends_at, '[)') &&
          tstzrange(i.starts_at, i.ends_at, '[)')
  ) THEN
    RAISE EXCEPTION 'Employee has a conflicting interview' USING ERRCODE = '23P01';
  END IF;

  INSERT INTO public.recruitment_interview_participants
    (interview_id, employee_id, participant_role)
  VALUES (i.id, p_employee_id, p_participant_role)
  ON CONFLICT (interview_id, employee_id) DO UPDATE
    SET participant_role = EXCLUDED.participant_role;

  SELECT COALESCE(i.scorecard_template_id, stage.scorecard_template_id)
  INTO v_template_id
  FROM public.recruitment_interview_stages stage
  WHERE stage.id = i.interview_stage_id;
  v_template_id := COALESCE(v_template_id, i.scorecard_template_id);
  IF p_participant_role IN ('lead', 'interviewer') AND v_template_id IS NOT NULL THEN
    INSERT INTO public.recruitment_scorecards
      (application_id, interview_id, template_id, reviewer_employee_id)
    VALUES (i.application_id, i.id, v_template_id, p_employee_id)
    ON CONFLICT (application_id, interview_id, reviewer_employee_id) DO NOTHING;
  END IF;

  INSERT INTO public.recruitment_calendar_sync_queue
    (interview_id, provider, status, attempt, last_error)
  VALUES (i.id, 'google_calendar', 'queued', 0, NULL)
  ON CONFLICT (interview_id) DO UPDATE SET
    status = 'queued', attempt = 0, last_error = NULL, synced_at = NULL;
  INSERT INTO public.recruitment_audit_events
    (event_type, entity_type, entity_id, actor_type, metadata)
  VALUES ('interview.participant_added', 'interview', i.id, 'employee',
    jsonb_build_object('employee_id', p_employee_id, 'participant_role', p_participant_role,
      'actor_employee_id', p_actor_employee_id));
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_add_interview_participant(uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_add_interview_participant(uuid, uuid, text, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_assign_interview_scorecard(
  p_interview_id uuid,
  p_template_id uuid,
  p_actor_employee_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i public.recruitment_interviews%ROWTYPE;
BEGIN
  SELECT * INTO i FROM public.recruitment_interviews WHERE id = p_interview_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Interview not found' USING ERRCODE = 'P0002'; END IF;
  IF i.status IN ('completed', 'cancelled', 'no_show') OR EXISTS (
    SELECT 1 FROM public.recruitment_scorecards
    WHERE interview_id = i.id AND status IN ('submitted', 'locked')
  ) THEN
    RAISE EXCEPTION 'Scorecard assignment is locked' USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.recruitment_scorecard_templates
    WHERE id = p_template_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Active scorecard template not found' USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.recruitment_scorecards
  WHERE interview_id = i.id AND status = 'draft';
  UPDATE public.recruitment_interviews SET scorecard_template_id = p_template_id WHERE id = i.id;
  INSERT INTO public.recruitment_scorecards
    (application_id, interview_id, template_id, reviewer_employee_id)
  SELECT i.application_id, i.id, p_template_id, participant.employee_id
  FROM public.recruitment_interview_participants participant
  WHERE participant.interview_id = i.id
    AND participant.participant_role IN ('lead', 'interviewer')
  ON CONFLICT (application_id, interview_id, reviewer_employee_id) DO NOTHING;
  INSERT INTO public.recruitment_audit_events
    (event_type, entity_type, entity_id, actor_type, metadata)
  VALUES ('interview.scorecard_assigned', 'interview', i.id, 'employee',
    jsonb_build_object('template_id', p_template_id, 'actor_employee_id', p_actor_employee_id));
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_assign_interview_scorecard(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_assign_interview_scorecard(uuid, uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_set_interview_status(
  p_interview_id uuid,
  p_target_status text,
  p_actor_employee_id uuid,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i public.recruitment_interviews%ROWTYPE;
BEGIN
  SELECT * INTO i FROM public.recruitment_interviews WHERE id = p_interview_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Interview not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT (
    (i.status = 'scheduled' AND p_target_status IN ('confirmed', 'completed', 'cancelled', 'no_show')) OR
    (i.status = 'confirmed' AND p_target_status IN ('completed', 'cancelled', 'no_show')) OR
    (i.status = 'draft' AND p_target_status = 'cancelled')
  ) THEN
    RAISE EXCEPTION 'Invalid interview status transition' USING ERRCODE = '23514';
  END IF;
  UPDATE public.recruitment_interviews
  SET status = p_target_status,
      completed_at = CASE WHEN p_target_status = 'completed' THEN now() ELSE completed_at END,
      internal_note = CASE WHEN p_note IS NOT NULL THEN p_note ELSE internal_note END
  WHERE id = i.id;
  INSERT INTO public.recruitment_calendar_sync_queue
    (interview_id, provider, status, attempt, last_error)
  VALUES (i.id, 'google_calendar', 'queued', 0, NULL)
  ON CONFLICT (interview_id) DO UPDATE SET
    status = 'queued', attempt = 0, last_error = NULL, synced_at = NULL;
  INSERT INTO public.recruitment_audit_events
    (event_type, entity_type, entity_id, actor_type, metadata)
  VALUES ('interview.' || p_target_status, 'interview', i.id, 'employee',
    jsonb_build_object('actor_employee_id', p_actor_employee_id, 'from', i.status, 'to', p_target_status));
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_set_interview_status(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_set_interview_status(uuid, text, uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_submit_interview_feedback(
  p_interview_id uuid,
  p_employee_id uuid,
  p_assigned_competencies text[],
  p_evidence text,
  p_red_flags text,
  p_recommendation text,
  p_confidence text,
  p_conflict_declared boolean,
  p_conflict_note text,
  p_submit boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_feedback_id uuid;
  v_existing_status text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.recruitment_interview_participants p
    WHERE p.interview_id = p_interview_id AND p.employee_id = p_employee_id
      AND p.participant_role IN ('lead', 'interviewer')
  ) THEN
    RAISE EXCEPTION 'Employee is not an interviewer' USING ERRCODE = '42501';
  END IF;
  IF p_recommendation IS NOT NULL AND p_recommendation NOT IN ('strong_no', 'no', 'mixed', 'yes', 'strong_yes') THEN
    RAISE EXCEPTION 'Invalid recommendation' USING ERRCODE = '23514';
  END IF;
  IF p_confidence IS NOT NULL AND p_confidence NOT IN ('low', 'medium', 'high') THEN
    RAISE EXCEPTION 'Invalid confidence' USING ERRCODE = '23514';
  END IF;
  IF p_conflict_declared AND char_length(btrim(COALESCE(p_conflict_note, ''))) < 3 THEN
    RAISE EXCEPTION 'Conflict details are required' USING ERRCODE = '23514';
  END IF;
  IF p_submit AND (
    char_length(btrim(COALESCE(p_evidence, ''))) < 10 OR p_recommendation IS NULL OR p_confidence IS NULL
  ) THEN
    RAISE EXCEPTION 'Evidence, recommendation and confidence are required' USING ERRCODE = '23514';
  END IF;
  SELECT status INTO v_existing_status FROM public.recruitment_interview_feedback
  WHERE interview_id = p_interview_id AND employee_id = p_employee_id FOR UPDATE;
  IF v_existing_status IN ('submitted', 'locked') THEN
    RAISE EXCEPTION 'Submitted feedback is locked' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.recruitment_interview_feedback (
    interview_id, employee_id, assigned_competencies, evidence, red_flags,
    recommendation, confidence, status, submitted_at
  ) VALUES (
    p_interview_id, p_employee_id, COALESCE(p_assigned_competencies, '{}'),
    nullif(btrim(p_evidence), ''), nullif(btrim(p_red_flags), ''),
    p_recommendation, p_confidence, CASE WHEN p_submit THEN 'submitted' ELSE 'draft' END,
    CASE WHEN p_submit THEN now() ELSE NULL END
  ) ON CONFLICT (interview_id, employee_id) DO UPDATE SET
    assigned_competencies = EXCLUDED.assigned_competencies,
    evidence = EXCLUDED.evidence, red_flags = EXCLUDED.red_flags,
    recommendation = EXCLUDED.recommendation, confidence = EXCLUDED.confidence,
    status = EXCLUDED.status, submitted_at = EXCLUDED.submitted_at
  RETURNING id INTO v_feedback_id;

  UPDATE public.recruitment_interview_participants SET
    conflict_declared = p_conflict_declared,
    conflict_note = CASE WHEN p_conflict_declared THEN nullif(btrim(p_conflict_note), '') ELSE NULL END,
    conflict_declared_at = now()
  WHERE interview_id = p_interview_id AND employee_id = p_employee_id;

  IF p_submit THEN
    INSERT INTO public.recruitment_audit_events
      (event_type, entity_type, entity_id, actor_type, metadata)
    VALUES ('interview.feedback_submitted', 'interview', p_interview_id, 'employee',
      jsonb_build_object('employee_id', p_employee_id, 'feedback_id', v_feedback_id,
        'conflict_declared', p_conflict_declared));
  END IF;
  RETURN v_feedback_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_submit_interview_feedback(
  uuid, uuid, text[], text, text, text, text, boolean, text, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_submit_interview_feedback(
  uuid, uuid, text[], text, text, text, text, boolean, text, boolean
) TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_submit_interview_scorecard(
  p_interview_id uuid,
  p_employee_id uuid,
  p_assigned_competencies text[],
  p_evidence text,
  p_red_flags text,
  p_recommendation text,
  p_confidence text,
  p_conflict_declared boolean,
  p_conflict_note text,
  p_ratings jsonb,
  p_submit boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_feedback_id uuid;
  v_scorecard public.recruitment_scorecards%ROWTYPE;
  v_rating jsonb;
  v_criterion public.recruitment_scorecard_criteria%ROWTYPE;
BEGIN
  v_feedback_id := public.recruitment_submit_interview_feedback(
    p_interview_id, p_employee_id, p_assigned_competencies, p_evidence,
    p_red_flags, p_recommendation, p_confidence, p_conflict_declared,
    p_conflict_note, p_submit
  );
  IF jsonb_typeof(COALESCE(p_ratings, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Invalid scorecard ratings' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_scorecard FROM public.recruitment_scorecards
  WHERE interview_id = p_interview_id AND reviewer_employee_id = p_employee_id
  FOR UPDATE;
  IF NOT FOUND THEN
    IF jsonb_array_length(COALESCE(p_ratings, '[]'::jsonb)) > 0 THEN
      RAISE EXCEPTION 'No scorecard is assigned' USING ERRCODE = '23514';
    END IF;
    RETURN v_feedback_id;
  END IF;
  IF v_scorecard.status IN ('submitted', 'locked') THEN
    RAISE EXCEPTION 'Submitted scorecard is locked' USING ERRCODE = '55000';
  END IF;
  IF p_submit AND EXISTS (
    SELECT 1
    FROM public.recruitment_scorecard_criteria criterion
    JOIN public.recruitment_scorecard_sections section ON section.id = criterion.section_id
    WHERE section.template_id = v_scorecard.template_id
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(p_ratings, '[]'::jsonb)) rating
        WHERE rating->>'criterion_id' = criterion.id::text
          AND NULLIF(rating->>'rating', '') IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'Complete every scorecard criterion before submitting' USING ERRCODE = '23514';
  END IF;

  FOR v_rating IN SELECT value FROM jsonb_array_elements(COALESCE(p_ratings, '[]'::jsonb))
  LOOP
    SELECT criterion.* INTO v_criterion
    FROM public.recruitment_scorecard_criteria criterion
    JOIN public.recruitment_scorecard_sections section ON section.id = criterion.section_id
    WHERE criterion.id = (v_rating->>'criterion_id')::uuid
      AND section.template_id = v_scorecard.template_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Scorecard criterion does not belong to the assigned template' USING ERRCODE = '23514';
    END IF;
    IF (v_rating->>'rating')::numeric < 1
      OR (v_rating->>'rating')::numeric > v_criterion.rating_scale THEN
      RAISE EXCEPTION 'Scorecard rating is outside its scale' USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.recruitment_scorecard_ratings
      (scorecard_id, criterion_id, rating, comment)
    VALUES (v_scorecard.id, v_criterion.id, (v_rating->>'rating')::numeric,
      NULLIF(btrim(v_rating->>'comment'), ''))
    ON CONFLICT (scorecard_id, criterion_id) DO UPDATE SET
      rating = EXCLUDED.rating, comment = EXCLUDED.comment;
  END LOOP;

  UPDATE public.recruitment_scorecards SET
    recommendation = p_recommendation,
    overall_comment = NULLIF(btrim(p_evidence), ''),
    status = CASE WHEN p_submit THEN 'submitted' ELSE 'draft' END,
    submitted_at = CASE WHEN p_submit THEN now() ELSE NULL END
  WHERE id = v_scorecard.id;
  IF p_submit THEN
    INSERT INTO public.recruitment_audit_events
      (event_type, entity_type, entity_id, actor_type, metadata)
    VALUES ('scorecard.submitted', 'scorecard', v_scorecard.id, 'employee',
      jsonb_build_object('interview_id', p_interview_id, 'employee_id', p_employee_id));
  END IF;
  RETURN v_feedback_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_submit_interview_scorecard(
  uuid, uuid, text[], text, text, text, text, boolean, text, jsonb, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_submit_interview_scorecard(
  uuid, uuid, text[], text, text, text, text, boolean, text, jsonb, boolean
) TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_create_offer(
  p_application_id uuid,
  p_start_date date,
  p_expires_at timestamptz,
  p_base_salary bigint,
  p_pay_frequency text,
  p_working_hours text,
  p_contract_duration text,
  p_probation_terms text,
  p_conditions text[],
  p_actor_employee_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.recruitment_applications%ROWTYPE;
  j public.workforce_jobs%ROWTYPE;
  r public.recruitment_requisitions%ROWTYPE;
  v_offer_id uuid;
  v_number text;
BEGIN
  SELECT * INTO a FROM public.recruitment_applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found' USING ERRCODE = 'P0002'; END IF;
  IF a.status NOT IN ('final_interview', 'reference_check', 'offer') THEN
    RAISE EXCEPTION 'Application is not ready for an offer' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO j FROM public.workforce_jobs WHERE id = a.job_id;
  IF j.status <> 'Open' OR j.requisition_id IS NULL THEN
    RAISE EXCEPTION 'Job is not backed by an approved requisition' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO r FROM public.recruitment_requisitions WHERE id = j.requisition_id;
  IF r.status NOT IN ('recruiting', 'partially_filled') THEN
    RAISE EXCEPTION 'Requisition is not recruiting' USING ERRCODE = '23514';
  END IF;
  IF p_base_salary < 0 OR p_start_date < CURRENT_DATE OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'Offer dates or compensation are invalid' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.recruitment_offers o
    WHERE o.application_id = a.id AND o.status NOT IN ('declined', 'expired', 'withdrawn', 'superseded')
  ) THEN
    RAISE EXCEPTION 'An active offer already exists' USING ERRCODE = '23505';
  END IF;
  v_number := 'OFF-' || to_char(CURRENT_DATE, 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  INSERT INTO public.recruitment_offers (
    application_id, offer_number, job_title, department, employment_type,
    location, workplace_type, start_date, expires_at, base_salary,
    pay_frequency, working_hours, contract_duration, probation_terms,
    conditions, manager_employee_id, created_by
  ) VALUES (
    a.id, v_number, j.title, j.department, j.employment_type,
    j.location, j.workplace_type, p_start_date, p_expires_at, p_base_salary,
    COALESCE(nullif(btrim(p_pay_frequency), ''), 'monthly'), nullif(btrim(p_working_hours), ''),
    nullif(btrim(p_contract_duration), ''), nullif(btrim(p_probation_terms), ''),
    COALESCE(p_conditions, '{}'), r.hiring_manager_employee_id, p_actor_employee_id
  ) RETURNING id INTO v_offer_id;
  IF a.status <> 'offer' THEN
    UPDATE public.recruitment_applications
    SET status = 'offer', candidate_facing_status = 'Offer'
    WHERE id = a.id;
  END IF;
  INSERT INTO public.recruitment_audit_events
    (event_type, entity_type, entity_id, actor_type, metadata)
  VALUES ('offer.created', 'offer', v_offer_id, 'employee',
    jsonb_build_object('application_id', a.id, 'actor_employee_id', p_actor_employee_id,
      'offer_number', v_number));
  RETURN v_offer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_create_offer(
  uuid, date, timestamptz, bigint, text, text, text, text, text[], uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_create_offer(
  uuid, date, timestamptz, bigint, text, text, text, text, text[], uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_submit_offer_for_approval(
  p_offer_id uuid,
  p_actor_employee_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.recruitment_offers%ROWTYPE;
  v_roles text[] := ARRAY['hiring_manager', 'people_ops', 'finance'];
  v_role text;
  v_sequence integer := 0;
BEGIN
  SELECT * INTO o FROM public.recruitment_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found' USING ERRCODE = 'P0002'; END IF;
  IF o.status NOT IN ('draft', 'changes_requested') THEN
    RAISE EXCEPTION 'Offer cannot be submitted from its current state' USING ERRCODE = '23514';
  END IF;
  IF o.start_date IS NULL OR o.expires_at IS NULL OR o.expires_at <= now() THEN
    RAISE EXCEPTION 'Offer dates are incomplete' USING ERRCODE = '23514';
  END IF;
  IF o.status = 'changes_requested' THEN
    UPDATE public.recruitment_offers SET status = 'draft', version = version + 1 WHERE id = o.id
    RETURNING * INTO o;
  END IF;
  IF o.base_salary >= 10000000 THEN v_roles := array_append(v_roles, 'executive'); END IF;
  INSERT INTO public.recruitment_offer_versions
    (offer_id, version, snapshot, created_by)
  VALUES (o.id, o.version, to_jsonb(o), p_actor_employee_id)
  ON CONFLICT (offer_id, version) DO UPDATE
    SET snapshot = EXCLUDED.snapshot, created_by = EXCLUDED.created_by, created_at = now();
  DELETE FROM public.recruitment_offer_approvals WHERE offer_id = o.id;
  FOREACH v_role IN ARRAY v_roles LOOP
    v_sequence := v_sequence + 1;
    INSERT INTO public.recruitment_offer_approvals (offer_id, sequence, approver_role)
    VALUES (o.id, v_sequence, v_role);
  END LOOP;
  UPDATE public.recruitment_offers SET status = 'pending_approval' WHERE id = o.id;
  INSERT INTO public.recruitment_audit_events
    (event_type, entity_type, entity_id, actor_type, metadata)
  VALUES ('offer.submitted', 'offer', o.id, 'employee',
    jsonb_build_object('actor_employee_id', p_actor_employee_id, 'approval_steps', v_roles,
      'version', o.version));
  RETURN o.version;
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_submit_offer_for_approval(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_submit_offer_for_approval(uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_decide_offer_step(
  p_offer_id uuid,
  p_step_id uuid,
  p_decision text,
  p_note text,
  p_actor_employee_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.recruitment_offers%ROWTYPE;
  s public.recruitment_offer_approvals%ROWTYPE;
  v_status text;
BEGIN
  SELECT * INTO o FROM public.recruitment_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND OR o.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Offer is not awaiting approval' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO s FROM public.recruitment_offer_approvals
  WHERE id = p_step_id AND offer_id = o.id FOR UPDATE;
  IF NOT FOUND OR s.status <> 'pending' THEN RAISE EXCEPTION 'Approval step is not pending' USING ERRCODE = '23514'; END IF;
  IF s.approver_employee_id IS NOT NULL AND s.approver_employee_id <> p_actor_employee_id THEN
    RAISE EXCEPTION 'Approval step is assigned to another employee' USING ERRCODE = '42501';
  END IF;
  IF o.created_by = p_actor_employee_id THEN
    RAISE EXCEPTION 'Offer creator cannot approve their own offer' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approved', 'changes_requested', 'rejected') THEN
    RAISE EXCEPTION 'Invalid decision' USING ERRCODE = '23514';
  END IF;
  IF p_decision <> 'approved' AND char_length(btrim(COALESCE(p_note, ''))) < 3 THEN
    RAISE EXCEPTION 'Decision note is required' USING ERRCODE = '23514';
  END IF;
  UPDATE public.recruitment_offer_approvals SET
    status = p_decision, note = nullif(btrim(p_note), ''), decided_at = now(),
    approver_employee_id = COALESCE(approver_employee_id, p_actor_employee_id)
  WHERE id = s.id;
  IF p_decision = 'changes_requested' THEN
    UPDATE public.recruitment_offers SET status = 'changes_requested' WHERE id = o.id;
    v_status := 'changes_requested';
  ELSIF p_decision = 'rejected' THEN
    UPDATE public.recruitment_offers SET status = 'withdrawn' WHERE id = o.id;
    v_status := 'withdrawn';
  ELSE
    PERFORM 1 FROM public.recruitment_offer_approvals
    WHERE offer_id = o.id AND status = 'pending' ORDER BY sequence LIMIT 1;
    IF FOUND THEN v_status := 'pending_approval';
    ELSE UPDATE public.recruitment_offers SET status = 'approved' WHERE id = o.id; v_status := 'approved'; END IF;
  END IF;
  INSERT INTO public.recruitment_audit_events
    (event_type, entity_type, entity_id, actor_type, metadata)
  VALUES ('offer.approval_' || p_decision, 'offer', o.id, 'employee',
    jsonb_build_object('step_id', s.id, 'approver_role', s.approver_role,
      'actor_employee_id', p_actor_employee_id, 'resulting_status', v_status));
  RETURN v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_decide_offer_step(uuid, uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_decide_offer_step(uuid, uuid, text, text, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_send_approved_offer(
  p_offer_id uuid,
  p_actor_employee_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.recruitment_offers%ROWTYPE;
  a public.recruitment_applications%ROWTYPE;
  c public.recruitment_candidates%ROWTYPE;
  v_message_id uuid;
BEGIN
  SELECT * INTO o FROM public.recruitment_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND OR o.status <> 'approved' OR o.expires_at <= now() THEN
    RAISE EXCEPTION 'Offer is not ready to send' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO a FROM public.recruitment_applications WHERE id = o.application_id;
  SELECT * INTO c FROM public.recruitment_candidates WHERE id = a.candidate_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.recruitment_offer_versions v
    WHERE v.offer_id = o.id AND v.version = o.version
  ) THEN RAISE EXCEPTION 'Offer version snapshot is missing' USING ERRCODE = '23514'; END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.recruitment_offer_documents d
    JOIN public.recruitment_offer_versions v ON v.id = d.offer_version_id
    WHERE d.offer_id = o.id AND v.version = o.version AND d.document_type = 'offer_letter'
  ) THEN RAISE EXCEPTION 'Approved offer document is missing' USING ERRCODE = '23514'; END IF;
  UPDATE public.recruitment_offers SET status = 'sent' WHERE id = o.id;
  INSERT INTO public.recruitment_candidate_portal_tasks
    (candidate_id, application_id, task_type, title, instructions, payload, due_at)
  VALUES (c.id, a.id, 'offer_response', 'Review your offer for ' || o.job_title,
    'Review the approved terms, ask questions, or accept or decline before the expiry date.',
    jsonb_build_object('offer_id', o.id, 'offer_number', o.offer_number, 'version', o.version), o.expires_at);
  INSERT INTO public.recruitment_messages
    (candidate_id, application_id, channel, subject, body, status, approval_status, sent_by)
  VALUES (c.id, a.id, 'email', 'Your OpusFesta offer: ' || o.job_title,
    'An approved offer is ready in your candidate portal. Sign in to review and respond.',
    'queued', 'approved', p_actor_employee_id)
  RETURNING id INTO v_message_id;
  INSERT INTO public.recruitment_message_recipients
    (message_id, recipient_type, address, display_name)
  VALUES (v_message_id, 'to', c.primary_email, c.full_name);
  INSERT INTO public.recruitment_audit_events
    (event_type, entity_type, entity_id, actor_type, metadata)
  VALUES ('offer.sent', 'offer', o.id, 'employee',
    jsonb_build_object('actor_employee_id', p_actor_employee_id, 'message_id', v_message_id,
      'version', o.version));
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_send_approved_offer(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_send_approved_offer(uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_convert_candidate_to_employee(
  p_conversion_id uuid,
  p_actor_employee_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conv public.recruitment_hiring_conversions%ROWTYPE;
  a public.recruitment_applications%ROWTYPE;
  o public.recruitment_offers%ROWTYPE;
  c public.recruitment_candidates%ROWTYPE;
  v_employee_id uuid;
  v_employee_code text;
BEGIN
  SELECT * INTO conv FROM public.recruitment_hiring_conversions WHERE id = p_conversion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversion not found' USING ERRCODE = 'P0002'; END IF;
  IF conv.status = 'converted' THEN RETURN conv.employee_id; END IF;
  SELECT * INTO a FROM public.recruitment_applications WHERE id = conv.application_id;
  SELECT * INTO o FROM public.recruitment_offers WHERE id = conv.offer_id;
  SELECT * INTO c FROM public.recruitment_candidates WHERE id = a.candidate_id;
  IF o.status <> 'accepted' OR a.status <> 'hired' THEN
    RAISE EXCEPTION 'Accepted offer and hired application are required' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.recruitment_pre_hire_checks check_row
    WHERE check_row.conversion_id = conv.id AND check_row.status NOT IN ('passed', 'waived')
  ) THEN
    RAISE EXCEPTION 'Pre-hire checks are incomplete' USING ERRCODE = '23514';
  END IF;
  SELECT e.id INTO v_employee_id FROM public.workforce_employees e
  WHERE lower(btrim(e.email)) = c.normalized_email;
  IF v_employee_id IS NOT NULL THEN
    RAISE EXCEPTION 'An employee record already uses this email' USING ERRCODE = '23505';
  END IF;
  v_employee_code := 'EMP-' || to_char(CURRENT_DATE, 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  INSERT INTO public.workforce_employees (
    employee_code, full_name, email, phone, job_title, department,
    manager_id, employment_type, status, location, start_date, salary_tzs,
    notes
  ) VALUES (
    v_employee_code, c.full_name, c.primary_email, c.phone, o.job_title, o.department,
    o.manager_employee_id, o.employment_type, 'Onboarding', o.location, o.start_date,
    o.base_salary, 'Created by recruitment conversion ' || conv.id::text
  ) RETURNING id INTO v_employee_id;
  UPDATE public.recruitment_hiring_conversions SET
    employee_id = v_employee_id, status = 'converted', converted_by = p_actor_employee_id,
    converted_at = now(),
    employee_payload = jsonb_build_object(
      'employee_code', v_employee_code, 'job_title', o.job_title,
      'department', o.department, 'manager_employee_id', o.manager_employee_id,
      'employment_type', o.employment_type, 'location', o.location,
      'start_date', o.start_date, 'base_salary', o.base_salary, 'currency', o.currency
    ), error_message = NULL
  WHERE id = conv.id;
  UPDATE public.recruitment_onboarding_items
  SET assigned_to = CASE WHEN item_type = 'manager_setup' THEN o.manager_employee_id ELSE assigned_to END
  WHERE conversion_id = conv.id;
  INSERT INTO public.recruitment_audit_events
    (event_type, entity_type, entity_id, actor_type, metadata)
  VALUES ('hiring_conversion.completed', 'hiring_conversion', conv.id, 'employee',
    jsonb_build_object('actor_employee_id', p_actor_employee_id, 'employee_id', v_employee_id,
      'application_id', a.id, 'offer_id', o.id));
  RETURN v_employee_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_convert_candidate_to_employee(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_convert_candidate_to_employee(uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.careers_cms_transition_page(
  p_page_id uuid,
  p_target_status text,
  p_actor_employee_id uuid,
  p_scheduled_at timestamptz DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  page_row public.careers_cms_pages%ROWTYPE;
  v_version integer;
  v_snapshot jsonb;
BEGIN
  SELECT * INTO page_row FROM public.careers_cms_pages WHERE id = p_page_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Careers page not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT (
    (page_row.status = 'draft' AND p_target_status IN ('in_review', 'archived')) OR
    (page_row.status = 'in_review' AND p_target_status IN ('draft', 'approved', 'archived')) OR
    (page_row.status = 'approved' AND p_target_status IN ('draft', 'scheduled', 'published', 'archived')) OR
    (page_row.status = 'scheduled' AND p_target_status IN ('draft', 'published', 'archived')) OR
    (page_row.status = 'published' AND p_target_status IN ('draft', 'archived'))
  ) THEN RAISE EXCEPTION 'Invalid careers editorial transition' USING ERRCODE = '23514'; END IF;
  IF p_target_status = 'scheduled' AND (p_scheduled_at IS NULL OR p_scheduled_at <= now()) THEN
    RAISE EXCEPTION 'A future publication time is required' USING ERRCODE = '23514';
  END IF;
  IF p_target_status IN ('approved', 'scheduled', 'published') AND EXISTS (
    SELECT 1 FROM public.careers_cms_blocks block
    WHERE block.page_id = page_row.id AND block.is_visible
      AND block.block_type IN ('image', 'hero', 'media', 'story')
      AND (block.image_alt_text IS NULL OR btrim(block.image_alt_text) = '')
  ) THEN RAISE EXCEPTION 'Visible image blocks require alternative text' USING ERRCODE = '23514'; END IF;
  SELECT COALESCE(max(version), 0) + 1 INTO v_version
  FROM public.careers_cms_page_versions WHERE page_id = page_row.id;
  SELECT jsonb_build_object(
    'page', to_jsonb(page_row),
    'blocks', COALESCE(jsonb_agg(to_jsonb(block) ORDER BY block.sort_order) FILTER (WHERE block.id IS NOT NULL), '[]'::jsonb)
  ) INTO v_snapshot
  FROM public.careers_cms_blocks block WHERE block.page_id = page_row.id;
  INSERT INTO public.careers_cms_page_versions (page_id, version, snapshot, created_by)
  VALUES (page_row.id, v_version, v_snapshot, p_actor_employee_id);
  UPDATE public.careers_cms_pages SET
    status = p_target_status,
    scheduled_at = CASE WHEN p_target_status = 'scheduled' THEN p_scheduled_at ELSE NULL END,
    approved_at = CASE WHEN p_target_status = 'approved' THEN now() ELSE approved_at END,
    approved_by = CASE WHEN p_target_status = 'approved' THEN p_actor_employee_id ELSE approved_by END,
    published_at = CASE WHEN p_target_status = 'published' THEN now() ELSE published_at END,
    updated_by = p_actor_employee_id
  WHERE id = page_row.id;
  INSERT INTO public.recruitment_audit_events
    (event_type, entity_type, entity_id, actor_type, metadata)
  VALUES ('careers.page_' || p_target_status, 'careers_page', page_row.id, 'employee',
    jsonb_build_object('from', page_row.status, 'to', p_target_status,
      'version', v_version, 'actor_employee_id', p_actor_employee_id));
  RETURN v_version;
END;
$$;

REVOKE ALL ON FUNCTION public.careers_cms_transition_page(uuid, text, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.careers_cms_transition_page(uuid, text, uuid, timestamptz)
  TO service_role;

CREATE TABLE IF NOT EXISTS public.recruitment_retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type text NOT NULL UNIQUE,
  retention_days integer NOT NULL CHECK (retention_days > 0),
  action text NOT NULL CHECK (action IN ('review', 'anonymize', 'delete')),
  legal_basis text,
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_reference text NOT NULL UNIQUE,
  candidate_id uuid REFERENCES public.recruitment_candidates(id) ON DELETE SET NULL,
  requester_email text NOT NULL,
  request_type text NOT NULL CHECK (request_type IN ('access', 'correction', 'export', 'withdraw_consent', 'delete')),
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'identity_verification', 'in_progress', 'completed', 'denied', 'cancelled')),
  verification_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution_note text,
  due_at timestamptz NOT NULL,
  completed_at timestamptz,
  handled_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_legal_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES public.recruitment_candidates(id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.recruitment_applications(id) ON DELETE CASCADE,
  reason text NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  released_at timestamptz,
  created_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  released_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (candidate_id IS NOT NULL OR application_id IS NOT NULL),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.recruitment_retention_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES public.recruitment_retention_policies(id) ON DELETE RESTRICT,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'held', 'processing', 'completed', 'failed', 'cancelled')),
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (policy_id, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS public.recruitment_document_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.recruitment_candidate_documents(id) ON DELETE RESTRICT,
  actor_employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  actor_type text NOT NULL,
  action text NOT NULL CHECK (action IN ('view', 'download', 'replace', 'quarantine', 'delete')),
  reason text,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trigger_event text NOT NULL,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  priority integer NOT NULL DEFAULT 100,
  last_run_at timestamptz,
  created_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.recruitment_automation_rules(id) ON DELETE CASCADE,
  trigger_event_id text,
  entity_type text NOT NULL,
  entity_id uuid,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'skipped')),
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt > 0),
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_id, trigger_event_id, attempt)
);

CREATE TABLE IF NOT EXISTS public.recruitment_scheduled_application_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.recruitment_applications(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN ('reject', 'advance', 'archive')),
  target_status text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  execute_after timestamptz,
  trigger_offer_id uuid REFERENCES public.recruitment_offers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'processing', 'completed', 'failed', 'cancelled')),
  created_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  executed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (execute_after IS NOT NULL OR trigger_offer_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.recruitment_duplicate_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.recruitment_candidates(id) ON DELETE CASCADE,
  possible_duplicate_id uuid NOT NULL REFERENCES public.recruitment_candidates(id) ON DELETE CASCADE,
  matched_fields text[] NOT NULL,
  confidence numeric(5,4) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed_duplicate', 'not_duplicate', 'merged')),
  reviewed_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (candidate_id <> possible_duplicate_id),
  UNIQUE (candidate_id, possible_duplicate_id)
);

CREATE TABLE IF NOT EXISTS public.recruitment_post_hire_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversion_id uuid NOT NULL REFERENCES public.recruitment_hiring_conversions(id) ON DELETE CASCADE,
  review_period text NOT NULL CHECK (review_period IN ('30_days', '90_days', 'probation', 'six_months')),
  reviewer_employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  hiring_manager_satisfaction numeric(3,2) CHECK (hiring_manager_satisfaction IS NULL OR hiring_manager_satisfaction BETWEEN 0 AND 5),
  performance_outcome text,
  retention_status text,
  source_quality_note text,
  restricted_notes text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversion_id, review_period)
);

CREATE TABLE IF NOT EXISTS public.recruitment_analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  anonymous_session_id text,
  candidate_id uuid REFERENCES public.recruitment_candidates(id) ON DELETE SET NULL,
  application_id uuid REFERENCES public.recruitment_applications(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.workforce_jobs(id) ON DELETE SET NULL,
  source text,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date date NOT NULL,
  job_id uuid REFERENCES public.workforce_jobs(id) ON DELETE CASCADE,
  department text,
  source text,
  applications integer NOT NULL DEFAULT 0,
  qualified integer NOT NULL DEFAULT 0,
  interviews integer NOT NULL DEFAULT 0,
  offers integer NOT NULL DEFAULT 0,
  hires integer NOT NULL DEFAULT 0,
  rejections integer NOT NULL DEFAULT 0,
  withdrawals integer NOT NULL DEFAULT 0,
  median_time_in_stage_hours numeric(12,2)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_recruitment_daily_metrics_dimensions
  ON public.recruitment_daily_metrics (
    metric_date,
    coalesce(job_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(department, ''),
    coalesce(source, '')
  );

CREATE TABLE IF NOT EXISTS public.recruitment_source_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  source_type text NOT NULL,
  utm_source text,
  utm_medium text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruitment_privacy_notice_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL,
  version text NOT NULL,
  locale text NOT NULL DEFAULT 'en',
  title text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'retired')),
  effective_at timestamptz,
  created_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (purpose, version, locale)
);

CREATE TABLE IF NOT EXISTS public.recruitment_agency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.recruitment_agencies(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, email)
);

ALTER TABLE public.recruitment_agency_submissions
  ADD CONSTRAINT recruitment_agency_submissions_submitted_by_contact_id_fkey
  FOREIGN KEY (submitted_by_contact_id) REFERENCES public.recruitment_agency_contacts(id)
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.recruitment_agency_job_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.recruitment_agencies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.workforce_jobs(id) ON DELETE CASCADE,
  ownership_days integer NOT NULL DEFAULT 180 CHECK (ownership_days BETWEEN 1 AND 730),
  guarantee_days integer CHECK (guarantee_days IS NULL OR guarantee_days BETWEEN 0 AND 730),
  fee_percent numeric(5,2) CHECK (fee_percent IS NULL OR fee_percent BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed')),
  assigned_by uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, job_id)
);

CREATE TABLE IF NOT EXISTS public.recruitment_assessment_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.recruitment_assessments(id) ON DELETE RESTRICT,
  actor_employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  action text NOT NULL CHECK (action IN ('view', 'download')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.recruitment_merge_candidates(
  p_surviving_candidate_id uuid,
  p_merged_candidate_id uuid,
  p_actor_employee_id uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source public.recruitment_candidates%ROWTYPE;
  v_locked_count integer;
BEGIN
  IF p_surviving_candidate_id = p_merged_candidate_id THEN
    RAISE EXCEPTION 'Candidates must be different';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'A merge reason is required';
  END IF;

  PERFORM 1 FROM public.recruitment_candidates
    WHERE id IN (p_surviving_candidate_id, p_merged_candidate_id)
    ORDER BY id FOR UPDATE;
  SELECT count(*) INTO v_locked_count FROM public.recruitment_candidates
  WHERE id IN (p_surviving_candidate_id, p_merged_candidate_id);
  IF v_locked_count <> 2 THEN RAISE EXCEPTION 'Candidate not found'; END IF;
  SELECT * INTO STRICT v_source FROM public.recruitment_candidates WHERE id = p_merged_candidate_id;

  IF EXISTS (
    SELECT 1 FROM public.recruitment_applications source_application
    JOIN public.recruitment_applications surviving_application
      ON surviving_application.candidate_id = p_surviving_candidate_id
     AND surviving_application.job_id = source_application.job_id
    WHERE source_application.candidate_id = p_merged_candidate_id
  ) THEN
    RAISE EXCEPTION 'Resolve duplicate applications for the same job before merging candidates';
  END IF;

  INSERT INTO public.recruitment_candidate_merge_history
    (surviving_candidate_id, merged_candidate_id, merged_snapshot, merged_by, reason)
  VALUES (
    p_surviving_candidate_id, p_merged_candidate_id,
    jsonb_build_object('full_name', v_source.full_name, 'primary_email', v_source.primary_email,
      'phone', v_source.phone, 'status', v_source.status),
    p_actor_employee_id, btrim(p_reason)
  );

  INSERT INTO public.recruitment_candidate_contacts
    (candidate_id, contact_type, value, normalized_value, is_primary, verified_at, created_at)
  SELECT p_surviving_candidate_id, contact_type, value, normalized_value, false, verified_at, created_at
  FROM public.recruitment_candidate_contacts WHERE candidate_id = p_merged_candidate_id
  ON CONFLICT (candidate_id, contact_type, value) DO NOTHING;
  DELETE FROM public.recruitment_candidate_contacts WHERE candidate_id = p_merged_candidate_id;

  INSERT INTO public.recruitment_candidate_demographics
    (candidate_id, voluntary_payload, notice_version, consented_at, withdrawn_at,
      reporting_region, created_at, updated_at)
  SELECT p_surviving_candidate_id, voluntary_payload, notice_version, consented_at,
    withdrawn_at, reporting_region, created_at, updated_at
  FROM public.recruitment_candidate_demographics WHERE candidate_id = p_merged_candidate_id
  ON CONFLICT (candidate_id) DO NOTHING;
  DELETE FROM public.recruitment_candidate_demographics WHERE candidate_id = p_merged_candidate_id;

  UPDATE public.recruitment_candidate_experience SET candidate_id = p_surviving_candidate_id
  WHERE candidate_id = p_merged_candidate_id;
  UPDATE public.recruitment_candidate_education SET candidate_id = p_surviving_candidate_id
  WHERE candidate_id = p_merged_candidate_id;
  INSERT INTO public.recruitment_candidate_skills (candidate_id, skill, proficiency, years_experience)
  SELECT p_surviving_candidate_id, skill, proficiency, years_experience
  FROM public.recruitment_candidate_skills WHERE candidate_id = p_merged_candidate_id
  ON CONFLICT (candidate_id, skill) DO NOTHING;
  DELETE FROM public.recruitment_candidate_skills WHERE candidate_id = p_merged_candidate_id;

  INSERT INTO public.recruitment_candidate_preferences
    (candidate_id, preferred_departments, preferred_locations, preferred_employment_types,
      salary_expectation_min, salary_expectation_max, currency, remote_preference,
      earliest_start_date, work_authorized, willing_to_relocate, updated_at)
  SELECT p_surviving_candidate_id, preferred_departments, preferred_locations,
    preferred_employment_types, salary_expectation_min, salary_expectation_max,
    currency, remote_preference, earliest_start_date, work_authorized,
    willing_to_relocate, updated_at
  FROM public.recruitment_candidate_preferences WHERE candidate_id = p_merged_candidate_id
  ON CONFLICT (candidate_id) DO NOTHING;
  DELETE FROM public.recruitment_candidate_preferences WHERE candidate_id = p_merged_candidate_id;

  INSERT INTO public.recruitment_candidate_saved_jobs (candidate_id, job_id, saved_at)
  SELECT p_surviving_candidate_id, job_id, saved_at
  FROM public.recruitment_candidate_saved_jobs WHERE candidate_id = p_merged_candidate_id
  ON CONFLICT (candidate_id, job_id) DO NOTHING;
  DELETE FROM public.recruitment_candidate_saved_jobs WHERE candidate_id = p_merged_candidate_id;
  INSERT INTO public.recruitment_candidate_tags (candidate_id, tag_id, added_by, created_at)
  SELECT p_surviving_candidate_id, tag_id, added_by, created_at
  FROM public.recruitment_candidate_tags WHERE candidate_id = p_merged_candidate_id
  ON CONFLICT (candidate_id, tag_id) DO NOTHING;
  DELETE FROM public.recruitment_candidate_tags WHERE candidate_id = p_merged_candidate_id;

  UPDATE public.recruitment_applications SET candidate_id = p_surviving_candidate_id WHERE candidate_id = p_merged_candidate_id;
  UPDATE public.recruitment_candidate_documents SET candidate_id = p_surviving_candidate_id WHERE candidate_id = p_merged_candidate_id;
  UPDATE public.recruitment_candidate_notes SET candidate_id = p_surviving_candidate_id WHERE candidate_id = p_merged_candidate_id;
  UPDATE public.recruitment_candidate_consents SET candidate_id = p_surviving_candidate_id WHERE candidate_id = p_merged_candidate_id;
  UPDATE public.recruitment_candidate_portal_tasks SET candidate_id = p_surviving_candidate_id WHERE candidate_id = p_merged_candidate_id;
  UPDATE public.recruitment_candidate_notices SET candidate_id = p_surviving_candidate_id WHERE candidate_id = p_merged_candidate_id;
  UPDATE public.recruitment_candidate_availability SET candidate_id = p_surviving_candidate_id WHERE candidate_id = p_merged_candidate_id;
  UPDATE public.recruitment_accommodation_requests SET candidate_id = p_surviving_candidate_id WHERE candidate_id = p_merged_candidate_id;
  UPDATE public.recruitment_messages SET candidate_id = p_surviving_candidate_id WHERE candidate_id = p_merged_candidate_id;
  UPDATE public.recruitment_referrals SET candidate_id = p_surviving_candidate_id WHERE candidate_id = p_merged_candidate_id;
  UPDATE public.recruitment_agency_submissions SET candidate_id = p_surviving_candidate_id WHERE candidate_id = p_merged_candidate_id;
  UPDATE public.recruitment_privacy_requests SET candidate_id = p_surviving_candidate_id WHERE candidate_id = p_merged_candidate_id;
  UPDATE public.recruitment_legal_holds SET candidate_id = p_surviving_candidate_id WHERE candidate_id = p_merged_candidate_id;
  UPDATE public.recruitment_analytics_events SET candidate_id = p_surviving_candidate_id WHERE candidate_id = p_merged_candidate_id;

  INSERT INTO public.recruitment_talent_pool_members
    (pool_id, candidate_id, status, added_by, added_at, removed_at)
  SELECT pool_id, p_surviving_candidate_id, status, added_by, added_at, removed_at
  FROM public.recruitment_talent_pool_members WHERE candidate_id = p_merged_candidate_id
  ON CONFLICT (pool_id, candidate_id) DO NOTHING;
  DELETE FROM public.recruitment_talent_pool_members WHERE candidate_id = p_merged_candidate_id;

  UPDATE public.recruitment_candidates SET
    preferred_name = coalesce(preferred_name, v_source.preferred_name),
    phone = coalesce(phone, v_source.phone),
    city = coalesce(city, v_source.city),
    linkedin_url = coalesce(linkedin_url, v_source.linkedin_url),
    portfolio_url = coalesce(portfolio_url, v_source.portfolio_url),
    last_activity_at = now()
  WHERE id = p_surviving_candidate_id;

  UPDATE public.recruitment_duplicate_matches SET status = 'merged', reviewed_by = p_actor_employee_id, reviewed_at = now()
  WHERE (candidate_id = p_surviving_candidate_id AND possible_duplicate_id = p_merged_candidate_id)
     OR (candidate_id = p_merged_candidate_id AND possible_duplicate_id = p_surviving_candidate_id);

  UPDATE public.recruitment_candidates SET
    primary_email = 'merged+' || id::text || '@invalid.opusfesta.local',
    full_name = 'Merged candidate', preferred_name = NULL, phone = NULL, city = NULL,
    linkedin_url = NULL, portfolio_url = NULL, candidate_clerk_user_id = NULL,
    status = 'deleted', owner_employee_id = NULL, last_activity_at = now()
  WHERE id = p_merged_candidate_id;

  INSERT INTO public.recruitment_audit_events (event_type, entity_type, entity_id, actor_type, metadata)
  VALUES ('candidate.merged', 'candidate', p_surviving_candidate_id, 'employee',
    jsonb_build_object('merged_candidate_id', p_merged_candidate_id, 'actor_employee_id', p_actor_employee_id));
  RETURN p_surviving_candidate_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_merge_candidates(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_merge_candidates(uuid, uuid, uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_detect_candidate_duplicates(
  p_limit integer DEFAULT 250
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer;
BEGIN
  IF p_limit < 1 OR p_limit > 2000 THEN
    RAISE EXCEPTION 'Duplicate scan limit must be between 1 and 2000' USING ERRCODE = '23514';
  END IF;
  WITH candidate_pairs AS (
    SELECT
      first.id AS candidate_id,
      second.id AS possible_duplicate_id,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN length(regexp_replace(COALESCE(first.phone, ''), '\D', '', 'g')) >= 7
          AND regexp_replace(COALESCE(first.phone, ''), '\D', '', 'g') =
              regexp_replace(COALESCE(second.phone, ''), '\D', '', 'g') THEN 'phone' END,
        CASE WHEN NULLIF(lower(btrim(first.linkedin_url)), '') IS NOT NULL
          AND lower(btrim(first.linkedin_url)) = lower(btrim(second.linkedin_url)) THEN 'linkedin' END,
        CASE WHEN lower(btrim(first.full_name)) = lower(btrim(second.full_name)) THEN 'name' END,
        CASE WHEN NULLIF(lower(btrim(first.current_organization)), '') IS NOT NULL
          AND lower(btrim(first.current_organization)) = lower(btrim(second.current_organization)) THEN 'organization' END,
        CASE WHEN NULLIF(lower(btrim(first.city)), '') IS NOT NULL
          AND lower(btrim(first.city)) = lower(btrim(second.city)) THEN 'city' END
      ]::text[], NULL) AS matched_fields
    FROM public.recruitment_candidates first
    JOIN public.recruitment_candidates second ON first.id < second.id
    WHERE first.status NOT IN ('anonymized', 'deleted')
      AND second.status NOT IN ('anonymized', 'deleted')
      AND (
        (length(regexp_replace(COALESCE(first.phone, ''), '\D', '', 'g')) >= 7
          AND regexp_replace(COALESCE(first.phone, ''), '\D', '', 'g') =
              regexp_replace(COALESCE(second.phone, ''), '\D', '', 'g'))
        OR (NULLIF(lower(btrim(first.linkedin_url)), '') IS NOT NULL
          AND lower(btrim(first.linkedin_url)) = lower(btrim(second.linkedin_url)))
        OR (lower(btrim(first.full_name)) = lower(btrim(second.full_name))
          AND (
            (NULLIF(lower(btrim(first.current_organization)), '') IS NOT NULL
              AND lower(btrim(first.current_organization)) = lower(btrim(second.current_organization)))
            OR (NULLIF(lower(btrim(first.city)), '') IS NOT NULL
              AND lower(btrim(first.city)) = lower(btrim(second.city)))
          ))
      )
    ORDER BY GREATEST(first.last_activity_at, second.last_activity_at) DESC
    LIMIT p_limit
  ), scored AS (
    SELECT *, CASE
      WHEN matched_fields @> ARRAY['phone', 'linkedin']::text[] THEN 0.99
      WHEN matched_fields @> ARRAY['phone']::text[] THEN 0.94
      WHEN matched_fields @> ARRAY['linkedin']::text[] THEN 0.92
      WHEN matched_fields @> ARRAY['name', 'organization']::text[] THEN 0.82
      ELSE 0.72
    END AS confidence
    FROM candidate_pairs
  )
  INSERT INTO public.recruitment_duplicate_matches
    (candidate_id, possible_duplicate_id, matched_fields, confidence)
  SELECT candidate_id, possible_duplicate_id, matched_fields, confidence FROM scored
  ON CONFLICT (candidate_id, possible_duplicate_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  INSERT INTO public.recruitment_audit_events
    (event_type, entity_type, actor_type, metadata)
  VALUES ('candidate.duplicate_scan_completed', 'candidate', 'system',
    jsonb_build_object('pairs_created', v_inserted, 'scan_limit', p_limit,
      'automated_merge', false));
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.recruitment_detect_candidate_duplicates(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_detect_candidate_duplicates(integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recruitment_lock_submitted_feedback()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status IN ('submitted', 'locked') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Submitted interview feedback is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recruitment_lock_submitted_feedback ON public.recruitment_interview_feedback;
CREATE TRIGGER trg_recruitment_lock_submitted_feedback
  BEFORE UPDATE OR DELETE ON public.recruitment_interview_feedback
  FOR EACH ROW EXECUTE FUNCTION public.recruitment_lock_submitted_feedback();

CREATE OR REPLACE FUNCTION public.recruitment_lock_submitted_scorecard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status IN ('submitted', 'locked') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Submitted scorecard is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recruitment_lock_submitted_scorecard ON public.recruitment_scorecards;
CREATE TRIGGER trg_recruitment_lock_submitted_scorecard
  BEFORE UPDATE OR DELETE ON public.recruitment_scorecards
  FOR EACH ROW EXECUTE FUNCTION public.recruitment_lock_submitted_scorecard();

CREATE OR REPLACE FUNCTION public.recruitment_lock_submitted_scorecard_rating()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.recruitment_scorecards scorecard
    WHERE scorecard.id = OLD.scorecard_id AND scorecard.status IN ('submitted', 'locked')
  ) THEN
    RAISE EXCEPTION 'Submitted scorecard ratings are immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recruitment_lock_submitted_scorecard_rating
  ON public.recruitment_scorecard_ratings;
CREATE TRIGGER trg_recruitment_lock_submitted_scorecard_rating
  BEFORE UPDATE OR DELETE ON public.recruitment_scorecard_ratings
  FOR EACH ROW EXECUTE FUNCTION public.recruitment_lock_submitted_scorecard_rating();

-- ---------------------------------------------------------------------------
-- State transitions and immutable history
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.recruitment_validate_requisition_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status = 'draft' AND NEW.status IN ('pending_approval', 'cancelled')) OR
    (OLD.status = 'draft' AND NEW.status IN ('pending_department_approval')) OR
    (OLD.status IN ('pending_approval', 'pending_department_approval', 'pending_people_ops_approval', 'pending_finance_approval', 'pending_executive_approval')
      AND NEW.status IN ('pending_department_approval', 'pending_people_ops_approval', 'pending_finance_approval', 'pending_executive_approval', 'approved', 'rejected', 'changes_requested', 'cancelled')) OR
    (OLD.status = 'changes_requested' AND NEW.status IN ('draft', 'pending_approval', 'pending_department_approval', 'cancelled')) OR
    (OLD.status = 'approved' AND NEW.status IN ('open', 'recruiting', 'on_hold', 'cancelled')) OR
    (OLD.status IN ('open', 'recruiting') AND NEW.status IN ('on_hold', 'partially_filled', 'filled', 'closed', 'cancelled')) OR
    (OLD.status = 'partially_filled' AND NEW.status IN ('recruiting', 'on_hold', 'filled', 'closed', 'cancelled')) OR
    (OLD.status = 'on_hold' AND NEW.status IN ('open', 'recruiting', 'partially_filled', 'filled', 'closed', 'cancelled')) OR
    (OLD.status = 'closed' AND NEW.status IN ('recruiting', 'cancelled'))
  ) THEN
    RAISE EXCEPTION 'Invalid requisition transition: % -> %', OLD.status, NEW.status USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'pending_approval' THEN NEW.submitted_at := COALESCE(NEW.submitted_at, now()); END IF;
  IF NEW.status = 'approved' THEN NEW.approved_at := COALESCE(NEW.approved_at, now()); END IF;
  IF NEW.status IN ('open', 'recruiting') THEN NEW.opened_at := COALESCE(NEW.opened_at, now()); END IF;
  IF NEW.status IN ('filled', 'rejected', 'cancelled', 'closed') THEN NEW.closed_at := COALESCE(NEW.closed_at, now()); END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.recruitment_validate_application_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status = 'draft' AND NEW.status IN ('submitted', 'withdrawn')) OR
    (OLD.status IN ('submitted', 'under_review', 'eligibility_review', 'screening', 'hiring_manager_review', 'assessment', 'interview', 'final_interview', 'reference_check', 'offer', 'on_hold')
      AND NEW.status IN ('under_review', 'eligibility_review', 'screening', 'hiring_manager_review', 'assessment', 'interview', 'final_interview', 'reference_check', 'offer', 'on_hold', 'hired', 'rejected', 'withdrawn', 'position_closed', 'no_response', 'duplicate', 'disqualified')) OR
    (OLD.status IN ('rejected', 'withdrawn', 'position_closed', 'no_response', 'duplicate', 'disqualified')
      AND NEW.status IN ('under_review', 'screening', 'archived')) OR
    (OLD.status = 'hired' AND NEW.status = 'archived')
  ) THEN
    RAISE EXCEPTION 'Invalid application transition: % -> %', OLD.status, NEW.status USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'hired' AND NOT EXISTS (
    SELECT 1 FROM public.recruitment_offers o
    WHERE o.application_id = NEW.id AND o.status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'Hired status requires an accepted offer' USING ERRCODE = '23514';
  END IF;
  NEW.last_stage_changed_at := now();
  IF NEW.status = 'hired' THEN NEW.hired_at := COALESCE(NEW.hired_at, now()); END IF;
  IF NEW.status = 'rejected' THEN NEW.rejected_at := COALESCE(NEW.rejected_at, now()); END IF;
  IF NEW.status = 'withdrawn' THEN NEW.withdrawn_at := COALESCE(NEW.withdrawn_at, now()); END IF;
  IF NEW.status = 'archived' THEN NEW.archived_at := COALESCE(NEW.archived_at, now()); END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.recruitment_validate_offer_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status = 'draft' AND NEW.status IN ('pending_approval', 'withdrawn', 'superseded')) OR
    (OLD.status = 'pending_approval' AND NEW.status IN ('approved', 'changes_requested', 'withdrawn', 'superseded')) OR
    (OLD.status = 'changes_requested' AND NEW.status IN ('draft', 'pending_approval', 'withdrawn', 'superseded')) OR
    (OLD.status = 'approved' AND NEW.status IN ('sent', 'withdrawn', 'superseded')) OR
    (OLD.status = 'sent' AND NEW.status IN ('viewed', 'accepted', 'declined', 'expired', 'withdrawn', 'superseded')) OR
    (OLD.status = 'viewed' AND NEW.status IN ('accepted', 'declined', 'expired', 'withdrawn', 'superseded'))
  ) THEN
    RAISE EXCEPTION 'Invalid offer transition: % -> %', OLD.status, NEW.status USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'approved' THEN NEW.approved_at := COALESCE(NEW.approved_at, now()); END IF;
  IF NEW.status = 'sent' THEN NEW.sent_at := COALESCE(NEW.sent_at, now()); END IF;
  IF NEW.status = 'viewed' THEN NEW.viewed_at := COALESCE(NEW.viewed_at, now()); END IF;
  IF NEW.status = 'accepted' THEN NEW.accepted_at := COALESCE(NEW.accepted_at, now()); END IF;
  IF NEW.status = 'declined' THEN NEW.declined_at := COALESCE(NEW.declined_at, now()); END IF;
  IF NEW.status = 'withdrawn' THEN NEW.withdrawn_at := COALESCE(NEW.withdrawn_at, now()); END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.recruitment_validate_posting_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status = 'draft' AND NEW.status IN ('in_review', 'scheduled', 'published', 'archived')) OR
    (OLD.status = 'in_review' AND NEW.status IN ('draft', 'approved', 'archived')) OR
    (OLD.status = 'approved' AND NEW.status IN ('draft', 'scheduled', 'published', 'archived')) OR
    (OLD.status = 'scheduled' AND NEW.status IN ('draft', 'published', 'archived')) OR
    (OLD.status = 'published' AND NEW.status IN ('paused', 'closed', 'archived')) OR
    (OLD.status = 'paused' AND NEW.status IN ('draft', 'published', 'closed', 'archived')) OR
    (OLD.status = 'closed' AND NEW.status IN ('published', 'archived'))
  ) THEN
    RAISE EXCEPTION 'Invalid posting transition: % -> %', OLD.status, NEW.status USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'published' THEN NEW.published_at := COALESCE(NEW.published_at, now()); END IF;
  IF NEW.status = 'closed' THEN NEW.closed_at := COALESCE(NEW.closed_at, now()); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recruitment_requisition_transition ON public.recruitment_requisitions;
CREATE TRIGGER trg_recruitment_requisition_transition
  BEFORE UPDATE OF status ON public.recruitment_requisitions
  FOR EACH ROW EXECUTE FUNCTION public.recruitment_validate_requisition_transition();

DROP TRIGGER IF EXISTS trg_recruitment_application_transition ON public.recruitment_applications;
CREATE TRIGGER trg_recruitment_application_transition
  BEFORE UPDATE OF status ON public.recruitment_applications
  FOR EACH ROW EXECUTE FUNCTION public.recruitment_validate_application_transition();

DROP TRIGGER IF EXISTS trg_recruitment_offer_transition ON public.recruitment_offers;
CREATE TRIGGER trg_recruitment_offer_transition
  BEFORE UPDATE OF status ON public.recruitment_offers
  FOR EACH ROW EXECUTE FUNCTION public.recruitment_validate_offer_transition();

DROP TRIGGER IF EXISTS trg_recruitment_posting_transition ON public.recruitment_job_postings;
CREATE TRIGGER trg_recruitment_posting_transition
  BEFORE UPDATE OF status ON public.recruitment_job_postings
  FOR EACH ROW EXECUTE FUNCTION public.recruitment_validate_posting_transition();

CREATE OR REPLACE FUNCTION public.recruitment_capture_application_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.recruitment_application_stage_history
    (application_id, from_status, to_status, candidate_facing_status, changed_by_actor_type)
  VALUES
    (NEW.id, CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
     NEW.status, NEW.candidate_facing_status, 'system');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recruitment_application_stage_history ON public.recruitment_applications;
CREATE TRIGGER trg_recruitment_application_stage_history
  AFTER INSERT OR UPDATE OF status ON public.recruitment_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.recruitment_capture_application_stage();

DROP TRIGGER IF EXISTS trg_recruitment_stage_history_immutable ON public.recruitment_application_stage_history;
CREATE TRIGGER trg_recruitment_stage_history_immutable
  BEFORE UPDATE OR DELETE ON public.recruitment_application_stage_history
  FOR EACH ROW EXECUTE FUNCTION public.recruitment_prevent_mutation();

DROP TRIGGER IF EXISTS trg_recruitment_document_access_immutable ON public.recruitment_document_access_events;
CREATE TRIGGER trg_recruitment_document_access_immutable
  BEFORE UPDATE OR DELETE ON public.recruitment_document_access_events
  FOR EACH ROW EXECUTE FUNCTION public.recruitment_prevent_mutation();

DROP TRIGGER IF EXISTS trg_recruitment_audit_immutable ON public.recruitment_audit_events;
CREATE TRIGGER trg_recruitment_audit_immutable
BEFORE UPDATE OR DELETE ON public.recruitment_audit_events
FOR EACH ROW EXECUTE FUNCTION public.recruitment_prevent_mutation();

DROP TRIGGER IF EXISTS trg_recruitment_offer_responses_immutable ON public.recruitment_offer_responses;
CREATE TRIGGER trg_recruitment_offer_responses_immutable
BEFORE UPDATE OR DELETE ON public.recruitment_offer_responses
FOR EACH ROW EXECUTE FUNCTION public.recruitment_prevent_mutation();

DROP TRIGGER IF EXISTS trg_recruitment_offer_signature_certificates_immutable ON public.recruitment_offer_signature_certificates;
CREATE TRIGGER trg_recruitment_offer_signature_certificates_immutable
BEFORE UPDATE OR DELETE ON public.recruitment_offer_signature_certificates
FOR EACH ROW EXECUTE FUNCTION public.recruitment_prevent_mutation();

-- ---------------------------------------------------------------------------
-- Compatibility projection: legacy candidate writes -> canonical ATS
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.recruitment_sync_legacy_candidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate_id uuid;
  v_application_id uuid;
  v_reference text;
  v_status text;
  v_candidate_status text;
  v_sync_status boolean := true;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_sync_status := NEW.stage IS DISTINCT FROM OLD.stage;
  END IF;
  v_reference := COALESCE(NEW.application_reference, 'OF-' || upper(substr(replace(NEW.id::text, '-', ''), 1, 12)));
  v_status := CASE NEW.stage
    WHEN 'Applied' THEN 'submitted'
    WHEN 'Screening' THEN 'screening'
    WHEN 'Interview' THEN 'interview'
    WHEN 'Offer' THEN 'offer'
    WHEN 'Hired' THEN 'hired'
    WHEN 'Rejected' THEN 'rejected'
    ELSE 'submitted'
  END;
  v_candidate_status := CASE NEW.stage
    WHEN 'Applied' THEN 'Application received'
    WHEN 'Screening' THEN 'Under review'
    WHEN 'Interview' THEN 'Interview process'
    WHEN 'Offer' THEN 'Offer'
    WHEN 'Hired' THEN 'Hired'
    WHEN 'Rejected' THEN 'Decision made'
    ELSE 'Application received'
  END;

  INSERT INTO public.recruitment_candidates (
    primary_email, full_name, preferred_name, phone, country, city,
    current_position, current_organization, years_experience,
    linkedin_url, portfolio_url, source_summary, last_activity_at
  ) VALUES (
    NEW.email, NEW.full_name, NEW.preferred_name, NEW.phone, NEW.country, NEW.city,
    NEW.current_position, NEW.current_organization, NEW.years_experience,
    NEW.linkedin_url, NEW.portfolio_url, NEW.source, now()
  )
  ON CONFLICT (normalized_email) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    preferred_name = COALESCE(EXCLUDED.preferred_name, recruitment_candidates.preferred_name),
    phone = COALESCE(EXCLUDED.phone, recruitment_candidates.phone),
    country = COALESCE(EXCLUDED.country, recruitment_candidates.country),
    city = COALESCE(EXCLUDED.city, recruitment_candidates.city),
    current_position = COALESCE(EXCLUDED.current_position, recruitment_candidates.current_position),
    current_organization = COALESCE(EXCLUDED.current_organization, recruitment_candidates.current_organization),
    years_experience = COALESCE(EXCLUDED.years_experience, recruitment_candidates.years_experience),
    linkedin_url = COALESCE(EXCLUDED.linkedin_url, recruitment_candidates.linkedin_url),
    portfolio_url = COALESCE(EXCLUDED.portfolio_url, recruitment_candidates.portfolio_url),
    source_summary = COALESCE(recruitment_candidates.source_summary, EXCLUDED.source_summary),
    last_activity_at = now()
  RETURNING id INTO v_candidate_id;

  INSERT INTO public.recruitment_applications (
    candidate_id, job_id, legacy_workforce_candidate_id, application_reference,
    status, candidate_facing_status, source, cover_letter, salary_expectation,
    earliest_start_date, work_authorized, weekend_available, rating, submitted_at
  ) VALUES (
    v_candidate_id, NEW.job_id, NEW.id, v_reference, v_status,
    v_candidate_status, NEW.source, NEW.cover_letter, NEW.salary_expectation,
    NEW.earliest_start_date, NEW.work_authorized, NEW.weekend_available,
    NEW.rating, NEW.applied_at::timestamptz
  )
  ON CONFLICT (legacy_workforce_candidate_id) DO UPDATE SET
    candidate_id = EXCLUDED.candidate_id,
    job_id = EXCLUDED.job_id,
    status = CASE
      WHEN v_sync_status THEN EXCLUDED.status
      ELSE recruitment_applications.status
    END,
    candidate_facing_status = CASE
      WHEN v_sync_status THEN EXCLUDED.candidate_facing_status
      ELSE recruitment_applications.candidate_facing_status
    END,
    source = EXCLUDED.source,
    cover_letter = COALESCE(EXCLUDED.cover_letter, recruitment_applications.cover_letter),
    salary_expectation = COALESCE(EXCLUDED.salary_expectation, recruitment_applications.salary_expectation),
    earliest_start_date = COALESCE(EXCLUDED.earliest_start_date, recruitment_applications.earliest_start_date),
    work_authorized = COALESCE(EXCLUDED.work_authorized, recruitment_applications.work_authorized),
    weekend_available = COALESCE(EXCLUDED.weekend_available, recruitment_applications.weekend_available),
    rating = EXCLUDED.rating
  RETURNING id INTO v_application_id;

  INSERT INTO public.recruitment_application_sources (application_id, source_type, source_name)
  VALUES (v_application_id, lower(replace(NEW.source, ' ', '_')), NEW.source)
  ON CONFLICT DO NOTHING;

  IF NEW.resume_storage_path IS NOT NULL THEN
    INSERT INTO public.recruitment_candidate_documents
      (candidate_id, application_id, document_type, storage_path, original_filename)
    VALUES
      (v_candidate_id, v_application_id, 'resume', NEW.resume_storage_path,
       regexp_replace(NEW.resume_storage_path, '^.*/', ''))
    ON CONFLICT (storage_bucket, storage_path) DO UPDATE
      SET candidate_id = EXCLUDED.candidate_id, application_id = EXCLUDED.application_id;
  END IF;

  INSERT INTO public.recruitment_candidate_consents
    (candidate_id, consent_type, notice_version, granted_at, source)
  SELECT v_candidate_id, x.consent_type, NEW.privacy_notice_version, x.granted_at, 'careers_site'
  FROM (VALUES
    ('application_processing', NEW.application_consent_at),
    ('talent_pool', NEW.talent_pool_consent_at),
    ('career_updates', NEW.career_updates_consent_at)
  ) AS x(consent_type, granted_at)
  WHERE x.granted_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.recruitment_candidate_consents c
      WHERE c.candidate_id = v_candidate_id
        AND c.consent_type = x.consent_type
        AND c.granted_at = x.granted_at
    );

  INSERT INTO public.recruitment_audit_events
    (event_type, entity_type, entity_id, actor_type, metadata)
  VALUES
    (CASE WHEN TG_OP = 'INSERT' THEN 'application.created' ELSE 'application.synced' END,
     'application', v_application_id, 'system',
     jsonb_build_object('legacy_candidate_id', NEW.id, 'stage', NEW.stage));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recruitment_sync_legacy_candidate ON public.workforce_candidates;
CREATE TRIGGER trg_recruitment_sync_legacy_candidate
  AFTER INSERT OR UPDATE ON public.workforce_candidates
  FOR EACH ROW EXECUTE FUNCTION public.recruitment_sync_legacy_candidate();

-- Seed canonical records for existing legacy candidates. The trigger is safe
-- and idempotent, and this no-op update allows the same sync path to backfill.
UPDATE public.workforce_candidates
SET updated_at = updated_at;

-- ---------------------------------------------------------------------------
-- Indexes for pipeline, search, reporting, and retention workloads
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_recruitment_positions_plan_status
  ON public.recruitment_positions (workforce_plan_id, status);
CREATE INDEX IF NOT EXISTS idx_recruitment_requisitions_status_department
  ON public.recruitment_requisitions (status, department, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recruitment_requisitions_manager
  ON public.recruitment_requisitions (hiring_manager_employee_id, status);
CREATE INDEX IF NOT EXISTS idx_recruitment_postings_status_schedule
  ON public.recruitment_job_postings (status, publish_at, unpublish_at);
CREATE INDEX IF NOT EXISTS idx_recruitment_candidates_name
  ON public.recruitment_candidates USING gin (to_tsvector('simple', full_name || ' ' || COALESCE(current_position, '') || ' ' || COALESCE(current_organization, '')));
CREATE INDEX IF NOT EXISTS idx_recruitment_candidates_activity
  ON public.recruitment_candidates (last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_recruitment_candidates_phone_normalized
  ON public.recruitment_candidates ((regexp_replace(COALESCE(phone, ''), '\D', '', 'g')))
  WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recruitment_candidates_linkedin_normalized
  ON public.recruitment_candidates ((lower(btrim(linkedin_url))))
  WHERE linkedin_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recruitment_applications_pipeline
  ON public.recruitment_applications (job_id, status, last_stage_changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_recruitment_applications_candidate
  ON public.recruitment_applications (candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recruitment_stage_history_application
  ON public.recruitment_application_stage_history (application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recruitment_interviews_schedule
  ON public.recruitment_interviews (starts_at, status);
CREATE INDEX IF NOT EXISTS idx_recruitment_messages_candidate
  ON public.recruitment_messages (candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recruitment_offers_application
  ON public.recruitment_offers (application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recruitment_referrals_referrer
  ON public.recruitment_referrals (referrer_employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recruitment_referral_notes_referral
  ON public.recruitment_referral_notes (referral_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recruitment_privacy_due
  ON public.recruitment_privacy_requests (status, due_at);
CREATE INDEX IF NOT EXISTS idx_recruitment_analytics_event_time
  ON public.recruitment_analytics_events (event_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_recruitment_audit_time
  ON public.recruitment_audit_events (created_at DESC);

-- ---------------------------------------------------------------------------
-- Timestamps, RLS, grants, and explicit permissions
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'recruitment_legal_entities','recruitment_cost_centres','recruitment_job_levels','recruitment_salary_bands',
    'recruitment_workforce_plans','recruitment_positions','recruitment_requisitions','recruitment_requisition_openings',
    'recruitment_approval_steps','recruitment_requisition_comments',
    'recruitment_job_postings','recruitment_job_channels','recruitment_job_languages','recruitment_application_questions',
    'recruitment_pipeline_templates','recruitment_pipeline_stages',
    'recruitment_candidates','recruitment_candidate_experience','recruitment_candidate_education',
    'recruitment_candidate_demographics','recruitment_candidate_notes','recruitment_candidate_preferences','recruitment_applications',
    'recruitment_application_answers','recruitment_candidate_reviews','recruitment_reference_checks','recruitment_background_checks',
    'recruitment_candidate_portal_tasks','recruitment_scorecard_templates',
    'recruitment_interview_plans','recruitment_interview_rooms','recruitment_interviews','recruitment_calendar_sync_queue','recruitment_interview_feedback',
    'recruitment_interview_reschedule_requests','recruitment_accommodation_requests','recruitment_scorecards',
    'recruitment_assessments','recruitment_assessment_templates','recruitment_assessment_reviews',
    'recruitment_message_templates','recruitment_messages',
    'recruitment_offers','recruitment_hiring_conversions','recruitment_pre_hire_checks','recruitment_onboarding_items',
    'recruitment_talent_pools',
    'recruitment_nurture_campaigns','recruitment_referral_programs','recruitment_referrals',
    'recruitment_referral_rewards','recruitment_agencies','recruitment_agency_submissions',
    'careers_cms_pages','careers_cms_blocks','careers_cms_departments','careers_cms_locations',
    'careers_cms_benefits','careers_cms_faqs','careers_cms_stories',
    'recruitment_retention_policies','recruitment_privacy_requests','recruitment_retention_queue',
    'recruitment_automation_rules','recruitment_scheduled_application_actions','recruitment_post_hire_reviews'
    ,'recruitment_source_definitions','recruitment_agency_job_assignments'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.recruitment_touch_updated_at()',
      t, t
    );
  END LOOP;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND (left(tablename, 12) = 'recruitment_' OR left(tablename, 12) = 'careers_cms_')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END;
$$;

-- Current server actions use a service-role client after Clerk authorization.
-- No browser role receives table privileges. Candidate self-service will use
-- narrowly scoped SECURITY DEFINER RPCs rather than exposing the domain.

INSERT INTO public.recruitment_retention_policies (record_type, retention_days, action, legal_basis)
VALUES
  ('rejected_application', 730, 'anonymize', 'Recruitment recordkeeping and legitimate interests'),
  ('withdrawn_application', 365, 'anonymize', 'Candidate request and recruitment recordkeeping'),
  ('talent_pool_profile', 730, 'review', 'Explicit candidate consent'),
  ('candidate_document', 730, 'delete', 'Data minimisation'),
  ('analytics_event', 395, 'delete', 'Aggregated recruitment analytics')
ON CONFLICT (record_type) DO NOTHING;

INSERT INTO public.recruitment_source_definitions (name, source_type, utm_source, utm_medium)
VALUES
  ('Careers website', 'careers_site', 'careers', 'owned'),
  ('Employee referral', 'employee_referral', 'employee_referral', 'referral'),
  ('LinkedIn', 'job_board', 'linkedin', 'social'),
  ('Recruitment agency', 'agency', 'agency', 'partner'),
  ('University', 'university', 'university', 'campus'),
  ('Career fair', 'career_fair', 'career_fair', 'event'),
  ('Direct sourcing', 'direct_sourcing', 'direct', 'outreach'),
  ('Previous applicant', 'previous_applicant', 'talent_crm', 'owned'),
  ('Talent community', 'talent_community', 'talent_community', 'owned'),
  ('Manual import', 'manual_import', 'manual', 'offline')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.recruitment_message_templates
  (name, channel, category, language_code, subject_template, body_template, variables, status)
VALUES
  ('Application received', 'email', 'application_received', 'en', 'Application received — {{job.title}}', 'Hello {{candidate.first_name}},\n\nWe received your application for {{job.title}}. Your reference is {{application.reference}}.\n\nThank you,\nOpusFesta People Team', ARRAY['candidate.first_name','job.title','application.reference'], 'active'),
  ('Application received', 'email', 'application_received', 'sw', 'Tumepokea ombi lako — {{job.title}}', 'Habari {{candidate.first_name}},\n\nTumepokea ombi lako la nafasi ya {{job.title}}. Namba yako ya kumbukumbu ni {{application.reference}}.\n\nAsante,\nTimu ya Watu ya OpusFesta', ARRAY['candidate.first_name','job.title','application.reference'], 'active'),
  ('Screening invitation', 'email', 'screening', 'en', 'A conversation about {{job.title}}', 'Hello {{candidate.first_name}},\n\nWe would like to invite you to an introductory conversation about {{job.title}}. Please use the candidate portal to review the details.', ARRAY['candidate.first_name','job.title'], 'active'),
  ('Screening invitation', 'email', 'screening', 'sw', 'Mazungumzo kuhusu {{job.title}}', 'Habari {{candidate.first_name}},\n\nTungependa kukualika kwenye mazungumzo ya awali kuhusu {{job.title}}. Tafadhali angalia maelezo kwenye tovuti ya mwombaji.', ARRAY['candidate.first_name','job.title'], 'active'),
  ('Interview invitation', 'email', 'interview', 'en', 'Interview invitation — {{job.title}}', 'Hello {{candidate.first_name}},\n\nYou are invited to the next interview for {{job.title}}. Date: {{interview.starts_at}}. Details and rescheduling are available in your candidate portal.', ARRAY['candidate.first_name','job.title','interview.starts_at'], 'active'),
  ('Interview invitation', 'email', 'interview', 'sw', 'Mwaliko wa usaili — {{job.title}}', 'Habari {{candidate.first_name}},\n\nUmealikwa kwenye usaili unaofuata wa {{job.title}}. Tarehe: {{interview.starts_at}}. Maelezo na kubadili muda vinapatikana kwenye tovuti ya mwombaji.', ARRAY['candidate.first_name','job.title','interview.starts_at'], 'active'),
  ('Interview reminder', 'email', 'interview_reminder', 'en', 'Reminder — {{job.title}} interview', 'Hello {{candidate.first_name}},\n\nThis is a reminder about your {{job.title}} interview at {{interview.starts_at}}.', ARRAY['candidate.first_name','job.title','interview.starts_at'], 'active'),
  ('Interview reminder', 'email', 'interview_reminder', 'sw', 'Kikumbusho — usaili wa {{job.title}}', 'Habari {{candidate.first_name}},\n\nHiki ni kikumbusho cha usaili wako wa {{job.title}} saa {{interview.starts_at}}.', ARRAY['candidate.first_name','job.title','interview.starts_at'], 'active'),
  ('Assessment invitation', 'email', 'assessment', 'en', 'Assessment for {{job.title}}', 'Hello {{candidate.first_name}},\n\nYour next step for {{job.title}} is an assessment. Instructions and the due date are in your candidate portal.', ARRAY['candidate.first_name','job.title'], 'active'),
  ('Assessment invitation', 'email', 'assessment', 'sw', 'Zoezi la tathmini kwa {{job.title}}', 'Habari {{candidate.first_name}},\n\nHatua inayofuata kwa {{job.title}} ni zoezi la tathmini. Maelekezo na tarehe ya mwisho vipo kwenye tovuti ya mwombaji.', ARRAY['candidate.first_name','job.title'], 'active'),
  ('Information request', 'email', 'information_request', 'en', 'Information needed for {{job.title}}', 'Hello {{candidate.first_name}},\n\nWe need a little more information to continue reviewing your application for {{job.title}}. Please open your candidate portal.', ARRAY['candidate.first_name','job.title'], 'active'),
  ('Information request', 'email', 'information_request', 'sw', 'Taarifa zinahitajika kwa {{job.title}}', 'Habari {{candidate.first_name}},\n\nTunahitaji taarifa zaidi ili kuendelea kupitia ombi lako la {{job.title}}. Tafadhali fungua tovuti ya mwombaji.', ARRAY['candidate.first_name','job.title'], 'active'),
  ('Application outcome', 'email', 'rejection', 'en', 'Update on your {{job.title}} application', 'Hello {{candidate.first_name}},\n\nThank you for the time you invested in the process for {{job.title}}. We will not be progressing your application further on this occasion. We appreciate your interest in OpusFesta.', ARRAY['candidate.first_name','job.title'], 'active'),
  ('Application outcome', 'email', 'rejection', 'sw', 'Taarifa kuhusu ombi lako la {{job.title}}', 'Habari {{candidate.first_name}},\n\nAsante kwa muda uliowekeza kwenye mchakato wa {{job.title}}. Kwa sasa hatutaendelea na ombi lako. Tunashukuru kwa nia yako kwa OpusFesta.', ARRAY['candidate.first_name','job.title'], 'active'),
  ('Talent community consent', 'email', 'talent_consent', 'en', 'Confirm your OpusFesta talent community preferences', 'Hello {{candidate.first_name}},\n\nPlease review and confirm how you would like OpusFesta to retain and use your profile for future roles.', ARRAY['candidate.first_name'], 'active'),
  ('Talent community consent', 'email', 'talent_consent', 'sw', 'Thibitisha mapendeleo yako ya jumuiya ya vipaji ya OpusFesta', 'Habari {{candidate.first_name}},\n\nTafadhali kagua na uthibitishe jinsi unavyotaka OpusFesta ihifadhi na kutumia wasifu wako kwa nafasi zijazo.', ARRAY['candidate.first_name'], 'active'),
  ('Offer ready', 'email', 'offer', 'en', 'Your offer for {{job.title}}', 'Hello {{candidate.first_name}},\n\nYour offer for {{job.title}} is ready. Review the complete terms and respond securely in your candidate portal before {{offer.expires_at}}.', ARRAY['candidate.first_name','job.title','offer.expires_at'], 'active'),
  ('Offer ready', 'email', 'offer', 'sw', 'Ofa yako ya {{job.title}}', 'Habari {{candidate.first_name}},\n\nOfa yako ya {{job.title}} iko tayari. Kagua masharti yote na ujibu kwa usalama kwenye tovuti ya mwombaji kabla ya {{offer.expires_at}}.', ARRAY['candidate.first_name','job.title','offer.expires_at'], 'active'),
  ('Reference request', 'email', 'reference', 'en', 'Reference request for {{candidate.full_name}}', 'Hello,\n\n{{candidate.full_name}} has named you as a referee. Please use the secure link provided to share your reference.', ARRAY['candidate.full_name'], 'active'),
  ('Reference request', 'email', 'reference', 'sw', 'Ombi la rejea kwa {{candidate.full_name}}', 'Habari,\n\n{{candidate.full_name}} amekutaja kama mtoa rejea. Tafadhali tumia kiungo salama kilichotolewa kushiriki rejea yako.', ARRAY['candidate.full_name'], 'active'),
  ('Withdrawal confirmation', 'email', 'withdrawal', 'en', 'Application withdrawn — {{job.title}}', 'Hello {{candidate.first_name}},\n\nWe have recorded the withdrawal of your application for {{job.title}}. Thank you for letting us know.', ARRAY['candidate.first_name','job.title'], 'active'),
  ('Withdrawal confirmation', 'email', 'withdrawal', 'sw', 'Ombi limeondolewa — {{job.title}}', 'Habari {{candidate.first_name}},\n\nTumerekodi kuondolewa kwa ombi lako la {{job.title}}. Asante kwa kutujulisha.', ARRAY['candidate.first_name','job.title'], 'active')
ON CONFLICT (name, channel, language_code) DO UPDATE SET
  category = EXCLUDED.category,
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template,
  variables = EXCLUDED.variables;

INSERT INTO public.recruitment_message_template_versions
  (template_id, version, subject_template, body_template, change_summary)
SELECT id, 1, subject_template, body_template, 'Initial approved bilingual recruitment template'
FROM public.recruitment_message_templates
WHERE status = 'active'
ON CONFLICT (template_id, version) DO NOTHING;

INSERT INTO public.recruitment_automation_rules
  (name, trigger_event, conditions, actions, status, priority)
SELECT seed.name, 'scheduled.maintenance', seed.conditions, seed.actions, 'active', seed.priority
FROM (VALUES
  ('Candidate interview reminders', '{"hours_before":24}'::jsonb,
    '[{"type":"candidate_interview_reminder"}]'::jsonb, 10),
  ('Stalled application alerts', '{"days_in_stage":3}'::jsonb,
    '[{"type":"alert_stalled_applications"}]'::jsonb, 20),
  ('Overdue scorecard reminders', '{"hours_overdue":24}'::jsonb,
    '[{"type":"remind_overdue_scorecards"}]'::jsonb, 30),
  ('Expiring offer alerts', '{"hours_before":48}'::jsonb,
    '[{"type":"notify_expiring_offers"}]'::jsonb, 40)
) AS seed(name, conditions, actions, priority)
WHERE NOT EXISTS (
  SELECT 1 FROM public.recruitment_automation_rules existing
  WHERE existing.name = seed.name
);

INSERT INTO public.recruitment_referral_programs (
  name, rules, reward_description, status
)
SELECT
  'OpusFesta Employee Referral Programme',
  'Refer someone only after they have agreed that you may share their details with OpusFesta. The candidate must be new to the vacancy and complete the normal, independent selection process. Referral awards, when offered for a vacancy, become eligible only after the referred hire completes probation and remain subject to People and Finance approval. Conflicts of interest must be disclosed.',
  'Where a vacancy carries a referral award, People Ops confirms eligibility after the referred hire completes probation. Approved awards are then included in payroll.',
  'active'
WHERE NOT EXISTS (
  SELECT 1 FROM public.recruitment_referral_programs
  WHERE name = 'OpusFesta Employee Referral Programme'
);

INSERT INTO public.recruitment_disposition_reasons (code, label, category, candidate_message_key, sort_order)
VALUES
  ('minimum_requirement', 'Minimum requirement not met', 'eligibility', 'application_closed', 10),
  ('experience', 'Insufficient relevant experience', 'qualification', 'application_closed', 20),
  ('assessment', 'Assessment result', 'assessment', 'application_closed', 30),
  ('interview', 'Interview outcome', 'interview', 'application_closed', 40),
  ('compensation', 'Compensation mismatch', 'terms', 'application_closed', 50),
  ('availability', 'Availability mismatch', 'terms', 'application_closed', 60),
  ('work_authorization', 'Work authorization', 'eligibility', 'application_closed', 70),
  ('position_cancelled', 'Position cancelled', 'position', 'position_closed', 80),
  ('stronger_candidate', 'Stronger candidate selected', 'competition', 'application_closed', 90),
  ('duplicate', 'Duplicate application', 'administrative', 'duplicate_application', 100),
  ('candidate_withdrew', 'Candidate withdrew', 'candidate', 'withdrawal_confirmed', 110)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  candidate_message_key = EXCLUDED.candidate_message_key,
  sort_order = EXCLUDED.sort_order;

WITH pipeline AS (
  INSERT INTO public.recruitment_pipeline_templates (name, description, status)
  VALUES ('Default hiring pipeline', 'OpusFesta default structured recruitment pipeline.', 'active')
  ON CONFLICT (name, department) DO UPDATE SET status = 'active'
  RETURNING id
)
INSERT INTO public.recruitment_pipeline_stages
  (pipeline_id, key, label, candidate_facing_status, stage_type, sort_order, requires_scorecards)
SELECT pipeline.id, stage.key, stage.label, stage.candidate_status, stage.stage_type, stage.sort_order, stage.requires_scorecards
FROM pipeline
CROSS JOIN (VALUES
  ('submitted', 'New', 'Application received', 'application', 10, false),
  ('eligibility_review', 'Eligibility review', 'Under review', 'review', 20, false),
  ('screening', 'Recruiter screening', 'Under review', 'screening', 30, false),
  ('hiring_manager_review', 'Hiring manager review', 'Under review', 'review', 40, false),
  ('assessment', 'Assessment', 'Next steps', 'assessment', 50, false),
  ('interview', 'Interview', 'Interview process', 'interview', 60, true),
  ('final_interview', 'Final interview', 'Interview process', 'interview', 70, true),
  ('reference_check', 'References / checks', 'Decision made', 'check', 80, false),
  ('offer', 'Offer', 'Offer', 'offer', 90, false),
  ('hired', 'Hired', 'Hired', 'hired', 100, false)
) AS stage(key, label, candidate_status, stage_type, sort_order, requires_scorecards)
ON CONFLICT (pipeline_id, key) DO UPDATE SET
  label = EXCLUDED.label,
  candidate_facing_status = EXCLUDED.candidate_facing_status,
  stage_type = EXCLUDED.stage_type,
  sort_order = EXCLUDED.sort_order,
  requires_scorecards = EXCLUDED.requires_scorecards;

DO $$
DECLARE
  all_recruitment_permissions text[] := ARRAY[
    'recruitment.read',
    'recruitment.plan.manage',
    'recruitment.requisition.create',
    'recruitment.requisition.approve',
    'recruitment.job.manage',
    'recruitment.job.publish',
    'recruitment.application.manage',
    'recruitment.candidate.manage',
    'recruitment.candidate.sensitive',
    'recruitment.interview.manage',
    'recruitment.interview.feedback',
    'recruitment.assessment.manage',
    'recruitment.communication.manage',
    'recruitment.offer.manage',
    'recruitment.offer.approve',
    'recruitment.referral.manage',
    'recruitment.cms.manage',
    'recruitment.analytics.read',
    'recruitment.settings.manage',
    'recruitment.privacy.manage',
    'recruitment.audit.read'
  ];
  detailed_recruitment_permissions text[] := ARRAY[
    'workforce.recruitment.read','workforce.recruitment.write',
    'workforce.requisitions.read','workforce.requisitions.create','workforce.requisitions.approve',
    'workforce.requisitions.finance_approve','workforce.requisitions.executive_approve',
    'workforce.jobs.read','workforce.jobs.write','workforce.jobs.publish','workforce.jobs.archive',
    'workforce.candidates.read','workforce.candidates.write','workforce.candidates.export','workforce.candidates.merge','workforce.candidates.delete',
    'workforce.applications.read','workforce.applications.review','workforce.applications.advance','workforce.applications.reject',
    'workforce.interviews.read','workforce.interviews.schedule','workforce.interviews.score',
    'workforce.assessments.read','workforce.assessments.write','workforce.assessments.score',
    'workforce.offers.read','workforce.offers.create','workforce.offers.approve','workforce.offers.send','workforce.offers.compensation_read',
    'workforce.talent_pool.read','workforce.talent_pool.write',
    'workforce.referrals.read','workforce.referrals.admin',
    'workforce.careers_content.read','workforce.careers_content.write','workforce.careers_content.publish',
    'workforce.recruitment_reports.read','workforce.recruitment_settings.write'
  ];
BEGIN
  UPDATE public.workforce_roles
  SET permission_keys = ARRAY(
    SELECT DISTINCT p FROM unnest(permission_keys || all_recruitment_permissions || detailed_recruitment_permissions) AS p ORDER BY p
  )
  WHERE slug IN ('owner', 'admin', 'people-ops');

  UPDATE public.workforce_roles
  SET permission_keys = ARRAY(
    SELECT DISTINCT p FROM unnest(permission_keys || ARRAY[
      'recruitment.read','recruitment.analytics.read','recruitment.audit.read',
      'workforce.recruitment.read','workforce.requisitions.read','workforce.jobs.read',
      'workforce.candidates.read','workforce.applications.read','workforce.interviews.read',
      'workforce.assessments.read','workforce.offers.read','workforce.talent_pool.read',
      'workforce.referrals.read','workforce.careers_content.read','workforce.recruitment_reports.read'
    ]::text[]) AS p ORDER BY p
  )
  WHERE slug = 'viewer';

  UPDATE public.workforce_roles
  SET permission_keys = ARRAY(
    SELECT DISTINCT p FROM unnest(permission_keys || ARRAY[
      'workforce.recruitment.read','workforce.requisitions.read',
      'workforce.requisitions.finance_approve','workforce.offers.read',
      'workforce.offers.approve','workforce.offers.compensation_read',
      'workforce.recruitment_reports.read'
    ]::text[]) AS p ORDER BY p
  )
  WHERE slug = 'finance';
END;
$$;

INSERT INTO public.workforce_roles (slug, name, description, permission_keys, members_count, is_system)
VALUES
  ('recruiter', 'Recruiter', 'Runs requisitions, candidates, interviews, communications, and offers.',
    ARRAY['workforce.read','recruitment.read','recruitment.requisition.create','recruitment.job.manage','recruitment.job.publish','recruitment.application.manage','recruitment.candidate.manage','recruitment.candidate.sensitive','recruitment.interview.manage','recruitment.interview.feedback','recruitment.assessment.manage','recruitment.communication.manage','recruitment.offer.manage','recruitment.referral.manage','recruitment.analytics.read','workforce.recruitment.read','workforce.recruitment.write','workforce.requisitions.read','workforce.requisitions.create','workforce.jobs.read','workforce.jobs.write','workforce.jobs.publish','workforce.jobs.archive','workforce.candidates.read','workforce.candidates.write','workforce.candidates.merge','workforce.applications.read','workforce.applications.review','workforce.applications.advance','workforce.applications.reject','workforce.interviews.read','workforce.interviews.schedule','workforce.interviews.score','workforce.assessments.read','workforce.assessments.write','workforce.assessments.score','workforce.offers.read','workforce.offers.create','workforce.offers.send','workforce.offers.compensation_read','workforce.talent_pool.read','workforce.talent_pool.write','workforce.referrals.read','workforce.referrals.admin','workforce.careers_content.read','workforce.recruitment_reports.read'], 0, true),
  ('hiring-manager', 'Hiring Manager', 'Manages assigned requisitions and hiring decisions for their team.',
    ARRAY['workforce.read','recruitment.read','recruitment.requisition.create','recruitment.application.manage','recruitment.candidate.manage','recruitment.interview.manage','recruitment.interview.feedback','recruitment.offer.manage','recruitment.analytics.read','workforce.recruitment.read','workforce.requisitions.read','workforce.requisitions.create','workforce.jobs.read','workforce.candidates.read','workforce.applications.read','workforce.applications.review','workforce.applications.advance','workforce.interviews.read','workforce.interviews.schedule','workforce.interviews.score','workforce.assessments.read','workforce.assessments.score','workforce.offers.read','workforce.offers.create','workforce.recruitment_reports.read'], 0, true),
  ('interviewer', 'Interviewer', 'Views assigned interviews and submits structured feedback.',
    ARRAY['recruitment.read','recruitment.interview.feedback','workforce.recruitment.read','workforce.interviews.read','workforce.interviews.score'], 0, true),
  ('recruitment-analyst', 'Recruitment Analyst', 'Read-only access to recruitment dashboards and audit evidence.',
    ARRAY['recruitment.read','recruitment.analytics.read','recruitment.audit.read','workforce.recruitment.read','workforce.requisitions.read','workforce.jobs.read','workforce.candidates.read','workforce.applications.read','workforce.interviews.read','workforce.assessments.read','workforce.offers.read','workforce.talent_pool.read','workforce.referrals.read','workforce.careers_content.read','workforce.recruitment_reports.read'], 0, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  permission_keys = EXCLUDED.permission_keys,
  is_system = EXCLUDED.is_system;

-- Recruitment capabilities are mutating legacy dashboard capabilities even
-- though their verbs are more precise than the historic `*.write` convention.
CREATE OR REPLACE FUNCTION public.workforce_role_legacy_bucket(role_id uuid)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN slug IN ('owner', 'admin', 'editor', 'viewer') THEN slug
    WHEN EXISTS (
      SELECT 1 FROM unnest(permission_keys) pk
      WHERE pk LIKE '%.write' OR pk LIKE '%.publish' OR pk LIKE '%.moderate'
        OR pk LIKE 'recruitment.%.manage'
        OR pk LIKE 'recruitment.%.create'
        OR pk LIKE 'recruitment.%.approve'
        OR pk LIKE 'recruitment.%.publish'
        OR pk IN ('workforce.payroll', 'platform.admin')
    ) THEN 'admin'
    ELSE 'viewer'
  END
  FROM public.workforce_roles
  WHERE id = role_id;
$$;

COMMENT ON TABLE public.recruitment_candidates IS
  'Canonical global candidate profile. One person can have many applications.';
COMMENT ON TABLE public.recruitment_applications IS
  'Canonical application lifecycle, distinct from candidate and job lifecycles.';
COMMENT ON TABLE public.recruitment_candidate_documents IS
  'Metadata for private recruitment documents. Objects remain in non-public Storage buckets.';
COMMENT ON TABLE public.recruitment_team_assignments IS
  'Department, requisition, or job scope for hiring-team access decisions.';
COMMENT ON TABLE public.recruitment_audit_events IS
  'Append-only recruitment audit trail; do not store document bodies or other sensitive payloads.';

NOTIFY pgrst, 'reload schema';
