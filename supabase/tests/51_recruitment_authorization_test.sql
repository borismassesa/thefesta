-- Authorization denial matrix for the recruitment bounded context.
-- Run via supabase/tests/run-recruitment-tests.sh.
--
-- `recruitment_employee_has_scope` is the record-scope half of recruitment
-- authorization. The capability half lives in `requireRecruitmentAccess`
-- (apps/opus_admin/src/lib/recruitment-auth.ts), which refuses a caller
-- lacking the permission key, allows an organization-wide principal outright,
-- and otherwise defers the record decision to this function. So every
-- non-administrator's access to a recruitment record is decided here.
--
-- This file is a matrix rather than a set of spot checks. The failure being
-- guarded against is a scope path that grants too widely, and only systematic
-- denial coverage across every entity type finds those. For each entity type
-- the same principals are asked the same question, and the allow cases are
-- asserted alongside the denials: a scope function that denied everyone would
-- pass a denial-only suite while breaking every legitimate user.
--
-- Scope may be granted through exactly five paths:
--   1. requisition ownership (hiring manager, recruiter, requester)
--   2. a named approval step on the requisition
--   3. an active application assignment
--   4. interview participation
--   5. an in-window team assignment by requisition, job or department
-- Each is proven to grant, and each is proven not to grant beyond itself.
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

-- The whole matrix reduces to this question, so it gets its own helper: may
-- this employee reach this record?
CREATE OR REPLACE FUNCTION assert_scope(
  p_employee uuid, p_entity_type text, p_entity uuid, p_expected boolean, p_label text)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_actual boolean;
BEGIN
  v_actual := public.recruitment_employee_has_scope(p_employee, p_entity_type, p_entity);
  IF v_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'FAIL: % (got %, expected %)', p_label, v_actual, p_expected;
  END IF;
  RAISE NOTICE 'pass: %', p_label;
END;
$$;

-- ===========================================================================
-- Principals
--
-- Named so the assertions read as the matrix rows they implement.
-- ===========================================================================
INSERT INTO workforce_employees (id, employee_code, full_name, email, job_title, department, start_date, salary_tzs)
VALUES
  -- Owns the requisition under test.
  ('11110000-0000-0000-0000-000000000001', 'AUTH-001', 'Owning Hiring Manager',
   'auth.hm@example.test', 'Head of Operations', 'Operations', current_date - 900, 3200000),
  -- Named recruiter on the requisition under test.
  ('11110000-0000-0000-0000-000000000002', 'AUTH-002', 'Assigned Recruiter',
   'auth.recruiter@example.test', 'Talent Partner', 'HR', current_date - 800, 1800000),
  -- Named approver on the requisition under test.
  ('11110000-0000-0000-0000-000000000003', 'AUTH-003', 'Named Approver',
   'auth.approver@example.test', 'Finance Lead', 'Finance & Accountings', current_date - 700, 2600000),
  -- Assigned to the application under test, nothing else.
  ('11110000-0000-0000-0000-000000000004', 'AUTH-004', 'Application Reviewer',
   'auth.reviewer@example.test', 'Operations Lead', 'Operations', current_date - 600, 2400000),
  -- On the interview panel under test, nothing else.
  ('11110000-0000-0000-0000-000000000005', 'AUTH-005', 'Panel Interviewer',
   'auth.panel@example.test', 'Senior Coordinator', 'Operations', current_date - 500, 2200000),
  -- Employed, in the same department, but attached to nothing.
  ('11110000-0000-0000-0000-000000000006', 'AUTH-006', 'Unrelated Same Department',
   'auth.samedept@example.test', 'Coordinator', 'Operations', current_date - 400, 1500000),
  -- Employed in an unrelated department, attached to nothing.
  ('11110000-0000-0000-0000-000000000007', 'AUTH-007', 'Unrelated Other Department',
   'auth.otherdept@example.test', 'Engineer', 'Technology', current_date - 300, 2800000),
  -- Owns a DIFFERENT requisition. Proves ownership does not leak sideways.
  ('11110000-0000-0000-0000-000000000008', 'AUTH-008', 'Other Requisition Owner',
   'auth.otherowner@example.test', 'Studio Lead', 'Studio', current_date - 200, 2500000),
  -- Held a team assignment that has since ended.
  ('11110000-0000-0000-0000-000000000009', 'AUTH-009', 'Former Team Member',
   'auth.former@example.test', 'Coordinator', 'Operations', current_date - 1000, 1600000),
  -- Assigned to the application, but the assignment has ended.
  ('11110000-0000-0000-0000-00000000000a', 'AUTH-010', 'Former Reviewer',
   'auth.formerreviewer@example.test', 'Coordinator', 'Operations', current_date - 1000, 1600000),
  -- Team assignment scoped to the department only.
  ('11110000-0000-0000-0000-00000000000b', 'AUTH-011', 'Department Team Member',
   'auth.deptteam@example.test', 'Ops Analyst', 'Operations', current_date - 350, 1900000);

