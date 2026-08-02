-- OpusPass Wallet Entry Pass — PR 2: opaque admission credentials
--
-- The entrance-pass QR today is `base64url(JSON).hmac`, so anyone holding
-- their own ticket can decode their `invitationId` and `guestContactId`. The
-- signature stops forgery but not disclosure, and those ids are the same
-- values the check-in RPCs key on. This replaces the payload with an opaque
-- random credential that means nothing on its own:
--
--   OP1:<base64url, 256 bits of randomness>
--
-- Only SHA-256(credential) is used for lookup, so the database never holds a
-- value that could admit anyone.
--
-- Does NOT change the admission-counter contract from 20260802210000.
-- checkin_admit_guest() is untouched; credential resolution happens before it
-- is called, and the credential is recorded alongside its ledger row.
--
-- WHY A CIPHERTEXT COLUMN: a hash cannot be reversed, but the entrance-pass
-- image is re-rendered on demand (Meta refetches it at WhatsApp send time,
-- and guests reopen the link). Without a recoverable copy, every render would
-- have to rotate the credential and invalidate every ticket already sitting
-- in a guest's WhatsApp thread. So the raw value is kept under authenticated
-- encryption, readable only by the pass-rendering service, and never used for
-- lookup.

-- ---------------------------------------------------------------------------
-- 1) Credentials
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS admission_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- One invitation is the ownership boundary. Cascade because a credential
  -- has no meaning without the admission it admits to.
  guest_invitation_id UUID NOT NULL
    REFERENCES guest_invitations(id) ON DELETE CASCADE,

  -- SHA-256 of the raw credential. The ONLY thing looked up.
  token_hash BYTEA NOT NULL,
  token_prefix TEXT NOT NULL DEFAULT 'OP1',

  -- AES-256-GCM of the raw credential (nonce || ciphertext || tag), readable
  -- only by the pass renderer. Never queried, never logged, never returned to
  -- a scanner.
  token_ciphertext BYTEA NOT NULL,
  encryption_key_version INTEGER NOT NULL,

  status TEXT NOT NULL DEFAULT 'active',
  credential_version INTEGER NOT NULL DEFAULT 1,

  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,

  replaced_by_credential_id UUID REFERENCES admission_credentials(id),

  -- Which flow minted this: entrance_pass_render, rotation, admin, ...
  issuance_source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT admission_credentials_token_hash_unique UNIQUE (token_hash),
  CONSTRAINT admission_credentials_status_check
    CHECK (status IN ('active', 'revoked', 'expired', 'superseded')),
  CONSTRAINT admission_credentials_prefix_check
    CHECK (token_prefix = 'OP1')
);

-- At most one credential can admit a given guest at a time. Without this,
-- rotation would leave the old QR working alongside the new one, which is
-- precisely what rotation exists to prevent.
CREATE UNIQUE INDEX IF NOT EXISTS admission_credentials_one_active_per_invitation
  ON admission_credentials (guest_invitation_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_admission_credentials_invitation
  ON admission_credentials (guest_invitation_id, issued_at DESC);

ALTER TABLE admission_credentials ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE admission_credentials IS
  'Opaque OP1 admission credentials. Lookup is by token_hash only; token_ciphertext exists solely so the entrance-pass renderer can redraw an existing ticket without rotating it.';
COMMENT ON COLUMN admission_credentials.token_ciphertext IS
  'AES-256-GCM(raw credential). Decryptable only by the pass-rendering service. Never query, log or transmit this.';

-- ---------------------------------------------------------------------------
-- 2) Credential lifecycle audit
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS admission_credential_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id UUID REFERENCES admission_credentials(id) ON DELETE SET NULL,
  guest_invitation_id UUID NOT NULL REFERENCES guest_invitations(id) ON DELETE CASCADE,

  action TEXT NOT NULL CHECK (action IN ('issued', 'rotated', 'revoked', 'expired')),
  -- Mandatory for manual revocation and rotation; the migration path and
  -- automatic expiry supply their own.
  reason TEXT,
  source TEXT NOT NULL,
  actor TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_admission_credential_events_invitation
  ON admission_credential_events (guest_invitation_id, created_at DESC);

