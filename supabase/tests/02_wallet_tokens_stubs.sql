-- Additional stand-in for the wallet-token migration, applied on top of
-- 00_admission_counters_stubs.sql and 01_admission_credentials_stubs.sql.
--
-- resolve_wallet_management_token() returns the event details the pass surface
-- prints. Those columns come from 20260526000005 and 20260722000006, neither of
-- which is under test here; only their shape matters.

ALTER TABLE wedding_events
  ADD COLUMN IF NOT EXISTS event_type TEXT,
  ADD COLUMN IF NOT EXISTS partner1_name TEXT,
  ADD COLUMN IF NOT EXISTS partner2_name TEXT,
  ADD COLUMN IF NOT EXISTS ticket_language TEXT DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS venue_name TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;
