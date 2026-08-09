-- Behavioural suite for the recruitment platform domain (migrations
-- 20260802090711_recruitment_platform_domain.sql and
-- 20260809031358_recruitment_e2e_hardening.sql).
-- Run via supabase/tests/run-recruitment-tests.sh.
--
-- Presentation, RBAC wiring and provider integration live in the admin and
-- website unit suites because they are application concerns. What is asserted
-- here is everything the database is responsible for on its own: atomic public
-- submission, required-answer rollback, knockout routing to human review,
-- scorecard sealing, interview conflict prevention, governed rejection,
-- offer signature evidence and consent-gated background checks.
\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

CREATE OR REPLACE FUNCTION assert_eq(actual ANYELEMENT, expected ANYELEMENT, label TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'FAIL: % (got %, expected %)', label, actual, expected;
  END IF;
  RAISE NOTICE 'pass: %', label;
END;
$$;

-- Asserts that a statement fails with a specific SQLSTATE. Used for every
-- guard that must fail closed rather than silently accept bad input.
CREATE OR REPLACE FUNCTION assert_raises(stmt TEXT, expected_sqlstate TEXT, label TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE got TEXT;
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    got := SQLSTATE;
  END;
  IF got IS NULL THEN
    RAISE EXCEPTION 'FAIL: % (statement succeeded, expected SQLSTATE %)', label, expected_sqlstate;
  END IF;
  IF got IS DISTINCT FROM expected_sqlstate THEN
    RAISE EXCEPTION 'FAIL: % (got SQLSTATE %, expected %)', label, got, expected_sqlstate;
  END IF;
  RAISE NOTICE 'pass: %', label;
END;
$$;

-- ===========================================================================
-- Fixtures
-- ===========================================================================
INSERT INTO workforce_employees (id, employee_code, full_name, email, job_title, department, start_date, salary_tzs)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'EMP-R001', 'Recruiter One', 'recruiter.one@example.test',
   'Talent Partner', 'HR', current_date - 400, 1800000),
  ('a0000000-0000-0000-0000-000000000002', 'EMP-R002', 'Hiring Manager', 'hiring.manager@example.test',
   'Head of Operations', 'Operations', current_date - 900, 3200000),
  ('a0000000-0000-0000-0000-000000000003', 'EMP-R003', 'Second Interviewer', 'interviewer.two@example.test',
   'Operations Lead', 'Operations', current_date - 600, 2400000);

INSERT INTO workforce_jobs (id, slug, title, department, location, employment_type,
                            posted_salary_min_tzs, posted_salary_max_tzs, hiring_manager, status)
VALUES
  ('b0000000-0000-0000-0000-000000000001', 'venue-coordinator', 'Venue Coordinator', 'Operations',
   'Dar es Salaam', 'Permanent', 1200000, 1800000, 'Hiring Manager', 'Open'),
  ('b0000000-0000-0000-0000-000000000002', 'closed-role', 'Closed Role', 'Operations',
   'Dar es Salaam', 'Permanent', 1000000, 1500000, 'Hiring Manager', 'Closed');

INSERT INTO recruitment_job_postings (id, workforce_job_id, public_title, status, visibility)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'Venue Coordinator', 'published', 'public'),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002',
   'Closed Role', 'published', 'public');

-- One required question, one optional knockout question. The knockout exists to
-- prove the database routes a failing answer to human review instead of
-- auto-rejecting the candidate.
INSERT INTO recruitment_application_questions
  (id, posting_id, key, label, question_type, requirement_stage, is_required, is_knockout, knockout_rule)
VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'work_authorization', 'Are you authorised to work in Tanzania?', 'yes_no', 'application', true, false, NULL),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001',
   'weekend_work', 'Can you work weekends?', 'yes_no', 'application', false, true,
   '{"expected":"true"}'::jsonb),
  -- Belongs to the other posting: used to prove cross-posting answers are refused.
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002',
   'other_posting', 'Unrelated question', 'yes_no', 'application', false, false, NULL);

-- ===========================================================================
-- A. Atomic public application submission
-- ===========================================================================
DO $$
DECLARE res jsonb; v_app_id uuid; v_candidate_id uuid;
BEGIN
  res := recruitment_submit_public_application(
    'b0000000-0000-0000-0000-000000000001',
    jsonb_build_object(
      'full_name', 'Asha Mwinyi',
      'email', 'Asha.Mwinyi@Example.Test',
      'phone', '+255700000001',
      'application_consent_at', now()::text,
      'utm_source', 'linkedin',
      'utm_campaign', 'ops-hiring'),
    jsonb_build_array(
      jsonb_build_object('question_id', 'd0000000-0000-0000-0000-000000000001', 'answer', to_jsonb(true)),
      jsonb_build_object('question_id', 'd0000000-0000-0000-0000-000000000002', 'answer', to_jsonb(true)))
  );

  v_app_id := (res->>'application_id')::uuid;
  PERFORM assert_eq(v_app_id IS NOT NULL, TRUE, 'A1 submission returns an application id');

  SELECT candidate_id INTO v_candidate_id FROM recruitment_applications WHERE id = v_app_id;

  -- Email is normalised, so a later application from the same person reuses
  -- the candidate rather than forking their history.
  PERFORM assert_eq(
    (SELECT primary_email FROM recruitment_candidates WHERE id = v_candidate_id),
    'asha.mwinyi@example.test', 'A2 candidate email is normalised to lower case');

  PERFORM assert_eq(
    (SELECT status FROM recruitment_applications WHERE id = v_app_id),
    'submitted', 'A3 clean application lands in submitted');

  PERFORM assert_eq(
    (SELECT count(*)::int FROM recruitment_application_answers WHERE application_id = v_app_id),
    2, 'A4 both answers were stored');

  -- Source attribution is written in the same transaction as the application,
  -- so campaign reporting can never lose an application it should have counted.
  PERFORM assert_eq(
    (SELECT source_name FROM recruitment_application_sources WHERE application_id = v_app_id),
    'linkedin', 'A5 UTM source captured with the application');

  PERFORM assert_eq(
    (SELECT count(*)::int FROM recruitment_candidate_consents WHERE candidate_id = v_candidate_id),
    1, 'A6 application consent recorded');
