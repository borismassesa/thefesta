-- Behavioural suite for the OpusPass admission counter (migration
-- 20260802210000). Run via supabase/tests/run-admission-counters-tests.sh,
-- which also drives the concurrency races this file cannot express.
--
-- Numbered sections T1..T13 map to the agreed check-in test list; lettered
-- sections cover backfill, the allowance trigger, the audit ledger, the amend
-- RPC and the deprecated compatibility wrapper.
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

-- ===========================================================================
-- A. Backfill correctness (ran as part of the migration itself)
-- ===========================================================================
DO $$
DECLARE r guest_invitations;
BEGIN
  SELECT * INTO r FROM guest_invitations WHERE id = '44444444-0000-0000-0000-000000000001';
  PERFORM assert_eq(r.entry_allowance, 2, 'A1 never-scanned party of 2 -> allowance 2');
  PERFORM assert_eq(r.checked_in_count, 0, 'A1 never-scanned -> count 0');

  SELECT * INTO r FROM guest_invitations WHERE id = '44444444-0000-0000-0000-000000000002';
  PERFORM assert_eq(r.entry_allowance, 4, 'A2 RSVP 4 -> allowance 4');
  PERFORM assert_eq(r.checked_in_count, 2, 'A2 only 2 arrived -> count 2, NOT full party');

  SELECT * INTO r FROM guest_invitations WHERE id = '44444444-0000-0000-0000-000000000003';
  PERFORM assert_eq(r.checked_in_count, 3, 'A3 pre-party_size-column row falls back to party_size');

  SELECT * INTO r FROM guest_invitations WHERE id = '44444444-0000-0000-0000-000000000004';
  PERFORM assert_eq(r.entry_allowance, 1, 'A4 pathological party_size 0 floors allowance to 1');
END $$;

-- The deprecated mirror must come out of the backfill agreeing with the
-- counter, or every reader still on it disagrees with the door from day one.
DO $$
DECLARE bad INT;
BEGIN
  SELECT count(*)::INT INTO bad FROM guest_invitations
   WHERE checked_in_at IS NOT NULL
     AND checked_in_party_size IS DISTINCT FROM checked_in_count;
  PERFORM assert_eq(bad, 0, 'A5 backfill leaves the deprecated mirror equal to the counter');

  PERFORM assert_eq((SELECT checked_in_party_size FROM guest_invitations
                     WHERE id = '44444444-0000-0000-0000-000000000003'),
                    3, 'A6 a pre-mirror legacy row gets its mirror populated');
END $$;

-- ===========================================================================
-- B. Fresh fixtures for behavioural tests
-- ===========================================================================
INSERT INTO guest_contacts (id, user_id, full_name) VALUES
  ('33333333-0000-0000-0000-000000000010', '11111111-1111-1111-1111-111111111111', 'Single Guest'),
  ('33333333-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111', 'The Couple'),
  ('33333333-0000-0000-0000-000000000012', '11111111-1111-1111-1111-111111111111', 'Family Of Four'),
  ('33333333-0000-0000-0000-000000000013', '11111111-1111-1111-1111-111111111111', 'Declined Guest'),
  ('33333333-0000-0000-0000-000000000014', '11111111-1111-1111-1111-111111111111', 'Retry Guest'),
  ('33333333-0000-0000-0000-000000000015', '11111111-1111-1111-1111-111111111111', 'Shrinking Party');

INSERT INTO guest_invitations (id, user_id, guest_contact_id, event_id, rsvp_status, party_size) VALUES
  ('44444444-0000-0000-0000-000000000010', '11111111-1111-1111-1111-111111111111',
   '33333333-0000-0000-0000-000000000010', '22222222-2222-2222-2222-222222222222', 'attending', 1),
  ('44444444-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111',
   '33333333-0000-0000-0000-000000000011', '22222222-2222-2222-2222-222222222222', 'attending', 2),
  ('44444444-0000-0000-0000-000000000012', '11111111-1111-1111-1111-111111111111',
   '33333333-0000-0000-0000-000000000012', '22222222-2222-2222-2222-222222222222', 'attending', 4),
  ('44444444-0000-0000-0000-000000000013', '11111111-1111-1111-1111-111111111111',
   '33333333-0000-0000-0000-000000000013', '22222222-2222-2222-2222-222222222222', 'declined', 1),
  ('44444444-0000-0000-0000-000000000014', '11111111-1111-1111-1111-111111111111',
   '33333333-0000-0000-0000-000000000014', '22222222-2222-2222-2222-222222222222', 'attending', 2),
  ('44444444-0000-0000-0000-000000000015', '11111111-1111-1111-1111-111111111111',
   '33333333-0000-0000-0000-000000000015', '22222222-2222-2222-2222-222222222222', 'attending', 4);

-- The sync trigger must have derived allowance from party_size on INSERT.
DO $$
BEGIN
  PERFORM assert_eq((SELECT entry_allowance FROM guest_invitations
                     WHERE id = '44444444-0000-0000-0000-000000000012'),
                    4, 'B0 trigger derives entry_allowance from party_size on insert');
END $$;

-- ===========================================================================
-- 1. One guest admitted once
-- ===========================================================================
DO $$
DECLARE res RECORD; r guest_invitations;
BEGIN
  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000010', '22222222-2222-2222-2222-222222222222',
    NULL, 'Asha (Main Gate)', 'Main Gate', gen_random_uuid());
  PERFORM assert_eq(res.result, 'admitted', 'T1 single guest admitted');
  PERFORM assert_eq(res.admitted_now, 1, 'T1 admitted_now = 1');
  PERFORM assert_eq(res.total_admitted, 1, 'T1 total = 1');

  SELECT * INTO r FROM guest_invitations WHERE id = '44444444-0000-0000-0000-000000000010';
  PERFORM assert_eq(r.checked_in_count, 1, 'T1 counter persisted');
  PERFORM assert_eq(r.checked_in_by, 'Asha (Main Gate)', 'T1 audit label persisted');

  -- second scan of a fully used single pass
  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000010', '22222222-2222-2222-2222-222222222222',
    NULL, 'Asha', 'Main Gate', gen_random_uuid());
  PERFORM assert_eq(res.result, 'exhausted', 'T1 re-scan reads as exhausted (door shows duplicate)');
  PERFORM assert_eq(res.total_admitted, 1, 'T1 re-scan did not increment');
