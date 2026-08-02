# Open policy questions

Decisions that code currently makes by accident, where the intended answer has
not been stated. Each one stays here until a human confirms it, and is then
encoded in tests rather than left as a gate someone reads back later.

---

## Approvals Analytics audience: DECIDED

**Status:** DECIDED 2026-08-01 by Boris Massesa. Recorded so a later audit does
not re-raise it as a defect.

### The decision

> The Approvals Analytics tab is visible to `finance.write` OR
> `platform.admin`: the owner, the three admins, and the Finance Manager.

It was briefly narrowed to `platform.admin` alone on least-privilege grounds and
deliberately reverted. **Do not tighten this without asking.**

### The tradeoff being accepted, stated plainly

Aggregation is not a meaningful privacy control at ~12 staff. On the tab today:

- By department: `Travel — 1 total, 1 pending`
- Bottlenecks: `OpusFesta Owner — 1 pending, oldest 9h`
- Longest waiting: `Bolt Service — 9h`

Those three "aggregates" together identify one person's one request. The subject
and requester name were deliberately stripped from the payload, and it makes
little difference at this volume.

So the five people above can, in practice, infer request-level facts about
approvals they cannot open directly through the scoped list views. That is
judged acceptable for this group. It would stop being acceptable if the
audience grew, or if request volume stayed low while headcount rose.

### Revisit when

- Anyone outside the five needs the tab. Add an explicit `approvals.analytics`
  permission key rather than widening on a functional permission like
  `finance.write`, which roles inherit to do a job rather than to oversee
  colleagues.
- Request volume grows enough that per-department counts stop identifying
  individuals, at which point a k-anonymity threshold becomes viable without
  blanking the panels permanently.

---

## MD Daily Tracker: organization-wide status board, or restricted workspace?

**Status:** PROVISIONALLY DECIDED 2026-08-01, pending confirmation of role
assignments and allowed content. Raised during the Approvals confidentiality audit.
**Owner:** Boris Massesa
**Code left unchanged pending the answer.**

### Provisional product decision

> **MD Daily Tracker is a shared operational status board for authorized
> workforce users, not a personal desk.**
>
> Users with `workforce.read` may view all MD Daily Tracker entries within
> their organization. The tracker must not contain payroll, disciplinary,
> medical, private HR, or other employee-confidential details.

The second sentence is the load-bearing one. A broad operational board is safe
only when its content model is constrained. Access breadth and content
constraint are one decision, not two.

**Access was deliberately NOT widened or narrowed in this branch.** The gate is
unchanged.

### Two follow-ups this decision creates

1. **Confirm the role assignments.** `workforce.read` is only the right gate if
   it is intentionally granted to exactly the people allowed to see every
   engine's entries. That has not been checked against the current
   `workforce_roles` rows.
2. **Constrain or re-gate the content.** Tracker entries today are unrestricted
   free text (`top_priority`, `other_tasks`, `blockers`, `end_of_day_note`).
   Nothing stops someone typing a disciplinary or medical detail into a
   blocker. Either add content guidance plus moderation controls, or replace
   the gate with a narrower `operations.tracker.read`.

Until (2) is resolved, the policy above is an assertion about what the tracker
*should* contain, not something the system enforces.

### The original question

> Is MD Daily Tracker an organization-wide operational status board, or a
> restricted manager/participant workspace?

### What the code does today

`app/(admin)/workforce/daily-tracker/page.tsx` gates viewing on:

```ts
const canView = await hasAnyPermission([
  'workforce.read',
  ...engineWriteKeys,       // md_tracker.opusfesta.write, .opusstudio.write, .opuspass.write
  'md_tracker.review',
])
```

So **anyone holding `workforce.read` can read every engine's entries** —
priorities, blockers, end-of-day notes and week reviews for all three engines,
not only their own.

Writes are correctly narrower: each MD holds only their own engine's
`md_tracker.<engine>.write`, and `md_tracker.review` is separate.

### Why it is not being inferred

The existing `workforce.read` gate is not evidence of intent. It is equally
consistent with:

- **Status board** — deliberately transparent, everyone sees how each engine is
  tracking, and the narrow write keys exist only to stop cross-editing.
- **Restricted workspace** — the read gate was set to the nearest available
  permission during the build and never revisited, and blockers or end-of-day
  notes were never meant for the whole workforce.

The Approvals module looked equally deliberate right up until it turned out to
be shipping every request in the company to any holder of `finance.read`. The
lesson taken from that: a broad gate on narrow data is a question, not a design.

### What each answer would require

**If organization-wide status board:**
- Keep the gate.
- Add a test asserting a `workforce.read`-only account sees all engines, so the
  breadth is deliberate and regression-protected rather than incidental.
- Note it in the module header so the next audit does not re-raise this.

**If restricted manager/participant workspace:**
- Scope reads to the caller's own engine(s) plus `md_tracker.review`.
- Server-side, before selection — the Approvals fix showed that filtering in the
  component still ships the rows in the RSC payload.
- Add negative tests: an MD of one engine receives zero rows for the others.

### Not a finding

This is **not** currently classified as a confidentiality defect. No
unauthorized-row disclosure has been demonstrated, because the intended
audience has not been established. It is recorded so the decision is made
explicitly rather than by default.
