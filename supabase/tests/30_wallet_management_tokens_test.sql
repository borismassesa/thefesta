-- Behavioural suite for wallet management tokens (migration 20260802230000).
-- Run via supabase/tests/run-wallet-tokens-tests.sh.
--
-- The point of this capability is what it CANNOT do, so most of what is
-- asserted here is absence: the resolver must not be able to return a phone
-- number, an RSVP token or an admission credential even if a caller asks.
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

CREATE OR REPLACE FUNCTION test_hash(raw TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(digest(raw, 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION test_ciphertext(raw TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(digest('ciphertext-of:' || raw, 'sha512'), 'hex');
$$;

INSERT INTO guest_contacts (id, user_id, full_name) VALUES
  ('33333333-0000-0000-0000-000000000200', '11111111-1111-1111-1111-111111111111', 'Wallet Guest'),
  ('33333333-0000-0000-0000-000000000201', '11111111-1111-1111-1111-111111111111', 'Pending Guest');

INSERT INTO guest_invitations (id, user_id, guest_contact_id, event_id, rsvp_status, party_size) VALUES
  ('44444444-0000-0000-0000-000000000200', '11111111-1111-1111-1111-111111111111',
   '33333333-0000-0000-0000-000000000200', '22222222-2222-2222-2222-222222222222', 'attending', 2),
  ('44444444-0000-0000-0000-000000000201', '11111111-1111-1111-1111-111111111111',
   '33333333-0000-0000-0000-000000000201', '22222222-2222-2222-2222-222222222222', 'pending', 1);

-- ===========================================================================
-- W. Issuance and stability
-- ===========================================================================
DO $$
DECLARE res RECORD; res2 RECORD;
BEGIN
  SELECT * INTO res FROM ensure_wallet_management_token(
    '44444444-0000-0000-0000-000000000200',
    test_hash('WMT1:aaa'), test_ciphertext('WMT1:aaa'), 1, 'rsvp_confirmation');
  PERFORM assert_eq(res.result, 'issued', 'W1 first send issues a link');
  PERFORM assert_eq(res.created, TRUE, 'W1 newly created');

  -- A link already delivered to a WhatsApp thread cannot be recalled, so a
  -- re-send has to reproduce the SAME URL.
  SELECT * INTO res2 FROM ensure_wallet_management_token(
    '44444444-0000-0000-0000-000000000200',
    test_hash('WMT1:bbb'), test_ciphertext('WMT1:bbb'), 1, 'rsvp_confirmation');
  PERFORM assert_eq(res2.result, 'existing', 'W2 re-send reuses the live link');
  PERFORM assert_eq(res2.token_id, res.token_id, 'W2 same token');
  PERFORM assert_eq(res2.token_ciphertext_hex, test_ciphertext('WMT1:aaa'),
                    'W2 returns the ORIGINAL token for re-sending');

  PERFORM assert_eq((SELECT count(*)::INT FROM wallet_management_tokens
                     WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000200'),
                    1, 'W3 the discarded candidate was not stored');

  SELECT * INTO res FROM ensure_wallet_management_token(
    '44444444-4444-4444-4444-444444444444',
    test_hash('WMT1:ghost'), test_ciphertext('WMT1:ghost'), 1, 'rsvp_confirmation');
  PERFORM assert_eq(res.result, 'not_found', 'W4 unknown invitation issues nothing');
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO wallet_management_tokens (
      guest_invitation_id, token_hash, token_ciphertext, encryption_key_version, issuance_source
    ) VALUES (
      '44444444-0000-0000-0000-000000000200', decode(test_hash('WMT1:rogue'), 'hex'),
      decode(test_ciphertext('WMT1:rogue'), 'hex'), 1, 'admin');
    RAISE EXCEPTION 'FAIL: W5 a second live link was accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'pass: W5 only one live link per invitation';
  END;
END $$;

-- ===========================================================================
-- X. What the resolver may return
-- ===========================================================================
DO $$
DECLARE res RECORD;
BEGIN
  SELECT * INTO res FROM resolve_wallet_management_token(test_hash('WMT1:aaa'));
  PERFORM assert_eq(res.token_status, 'active', 'X1 live link resolves');
  PERFORM assert_eq(res.guest_invitation_id, '44444444-0000-0000-0000-000000000200'::UUID,
                    'X1 resolves its invitation');
  PERFORM assert_eq(res.guest_name, 'Wallet Guest', 'X1 the name already printed on the ticket');
  PERFORM assert_eq(res.entry_allowance, 2, 'X1 allowance for the pass face');

  -- Using the link is recorded, which is what makes an unused link visible.
  PERFORM assert_eq((SELECT last_used_at IS NOT NULL FROM wallet_management_tokens
                     WHERE token_hash = decode(test_hash('WMT1:aaa'), 'hex')),
                    TRUE, 'X2 use is timestamped');

  PERFORM assert_eq((SELECT count(*)::INT FROM resolve_wallet_management_token(test_hash('WMT1:never'))),
                    0, 'X3 an unknown link resolves nothing');
END $$;

-- The authorisation boundary is enforced by the shape of the return type: the
-- resolver is structurally incapable of handing back the things this
-- capability must never expose.
DO $$
DECLARE cols TEXT[];
BEGIN
  SELECT array_agg(p.proargnames[i])
    INTO cols
    FROM pg_proc p,
         LATERAL generate_subscripts(p.proargnames, 1) i
   WHERE p.proname = 'resolve_wallet_management_token';

  PERFORM assert_eq(('public_token' = ANY(cols)), FALSE, 'X4 cannot return the RSVP token');
  PERFORM assert_eq(('phone' = ANY(cols)), FALSE, 'X5 cannot return a phone number');
  PERFORM assert_eq(('email' = ANY(cols)), FALSE, 'X6 cannot return an email address');
  PERFORM assert_eq(('token_hash' = ANY(cols)), FALSE, 'X7 cannot return a credential hash');
  PERFORM assert_eq(('credential_id' = ANY(cols)), FALSE, 'X8 cannot return an admission credential');
END $$;

-- ===========================================================================
-- Y. Eligibility and revocation
-- ===========================================================================
DO $$
DECLARE res RECORD; n INT;
BEGIN
  -- A guest who has not confirmed still gets a resolvable link; the surface
  -- decides that there is no pass to show yet. Keeping the token valid means
  -- the same URL starts working the moment they confirm.
  PERFORM ensure_wallet_management_token(
    '44444444-0000-0000-0000-000000000201',
    test_hash('WMT1:pending'), test_ciphertext('WMT1:pending'), 1, 'rsvp_confirmation');
  SELECT * INTO res FROM resolve_wallet_management_token(test_hash('WMT1:pending'));
  PERFORM assert_eq(res.token_status, 'active', 'Y1 an unconfirmed guest still has a link');
  PERFORM assert_eq(res.rsvp_status, 'pending', 'Y1 and the surface can see they are not eligible');

  n := revoke_wallet_management_token('44444444-0000-0000-0000-000000000200', 'Guest forwarded it');
  PERFORM assert_eq(n, 1, 'Y2 revocation turns off the live link');
  SELECT * INTO res FROM resolve_wallet_management_token(test_hash('WMT1:aaa'));
  PERFORM assert_eq(res.token_status, 'revoked', 'Y2 the link no longer works');

  -- Revoking frees the slot, so a fresh link can be sent.
  PERFORM ensure_wallet_management_token(
    '44444444-0000-0000-0000-000000000200',
    test_hash('WMT1:replacement'), test_ciphertext('WMT1:replacement'), 1, 'admin');
  PERFORM assert_eq((SELECT count(*)::INT FROM wallet_management_tokens
                     WHERE guest_invitation_id = '44444444-0000-0000-0000-000000000200'
                       AND status = 'active'),
                    1, 'Y3 exactly one live link after re-issue');

  -- The revoked one stays dead.
  SELECT * INTO res FROM resolve_wallet_management_token(test_hash('WMT1:aaa'));
  PERFORM assert_eq(res.token_status, 'revoked', 'Y4 a revoked link is not resurrected');

  BEGIN
    PERFORM revoke_wallet_management_token('44444444-0000-0000-0000-000000000200', '  ');
    RAISE EXCEPTION 'FAIL: Y5 revocation without a reason was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    RAISE NOTICE 'pass: Y5 revocation requires a reason';
  END;
END $$;

-- Expiry is honoured on read, like an admission credential.
DO $$
DECLARE res RECORD;
BEGIN
  UPDATE wallet_management_tokens SET expires_at = now() - interval '1 hour'
   WHERE token_hash = decode(test_hash('WMT1:replacement'), 'hex');
  SELECT * INTO res FROM resolve_wallet_management_token(test_hash('WMT1:replacement'));
  PERFORM assert_eq(res.token_status, 'expired', 'Y6 a past expiry reads as expired');
END $$;

-- ===========================================================================
-- Z. Isolation from the other two capabilities
-- ===========================================================================
DO $$
DECLARE res RECORD; n INT;
BEGIN
  -- A wallet token is not an admission credential. Presenting one at a door
  -- must resolve nothing, whichever way round it is tried.
  PERFORM assert_eq((SELECT count(*)::INT
                     FROM resolve_admission_credential(test_hash('WMT1:replacement'))),
                    0, 'Z1 a wallet link cannot be resolved as an admission credential');

  -- And an admission credential is not a wallet token.
  PERFORM ensure_admission_credential(
    '44444444-0000-0000-0000-000000000200',
    test_hash('OP1:wallet-iso'), test_ciphertext('OP1:wallet-iso'), 1, 'entrance_pass_render');
  PERFORM assert_eq((SELECT count(*)::INT
                     FROM resolve_wallet_management_token(test_hash('OP1:wallet-iso'))),
                    0, 'Z2 an admission credential cannot open the pass surface');

  -- The two namespaces cannot collide in storage either.
  SELECT count(*)::INT INTO n
    FROM wallet_management_tokens w
    JOIN admission_credentials c ON c.token_hash = w.token_hash;
  PERFORM assert_eq(n, 0, 'Z3 no hash is shared between the two capabilities');

  -- Revoking a pass link must not disturb the guest's ability to be admitted:
  -- they may still have the ticket image itself.
  PERFORM revoke_wallet_management_token('44444444-0000-0000-0000-000000000200', 'isolation check');
  SELECT * INTO res FROM resolve_admission_credential(test_hash('OP1:wallet-iso'));
  PERFORM assert_eq(res.status, 'active', 'Z4 revoking a pass link leaves admission untouched');
END $$;

-- ===========================================================================
-- AA. Lockdown
-- ===========================================================================
DO $$
BEGIN
  PERFORM assert_eq(
    has_function_privilege('anon', 'ensure_wallet_management_token(uuid,text,text,int,text)', 'EXECUTE'),
    FALSE, 'AA1 anon cannot issue pass links');
  PERFORM assert_eq(
    has_function_privilege('anon', 'resolve_wallet_management_token(text)', 'EXECUTE'),
    FALSE, 'AA2 anon cannot resolve pass links');
  PERFORM assert_eq(
    has_function_privilege('authenticated', 'revoke_wallet_management_token(uuid,text)', 'EXECUTE'),
    FALSE, 'AA3 authenticated cannot revoke pass links');
  PERFORM assert_eq(
    has_function_privilege('service_role', 'resolve_wallet_management_token(text)', 'EXECUTE'),
    TRUE, 'AA4 service_role can resolve pass links');
  PERFORM assert_eq(
    (SELECT relrowsecurity FROM pg_class WHERE relname = 'wallet_management_tokens'),
    TRUE, 'AA5 RLS enabled on wallet_management_tokens');
END $$;

SELECT 'ALL WALLET TOKEN TESTS PASSED' AS status;