-- ===========================================================================
-- Records
--
-- Two parallel hiring records in different departments. Everything asserted
-- below is some principal reaching across, or failing to reach across, the
-- boundary between them.
-- ===========================================================================
INSERT INTO recruitment_requisitions
  (id, requisition_number, title, department, location, employment_type, reason, status,
   hiring_manager_employee_id, recruiter_employee_id, requested_by_employee_id)
VALUES
  ('22220000-0000-0000-0000-000000000001', 'REQ-AUTH-001', 'Venue Coordinator',
   'Operations', 'Dar es Salaam', 'Permanent', 'Growth', 'recruiting',
   '11110000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000002',
   '11110000-0000-0000-0000-000000000001'),
  ('22220000-0000-0000-0000-000000000002', 'REQ-AUTH-002', 'Studio Assistant',
   'Studio', 'Dar es Salaam', 'Permanent', 'Backfill', 'recruiting',
   '11110000-0000-0000-0000-000000000008', '11110000-0000-0000-0000-000000000008',
   '11110000-0000-0000-0000-000000000008');

INSERT INTO recruitment_approval_steps (requisition_id, sequence, approver_role, approver_employee_id, status)
VALUES ('22220000-0000-0000-0000-000000000001', 1, 'finance',
        '11110000-0000-0000-0000-000000000003', 'pending');

INSERT INTO workforce_jobs (id, slug, title, department, location, employment_type,
                            posted_salary_min_tzs, posted_salary_max_tzs, hiring_manager, status, requisition_id)
VALUES
  ('33330000-0000-0000-0000-000000000001', 'auth-venue-coordinator', 'Venue Coordinator',
   'Operations', 'Dar es Salaam', 'Permanent', 1200000, 1800000, 'Owning Hiring Manager', 'Open',
   '22220000-0000-0000-0000-000000000001'),
  ('33330000-0000-0000-0000-000000000002', 'auth-studio-assistant', 'Studio Assistant',
   'Studio', 'Dar es Salaam', 'Permanent', 1000000, 1500000, 'Other Requisition Owner', 'Open',
   '22220000-0000-0000-0000-000000000002');

INSERT INTO recruitment_candidates (id, primary_email, full_name)
VALUES ('44440000-0000-0000-0000-000000000001', 'auth.candidate@example.test', 'Scoped Candidate'),
       ('44440000-0000-0000-0000-000000000002', 'auth.other@example.test', 'Other Candidate');

INSERT INTO recruitment_applications (id, candidate_id, job_id, application_reference, status)
VALUES ('55550000-0000-0000-0000-000000000001', '44440000-0000-0000-0000-000000000001',
        '33330000-0000-0000-0000-000000000001', 'OF-AUTH-0001', 'interview'),
       ('55550000-0000-0000-0000-000000000002', '44440000-0000-0000-0000-000000000002',
        '33330000-0000-0000-0000-000000000002', 'OF-AUTH-0002', 'interview');

INSERT INTO recruitment_application_assignments
  (application_id, employee_id, assignment_role, assigned_at, ended_at)
VALUES ('55550000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000004', 'reviewer',
        now() - interval '30 days', NULL),
       -- Ended yesterday: must no longer grant.
       ('55550000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-00000000000a', 'coordinator',
        now() - interval '30 days', now() - interval '1 day');

INSERT INTO recruitment_interviews (id, application_id, title, interview_type, starts_at, ends_at, status)
VALUES ('66660000-0000-0000-0000-000000000001', '55550000-0000-0000-0000-000000000001',
        'Panel', 'panel', now() + interval '2 days', now() + interval '2 days 1 hour', 'scheduled');

INSERT INTO recruitment_interview_participants (interview_id, employee_id, participant_role)
VALUES ('66660000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000005', 'interviewer');

