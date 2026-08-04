-- ============================================================================
-- Migration: Client Portal Authentication
-- Magic link + OTP auth for studio clients, session management
-- ============================================================================

-- This auth migration originally landed before the repository captured the
-- booking-lifecycle migration that creates studio_client_profiles. Production
-- already had the table; a zero-state replay does not. Declare the same base
-- shape idempotently here so the foreign key below is valid. The later schema
-- migration uses CREATE TABLE IF NOT EXISTS with this identical definition.
CREATE TABLE IF NOT EXISTS studio_client_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  phone text,
  whatsapp text,
  company text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE studio_client_profiles ENABLE ROW LEVEL SECURITY;

-- 1. Client sessions (httpOnly cookie-based)
CREATE TABLE IF NOT EXISTS studio_client_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES studio_client_profiles(id) ON DELETE CASCADE,
  session_token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE studio_client_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_studio_client_sessions_token ON studio_client_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_studio_client_sessions_client ON studio_client_sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_studio_client_sessions_expires ON studio_client_sessions(expires_at);

-- 2. Magic links / OTP codes
CREATE TABLE IF NOT EXISTS studio_client_magic_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code text NOT NULL,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE studio_client_magic_links ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_studio_client_magic_links_email ON studio_client_magic_links(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_studio_client_magic_links_token ON studio_client_magic_links(token);

-- 3. Extend client profiles
ALTER TABLE studio_client_profiles
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS portal_enabled boolean NOT NULL DEFAULT false;

-- 4. RLS policies for service_role
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'studio_client_sessions' AND policyname = 'service_role_all_studio_client_sessions') THEN
    CREATE POLICY "service_role_all_studio_client_sessions" ON studio_client_sessions
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'studio_client_magic_links' AND policyname = 'service_role_all_studio_client_magic_links') THEN
    CREATE POLICY "service_role_all_studio_client_magic_links" ON studio_client_magic_links
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 5. Cleanup function: expire old sessions and magic links
CREATE OR REPLACE FUNCTION cleanup_studio_client_auth()
RETURNS integer AS $$
DECLARE
  cleaned integer := 0;
  c integer;
BEGIN
  -- Expire sessions
  DELETE FROM studio_client_sessions WHERE expires_at < now();
  GET DIAGNOSTICS c = ROW_COUNT;
  cleaned := cleaned + c;

  -- Expire magic links older than 1 hour
  DELETE FROM studio_client_magic_links WHERE expires_at < now() - interval '1 hour';
  GET DIAGNOSTICS c = ROW_COUNT;
  cleaned := cleaned + c;

  RETURN cleaned;
END;
$$ LANGUAGE plpgsql;