END;
$$;

-- ===========================================================================
-- B. Required-answer rollback
--
-- The whole point of routing submission through one function is that a
-- rejected application leaves nothing behind. A partially written candidate
-- would show up in search and duplicate detection as a ghost applicant.
-- ===========================================================================
DO $$
DECLARE v_candidates_before int; v_apps_before int;
BEGIN
  SELECT count(*) INTO v_candidates_before FROM recruitment_candidates;
  SELECT count(*) INTO v_apps_before FROM recruitment_applications;

  PERFORM assert_raises($stmt$
    SELECT recruitment_submit_public_application(
      'b0000000-0000-0000-0000-000000000001',
      jsonb_build_object('full_name','Ghost Applicant','email','ghost@example.test',
                         'application_consent_at', now()::text),
      '[]'::jsonb)
  $stmt$, '23502', 'B1 missing required answer is refused');

  PERFORM assert_eq((SELECT count(*)::int FROM recruitment_candidates), v_candidates_before,
    'B2 refused submission created no candidate row');
  PERFORM assert_eq((SELECT count(*)::int FROM recruitment_applications), v_apps_before,
    'B3 refused submission created no application row');
END;
$$;

-- ===========================================================================
-- C. Submission guards
-- ===========================================================================
DO $$
BEGIN
  -- An answer pointing at another posting's question would let a caller write
  -- arbitrary rows into an application they do not own.
  PERFORM assert_raises($stmt$
    SELECT recruitment_submit_public_application(
      'b0000000-0000-0000-0000-000000000001',
      jsonb_build_object('full_name','Cross Posting','email','cross@example.test',
                         'application_consent_at', now()::text),
      jsonb_build_array(
        jsonb_build_object('question_id','d0000000-0000-0000-0000-000000000001','answer',to_jsonb(true)),
        jsonb_build_object('question_id','d0000000-0000-0000-0000-000000000003','answer',to_jsonb(true))))
  $stmt$, '23514', 'C1 answer from another posting is refused');

  -- A closed vacancy must stop accepting applications even while its posting
  -- row is still marked published.
  PERFORM assert_raises($stmt$
    SELECT recruitment_submit_public_application(
      'b0000000-0000-0000-0000-000000000002',
      jsonb_build_object('full_name','Late Applicant','email','late@example.test',
                         'application_consent_at', now()::text),
      '[]'::jsonb)
  $stmt$, '23514', 'C2 closed vacancy refuses applications');

  -- Consent is not optional, and its absence must fail rather than default.
  PERFORM assert_raises($stmt$
    SELECT recruitment_submit_public_application(
      'b0000000-0000-0000-0000-000000000001',
      jsonb_build_object('full_name','No Consent','email','noconsent@example.test'),
      jsonb_build_array(
        jsonb_build_object('question_id','d0000000-0000-0000-0000-000000000001','answer',to_jsonb(true))))
  $stmt$, '23502', 'C3 missing application consent is refused');
END;
$$;

-- ===========================================================================
-- D. Knockout answers route to human review, never to auto-rejection
--
-- A knockout question is a screening signal, not a decision. Automatic
-- rejection on a self-reported answer is exactly the fair-hiring failure the
-- domain is meant to prevent.
-- ===========================================================================
DO $$
DECLARE res jsonb; v_app_id uuid;
BEGIN
  res := recruitment_submit_public_application(
    'b0000000-0000-0000-0000-000000000001',
    jsonb_build_object('full_name','Knockout Candidate','email','knockout@example.test',
                       'application_consent_at', now()::text),
    jsonb_build_array(
      jsonb_build_object('question_id','d0000000-0000-0000-0000-000000000001','answer',to_jsonb(true)),
      jsonb_build_object('question_id','d0000000-0000-0000-0000-000000000002','answer',to_jsonb(false)))
  );
  v_app_id := (res->>'application_id')::uuid;

  PERFORM assert_eq(
    (SELECT status FROM recruitment_applications WHERE id = v_app_id),
    'eligibility_review', 'D1 failed knockout routes to eligibility_review');

  PERFORM assert_eq(
    (SELECT status FROM recruitment_applications WHERE id = v_app_id) <> 'rejected',
    TRUE, 'D2 failed knockout is never auto-rejected');

  -- The candidate must not be told they failed a hidden rule.
  PERFORM assert_eq(
    (SELECT candidate_facing_status FROM recruitment_applications WHERE id = v_app_id),
    'Under review', 'D3 candidate-facing status stays neutral');
END;
$$;

