-- OpusPass Wallet Entry Pass — PR 3: wallet management tokens
--
-- The guest-facing pass surface needs a URL that can be sent over WhatsApp.
-- It must NOT be either of the capabilities that already exist:
--
--   guest_contacts.public_token  is the RSVP capability. It can change an
--                                answer and expose the guest's own details,
--                                so a pass link must never carry it.
--   admission_credentials        is the door credential. Anything that can
--                                read it can be presented at a gate.
--
-- So this is a third, deliberately narrow capability: it may show a pass and
-- (from PR 4) hand it to a wallet. It may not change an RSVP, read a phone
-- number or admit anybody.
--
-- Same hash-plus-ciphertext shape as admission_credentials, and for the same
-- reason: a link already delivered to a WhatsApp thread cannot be recalled, so
-- re-sending has to reproduce the SAME URL rather than mint a new one and
-- silently break the message the guest already has.

CREATE TABLE IF NOT EXISTS wallet_management_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  guest_invitation_id UUID NOT NULL
    REFERENCES guest_invitations(id) ON DELETE CASCADE,

  -- SHA-256 of the raw token. The only value looked up.
  token_hash BYTEA NOT NULL,
  -- AES-256-GCM of the raw token, so the link can be re-sent unchanged.
  token_ciphertext BYTEA NOT NULL,
  encryption_key_version INTEGER NOT NULL,

  status TEXT NOT NULL DEFAULT 'active',
  -- Why the link was turned off. Demanded by revoke_wallet_management_token()
  -- and kept: "why is this guest's pass dead" is the whole question anyone
  -- asks later, and requiring a reason only to discard it is worse than not
  -- asking at all.
  revocation_reason TEXT,

  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,

  issuance_source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT wallet_management_tokens_hash_unique UNIQUE (token_hash),
  CONSTRAINT wallet_management_tokens_status_check
    CHECK (status IN ('active', 'revoked', 'expired'))
);

-- One live link per invitation. Without this a guest could accumulate several
-- working URLs, and revoking one would quietly leave the others open.
CREATE UNIQUE INDEX IF NOT EXISTS wallet_management_tokens_one_active_per_invitation
  ON wallet_management_tokens (guest_invitation_id)
  WHERE status = 'active';

ALTER TABLE wallet_management_tokens ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE wallet_management_tokens IS
  'Narrow guest capability for the /p/<token> pass surface. Never grants RSVP changes, guest contact details or admission.';

-- ---------------------------------------------------------------------------
-- Issuance
-- ---------------------------------------------------------------------------
--
-- Mirrors ensure_admission_credential: the caller generates a candidate, and
-- an existing active token wins so the URL stays stable across re-sends.

DROP FUNCTION IF EXISTS ensure_wallet_management_token(UUID, TEXT, TEXT, INT, TEXT);