END $$;

-- ===========================================================================
-- 2. A couple admitted together (one scan, whole allowance)
-- ===========================================================================
DO $$
DECLARE res RECORD;
BEGIN
  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000011', '22222222-2222-2222-2222-222222222222',
    NULL, 'Asha', 'Main Gate', gen_random_uuid());
  PERFORM assert_eq(res.result, 'admitted', 'T2 couple admitted');
  PERFORM assert_eq(res.admitted_now, 2, 'T2 both admitted on one scan');
  PERFORM assert_eq(res.total_admitted, 2, 'T2 total = 2');
END $$;

-- ===========================================================================
-- 3. Group partially admitted across multiple scans
-- ===========================================================================
DO $$
DECLARE res RECORD; r guest_invitations;
BEGIN
  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000012', '22222222-2222-2222-2222-222222222222',
    2, 'Asha', 'Main Gate', gen_random_uuid());
  PERFORM assert_eq(res.result, 'admitted', 'T3 first 2 of 4 admitted');
  PERFORM assert_eq(res.total_admitted, 2, 'T3 2 of 4');
  PERFORM assert_eq(res.allowance, 4, 'T3 allowance still 4');

  SELECT * INTO r FROM guest_invitations WHERE id = '44444444-0000-0000-0000-000000000012';

  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000012', '22222222-2222-2222-2222-222222222222',
    1, 'Juma', 'Side Gate', gen_random_uuid());
  PERFORM assert_eq(res.total_admitted, 3, 'T3 third arrival at a different door');

  -- NULL count now means "the rest", not "the full party"
  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000012', '22222222-2222-2222-2222-222222222222',
    NULL, 'Juma', 'Side Gate', gen_random_uuid());
  PERFORM assert_eq(res.admitted_now, 1, 'T3 NULL admits only the remainder');
  PERFORM assert_eq(res.total_admitted, 4, 'T3 party complete');

  SELECT * INTO r FROM guest_invitations WHERE id = '44444444-0000-0000-0000-000000000012';
  PERFORM assert_eq(r.checked_in_party_size, 4, 'T3 deprecated mirror tracks the counter');
END $$;

-- ===========================================================================
-- 4. Admission count cannot exceed allowance
-- ===========================================================================
DO $$
DECLARE res RECORD;
BEGIN
  -- couple of 2, already fully admitted in T2
  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000011', '22222222-2222-2222-2222-222222222222',
    1, 'Asha', 'Main Gate', gen_random_uuid());
  PERFORM assert_eq(res.result, 'exhausted', 'T4 no entries left');
  PERFORM assert_eq(res.total_admitted, 2, 'T4 counter unchanged');

  -- explicit over-count on a fresh pass is REJECTED, not clamped
  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000015', '22222222-2222-2222-2222-222222222222',
    99, 'Asha', 'Main Gate', gen_random_uuid());
  PERFORM assert_eq(res.result, 'exhausted', 'T4 over-count rejected outright');
  PERFORM assert_eq(res.total_admitted, 0, 'T4 over-count admitted nobody');

  -- zero / negative are rejected too
  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000015', '22222222-2222-2222-2222-222222222222',
    0, 'Asha', 'Main Gate', gen_random_uuid());
  PERFORM assert_eq(res.result, 'exhausted', 'T4 zero-count admits nobody');
  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000015', '22222222-2222-2222-2222-222222222222',
    -3, 'Asha', 'Main Gate', gen_random_uuid());
  PERFORM assert_eq(res.result, 'exhausted', 'T4 negative count admits nobody');
  PERFORM assert_eq((SELECT checked_in_count FROM guest_invitations
                     WHERE id = '44444444-0000-0000-0000-000000000015'),
                    0, 'T4 counter never went negative');
END $$;

-- ===========================================================================
-- 6. Cancelled RSVP cannot be admitted
-- ===========================================================================
DO $$
DECLARE res RECORD;
BEGIN
  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000013', '22222222-2222-2222-2222-222222222222',
    NULL, 'Asha', 'Main Gate', gen_random_uuid());
  PERFORM assert_eq(res.result, 'not_attending', 'T6 declined RSVP refused');
  PERFORM assert_eq(res.total_admitted, 0, 'T6 nobody admitted');

  -- revocation mid-event: couple flips an admitted guest off the list
  UPDATE guest_invitations SET rsvp_status = 'declined'
   WHERE id = '44444444-0000-0000-0000-000000000015';
  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000015', '22222222-2222-2222-2222-222222222222',
    NULL, 'Asha', 'Main Gate', gen_random_uuid());
  PERFORM assert_eq(res.result, 'not_attending', 'T6 revoked after issue is refused');
  UPDATE guest_invitations SET rsvp_status = 'attending'
   WHERE id = '44444444-0000-0000-0000-000000000015';
END $$;

-- ===========================================================================
-- 7. Wrong-event scan is rejected
-- ===========================================================================
DO $$
DECLARE res RECORD;
BEGIN
  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000015', '22222222-2222-2222-2222-222222222223',
    NULL, 'Asha', 'Main Gate', gen_random_uuid());
  PERFORM assert_eq(res.result, 'wrong_event', 'T7 pass for another event refused');
  PERFORM assert_eq(res.admitted_now, 0, 'T7 nobody admitted');

  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222',
    NULL, 'Asha', 'Main Gate', gen_random_uuid());
  PERFORM assert_eq(res.result, 'not_found', 'T7 unknown invitation refused');