-- ===========================================================================
-- E. Application state machine
-- ===========================================================================
DO $$
DECLARE v_app_id uuid;
BEGIN
  SELECT id INTO v_app_id FROM recruitment_applications
  WHERE candidate_id = (SELECT id FROM recruitment_candidates WHERE primary_email = 'asha.mwinyi@example.test');

  -- Hired is not a status anyone can simply set: it must be backed by an
  -- offer the candidate actually accepted.
  PERFORM assert_raises(format($stmt$
    UPDATE recruitment_applications SET status = 'hired' WHERE id = %L
  $stmt$, v_app_id), '23514', 'E1 hired without an accepted offer is rejected');

  -- Stage history is append-only evidence of how a decision was reached.
  UPDATE recruitment_applications SET status = 'under_review' WHERE id = v_app_id;
  PERFORM assert_eq(
    (SELECT count(*)::int > 0 FROM recruitment_application_stage_history WHERE application_id = v_app_id),
    TRUE, 'E2 stage change is recorded in history');

  PERFORM assert_raises(format($stmt$
    DELETE FROM recruitment_application_stage_history WHERE application_id = %L
  $stmt$, v_app_id), '55000', 'E3 stage history cannot be deleted');
END;
$$;

-- ===========================================================================
-- F. Interview conflict prevention
--
-- A double booking quietly wastes a candidate's trip, so the database refuses
-- every flavour of it rather than leaving it to the UI. There are four
-- distinct guards, and each is asserted separately because they protect
-- different people: the candidate, the room, and the interviewers.
-- ===========================================================================
INSERT INTO recruitment_interview_rooms (id, name)
VALUES ('e1000000-0000-0000-0000-000000000001', 'Boardroom');

DO $$
DECLARE
  v_app_id uuid; v_other_app_id uuid;
  v_interview_a uuid; v_interview_b uuid; v_interview_c uuid; v_interview_d uuid;
  v_start timestamptz;
BEGIN
  SELECT id INTO v_app_id FROM recruitment_applications
  WHERE candidate_id = (SELECT id FROM recruitment_candidates WHERE primary_email = 'asha.mwinyi@example.test');
  SELECT id INTO v_other_app_id FROM recruitment_applications
  WHERE candidate_id = (SELECT id FROM recruitment_candidates WHERE primary_email = 'knockout@example.test');

  v_start := date_trunc('hour', now()) + interval '3 days';

  INSERT INTO recruitment_interviews (id, application_id, title, interview_type) VALUES
    ('e0000000-0000-0000-0000-000000000001', v_app_id, 'First interview', 'screening'),
    ('e0000000-0000-0000-0000-000000000002', v_app_id, 'Overlapping interview', 'panel'),
    ('e0000000-0000-0000-0000-000000000003', v_other_app_id, 'Other candidate, same room', 'panel'),
    ('e0000000-0000-0000-0000-000000000004', v_other_app_id, 'Other candidate, same interviewer', 'panel');
  v_interview_a := 'e0000000-0000-0000-0000-000000000001';
  v_interview_b := 'e0000000-0000-0000-0000-000000000002';
  v_interview_c := 'e0000000-0000-0000-0000-000000000003';
  v_interview_d := 'e0000000-0000-0000-0000-000000000004';

  PERFORM recruitment_schedule_interview(v_interview_a, v_start, v_start + interval '1 hour',
    'Africa/Dar_es_Salaam', 'Head office', NULL, 'e1000000-0000-0000-0000-000000000001',
    'Please arrive ten minutes early', 'a0000000-0000-0000-0000-000000000001');

  PERFORM assert_eq(
    (SELECT status FROM recruitment_interviews WHERE id = v_interview_a),
    'scheduled', 'F1 interview reaches scheduled');

  -- A candidate cannot be in two places at once.
  PERFORM assert_raises(format($stmt$
    SELECT recruitment_schedule_interview(%L, %L, %L, 'Africa/Dar_es_Salaam',
      'Head office', NULL, NULL, NULL, %L)
  $stmt$, v_interview_b, v_start + interval '30 minutes', v_start + interval '90 minutes',
          'a0000000-0000-0000-0000-000000000001'),
    '23P01', 'F2 overlapping interview for the same candidate is refused');

  -- Neither can a room hold two panels at once.
  PERFORM assert_raises(format($stmt$
    SELECT recruitment_schedule_interview(%L, %L, %L, 'Africa/Dar_es_Salaam',
      'Head office', NULL, %L, NULL, %L)
  $stmt$, v_interview_c, v_start + interval '30 minutes', v_start + interval '90 minutes',
          'e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001'),
    '23P01', 'F3 double-booking a room is refused');

  -- A different candidate in a different room at the same time is legitimate.
  PERFORM recruitment_schedule_interview(v_interview_d,
    v_start + interval '30 minutes', v_start + interval '90 minutes',
    'Africa/Dar_es_Salaam', 'Remote', 'https://meet.example.test/abc', NULL, NULL,
    'a0000000-0000-0000-0000-000000000001');

  PERFORM assert_eq(
    (SELECT status FROM recruitment_interviews WHERE id = v_interview_d),
    'scheduled', 'F4 a genuinely free slot still schedules');

  PERFORM recruitment_add_interview_participant(v_interview_a,
    'a0000000-0000-0000-0000-000000000002', 'interviewer',
    'a0000000-0000-0000-0000-000000000001');

  -- The same interviewer cannot then be added to the overlapping panel.
  PERFORM assert_raises(format($stmt$
    SELECT recruitment_add_interview_participant(%L, %L, 'interviewer', %L)
  $stmt$, v_interview_d, 'a0000000-0000-0000-0000-000000000002',
          'a0000000-0000-0000-0000-000000000001'),
    '23P01', 'F5 double-booking an interviewer is refused');

  -- A free colleague can still be added, so the guard is not blanket-blocking.
  PERFORM recruitment_add_interview_participant(v_interview_d,
    'a0000000-0000-0000-0000-000000000003', 'interviewer',
    'a0000000-0000-0000-0000-000000000001');

  PERFORM assert_eq(
    (SELECT count(*)::int FROM recruitment_interview_participants WHERE interview_id = v_interview_d),
    1, 'F6 an unconflicted interviewer is still accepted');
