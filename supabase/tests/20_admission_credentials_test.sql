-- Behavioural suite for opaque admission credentials (migration
-- 20260802220000). Run via supabase/tests/run-admission-credentials-tests.sh.
--
-- Format parsing, entropy and envelope encryption live in the unit suite
-- (apps/opus_pass/src/lib/checkin/credential-core.test.ts) because they are
-- pure application concerns. What is asserted here is everything the database
-- is responsible for: single active credential, issuance idempotence,
-- resolution outcomes, rotation atomicity and the audit trail.
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

-- Stand-in for the application's credential minting: the real raw value never
-- reaches the database, only its hash and an opaque ciphertext.
CREATE OR REPLACE FUNCTION test_hash(raw TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(digest(raw, 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION test_ciphertext(raw TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(digest('ciphertext-of:' || raw, 'sha512'), 'hex');
$$;

INSERT INTO guest_contacts (id, user_id, full_name) VALUES
  ('33333333-0000-0000-0000-000000000100', '11111111-1111-1111-1111-111111111111', 'Credential Guest'),
  ('33333333-0000-0000-0000-000000000101', '11111111-1111-1111-1111-111111111111', 'Rotation Guest'),
  ('33333333-0000-0000-0000-000000000102', '11111111-1111-1111-1111-111111111111', 'Revoked Guest'),
  ('33333333-0000-0000-0000-000000000103', '11111111-1111-1111-1111-111111111111', 'Expiry Guest'),
  ('33333333-0000-0000-0000-000000000104', '11111111-1111-1111-1111-111111111111', 'Other Event Guest');

INSERT INTO guest_invitations (id, user_id, guest_contact_id, event_id, rsvp_status, party_size) VALUES
  ('44444444-0000-0000-0000-000000000100', '11111111-1111-1111-1111-111111111111',
   '33333333-0000-0000-0000-000000000100', '22222222-2222-2222-2222-222222222222', 'attending', 2),
  ('44444444-0000-0000-0000-000000000101', '11111111-1111-1111-1111-111111111111',
   '33333333-0000-0000-0000-000000000101', '22222222-2222-2222-2222-222222222222', 'attending', 1),
  ('44444444-0000-0000-0000-000000000102', '11111111-1111-1111-1111-111111111111',
   '33333333-0000-0000-0000-000000000102', '22222222-2222-2222-2222-222222222222', 'attending', 1),
  ('44444444-0000-0000-0000-000000000103', '11111111-1111-1111-1111-111111111111',
   '33333333-0000-0000-0000-000000000103', '22222222-2222-2222-2222-222222222222', 'attending', 1),
  ('44444444-0000-0000-0000-000000000104', '11111111-1111-1111-1111-111111111111',
   '33333333-0000-0000-0000-000000000104', '22222222-2222-2222-2222-222222222223', 'attending', 1);

-- ===========================================================================
-- M. Issuance
-- ===========================================================================
DO $$
DECLARE res RECORD; res2 RECORD; cred admission_credentials;
BEGIN
  SELECT * INTO res FROM ensure_admission_credential(
    '44444444-0000-0000-0000-000000000100',
    test_hash('OP1:first'), test_ciphertext('OP1:first'), 1, 'entrance_pass_render');

  PERFORM assert_eq(res.result, 'issued', 'M1 first render issues a credential');
  PERFORM assert_eq(res.created, TRUE, 'M1 reported as newly created');

  SELECT * INTO cred FROM admission_credentials WHERE id = res.credential_id;
  PERFORM assert_eq(cred.status, 'active', 'M2 issued credential is active');
  PERFORM assert_eq(cred.token_prefix, 'OP1', 'M2 prefix recorded');
  PERFORM assert_eq(cred.credential_version, 1, 'M2 first version');
  PERFORM assert_eq(encode(cred.token_hash, 'hex'), test_hash('OP1:first'),
                    'M3 the HASH is what is stored');
  PERFORM assert_eq(cred.encryption_key_version, 1, 'M3 key version recorded');

  -- Re-rendering must return the SAME credential, or every reopened ticket
  -- would invalidate the copy already sitting in a guest's WhatsApp thread.
  SELECT * INTO res2 FROM ensure_admission_credential(
    '44444444-0000-0000-0000-000000000100',
    test_hash('OP1:second'), test_ciphertext('OP1:second'), 1, 'entrance_pass_render');

  PERFORM assert_eq(res2.result, 'existing', 'M4 re-render reuses the active credential');
  PERFORM assert_eq(res2.created, FALSE, 'M4 nothing new created');
  PERFORM assert_eq(res2.credential_id, res.credential_id, 'M4 same credential id');
  PERFORM assert_eq(res2.token_ciphertext_hex, test_ciphertext('OP1:first'),
                    'M4 returns the ORIGINAL ciphertext for decryption');

  PERFORM assert_eq((SELECT count(*)::INT FROM admission_credentials
                     WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000100'),
                    1, 'M5 the discarded candidate was not stored');

  -- Issuance for a guest who does not exist cannot invent one.
  SELECT * INTO res FROM ensure_admission_credential(
    '44444444-4444-4444-4444-444444444444',
    test_hash('OP1:ghost'), test_ciphertext('OP1:ghost'), 1, 'entrance_pass_render');
  PERFORM assert_eq(res.result, 'not_found', 'M6 unknown invitation issues nothing');
END $$;

-- No stored column may contain anything that looks like a raw credential.
DO $$
DECLARE leaked INT;
BEGIN
  SELECT count(*)::INT INTO leaked FROM admission_credentials
   WHERE encode(token_hash, 'escape') LIKE '%OP1:%'
      OR encode(token_ciphertext, 'escape') LIKE '%OP1:%'
      OR issuance_source LIKE '%OP1:%';
  PERFORM assert_eq(leaked, 0, 'M7 no column holds a raw credential');
END $$;

-- ===========================================================================
-- N. One active credential per invitation
-- ===========================================================================
DO $$
BEGIN
  BEGIN
    INSERT INTO admission_credentials (
      guest_invitation_id, token_hash, token_ciphertext, encryption_key_version, issuance_source
    ) VALUES (
      '44444444-0000-0000-0000-000000000100', decode(test_hash('OP1:rogue'), 'hex'),
      decode(test_ciphertext('OP1:rogue'), 'hex'), 1, 'admin');
    RAISE EXCEPTION 'FAIL: N1 a second active credential was accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'pass: N1 only one active credential per invitation';
  END;

  -- The constraint is on ACTIVE rows only: history must still accumulate.
  INSERT INTO admission_credentials (
    guest_invitation_id, token_hash, token_ciphertext, encryption_key_version,
    issuance_source, status
  ) VALUES (
    '44444444-0000-0000-0000-000000000100', decode(test_hash('OP1:history'), 'hex'),
    decode(test_ciphertext('OP1:history'), 'hex'), 1, 'admin', 'revoked');
  RAISE NOTICE 'pass: N2 non-active credentials may coexist';
END $$;

-- ===========================================================================
-- O. Resolution
-- ===========================================================================
DO $$
DECLARE res RECORD; found_rows INT;
BEGIN
  SELECT * INTO res FROM resolve_admission_credential(test_hash('OP1:first'));
  PERFORM assert_eq(res.guest_invitation_id, '44444444-0000-0000-0000-000000000100'::UUID,
                    'O1 valid credential resolves its invitation');
  PERFORM assert_eq(res.status, 'active', 'O1 status active');
  PERFORM assert_eq(res.event_id, '22222222-2222-2222-2222-222222222222'::UUID,
                    'O1 resolution carries the invitation''s own event');

  SELECT count(*)::INT INTO found_rows
    FROM resolve_admission_credential(test_hash('OP1:never-issued'));
  PERFORM assert_eq(found_rows, 0, 'O2 unknown credential resolves nothing');

  -- A revoked credential resolves, but not as active. The caller collapses
  -- every non-active outcome to one door message.
  SELECT * INTO res FROM resolve_admission_credential(test_hash('OP1:history'));
  PERFORM assert_eq(res.status, 'revoked', 'O3 revoked credential reports revoked');
END $$;

-- Expiry is honoured even before anything sweeps it.
DO $$
DECLARE res RECORD;
BEGIN
  PERFORM ensure_admission_credential(
    '44444444-0000-0000-0000-000000000103',
    test_hash('OP1:expiring'), test_ciphertext('OP1:expiring'), 1, 'admin');
  UPDATE admission_credentials SET expires_at = now() - interval '1 hour'
   WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000103' AND status = 'active';

  SELECT * INTO res FROM resolve_admission_credential(test_hash('OP1:expiring'));
  PERFORM assert_eq(res.status, 'expired', 'O4 a past expiry reads as expired');
  PERFORM assert_eq((SELECT status FROM admission_credentials
                     WHERE token_hash = decode(test_hash('OP1:expiring'), 'hex')),
                    'expired', 'O4 and is swept on read');

  -- With the expired one stood down, the guest can be issued a fresh pass.
  PERFORM ensure_admission_credential(
    '44444444-0000-0000-0000-000000000103',
    test_hash('OP1:after-expiry'), test_ciphertext('OP1:after-expiry'), 1, 'entrance_pass_render');
  PERFORM assert_eq((SELECT count(*)::INT FROM admission_credentials
                     WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000103'
                       AND status = 'active'),
                    1, 'O5 expiry frees the slot for a replacement');
END $$;

-- ===========================================================================
-- P. Rotation
-- ===========================================================================
DO $$
DECLARE res RECORD; old_id UUID; resolved RECORD;
BEGIN
  PERFORM ensure_admission_credential(
    '44444444-0000-0000-0000-000000000101',
    test_hash('OP1:rot-1'), test_ciphertext('OP1:rot-1'), 1, 'entrance_pass_render');
  SELECT id INTO old_id FROM admission_credentials
   WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000101' AND status = 'active';

  SELECT * INTO res FROM rotate_admission_credential(
    '44444444-0000-0000-0000-000000000101',
    test_hash('OP1:rot-2'), test_ciphertext('OP1:rot-2'), 1,
    'Guest reported their ticket was forwarded', 'admin', 'ops');

  PERFORM assert_eq(res.result, 'rotated', 'P1 rotation succeeded');
  PERFORM assert_eq(res.superseded_credential_id, old_id, 'P1 previous credential reported');

  PERFORM assert_eq((SELECT status FROM admission_credentials WHERE id = old_id),
                    'superseded', 'P2 the old credential is stood down');
  PERFORM assert_eq((SELECT replaced_by_credential_id FROM admission_credentials WHERE id = old_id),
                    res.credential_id, 'P2 old links to its replacement');
  PERFORM assert_eq((SELECT credential_version FROM admission_credentials WHERE id = res.credential_id),
                    2, 'P2 version incremented');

  -- The whole point: the previous QR stops working.
  SELECT * INTO resolved FROM resolve_admission_credential(test_hash('OP1:rot-1'));
  PERFORM assert_eq(resolved.status, 'superseded', 'P3 the previous credential no longer admits');
  SELECT * INTO resolved FROM resolve_admission_credential(test_hash('OP1:rot-2'));
  PERFORM assert_eq(resolved.status, 'active', 'P3 the replacement admits');

  PERFORM assert_eq((SELECT count(*)::INT FROM admission_credentials
                     WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000101'
                       AND status = 'active'),
                    1, 'P4 exactly one active credential after rotation');

  -- Rotation without a stated reason is not auditable, so it is refused.
  BEGIN
    PERFORM rotate_admission_credential(
      '44444444-0000-0000-0000-000000000101',
      test_hash('OP1:rot-3'), test_ciphertext('OP1:rot-3'), 1, '   ', 'admin');
    RAISE EXCEPTION 'FAIL: P5 rotation without a reason was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'pass: P5 rotation requires a reason';
  END;

  -- Rotating a guest who has no credential yet simply issues one.
  SELECT * INTO res FROM rotate_admission_credential(
    '44444444-0000-0000-0000-000000000102',
    test_hash('OP1:fresh-rot'), test_ciphertext('OP1:fresh-rot'), 1,
    'Issued directly by rotation', 'admin');
  PERFORM assert_eq(res.result, 'rotated', 'P6 rotation with no prior credential still issues');
  PERFORM assert_eq(res.superseded_credential_id, NULL::UUID, 'P6 nothing to supersede');
END $$;

-- ===========================================================================
-- Q. Revocation
-- ===========================================================================
DO $$
DECLARE res RECORD; cred_id UUID; resolved RECORD;
BEGIN
  SELECT id INTO cred_id FROM admission_credentials
   WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000102' AND status = 'active';

  SELECT * INTO res FROM revoke_admission_credential(cred_id, 'Guest cancelled', 'ops');
  PERFORM assert_eq(res.result, 'revoked', 'Q1 credential revoked');

  SELECT * INTO resolved FROM resolve_admission_credential(test_hash('OP1:fresh-rot'));
  PERFORM assert_eq(resolved.status, 'revoked', 'Q1 revoked credential no longer admits');

  -- Revoking twice is not an error, but it is also not a second revocation.
  SELECT * INTO res FROM revoke_admission_credential(cred_id, 'Guest cancelled again', 'ops');
  PERFORM assert_eq(res.result, 'not_active', 'Q2 revoking a stood-down credential is a no-op');

  BEGIN
    PERFORM revoke_admission_credential(cred_id, NULL, 'ops');
    RAISE EXCEPTION 'FAIL: Q3 revocation without a reason was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'pass: Q3 revocation requires a reason';
  END;
END $$;

-- Revocation must survive the guest reopening their own ticket link. The
-- entrance-pass route calls ensure_admission_credential() on every render, so
-- minting whenever no active credential exists would mean a withdrawn pass
-- comes back to life on the next page load.
DO $$
DECLARE res RECORD; cred_id UUID;
BEGIN
  PERFORM ensure_admission_credential(
    '44444444-0000-0000-0000-000000000100',
    test_hash('OP1:revoke-me'), test_ciphertext('OP1:revoke-me'), 1, 'entrance_pass_render');
  SELECT id INTO cred_id FROM admission_credentials
   WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000100' AND status = 'active';
  PERFORM revoke_admission_credential(cred_id, 'Guest cancelled');

  SELECT * INTO res FROM ensure_admission_credential(
    '44444444-0000-0000-0000-000000000100',
    test_hash('OP1:sneaky'), test_ciphertext('OP1:sneaky'), 1, 'entrance_pass_render');
  PERFORM assert_eq(res.result, 'revoked', 'Q4 a re-render does NOT re-mint after revocation');
  PERFORM assert_eq(res.created, FALSE, 'Q4 nothing was created');
  PERFORM assert_eq((SELECT count(*)::INT FROM admission_credentials
                     WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000100'
                       AND status = 'active'),
                    0, 'Q4 the guest still has no working pass');

  -- Re-issuing after a deliberate withdrawal has to be explicit, and rotation
  -- is the path that demands a reason.
  SELECT * INTO res FROM rotate_admission_credential(
    '44444444-0000-0000-0000-000000000100',
    test_hash('OP1:reissued'), test_ciphertext('OP1:reissued'), 1,
    'Guest reinstated by the couple', 'admin');
  PERFORM assert_eq(res.result, 'rotated', 'Q5 rotation can still reinstate deliberately');
  PERFORM assert_eq((SELECT count(*)::INT FROM admission_credentials
                     WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000100'
                       AND status = 'active'),
                    1, 'Q5 exactly one active credential after reinstatement');
END $$;

-- ===========================================================================
-- R. Event expiry
-- ===========================================================================
DO $$
DECLARE n INT;
BEGIN
  PERFORM ensure_admission_credential(
    '44444444-0000-0000-0000-000000000104',
    test_hash('OP1:other-event'), test_ciphertext('OP1:other-event'), 1, 'entrance_pass_render');

  n := expire_admission_credentials_for_event('22222222-2222-2222-2222-222222222223', 'event closed');
  PERFORM assert_eq(n, 1, 'R1 expired the other event''s credentials');
  PERFORM assert_eq((SELECT status FROM admission_credentials
                     WHERE token_hash = decode(test_hash('OP1:other-event'), 'hex')),
                    'expired', 'R1 credential expired');

  -- Credentials for the main event are untouched by another event's closure.
  PERFORM assert_eq((SELECT count(*)::INT FROM admission_credentials ac
                       JOIN guest_invitations gi ON gi.id = ac.guest_invitation_id
                      WHERE gi.event_id = '22222222-2222-2222-2222-222222222222'
                        AND ac.status = 'active'),
                    3, 'R2 other events are unaffected');
END $$;

-- ===========================================================================
-- S. Cross-event isolation
-- ===========================================================================
DO $$
DECLARE res RECORD;
BEGIN
  -- Resolution reports the invitation's OWN event. A scanner authorised for a
  -- different event compares this against the event it was authorised for and
  -- refuses; the credential itself never asserts which event it belongs to.
  SELECT * INTO res FROM resolve_admission_credential(test_hash('OP1:other-event'));
  PERFORM assert_eq(res.event_id, '22222222-2222-2222-2222-222222222223'::UUID,
                    'S1 credential resolves to its own event, not the caller''s');
  PERFORM assert_eq((res.event_id = '22222222-2222-2222-2222-222222222222'::UUID), FALSE,
                    'S1 and therefore cannot bind to the other event');
END $$;

-- ===========================================================================
-- T. Lifecycle audit
-- ===========================================================================
DO $$
BEGIN
  PERFORM assert_eq((SELECT count(*)::INT FROM admission_credential_events
                     WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000101'
                       AND action = 'rotated'),
                    1, 'T1 rotation recorded');
  PERFORM assert_eq((SELECT reason FROM admission_credential_events
                     WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000101'
                       AND action = 'rotated'),
                    'Guest reported their ticket was forwarded', 'T1 with its reason');
  -- Two: the Q-block revocation and the Q4 revoke-then-re-render case.
  PERFORM assert_eq((SELECT count(*)::INT FROM admission_credential_events
                     WHERE action = 'revoked'), 2, 'T2 revocations recorded');
  PERFORM assert_eq((SELECT count(*)::INT FROM admission_credential_events
                     WHERE action = 'expired'), 1, 'T3 event expiry recorded');
  -- One each for invitations 100, 103 (expiring), 103 (after expiry), 101
  -- (pre-rotation) and 104 (other event). Rotations log 'rotated', not
  -- 'issued', so they are counted separately above.
  PERFORM assert_eq((SELECT count(*)::INT FROM admission_credential_events
                     WHERE action = 'issued'), 5, 'T4 every issuance recorded');
END $$;

-- ===========================================================================
-- U. Verification ledger and scan tagging
-- ===========================================================================
DO $$
DECLARE cred_id UUID;
BEGIN
  SELECT id INTO cred_id FROM admission_credentials
   WHERE token_hash = decode(test_hash('OP1:first'), 'hex');

  -- A failure with no resolvable invitation still has to be recordable, which
  -- is why this is a separate table from the admission ledger.
  INSERT INTO admission_credential_verifications (
    event_id, credential_format, verification_result, token_fingerprint
  ) VALUES (
    '22222222-2222-2222-2222-222222222222', 'opaque_v1', 'unknown', 'abc123def456');
  RAISE NOTICE 'pass: U1 a verification failure with no invitation is recordable';

  INSERT INTO admission_credential_verifications (
    event_id, credential_id, guest_invitation_id, credential_format,
    credential_status_at_scan, verification_result, token_fingerprint
  ) VALUES (
    '22222222-2222-2222-2222-222222222222', cred_id,
    '44444444-0000-0000-0000-000000000100', 'opaque_v1', 'active', 'verified', 'aaaa1111bbbb');
  RAISE NOTICE 'pass: U2 a successful verification is recorded against its credential';

  -- Evidence for retiring the legacy branch.
  INSERT INTO admission_credential_verifications (
    event_id, guest_invitation_id, credential_format, verification_result, token_fingerprint
  ) VALUES (
    '22222222-2222-2222-2222-222222222222', '44444444-0000-0000-0000-000000000100',
    'legacy_hmac', 'verified', 'cccc2222dddd');
  PERFORM assert_eq((SELECT count(*)::INT FROM admission_credential_verifications
                     WHERE credential_format = 'legacy_hmac'),
                    1, 'U3 legacy scans are countable for retirement');

  -- An unknown format cannot be recorded, so the retirement query cannot be
  -- quietly diluted by a typo.
  BEGIN
    INSERT INTO admission_credential_verifications (
      event_id, credential_format, verification_result
    ) VALUES ('22222222-2222-2222-2222-222222222222', 'opaque_v2', 'verified');
    RAISE EXCEPTION 'FAIL: U4 an unknown credential format was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'pass: U4 only known credential formats can be recorded';
  END;

  -- PR 1's ledger can carry the credential that opened the door.
  INSERT INTO checkin_scan_events (
    request_id, guest_invitation_id, event_id, result, credential_id, credential_format
  ) VALUES (
    gen_random_uuid(), '44444444-0000-0000-0000-000000000100',
    '22222222-2222-2222-2222-222222222222', 'admitted', cred_id, 'opaque_v1');
  PERFORM assert_eq((SELECT count(*)::INT FROM checkin_scan_events
                     WHERE credential_id = cred_id), 1, 'U5 admissions are tagged with their credential');
END $$;

-- ===========================================================================
-- V. Lockdown
-- ===========================================================================
DO $$
BEGIN
  PERFORM assert_eq(
    has_function_privilege('anon', 'ensure_admission_credential(uuid,text,text,int,text)', 'EXECUTE'),
    FALSE, 'V1 anon cannot issue credentials');
  PERFORM assert_eq(
    has_function_privilege('authenticated', 'resolve_admission_credential(text)', 'EXECUTE'),
    FALSE, 'V2 authenticated cannot resolve credentials');
  PERFORM assert_eq(
    has_function_privilege('anon', 'rotate_admission_credential(uuid,text,text,int,text,text,text)', 'EXECUTE'),
    FALSE, 'V3 anon cannot rotate credentials');
  PERFORM assert_eq(
    has_function_privilege('anon', 'revoke_admission_credential(uuid,text,text)', 'EXECUTE'),
    FALSE, 'V4 anon cannot revoke credentials');
  PERFORM assert_eq(
    has_function_privilege('service_role', 'resolve_admission_credential(text)', 'EXECUTE'),
    TRUE, 'V5 service_role can resolve credentials');
  PERFORM assert_eq(
    (SELECT relrowsecurity FROM pg_class WHERE relname = 'admission_credentials'),
    TRUE, 'V6 RLS enabled on admission_credentials');
  PERFORM assert_eq(
    (SELECT relrowsecurity FROM pg_class WHERE relname = 'admission_credential_verifications'),
    TRUE, 'V7 RLS enabled on the verification ledger');
END $$;

SELECT 'ALL CREDENTIAL TESTS PASSED' AS status;
