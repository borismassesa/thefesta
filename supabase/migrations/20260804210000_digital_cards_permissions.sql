-- =============================================================================
-- Digital Cards gets its own permission keys
-- =============================================================================
-- The card catalogue, the personalisation queue and the release gate all ran
-- on cms.read / cms.write / cms.publish — the WEBSITE CONTENT keys. So "can
-- edit homepage copy" and "can release a wedding invitation to two hundred
-- guests" were the same grant, and separating them was impossible without a
-- code change.
--
-- This grants the three new keys to exactly the roles that already hold the
-- cms.* key which guarded the same action, so NOBODY gains or loses access
-- when this lands:
--
--   cms.read     -> digitalcards.read
--   cms.write    -> digitalcards.read, digitalcards.write
--   cms.publish  -> digitalcards.publish
--
-- The same mapping exists in application code (expandLegacyPermissions in
-- src/lib/workforce/permissions.ts). The two are deliberately redundant:
--
--   * The CODE expansion is what makes the deploy safe in either order. The
--     app switches its gates to digitalcards.*, and a role still carrying only
--     cms.* keeps working whether or not this migration has run yet.
--   * This MIGRATION is what makes the keys real in workforce_roles, so the
--     Roles matrix shows them as held, and People Ops can revoke
--     digitalcards.publish from a role WITHOUT also revoking its ability to
--     publish website content. That is the entire point of the split, and the
--     code expansion alone cannot deliver it: while a role holds cms.publish,
--     expansion keeps handing it digitalcards.publish back.
--
-- Once every role carries explicit digitalcards.* keys, the CMS_*_EXPANSION
-- constants and their branch in expandLegacyPermissions can be deleted. Until
-- then, revoking digitalcards.publish only bites for roles that do not hold
-- cms.publish.
--
-- Ordering: safe to apply before OR after the application deploy, which is why
-- the code expansion exists. Applying it first is still preferable — it means
-- the Roles matrix is already truthful the moment the new gates go live.
-- =============================================================================

-- Add keys to every role that already holds `p_when`. Idempotent: re-running
-- is a no-op because array_agg(DISTINCT ...) collapses the duplicates.
CREATE OR REPLACE FUNCTION pg_temp.grant_alongside(p_when text, p_keys text[])
RETURNS void
LANGUAGE sql
AS $$
  UPDATE workforce_roles
     SET permission_keys = (
           SELECT array_agg(DISTINCT k)
             FROM unnest(permission_keys || p_keys) k
         ),
         updated_at = now()
   WHERE permission_keys @> ARRAY[p_when]::text[]
     -- Skip rows that already have everything, so updated_at is not churned
     -- on a re-run.
     AND NOT (permission_keys @> p_keys);
$$;

SELECT pg_temp.grant_alongside('cms.read',    ARRAY['digitalcards.read']);
SELECT pg_temp.grant_alongside('cms.write',   ARRAY['digitalcards.read', 'digitalcards.write']);
SELECT pg_temp.grant_alongside('cms.publish', ARRAY['digitalcards.publish']);

-- Owner and admin explicitly, by slug.
--
-- Not covered by the three statements above: a role's permission_keys in the
-- live database are not guaranteed to match the seed, so an admin row that
-- somehow lacks cms.write would silently end up without card access. Owner is
-- short-circuited to every key in application code regardless; recording it
-- here keeps the matrix honest rather than showing gaps an owner does not have.
CREATE OR REPLACE FUNCTION pg_temp.add_role_keys(p_slug text, p_keys text[])
RETURNS void
LANGUAGE sql
AS $$
  UPDATE workforce_roles
     SET permission_keys = (
           SELECT array_agg(DISTINCT k)
             FROM unnest(permission_keys || p_keys) k
         ),
         updated_at = now()
   WHERE slug = p_slug
     AND NOT (permission_keys @> p_keys);
$$;

SELECT pg_temp.add_role_keys('owner', ARRAY['digitalcards.read', 'digitalcards.write', 'digitalcards.publish']);
SELECT pg_temp.add_role_keys('admin', ARRAY['digitalcards.read', 'digitalcards.write', 'digitalcards.publish']);

-- ── Verification ────────────────────────────────────────────────────────────
-- Fail loudly rather than leaving somebody locked out of a surface they used
-- yesterday. Each check states the access that would have been lost.

DO $$
DECLARE
  broken text;
BEGIN
  SELECT string_agg(slug, ', ')
    INTO broken
    FROM workforce_roles
   WHERE permission_keys @> ARRAY['cms.read']::text[]
     AND NOT (permission_keys @> ARRAY['digitalcards.read']::text[]);
  IF broken IS NOT NULL THEN
    RAISE EXCEPTION
      'Digital Cards permissions: % holds cms.read but did not receive digitalcards.read, so it would lose the card catalogue.',
      broken;
  END IF;

  SELECT string_agg(slug, ', ')
    INTO broken
    FROM workforce_roles
   WHERE permission_keys @> ARRAY['cms.write']::text[]
     AND NOT (permission_keys @> ARRAY['digitalcards.write']::text[]);
  IF broken IS NOT NULL THEN
    RAISE EXCEPTION
      'Digital Cards permissions: % holds cms.write but did not receive digitalcards.write, so it could open a card and fail every save.',
      broken;
  END IF;

  SELECT string_agg(slug, ', ')
    INTO broken
    FROM workforce_roles
   WHERE permission_keys @> ARRAY['cms.publish']::text[]
     AND NOT (permission_keys @> ARRAY['digitalcards.publish']::text[]);
  IF broken IS NOT NULL THEN
    RAISE EXCEPTION
      'Digital Cards permissions: % holds cms.publish but did not receive digitalcards.publish, so it could not release an approved card.',
      broken;
  END IF;

  SELECT string_agg(slug, ', ')
    INTO broken
    FROM workforce_roles
   WHERE slug IN ('owner', 'admin')
     AND NOT (permission_keys @> ARRAY['digitalcards.read', 'digitalcards.write', 'digitalcards.publish']::text[]);
  IF broken IS NOT NULL THEN
    RAISE EXCEPTION
      'Digital Cards permissions: % did not receive the full digitalcards.* set.',
      broken;
  END IF;
END $$;

-- Guard the intended exclusion: a role with no CMS access at all had no route
-- into the card surface before this migration and must not acquire one.
DO $$
DECLARE
  leaked text;
BEGIN
  SELECT string_agg(slug, ', ')
    INTO leaked
    FROM workforce_roles
   WHERE slug NOT IN ('owner', 'admin')
     AND NOT (permission_keys && ARRAY['cms.read', 'cms.write', 'cms.publish']::text[])
     AND permission_keys && ARRAY['digitalcards.read', 'digitalcards.write', 'digitalcards.publish']::text[];
  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION
      'Digital Cards permissions: % gained a digitalcards.* key without holding any cms.* key. That is new authority, not compatibility.',
      leaked;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