END $$;

-- ===========================================================================
-- 12. Scanner retries do not double-increment
-- ===========================================================================
DO $$
DECLARE res RECORD; req UUID := gen_random_uuid();
BEGIN
  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000014', '22222222-2222-2222-2222-222222222222',
    2, 'Asha', 'Main Gate', req);
  PERFORM assert_eq(res.result, 'admitted', 'T12 first delivery admits');
  PERFORM assert_eq(res.is_replay, FALSE, 'T12 first delivery is not a replay');
  PERFORM assert_eq(res.total_admitted, 2, 'T12 party of 2 in');

  -- same request id: the scanner never saw the response and retried
  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000014', '22222222-2222-2222-2222-222222222222',
    2, 'Asha', 'Main Gate', req);
  PERFORM assert_eq(res.result, 'admitted', 'T12 retry replays the ORIGINAL outcome');
  PERFORM assert_eq(res.is_replay, TRUE, 'T12 retry flagged as replay');
  PERFORM assert_eq(res.admitted_now, 2, 'T12 replay echoes the original headcount');
  PERFORM assert_eq(res.total_admitted, 2, 'T12 counter NOT double-incremented');

  PERFORM assert_eq((SELECT count(*)::INT FROM checkin_scan_events WHERE request_id = req),
                    1, 'T12 one audit row per request id');
  PERFORM assert_eq((SELECT result FROM checkin_scan_events WHERE request_id = req),
                    'admitted', 'T12 audit row records the outcome');
END $$;

-- A rejected attempt is also recorded, and its retry replays the rejection.
DO $$
DECLARE res RECORD; req UUID := gen_random_uuid();
BEGIN
  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000013', '22222222-2222-2222-2222-222222222222',
    NULL, 'Asha', 'Main Gate', req);
  PERFORM assert_eq(res.result, 'not_attending', 'T12b rejection recorded');
  PERFORM assert_eq((SELECT result FROM checkin_scan_events WHERE request_id = req),
                    'not_attending', 'T12b audit row keeps the reason');

  -- Retrying a REJECTED scan must replay the rejection, never upgrade to a
  -- success just because it is a replay.
  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000013', '22222222-2222-2222-2222-222222222222',
    NULL, 'Asha', 'Main Gate', req);
  PERFORM assert_eq(res.result, 'not_attending', 'T12b retry replays the rejection');
  PERFORM assert_eq(res.is_replay, TRUE, 'T12b retry flagged as replay');
  PERFORM assert_eq(res.admitted_now, 0, 'T12b replayed rejection admits nobody');
END $$;

-- ===========================================================================
-- 13. Existing checked_in_at consumers remain compatible
-- ===========================================================================
DO $$
DECLARE r guest_invitations; first_at TIMESTAMPTZ; res RECORD;
BEGIN
  -- dashboards test `checked_in_at IS NOT NULL` for "has arrived"
  PERFORM assert_eq((SELECT count(*)::INT FROM guest_invitations
                     WHERE event_id = '22222222-2222-2222-2222-222222222222'
                       AND checked_in_at IS NOT NULL AND checked_in_count = 0),
                    0, 'T13 no row is timestamped without an admission');
  PERFORM assert_eq((SELECT count(*)::INT FROM guest_invitations
                     WHERE event_id = '22222222-2222-2222-2222-222222222222'
                       AND checked_in_at IS NULL AND checked_in_count > 0),
                    0, 'T13 no row has an admission without a timestamp');

  -- checked_in_at must be the FIRST admission, unmoved by later partials
  SELECT checked_in_at INTO first_at FROM guest_invitations
   WHERE id = '44444444-0000-0000-0000-000000000015';
  PERFORM assert_eq(first_at, NULL::TIMESTAMPTZ, 'T13 not yet arrived');

  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000015', '22222222-2222-2222-2222-222222222222',
    1, 'Asha', 'Main Gate', gen_random_uuid());
  SELECT checked_in_at INTO first_at FROM guest_invitations
   WHERE id = '44444444-0000-0000-0000-000000000015';

  PERFORM pg_sleep(0.05);
  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000015', '22222222-2222-2222-2222-222222222222',
    1, 'Juma', 'Side Gate', gen_random_uuid());

  SELECT * INTO r FROM guest_invitations WHERE id = '44444444-0000-0000-0000-000000000015';
  PERFORM assert_eq(r.checked_in_at, first_at, 'T13 checked_in_at pinned to first admission');
  PERFORM assert_eq(r.checked_in_count, 2, 'T13 counter advanced');
  PERFORM assert_eq(r.checked_in_party_size, 2, 'T13 deprecated mirror still readable');
  PERFORM assert_eq(r.checked_in_door, 'Main Gate', 'T13 door frozen at the FIRST admission');
END $$;

-- ===========================================================================
-- C. Allowance floor: an RSVP edit must not strand people already inside
-- ===========================================================================
DO $$
DECLARE r guest_invitations;
BEGIN
  -- 2 of 4 already admitted; guest edits their RSVP down to 1
  UPDATE guest_invitations SET party_size = 1
   WHERE id = '44444444-0000-0000-0000-000000000015';
  SELECT * INTO r FROM guest_invitations WHERE id = '44444444-0000-0000-0000-000000000015';
  PERFORM assert_eq(r.entry_allowance, 2, 'C1 allowance floors at people already admitted');
  PERFORM assert_eq(r.checked_in_count, 2, 'C1 admitted count untouched by RSVP edit');

  -- growing the party raises the allowance again
  UPDATE guest_invitations SET party_size = 5
   WHERE id = '44444444-0000-0000-0000-000000000015';
  SELECT * INTO r FROM guest_invitations WHERE id = '44444444-0000-0000-0000-000000000015';
  PERFORM assert_eq(r.entry_allowance, 5, 'C2 allowance follows party_size upward');

  -- an explicit allowance override is not overwritten by the trigger
  UPDATE guest_invitations SET entry_allowance = 8
   WHERE id = '44444444-0000-0000-0000-000000000015';
  SELECT * INTO r FROM guest_invitations WHERE id = '44444444-0000-0000-0000-000000000015';
  PERFORM assert_eq(r.entry_allowance, 8, 'C3 explicit override wins (VIP admits 8)');
