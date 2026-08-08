# Check-in Report Templates — Specification

**Status:** Approved for implementation, revision 3.
**Date:** 7 August 2026
**Supersedes:** the single-PDF design in `apps/opus_pass/src/lib/checkin-report-pdf.tsx`

**Revision 2:** finalization produces an immutable snapshot rather than a
timestamp (§3, §7.3); operational closure separated from report finalization
(§3); `rescansBlocked` renamed to `exhaustedAttempts` in the canonical model
(§2, §4.1); route security moved to implementation step 1 (§8). Also: resolution
method split from admission mode (§7.1), localization contract (§6.7), metric
provenance contract (§9), open questions resolved (§10).

**Revision 3 — four locked invariants (§3.2–§3.5):** finalization is one atomic
transaction; availability is `finalizedAt !== null && activeSnapshot !== null`
and fails closed when those disagree; reopening supersedes the active snapshot
immediately; the snapshot is self-describing so a rendered report never joins
mutable event state. Plus: finalization freezes facts rather than PDF bytes
(§3.3), renderers dispatch explicitly on `modelVersion` (§3.5), and `INTERNAL`
is confirmed as an audience marker rather than a fourth event state (§3.1, §6.4).

---

## 0. Summary

Today OpusPass produces one check-in PDF for every purpose: a four-tile header and
a seven-column guest table, generated from whatever the browser posts to an
unauthenticated route. It is used before the event, during it, and after it, by
couples and by staff alike.

This spec replaces it with **three report products** sharing **one canonical data
model**. The report does not change shape by time. The audience changes, and each
audience gets a template built for it.

| Report | Audience | Question it answers | Availability |
| --- | --- | --- | --- |
| Operations | Gate manager, coordinator, security, couple during the event | "What is happening right now?" | Check-in activation onward |
| Client Event Report | Couple, family, planner | "How did our event go?" | After explicit finalization only |
| Internal Audit | OpusFesta staff | "Can we prove exactly what happened?" | Whenever ledger rows exist |

Four principles govern every decision below.

1. **No invented metrics.** A number appears only if it is measured. Queue wait
   time, human scan duration, and a composite event score are named here as
   *unavailable* so nobody re-proposes them.
2. **Invitations are not people.** A Double Entry card is one invitation and two
   seats. Every count carries its unit in its name.
3. **The Client report is a persisted snapshot, not a query.** Finalization writes
   an immutable copy of the model. The report renders from that copy forever.
4. **The model names what the data proves.** Where a source value is ambiguous,
   the model field keeps the ambiguity and only the template chooses friendlier
   words.

---

## 1. Field provenance

Everything below is verified against the live database, not inferred.

### 1.1 `checkin_scan_events` — the admission ledger

Added by `supabase/migrations/20260802210000_opuspass_admission_counters.sql`,
credential tagging by `...20260802220000_opuspass_admission_credentials.sql`.
**Applied to production; 8 rows present as of this writing.** Append-only.

| Column | Meaning |
| --- | --- |
| `request_id` | UNIQUE. Idempotency key; a retry cannot insert twice. |
| `guest_invitation_id`, `event_id` | The claim is bound to one invitation and one event. |
| `result` | `in_progress` \| `admitted` \| `exhausted` \| `not_attending` |
| `admitted_count` | Seats admitted by *this* mutation. Negative for a downward amendment. |
| `total_after`, `allowance_after` | Response as originally answered, so replays reproduce it. |
| `source` | Which code path called in. Currently always `api`. **Not a device identity.** |
| `reason` | Required for amendments. Explains a hand-corrected headcount. |
| `checked_in_by` | Free-text audit label. See 1.3. |
| `checked_in_door` | Door label at time of scan. |
| `credential_id`, `credential_format` | Which credential opened the door. Tagged post-admission, best-effort. |
| `created_at`, `completed_at` | `clock_timestamp()`, so rows in one transaction keep their order. |

**`exhausted` is ambiguous and the model must preserve that.** It covers both a
re-scan of a fully-used pass and a request for more seats than remain. The two are
indistinguishable in this column, and the migration comment says so explicitly:
both read the same at the door. Therefore:

- **Canonical model field:** `exhaustedAttempts` — names the source condition, claims nothing more.
- **Client-facing label:** "Additional Entry Attempts Safely Blocked".
- **Never:** "duplicate attempts", "re-scan attempts blocked", or any wording
  implying fraud. The ledger does not prove intent.

### 1.2 `guest_invitations` — the admission record

Unique per (guest, event). Relevant columns: `rsvp_status`, `party_size`,
`entry_allowance`, `checked_in_count`, `checked_in_at`, `checked_in_by`,
`checked_in_door`, `pass_id`, `entry_code`.

