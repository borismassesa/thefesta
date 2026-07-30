-- Separate couple identity from vendor identity.
--
-- THE BUG THIS FIXES
--
-- `public.users` is one row per Clerk login, shared by every app in the
-- ecosystem (one Clerk instance is mandatory — two on *.opusfesta.com collide
-- on the apex __client_uat cookie). Its `role` column is a single scalar, and
-- no vendor signup path ever writes 'vendor': the vendors_portal Clerk webhook
-- and onboarding submit both upsert {clerk_id, email, name} only, so the
-- DEFAULT 'user' sticks. Admin's Couple Accounts list then *inferred* couple-ness
-- from `role = 'user'`, so vendor logins materialised as couples.
--
-- It leaked in both directions. At the time of writing, in production:
--   * home-shop@opusfesta.demo and graceboniventure44@gmail.com own vendor
--     storefronts, have zero couple data, and were listed as couples.
--   * bmassesa24@gmail.com was labelled 'vendor', owns NO storefront, and has
--     4 events / 221 guests / 8 orders / 2,026,200 TZS paid — a real paying
--     couple hidden from staff and from the lifetime-revenue KPI.
--
-- THE MODEL
--
-- Which side of the marketplace something belongs to is a property of a
-- WORKSPACE, never of a login. A login may own either, both, or neither:
--
--   public.users  ← the login
--     ├── vendor_memberships → vendors   (business / storefront)  migration 056
--     └── couple_accounts                (wedding workspace)      THIS MIGRATION
--
-- This mirrors the vendor side, which has had the right shape since 056, and
-- the marketplace incumbents: Zola's vendor-side entity is the storefront (one
-- account holds many), and couples enter through an entirely separate door.
--
-- `users.role` is NOT dropped: 20+ RLS policies read `role = 'admin'` (e.g.
-- 012_payments_invoices.sql, 027_create_careers_tables.sql). It is narrowed to
-- mean admin-or-not, and stops being read as a couple/vendor discriminator.
--
-- UNIQUE (user_id) is a deliberate phase-1 shim: it keeps `users.id` usable as
-- the couple scope, so none of the 38 couple-side tables need repointing yet.
-- Phase 2 drops it and adds couple_account_members(couple_account_id, user_id,
-- role) so both partners and a planner can sign in to one wedding.

CREATE TABLE IF NOT EXISTS public.couple_accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  -- What brought this workspace into being: 'onboarding_wizard' | 'first_event'
  -- | 'order' | 'backfill' | 'admin'. Free text rather than an enum so a new
  -- entry point does not need a migration to record itself honestly.
  created_via TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Set instead of deleting when staff retire a workspace but keep the login
  -- (e.g. the login is also a vendor). Archived workspaces drop out of the
  -- admin list and the stats view.
  archived_at TIMESTAMPTZ
);

COMMENT ON TABLE public.couple_accounts IS
  'The couple-side workspace: one row per login that actually engages with the couple product (OpusPass / OpusFesta planning). Existence of a row is what makes an account a couple — never users.role. Vendor-side equivalent: vendors + vendor_memberships.';

ALTER TABLE public.couple_accounts ENABLE ROW LEVEL SECURITY;

-- Stated explicitly rather than relying on the project's default privileges,
-- since every read path that matters here is server-side and must not silently
-- depend on them.
GRANT SELECT ON public.couple_accounts TO authenticated;
GRANT ALL ON public.couple_accounts TO service_role;
REVOKE ALL ON public.couple_accounts FROM anon;

-- A couple may read their own workspace row (the apps check for it before
-- rendering couple surfaces). Every write is service-role: workspaces are
-- created by the triggers below or by admin, never by a client.
DROP POLICY IF EXISTS "couple_accounts_own_select" ON public.couple_accounts;
CREATE POLICY "couple_accounts_own_select" ON public.couple_accounts
  FOR SELECT USING (requesting_user_id() = user_id);