ALTER TABLE admission_credential_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3) Verification audit
-- ---------------------------------------------------------------------------
--
-- Separate from checkin_scan_events because a verification can fail before any
-- invitation is known (an unknown or malformed credential), and that table
-- requires an invitation. This is also where the evidence for retiring the
-- legacy HMAC branch accumulates.

CREATE TABLE IF NOT EXISTS admission_credential_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Always known: it comes from the authorised scanner route, never from the
  -- credential.
  event_id UUID NOT NULL REFERENCES wedding_events(id) ON DELETE CASCADE,

  credential_id UUID REFERENCES admission_credentials(id) ON DELETE SET NULL,
  guest_invitation_id UUID REFERENCES guest_invitations(id) ON DELETE SET NULL,

  credential_format TEXT NOT NULL
    CHECK (credential_format IN ('opaque_v1', 'legacy_hmac', 'unparseable')),
  credential_status_at_scan TEXT,
  verification_result TEXT NOT NULL,

  -- First 12 hex characters of SHA-256(raw). Enough to correlate repeated
  -- attempts during an incident, far too little to reverse.
  token_fingerprint TEXT,

  scanner_access_token_id UUID REFERENCES scanner_access_tokens(id) ON DELETE SET NULL,
  request_id UUID,

  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_credential_verifications_event
  ON admission_credential_verifications (event_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_credential_verifications_format
  ON admission_credential_verifications (credential_format, occurred_at DESC);

ALTER TABLE admission_credential_verifications ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE admission_credential_verifications IS
  'Every credential verification attempt, including failures with no resolvable invitation. Query credential_format = legacy_hmac to decide when the compatibility branch can be removed.';

-- Tag the admission ledger with the credential that opened it. Nullable
-- because a manual roster admission has no credential at all.
ALTER TABLE checkin_scan_events
  ADD COLUMN IF NOT EXISTS credential_id UUID REFERENCES admission_credentials(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS credential_format TEXT;

-- ---------------------------------------------------------------------------
-- 4) Issuance
-- ---------------------------------------------------------------------------
--
-- Hash and ciphertext arrive as hex TEXT rather than BYTEA: PostgREST sends
-- JSON, and hex avoids every bytea-over-the-wire escaping question. They are
-- decoded here and stored as BYTEA.
--
-- The caller always generates a candidate credential before calling. If an
-- active one already exists, the candidate is discarded and the stored
-- ciphertext comes back for decryption, so re-rendering a ticket never
-- rotates it.

DROP FUNCTION IF EXISTS ensure_admission_credential(UUID, TEXT, TEXT, INT, TEXT);

CREATE FUNCTION ensure_admission_credential(
  p_guest_invitation_id UUID,
  p_token_hash_hex TEXT,
  p_token_ciphertext_hex TEXT,
  p_key_version INT,
  p_source TEXT
) RETURNS TABLE (
  result TEXT,
  credential_id UUID,
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
  v_cred   admission_credentials;
  v_new_id UUID;
BEGIN
  -- Lock the invitation, not the credential: two concurrent first-time
  -- issuances have no credential row to contend on, so the invitation is the
  -- only thing they share. The partial unique index is the backstop.
  SELECT id INTO v_inv_id FROM guest_invitations
   WHERE id = p_guest_invitation_id FOR UPDATE;

  IF v_inv_id IS NULL THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::TEXT, NULL::INT, FALSE;
    RETURN;
  END IF;

  -- Lazily retire anything past its expiry so the partial unique index frees
  -- up and the guest can be issued a fresh credential.
  UPDATE admission_credentials
     SET status = 'expired'
   WHERE guest_invitation_id = p_guest_invitation_id
     AND status = 'active'
     AND expires_at IS NOT NULL
     AND expires_at <= now();

  SELECT * INTO v_cred FROM admission_credentials
   WHERE guest_invitation_id = p_guest_invitation_id AND status = 'active';

  IF FOUND THEN
    RETURN QUERY SELECT 'existing'::TEXT, v_cred.id,
                        encode(v_cred.token_ciphertext, 'hex'),
                        v_cred.encryption_key_version, FALSE;
    RETURN;
  END IF;

  INSERT INTO admission_credentials (
    guest_invitation_id, token_hash, token_ciphertext, encryption_key_version, issuance_source
  ) VALUES (
    p_guest_invitation_id, decode(p_token_hash_hex, 'hex'),
    decode(p_token_ciphertext_hex, 'hex'), p_key_version, p_source
  )
  RETURNING id INTO v_new_id;

  INSERT INTO admission_credential_events (credential_id, guest_invitation_id, action, source)
  VALUES (v_new_id, p_guest_invitation_id, 'issued', p_source);

  RETURN QUERY SELECT 'issued'::TEXT, v_new_id, p_token_ciphertext_hex, p_key_version, TRUE;
END;
$$;

REVOKE ALL ON FUNCTION ensure_admission_credential(UUID, TEXT, TEXT, INT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ensure_admission_credential(UUID, TEXT, TEXT, INT, TEXT)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 5) Resolution
-- ---------------------------------------------------------------------------
--
-- Returns facts, not a verdict. The caller maps them to a public response,
-- because the door must never learn the difference between "revoked" and
-- "never existed" — that distinction is a credential-enumeration oracle.
--
-- Deliberately does NOT take an event id: resolution yields an invitation, and
-- the caller binds that to the event it already authorised the scanner for.
-- Accepting event identity from anything reachable via the credential would
-- defeat the binding.

DROP FUNCTION IF EXISTS resolve_admission_credential(TEXT);

CREATE FUNCTION resolve_admission_credential(p_token_hash_hex TEXT)
RETURNS TABLE (
  credential_id UUID,
  guest_invitation_id UUID,
  event_id UUID,
  status TEXT,
  rsvp_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cred admission_credentials;
  v_inv  guest_invitations;
BEGIN
  SELECT * INTO v_cred FROM admission_credentials
   WHERE token_hash = decode(p_token_hash_hex, 'hex');

  IF NOT FOUND THEN
    RETURN; -- no rows: unknown credential
  END IF;

  -- An expired-but-still-marked-active credential must read as expired even
  -- if nothing has swept it yet.
  IF v_cred.status = 'active'
     AND v_cred.expires_at IS NOT NULL
     AND v_cred.expires_at <= now() THEN
    UPDATE admission_credentials SET status = 'expired' WHERE id = v_cred.id;
    v_cred.status := 'expired';
  END IF;

  SELECT * INTO v_inv FROM guest_invitations WHERE id = v_cred.guest_invitation_id;

  RETURN QUERY SELECT v_cred.id, v_cred.guest_invitation_id, v_inv.event_id,
                      v_cred.status, v_inv.rsvp_status;
END;
$$;

REVOKE ALL ON FUNCTION resolve_admission_credential(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION resolve_admission_credential(TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 6) Rotation and revocation
-- ---------------------------------------------------------------------------
--
-- The partial unique index is enforced per statement, so the old credential
-- must be stood down BEFORE the replacement is inserted. Doing it in this
-- order inside one transaction means there is never a visible moment with two
-- active credentials, and never a moment with none.

DROP FUNCTION IF EXISTS rotate_admission_credential(UUID, TEXT, TEXT, INT, TEXT, TEXT, TEXT);

CREATE FUNCTION rotate_admission_credential(
  p_guest_invitation_id UUID,
  p_token_hash_hex TEXT,
  p_token_ciphertext_hex TEXT,
  p_key_version INT,
  p_reason TEXT,
  p_source TEXT,
  p_actor TEXT DEFAULT NULL
) RETURNS TABLE (
  result TEXT,
  credential_id UUID,
  superseded_credential_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv_id UUID;
  v_old    admission_credentials;
  v_new_id UUID;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'rotate_admission_credential requires a reason';
  END IF;

  SELECT id INTO v_inv_id FROM guest_invitations
   WHERE id = p_guest_invitation_id FOR UPDATE;
  IF v_inv_id IS NULL THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  SELECT * INTO v_old FROM admission_credentials
   WHERE guest_invitation_id = p_guest_invitation_id AND status = 'active';

  IF FOUND THEN
    UPDATE admission_credentials
       SET status = 'superseded', superseded_at = now()
     WHERE id = v_old.id;
  END IF;

  INSERT INTO admission_credentials (
    guest_invitation_id, token_hash, token_ciphertext, encryption_key_version,
    issuance_source, credential_version
  ) VALUES (
    p_guest_invitation_id, decode(p_token_hash_hex, 'hex'),
    decode(p_token_ciphertext_hex, 'hex'), p_key_version, p_source,
    COALESCE(v_old.credential_version, 0) + 1
  )
  RETURNING id INTO v_new_id;

  IF v_old.id IS NOT NULL THEN
    UPDATE admission_credentials
       SET replaced_by_credential_id = v_new_id
     WHERE id = v_old.id;
  END IF;

  INSERT INTO admission_credential_events (
    credential_id, guest_invitation_id, action, reason, source, actor
  ) VALUES (
    v_new_id, p_guest_invitation_id, 'rotated', p_reason, p_source, p_actor
  );

  RETURN QUERY SELECT 'rotated'::TEXT, v_new_id, v_old.id;
END;
$$;

REVOKE ALL ON FUNCTION rotate_admission_credential(UUID, TEXT, TEXT, INT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rotate_admission_credential(UUID, TEXT, TEXT, INT, TEXT, TEXT, TEXT)
  TO service_role;

DROP FUNCTION IF EXISTS revoke_admission_credential(UUID, TEXT, TEXT);

CREATE FUNCTION revoke_admission_credential(
  p_credential_id UUID,
  p_reason TEXT,
  p_actor TEXT DEFAULT NULL
) RETURNS TABLE (result TEXT, credential_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cred admission_credentials;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'revoke_admission_credential requires a reason';
  END IF;

  UPDATE admission_credentials
     SET status = 'revoked', revoked_at = now()
   WHERE id = p_credential_id AND status = 'active'
  RETURNING * INTO v_cred;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_active'::TEXT, p_credential_id;
    RETURN;
  END IF;

  INSERT INTO admission_credential_events (
    credential_id, guest_invitation_id, action, reason, source, actor
  ) VALUES (
    v_cred.id, v_cred.guest_invitation_id, 'revoked', p_reason, 'admin', p_actor
  );

  RETURN QUERY SELECT 'revoked'::TEXT, v_cred.id;
END;
$$;

REVOKE ALL ON FUNCTION revoke_admission_credential(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION revoke_admission_credential(UUID, TEXT, TEXT) TO service_role;

DROP FUNCTION IF EXISTS expire_admission_credentials_for_event(UUID, TEXT);

CREATE FUNCTION expire_admission_credentials_for_event(
  p_event_id UUID,
  p_reason TEXT DEFAULT 'event closed'
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  WITH expired AS (
    UPDATE admission_credentials ac
       SET status = 'expired'
      FROM guest_invitations gi
     WHERE ac.guest_invitation_id = gi.id
       AND gi.event_id = p_event_id
       AND ac.status = 'active'
    RETURNING ac.id, ac.guest_invitation_id
  ),
  logged AS (
    INSERT INTO admission_credential_events (
      credential_id, guest_invitation_id, action, reason, source
    )
    SELECT id, guest_invitation_id, 'expired', p_reason, 'event_close' FROM expired
    RETURNING 1
  )
  SELECT count(*)::INT INTO v_count FROM logged;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION expire_admission_credentials_for_event(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION expire_admission_credentials_for_event(UUID, TEXT) TO service_role;