`checked_in_at` / `_by` / `_door` are **frozen first-entry fields**: they describe
the first successful admission only. A party admitted across two doors cannot be
described by them. Per-admission truth lives in the ledger.

`checked_in_party_size` is deprecated (mirrors `checked_in_count`). **Do not read
it in the new model.**

### 1.3 The audit label, and why it needs a migration

`checked_in_by` is assembled in `apps/opus_pass/src/app/api/checkin/scan/route.ts`
as:

```
"{attendant} ({door}) [{identifierType}]" + optional " (manual: {reason})"
```

`identifierType` ∈ `credential` | `legacy_entry_code` | `pass_id` | `roster_pick`.

Live example from production:

```
Boris Massesa (Main Gate) [roster_pick] (manual: QR could not be scanned)
```

Manual admissions are therefore *derivable but only by regex*. Producing a
client-facing "Manual Admissions: 1" by parsing a display string is the class of
thing that breaks silently when someone edits the label. §7.1 specifies the fix.

### 1.4 Delivery status

Source: `whatsapp_messages`, filtered `direction = 'out'`, `kind = 'invite'`,
per `event_id`, ordered oldest-first so the newest row per guest wins (a
successful re-send must replace an earlier failure).

`status` maps to `pending` | `delivered` | `read` | `failed`. Meta's numeric error
code is parsed from `error` and translated to plain language by
`DELIVERY_FAILURE_REASONS` in `queries.ts`.

**Critical denominator warning.** The existing dashboard funnel computes
`delivered` as "attempted and not *known* to have failed," which counts guests
with no receipt at all (SMS, manual share) as delivered. That optimistic bias is
correct for an internal funnel, where under-reporting would be a false alarm. It
is **wrong for a client-facing metric**: it would tell a couple an invitation was
delivered when we have no evidence it arrived. The Client report uses **confirmed
delivery only** (`delivered` or `read` receipt present). See 4.4 for the required
wording.

### 1.5 Event lifecycle

**`wedding_events` has no closure or finalization column.** It has `starts_at` and
`ends_at` and nothing else that could gate the Client report. Both lifecycle
timestamps are new schema. See 7.2.

---

## 2. The canonical model

One builder, `buildCheckinReportModel(eventId)`, server-side, reading the ledger +
`guest_invitations` + `whatsapp_messages`. Operations and Audit render from it
live. **The Client report never calls it directly** — it renders from a persisted
snapshot of its output (§3.2).

```ts
/** Bumped whenever the shape below changes incompatibly. Persisted with every
 *  snapshot so a year-old Client report still renders under a newer codebase. */
export const CHECKIN_REPORT_MODEL_VERSION = 1

interface CheckinReportModel {
  /** Lives at the top level only, deliberately NOT mirrored inside
   *  `finalization`. The whole blob is versioned by this one field; two copies
   *  of a version number is precisely the pair that drifts. */
  modelVersion: number

  event: {
    id: string
    name: string
    partner1Name: string | null
    partner2Name: string | null
    eventType: string | null
    startsAt: string | null          // ISO
    endsAt: string | null            // ISO
    venueName: string | null
    city: string | null
  }

  // ── Lifecycle. Two stages, deliberately separate. See §3. ───────────────
  //
  // Self-describing on purpose: a rendered report must never join mutable
  // event state to work out what version of reality it represents. Everything
  // needed to identify the snapshot travels inside it.
  finalization: {
    status: 'live' | 'closed' | 'final'
    snapshotId: string | null       // pre-generated before the model is built (§3.2)
    version: number | null
    checkinClosedAt: string | null
    checkinClosedBy: string | null
    finalizedAt: string | null
    finalizedBy: string | null
  }

  // ── Counts. Unit is in the name, always. ────────────────────────────────
  counts: {
    confirmedInvitations: number     // rsvp_status = 'attending'
    confirmedSeats: number           // SUM(entry_allowance) over the above
    admittedInvitations: number      // confirmed AND checked_in_count > 0
    admittedSeats: number            // SUM(checked_in_count)
    singleInvitations: number        // entry_allowance = 1
    doubleInvitations: number        // entry_allowance >= 2
    partiallyAdmittedInvitations: number  // 0 < checked_in_count < entry_allowance
    noShowInvitations: number        // confirmed AND checked_in_count = 0
  }

  // ── Rates. Each carries its own denominator. ────────────────────────────
  rates: {
    seatAttendance: { numerator: number; denominator: number } | null
    invitationAttendance: { numerator: number; denominator: number } | null
    confirmedDelivery: { numerator: number; denominator: number } | null
  }

  // ── Arrival story. Derived from ledger timestamps, never from clock strings.
  arrivals: {
    firstAdmittedAt: string | null   // ISO
    lastAdmittedAt: string | null    // ISO
    buckets: { startsAt: string; seats: number; cumulativeSeats: number }[]
    bucketMinutes: number
    peak: { startsAt: string; endsAt: string; seats: number } | null
  }

  doors: { label: string; admittedSeats: number; admittedInvitations: number }[]

  integrity: {
    /** result = 'exhausted'. Covers BOTH re-scans of a used pass AND requests
     *  exceeding the remaining allowance. The ledger cannot separate them, so
     *  neither does this field. Templates must not claim otherwise. */
    exhaustedAttempts: number
    notAttendingBlocked: number      // result = 'not_attending'
    manualAdmissions: number | null  // admission_mode = 'manual'. null until 7.1 lands.
    amendments: number               // admitted_count < 0
  }

  delivery: {
    attempted: number
    confirmed: number                // delivered or read receipt
    read: number
    failed: number
    noReceipt: number                // attempted, no receipt — never "delivered"
    failureReasons: { reason: string; count: number }[]
  }

  guests: CheckinReportGuest[]
  staff: { name: string; doors: string[]; admittedSeats: number }[]

  generatedAt: string                // ISO, server clock
}

interface CheckinReportGuest {
  invitationId: string
  name: string
  passId: string | null
  entryAllowance: number             // 1 = Single, 2+ = Double
  admittedSeats: number
  status: 'admitted' | 'partial' | 'not_arrived'
  firstAdmittedAt: string | null     // ISO. Templates format; the model never does.
  door: string | null
  tableName: string | null
  attendantName: string | null       // structured, post-7.1
  resolutionMethod: ResolutionMethod | null
  admissionMode: AdmissionMode | null
  manualReason: string | null
}

type ResolutionMethod = 'credential' | 'pass_id' | 'legacy_entry_code' | 'roster_pick'
type AdmissionMode = 'scan' | 'manual'
```

