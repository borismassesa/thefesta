-- Let staff clear an order off the unattributed banner without deleting it.
--
-- THE PROBLEM
--
-- `invitation_orders.user_id` is NULL for every guest checkout, and the banner
-- on OpusPass, Couple Accounts lists all of them so the revenue is not lost
-- track of. But the banner has only one exit: attach the order to an account.
-- Orders that will never be attached — a card bought by someone who never
-- signed up, a duplicate, a test payment, or an order detached by deleting the
-- couple it belonged to — sit there forever. 27 had accumulated, worth
-- TZS 8.8m, and a permanent 27-item warning is a warning nobody reads.
--
-- The tempting fix, deleting them, is the wrong one. These are settled
-- payments: they reconcile against Selcom records and they are counted in
-- Finance. An admin screen must not be able to make real revenue disappear
-- because a list looked untidy.
--
-- THE FIX
--
-- Mark the order reviewed instead. It stays in the table, stays in every
-- revenue total, and simply stops being flagged as needing attention. Nothing
-- about the money changes; only whether staff are still being asked about it.
--
-- Deliberately NOT reusing `reviewed_at` / `reviewed_by` / `review_note`. Those
-- belong to manual payment review — did this payment actually clear — which is
-- a different question from "have we finished deciding who this order belongs
-- to". Overloading them would make a dismissed order look like an approved
-- payment.
--
-- Reversible on purpose: setting the column back to NULL returns the order to
-- the banner, so a mistaken dismiss costs a click, not a payment record.

alter table public.invitation_orders
  add column if not exists unattributed_dismissed_at timestamptz,
  add column if not exists unattributed_dismissed_by text,
  add column if not exists unattributed_dismissed_reason text;

comment on column public.invitation_orders.unattributed_dismissed_at is
  'Set when staff confirmed this unattached order needs no account link. Hides it from the unattributed banner on OpusPass, Couple Accounts. Has NO effect on the order, its status, or any revenue total. Null returns it to the banner.';

comment on column public.invitation_orders.unattributed_dismissed_by is
  'Email of the admin who dismissed it, so the banner can say who decided.';

comment on column public.invitation_orders.unattributed_dismissed_reason is
  'Why it will never be attached, e.g. "guest checkout, no account" or "couple deleted". Free text, shown when staff reopen the dismissed list.';

-- The banner reads `user_id is null and unattributed_dismissed_at is null` on
-- every page load. Partial on the dismissed half so the index stays small: the
-- whole point of dismissing is that those rows are never queried again here.
create index if not exists invitation_orders_unattributed_open_idx
  on public.invitation_orders (created_at desc)
  where user_id is null and unattributed_dismissed_at is null;
