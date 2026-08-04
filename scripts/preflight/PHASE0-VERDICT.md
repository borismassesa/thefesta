# Phase 0 — Guest Duplicate Control merge gate

Evidence for PR 1. Phone numbers are masked (`255766***854`); full values are
visible in the guest record to authorized users only, never in a PR.

```
Feature:            Guest Duplicate Control Merge Gate
Commits:            6c41ebc8 (implementation), 15260de7 (parity gate)
Branch:             OF-OPP-guest-duplicate-control
Database project:   OpusFesta production (Supabase)
Executed by:        bmmassesa@gmail.com (via Supabase MCP, read-only queries)
Execution date:     2026-08-04

Automated tests:            243 passed / 0 failed
TypeScript:                 PASS (0 errors)
Normalization parity (TS):  27/27
Normalization parity (SQL): 27/27, 0 mismatches   [run against production]

Gate A — unoverridden violating groups:   0
Gate B — shared-contact groups found:     1
Gate B — groups reviewed:                 1
Gate B — groups confirmed intentional:    0   (see below)

Migration timestamp collision:            RESOLVED

Overall verdict:  READY, with one documented open conflict
```

## Gate A — unoverridden violations

Predicate matched exactly to the proposed index. `deleted_at` was dropped from
the specified query: **that column does not exist on `guest_contacts`**, and
including it made the query error rather than return zero.

```sql
SELECT COUNT(*) AS violating_phone_groups FROM (
  SELECT user_id, phone_normalized FROM guest_contacts
  WHERE phone_normalized IS NOT NULL AND shared_contact_group_id IS NULL
  GROUP BY user_id, phone_normalized HAVING COUNT(*) > 1
) v;
-- violating_phone_groups = 0
```

The "zero violations" assumption in `20260804160000` therefore still holds
after #280, #281 and #282 merged. Re-run this immediately before merge, since
guests are added continuously.

## Gate B — conflicts hidden inside shared-contact groups

One group. It is **not** confirmed, and that is the correct state.

| Field | Value |
|---|---|
| Number | `255766***854` |
| Guests | Mama Meena, Mr & Mrs Msuya |
| `shared_contact_confirmed` | `false` |
| Approver | bmmassesa@gmail.com |
| Timestamp | 2026-08-04 18:45:48 UTC |
| Reason | Recorded as UNRESOLVED, pending coordinator confirmation |

**This does not block the migration, and it is not "merely excluded from
uniqueness enforcement".** The QA concern was that parking a conflict in
`shared_contact_group_id` would let it pass silently. That was true when the
group id was the only signal. `20260804180000` split confirmation into its own
column precisely to close it: the pair is excluded from the *index* but is
**not deliverable** — `assessRosterDelivery` holds both guests back, so no
card, message, pledge request or entrance pass can reach that handset until a
human decides.

Verified against production: 117 deliverable, 6 held for a missing number,
2 held as an unresolved duplicate.

Still required before the event: the coordinator confirms whether this is one
shared handset or a data-entry error, via `confirmSharedContact` (which
records reason, approver and time) or by correcting one number.

## Normalization-source diagnostic

Aggregated, so no numbers are exposed:

| Source | Guests | `whatsapp_phone` differs from `phone` |
|---|---|---|
| `whatsapp_phone` | 332 | **0** |
| none | 149 | 0 |

`phone` is never the normalization source, because the importer and the guest
form both write the same value to both columns. **No guest anywhere has a
`whatsapp_phone` that differs from their `phone`.**

This matters for the Phase 4B decision: today the "primary contact" and
"WhatsApp destination" readings of `phone_normalized` are indistinguishable in
the data, so nothing currently depends on which one is meant. Introducing
`preferred_channel` is therefore free of migration risk *now*, and will not be
once the two columns start to diverge. Decide before SMS, not after.

## Migration timestamp collision — RESOLVED

`20260804170000_guest_shared_contact_confirmation.sql` →
`20260804180000_guest_shared_contact_confirmation.sql`.

The collision was with `20260804170000_card_font_metrics.sql`, which is
**uncommitted work-in-progress** in the main checkout on
`OF-OPP-card-design-studio`, and is the first of a four-file run
(`170000`–`170300`). Renaming this branch's single file was the smaller,
safer change; renumbering their block would have disturbed uncommitted work.

Checked before choosing: every `20260804*` timestamp across all branches and
the main checkout. `180000` was free. No test, doc or script referenced the old
filename except this directory's own comments, which were updated. **The
migration body was not touched.**

Renaming is safe for production because `apply_migration` stamps its own
wall-clock version — production recorded these as `20260804184447`
(`guest_phone_normalization`) and `20260804193426`
(`guest_shared_contact_confirmation`), so repo filenames never matched prod
versions in the first place.

## Commit structure

Three commits, each independently revertible:

| Commit | Contents |
|---|---|
| `6c41ebc8` | Duplicate control, import staging, shared-contact groups, delivery gating, migrations |
| `15260de7` | `normalizePhone` fix, shared fixture, parity test, generated SQL, staleness check |
| this one | Production preflight, aggregated diagnostic, hidden-conflict query, this file |

An earlier arrangement had the parity work swept into the feature commits by
`git add -A` while two sessions wrote into this worktree concurrently. Nothing
was lost or overwritten, but the messages did not describe their diffs, so the
history was rewritten before opening the PR. Verified byte-identical to the
pre-split tree.

## Reproducing

```bash
psql "$DATABASE_URL" -f scripts/preflight/guest-phone-duplicate-preflight.sql
psql "$DATABASE_URL" -f scripts/preflight/guest-phone-normalization-parity.sql
```

Both are read-only and create nothing. The parity script is generated — after
changing the fixture, run `npx tsx scripts/preflight/generate-phone-parity-sql.ts`,
or the staleness test fails the build.