END $$;

-- ===========================================================================
-- D. Deprecated wrapper keeps its old contract
-- ===========================================================================
INSERT INTO guest_contacts (id, user_id, full_name) VALUES
  ('33333333-0000-0000-0000-000000000020', '11111111-1111-1111-1111-111111111111', 'Legacy Scanner Guest');
INSERT INTO guest_invitations (id, user_id, guest_contact_id, event_id, rsvp_status, party_size) VALUES
  ('44444444-0000-0000-0000-000000000020', '11111111-1111-1111-1111-111111111111',
   '33333333-0000-0000-0000-000000000020', '22222222-2222-2222-2222-222222222222', 'attending', 2);

DO $$
DECLARE row1 guest_invitations; row2 guest_invitations;
BEGIN
  -- Party of 2. The wrapper now admits ONE per call by design, so a legacy
  -- client can never move the counter by more than 1 in a single call.
  row1 := checkin_guest_invitation('44444444-0000-0000-0000-000000000020', 'Old Scanner', 'Gate 1');
  PERFORM assert_eq(row1.checked_in_count, 1, 'D1 3-arg legacy call admits exactly one');
  PERFORM assert_eq((row1.checked_in_at IS NOT NULL), TRUE, 'D1 legacy call returns the row');

  row2 := checkin_guest_invitation('44444444-0000-0000-0000-000000000020', 'Old Scanner', 'Gate 1');
  PERFORM assert_eq(row2.checked_in_count, 2, 'D2 second legacy call admits the second seat');

  row2 := checkin_guest_invitation('44444444-0000-0000-0000-000000000020', 'Old Scanner', 'Gate 1');
  PERFORM assert_eq((row2.id IS NULL), TRUE, 'D3 exhausted legacy call returns a NULL row as before');
  PERFORM assert_eq((SELECT checked_in_count FROM guest_invitations
                     WHERE id = '44444444-0000-0000-0000-000000000020'),
                    2, 'D3 legacy duplicate did not increment');
END $$;

-- ===========================================================================
-- E. Constraints hold against direct writes
-- ===========================================================================
DO $$
BEGIN
  -- Any unauthorised counter write is now refused before the CHECK is even
  -- reached, so the constraint itself is exercised through the authorised
  -- path: the bound must hold even for a writer that is allowed to write.
  BEGIN
    PERFORM set_config('opuspass.checkin_writer', 'on', TRUE);
    UPDATE guest_invitations SET checked_in_count = 99
     WHERE id = '44444444-0000-0000-0000-000000000010';
    RAISE EXCEPTION 'FAIL: E1 counter above allowance was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'pass: E1 checked_in_count <= entry_allowance enforced';
  END;

  -- A negative counter is now stopped one layer earlier: lowering the count
  -- at all outside the amend RPC is refused before the CHECK is reached.
  BEGIN
    UPDATE guest_invitations SET checked_in_count = -1
     WHERE id = '44444444-0000-0000-0000-000000000010';
    RAISE EXCEPTION 'FAIL: E2 negative counter was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'pass: E2 negative counter refused by the writer guard';
  END;

  -- and the CHECK still backs it up on an INSERT, where no OLD row exists
  BEGIN
    INSERT INTO guest_invitations (user_id, guest_contact_id, event_id, rsvp_status,
                                   party_size, checked_in_count)
    VALUES ('11111111-1111-1111-1111-111111111111',
            '33333333-0000-0000-0000-000000000001',
            '22222222-2222-2222-2222-222222222223', 'attending', 1, -1);
    RAISE EXCEPTION 'FAIL: E3 negative counter accepted on insert';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'pass: E3 checked_in_count >= 0 enforced on insert';
  END;
END $$;

-- ===========================================================================
-- F. SECURITY DEFINER lockdown
-- ===========================================================================
DO $$
BEGIN
  PERFORM assert_eq(
    has_function_privilege('anon', 'checkin_admit_guest(uuid,uuid,int,text,text,uuid,text)', 'EXECUTE'),
    FALSE, 'F1 anon cannot execute checkin_admit_guest');
  PERFORM assert_eq(
    has_function_privilege('authenticated', 'checkin_admit_guest(uuid,uuid,int,text,text,uuid,text)', 'EXECUTE'),
    FALSE, 'F2 authenticated cannot execute checkin_admit_guest');
  PERFORM assert_eq(
    has_function_privilege('service_role', 'checkin_admit_guest(uuid,uuid,int,text,text,uuid,text)', 'EXECUTE'),
    TRUE, 'F3 service_role can execute checkin_admit_guest');
  PERFORM assert_eq(
    has_function_privilege('anon', 'checkin_guest_invitation(uuid,text,text,int)', 'EXECUTE'),
    FALSE, 'F4 anon cannot execute the deprecated wrapper');
  PERFORM assert_eq(
    (SELECT relrowsecurity FROM pg_class WHERE relname = 'checkin_scan_events'),
    TRUE, 'F5 RLS enabled on checkin_scan_events');
END $$;

SELECT 'ALL SEQUENTIAL TESTS PASSED' AS status;