**Rules the model must obey.**

- Timestamps are ISO throughout. The current PDF receives `"12:52 AM"` and
  therefore *structurally cannot* draw a timeline. That is the root cause of the
  missing arrival story, not a design oversight.
- Every rate is a `{numerator, denominator}` pair, never a bare percentage, so a
  template can always print "78 of 93" beside "83.9%".
- Rates are `null`, not `0`, when the denominator is zero. Zero percent and
  "nothing to measure yet" are different facts and must render differently.
- `manualAdmissions` is `null` before the 7.1 migration. Templates render `null` as
  "not recorded", never as `0`.
- **Model field names describe the source condition, not the interpretation.**
  `exhaustedAttempts`, not `rescansBlocked`. Friendly wording lives in the
  template's translation dictionary (§6.7), never in the model.

---

## 3. Lifecycle, availability, and the snapshot

### 3.1 Two stages, not one

Closing the gate and issuing the permanent record are different operational
moments. The doors may close at midnight while the coordinator corrects two
mistakes the following morning. Forcing both through one timestamp would mean
reopening an entire event to fix a wrong table number.

```
LIVE  ──close check-in──▶  CLOSED  ──finalize report──▶  FINAL
  ▲                          ▲ │                           │
  └──── reopen gate ─────────┘ └───── reopen report ───────┘
                                      (supersedes snapshot immediately)
```

| State | Gate | Corrections | Client report | Set by |
| --- | --- | --- | --- | --- |
| `live` | Open | Yes | No | default |
| `closed` | Closed | Yes | No | `checkin_closed_at` |
| `final` | Closed | Reopen required | Yes, snapshot-backed | `report_finalized_at` |

**The event lifecycle is `live → closed → final` and nothing else.** `INTERNAL`
is a document-head pill on the Audit report (§6.4), an audience marker, not a
fourth event state. Keep the pill vocabulary out of domain state; if `INTERNAL`
ever appears in a lifecycle column, something has leaked.

Reopening from `final` lands in `closed`, not `live`. Correcting a table number
should not reopen the gate. Reopening the gate is the separate `closed → live`
transition.

| Report | Available when |
| --- | --- |
| Operations | From check-in activation onward. Read-only once `closed`. |
| Client Event Report | `report_finalized_at IS NOT NULL` **and** a current snapshot exists |
| Internal Audit | Any time ledger rows exist, with staff permission |

### 3.2 Finalization writes a snapshot

Freezing cannot be a promise that the live tables happen to reproduce an old
result. Invitations get edited, table assignments change, RSVPs are corrected, and
delivery receipts keep arriving from Meta after the party ends. Any of those would
silently change a "frozen" report regenerated a year later.

