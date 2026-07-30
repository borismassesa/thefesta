-- Digital card sales stats + automatic promotional badges.
--
-- Two things ship here:
--
--   1. A read-only view of paid units per card, so the admin catalogue can
--      show what's actually selling instead of asking staff to guess.
--   2. Automatic `trending` / `most_popular` badges computed nightly from
--      those units, WITHOUT taking the decision away from staff.
--
-- The badge model is deliberately additive — nothing is dropped or rewritten:
--
--   badge            (existing, unchanged) the staff pick. Still the only
--                    column the admin editor writes. Always wins.
--   badge_auto       (new) computed by the nightly job. Never written by hand.
--   badge_effective  (new, GENERATED) coalesce(badge, badge_auto) — what the
--                    storefront and the admin filter read.
--
-- So a human tag is never clobbered by the job, the job's suggestion shows
-- through only where a human hasn't decided, and no existing row changes
-- meaning. `premium` is intentionally NOT automatable: it's a positioning
-- statement, and every card currently carries the same price, so there is
-- nothing to derive it from.

-- ── 1. Paid units per card ────────────────────────────────────────────────
--
-- Order lines live in invitation_orders.items (jsonb array), each entry keyed
-- by the card's id. Only 'paid' lines count — a pending or failed checkout is
-- not demand you want to promote on.
CREATE OR REPLACE VIEW public.website_invitations_product_sales
WITH (security_invoker = true) AS
WITH lines AS (
  SELECT
    (item ->> 'id') AS product_id,
    o.status,
    COALESCE(o.paid_at, o.created_at) AS ordered_at
  FROM public.invitation_orders o
  CROSS JOIN LATERAL jsonb_array_elements(o.items) AS item
  WHERE o.items IS NOT NULL
    AND jsonb_typeof(o.items) = 'array'
)
SELECT
  p.id AS product_id,
  COUNT(l.product_id) FILTER (WHERE l.status = 'paid') AS paid_units_all_time,
  COUNT(l.product_id) FILTER (
    WHERE l.status = 'paid' AND l.ordered_at > now() - INTERVAL '30 days'
  ) AS paid_units_30d,
  MAX(l.ordered_at) FILTER (WHERE l.status = 'paid') AS last_paid_at
FROM public.website_invitations_products p
LEFT JOIN lines l ON l.product_id = p.id
GROUP BY p.id;

COMMENT ON VIEW public.website_invitations_product_sales IS
  'Paid units per digital card, derived from invitation_orders.items. Admin/service-role only — revenue signal, not public.';

-- Postgres grants nothing on a fresh view, but Supabase projects commonly carry
-- default privileges that would hand SELECT to anon/authenticated. Revoke
-- explicitly so per-card sales figures can never be read from the browser.
REVOKE ALL ON public.website_invitations_product_sales FROM anon, authenticated;
GRANT SELECT ON public.website_invitations_product_sales TO service_role;

-- ── 2. Badge columns ──────────────────────────────────────────────────────

ALTER TABLE public.website_invitations_products
  ADD COLUMN IF NOT EXISTS badge_auto TEXT;

COMMENT ON COLUMN public.website_invitations_products.badge_auto IS
  'Badge computed by refresh_digital_card_auto_badges(). Overridden by badge; do not write by hand.';

