-- Careers / recruitment Phase 1 foundation.
--
-- The Workforce module remains the source of truth for published jobs and
-- candidates. These additive fields make those records useful to the public
-- careers site without introducing a second, competing ATS model.

ALTER TABLE public.workforce_jobs
  ADD COLUMN IF NOT EXISTS brand text NOT NULL DEFAULT 'OpusFesta',
  ADD COLUMN IF NOT EXISTS workplace_type text NOT NULL DEFAULT 'On-site',
  ADD COLUMN IF NOT EXISTS experience_level text NOT NULL DEFAULT 'Professional',
  ADD COLUMN IF NOT EXISTS closing_date date,
  ADD COLUMN IF NOT EXISTS show_salary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS responsibilities text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS requirements text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_qualifications text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS working_conditions text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS recruitment_process text[] NOT NULL DEFAULT
    ARRAY['Application review', 'Introductory conversation', 'Role assessment', 'Team interview', 'Final decision'],
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

UPDATE public.workforce_jobs
SET published_at = opened_at::timestamptz
WHERE status = 'Open' AND published_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workforce_jobs_workplace_type_check'
      AND conrelid = 'public.workforce_jobs'::regclass
  ) THEN
    ALTER TABLE public.workforce_jobs
      ADD CONSTRAINT workforce_jobs_workplace_type_check
      CHECK (workplace_type IN ('On-site', 'Hybrid', 'Remote', 'Field-based'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workforce_jobs_public_listing
  ON public.workforce_jobs (status, closing_date, opened_at DESC);

ALTER TABLE public.workforce_candidates
  ADD COLUMN IF NOT EXISTS preferred_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS current_position text,
  ADD COLUMN IF NOT EXISTS current_organization text,
  ADD COLUMN IF NOT EXISTS years_experience numeric(4,1),
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS portfolio_url text,
  ADD COLUMN IF NOT EXISTS resume_storage_path text,
  ADD COLUMN IF NOT EXISTS cover_letter text,
  ADD COLUMN IF NOT EXISTS earliest_start_date date,
  ADD COLUMN IF NOT EXISTS salary_expectation text,
  ADD COLUMN IF NOT EXISTS work_authorized boolean,
  ADD COLUMN IF NOT EXISTS weekend_available boolean,
  ADD COLUMN IF NOT EXISTS application_reference text,
  ADD COLUMN IF NOT EXISTS privacy_notice_version text,
  ADD COLUMN IF NOT EXISTS application_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS talent_pool_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS career_updates_consent_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workforce_candidates_application_reference
  ON public.workforce_candidates (application_reference)
  WHERE application_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workforce_candidates_email_lower
  ON public.workforce_candidates (lower(email));

CREATE TABLE IF NOT EXISTS public.career_talent_prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  location text,
  preferred_departments text[] NOT NULL DEFAULT '{}',
  role_interests text,
  experience_level text,
  linkedin_or_portfolio_url text,
  resume_storage_path text,
  preferred_contact_method text NOT NULL DEFAULT 'Email',
  privacy_notice_version text NOT NULL,
  retention_consent_at timestamptz NOT NULL,
  career_updates_consent_at timestamptz,
  consent_withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.career_talent_prospects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.career_talent_prospects FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.career_talent_prospects TO service_role;

CREATE INDEX IF NOT EXISTS idx_career_talent_prospects_email_lower
  ON public.career_talent_prospects (lower(email));

DROP TRIGGER IF EXISTS trg_career_talent_prospects_updated_at
  ON public.career_talent_prospects;
CREATE TRIGGER trg_career_talent_prospects_updated_at
  BEFORE UPDATE ON public.career_talent_prospects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.recruitment_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  actor_type text NOT NULL DEFAULT 'system',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recruitment_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.recruitment_audit_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.recruitment_audit_events TO service_role;

CREATE INDEX IF NOT EXISTS idx_recruitment_audit_events_entity
  ON public.recruitment_audit_events (entity_type, entity_id, created_at DESC);

COMMENT ON TABLE public.career_talent_prospects IS
  'Consented prospects who joined the careers talent community without applying to a vacancy.';
COMMENT ON TABLE public.recruitment_audit_events IS
  'Minimal recruitment audit metadata. Sensitive application content must not be stored here.';