> **Finalization is a transactional creation of an immutable canonical snapshot.
> A Client Event Report exists if and only if an active finalized snapshot
> exists. Closure alone never creates or exposes a Client report.**

**Finalization is one atomic transaction.** An event must never carry
`report_finalized_at` while its snapshot failed to write, or the reverse.

```
BEGIN
  verify event is CLOSED
  verify caller may finalize
  pre-generate snapshotId + next version
  build canonical model (embedding that identity in `finalization`)
  validate model
  insert immutable snapshot
  set report_finalized_at / report_finalized_by
COMMIT
```

If any step fails, neither the FINAL state nor the snapshot exists. The snapshot
UUID is generated *before* the model is built so the model can embed its own
identity, which keeps the row append-only (no post-insert patch).

**Availability is the conjunction, not the timestamp:**

```ts
clientReportAvailable =
  event.reportFinalizedAt !== null && activeSnapshot !== null
```

If those two ever disagree — corruption, a failed historical migration — **fail
closed** and raise an internal data-integrity error. Never regenerate from
current tables to paper over the gap. A report that silently reconstructs itself
from today's data is exactly the failure this whole section exists to prevent.

### 3.3 Finalization freezes facts, not bytes

The immutable artifact is the **canonical snapshot**, not the PDF. The document
can be regenerated from the same snapshot whenever fonts, renderer internals,
accessibility metadata, or layout improve, and the event's numbers stay identical
because they were never re-derived.

If byte-for-byte archival is needed later, store the generated PDF and its hash
alongside the snapshot. Do not make those bytes the source of truth.

### 3.4 Corrections after finalization

```
FINAL v1
   │ reopen
   ▼
CLOSED              snapshot v1 marked superseded IMMEDIATELY
                    Client report unavailable
   │ corrections
   │ finalize
   ▼
FINAL v2            new immutable snapshot
```

Superseding happens **at reopen**, not at re-finalization. A PDF must not keep
presenting itself as the current record while edits are underway.

Amendments are always recordable; the ledger is never locked, because a genuine
correction must always be possible. Superseded snapshots are retained, never
deleted — they are the audit history. The Client report always prints its own
version and finalization timestamp, so two copies in circulation are
distinguishable.

### 3.5 Renderers dispatch on model version explicitly

Persisted JSON plus evolving code means historical snapshots must never be
reinterpreted under changed semantics. Renderers switch on the version and refuse
what they do not know:

```ts
switch (snapshot.modelVersion) {
  case 1:  return renderModelV1(snapshot.model)
  case 2:  return renderModelV2(snapshot.model)
  default: throw new UnsupportedReportModelVersionError(snapshot.modelVersion)
}
```

Old snapshots may be migrated forward deliberately later. They are never silently
treated as today's interface.

### 3.6 Who may finalize, and how

Not staff-only: that creates a support dependency on every wedding. Not a casual
button beside ordinary controls either.

- **Permitted:** the authorized event owner or coordinator, and OpusFesta staff.
- **Required:** a deliberate confirmation step spelling out the consequences.
- **Audited:** every close, finalize, and reopen records actor and timestamp.

Confirmation copy:

```
Finalize check-in report?

Once finalized:
  • Live check-in closes
  • Final report figures are frozen
  • Later corrections require reopening the event

[Cancel]                              [Finalize event]
```

This is what prevents the night-before scenario. The attached sample PDF was
generated at 01:08 on 7 August for an 8 August wedding and showed 3% turnout.
Wrapping a keepsake around that number was only possible because a single report
served every moment of the event's life.

---

## 4. Metric definitions

### 4.1 Included in the Client report

| Client-facing label | Model field | Definition |
| --- | --- | --- |
| Confirmed Invitations | `counts.confirmedInvitations` | `rsvp_status = 'attending'` |
| Confirmed Seats | `counts.confirmedSeats` | `SUM(entry_allowance)` over confirmed |
| Guests Admitted | `counts.admittedSeats` | `SUM(checked_in_count)` |
| Attendance Rate | `rates.seatAttendance` | `admittedSeats / confirmedSeats` |
| Invitations Confirmed Delivered | `delivery.confirmed` | Positive receipt only (1.4) |
| Additional Entry Attempts Safely Blocked | `integrity.exhaustedAttempts` | `result = 'exhausted'` |
| Manual Admissions | `integrity.manualAdmissions` | `admission_mode = 'manual'`. Post-7.1 only. |
| First Guest Arrived | `arrivals.firstAdmittedAt` | `MIN(created_at)` where `result = 'admitted'` |
| Last Guest Arrived | `arrivals.lastAdmittedAt` | `MAX(created_at)` where `result = 'admitted'` |
| Peak Arrival Period | `arrivals.peak` | Densest bucket, reported as a window |
| Invitation Type Breakdown | `counts.single/doubleInvitations` | Single vs Double counts |