END;
$$;

-- ===========================================================================
-- G. Scorecard sealing
--
-- A submitted scorecard is evidence. If it can be edited after the fact, the
-- hiring record stops being defensible.
-- ===========================================================================
INSERT INTO recruitment_scorecard_templates (id, name, status)
VALUES ('e2000000-0000-0000-0000-000000000001', 'Operations panel', 'active');
INSERT INTO recruitment_scorecard_sections (id, template_id, title)
VALUES ('e2000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000001', 'Core competencies');
INSERT INTO recruitment_scorecard_criteria (id, section_id, label, rating_scale)
VALUES
  ('e2000000-0000-0000-0000-000000000003', 'e2000000-0000-0000-0000-000000000002', 'Communication', 5),
  ('e2000000-0000-0000-0000-000000000004', 'e2000000-0000-0000-0000-000000000002', 'Judgement', 5);

DO $$
DECLARE
  v_scorecard_id uuid;
  v_interview uuid := 'e0000000-0000-0000-0000-000000000001';
  v_reviewer uuid := 'a0000000-0000-0000-0000-000000000002';
  v_one_rating jsonb;
  v_both_ratings jsonb;
BEGIN
  v_one_rating := jsonb_build_array(
    jsonb_build_object('criterion_id', 'e2000000-0000-0000-0000-000000000003', 'rating', 4));
  v_both_ratings := jsonb_build_array(
    jsonb_build_object('criterion_id', 'e2000000-0000-0000-0000-000000000003', 'rating', 4),
    jsonb_build_object('criterion_id', 'e2000000-0000-0000-0000-000000000004', 'rating', 5));

  PERFORM recruitment_assign_interview_scorecard(v_interview,
    'e2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');

  SELECT id INTO v_scorecard_id FROM recruitment_scorecards
  WHERE interview_id = v_interview AND reviewer_employee_id = v_reviewer;

  PERFORM assert_eq(v_scorecard_id IS NOT NULL, TRUE,
    'G1 assigning a template creates a scorecard per interviewer');

  -- Someone who was never on the panel must not be able to file feedback.
  PERFORM assert_raises(format($stmt$
    SELECT recruitment_submit_interview_scorecard(%L, %L,
      ARRAY['communication'], 'Was not in the room at all.', NULL,
      'yes', 'high', false, NULL, '[]'::jsonb, false)
  $stmt$, v_interview, 'a0000000-0000-0000-0000-000000000003'),
    '42501', 'G2 a non-interviewer cannot file a scorecard');

  -- Draft saves are editable, which is what makes an interviewer willing to
  -- write notes during the interview rather than afterwards from memory.
  PERFORM recruitment_submit_interview_scorecard(v_interview, v_reviewer,
    ARRAY['communication'], 'Handled the venue scenario well.', NULL,
    'yes', 'high', false, NULL, v_one_rating, false);
  PERFORM recruitment_submit_interview_scorecard(v_interview, v_reviewer,
    ARRAY['communication'], 'Revised evidence before submitting.', NULL,
    'yes', 'high', false, NULL, v_one_rating, false);

  PERFORM assert_eq(
    (SELECT evidence FROM recruitment_interview_feedback
      WHERE interview_id = v_interview AND employee_id = v_reviewer),
    'Revised evidence before submitting.', 'G3 draft scorecard is editable');

  -- A rating outside its scale is a data-entry error, not a valid score.
  PERFORM assert_raises(format($stmt$
    SELECT recruitment_submit_interview_scorecard(%L, %L,
      ARRAY['communication'], 'Rating out of range.', NULL, 'yes', 'high', false, NULL,
      %L::jsonb, false)
  $stmt$, v_interview, v_reviewer,
     jsonb_build_array(jsonb_build_object(
       'criterion_id', 'e2000000-0000-0000-0000-000000000003', 'rating', 9))::text),
    '23514', 'G4 a rating outside its scale is refused');

  -- Sealing with a criterion left blank would produce a partial record that
  -- reads as a complete one.
  PERFORM assert_raises(format($stmt$
    SELECT recruitment_submit_interview_scorecard(%L, %L,
      ARRAY['communication'], 'Submitting with a gap.', NULL, 'yes', 'high', false, NULL,
      %L::jsonb, true)
  $stmt$, v_interview, v_reviewer, v_one_rating::text),
    '23514', 'G5 sealing with an unrated criterion is refused');

  PERFORM recruitment_submit_interview_scorecard(v_interview, v_reviewer,
    ARRAY['communication'], 'Final submitted evidence.', NULL,
    'yes', 'high', false, NULL, v_both_ratings, true);

  PERFORM assert_eq(
    (SELECT status FROM recruitment_scorecards WHERE id = v_scorecard_id),
    'submitted', 'G6 completed scorecard is submitted');

  -- Sealed: neither the function nor a direct write may change it.
  PERFORM assert_raises(format($stmt$
    SELECT recruitment_submit_interview_scorecard(%L, %L,
      ARRAY['communication'], 'Trying to revise after the fact.', NULL,
      'strong_yes', 'high', false, NULL, %L::jsonb, true)
  $stmt$, v_interview, v_reviewer, v_both_ratings::text),
    '55000', 'G7 a sealed scorecard cannot be resubmitted');

  PERFORM assert_raises(format($stmt$
    UPDATE recruitment_scorecards SET recommendation = 'strong_no' WHERE id = %L
  $stmt$, v_scorecard_id), 'P0001', 'G8 submitted scorecard cannot be edited directly');

  PERFORM assert_raises(format($stmt$
    DELETE FROM recruitment_scorecards WHERE id = %L
  $stmt$, v_scorecard_id), 'P0001', 'G9 submitted scorecard cannot be deleted');
