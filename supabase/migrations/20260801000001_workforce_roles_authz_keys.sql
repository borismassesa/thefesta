-- =============================================================================
-- PR 0 — Roles authorisation hotfix: explicit RBAC permission keys
-- =============================================================================
-- Closes a live privilege-escalation path.
--
-- Before this change, every role-mutating server action authorised via
-- requireAdminRole(['owner','admin']), which reads the LEGACY ROLE BUCKET.
-- That bucket promotes every seeded role in use to 'admin':
--
--   content-editor  -> admin  (cms.write, cms.publish)
--   vendor-success  -> admin  (vendor.moderate)
--   finance         -> admin  (workforce.payroll)
--   people-ops      -> admin  (workforce.payroll)
--
-- Server actions are POST endpoints, so the workforce.read redirect in the
-- /workforce layout never protected them — it only guards the page render. Any
-- of the 10 employees holding a dashboard role could therefore invoke
-- updateRolePermissions directly and grant themselves platform.admin.
--
-- The application now gates on three explicit keys. This migration grants them
-- so existing administrators keep working.
--
-- DEPLOY ORDERING — IMPORTANT
-- This migration MUST be applied BEFORE (or atomically with) the application
-- deploy. The `admin` role resolves to isOwner = false, so until these keys
-- exist in workforce_roles.permission_keys, admins would be locked out of the
-- Roles page. Owners are unaffected (they short-circuit to the full catalogue
-- in getCallerPermissions).
--
-- Deliberately NOT granted here:
--   * workforce.roles.write to people-ops — they may assign approved roles but
--     not redefine what a role grants. This is a deliberate reduction from the
--     accidental authority they hold today via the legacy bucket.
--   * anything to content-editor / vendor-success / finance — these roles never
--     had a legitimate claim to RBAC administration.
-- =============================================================================

-- Helper: append keys to a role without duplicating existing entries and
-- without disturbing any other key already stored. Custom (non-system) roles
-- are never touched by this migration.
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

-- Owner and Admin: full RBAC administration.
SELECT pg_temp.add_role_keys('owner', ARRAY[
  'workforce.roles.read',
  'workforce.roles.write',
  'workforce.roles.assign'
]);

SELECT pg_temp.add_role_keys('admin', ARRAY[
  'workforce.roles.read',
  'workforce.roles.write',
  'workforce.roles.assign'
]);

-- People Ops: inspect and assign, but not redefine. Separation of duties —
-- putting someone into an approved role is their job; changing what that role
-- grants is not.
SELECT pg_temp.add_role_keys('people-ops', ARRAY[
  'workforce.roles.read',
  'workforce.roles.assign'
]);

-- Viewer: read-only inspection, matching its existing read-everything posture.
SELECT pg_temp.add_role_keys('viewer', ARRAY[
  'workforce.roles.read'
]);

-- Verification: owner and admin must end up with all three keys, or the deploy
-- would lock administrators out of the Roles page. Fail the migration loudly
-- rather than discovering it in production.
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(slug, ', ')
    INTO missing
    FROM workforce_roles
   WHERE slug IN ('owner', 'admin')
     AND NOT (
       permission_keys @> ARRAY[
         'workforce.roles.read',
         'workforce.roles.write',
         'workforce.roles.assign'
       ]::text[]
     );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION
      'Roles hotfix: % did not receive the workforce.roles.* keys. Aborting so administrators are not locked out.',
      missing;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