-- Review-round coverage: idempotency scope, the trigger transition matrix,
-- frozen first-entry metadata, the amend RPC, and the legacy wrapper.

INSERT INTO guest_contacts (id, user_id, full_name) VALUES
  ('33333333-0000-0000-0000-000000000030', '11111111-1111-1111-1111-111111111111', 'Matrix Guest'),
  ('33333333-0000-0000-0000-000000000031', '11111111-1111-1111-1111-111111111111', 'Amend Guest'),
  ('33333333-0000-0000-0000-000000000032', '11111111-1111-1111-1111-111111111111', 'Conflict Guest'),
  ('33333333-0000-0000-0000-000000000033', '11111111-1111-1111-1111-111111111111', 'Legacy Party'),
  ('33333333-0000-0000-0000-000000000034', '11111111-1111-1111-1111-111111111111', 'Two Door Party');

INSERT INTO guest_invitations (id, user_id, guest_contact_id, event_id, rsvp_status, party_size) VALUES
  ('44444444-0000-0000-0000-000000000030', '11111111-1111-1111-1111-111111111111',
   '33333333-0000-0000-0000-000000000030', '22222222-2222-2222-2222-222222222222', 'attending', 4),
  ('44444444-0000-0000-0000-000000000031', '11111111-1111-1111-1111-111111111111',
   '33333333-0000-0000-0000-000000000031', '22222222-2222-2222-2222-222222222222', 'attending', 4),
  ('44444444-0000-0000-0000-000000000032', '11111111-1111-1111-1111-111111111111',
   '33333333-0000-0000-0000-000000000032', '22222222-2222-2222-2222-222222222222', 'attending', 2),
  ('44444444-0000-0000-0000-000000000033', '11111111-1111-1111-1111-111111111111',
   '33333333-0000-0000-0000-000000000033', '22222222-2222-2222-2222-222222222222', 'attending', 4),
  ('44444444-0000-0000-0000-000000000034', '11111111-1111-1111-1111-111111111111',
   '33333333-0000-0000-0000-000000000034', '22222222-2222-2222-2222-222222222222', 'attending', 4);

-- ===========================================================================
-- G. Idempotency scope (review area 2)
-- ===========================================================================
DO $$
DECLARE res RECORD; req UUID := gen_random_uuid();
BEGIN
  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000032', '22222222-2222-2222-2222-222222222222',
    2, 'Asha', 'Main Gate', req);
  PERFORM assert_eq(res.result, 'admitted', 'G1 claim admitted');

  -- Same id, DIFFERENT invitation: must never replay another guest's success.
  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000030', '22222222-2222-2222-2222-222222222222',
    1, 'Asha', 'Main Gate', req);
  PERFORM assert_eq(res.result, 'request_conflict', 'G2 id replayed on another invitation is refused');
  PERFORM assert_eq(res.is_replay, FALSE, 'G2 conflict is not reported as a replay');
  PERFORM assert_eq((SELECT checked_in_count FROM guest_invitations
                     WHERE id = '44444444-0000-0000-0000-000000000030'),
                    0, 'G2 the other guest was not admitted');

  -- Same id, DIFFERENT event.
  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000032', '22222222-2222-2222-2222-222222222223',
    1, 'Asha', 'Main Gate', req);
  PERFORM assert_eq(res.result, 'wrong_event', 'G3 wrong event refused before any replay');

  -- The replay reproduces the ORIGINAL totals, not whatever the row says now.
  PERFORM assert_eq((SELECT total_after FROM checkin_scan_events WHERE request_id = req),
                    2, 'G4 original resulting total stored');
  PERFORM assert_eq((SELECT allowance_after FROM checkin_scan_events WHERE request_id = req),
                    2, 'G4 original allowance stored');

  UPDATE guest_invitations SET entry_allowance = 6
   WHERE id = '44444444-0000-0000-0000-000000000032';

  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000032', '22222222-2222-2222-2222-222222222222',
    2, 'Asha', 'Main Gate', req);
  PERFORM assert_eq(res.is_replay, TRUE, 'G5 still a replay after the row moved on');
  PERFORM assert_eq(res.total_admitted, 2, 'G5 replay returns the ORIGINAL total');
  PERFORM assert_eq(res.allowance, 2, 'G5 replay returns the ORIGINAL allowance');
  PERFORM assert_eq((SELECT checked_in_count FROM guest_invitations
                     WHERE id = '44444444-0000-0000-0000-000000000032'),
                    2, 'G5 replay did not re-admit against the raised allowance');
END $$;

-- A rejected request cannot later become an admission under the same id.
DO $$
DECLARE res RECORD; req UUID := gen_random_uuid();
BEGIN
  UPDATE guest_invitations SET rsvp_status = 'declined'
   WHERE id = '44444444-0000-0000-0000-000000000030';
  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000030', '22222222-2222-2222-2222-222222222222',
    1, 'Asha', 'Main Gate', req);
  PERFORM assert_eq(res.result, 'not_attending', 'G6 rejected while declined');

  UPDATE guest_invitations SET rsvp_status = 'attending'
   WHERE id = '44444444-0000-0000-0000-000000000030';
  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000030', '22222222-2222-2222-2222-222222222222',
    1, 'Asha', 'Main Gate', req);
  PERFORM assert_eq(res.result, 'not_attending', 'G7 same id stays rejected after RSVP is restored');
  PERFORM assert_eq(res.is_replay, TRUE, 'G7 reported as a replay');
  PERFORM assert_eq((SELECT checked_in_count FROM guest_invitations
                     WHERE id = '44444444-0000-0000-0000-000000000030'),
                    0, 'G7 nobody admitted');
END $$;