**Attendance Rate is computed on seats, not invitations.** In this market a Double
Entry card is two admissions. An invitation-based rate understates a wedding where
Double cards dominate, and the attached sample is 78 Double against 15 Single, so
the two rates differ materially. The seat rate is primary; the invitation rate may
appear as a secondary line.

### 4.2 Prohibited — do not implement

These are named so they are not re-proposed. Each requires measurement that does
not exist.

| Metric | Why not |
| --- | --- |
| Average scan time / "1.3 seconds" | We store server RPC latency only (live range: 1ms–45ms). Printing 18ms is meaningless to a couple; printing 1.3s is fabricated. No human-interaction timer exists anywhere in the scanner. |
| Queue wait time | Nothing records when a guest joined a line. Closing this needs an "arrived at queue" event captured at the gate, which will not happen reliably at a real wedding. Not approximable. |
| Composite event score (96/100) | Most inputs are unavailable, so it would average real numbers with placeholders. A single score on a keepsake also invites "why did we lose four points on our wedding day?" If a diagnostic score is ever wanted, it belongs on Operations or Audit, never on the Client report. |
| Check-in Success Rate | Scans that fail before resolving to an invitation (bad QR, unknown credential) never reach the RPC and write no ledger row. The denominator does not exist. |

If any of these is wanted later, the spec change is *instrumentation first,
metric second*.

### 4.3 Unavailable for the Audit report

The Audit template lists these as **"not captured"** rather than omitting them
silently, so the gap stays visible:

- **Device identity.** `source` is a code path (`api`), not a device. No device ID
  is recorded anywhere.
- **Operator identity.** `checked_in_by` holds a typed display name, not a
  verified account. It is attributable, not authenticated.
- **Failed scans.** Only attempts resolving to a real invitation are logged.

### 4.4 Delivery, worded so uncertainty stays visible

"84 of 93 invitations confirmed delivered" still reads as though the other nine
failed. Required presentation:

```
84   Confirmed Delivered
     Of 93 invitations sent · 9 have no delivery receipt
```

Unknowns are never collapsed into success or failure. Where failures exist, the
plain-language reason summary appears beneath; raw Meta codes never do.

---

## 5. Privacy exposure by audience

| Field | Operations | Client | Audit |
| --- | --- | --- | --- |
| Guest name | ✅ | ✅ | ✅ |
| Pass ID | ✅ | ✅ | ✅ |
| Phone / WhatsApp number | ✅ (search) | ❌ | ✅ |
| Table assignment | ✅ | ✅ | ✅ |
| Attendant name | ✅ | Aggregate only | ✅ |
| Manual reason text | ✅ | ❌ | ✅ |
| Credential ID / format | ❌ | ❌ | ✅ |
| Meta failure codes | ❌ | Plain language only | ✅ |
| Request IDs, replay records | ❌ | ❌ | ✅ |

The Client report carries **no phone numbers and no raw failure codes**. Manual
reasons ("QR could not be scanned") are operational detail that reads as fault in a
keepsake; the Client report shows the count, not the text.

**Appendix toggle.** Included by default, suppressible before download. Framed as
a content choice, not a security warning, because most couples and every planner
will want it:

```
☑ Include detailed guest list
   Guest names, ticket type, arrival time and table
```

---

## 6. Template layouts

### 6.1 Client Event Report — 6 designed pages + appendix

Target 4–6 designed pages. The appendix carries the length; the designed portion
stays intentional.

**Page 1 — Cover.** Couple names (`partner1Name` & `partner2Name`, falling back to
event name), event type, date, venue. OpusPass mark. No statistics, and **no
document head** — the cover is the one page that is purely keepsake. The cover
identifies the event; it does not grade it.

**Page 2 — Event Summary.** Carries the invoice-style document head (6.4): logo
left, `EVENT REPORT` and the `FINAL` pill right, meta grid beneath. Then
Confirmed Invitations, Confirmed Seats, Guests Admitted, Attendance Rate.
Single/Double breakdown. Each rate prints its numerator and denominator beside it.

**Page 3 — Arrival Story.** Hand-built SVG arrival timeline (6.5), peak arrival
period, first and last arrival.

**Page 4 — Check-in Performance.** Framed as the system working, not as incidents
survived. A large "37 blocked attempts" tile would make a wedding look chaotic
when it means the opposite.

