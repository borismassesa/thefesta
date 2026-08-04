-- Pass ID: a short, stable, human-speakable identifier for one admission.
--
-- An invitation already carries two identifiers, and neither works at a door
-- when something goes wrong:
--
--   - The entrance-pass QR holds a signed HMAC token (~200 chars). Fine for a
--     camera, impossible to read aloud.
--   - entry_code (20260721000003) is 6 characters but unique only WITHIN an
--     event, so it cannot be looked up without first knowing which event the
--     guest belongs to. At a venue running a wedding and a kitchen party on
--     the same day, "what's your code" is ambiguous.
--
-- Pass ID is globally unique, so an attendant can find one admission from the
-- identifier alone. It is an IDENTIFIER, NOT A CREDENTIAL: presenting one
-- still goes through every server-side check a scan does, and admitting
-- without a scan still requires the manual-reason workflow. Guessing a Pass ID
-- is no more useful than guessing a guest's name off the list.
--
-- SCHEMA ONLY. The read-only lookup endpoint, the scanner UI, ticket
-- rendering, wallet field and per-event acceptance flags are deliberately a
-- separate change, so this migration stays independently reversible.

-- ── 1) The column, nullable to begin with ──────────────────────────────────
-- Added nullable and tightened at the end, so the backfill has somewhere to
-- write and a half-applied migration never leaves the table unusable.
ALTER TABLE public.guest_invitations
  ADD COLUMN IF NOT EXISTS pass_id TEXT;

COMMENT ON COLUMN public.guest_invitations.pass_id IS
  'Globally unique, human-speakable admission identifier. NOT a credential: presenting one is subject to the same checks as a scan.';

-- ── 2) Generation ──────────────────────────────────────────────────────────
-- Crockford-style base32 (no I, L, O or U), the same alphabet as entry_code
-- and the door access code, so nothing is confusable with 1 or 0 when read off
-- a ticket or spelled down a phone line.
--
-- EIGHT characters. 32^8 is about 1.1e12, so across n issued passes the
-- expected number of collisions is roughly n^2/2N: at one million passes that
-- is ~0.45 in total, each absorbed by the bounded retry below. Eight also
-- stays comfortable to read aloud. Revisit only approaching a million passes.
--
-- Deliberately NOT derived from anything. Not a UUID (unreadable at a door),
-- not the phone number (changes, and leaks a contact detail to anyone who
-- overhears it), not a timestamp (leaks signup order and collides in bursts),
-- not event initials plus a counter (renaming an event would orphan every
-- pass, and a counter tells a guest how many were issued before them). The
-- temptation to make this "meaningful" will come back; it should be refused.
--
-- gen_random_bytes, not random(): random() is a per-session PRNG and is
-- predictable from earlier outputs. This ID will back a lookup endpoint, so
-- predictable values would let someone walk the guest list. 256 is an exact
-- multiple of 32, so the modulo below introduces no bias.
CREATE OR REPLACE FUNCTION public.opuspass_generate_pass_id()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  alphabet CONSTANT TEXT := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  bytes BYTEA := gen_random_bytes(8);
  result TEXT := '';
  i INT;
BEGIN
  FOR i IN 0..7 LOOP
    result := result || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  END LOOP;
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.opuspass_generate_pass_id() FROM PUBLIC;

-- ── 3) Assign on insert ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.opuspass_set_pass_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  candidate TEXT;
  attempts INT := 0;
BEGIN
  -- An explicitly supplied pass_id is honoured, so a restore or a data fix can
  -- carry the original identifier rather than reissuing every guest's pass.
  IF NEW.pass_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  LOOP
    candidate := public.opuspass_generate_pass_id();
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.guest_invitations WHERE pass_id = candidate
    );
    attempts := attempts + 1;
    -- Bail rather than spin. At 32^8 this branch should never be reached;
    -- reaching it means something is wrong with the generator, and failing
    -- loudly beats hanging an insert.
    IF attempts >= 10 THEN
      RAISE EXCEPTION 'Could not allocate a unique pass_id after % attempts', attempts;
    END IF;
  END LOOP;

  NEW.pass_id := candidate;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.opuspass_set_pass_id() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_guest_invitations_pass_id ON public.guest_invitations;
CREATE TRIGGER trg_guest_invitations_pass_id
  BEFORE INSERT ON public.guest_invitations
  FOR EACH ROW EXECUTE FUNCTION public.opuspass_set_pass_id();

-- ── 4) Backfill ────────────────────────────────────────────────────────────
-- Batched. The table is small today (hundreds of rows), so this is about not
-- writing a migration that becomes a problem later rather than solving one
-- now. Each row re-checks against rows already assigned in this same run,
-- which is why it is a loop and not one set-based UPDATE: a single UPDATE
-- calling the generator per row cannot see its own earlier writes, so two rows
-- in the same statement could take the same value.
DO $$
DECLARE
  row_id UUID;
  candidate TEXT;
  assigned INT := 0;
BEGIN
  LOOP
    FOR row_id IN
      SELECT id FROM public.guest_invitations WHERE pass_id IS NULL LIMIT 500
    LOOP
      LOOP
        candidate := public.opuspass_generate_pass_id();
        EXIT WHEN NOT EXISTS (
          SELECT 1 FROM public.guest_invitations WHERE pass_id = candidate
        );
      END LOOP;
      UPDATE public.guest_invitations SET pass_id = candidate WHERE id = row_id;
      assigned := assigned + 1;
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.guest_invitations WHERE pass_id IS NULL);
  END LOOP;
  RAISE NOTICE 'pass_id backfill assigned % rows', assigned;
END $$;

-- ── 5) Validate before constraining ────────────────────────────────────────
-- Fail the migration here rather than at the index, where the error would name
-- a constraint instead of the actual problem.
DO $$
DECLARE
  unassigned INT;
  duplicated INT;
BEGIN
  SELECT count(*) INTO unassigned FROM public.guest_invitations WHERE pass_id IS NULL;
  IF unassigned > 0 THEN
    RAISE EXCEPTION 'pass_id backfill incomplete: % rows still NULL', unassigned;
  END IF;

  SELECT count(*) INTO duplicated FROM (
    SELECT pass_id FROM public.guest_invitations GROUP BY pass_id HAVING count(*) > 1
  ) d;
  IF duplicated > 0 THEN
    RAISE EXCEPTION 'pass_id backfill produced % duplicated values', duplicated;
  END IF;
END $$;

-- ── 6) Constraints ─────────────────────────────────────────────────────────
-- A PLAIN unique index, not CONCURRENTLY. Every migration in this repo applies
-- inside a transaction (both via the CLI and via apply_migration), and
-- CONCURRENTLY cannot run in one. At this table's size the brief ACCESS
-- EXCLUSIVE lock is milliseconds. Do not "improve" this to CONCURRENTLY
-- without first changing how migrations are applied.
--
-- Globally unique, unlike entry_code's (event_id, entry_code): the whole point
-- is to identify an admission without already knowing its event.
CREATE UNIQUE INDEX IF NOT EXISTS idx_guest_invitations_pass_id
  ON public.guest_invitations (pass_id);

-- Shape is enforced so a hand-written fix cannot introduce a lowercase or
-- ambiguous value that then fails to match what is printed on a ticket.
ALTER TABLE public.guest_invitations
  DROP CONSTRAINT IF EXISTS guest_invitations_pass_id_format;
ALTER TABLE public.guest_invitations
  ADD CONSTRAINT guest_invitations_pass_id_format
  CHECK (pass_id ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$');

ALTER TABLE public.guest_invitations
  ALTER COLUMN pass_id SET NOT NULL;
