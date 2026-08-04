-- Separate "these guests are flagged as sharing a number" from "an admin has
-- confirmed they may both be sent to".
--
-- 20260804160000 added shared_contact_group_id to lift deliberately-shared
-- handsets out of the uniqueness index. It was then also used to hold a pair
-- that is NOT resolved — Mama Meena and Mr & Mrs Msuya, whose shared number
-- is still awaiting a coordinator decision — because there was nowhere else
-- to put them.
--
-- That conflation is dangerous once delivery is gated on this data: a pair
-- parked pending a decision would read as approved and both guests would be
-- sent to, which is the exact outcome the whole feature exists to prevent.
--
-- So the group id now means only "these rows share a number, on purpose or
-- pending review". Confirmation is a separate, explicit act.

ALTER TABLE public.guest_contacts
  ADD COLUMN IF NOT EXISTS shared_contact_confirmed BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.guest_contacts.shared_contact_confirmed IS
  'True only when an admin has confirmed these guests may BOTH receive messages on the shared number. False means the sharing is recorded but unresolved: the guests are not deliverable.';

COMMENT ON COLUMN public.guest_contacts.shared_contact_group_id IS
  'Set when several guests share one number, whether deliberately or pending review. Lifts the row out of the uniqueness index. Deliverability is decided by shared_contact_confirmed, NOT by this column.';

-- Existing overrides stay unconfirmed. There is exactly one group today (the
-- Meena / Msuya pair) and it is precisely the case that must not be sent to
-- until someone decides. Defaulting these to true would auto-approve the only
-- unresolved conflict on the system.