```
Check-in Performance

  2                    4                         6                         3
  Entry Points Used    Check-in Team Members     Additional Entry          Manual
                                                 Attempts Safely Blocked   Admissions

OpusPass automatically prevented admissions beyond the valid ticket allowance.
```

The explanatory line is required, not optional. Without it the blocked count
implies attempted fraud, which the ledger does not prove (§1.1).

**Page 5 — Invitation Health.** Delivery per §4.4.

**Page 6 — Closing.** Short thank-you and report metadata: finalized timestamp,
report version, event ID.

**Appendix — Guest admission record.** Columns per 6.6. Suppressible per §5.

Operations and Audit have no cover, so their document head sits on page 1.

### 6.2 Operations Report — live, on screen

No cover, no thank-you, no storytelling. Current attendance, arrivals in the last
25 scans, manual admissions, exhausted attempts, gate activity, searchable guest
list.

Most of this already exists in
`apps/opus_admin/src/app/(admin)/operations/checkin/[eventId]/CheckinReportClient.tsx`
(arrival-flow chart, cumulative area with an expected reference line,
arrivals-by-door, turnout meter, door window, no-shows, CSV). The work is
re-pointing it at the shared model and exposing a couple-facing view in
`opus_pass`, since the stated audience includes the couple during the event and
`opus_admin` is staff-only.

### 6.3 Internal Audit Report

Raw ledger, one row per mutation: `request_id`, timestamps, result,
`admitted_count`, `total_after`, `allowance_after`, source, credential format,
door, attendant, resolution method, admission mode, reason. Plus a "not captured"
section per 4.3, and the full snapshot history (every version, including
superseded). Never shown to clients.

### 6.4 Document head — matches the invoice

All three reports use the **invoice head pattern**, not the current report head.

The invoice (`apps/opus_pass/src/lib/invoice-pdf.tsx:410-425`) lays out:

```
[logo, left]                                    [right-aligned block]
                                                INVOICE            21pt bold, letterSpacing 2.4
                                                ( PAID )           status pill

[meta grid: label/value pairs]                  [billed-to block, right-aligned]
  ORDER ID        OF-1234
  PAYMENT DATE    2 August 2026
```

Applied to reports:

| Invoice element | Report equivalent |
| --- | --- |
| `INVOICE` | `EVENT REPORT` / `CHECK-IN REPORT` / `AUDIT REPORT` |
| `PAID` / `PAYMENT VERIFYING` pill | **`LIVE` / `CLOSED` / `FINAL` / `INTERNAL`** |
| Order ID, payment date, event date | Event, date, venue, generated, report version |
| Billed-to block | Couple names block |

**The status pill is doing real work here.** The invoice pill exists so nobody
mistakes an unverified payment for a settled one. The report pill carries the same
weight, and needs four states to match the lifecycle in §3.1:

| Pill | Meaning | Treatment |
| --- | --- | --- |
| `LIVE` | Figures still moving | Amber |
| `CLOSED` | Entry ended, record not yet issued | Neutral |
| `FINAL` | Snapshot written, figures frozen | Sage / emerald |
| `INTERNAL` | Audit report, never client-facing | Brand purple |

`INTERNAL` is an audience marker, **not an event state**. The event lifecycle is
`live → closed → final` only (§3.1).

Head styles to mirror verbatim: `top` (row, space-between, `marginBottom: 30`),
`logo` (30×93), `docTitle` (right-aligned), `h1` (21pt, `letterSpacing: 2.4`,
Helvetica-Bold), `paid` (pill: `borderRadius: 999`, 1pt border, 9pt bold,
`letterSpacing: 0.8`), `meta`/`metaGrid`/`mi`/`label`/`val`.

Two consequences for the current report:

- The head stops being a `fixed` block repeated on every page. The invoice head
  appears **once**. Continuation pages get a slim running header (event name +
  page number) instead of the full four-line block that currently eats 150pt of
  every page's top margin.
- `PDF_PAGE_PADDING` reverts to the shared invoice value (`paddingTop: 48`); the
  current `paddingTop: 150` override exists only to clear the repeated head.

**Do not refactor `invoice-pdf.tsx` to consume the shared head.** The comment in
`pdf-letterhead.tsx:8-12` is explicit that the invoice deliberately keeps its own
inline copy because it is live and payment-critical. Factor a `PdfDocumentHead`
into `pdf-letterhead.tsx` for the reports to use, and leave the invoice alone.

### 6.5 PDF rendering constraints

Non-negotiable, verified against the existing renderer.

