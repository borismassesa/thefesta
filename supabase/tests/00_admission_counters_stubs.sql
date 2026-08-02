-- Minimal stand-ins for the parts of the OpusPass schema that
-- 20260802210000_opuspass_admission_counters.sql touches, plus the legacy rows
-- that exercise every branch of its backfill.
--
-- Column definitions are copied verbatim from 20260526000005 (guest_invitations),
-- 20260630000001 (check-in fields) and 20260721000002 (checked_in_party_size),
-- so the real migration runs unmodified against them.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Roles are cluster-wide, so this file must survive a database recreate.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')          THEN CREATE ROLE anon NOLOGIN;          END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')  THEN CREATE ROLE service_role NOLOGIN;  END IF;
END $$;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

CREATE TABLE wedding_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT
);

CREATE TABLE guest_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  public_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex')
);

CREATE TABLE guest_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guest_contact_id UUID NOT NULL REFERENCES guest_contacts(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES wedding_events(id) ON DELETE CASCADE,

  rsvp_status TEXT NOT NULL DEFAULT 'pending',
  party_size INT NOT NULL DEFAULT 1,
  meal_choice TEXT,
  dietary_notes TEXT,
  guest_message TEXT,
  entry_code TEXT,

  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  checked_in_at TIMESTAMPTZ,
  checked_in_by TEXT,
  checked_in_door TEXT,
  checked_in_party_size INT,

  UNIQUE (guest_contact_id, event_id)
);

-- Rows that exist BEFORE the counter migration, covering every backfill case.
INSERT INTO users (id) VALUES ('11111111-1111-1111-1111-111111111111');
INSERT INTO wedding_events (id, user_id, name) VALUES
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Samuel & Julieth'),
  ('22222222-2222-2222-2222-222222222223', '11111111-1111-1111-1111-111111111111', 'Other event');

INSERT INTO guest_contacts (id, user_id, full_name) VALUES
  ('33333333-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Never Scanned'),
  ('33333333-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Partial Arrival'),
  ('33333333-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Legacy Full Party'),
  ('33333333-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Zero Party Size');

INSERT INTO guest_invitations
  (id, user_id, guest_contact_id, event_id, rsvp_status, party_size, checked_in_at, checked_in_party_size)
VALUES
  -- never scanned, party of 2 -> allowance 2, count 0
  ('44444444-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '33333333-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'attending', 2, NULL, NULL),
  -- RSVP'd 4, only 2 actually arrived -> allowance 4, count 2 (NOT 4)
  ('44444444-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   '33333333-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   'attending', 4, now(), 2),
  -- checked in before checked_in_party_size existed -> falls back to party_size
  ('44444444-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   '33333333-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222',
   'attending', 3, now(), NULL),
  -- pathological party_size 0 -> allowance must floor to 1
  ('44444444-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   '33333333-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222',
   'attending', 0, NULL, NULL);