-- Narrower than badge's own CHECK: the job may only ever assign these two.
DO $$
BEGIN
  ALTER TABLE public.website_invitations_products
    ADD CONSTRAINT website_invitations_products_badge_auto_check
    CHECK (badge_auto IS NULL OR badge_auto IN ('most_popular', 'trending'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Generated + stored so readers filter and sort on one plain column, and so a
-- stale value can't drift out of sync with its inputs.
ALTER TABLE public.website_invitations_products
  ADD COLUMN IF NOT EXISTS badge_effective TEXT
  GENERATED ALWAYS AS (COALESCE(badge, badge_auto)) STORED;

COMMENT ON COLUMN public.website_invitations_products.badge_effective IS
  'The badge actually shown: the staff pick (badge) if set, else the computed one (badge_auto).';

CREATE INDEX IF NOT EXISTS website_invitations_products_badge_effective_idx
  ON public.website_invitations_products (badge_effective)
  WHERE badge_effective IS NOT NULL;

-- ── 3. The nightly recompute ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.refresh_digital_card_auto_badges()
-- Returns only the rows it actually changed, so a manual run (or the cron log)
-- shows the diff rather than a silent "done".
RETURNS TABLE (product_id TEXT, new_badge TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Floors, not just rankings. Without them the top seller of a quiet week
  -- gets a "Trending" pill off a single purchase, and the badge flips around
  -- in front of customers. Raise these as order volume grows.
  min_units_trending CONSTANT INT := 5;
  min_units_popular  CONSTANT INT := 5;
  -- Badges are ranked WITHIN a category, so a busy category can't sweep every
  -- pill and leave the quieter ones with none.
  winners_per_category CONSTANT INT := 1;
BEGIN
  RETURN QUERY
  WITH ranked AS (
    SELECT
      p.id,
      s.paid_units_30d,
      s.paid_units_all_time,
      ROW_NUMBER() OVER (
        PARTITION BY p.category
        ORDER BY s.paid_units_30d DESC, s.paid_units_all_time DESC, p.name
      ) AS trend_rank,
      ROW_NUMBER() OVER (
        PARTITION BY p.category
        ORDER BY s.paid_units_all_time DESC, s.paid_units_30d DESC, p.name
      ) AS popular_rank
    FROM public.website_invitations_products p
    JOIN public.website_invitations_product_sales s ON s.product_id = p.id
    -- An unpublished card must never win a badge; it isn't purchasable.
    WHERE p.published
  ),
  computed AS (
    SELECT
      p.id,
      CASE
        WHEN r.trend_rank <= winners_per_category
             AND r.paid_units_30d >= min_units_trending THEN 'trending'
        WHEN r.popular_rank <= winners_per_category
             AND r.paid_units_all_time >= min_units_popular THEN 'most_popular'
        ELSE NULL
      END AS badge_auto
    -- LEFT JOIN so cards excluded from `ranked` (unpublished) also get their
    -- stale badge_auto cleared, rather than keeping yesterday's win forever.
    FROM public.website_invitations_products p
    LEFT JOIN ranked r ON r.id = p.id
  )
  UPDATE public.website_invitations_products p
  SET badge_auto = c.badge_auto
  FROM computed c
  WHERE c.id = p.id
    -- Touch only genuine changes, so updated_at stays meaningful as "someone
    -- edited this card" instead of "the cron ran".
    AND COALESCE(p.badge_auto, '') <> COALESCE(c.badge_auto, '')
  RETURNING p.id, p.badge_auto;
END;
$$;

COMMENT ON FUNCTION public.refresh_digital_card_auto_badges() IS
  'Recomputes badge_auto from paid units. Returns the rows it changed. Scheduled nightly via pg_cron.';

-- Postgres grants EXECUTE to PUBLIC by default, which PostgREST would expose
-- as an unauthenticated RPC that mutates the catalogue. Lock it down.
REVOKE ALL ON FUNCTION public.refresh_digital_card_auto_badges() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_digital_card_auto_badges() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_digital_card_auto_badges() TO service_role;

-- ── 4. Schedule ───────────────────────────────────────────────────────────
--
-- Nightly at 02:15 UTC (05:15 EAT) — after the day's orders have settled and
-- well outside Tanzanian browsing hours, so no customer watches a pill move.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;

  PERFORM cron.unschedule('digital-card-auto-badges');
EXCEPTION
  WHEN OTHERS THEN NULL; -- not scheduled yet, or pg_cron unavailable locally
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'digital-card-auto-badges',
    '15 2 * * *',
    $cron$ SELECT public.refresh_digital_card_auto_badges(); $cron$
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule digital-card-auto-badges (pg_cron unavailable?) — schedule it manually.';
END $$;
