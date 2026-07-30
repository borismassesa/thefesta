-- Minimal stand-ins for the objects the commission migrations depend on.
-- Enough shape to compile and exercise the real migrations, nothing more.

-- Roles are cluster-wide, so this file must survive a database recreate.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')          THEN CREATE ROLE anon NOLOGIN;          END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')  THEN CREATE ROLE service_role NOLOGIN;  END IF;
END $$;

CREATE TABLE public.users (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  role  TEXT DEFAULT 'user'
);

CREATE TABLE public.wedding_events (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  starts_at TIMESTAMPTZ
);

CREATE TABLE public.workforce_employees (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id    TEXT,
  full_name        TEXT,
  dashboard_access BOOLEAN NOT NULL DEFAULT FALSE
);

-- The session-identity helpers. In production these read the Clerk JWT; here
-- they read a GUC so tests can impersonate.
CREATE OR REPLACE FUNCTION public.requesting_user_id() RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('test.user_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.is_workforce_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('test.is_admin', true)::boolean, false);
$$;

CREATE OR REPLACE FUNCTION public.is_workforce_reader() RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('test.is_reader', true)::boolean, false);
$$;