END;
$$;

-- ===========================================================================
-- H. Governed rejection
--
-- Rejection must carry an internal reason and a candidate-facing template
-- together, so nobody is dropped silently.
-- ===========================================================================
INSERT INTO recruitment_disposition_reasons (code, label, category)
VALUES ('not_a_fit', 'Not a fit for this role', 'screening'),
       ('retired_reason', 'No longer used', 'screening');
UPDATE recruitment_disposition_reasons SET is_active = false WHERE code = 'retired_reason';

INSERT INTO recruitment_message_templates (id, name, channel, category, body_template, status)
VALUES ('f0000000-0000-0000-0000-000000000001', 'Standard rejection', 'email', 'rejection',
        'Thank you for applying to {{job_title}}.', 'active'),
       -- A draft template must not be usable for a decision that reaches a person.
       ('f0000000-0000-0000-0000-000000000002', 'Unfinished rejection', 'email', 'rejection',
        'Draft copy.', 'draft');

DO $$
DECLARE v_app_id uuid; v_template_id uuid := 'f0000000-0000-0000-0000-000000000001';
BEGIN
  SELECT id INTO v_app_id FROM recruitment_applications
  WHERE candidate_id = (SELECT id FROM recruitment_candidates WHERE primary_email = 'knockout@example.test');

  -- A free-text reason would make rejection reporting meaningless, so only
  -- codes from the governed list are accepted.
  PERFORM assert_raises(format($stmt$
    SELECT recruitment_transition_application(%L, 'rejected', %L, 'made_it_up', 'No reason')
  $stmt$, v_app_id, 'a0000000-0000-0000-0000-000000000001'),
    '23514', 'H1 an unregistered rejection reason is refused');

  -- Retiring a reason must stop it being used from then on.
  PERFORM assert_raises(format($stmt$
    SELECT recruitment_transition_application(%L, 'rejected', %L, 'retired_reason', 'No reason')
  $stmt$, v_app_id, 'a0000000-0000-0000-0000-000000000001'),
    '23514', 'H2 a retired rejection reason is refused');

  PERFORM assert_raises(format($stmt$
    SELECT recruitment_transition_application(%L, 'rejected', %L, NULL, 'No reason')
  $stmt$, v_app_id, 'a0000000-0000-0000-0000-000000000001'),
    '23514', 'H3 rejection without any reason is refused');

  PERFORM recruitment_transition_application(v_app_id, 'rejected',
    'a0000000-0000-0000-0000-000000000001', 'not_a_fit', 'Stronger candidates in this round');

  PERFORM assert_eq(
    (SELECT status FROM recruitment_applications WHERE id = v_app_id),
    'rejected', 'H4 governed rejection applies');

  PERFORM assert_eq(
    (SELECT count(*)::int > 0 FROM recruitment_application_dispositions WHERE application_id = v_app_id),
    TRUE, 'H5 rejection records an internal disposition');

  -- The internal reason must not leak into what the candidate is shown.
  PERFORM assert_eq(
    (SELECT candidate_facing_status FROM recruitment_applications WHERE id = v_app_id),
    'Decision made', 'H6 candidate-facing status does not expose the internal reason');

  PERFORM assert_raises(format($stmt$
    SELECT recruitment_queue_rejection_message(%L, %L, %L, NULL)
  $stmt$, v_app_id, 'f0000000-0000-0000-0000-000000000002',
          'a0000000-0000-0000-0000-000000000001'),
    '23514', 'H7 a draft template cannot be sent to a candidate');

  PERFORM recruitment_queue_rejection_message(v_app_id, v_template_id,
    'a0000000-0000-0000-0000-000000000001', NULL);

  PERFORM assert_eq(
    (SELECT count(*)::int > 0 FROM recruitment_messages WHERE application_id = v_app_id),
    TRUE, 'H8 candidate-facing rejection message is queued');

  -- Queued, not sent: delivery only happens once a provider is configured, so
  -- a missing provider can never silently drop the message.
  PERFORM assert_eq(
    (SELECT status FROM recruitment_messages WHERE application_id = v_app_id ORDER BY created_at DESC LIMIT 1),
    'queued', 'H9 the message waits in the queue rather than reporting itself sent');
END;
$$;

-- ===========================================================================
-- I. Consent-gated background checks
--
-- A background check without recorded consent is a privacy incident, so the
-- database refuses to mark one consented on the candidate's behalf.
-- ===========================================================================
DO $$
DECLARE
  v_candidate_id uuid; v_app_id uuid;
  v_check_id uuid := 'f2000000-0000-0000-0000-000000000001';
  v_task_id uuid := 'f1000000-0000-0000-0000-000000000001';
  v_premature_check uuid := 'f2000000-0000-0000-0000-000000000002';
  v_premature_task uuid := 'f1000000-0000-0000-0000-000000000002';