INSERT INTO recruitment_team_assignments (employee_id, team_role, department, starts_at, ends_at)
VALUES ('11110000-0000-0000-0000-00000000000b', 'analyst', 'Operations', now() - interval '10 days', NULL),
       -- Ended last week: must no longer grant.
       ('11110000-0000-0000-0000-000000000009', 'analyst', 'Operations',
        now() - interval '60 days', now() - interval '7 days');

INSERT INTO recruitment_assessments (id, application_id, assessment_type, title, status)
VALUES ('77770000-0000-0000-0000-000000000001', '55550000-0000-0000-0000-000000000001',
        'work_sample', 'Scenario exercise', 'invited');

INSERT INTO recruitment_offers (id, application_id, offer_number, job_title, base_salary)
VALUES ('88880000-0000-0000-0000-000000000001', '55550000-0000-0000-0000-000000000001',
        'OFF-AUTH-0001', 'Venue Coordinator', 1500000);

-- ===========================================================================
-- A. Requisition scope
-- ===========================================================================
DO $$
DECLARE v_req uuid := '22220000-0000-0000-0000-000000000001';
BEGIN
  PERFORM assert_scope('11110000-0000-0000-0000-000000000001', 'requisition', v_req, TRUE,
    'A1 owning hiring manager reaches their requisition');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000002', 'requisition', v_req, TRUE,
    'A2 named recruiter reaches the requisition');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000003', 'requisition', v_req, TRUE,
    'A3 named approver reaches the requisition');
  PERFORM assert_scope('11110000-0000-0000-0000-00000000000b', 'requisition', v_req, TRUE,
    'A4 in-window department team member reaches the requisition');

  PERFORM assert_scope('11110000-0000-0000-0000-000000000006', 'requisition', v_req, FALSE,
    'A5 unrelated employee in the same department is denied');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000007', 'requisition', v_req, FALSE,
    'A6 employee in another department is denied');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000008', 'requisition', v_req, FALSE,
    'A7 owner of a different requisition is denied');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000009', 'requisition', v_req, FALSE,
    'A8 expired team assignment no longer grants');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000005', 'requisition', v_req, FALSE,
    'A9 interview panellist does not thereby reach the requisition');

  -- The owning manager must not reach the neighbouring requisition.
  PERFORM assert_scope('11110000-0000-0000-0000-000000000001', 'requisition',
    '22220000-0000-0000-0000-000000000002', FALSE,
    'A10 ownership does not extend to another requisition');
END;
$$;

-- ===========================================================================
-- B. Job scope
-- ===========================================================================
DO $$
DECLARE v_job uuid := '33330000-0000-0000-0000-000000000001';
BEGIN
  PERFORM assert_scope('11110000-0000-0000-0000-000000000001', 'job', v_job, TRUE,
    'B1 requisition owner reaches the job it backs');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000002', 'job', v_job, TRUE,
    'B2 named recruiter reaches the job');
  PERFORM assert_scope('11110000-0000-0000-0000-00000000000b', 'job', v_job, TRUE,
    'B3 department team member reaches the job');

  PERFORM assert_scope('11110000-0000-0000-0000-000000000006', 'job', v_job, FALSE,
    'B4 unrelated same-department employee is denied the job');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000007', 'job', v_job, FALSE,
    'B5 other-department employee is denied the job');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000008', 'job', v_job, FALSE,
    'B6 other requisition owner is denied the job');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000001', 'job',
    '33330000-0000-0000-0000-000000000002', FALSE,
    'B7 ownership does not extend to another department''s job');
END;
$$;

