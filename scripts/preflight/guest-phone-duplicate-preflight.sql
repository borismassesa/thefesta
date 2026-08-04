-- Merge gate for 20260804160000_guest_phone_normalization.sql.
--
-- That migration creates a partial unique index on
-- (user_id, phone_normalized). If any account already holds two guests on one
-- normalized number, the migration FAILS ON APPLY and the release stops.
--
-- The migration's own comment asserts "verified before writing this: zero
-- existing rows in any account violate the constraint". That was true when it
-- was written. Guests have been added since (#280, #281, #282), so re-run this
-- immediately before merging. All queries are read-only.
--
-- Run against PRODUCTION. Staging is not evidence; the rosters differ.
--
-- ---------------------------------------------------------------------------
-- ORDER OF OPERATIONS
--
-- Query 1 and 2 need `phone_normalized`, which 20260804160000 itself adds. So:
--
--   BEFORE the migration is applied anywhere -> run queries 1a / 2a, which
--     inline the normalization expression instead of reading the column.
--   AFTER it is applied to a branch/staging database -> run 1 / 2 / 3 / 4.
--
-- Queries 1a / 2a duplicate the migration's normalization by hand. They are
-- the pre-apply approximation ONLY. The authoritative check is query 2, run
-- against a database where the generated column exists, and the parity gate in
-- guest-phone-normalization-parity.sql.
-- ---------------------------------------------------------------------------


-- ═══ 1) THE GATE (post-apply) ══════════════════════════════════════════════
-- Predicate matches the proposed index EXACTLY. Anything else measures a
-- different constraint than the one being created.
--
-- MUST RETURN 0.

SELECT COUNT(*) AS violating_phone_groups
FROM (
  SELECT user_id, phone_normalized
  FROM public.guest_contacts
  WHERE phone_normalized IS NOT NULL
    AND shared_contact_group_id IS NULL
  GROUP BY user_id, phone_normalized
  HAVING COUNT(*) > 1
) violations;


-- ═══ 1a) THE GATE (pre-apply) ══════════════════════════════════════════════
-- Same question, for a database that does not yet have phone_normalized or
-- shared_contact_group_id. Keep the CASE in step with
-- public.opuspass_normalize_phone() in 20260804160000.
--
-- MUST RETURN 0.

WITH normalized AS (
  SELECT
    id,
    user_id,
    CASE
      WHEN d = '' THEN NULL
      WHEN d LIKE '255%' THEN d
      WHEN d LIKE '0%' THEN '255' || substr(d, 2)
      WHEN d ~ '^[67][0-9]{8}$' THEN '255' || d
      ELSE d
    END AS phone_normalized
  FROM public.guest_contacts g
  CROSS JOIN LATERAL (
    SELECT regexp_replace(
      COALESCE(NULLIF(g.whatsapp_phone, ''), g.phone, ''), '\D', '', 'g'
    ) AS d
  ) x
)
SELECT COUNT(*) AS violating_phone_groups_preapply
FROM (
  SELECT user_id, phone_normalized
  FROM normalized
  WHERE phone_normalized IS NOT NULL
  GROUP BY user_id, phone_normalized
  HAVING COUNT(*) > 1
) violations;


-- ═══ 2) EVERY CONFLICT, NAMED ══════════════════════════════════════════════
-- Run when query 1 is non-zero. One row per collision, with the guests to
-- take to the couple. guest_contacts has no display_name; full_name is the
-- value every surface shows and sends.

SELECT
  gc.user_id,
  gc.phone_normalized,
  COUNT(*) AS guest_count,
  ARRAY_AGG(gc.id ORDER BY gc.created_at, gc.id) AS guest_contact_ids,
  ARRAY_AGG(COALESCE(NULLIF(BTRIM(gc.full_name), ''), 'Unnamed guest')
            ORDER BY gc.created_at, gc.id) AS guest_names,
  ARRAY_AGG(COALESCE(gc.whatsapp_phone, gc.phone)
            ORDER BY gc.created_at, gc.id) AS raw_numbers,
  ARRAY_AGG(gc.created_at ORDER BY gc.created_at, gc.id) AS created_at
FROM public.guest_contacts gc
WHERE gc.phone_normalized IS NOT NULL
  AND gc.shared_contact_group_id IS NULL
GROUP BY gc.user_id, gc.phone_normalized
HAVING COUNT(*) > 1
ORDER BY guest_count DESC, gc.user_id, gc.phone_normalized;


