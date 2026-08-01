-- =============================================================================
-- PR A — Employee email normalisation (BLOCKING preflight)
-- =============================================================================
-- Implements section 2.3 of docs/WORKSPACE_WORKFORCE_ARCHITECTURE.md.
--
-- workforce_employees.email is `text NOT NULL UNIQUE`
-- (20260512000004_workforce_module.sql:84) — a CASE-SENSITIVE constraint. So
-- `alice@x.com` and `Alice@x.com` can both exist as separate rows. That is why
-- the identity resolver still uses ilike + escapeLike rather than exact
-- equality, and it is a live source of AMBIGUOUS_IDENTITY.
--
-- workforce_invitations already models the fix correctly, with an index on
-- lower(email) at 20260514213347_workforce_dashboard_access.sql:87.
--
-- ORDER MATTERS, and step 1 is BLOCKING:
--   1. Fail if any case-insensitive duplicate exists.
--   2. Normalise email to lowercase.
--   3. Add UNIQUE on lower(email).
--   4. (Application) switch lookups to exact equality.
--
-- NO automatic merge. NO lowercasing of conflicting rows. NO guessed
-- correction. The migration must never assume the lowercase spelling belongs
-- to the currently active employee — deciding which record is canonical is a
-- People Ops data decision, not something SQL should infer.
--
-- Preflight run against production 2026-07-31: CLEAR. 12 employees, 12
-- distinct lowercase emails, 0 rows requiring normalisation, 0 conflicts in
-- workforce_invitations. Step 2 is therefore a no-op there and step 3 lands
-- directly. The gate stays regardless so a re-run in any other environment
-- still fails safely.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. BLOCKING preflight
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  conflict_count integer;
  report text;
BEGIN
  SELECT count(*) INTO conflict_count
    FROM (
      SELECT lower(email) FROM workforce_employees
       GROUP BY lower(email) HAVING count(*) > 1
    ) dupes;

  IF conflict_count > 0 THEN
    SELECT string_agg(line, E'\n') INTO report
      FROM (
        SELECT format(
                 '  %s | ids: %s | stored: %s | statuses: %s | dashboard: %s | clerk: %s',
                 lower(e.email),
                 string_agg(e.id::text, ' + '),
                 string_agg(e.email, ' + '),
                 string_agg(e.status, ' + '),
                 string_agg(e.dashboard_access::text, ' + '),
                 string_agg(coalesce(e.clerk_user_id, 'none'), ' + ')
               ) AS line
          FROM workforce_employees e
         GROUP BY lower(e.email)
        HAVING count(*) > 1
      ) rows;

    RAISE EXCEPTION E'Email normalisation ABORTED: % case-insensitive duplicate group(s) in workforce_employees.\n\nRemediation report:\n%\n\nPeople Ops must decide which record is canonical and whether each pair is merged, corrected or unlinked. Re-run this migration only after the duplicates are resolved. Do not edit this migration to skip the check.',
      conflict_count, report;
  END IF;
END $$;

-- Advisory checks on the surrounding tables. A conflict resolved only in
-- workforce_employees can still leave an orphaned login or a stale grant, so
-- these are surfaced as NOTICEs rather than silently ignored. They do not
-- block: workforce_invitations legitimately holds repeat invitations for the
-- same address (its lower(email) index is non-unique by design).
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
    FROM (
      SELECT lower(email) FROM workforce_invitations
       GROUP BY lower(email) HAVING count(*) > 1
    ) d;
  IF n > 0 THEN
    RAISE NOTICE 'workforce_invitations has % address(es) with multiple invitations. Expected for re-invites; review only if a duplicate employee was also reported above.', n;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Normalise
-- ---------------------------------------------------------------------------
UPDATE workforce_employees
   SET email = lower(email)
 WHERE email <> lower(email);

-- ---------------------------------------------------------------------------
-- 3. Enforce
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_workforce_employees_email_lower
  ON workforce_employees (lower(email));

COMMENT ON INDEX idx_workforce_employees_email_lower IS
  'Case-insensitive uniqueness for employee email. The original UNIQUE on email is case-sensitive, which allowed alice@x.com and Alice@x.com to coexist and made identity resolution ambiguous. With this in place, lookups can use exact equality on a normalised value instead of ILIKE.';

DO $$
BEGIN
  RAISE NOTICE 'Email normalisation complete. Identity lookups may now use exact equality; escapeLike remains required only where a query interface forces pattern matching.';
END $$;

NOTIFY pgrst, 'reload schema';