-- ===========================================================================
-- H. Trigger transition matrix (review area 3)
-- ===========================================================================
DO $$
DECLARE r guest_invitations; res RECORD;
BEGIN
  -- 2 of 4 admitted
  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000031', '22222222-2222-2222-2222-222222222222',
    2, 'Asha', 'Main Gate', gen_random_uuid());
  PERFORM assert_eq(res.total_admitted, 2, 'H0 2 of 4 in');

  -- increase allowance: allowed
  UPDATE guest_invitations SET entry_allowance = 6
   WHERE id = '44444444-0000-0000-0000-000000000031';
  PERFORM assert_eq((SELECT entry_allowance FROM guest_invitations
                     WHERE id = '44444444-0000-0000-0000-000000000031'),
                    6, 'H1 increase allowance allowed');

  -- reduce allowance but still above the count: allowed
  UPDATE guest_invitations SET entry_allowance = 3
   WHERE id = '44444444-0000-0000-0000-000000000031';
  PERFORM assert_eq((SELECT entry_allowance FROM guest_invitations
                     WHERE id = '44444444-0000-0000-0000-000000000031'),
                    3, 'H2 reduce allowance above count allowed');

  -- explicit reduction BELOW the count: rejected loudly, not silently floored
  BEGIN
    UPDATE guest_invitations SET entry_allowance = 1
     WHERE id = '44444444-0000-0000-0000-000000000031';
    RAISE EXCEPTION 'FAIL: H3 explicit allowance below admitted count was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'pass: H3 explicit allowance below admitted count rejected with a domain error';
  END;

  -- party_size driven reduction below the count: floored AND recorded
  UPDATE guest_invitations SET party_size = 1
   WHERE id = '44444444-0000-0000-0000-000000000031';
  SELECT * INTO r FROM guest_invitations WHERE id = '44444444-0000-0000-0000-000000000031';
  PERFORM assert_eq(r.entry_allowance, 2, 'H4 RSVP edit floors at the headcount already admitted');
  PERFORM assert_eq((SELECT requested_allowance FROM guest_invitation_allowance_events
                     WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000031'
                     ORDER BY created_at DESC LIMIT 1),
                    1, 'H4 audit records the REQUESTED allowance');
  PERFORM assert_eq((SELECT effective_allowance FROM guest_invitation_allowance_events
                     WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000031'
                     ORDER BY created_at DESC LIMIT 1),
                    2, 'H4 audit records the EFFECTIVE allowance');

  -- direct increase of the counter beyond the allowance: rejected by the
  -- writer guard before the CHECK is reached. The CHECK itself is exercised
  -- through the authorised path in E1.
  BEGIN
    UPDATE guest_invitations SET checked_in_count = 99
     WHERE id = '44444444-0000-0000-0000-000000000031';
    RAISE EXCEPTION 'FAIL: H5 counter above allowance accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'pass: H5 direct counter increase beyond allowance rejected';
  END;

  -- direct DECREASE outside the amend path: rejected
  BEGIN
    UPDATE guest_invitations SET checked_in_count = 0
     WHERE id = '44444444-0000-0000-0000-000000000031';
    RAISE EXCEPTION 'FAIL: H6 unauthorised counter decrease accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'pass: H6 counter may only be lowered by the amend RPC';
  END;

  -- direct RAISE within the allowance: also rejected. It passes every CHECK
  -- but leaves checked_in_at NULL, producing a row that reads "fully arrived"
  -- to the counter and "never arrived" to the timestamp, after which the next
  -- real scan refuses a guest whose pass was never scanned.
  BEGIN
    UPDATE guest_invitations SET checked_in_count = 3
     WHERE id = '44444444-0000-0000-0000-000000000031';
    RAISE EXCEPTION 'FAIL: H7 unauthorised counter raise accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'pass: H7 counter may only be raised by the admit RPC';
  END;

  PERFORM assert_eq((SELECT count(*)::INT FROM guest_invitations
                     WHERE checked_in_at IS NULL AND checked_in_count > 0),
                    0, 'H8 no row is admitted without a timestamp');
END $$;

-- ===========================================================================
-- H9. An allowance raised above party_size is actually admissible
-- ===========================================================================
-- The deprecated mirror used to be bounded by party_size while the counter is
-- bounded by the allowance. Admitting past party_size then failed on a raw
-- check_violation surfaced at the door as "Check-in failed".
DO $$
DECLARE res RECORD; r guest_invitations;
BEGIN
  UPDATE guest_invitations SET entry_allowance = 6
   WHERE id = '44444444-0000-0000-0000-000000000011';   -- party_size 2

  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000011', '22222222-2222-2222-2222-222222222222',
    3, 'Asha', 'Main Gate', gen_random_uuid());
  PERFORM assert_eq(res.result, 'admitted', 'H9 admits past party_size on a raised allowance');

  SELECT * INTO r FROM guest_invitations WHERE id = '44444444-0000-0000-0000-000000000011';
  PERFORM assert_eq(r.checked_in_count, 5, 'H9 counter passed party_size');
  PERFORM assert_eq(r.checked_in_party_size, 5, 'H9 mirror followed it past party_size');
END $$;

