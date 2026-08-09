-- Keep the server-side 10 MiB CV contract aligned with Storage. Older
-- environments created the careers bucket at 5 MiB even though the public
-- application action accepts files up to 10 MiB.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'careers',
  'careers',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.recruitment_reference_checks
  ADD COLUMN IF NOT EXISTS candidate_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS access_token_hash text,
  ADD COLUMN IF NOT EXISTS access_expires_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS recruitment_reference_checks_access_token_hash_key
  ON public.recruitment_reference_checks(access_token_hash)
  WHERE access_token_hash IS NOT NULL;

-- Legacy Workforce writes still project contact and document changes into the
-- canonical recruitment domain. Only an actual legacy stage change may move
-- canonical workflow state; a contact edit or migration replay must not
-- regress an application that has already advanced.
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

REVOKE ALL ON FUNCTION public.recruitment_sync_legacy_candidate()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_sync_legacy_candidate()
  TO service_role;