BEGIN
  SELECT id INTO v_candidate_id FROM recruitment_candidates
  WHERE primary_email = 'asha.mwinyi@example.test';
  SELECT id INTO v_app_id FROM recruitment_applications WHERE candidate_id = v_candidate_id;

  INSERT INTO recruitment_background_checks (id, application_id, check_type, provider, status)
  VALUES (v_check_id, v_app_id, 'criminal_record', 'test-provider', 'consent_requested'),
         -- Not yet requested: nobody may consent to it on the candidate's behalf.
         (v_premature_check, v_app_id, 'reference', 'test-provider', 'not_started');

  INSERT INTO recruitment_candidate_portal_tasks
    (id, candidate_id, application_id, task_type, title, payload)
  VALUES
    (v_task_id, v_candidate_id, v_app_id, 'background_check_consent',
     'Background check consent', jsonb_build_object('background_check_id', v_check_id)),
    (v_premature_task, v_candidate_id, v_app_id, 'background_check_consent',
     'Premature consent', jsonb_build_object('background_check_id', v_premature_check));

  -- Another candidate must not be able to answer this task.
  PERFORM assert_raises(format($stmt$
    SELECT recruitment_candidate_respond_background_consent(%L, %L, true)
  $stmt$, v_task_id,
     (SELECT id FROM recruitment_candidates WHERE primary_email = 'knockout@example.test')),
    '42501', 'I1 a different candidate cannot answer the consent task');

  -- Consent is only meaningful against a check that actually asked for it.
  PERFORM assert_raises(format($stmt$
    SELECT recruitment_candidate_respond_background_consent(%L, %L, true)
  $stmt$, v_premature_task, v_candidate_id),
    '23514', 'I2 consent cannot be given for a check that was never requested');

  PERFORM assert_eq(
    (SELECT candidate_consent_at IS NULL FROM recruitment_background_checks WHERE id = v_check_id),
    TRUE, 'I3 a requested check carries no consent until the candidate gives it');

  PERFORM recruitment_candidate_respond_background_consent(v_task_id, v_candidate_id, true);

  PERFORM assert_eq(
    (SELECT status FROM recruitment_candidate_portal_tasks WHERE id = v_task_id),
    'completed', 'I4 consent response completes the task');

  PERFORM assert_eq(
    (SELECT status FROM recruitment_background_checks WHERE id = v_check_id),
    'in_progress', 'I5 the check only starts once consent is recorded');

  PERFORM assert_eq(
    (SELECT candidate_consent_at IS NOT NULL FROM recruitment_background_checks WHERE id = v_check_id),
    TRUE, 'I6 the consent timestamp is stored as evidence');

  -- Answering twice must not silently re-open a completed decision.
  PERFORM assert_raises(format($stmt$
    SELECT recruitment_candidate_respond_background_consent(%L, %L, false)
  $stmt$, v_task_id, v_candidate_id),
    '42501', 'I7 a completed consent task cannot be answered again');

  PERFORM assert_eq(
    (SELECT count(*)::int > 0 FROM recruitment_audit_events
      WHERE entity_id = v_check_id AND event_type = 'background_check.consent_responded'),
    TRUE, 'I8 the consent decision is audited');
END;
$$;

-- Refusing consent must cancel the check rather than leave it running.
DO $$
DECLARE
  v_candidate_id uuid; v_app_id uuid;
  v_check_id uuid := 'f2000000-0000-0000-0000-000000000003';
  v_task_id uuid := 'f1000000-0000-0000-0000-000000000003';
BEGIN
  SELECT id INTO v_candidate_id FROM recruitment_candidates
  WHERE primary_email = 'asha.mwinyi@example.test';
  SELECT id INTO v_app_id FROM recruitment_applications WHERE candidate_id = v_candidate_id;

  INSERT INTO recruitment_background_checks (id, application_id, check_type, provider, status)
  VALUES (v_check_id, v_app_id, 'education', 'test-provider', 'consent_requested');
  INSERT INTO recruitment_candidate_portal_tasks
    (id, candidate_id, application_id, task_type, title, payload)
  VALUES (v_task_id, v_candidate_id, v_app_id, 'background_check_consent',
          'Education check consent', jsonb_build_object('background_check_id', v_check_id));

  PERFORM recruitment_candidate_respond_background_consent(v_task_id, v_candidate_id, false);

  PERFORM assert_eq(
    (SELECT status FROM recruitment_background_checks WHERE id = v_check_id),
    'cancelled', 'I9 refusing consent cancels the check');

  PERFORM assert_eq(
    (SELECT candidate_consent_at IS NULL FROM recruitment_background_checks WHERE id = v_check_id),
    TRUE, 'I10 a refused check records no consent timestamp');
END;
$$;