-- ===========================================================================
-- I. First-entry metadata is frozen (review area 4)
-- ===========================================================================
DO $$
DECLARE r guest_invitations; res RECORD; first_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000034', '22222222-2222-2222-2222-222222222222',
    2, 'Asha', 'Main Gate', gen_random_uuid());
  SELECT * INTO r FROM guest_invitations WHERE id = '44444444-0000-0000-0000-000000000034';
  first_at := r.checked_in_at;

  PERFORM pg_sleep(0.05);
  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000034', '22222222-2222-2222-2222-222222222222',
    2, 'Juma', 'Side Gate', gen_random_uuid());

  SELECT * INTO r FROM guest_invitations WHERE id = '44444444-0000-0000-0000-000000000034';
  PERFORM assert_eq(r.checked_in_at, first_at, 'I1 checked_in_at frozen at first admission');
  PERFORM assert_eq(r.checked_in_by, 'Asha', 'I2 checked_in_by frozen at first admission');
  PERFORM assert_eq(r.checked_in_door, 'Main Gate', 'I3 checked_in_door frozen at first admission');
  PERFORM assert_eq(r.checked_in_count, 4, 'I4 counter still advanced');

  -- The per-door truth the frozen columns cannot express lives in the ledger.
  PERFORM assert_eq((SELECT count(*)::INT FROM checkin_scan_events
                     WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000034'
                       AND result = 'admitted'),
                    2, 'I5 both admissions recorded in the ledger');
  PERFORM assert_eq((SELECT count(DISTINCT checked_in_door)::INT FROM checkin_scan_events
                     WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000034'
                       AND result = 'admitted'),
                    2, 'I6 a party split across two doors is reconstructable');
END $$;

-- ===========================================================================
-- J. Amend RPC (review area 5)
-- ===========================================================================
DO $$
DECLARE res RECORD; r guest_invitations; req UUID := gen_random_uuid(); reversal_req UUID;
BEGIN
  -- correct 4 admitted down to 3
  SELECT * INTO res FROM amend_guest_invitation_checkin(
    '44444444-0000-0000-0000-000000000034', '22222222-2222-2222-2222-222222222222',
    3, 'One of the party left before scanning', 'Asha', req);
  PERFORM assert_eq(res.result, 'amended', 'J1 headcount corrected downward');
  PERFORM assert_eq(res.total_admitted, 3, 'J1 new total');

  SELECT * INTO r FROM guest_invitations WHERE id = '44444444-0000-0000-0000-000000000034';
  PERFORM assert_eq(r.checked_in_count, 3, 'J2 counter is the source of truth');
  PERFORM assert_eq(r.checked_in_party_size, 3, 'J2 deprecated mirror derived from it');
  PERFORM assert_eq((r.checked_in_at IS NOT NULL), TRUE, 'J2 partial amendment keeps the arrival');

  -- retry of the same amendment is replayed, not reapplied
  SELECT * INTO res FROM amend_guest_invitation_checkin(
    '44444444-0000-0000-0000-000000000034', '22222222-2222-2222-2222-222222222222',
    3, 'One of the party left before scanning', 'Asha', req);
  PERFORM assert_eq(res.is_replay, TRUE, 'J3 amendment retry replayed');
  PERFORM assert_eq(res.total_admitted, 3, 'J3 replay returns the original total');

  -- a reason is mandatory
  BEGIN
    PERFORM amend_guest_invitation_checkin(
      '44444444-0000-0000-0000-000000000034', '22222222-2222-2222-2222-222222222222',
      2, '   ', 'Asha', gen_random_uuid());
    RAISE EXCEPTION 'FAIL: J4 blank reason accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'pass: J4 amendment without a reason refused';
  END;

  -- above the allowance is refused
  SELECT * INTO res FROM amend_guest_invitation_checkin(
    '44444444-0000-0000-0000-000000000034', '22222222-2222-2222-2222-222222222222',
    99, 'typo', 'Asha', gen_random_uuid());
  PERFORM assert_eq(res.result, 'invalid_count', 'J5 amendment above allowance refused');

  -- negative is refused
  SELECT * INTO res FROM amend_guest_invitation_checkin(
    '44444444-0000-0000-0000-000000000034', '22222222-2222-2222-2222-222222222222',
    -1, 'typo', 'Asha', gen_random_uuid());
  PERFORM assert_eq(res.result, 'invalid_count', 'J6 negative amendment refused');

  -- wrong event is refused
  SELECT * INTO res FROM amend_guest_invitation_checkin(
    '44444444-0000-0000-0000-000000000034', '22222222-2222-2222-2222-222222222223',
    1, 'wrong event', 'Asha', gen_random_uuid());
  PERFORM assert_eq(res.result, 'wrong_event', 'J7 amendment bound to the event');

  -- full reversal clears the first-entry metadata so the invariant holds
  reversal_req := gen_random_uuid();
  SELECT * INTO res FROM amend_guest_invitation_checkin(
    '44444444-0000-0000-0000-000000000034', '22222222-2222-2222-2222-222222222222',
    0, 'Scanned the wrong guest', 'Asha', reversal_req);
  PERFORM assert_eq(res.result, 'amended', 'J8 full reversal allowed');
  SELECT * INTO r FROM guest_invitations WHERE id = '44444444-0000-0000-0000-000000000034';
  PERFORM assert_eq(r.checked_in_count, 0, 'J8 counter back to zero');
  PERFORM assert_eq(r.checked_in_at, NULL::TIMESTAMPTZ, 'J8 arrival cleared');
  PERFORM assert_eq(r.checked_in_by, NULL, 'J8 attendant cleared');
  PERFORM assert_eq(r.checked_in_door, NULL, 'J8 door cleared');
  PERFORM assert_eq(r.checked_in_party_size, NULL, 'J8 deprecated mirror cleared');

  -- amending a guest who never arrived is refused
  SELECT * INTO res FROM amend_guest_invitation_checkin(
    '44444444-0000-0000-0000-000000000034', '22222222-2222-2222-2222-222222222222',
    1, 'nobody here', 'Asha', gen_random_uuid());
  PERFORM assert_eq(res.result, 'not_checked_in', 'J9 cannot amend a pass that never arrived');

  -- the reversal is in the audit trail with its reason
  PERFORM assert_eq((SELECT reason FROM checkin_scan_events WHERE request_id = reversal_req),
                    'Scanned the wrong guest', 'J10 amendment reason is auditable');
  PERFORM assert_eq((SELECT admitted_count FROM checkin_scan_events WHERE request_id = reversal_req),
                    -3, 'J10 reversal recorded as a negative delta');

  -- the amend flag must not leak: a direct decrease is refused again
  BEGIN
    UPDATE guest_invitations SET checked_in_count = 0
     WHERE id = '44444444-0000-0000-0000-000000000031';
    RAISE EXCEPTION 'FAIL: J11 amend flag leaked to a later statement';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'pass: J11 amend authorisation does not leak past the RPC';
  END;
