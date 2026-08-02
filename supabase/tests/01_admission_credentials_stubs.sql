-- Additional stand-in for the credential migration, applied on top of
-- 00_admission_counters_stubs.sql.
--
-- admission_credential_verifications records which door device presented a
-- credential, so it references scanner_access_tokens. That table is created by
-- 20260630000001_opuspass_checkin.sql, which is not part of either check-in
-- migration under test; only its shape matters here.

CREATE TABLE IF NOT EXISTS scanner_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES wedding_events(id) ON DELETE CASCADE,

  door_label TEXT NOT NULL DEFAULT 'Main Gate',
  attendant_name TEXT,
  token_hash TEXT NOT NULL UNIQUE,

  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