-- ===========================================================================
-- J. Document scan state fails closed
--
-- These are the columns the final hardening pass added. A document is only
-- releasable once a scan has actually reported clean.
-- ===========================================================================
DO $$
DECLARE v_candidate_id uuid; v_doc_id uuid;
BEGIN
  SELECT id INTO v_candidate_id FROM recruitment_candidates
  WHERE primary_email = 'asha.mwinyi@example.test';

  INSERT INTO recruitment_candidate_documents
    (candidate_id, document_type, storage_bucket, storage_path, created_by_actor_type)
  VALUES (v_candidate_id, 'resume', 'careers', 'careers/test-resume.pdf', 'candidate')
  RETURNING id INTO v_doc_id;

  PERFORM assert_eq(
    (SELECT malware_scan_status FROM recruitment_candidate_documents WHERE id = v_doc_id),
    'pending', 'J1 new document starts pending, not clean');

  PERFORM assert_eq(
    (SELECT malware_scan_attempts FROM recruitment_candidate_documents WHERE id = v_doc_id),
    0, 'J2 scan attempts start at zero');

  PERFORM assert_eq(
    (SELECT malware_scanned_at IS NULL FROM recruitment_candidate_documents WHERE id = v_doc_id),
    TRUE, 'J3 unscanned document has no scan timestamp');

  -- The retry worker records why a scan failed so a stuck document is
  -- diagnosable rather than silently invisible forever.
  UPDATE recruitment_candidate_documents
  SET malware_scan_status = 'failed', malware_scan_attempts = 1,
      malware_scan_error = 'scanner unreachable', malware_scanned_at = now()
  WHERE id = v_doc_id;

  PERFORM assert_eq(
    (SELECT malware_scan_error FROM recruitment_candidate_documents WHERE id = v_doc_id),
    'scanner unreachable', 'J4 scan failure reason is retained for retry');

  PERFORM assert_raises(format($stmt$
    UPDATE recruitment_candidate_documents SET malware_scan_status = 'infected' WHERE id = %L
  $stmt$, v_doc_id), '23514', 'J5 unknown scan states are refused');
END;
$$;

-- ===========================================================================
-- K. Offers, separation of duties and signature evidence
--
-- An offer is the most consequential record in the system: it commits money
-- and it is the document a dispute would be argued from. Every gate between
-- drafting it and hiring against it is asserted here.
-- ===========================================================================
INSERT INTO recruitment_requisitions
  (id, requisition_number, title, department, location, employment_type, reason,
   status, hiring_manager_employee_id)
VALUES ('e3000000-0000-0000-0000-000000000001', 'REQ-2026-001', 'Venue Coordinator',
        'Operations', 'Dar es Salaam', 'Permanent', 'Growth headcount', 'recruiting',
        'a0000000-0000-0000-0000-000000000002');

UPDATE workforce_jobs SET requisition_id = 'e3000000-0000-0000-0000-000000000001'
WHERE id = 'b0000000-0000-0000-0000-000000000001';

DO $$
DECLARE
  v_app_id uuid; v_candidate_id uuid; v_offer_id uuid; v_step_id uuid;
  v_version_id uuid; v_doc_id uuid;
