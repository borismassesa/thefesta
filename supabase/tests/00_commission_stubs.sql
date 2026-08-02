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
-- Supabase's storage and auth schemas. Only the shape the commission
-- migrations touch: the bucket registry, and the JWT accessor the designer
-- row-scoping policies read.
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  public             BOOLEAN NOT NULL DEFAULT FALSE,
  file_size_limit    BIGINT,
  allowed_mime_types TEXT[]
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id TEXT REFERENCES storage.buckets(id),
  name   TEXT
);

-- Impersonation hook: tests set test.clerk_sub to act as a given designer.
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('sub', NULLIF(current_setting('test.clerk_sub', true), ''));
$$;

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