CREATE FUNCTION ensure_wallet_management_token(
  p_guest_invitation_id UUID,
  p_token_hash_hex TEXT,
  p_token_ciphertext_hex TEXT,
  p_key_version INT,
  p_source TEXT
) RETURNS TABLE (
  result TEXT,
  token_id UUID,
  token_ciphertext_hex TEXT,
  encryption_key_version INT,
  created BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv_id UUID;
  v_tok    wallet_management_tokens;
  v_new_id UUID;
BEGIN
  SELECT id INTO v_inv_id FROM guest_invitations
   WHERE id = p_guest_invitation_id FOR UPDATE;
  IF v_inv_id IS NULL THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::TEXT, NULL::INT, FALSE;
    RETURN;
  END IF;

  UPDATE wallet_management_tokens
     SET status = 'expired'
   WHERE guest_invitation_id = p_guest_invitation_id
     AND status = 'active'
     AND expires_at IS NOT NULL
     AND expires_at <= now();

  SELECT * INTO v_tok FROM wallet_management_tokens
   WHERE guest_invitation_id = p_guest_invitation_id AND status = 'active';

  IF FOUND THEN
    RETURN QUERY SELECT 'existing'::TEXT, v_tok.id,
                        encode(v_tok.token_ciphertext, 'hex'),
                        v_tok.encryption_key_version, FALSE;
    RETURN;
  END IF;

  INSERT INTO wallet_management_tokens (
    guest_invitation_id, token_hash, token_ciphertext, encryption_key_version, issuance_source
  ) VALUES (
    p_guest_invitation_id, decode(p_token_hash_hex, 'hex'),
    decode(p_token_ciphertext_hex, 'hex'), p_key_version, p_source
  )
  RETURNING id INTO v_new_id;

  RETURN QUERY SELECT 'issued'::TEXT, v_new_id, p_token_ciphertext_hex, p_key_version, TRUE;
END;
$$;

REVOKE ALL ON FUNCTION ensure_wallet_management_token(UUID, TEXT, TEXT, INT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ensure_wallet_management_token(UUID, TEXT, TEXT, INT, TEXT)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Resolution
-- ---------------------------------------------------------------------------
--
-- Returns ONLY what the pass surface may show. No phone, no email, no RSVP
-- token, no admission credential: the authorisation boundary is expressed
-- here, in what the query is even capable of returning, rather than left to
-- every caller to remember.

DROP FUNCTION IF EXISTS resolve_wallet_management_token(TEXT);

CREATE FUNCTION resolve_wallet_management_token(p_token_hash_hex TEXT)
RETURNS TABLE (
  token_id UUID,
  token_status TEXT,
  guest_invitation_id UUID,
  event_id UUID,
  guest_name TEXT,
  rsvp_status TEXT,
  entry_allowance INT,
  checked_in_count INT,
  event_name TEXT,
  event_type TEXT,
  partner1_name TEXT,
  partner2_name TEXT,
  ticket_language TEXT,
  venue_name TEXT,
  city TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tok wallet_management_tokens;
BEGIN
  SELECT * INTO v_tok FROM wallet_management_tokens
   WHERE token_hash = decode(p_token_hash_hex, 'hex');

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_tok.status = 'active'
     AND v_tok.expires_at IS NOT NULL
     AND v_tok.expires_at <= now() THEN
    UPDATE wallet_management_tokens SET status = 'expired' WHERE id = v_tok.id;
    v_tok.status := 'expired';
  END IF;

  IF v_tok.status = 'active' THEN
    UPDATE wallet_management_tokens SET last_used_at = now() WHERE id = v_tok.id;
  END IF;

  RETURN QUERY
  SELECT v_tok.id, v_tok.status, gi.id, gi.event_id,
         gc.full_name, gi.rsvp_status, gi.entry_allowance, gi.checked_in_count,
         we.name, we.event_type, we.partner1_name, we.partner2_name,
         we.ticket_language, we.venue_name, we.city, we.starts_at, we.ends_at
    FROM guest_invitations gi
    JOIN guest_contacts gc ON gc.id = gi.guest_contact_id
    JOIN wedding_events we ON we.id = gi.event_id
   WHERE gi.id = v_tok.guest_invitation_id;
END;
$$;

REVOKE ALL ON FUNCTION resolve_wallet_management_token(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION resolve_wallet_management_token(TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- Revocation
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS revoke_wallet_management_token(UUID, TEXT);

CREATE FUNCTION revoke_wallet_management_token(
  p_guest_invitation_id UUID,
  p_reason TEXT
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'revoke_wallet_management_token requires a reason';
  END IF;

  WITH revoked AS (
    UPDATE wallet_management_tokens
       SET status = 'revoked', revoked_at = now(), revocation_reason = p_reason
     WHERE guest_invitation_id = p_guest_invitation_id
       AND status = 'active'
    RETURNING 1
  )
  SELECT count(*)::INT INTO v_count FROM revoked;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION revoke_wallet_management_token(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION revoke_wallet_management_token(UUID, TEXT) TO service_role;
