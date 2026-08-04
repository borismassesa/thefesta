-- Which admission identifiers a door accepts, per event.
--
-- Three identifiers can now reach /api/checkin/scan: the QR credential, the
-- legacy per-event entry_code, and the new globally unique pass_id. They
-- should not all be accepted forever, and they cannot be retired globally:
-- an event whose tickets are already PRINTED with an entry code must keep
-- accepting it, while an event created next month should not.
--
-- Modelled on legacyCredentialsAllowed() (credential-core.ts), which already
-- gates the legacy HMAC branch per event against the event's own dates rather
-- than a global switch.
--
-- NULL means "use the derived default", which is why these are nullable rather
-- than NOT NULL DEFAULT true. A boolean default would have to be chosen once,
-- now, for every event that will ever exist; a NULL lets the default keep
-- being computed from the event's dates as the retirement window moves. An
-- explicit true/false is an operator overriding that decision for one event,
-- and survives any later change to the default.

ALTER TABLE public.wedding_events
  ADD COLUMN IF NOT EXISTS accepts_credential BOOLEAN,
  ADD COLUMN IF NOT EXISTS accepts_entry_code BOOLEAN,
  ADD COLUMN IF NOT EXISTS accepts_pass_id BOOLEAN;

COMMENT ON COLUMN public.wedding_events.accepts_credential IS
  'Override for whether the scanned QR credential is accepted at this door. NULL = derived default (always accepted; it is the primary path).';

COMMENT ON COLUMN public.wedding_events.accepts_entry_code IS
  'Override for the legacy per-event entry code. NULL = derived default, which retires with the event so already-printed tickets keep working.';

COMMENT ON COLUMN public.wedding_events.accepts_pass_id IS
  'Override for the globally unique Pass ID. NULL = derived default (accepted for any event whose invitations carry one).';

-- Deliberately NO backfill. Writing an explicit true onto every existing row
-- would convert every event's default into a permanent override, and the next
-- change to the default would then silently skip every event that exists
-- today — which is the whole failure mode this design avoids.