END $$;

-- ===========================================================================
-- J12. A request id cannot cross between the two RPCs
-- ===========================================================================
INSERT INTO guest_contacts (id, user_id, full_name) VALUES
  ('33333333-0000-0000-0000-000000000050', '11111111-1111-1111-1111-111111111111', 'Cross RPC Guest');
INSERT INTO guest_invitations (id, user_id, guest_contact_id, event_id, rsvp_status, party_size) VALUES
  ('44444444-0000-0000-0000-000000000050', '11111111-1111-1111-1111-111111111111',
   '33333333-0000-0000-0000-000000000050', '22222222-2222-2222-2222-222222222222', 'attending', 4);

DO $$
DECLARE res RECORD; req UUID := gen_random_uuid(); admit_req UUID := gen_random_uuid();
BEGIN
  -- An admission's id presented to amend is a conflict, not a replay: the
  -- correction would otherwise be silently discarded and answered with the
  -- admission's own outcome.
  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000050', '22222222-2222-2222-2222-222222222222',
    1, 'Asha', 'Main Gate', admit_req);
  PERFORM assert_eq(res.result, 'admitted', 'J12 setup admission');

  SELECT * INTO res FROM amend_guest_invitation_checkin(
    '44444444-0000-0000-0000-000000000050', '22222222-2222-2222-2222-222222222222',
    1, 'reusing an admission id', 'Asha', admit_req);
  PERFORM assert_eq(res.result, 'request_conflict', 'J12 admit id refused by amend');

  -- and the reverse
  SELECT * INTO res FROM amend_guest_invitation_checkin(
    '44444444-0000-0000-0000-000000000050', '22222222-2222-2222-2222-222222222222',
    1, 'a real correction', 'Asha', req);
  PERFORM assert_eq(res.result, 'amended', 'J12 real correction lands');

  SELECT * INTO res FROM checkin_admit_guest(
    '44444444-0000-0000-0000-000000000050', '22222222-2222-2222-2222-222222222222',
    1, 'Asha', 'Main Gate', req);
  PERFORM assert_eq(res.result, 'request_conflict', 'J12 amend id refused by admit');
END $$;

-- ===========================================================================
-- K. Legacy wrapper (review area 1)
-- ===========================================================================
DO $$
DECLARE row1 guest_invitations; row2 guest_invitations;
BEGIN
  -- party of 4, but the wrapper may only ever move the counter by 1
  row1 := checkin_guest_invitation('44444444-0000-0000-0000-000000000033', 'Old Scanner', 'Gate 1');
  PERFORM assert_eq(row1.checked_in_count, 1, 'K1 legacy wrapper admits exactly one');

  -- even when an explicit party size is passed, it cannot admit more
  row2 := checkin_guest_invitation('44444444-0000-0000-0000-000000000033', 'Old Scanner', 'Gate 1', 4);
  PERFORM assert_eq(row2.checked_in_count, 2, 'K2 explicit party size cannot widen a legacy admission');

  -- every legacy call is attributed in the ledger
  PERFORM assert_eq((SELECT count(*)::INT FROM checkin_scan_events
                     WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000033'
                       AND source = 'legacy_rpc_wrapper'),
                    2, 'K3 legacy calls tagged for removal evidence');

  -- old contract preserved: NULL row once nothing is left
  PERFORM checkin_guest_invitation('44444444-0000-0000-0000-000000000033', 'Old Scanner', 'Gate 1');
  PERFORM checkin_guest_invitation('44444444-0000-0000-0000-000000000033', 'Old Scanner', 'Gate 1');
  row2 := checkin_guest_invitation('44444444-0000-0000-0000-000000000033', 'Old Scanner', 'Gate 1');
  PERFORM assert_eq((row2.id IS NULL), TRUE, 'K4 exhausted legacy call returns a NULL row');
  PERFORM assert_eq((SELECT checked_in_count FROM guest_invitations
                     WHERE id = '44444444-0000-0000-0000-000000000033'),
                    4, 'K4 never exceeded the allowance');

  -- the wrapper writes first-entry metadata once, like every other path
  PERFORM assert_eq((SELECT checked_in_door FROM guest_invitations
                     WHERE id = '44444444-0000-0000-0000-000000000033'),
                    'Gate 1', 'K5 first-entry door recorded');
END $$;

-- ===========================================================================
-- L. Lockdown on the new function
-- ===========================================================================
DO $$
BEGIN
  PERFORM assert_eq(
    has_function_privilege('anon', 'amend_guest_invitation_checkin(uuid,uuid,int,text,text,uuid)', 'EXECUTE'),
    FALSE, 'L1 anon cannot execute the amend RPC');
  PERFORM assert_eq(
    has_function_privilege('authenticated', 'amend_guest_invitation_checkin(uuid,uuid,int,text,text,uuid)', 'EXECUTE'),
    FALSE, 'L2 authenticated cannot execute the amend RPC');
  PERFORM assert_eq(
    has_function_privilege('service_role', 'amend_guest_invitation_checkin(uuid,uuid,int,text,text,uuid)', 'EXECUTE'),
    TRUE, 'L3 service_role can execute the amend RPC');
  PERFORM assert_eq(
    (SELECT relrowsecurity FROM pg_class WHERE relname = 'guest_invitation_allowance_events'),
    TRUE, 'L4 RLS enabled on the allowance audit table');
END $$;

SELECT 'ALL REVIEW-ROUND TESTS PASSED' AS status;