BEGIN
  SELECT id INTO v_candidate_id FROM recruitment_candidates
  WHERE primary_email = 'asha.mwinyi@example.test';
  SELECT id INTO v_app_id FROM recruitment_applications WHERE candidate_id = v_candidate_id;

  -- An offer cannot be drafted for someone still early in the process.
  PERFORM assert_raises(format($stmt$
    SELECT recruitment_create_offer(%L, CURRENT_DATE + 30, now() + interval '7 days',
      1500000, 'monthly', '9-5', NULL, NULL, '{}'::text[], %L)
  $stmt$, v_app_id, 'a0000000-0000-0000-0000-000000000001'),
    '23514', 'K1 an offer cannot be drafted before the final stages');

  PERFORM recruitment_transition_application(v_app_id, 'final_interview',
    'a0000000-0000-0000-0000-000000000001', NULL, NULL);

  -- A start date in the past, or an already-expired offer, is a data error
  -- that would otherwise reach a candidate.
  PERFORM assert_raises(format($stmt$
    SELECT recruitment_create_offer(%L, CURRENT_DATE - 1, now() + interval '7 days',
      1500000, 'monthly', '9-5', NULL, NULL, '{}'::text[], %L)
  $stmt$, v_app_id, 'a0000000-0000-0000-0000-000000000001'),
    '23514', 'K2 a start date in the past is refused');

  v_offer_id := recruitment_create_offer(v_app_id, CURRENT_DATE + 30,
    now() + interval '7 days', 1500000, 'monthly', '9-5', NULL, NULL,
    ARRAY['Satisfactory background check'], 'a0000000-0000-0000-0000-000000000001');

  PERFORM assert_eq((SELECT status FROM recruitment_offers WHERE id = v_offer_id),
    'draft', 'K3 a new offer starts as a draft');

  -- Sending before approval would bypass the entire approval chain.
  PERFORM assert_raises(format($stmt$
    SELECT recruitment_send_approved_offer(%L, %L)
  $stmt$, v_offer_id, 'a0000000-0000-0000-0000-000000000001'),
    '23514', 'K4 an unapproved offer cannot be sent');

  PERFORM recruitment_submit_offer_for_approval(v_offer_id,
    'a0000000-0000-0000-0000-000000000001');

  PERFORM assert_eq((SELECT status FROM recruitment_offers WHERE id = v_offer_id),
    'pending_approval', 'K5 submitting moves the offer into approval');

  -- The approval must be argued from an immutable snapshot of the terms, not
  -- from a row that can still change underneath the approver.
  PERFORM assert_eq(
    (SELECT count(*)::int > 0 FROM recruitment_offer_versions WHERE offer_id = v_offer_id),
    TRUE, 'K6 submitting snapshots the offer terms');

  SELECT id INTO v_step_id FROM recruitment_offer_approvals
  WHERE offer_id = v_offer_id AND status = 'pending' ORDER BY sequence LIMIT 1;

  -- Separation of duties: whoever wrote the offer cannot wave it through.
  PERFORM assert_raises(format($stmt$
    SELECT recruitment_decide_offer_step(%L, %L, 'approved', NULL, %L)
  $stmt$, v_offer_id, v_step_id, 'a0000000-0000-0000-0000-000000000001'),
    '42501', 'K7 the offer creator cannot approve their own offer');

  -- A rejection or change request has to say why.
  PERFORM assert_raises(format($stmt$
    SELECT recruitment_decide_offer_step(%L, %L, 'changes_requested', NULL, %L)
  $stmt$, v_offer_id, v_step_id, 'a0000000-0000-0000-0000-000000000002'),
    '23514', 'K8 a non-approval decision requires a note');

  PERFORM recruitment_decide_offer_step(v_offer_id, v_step_id, 'approved', NULL,
    'a0000000-0000-0000-0000-000000000002');

  -- One approval is not enough while other steps are still outstanding.
  IF EXISTS (SELECT 1 FROM recruitment_offer_approvals
             WHERE offer_id = v_offer_id AND status = 'pending') THEN
    PERFORM assert_eq((SELECT status FROM recruitment_offers WHERE id = v_offer_id),
      'pending_approval', 'K9 the offer stays pending while any approval is outstanding');
  END IF;

  -- Clear the rest of the chain.
  FOR v_step_id IN
    SELECT id FROM recruitment_offer_approvals
    WHERE offer_id = v_offer_id AND status = 'pending' ORDER BY sequence
  LOOP
    PERFORM recruitment_decide_offer_step(v_offer_id, v_step_id, 'approved', NULL,
      'a0000000-0000-0000-0000-000000000002');
  END LOOP;

  PERFORM assert_eq((SELECT status FROM recruitment_offers WHERE id = v_offer_id),
    'approved', 'K9b a fully approved offer reaches approved');

  -- Approved is still not sendable until the signed document exists, so the
  -- candidate can never be asked to accept terms nobody rendered.
  PERFORM assert_raises(format($stmt$
    SELECT recruitment_send_approved_offer(%L, %L)
  $stmt$, v_offer_id, 'a0000000-0000-0000-0000-000000000001'),
    '23514', 'K10 an approved offer without its document cannot be sent');

  SELECT id INTO v_version_id FROM recruitment_offer_versions
  WHERE offer_id = v_offer_id ORDER BY version DESC LIMIT 1;

  INSERT INTO recruitment_offer_documents
    (offer_id, offer_version_id, document_type, storage_path, mime_type, byte_size, sha256)
  VALUES (v_offer_id, v_version_id, 'offer_letter', 'candidate-offers/offer.pdf',
          'application/pdf', 12345, repeat('a', 64))
  RETURNING id INTO v_doc_id;

  PERFORM recruitment_send_approved_offer(v_offer_id, 'a0000000-0000-0000-0000-000000000001');

  PERFORM assert_eq((SELECT status FROM recruitment_offers WHERE id = v_offer_id),
    'sent', 'K11 a complete offer can be sent');

  -- Another candidate must not be able to answer someone else's offer.
  PERFORM assert_raises(format($stmt$
    SELECT recruitment_candidate_respond_offer(%L, %L, 'accepted', 'Someone Else')
  $stmt$, v_offer_id,
     (SELECT id FROM recruitment_candidates WHERE primary_email = 'knockout@example.test')),
    '42501', 'K12 an offer can only be answered by its own candidate');

  -- Acceptance without a signature would leave no evidence of agreement.
  PERFORM assert_raises(format($stmt$
    SELECT recruitment_candidate_respond_offer(%L, %L, 'accepted', NULL)
  $stmt$, v_offer_id, v_candidate_id),
    '23514', 'K13 accepting without a typed signature is refused');

  PERFORM recruitment_candidate_respond_offer(v_offer_id, v_candidate_id, 'accepted',
    'Asha Mwinyi', NULL, 'hash-of-ip', 'test-agent');

  PERFORM assert_eq((SELECT status FROM recruitment_offers WHERE id = v_offer_id),
    'accepted', 'K14 a signed offer is accepted');

  -- The certificate binds the signature to the exact document that was signed.
  PERFORM assert_eq(
    (SELECT signed_name FROM recruitment_offer_signature_certificates WHERE offer_id = v_offer_id),
    'Asha Mwinyi', 'K15 the typed signature is preserved on a certificate');

  PERFORM assert_eq(
    (SELECT document_sha256 FROM recruitment_offer_signature_certificates WHERE offer_id = v_offer_id),
    repeat('a', 64), 'K16 the certificate pins the hash of the signed document');

  PERFORM assert_eq(
    (SELECT count(*)::int > 0 FROM recruitment_hiring_conversions WHERE offer_id = v_offer_id),
    TRUE, 'K17 acceptance opens a hiring conversion');

  -- Answering twice must not overwrite the accepted record.
  PERFORM assert_raises(format($stmt$
    SELECT recruitment_candidate_respond_offer(%L, %L, 'declined', NULL)
  $stmt$, v_offer_id, v_candidate_id),
    '23514', 'K18 an answered offer cannot be answered again');

  -- Only now may the application be marked hired.
  UPDATE recruitment_applications SET status = 'hired' WHERE id = v_app_id;
  PERFORM assert_eq((SELECT status FROM recruitment_applications WHERE id = v_app_id),
    'hired', 'K19 hired is permitted once an accepted offer exists');
END;
$$;

DO $$ BEGIN RAISE NOTICE 'TESTS PASSED'; END $$;
