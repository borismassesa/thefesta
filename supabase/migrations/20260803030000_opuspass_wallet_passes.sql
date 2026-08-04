-- OpusPass Wallet Entry Pass — PR 4: provider pass records
--
-- Tracks what each wallet provider has been handed for an admission. This is
-- bookkeeping, NOT authority: the pass a guest holds in Apple or Google Wallet
-- is a view of the admission, and the door still validates the OP1 credential
-- against admission_credentials. Nothing here can admit anybody.
--
-- Deliberately one row per (invitation, provider): a guest may hold the same
-- pass in both wallets, and saving to a second device does not create a second
-- admission. The allowance in guest_invitations is what bounds entry.

CREATE TABLE IF NOT EXISTS wallet_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  guest_invitation_id UUID NOT NULL
    REFERENCES guest_invitations(id) ON DELETE CASCADE,

  provider TEXT NOT NULL CHECK (provider IN ('google', 'apple')),

  -- Provider-side identifiers. Nullable because an issuance can fail before
  -- the provider ever assigns them.
  provider_class_id TEXT,
  provider_object_id TEXT,

  status TEXT NOT NULL DEFAULT 'issued'
    CHECK (status IN ('issued', 'failed', 'revoked')),

  -- 0, not 1: a first attempt that FAILED must not be indistinguishable from a
  -- pass the guest actually saved. Set explicitly on insert below.
  pass_version INTEGER NOT NULL DEFAULT 0,
  last_issued_at TIMESTAMPTZ,

  -- A short code only. Provider error payloads echo the request, which for
  -- Google includes the signed JWT, and the credential base64url-decodes
  -- straight out of that. The length bound is what keeps that discipline in
  -- the schema rather than only in the one caller that currently respects it.
  last_error_code TEXT CHECK (last_error_code IS NULL OR length(last_error_code) <= 64),

  -- Why the provider records were stood down. revoke_wallet_passes() demands a
  -- reason; discarding it would make the requirement pointless.
  revocation_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT wallet_passes_one_per_provider UNIQUE (guest_invitation_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_wallet_passes_invitation
  ON wallet_passes (guest_invitation_id);
CREATE INDEX IF NOT EXISTS idx_wallet_passes_provider_status
  ON wallet_passes (provider, status);

ALTER TABLE wallet_passes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE wallet_passes IS
  'Bookkeeping of what each wallet provider holds for an admission. Never authoritative for entry: the door validates the OP1 credential, not this table.';

DROP TRIGGER IF EXISTS trg_wallet_passes_updated_at ON wallet_passes;
CREATE TRIGGER trg_wallet_passes_updated_at
  BEFORE UPDATE ON wallet_passes FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_timestamp();

-- ---------------------------------------------------------------------------
-- Record an issuance attempt
-- ---------------------------------------------------------------------------
--
-- Upsert rather than insert: a guest re-opening their pass page re-issues, and
-- the same (invitation, provider) row simply advances. pass_version increments
-- only on a successful issue, so it counts what the guest could actually have
-- saved rather than how many times a failing provider was retried.

DROP FUNCTION IF EXISTS record_wallet_pass(UUID, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE FUNCTION record_wallet_pass(
  p_guest_invitation_id UUID,
  p_provider TEXT,
  p_status TEXT,
  p_class_id TEXT DEFAULT NULL,
  p_object_id TEXT DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL
) RETURNS TABLE (
  result TEXT,
  pass_id UUID,
  pass_version INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row wallet_passes;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM guest_invitations WHERE id = p_guest_invitation_id) THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, 0;
    RETURN;
  END IF;

  INSERT INTO wallet_passes (
    guest_invitation_id, provider, status, provider_class_id, provider_object_id,
    last_error_code, last_issued_at, pass_version
  ) VALUES (
    p_guest_invitation_id, p_provider, p_status, p_class_id, p_object_id,
    left(p_error_code, 64),
    CASE WHEN p_status = 'issued' THEN now() ELSE NULL END,
    CASE WHEN p_status = 'issued' THEN 1 ELSE 0 END
  )
  ON CONFLICT (guest_invitation_id, provider) DO UPDATE
  -- Revocation is sticky. Without this a later issuance attempt flips a
  -- revoked row back to 'issued', and the table starts over-reporting live
  -- passes for admissions that were deliberately withdrawn.
  SET status = CASE
        WHEN wallet_passes.status = 'revoked' THEN 'revoked'
        ELSE EXCLUDED.status
      END,
      -- COALESCE so a failed retry does not erase the identifiers of a pass
      -- the guest already holds.
      provider_class_id = COALESCE(EXCLUDED.provider_class_id, wallet_passes.provider_class_id),
      provider_object_id = COALESCE(EXCLUDED.provider_object_id, wallet_passes.provider_object_id),
      last_error_code = EXCLUDED.last_error_code,
      -- last_issued_at and pass_version both describe a pass a guest could
      -- actually be holding, so a revoked row pins them for the same reason it
      -- pins status. Otherwise an issuance against a withdrawn admission
      -- leaves the row reading 'revoked' while these two go on advancing, and
      -- the table reports a live pass in the columns anyone would consult to
      -- ask how many there are.
      --
      -- Enforced here rather than in the caller: issue.ts checks the
      -- credential before it ever gets this far, and the next caller should
      -- not have to know that it must.
      last_issued_at = CASE
        WHEN wallet_passes.status = 'revoked' THEN wallet_passes.last_issued_at
        ELSE COALESCE(EXCLUDED.last_issued_at, wallet_passes.last_issued_at)
      END,
      pass_version = wallet_passes.pass_version
        + CASE
            WHEN wallet_passes.status = 'revoked' THEN 0
            WHEN EXCLUDED.status = 'issued' THEN 1
            ELSE 0
          END
  RETURNING * INTO v_row;

  RETURN QUERY SELECT 'recorded'::TEXT, v_row.id, v_row.pass_version;
END;
$$;

REVOKE ALL ON FUNCTION record_wallet_pass(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_wallet_pass(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Revoke
-- ---------------------------------------------------------------------------
--
-- Marks the provider records dead when an admission is withdrawn. It does NOT
-- reach into Apple or Google: the pass may still sit on the guest's phone, and
-- that is fine, because the credential behind it is what the door checks and
-- revoking the credential is what actually stops entry.

DROP FUNCTION IF EXISTS revoke_wallet_passes(UUID, TEXT);

CREATE FUNCTION revoke_wallet_passes(
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
    RAISE EXCEPTION 'revoke_wallet_passes requires a reason';
  END IF;

  WITH revoked AS (
    UPDATE wallet_passes
       -- last_error_code is left alone: it is the diagnostic for a pass that
       -- failed before being withdrawn, and erasing it loses that.
       SET status = 'revoked', revocation_reason = left(p_reason, 200)
     WHERE guest_invitation_id = p_guest_invitation_id
       AND status <> 'revoked'
    RETURNING 1
  )
  SELECT count(*)::INT INTO v_count FROM revoked;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION revoke_wallet_passes(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION revoke_wallet_passes(UUID, TEXT) TO service_role;