-- ═══ 3) CONFLICTS HIDDEN INSIDE OVERRIDES ══════════════════════════════════
-- NOT in the original gate, and the reason this file exists.
--
-- The index predicate excludes rows carrying a shared_contact_group_id. So a
-- genuinely unresolved conflict that was parked in a group to get it out of
-- the way makes query 1 return 0 while the conflict is still live. This is
-- exactly the "do not create shared-contact groups merely to make the
-- migration pass" failure, and it has already happened once: the Meena /
-- Msuya pair was parked this way, which is what
-- 20260804180000_guest_shared_contact_confirmation.sql exists to correct.
--
-- Run BOTH variants. Every row is a decision someone owes, not a blocker.

-- 3a) Before 20260804180000 (no shared_contact_confirmed column yet):
--     every override on the system, for eyeball review.
SELECT
  gc.user_id,
  gc.phone_normalized,
  gc.shared_contact_group_id,
  COUNT(*) AS guests_sharing,
  ARRAY_AGG(COALESCE(NULLIF(BTRIM(gc.full_name), ''), 'Unnamed guest')
            ORDER BY gc.created_at, gc.id) AS guest_names,
  MIN(gc.shared_contact_reason) AS reason,
  MIN(gc.shared_contact_approved_by) AS approved_by,
  MIN(gc.shared_contact_approved_at) AS approved_at
FROM public.guest_contacts gc
WHERE gc.shared_contact_group_id IS NOT NULL
GROUP BY gc.user_id, gc.phone_normalized, gc.shared_contact_group_id
ORDER BY guests_sharing DESC, gc.user_id;

-- 3b) After 20260804180000: only the unresolved ones.
--     These guests are NOT deliverable until someone confirms.
--
-- SELECT
--   gc.user_id,
--   gc.phone_normalized,
--   gc.shared_contact_group_id,
--   COUNT(*) AS guests_sharing,
--   ARRAY_AGG(COALESCE(NULLIF(BTRIM(gc.full_name), ''), 'Unnamed guest')
--             ORDER BY gc.created_at, gc.id) AS guest_names,
--   MIN(gc.shared_contact_reason) AS reason
-- FROM public.guest_contacts gc
-- WHERE gc.shared_contact_group_id IS NOT NULL
--   AND gc.shared_contact_confirmed = false
-- GROUP BY gc.user_id, gc.phone_normalized, gc.shared_contact_group_id
-- ORDER BY guests_sharing DESC, gc.user_id;


-- ═══ 4) WHICH NUMBER THE KEY WAS BUILT FROM ════════════════════════════════
-- Diagnostic, not a gate. phone_normalized derives from whatsapp_phone first,
-- then phone, because that is the number a send actually goes to. When two
-- guests collide, this shows whether the collision is on the number messages
-- would reach, or on a stale secondary number.
--
-- Also the coupling to watch in Phase 4B: introducing preferred_channel and
-- changing which number sends use would change this key, and therefore change
-- which rows are duplicates.

SELECT
  gc.id,
  gc.user_id,
  COALESCE(NULLIF(BTRIM(gc.full_name), ''), 'Unnamed guest') AS full_name,
  gc.phone,
  gc.whatsapp_phone,
  gc.phone_normalized,
  CASE
    WHEN NULLIF(BTRIM(gc.whatsapp_phone), '') IS NOT NULL THEN 'whatsapp_phone'
    WHEN NULLIF(BTRIM(gc.phone), '') IS NOT NULL THEN 'phone'
    ELSE 'none'
  END AS normalization_source
FROM public.guest_contacts gc
WHERE gc.phone_normalized IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.guest_contacts peer
    WHERE peer.user_id = gc.user_id
      AND peer.phone_normalized = gc.phone_normalized
      AND peer.id <> gc.id
  )
ORDER BY gc.user_id, gc.phone_normalized, gc.created_at;


-- ═══ RESOLVING A NON-ZERO GATE ═════════════════════════════════════════════
--
-- Do not weaken the constraint, and do not create a shared-contact group
-- merely to make the migration pass (see query 3). Each conflict takes one of:
--
--   1. Correct an incorrectly repeated number.
--   2. Confirm a legitimate shared handset, with reason + approver +
--      timestamp. The CHECK constraint already refuses a bare flag.
--   3. Remove an obsolete duplicate through the supported archival path.
--   4. Hold the migration until the affected couple confirms the data.
--
-- Nothing here merges or deletes guests. That stays a human decision.