-- ===========================================================================
-- C. Application scope
-- ===========================================================================
DO $$
DECLARE v_app uuid := '55550000-0000-0000-0000-000000000001';
BEGIN
  PERFORM assert_scope('11110000-0000-0000-0000-000000000001', 'application', v_app, TRUE,
    'C1 requisition owner reaches the application');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000004', 'application', v_app, TRUE,
    'C2 actively assigned reviewer reaches the application');
  -- Interviewer scope deliberately does NOT widen to the application. A
  -- panellist works from the interview and its scorecard; the admin interview
  -- routes only ever ask for 'interview' scope, so this stays consistent. If
  -- the scope function is ever changed to resolve an interview from the
  -- application branch, this assertion is what catches the privilege
  -- widening.
  PERFORM assert_scope('11110000-0000-0000-0000-000000000005', 'application', v_app, FALSE,
    'C3 interview panellist does not thereby reach the whole application');
  PERFORM assert_scope('11110000-0000-0000-0000-00000000000b', 'application', v_app, TRUE,
    'C4 department team member reaches the application');

  PERFORM assert_scope('11110000-0000-0000-0000-00000000000a', 'application', v_app, FALSE,
    'C5 an ended application assignment no longer grants');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000006', 'application', v_app, FALSE,
    'C6 unrelated same-department employee is denied the application');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000007', 'application', v_app, FALSE,
    'C7 other-department employee is denied the application');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000008', 'application', v_app, FALSE,
    'C8 other requisition owner is denied the application');

  -- Reviewing one application must not open the neighbouring one.
  PERFORM assert_scope('11110000-0000-0000-0000-000000000004', 'application',
    '55550000-0000-0000-0000-000000000002', FALSE,
    'C9 assignment does not extend to another application');
END;
$$;

-- ===========================================================================
-- D. Interview scope
-- ===========================================================================
DO $$
DECLARE v_interview uuid := '66660000-0000-0000-0000-000000000001';
BEGIN
  PERFORM assert_scope('11110000-0000-0000-0000-000000000005', 'interview', v_interview, TRUE,
    'D1 panellist reaches their own interview');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000001', 'interview', v_interview, TRUE,
    'D2 requisition owner reaches the interview');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000004', 'interview', v_interview, TRUE,
    'D3 assigned reviewer reaches the interview on their application');

  PERFORM assert_scope('11110000-0000-0000-0000-000000000006', 'interview', v_interview, FALSE,
    'D4 unrelated same-department employee is denied the interview');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000007', 'interview', v_interview, FALSE,
    'D5 other-department employee is denied the interview');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000008', 'interview', v_interview, FALSE,
    'D6 other requisition owner is denied the interview');
  PERFORM assert_scope('11110000-0000-0000-0000-00000000000a', 'interview', v_interview, FALSE,
    'D7 former reviewer is denied the interview');
END;
$$;

-- ===========================================================================
-- E. Assessment and offer scope
--
-- Offers carry compensation, so an over-wide scope path here leaks salary.
-- ===========================================================================
DO $$
DECLARE v_assessment uuid := '77770000-0000-0000-0000-000000000001';
        v_offer uuid := '88880000-0000-0000-0000-000000000001';
BEGIN
  PERFORM assert_scope('11110000-0000-0000-0000-000000000001', 'assessment', v_assessment, TRUE,
    'E1 requisition owner reaches the assessment');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000004', 'assessment', v_assessment, TRUE,
    'E2 assigned reviewer reaches the assessment');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000007', 'assessment', v_assessment, FALSE,
    'E3 other-department employee is denied the assessment');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000006', 'assessment', v_assessment, FALSE,
    'E4 unrelated same-department employee is denied the assessment');

  PERFORM assert_scope('11110000-0000-0000-0000-000000000001', 'offer', v_offer, TRUE,
    'E5 requisition owner reaches the offer');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000002', 'offer', v_offer, TRUE,
    'E6 named recruiter reaches the offer');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000006', 'offer', v_offer, FALSE,
    'E7 unrelated same-department employee is denied the offer');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000007', 'offer', v_offer, FALSE,
    'E8 other-department employee is denied the offer');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000008', 'offer', v_offer, FALSE,
    'E9 other requisition owner is denied the offer');
  PERFORM assert_scope('11110000-0000-0000-0000-00000000000a', 'offer', v_offer, FALSE,
    'E10 former reviewer is denied the offer');
END;
$$;

-- ===========================================================================
-- F. Candidate scope
--
-- A candidate is reachable only through an application the employee can
-- already reach. This is the widest surface in the model, because a candidate
-- record aggregates every application that person ever made.
-- ===========================================================================
DO $$
DECLARE v_candidate uuid := '44440000-0000-0000-0000-000000000001';
        v_other_candidate uuid := '44440000-0000-0000-0000-000000000002';
