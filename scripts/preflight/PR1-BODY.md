## Phase 0 — Guest duplicate control

Makes the guest list the controlled source of truth for cards, pledges, WhatsApp
sends, wallet passes, RSVP and entrance access.

Four commits, each independently revertible:

| Commit | Contents |
|---|---|
| `6c41ebc8` | Duplicate control, import staging, shared-contact groups, delivery gating, migrations |
| `15260de7` | `normalizePhone` fix, shared fixture, parity test, generated SQL, staleness check |
| `c3adcd24` | Production preflight, aggregated diagnostic, hidden-conflict query, verdict |
| `54afde5f` | Normalization-vs-validity contract for multi-number fields |

### The defects

**Duplicate detection compared raw digits.** `'0757200767'` and `'+255757200767'`
are the same Tanzanian number but different digit strings, so a list mixing the
two formats put two guests on one number — each getting their own card and their
own paid message to the same handset. `updateGuest` had no duplicate check at all.

**Import dropped conflicting rows silently**, reporting three integers. On the
Moses Seeta list that cost a guest her number outright: it collided with a later
row in the same file, her record was written with no number, and the number
reappeared by hand on a different guest hours later.

**Nothing stopped a duplicate being *sent* to.** The database could refuse to
create one while the send paths messaged one handset twice.

### Evidence

Full record with masked numbers: `scripts/preflight/PHASE0-VERDICT.md`

```
Automated tests:            243 passed / 0 failed
TypeScript:                 PASS (0 errors)
Normalization parity (TS):  27/27
Normalization parity (SQL): 27/27, 0 mismatches   [run against production]

Gate A — unoverridden violating groups:   0
Gate B — shared-contact groups found:     1  (reviewed, correctly held)
Migration timestamp collision:            RESOLVED
```

Point-in-time production counts, **2026-08-04**, commit `c3adcd24`:

```
117 deliverable
  6 held for missing number
  2 held for unresolved shared-number conflict
```

### The one open conflict

A guest pair shares `255766***854`. It is **structurally isolated from automatic
delivery and admission workflows, but operationally unresolved** pending
coordinator confirmation. The software containment is done; the guest-data
decision is not. Do not describe this pair as resolved.

`assessRosterDelivery` holds both guests back, so no card, message, pledge
request or entrance pass can reach that handset until a human decides via
`confirmSharedContact` (which records reason, approver and time) or corrects one
number.

### Two corrections to the specified gate

- Gate A's predicate included `deleted_at IS NULL`. **That column does not exist**
  on `guest_contacts`; the query errored rather than returning zero, and a gate
  that throws is indistinguishable from one nobody ran.
- The normalization-source diagnostic was specified per-row, which would have put
  every guest's number into PR evidence. Aggregated instead.

### A Phase 4B deadline, not just a note

Of 332 guests with a number, **zero** have a `whatsapp_phone` differing from
their `phone`. The "primary contact" and "WhatsApp destination" readings of
`phone_normalized` are indistinguishable in today's data, so `preferred_channel`
can be introduced without migration risk **now**, and cannot once the columns
diverge.

---

## ⚠️ Unmet acceptance condition: browser QA

**No screen in this work has been seen rendering.** The backend and production
gates pass, but this feature exists to help admins understand ambiguous guest
data, and passing tests does not prove a warning is visible or an action is
comprehensible.

Needs a click-through by someone signed in. Use synthetic or masked data in any
screenshots.

- [ ] **Import Review** — upload a fixture with one clean guest, one in-file
      duplicate, one duplicate against the roster, one invalid number, one
      missing phone, one possible name match. Verify counts are correct, problem
      rows are prominent, the roster is **not** modified before approval, and
      `duplicate_blocked` appears only in staging.
- [ ] **Import receipt** — verify it never claims blocked rows were imported.
- [ ] **Resolve panel** — both records visible, actions understandable, approval
      requires a reason, UI states delivery stays blocked until confirmation, and
      no action implies an automatic merge.
- [ ] **Send dialog** — select a mix of ready / missing-number / unresolved-duplicate
      / approved-shared guests. Verify ineligible guests are excluded, exact
      counts shown, who was excluded is viewable, and nothing reaches the
      unresolved shared number.
- [ ] **Search** — partial first name, partial surname, surname-first, phone
      fragments, titles and extra spacing; results update while typing.

Attach: import summary with mixed statuses, a duplicate conflict row, the resolve
panel, the send dialog showing exclusions, and the clean guest table after
resolution.

## Before deployment

- [ ] **Re-run Gate A immediately before applying the migration.** Guests are
      added continuously; the zero-violation result above is point-in-time.

```bash
psql "$DATABASE_URL" -f scripts/preflight/guest-phone-duplicate-preflight.sql
psql "$DATABASE_URL" -f scripts/preflight/guest-phone-normalization-parity.sql
```

Both read-only; they create nothing.

### Note on migration state

Both migrations are **already applied to production** (via `apply_migration`,
recorded as `20260804184447` and `20260804193426`). Repo filenames never match
prod versions, so the `170000` → `180000` rename that resolves the collision with
`card_font_metrics` has no effect on prod state.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
