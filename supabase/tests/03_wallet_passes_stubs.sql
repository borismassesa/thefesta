-- Additional stand-in for the wallet-pass migration.
--
-- wallet_passes reuses the shared updated_at trigger function defined in
-- 20260526000005_opus_pass_couple_dashboard.sql. That migration is not part of
-- the chain under test, and the wallet migration must NOT create the function
-- itself: production already has it, and redefining a shared function from a
-- feature migration is how unrelated tables acquire surprising behaviour.
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