- **No emoji.** react-pdf's standard Helvetica silently drops non-Latin glyphs.
  The existing code already draws its check mark as an SVG path for exactly this
  reason (`checkin-report-pdf.tsx:14-23`). 🟢 ✅ ⏳ 👥 📈 will render as nothing.
  Build a small PDF icon set of SVG paths instead.
- **No Recharts.** It cannot render into a PDF. Charts are hand-built
  `<Svg>`/`<Path>`/`<Rect>` components taking model data directly. This also keeps
  the PDF deterministic and prevents web/export drift.
- **Status is a drawn pill**, not a colored word: a rounded `<Rect>` with a fill
  plus a text label. Colour never carries meaning alone.
- Existing tokens to reuse: `BRAND #5c2d8c`, `SAGE #2E7D55`, `NEUTRAL #9ca3af`.

### 6.6 Conditional columns and empty states

The attached sample wasted three of seven columns on `—`. Rules:

- **Drop a column** when every row holds the same value or no value. Applies to
  Table, Door, and Attendant.
- **Promote instead of repeat.** A single distinct attendant becomes a header line
  ("Primary check-in officer: Boris Massesa") and the column disappears.
- Unset table renders `Unassigned` in muted grey, never `—`, when the column
  survives.
- **Empty states are sentences.** No arrivals reads "No guests were admitted at any
  door", not `0`.
- A `null` rate renders as "Not yet measured", never `0%`.

Client appendix columns, in order: **Guest, Pass, Ticket, Status, Arrived,
[Table], [Door]** — the last two conditional.

### 6.7 Localization

Architect for both languages immediately; ship one language per document.

- **Every string** — labels, empty states, status pills, failure summaries, chart
  axis text, closing copy — comes from a report translation dictionary from day
  one. No hard-coded English anywhere, including inside SVG components, where it
  is easiest to overlook.
- **Default** follows the event or account language.
- **Selectable** at download: `Report language: [English] [Kiswahili]`.
- **Never bilingual side-by-side by default.** Doubling every label would inflate
  PDF density and undermine the design.

This mirrors the existing OpusPass bilingual CMS pattern (`LocalizedText{en,sw}`).

---

## 7. Schema changes

### 7.1 Structured admission fields (required)

Stop parsing a display string for a client-facing number. Resolution and mode are
**separate concepts** and must not be collapsed: `roster_pick` describes how the
invitation was found, `manual` describes the operational path taken. They
correlate today but need not forever — someone may search by Pass ID and then
deliberately override, which is manual without being a roster pick.

```sql
ALTER TABLE checkin_scan_events
  ADD COLUMN IF NOT EXISTS resolution_method TEXT,  -- credential | pass_id | legacy_entry_code | roster_pick
  ADD COLUMN IF NOT EXISTS admission_mode    TEXT,  -- scan | manual
  ADD COLUMN IF NOT EXISTS manual_reason     TEXT,
  ADD COLUMN IF NOT EXISTS attendant_name    TEXT;
```

- `checkin_admit_guest()` gains the corresponding parameters.
- `checked_in_by` is **retained unchanged** for backward compatibility. Nothing
  that reads it today breaks.
- Backfill by parsing the existing 8 rows once, in the migration, where the label
  matches the known shape. Rows that do not match stay `NULL` and surface as "not
  recorded" rather than being guessed at.
- Until this lands, `integrity.manualAdmissions` is `null` and the metric appears
  in the Audit report only.

### 7.2 Two-stage lifecycle (required)

```sql
ALTER TABLE wedding_events
  ADD COLUMN IF NOT EXISTS checkin_closed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checkin_closed_by     UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS checkin_reopened_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS report_finalized_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS report_finalized_by   UUID REFERENCES users(id);
```

No lifecycle concept exists today (verified against the live table).

### 7.3 Immutable report snapshots (required)

```sql
CREATE TABLE IF NOT EXISTS checkin_report_snapshots (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id               UUID NOT NULL REFERENCES wedding_events(id) ON DELETE CASCADE,
  report_type            TEXT NOT NULL DEFAULT 'client_final',
  version                INT  NOT NULL,
  model_version          INT  NOT NULL,   -- CHECKIN_REPORT_MODEL_VERSION at write time
  model_json             JSONB NOT NULL,  -- the complete canonical model
  finalized_at           TIMESTAMPTZ NOT NULL,
  finalized_by           UUID REFERENCES users(id),
  supersedes_snapshot_id UUID REFERENCES checkin_report_snapshots(id),
  superseded_at          TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_report_snapshots_event_version
  ON checkin_report_snapshots(event_id, report_type, version);

-- At most one live snapshot per event and type.
CREATE UNIQUE INDEX IF NOT EXISTS idx_report_snapshots_current
  ON checkin_report_snapshots(event_id, report_type)
  WHERE superseded_at IS NULL;
```

