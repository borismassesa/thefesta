-- Guest identity: normalize phone numbers before comparing them, and enforce
-- "one number, one guest" in the DATABASE rather than only in app code.
--
-- The defect this fixes:
--   createGuest / bulkImportGuests compared `replace(phone, '\D', '')` — raw
--   digits. '0757200767' and '+255757200767' are the same Tanzanian number but
--   different digit strings, so the guard passed cleanly on a list that mixed
--   the two formats. Two guests then held one number, and every downstream
--   workflow (digital card, WhatsApp send, pledge request, entrance pass)
--   treated them as two recipients.
--
-- Two admins importing at once could also both pass an app-layer check before
-- either inserted. Only a unique index closes that.

-- ── 1) One definition of "the same number" ──────────────────────────────────
-- Mirrors normalizePhone() in src/lib/dashboard/share.ts. Both must agree, so
-- any change here needs the same change there (and vice versa). IMMUTABLE so
-- it can back a generated column and an index.
CREATE OR REPLACE FUNCTION public.opuspass_normalize_phone(raw TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    -- Empty / no digits at all is a genuine "no number", not a value to compare.
    WHEN d = '' THEN NULL
    -- Already carries the Tanzanian country code.
    WHEN d LIKE '255%' THEN d
    -- Local trunk form 0XXXXXXXXX.
    WHEN d LIKE '0%' THEN '255' || substr(d, 2)
    -- Mobile typed without the leading 0 (7XXXXXXXX / 6XXXXXXXX).
    WHEN d ~ '^[67][0-9]{8}$' THEN '255' || d
    -- Anything else already carries its own country code; we cannot guess one.
    ELSE d
  END
  FROM (SELECT regexp_replace(COALESCE(raw, ''), '\D', '', 'g') AS d) AS x;
$$;

COMMENT ON FUNCTION public.opuspass_normalize_phone(TEXT) IS
  'Canonical comparison form for a guest phone number. Keep in sync with normalizePhone() in src/lib/dashboard/share.ts.';

-- ── 2) The comparison key, derived not stored by hand ───────────────────────
-- Generated (not a plain column the app fills in) so it cannot drift from the
-- number it describes: a hand-maintained copy goes stale the first time a row
-- is updated by any path that forgets it, and that silent staleness is exactly
-- the class of bug this migration exists to remove.
--
-- Derived from whatsapp_phone-then-phone because that is the fallback every
-- send path already uses (entrance-pass-send.ts, sendWhatsAppInvites, pledge
-- sends). The number a message would actually go to is the number that decides
-- whether two guest records are one recipient.
ALTER TABLE public.guest_contacts
  ADD COLUMN IF NOT EXISTS phone_normalized TEXT
    GENERATED ALWAYS AS (
      public.opuspass_normalize_phone(
        COALESCE(NULLIF(whatsapp_phone, ''), phone)
      )
    ) STORED;

COMMENT ON COLUMN public.guest_contacts.phone_normalized IS
  'Derived comparison key for the number sends go to (whatsapp_phone, else phone). Never written directly.';

-- ── 3) The controlled exception ────────────────────────────────────────────
-- A shared number is sometimes legitimate: a husband and wife on one handset,
-- a parent holding invitations for the family, a coordinator receiving several.
-- Guests deliberately approved to share one number carry a common group id,
-- which lifts them out of the unique index below. It is NOT a way to silence
-- the warning: the surfaces still show the number as shared, and the reason /
-- approver / timestamp are recorded so the decision is attributable.
ALTER TABLE public.guest_contacts
  ADD COLUMN IF NOT EXISTS shared_contact_group_id UUID,
  ADD COLUMN IF NOT EXISTS shared_contact_reason TEXT,
  ADD COLUMN IF NOT EXISTS shared_contact_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shared_contact_approved_by TEXT;

COMMENT ON COLUMN public.guest_contacts.shared_contact_group_id IS
  'Set when an admin has deliberately approved several guests sharing one number. Lifts the row out of the uniqueness index; does not suppress the shared-contact warning.';

-- An override must be reasoned, not a bare flag.
ALTER TABLE public.guest_contacts
  DROP CONSTRAINT IF EXISTS guest_contacts_shared_contact_reasoned;
ALTER TABLE public.guest_contacts
  ADD CONSTRAINT guest_contacts_shared_contact_reasoned CHECK (
    shared_contact_group_id IS NULL
    OR (
      COALESCE(TRIM(shared_contact_reason), '') <> ''
      AND shared_contact_approved_at IS NOT NULL
      AND COALESCE(TRIM(shared_contact_approved_by), '') <> ''
    )
  );

-- ── 4) One number, one guest — enforced ────────────────────────────────────
-- Scoped per couple (user_id), NOT per event. guest_contacts carries no
-- event_id by design: 20260705000001_opuspass_unify_guest_roster.sql made one
-- guest row link to every one of the couple's events through guest_invitations
-- so RSVP, pledges, seating and check-in all attach to a single identity. A
-- per-event key would re-split the same person across a wedding and its
-- kitchen party and undo that.
--
-- Verified before writing this: zero existing rows in any account violate the
-- constraint, so it applies without a cleanup pass.
CREATE UNIQUE INDEX IF NOT EXISTS guest_contacts_user_phone_unique
  ON public.guest_contacts (user_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL
    AND shared_contact_group_id IS NULL;

-- Lookup path for the "who else uses this number?" check on manual entry and
-- import preview, which runs per keystroke and per imported row.
CREATE INDEX IF NOT EXISTS idx_guest_contacts_user_phone_normalized
  ON public.guest_contacts (user_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL;