-- ---------------------------------------------------------------------------
-- A workspace is created by ENGAGEMENT, never by a page view.
--
-- Enforced in the database rather than per-app on purpose: opus_pass,
-- opus_website, both mobile apps and admin all write couple data, and a future
-- caller that forgets to create the workspace would silently reintroduce the
-- "couple data with no couple account" state this migration exists to remove.
--
-- The three entry points below are the ones that can happen first. Everything
-- else on the couple side (guests, pledges, registry, guestbook, seating,
-- websites) requires an event or an order to exist already, so it is covered
-- transitively; the backfill catches any historical row that is not.

CREATE OR REPLACE FUNCTION public.ensure_couple_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO public.couple_accounts (user_id, created_via)
    VALUES (NEW.user_id, TG_ARGV[0])
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Postgres grants EXECUTE to PUBLIC by default, and PostgREST exposes anything
-- callable as an RPC. Trigger functions are not usefully callable, but the
-- REVOKE is unconditional here so the pattern never has to be remembered.
REVOKE ALL ON FUNCTION public.ensure_couple_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_couple_account() FROM anon, authenticated;

DROP TRIGGER IF EXISTS ensure_couple_account_on_profile ON public.couple_profiles;
CREATE TRIGGER ensure_couple_account_on_profile
  AFTER INSERT ON public.couple_profiles
  FOR EACH ROW EXECUTE FUNCTION public.ensure_couple_account('onboarding_wizard');

DROP TRIGGER IF EXISTS ensure_couple_account_on_event ON public.wedding_events;
CREATE TRIGGER ensure_couple_account_on_event
  AFTER INSERT ON public.wedding_events
  FOR EACH ROW EXECUTE FUNCTION public.ensure_couple_account('first_event');

-- INSERT *and* UPDATE OF user_id: checkout completes without a signed-in user
-- (invitation_orders.user_id stays NULL), and staff later attach the order to
-- an account from the unattributed banner on the Couple Accounts page. That
-- attach is the moment the buyer becomes a couple, and it is an UPDATE.
DROP TRIGGER IF EXISTS ensure_couple_account_on_order ON public.invitation_orders;
CREATE TRIGGER ensure_couple_account_on_order
  AFTER INSERT OR UPDATE OF user_id ON public.invitation_orders
  FOR EACH ROW EXECUTE FUNCTION public.ensure_couple_account('order');

-- ---------------------------------------------------------------------------
-- Backfill: every login that already holds couple data gets a workspace,
-- whatever its `role` says. Logins with no couple data get none — which is how
-- the two pure-vendor accounts leave the Couple Accounts list, and how the
-- mislabelled couple enters it.

