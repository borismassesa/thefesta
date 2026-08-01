-- =============================================================================
-- PR A — Role assignment tier: stop roles.assign becoming an escalation path
-- =============================================================================
-- Implements section 3.8 of docs/WORKSPACE_WORKFORCE_ARCHITECTURE.md.
--
-- PR 0 split workforce.roles.write from workforce.roles.assign so that People
-- Ops can put people into approved roles without redefining what a role
-- grants. That split opens a hole if assignment is unconstrained: People Ops
-- cannot grant platform.admin directly, but could assign a role that already
-- contains it.
--
-- A pure containment rule ("you may only assign roles whose every permission
-- you hold") is the obvious fix and is wrong here — assignment is precisely
-- People Ops' job, and they legitimately hand out roles granting things they
-- do not personally hold. So the control is role METADATA, plus a hard rule
-- that stops the metadata being used to smuggle escalation.
--
-- This migration REPLACES the temporary hardcoded CRITICAL_PERMISSION_KEYS
-- list in lib/roles-authz.ts, which PR 0 shipped as a stopgap.
-- =============================================================================

ALTER TABLE workforce_roles
  ADD COLUMN IF NOT EXISTS assignment_tier text NOT NULL DEFAULT 'admin_or_owner';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workforce_roles_assignment_tier_check'
  ) THEN
    ALTER TABLE workforce_roles
      ADD CONSTRAINT workforce_roles_assignment_tier_check
      CHECK (assignment_tier IN ('owner_only', 'admin_or_owner', 'delegated'));
  END IF;
END $$;

COMMENT ON COLUMN workforce_roles.assignment_tier IS
  'Who may assign this role. owner_only = Owner alone. admin_or_owner = Owner or an Admin holding roles.assign. delegated = any roles.assign holder (e.g. People Ops). Defaults to the RESTRICTIVE middle value so a role created without thought is not delegable.';

-- ---------------------------------------------------------------------------
-- Escalation-sensitive permissions
-- ---------------------------------------------------------------------------
-- A role holding any of these can never be `delegated`. Kept deliberately
-- short: every addition widens what a non-owner cannot do (so it fails safe),
-- but an over-long list makes the Roles page unusable for People Ops.
CREATE OR REPLACE FUNCTION public.workforce_is_escalation_sensitive(p_keys text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM unnest(coalesce(p_keys, ARRAY[]::text[])) k
     WHERE k IN (
       'platform.admin',
       'workforce.roles.write',
       'workforce.roles.assign',
       'workforce.payroll',
       'workforce.employee_documents.legal',
       'finance.write',
       'opuspass.couples.delete'
     )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.workforce_is_escalation_sensitive(text[]) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- The hard rule, enforced in the DATABASE rather than application code
-- ---------------------------------------------------------------------------
-- Metadata alone is not enough: someone with roles.write could otherwise mark
-- a dangerous custom role `delegated`. Editing a role's permissions therefore
-- changes who may assign it, which is the correct coupling.
CREATE OR REPLACE FUNCTION public.workforce_roles_guard_assignment_tier()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.assignment_tier = 'delegated'
     AND public.workforce_is_escalation_sensitive(NEW.permission_keys) THEN
    -- On INSERT, or when the caller explicitly tried to set 'delegated',
    -- refuse. When a permission was ADDED to an already-delegated role, raise
    -- the tier instead so the edit succeeds with a safe outcome.
    IF TG_OP = 'UPDATE'
       AND OLD.assignment_tier = 'delegated'
       AND NEW.assignment_tier = OLD.assignment_tier THEN
      NEW.assignment_tier := 'admin_or_owner';
      RAISE NOTICE
        'Role % now grants an escalation-sensitive permission; assignment_tier raised to admin_or_owner.',
        NEW.slug;
    ELSE
      RAISE EXCEPTION
        'Role % cannot be delegated: it grants an escalation-sensitive permission.',
        NEW.slug
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS workforce_roles_assignment_tier_guard ON workforce_roles;
CREATE TRIGGER workforce_roles_assignment_tier_guard
  BEFORE INSERT OR UPDATE ON workforce_roles
  FOR EACH ROW EXECUTE FUNCTION public.workforce_roles_guard_assignment_tier();

-- ---------------------------------------------------------------------------
-- Seeded tiers
-- ---------------------------------------------------------------------------
-- Owner and Admin are owner_only: People Ops must never hand out either.
UPDATE workforce_roles SET assignment_tier = 'owner_only'
 WHERE slug IN ('owner', 'admin');

-- Roles carrying real authority: an Admin may assign them, People Ops may not.
UPDATE workforce_roles SET assignment_tier = 'admin_or_owner'
 WHERE slug IN ('people-ops', 'finance', 'content-editor', 'vendor-success', 'editor');

-- Low-risk roles People Ops can hand out day to day.
UPDATE workforce_roles SET assignment_tier = 'delegated'
 WHERE slug IN ('viewer', 'author');

-- Any custom role that would violate the rule is pulled up rather than left
-- inconsistent. Runs after the seeds so it catches pre-existing rows too.
UPDATE workforce_roles SET assignment_tier = 'admin_or_owner'
 WHERE assignment_tier = 'delegated'
   AND public.workforce_is_escalation_sensitive(permission_keys);

-- Verification: no delegated role may carry an escalation-sensitive key.
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(slug, ', ') INTO bad
    FROM workforce_roles
   WHERE assignment_tier = 'delegated'
     AND public.workforce_is_escalation_sensitive(permission_keys);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Assignment-tier guard failed for: %', bad;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
