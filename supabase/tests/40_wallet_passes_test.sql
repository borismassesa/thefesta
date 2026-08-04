-- Behavioural suite for wallet_passes (migration 20260803030000).
-- Run via supabase/tests/run-wallet-passes-tests.sh.
--
-- This table is bookkeeping, never authority. The assertions below are mostly
-- about that: nothing here can admit anybody, and a failed provider call must
-- not destroy the record of a pass the guest already holds.
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

INSERT INTO guest_contacts (id, user_id, full_name) VALUES
  ('33333333-0000-0000-0000-000000000300', '11111111-1111-1111-1111-111111111111', 'Wallet Pass Guest');
INSERT INTO guest_invitations (id, user_id, guest_contact_id, event_id, rsvp_status, party_size) VALUES
  ('44444444-0000-0000-0000-000000000300', '11111111-1111-1111-1111-111111111111',
   '33333333-0000-0000-0000-000000000300', '22222222-2222-2222-2222-222222222222', 'attending', 2);

-- ===========================================================================
-- AB. Issuance bookkeeping
-- ===========================================================================
DO $$
DECLARE res RECORD; row1 wallet_passes;
BEGIN
  SELECT * INTO res FROM record_wallet_pass(
    '44444444-0000-0000-0000-000000000300', 'google', 'issued',
    '3388000000023183279.event_x', '3388000000023183279.adm_y');
  PERFORM assert_eq(res.result, 'recorded', 'AB1 first issuance recorded');
  PERFORM assert_eq(res.pass_version, 1, 'AB1 version 1');

  SELECT * INTO row1 FROM wallet_passes
   WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000300' AND provider = 'google';
  PERFORM assert_eq(row1.status, 'issued', 'AB1 status issued');
  PERFORM assert_eq((row1.last_issued_at IS NOT NULL), TRUE, 'AB1 issuance timestamped');

  -- Re-opening the pass page re-issues; the same row advances.
  SELECT * INTO res FROM record_wallet_pass(
    '44444444-0000-0000-0000-000000000300', 'google', 'issued',
    '3388000000023183279.event_x', '3388000000023183279.adm_y');
  PERFORM assert_eq(res.pass_version, 2, 'AB2 re-issue advances the version');
  PERFORM assert_eq((SELECT count(*)::INT FROM wallet_passes
                     WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000300'),
                    1, 'AB2 still one row per provider');

  -- A guest may hold the same admission in both wallets.
  PERFORM record_wallet_pass('44444444-0000-0000-0000-000000000300', 'apple', 'issued');
  PERFORM assert_eq((SELECT count(*)::INT FROM wallet_passes
                     WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000300'),
                    2, 'AB3 both providers coexist');

  SELECT * INTO res FROM record_wallet_pass(
    '44444444-4444-4444-4444-444444444444', 'google', 'issued');
  PERFORM assert_eq(res.result, 'not_found', 'AB4 unknown invitation records nothing');
END $$;

-- A failed retry must not erase what the guest already holds.
DO $$
DECLARE res RECORD; row1 wallet_passes;
BEGIN
  SELECT * INTO res FROM record_wallet_pass(
    '44444444-0000-0000-0000-000000000300', 'google', 'failed', NULL, NULL, 'sign_failed');
  PERFORM assert_eq(res.pass_version, 2, 'AC1 a failure does not advance the version');

  SELECT * INTO row1 FROM wallet_passes
   WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000300' AND provider = 'google';
  PERFORM assert_eq(row1.status, 'failed', 'AC1 status reflects the failure');
  PERFORM assert_eq(row1.last_error_code, 'sign_failed', 'AC1 error code recorded');
  PERFORM assert_eq(row1.provider_object_id, '3388000000023183279.adm_y',
                    'AC1 the identifiers of the pass they already hold survive');
  PERFORM assert_eq((row1.last_issued_at IS NOT NULL), TRUE,
                    'AC1 and so does the original issuance time');
END $$;

-- A first attempt that FAILS must not look like a pass the guest saved.
DO $$
DECLARE res RECORD;
BEGIN
  INSERT INTO guest_contacts (id, user_id, full_name) VALUES
    ('33333333-0000-0000-0000-000000000301', '11111111-1111-1111-1111-111111111111', 'Never Issued');
  INSERT INTO guest_invitations (id, user_id, guest_contact_id, event_id, rsvp_status, party_size) VALUES
    ('44444444-0000-0000-0000-000000000301', '11111111-1111-1111-1111-111111111111',
     '33333333-0000-0000-0000-000000000301', '22222222-2222-2222-2222-222222222222', 'attending', 1);

  SELECT * INTO res FROM record_wallet_pass(
    '44444444-0000-0000-0000-000000000301', 'google', 'failed', NULL, NULL, 'sign_failed');
  PERFORM assert_eq(res.pass_version, 0, 'AC2 a first attempt that failed is version 0');
  PERFORM assert_eq((SELECT last_issued_at FROM wallet_passes
                     WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000301'),
                    NULL::TIMESTAMPTZ, 'AC2 and was never issued');
END $$;

-- ===========================================================================
-- AD. Constraints
-- ===========================================================================
DO $$
BEGIN
  BEGIN
    INSERT INTO wallet_passes (guest_invitation_id, provider)
    VALUES ('44444444-0000-0000-0000-000000000300', 'google');
    RAISE EXCEPTION 'FAIL: AD1 a second row for the same provider was accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'pass: AD1 one row per invitation per provider';
  END;

  BEGIN
    INSERT INTO wallet_passes (guest_invitation_id, provider)
    VALUES ('44444444-0000-0000-0000-000000000300', 'samsung');
    RAISE EXCEPTION 'FAIL: AD2 an unknown provider was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'pass: AD2 only known providers can be recorded';
  END;
END $$;

-- ===========================================================================
-- AE. Revocation
-- ===========================================================================
DO $$
DECLARE n INT;
BEGIN
  n := revoke_wallet_passes('44444444-0000-0000-0000-000000000300', 'Guest cancelled');
  PERFORM assert_eq(n, 2, 'AE1 both providers revoked');
  PERFORM assert_eq((SELECT revocation_reason FROM wallet_passes
                     WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000300'
                       AND provider = 'google'),
                    'Guest cancelled', 'AE1 and the reason is kept, not just demanded');
  PERFORM assert_eq((SELECT last_error_code FROM wallet_passes
                     WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000300'
                       AND provider = 'google'),
                    'sign_failed', 'AE1 the pre-revocation diagnostic survives');
  PERFORM assert_eq((SELECT count(*)::INT FROM wallet_passes
                     WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000300'
                       AND status = 'revoked'),
                    2, 'AE1 both marked revoked');

  n := revoke_wallet_passes('44444444-0000-0000-0000-000000000300', 'again');
  PERFORM assert_eq(n, 0, 'AE2 revoking twice is a no-op');

  BEGIN
    PERFORM revoke_wallet_passes('44444444-0000-0000-0000-000000000300', '  ');
    RAISE EXCEPTION 'FAIL: AE3 revocation without a reason was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'pass: AE3 revocation requires a reason';
  END;
END $$;

-- Revoking wallet bookkeeping must not touch the admission itself: the guest
-- may still be perfectly entitled to walk in with the web pass.
DO $$
BEGIN
  PERFORM assert_eq((SELECT rsvp_status FROM guest_invitations
                     WHERE id = '44444444-0000-0000-0000-000000000300'),
                    'attending', 'AE4 revoking wallet passes leaves the RSVP alone');
  PERFORM assert_eq((SELECT entry_allowance FROM guest_invitations
                     WHERE id = '44444444-0000-0000-0000-000000000300'),
                    2, 'AE4 and leaves the allowance alone');
END $$;

-- A later issuance attempt must not resurrect a withdrawn pass.
DO $$
DECLARE res RECORD;
BEGIN
  SELECT * INTO res FROM record_wallet_pass(
    '44444444-0000-0000-0000-000000000300', 'google', 'issued', 'c', 'o');
  PERFORM assert_eq(res.result, 'recorded', 'AE5 the call still succeeds');
  PERFORM assert_eq((SELECT status FROM wallet_passes
                     WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000300'
                       AND provider = 'google'),
                    'revoked', 'AE5 but revocation is sticky');
END $$;

-- An oversized error code cannot smuggle a signed JWT into the table.
DO $$
BEGIN
  BEGIN
    UPDATE wallet_passes SET last_error_code = repeat('x', 200)
     WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000300';
    RAISE EXCEPTION 'FAIL: AE6 an oversized error code was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'pass: AE6 last_error_code is length-bounded';
  END;

  -- The RPC truncates rather than failing, so a chatty adapter degrades the
  -- diagnostic instead of taking issuance down.
  PERFORM record_wallet_pass('44444444-0000-0000-0000-000000000301', 'google', 'failed',
                             NULL, NULL, repeat('y', 300));
  PERFORM assert_eq(length((SELECT last_error_code FROM wallet_passes
                            WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000301')),
                    64, 'AE6 and the RPC truncates rather than throwing');
END $$;

-- ===========================================================================
-- AF. Lockdown
-- ===========================================================================
DO $$
BEGIN
  PERFORM assert_eq(
    has_function_privilege('anon', 'record_wallet_pass(uuid,text,text,text,text,text)', 'EXECUTE'),
    FALSE, 'AF1 anon cannot record wallet passes');
  PERFORM assert_eq(
    has_function_privilege('authenticated', 'revoke_wallet_passes(uuid,text)', 'EXECUTE'),
    FALSE, 'AF2 authenticated cannot revoke wallet passes');
  PERFORM assert_eq(
    has_function_privilege('service_role', 'record_wallet_pass(uuid,text,text,text,text,text)', 'EXECUTE'),
    TRUE, 'AF3 service_role can record wallet passes');
  PERFORM assert_eq(
    (SELECT relrowsecurity FROM pg_class WHERE relname = 'wallet_passes'),
    TRUE, 'AF4 RLS enabled on wallet_passes');
END $$;

SELECT 'ALL WALLET PASS TESTS PASSED' AS status;
