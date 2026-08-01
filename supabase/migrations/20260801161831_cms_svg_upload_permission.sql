-- CAPTURED FROM PRODUCTION. Applied to the live database as version
-- 20260801161831 via MCP apply_migration and never committed. Recovered from
-- supabase_migrations.schema_migrations and reproduced verbatim.
--
-- Its own header names the repo path it was meant to land in
-- (20260801000002_cms_svg_upload_permission.sql). This file is numbered to the
-- version actually recorded in the database instead, so repo and live
-- migrations reconcile one to one.

-- =============================================================================
-- PR 1 — CMS authorisation follow-up: split SVG upload onto its own key
-- =============================================================================
-- Grants cms.svg.upload to owner and admin only. SVG upload was deliberately
-- stricter than general upload (an SVG can carry inline <script> and the
-- website-media bucket serves public URLs directly). No existing key expresses
-- "owner and admin but not Content Editor", since Content Editor holds both
-- cms.write and cms.publish. Hence a dedicated key.
--
-- Must be applied BEFORE the application deploy: `admin` resolves to
-- isOwner = false, so until the key exists admins would lose SVG upload.
-- =============================================================================

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
   WHERE slug = p_slug;
$$;

SELECT pg_temp.add_role_keys('owner', ARRAY['cms.svg.upload']);
SELECT pg_temp.add_role_keys('admin', ARRAY['cms.svg.upload']);

-- Verification: owner and admin must both end up with the key, or the deploy
-- would silently remove SVG upload from the people who use it.
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(slug, ', ')
    INTO missing
    FROM workforce_roles
   WHERE slug IN ('owner', 'admin')
     AND NOT (permission_keys @> ARRAY['cms.svg.upload']::text[]);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION
      'CMS authz follow-up: % did not receive cms.svg.upload. Aborting so SVG upload is not lost.',
      missing;
  END IF;
END $$;

-- Guard the intended exclusions. `editor` and `content-editor` keep general
-- image/video upload via cms.write but must NOT get SVG upload; the other three
-- never had a legitimate claim to the CMS write surface at all.
DO $$
DECLARE
  leaked text;
BEGIN
  SELECT string_agg(slug, ', ')
    INTO leaked
    FROM workforce_roles
   WHERE slug IN ('editor', 'content-editor', 'people-ops', 'finance', 'vendor-success')
     AND permission_keys @> ARRAY['cms.svg.upload']::text[];
  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION
      'CMS authz follow-up: % unexpectedly holds cms.svg.upload.', leaked;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