BEGIN
  PERFORM assert_scope('11110000-0000-0000-0000-000000000001', 'candidate', v_candidate, TRUE,
    'F1 requisition owner reaches the candidate who applied to their role');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000004', 'candidate', v_candidate, TRUE,
    'F2 assigned reviewer reaches the candidate');
  -- Follows from C3: candidate scope is defined as "reaches some application
  -- of theirs", so a panellist who cannot reach the application cannot reach
  -- the candidate profile either. That is the intended least privilege, and
  -- the admin candidate routes require 'candidate' scope accordingly.
  PERFORM assert_scope('11110000-0000-0000-0000-000000000005', 'candidate', v_candidate, FALSE,
    'F3 interview panellist does not reach the full candidate profile');

  PERFORM assert_scope('11110000-0000-0000-0000-000000000006', 'candidate', v_candidate, FALSE,
    'F4 unrelated same-department employee is denied the candidate');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000007', 'candidate', v_candidate, FALSE,
    'F5 other-department employee is denied the candidate');
  PERFORM assert_scope('11110000-0000-0000-0000-00000000000a', 'candidate', v_candidate, FALSE,
    'F6 former reviewer is denied the candidate');

  -- Reaching one candidate must not reach the other department's candidate.
  PERFORM assert_scope('11110000-0000-0000-0000-000000000001', 'candidate', v_other_candidate, FALSE,
    'F7 reaching one candidate does not reach another');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000008', 'candidate', v_candidate, FALSE,
    'F8 other requisition owner is denied the candidate');
END;
$$;

-- ===========================================================================
-- G. Fail-closed behaviour
--
-- Everything the function cannot positively identify must be a denial. These
-- are the cases a caller controls, so they are the ones an attacker probes.
-- ===========================================================================
DO $$
BEGIN
  PERFORM assert_scope('11110000-0000-0000-0000-000000000001', 'unknown_entity',
    '22220000-0000-0000-0000-000000000001', FALSE,
    'G1 an unrecognised entity type is denied');

  PERFORM assert_scope('11110000-0000-0000-0000-000000000001', 'requisition',
    '99990000-0000-0000-0000-00000000dead', FALSE,
    'G2 a nonexistent requisition is denied');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000001', 'application',
    '99990000-0000-0000-0000-00000000dead', FALSE,
    'G3 a nonexistent application is denied');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000001', 'offer',
    '99990000-0000-0000-0000-00000000dead', FALSE,
    'G4 a nonexistent offer is denied');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000001', 'candidate',
    '99990000-0000-0000-0000-00000000dead', FALSE,
    'G5 a nonexistent candidate is denied');

  -- An unknown employee id is the shape an anonymous or unlinked caller takes
  -- by the time it reaches this function.
  PERFORM assert_scope('99990000-0000-0000-0000-00000000beef', 'requisition',
    '22220000-0000-0000-0000-000000000001', FALSE,
    'G6 an unknown employee is denied');
  PERFORM assert_scope('99990000-0000-0000-0000-00000000beef', 'candidate',
    '44440000-0000-0000-0000-000000000001', FALSE,
    'G7 an unknown employee is denied the candidate');

  PERFORM assert_scope(NULL, 'requisition', '22220000-0000-0000-0000-000000000001', FALSE,
    'G8 a null employee is denied');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000001', 'requisition', NULL, FALSE,
    'G9 a null entity id is denied');
  PERFORM assert_scope('11110000-0000-0000-0000-000000000001', NULL,
    '22220000-0000-0000-0000-000000000001', FALSE,
    'G10 a null entity type is denied');
END;
$$;

-- ===========================================================================
-- H. Execution privilege
--
-- The scope function is SECURITY DEFINER. If a browser role could call it
-- directly, a caller could enumerate which records exist by probing it.
-- ===========================================================================
DO $$
BEGIN
  PERFORM assert_eq(
    has_function_privilege('anon', 'public.recruitment_employee_has_scope(uuid, text, uuid)', 'EXECUTE'),
    FALSE, 'H1 anon cannot execute the scope function');
  PERFORM assert_eq(
    has_function_privilege('authenticated', 'public.recruitment_employee_has_scope(uuid, text, uuid)', 'EXECUTE'),
    FALSE, 'H2 authenticated cannot execute the scope function');
  PERFORM assert_eq(
    has_function_privilege('service_role', 'public.recruitment_employee_has_scope(uuid, text, uuid)', 'EXECUTE'),
    TRUE, 'H3 service_role can execute the scope function');
END;
$$;

DO $$ BEGIN RAISE NOTICE 'TESTS PASSED'; END $$;