RLS on. Snapshots are **append-only**: no UPDATE except setting `superseded_at`,
and no DELETE. `model_version` exists so a newer codebase can still render an
older snapshot rather than crashing on a shape it no longer produces.

### 7.4 Route security (urgent, independent of this redesign)

`apps/opus_pass/src/app/api/checkin-report/route.ts` is **unauthenticated** and
renders whatever body it is posted; `isValidPayload` only type-checks shape. Any
caller can render a PDF containing arbitrary guest names, and the couple's own
figures are supplied by their browser.

This is a live defect regardless of whether the premium redesign ships, so it is
**implementation step 1**, not part of the report work. The endpoint must:

- take an `eventId`, not a payload;
- derive every figure server-side;
- authenticate and authorize by audience (couple owns the event / staff permission
  for Audit);
- keep the existing rate limit.

---

## 8. Implementation sequence

| # | Step | Files |
| --- | --- | --- |
| 1 | **Secure the existing report endpoint** (§7.4) | `api/checkin-report/route.ts` |
| 2 | Structured admission fields (§7.1) | `supabase/migrations/` + `api/checkin/scan/route.ts` |
| 3 | Lifecycle + snapshot schema (§7.2, §7.3) | `supabase/migrations/` |
| 4 | `buildCheckinReportModel()` + metric definitions + unit tests | `apps/opus_pass/src/lib/checkin/report-model.ts` (new) |
| 5 | `PdfDocumentHead` + PDF icon set + SVG chart primitives + translation dictionary | `pdf-letterhead.tsx`, `apps/opus_pass/src/lib/pdf/` (new). **`invoice-pdf.tsx` untouched.** |
| 6 | Client Event Report + finalization flow | `checkin-report-pdf.tsx` (rewrite), new close/finalize actions |
| 7 | Couple-facing Operations view | `opus_pass` dashboard; port from `CheckinReportClient.tsx` |
| 8 | Internal Audit report | `opus_admin` operations |

Step 1 ships on its own and does not wait for the redesign. Client (6) precedes
Operations (7) because Operations largely exists already and Client does not exist
in any form.

**Known follow-ups, deliberately out of scope:** guest categories (Family, VIP —
no such column), couple photo on the cover, PDF bookmarks, QR to an online report,
Excel export, device identity.

---

## 9. Metric provenance contract

One authoritative definition per derived metric, colocated with the model. This
exists so the PDF, the web dashboard, and the CSV cannot drift into three
different meanings of "attendance". Unit tests assert the model matches these
sources.

```ts
export const metricDefinitions = {
  confirmedInvitations: {
    source: "guest_invitations WHERE rsvp_status = 'attending'",
    unit: 'invitation',
  },
  confirmedSeats: {
    source: "SUM(guest_invitations.entry_allowance) WHERE rsvp_status = 'attending'",
    unit: 'seat',
  },
  admittedSeats: {
    source: 'SUM(guest_invitations.checked_in_count)',
    unit: 'seat',
  },
  admittedInvitations: {
    source: 'COUNT(guest_invitations) WHERE checked_in_count > 0',
    unit: 'invitation',
  },
  seatAttendance: {
    source: 'admittedSeats / confirmedSeats',
    unit: 'ratio',
    note: 'Seats, not invitations. A Double card is two admissions.',
  },
  exhaustedAttempts: {
    source: "checkin_scan_events WHERE result = 'exhausted'",
    unit: 'attempt',
    note: 'Covers re-scans AND over-allowance requests. Cannot distinguish them.',
  },
  manualAdmissions: {
    source: "checkin_scan_events WHERE admission_mode = 'manual'",
    unit: 'admission',
    note: 'null until migration 7.1 is applied.',
  },
  confirmedDelivery: {
    source: "whatsapp_messages WHERE status IN ('delivered','read')",
    unit: 'invitation',
    note: 'Excludes no-receipt rows. Never counts unknowns as delivered.',
  },
} as const
```

---

## 10. Resolved decisions

| Question | Decision |
| --- | --- |
| Who may finalize? | Authorized event owner/coordinator **or** OpusFesta staff. Deliberate confirmation flow (§3.4), fully audited. Not staff-only — that creates a support dependency per wedding. |
| Attendance rate on the cover? | No. Page 2. The cover identifies the event, it does not grade it. |
| Appendix opt-in or opt-out? | Included by default, suppressible before download. Framed as a content choice, not a privacy warning (§5). |
| Swahili? | Bilingual-*capable* from day one via a translation dictionary; ships one language per document, defaulting to the event/account language. Never side-by-side (§6.7). |