INSERT INTO public.couple_accounts (user_id, created_via)
SELECT u.id, 'backfill'
FROM public.users u
WHERE EXISTS (SELECT 1 FROM public.couple_profiles    t WHERE t.user_id = u.id)
   OR EXISTS (SELECT 1 FROM public.wedding_events     t WHERE t.user_id = u.id)
   OR EXISTS (SELECT 1 FROM public.invitation_orders  t WHERE t.user_id = u.id)
   OR EXISTS (SELECT 1 FROM public.guest_contacts     t WHERE t.user_id = u.id)
   OR EXISTS (SELECT 1 FROM public.event_pledges      t WHERE t.user_id = u.id)
   OR EXISTS (SELECT 1 FROM public.gift_registry_items t WHERE t.user_id = u.id)
   OR EXISTS (SELECT 1 FROM public.guestbook_entries  t WHERE t.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Scope the stats view to workspaces. Column list is unchanged so this is a
-- true CREATE OR REPLACE and no caller has to change shape.

CREATE OR REPLACE VIEW public.couple_account_stats AS
  SELECT
    u.id AS user_id,

    (SELECT count(*)::INT FROM public.wedding_events e WHERE e.user_id = u.id) AS event_count,
    (SELECT count(*)::INT FROM public.guest_contacts g WHERE g.user_id = u.id) AS guest_count,
    (SELECT count(*)::INT FROM public.guest_invitations i WHERE i.user_id = u.id) AS invitation_count,
    (SELECT count(*)::INT FROM public.guest_invitations i
      WHERE i.user_id = u.id AND i.rsvp_status = 'attending') AS rsvp_attending,
    (SELECT count(*)::INT FROM public.guest_invitations i
      WHERE i.user_id = u.id AND i.rsvp_status = 'pending') AS rsvp_pending,

    (SELECT count(*)::INT FROM public.invitation_orders o WHERE o.user_id = u.id) AS order_count,
    (SELECT count(*)::INT FROM public.invitation_orders o
      WHERE o.user_id = u.id AND o.status = 'paid') AS paid_order_count,
    -- Lifetime spend counts paid orders only, and only in TZS: every order
    -- this platform has taken is TZS, and mixing currencies into one total
    -- would be wrong rather than merely incomplete.
    (SELECT COALESCE(sum(o.amount_total), 0)::BIGINT FROM public.invitation_orders o
      WHERE o.user_id = u.id AND o.status = 'paid' AND o.currency = 'TZS') AS lifetime_spend_tzs,

    (SELECT count(*)::INT FROM public.event_pledges p WHERE p.user_id = u.id) AS pledge_count,
    (SELECT count(*)::INT FROM public.gift_registry_items r WHERE r.user_id = u.id) AS registry_item_count,
    (SELECT count(*)::INT FROM public.guestbook_entries b WHERE b.user_id = u.id) AS guestbook_count,

    -- GREATEST ignores NULLs in Postgres, so a couple who only ever created a
    -- profile still gets a sensible timestamp and a couple who created
    -- nothing gets NULL (which the UI reads as "dormant").
    GREATEST(
      (SELECT max(e.updated_at) FROM public.wedding_events e WHERE e.user_id = u.id),
      (SELECT max(g.updated_at) FROM public.guest_contacts g WHERE g.user_id = u.id),
      (SELECT max(i.updated_at) FROM public.guest_invitations i WHERE i.user_id = u.id),
      (SELECT max(o.created_at) FROM public.invitation_orders o WHERE o.user_id = u.id),
      (SELECT max(p.updated_at) FROM public.event_pledges p WHERE p.user_id = u.id),
      (SELECT max(r.updated_at) FROM public.gift_registry_items r WHERE r.user_id = u.id),
      (SELECT cp.updated_at FROM public.couple_profiles cp WHERE cp.user_id = u.id)
    ) AS last_activity_at
  -- One row per COUPLE WORKSPACE. This used to be `FROM public.users u`, with
  -- the comment "caller decides who counts as a couple; admin filters on
  -- users.role" — that inference is the bug this migration removes.
  FROM public.couple_accounts ca
  JOIN public.users u ON u.id = ca.user_id
  WHERE ca.archived_at IS NULL;

COMMENT ON VIEW public.couple_account_stats
  IS 'Per-couple activity rollup (events, guests, RSVPs, orders, spend, pledges, registry, guestbook) for admin''s Couple Accounts list. One row per live couple_accounts workspace. Staff-only: revoked from anon and authenticated, read via the service-role client.';

-- A view does not inherit its base tables' RLS, and this one crosses every
-- couple's data, so it must never be reachable from a couple's own JWT.
REVOKE ALL ON public.couple_account_stats FROM anon, authenticated;
GRANT SELECT ON public.couple_account_stats TO service_role;

-- ---------------------------------------------------------------------------

COMMENT ON COLUMN public.users.role IS
  'Legacy. Only ''admin'' is still meaningful (20+ RLS policies test it). NOT a couple/vendor discriminator: couple-ness is the existence of a couple_accounts row, vendor-ness a vendor_memberships row. Product code must not write this column.';
