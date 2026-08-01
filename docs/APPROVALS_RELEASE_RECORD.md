# Approvals — Release Record

**Status: Conditional Go for controlled staging. No-Go for employee pilot until three operational gates close.**

Assessment date: 1 August 2026. Module: `apps/opus_admin/src/app/(admin)/approvals`.

---

## 1. Release statement

> The Approvals feature has passed its implementation, security, automated
> regression, and accessibility gates, with 340 tests passing. It is ready for
> controlled staging. Employee pilot release remains blocked only by
> notification retry deployment, multi-role browser QA, and operational
> ownership. Mobile use is formally unsupported for this release and is
> communicated through the product.

---

## 2. Gate table

| Gate | Status |
|---|---|
| Approval authorization | Closed |
| Self-approval protection | Closed |
| Concurrent decision safety | Closed |
| Audit durability | Closed |
| Category / schema support | Closed for Approvals |
| Attachment security | Closed |
| Notification retry implementation | Closed |
| Notification retry **deployment** | **Open — pilot blocker** |
| Primary workflow accessibility | Closed |
| Shared-shell accessibility | Closed |
| Mobile support | Formally descoped |
| Automated regression suite | 340 passing |
| Multi-role browser QA | **Open — pilot blocker** |
| Monitoring and support ownership | **Open — pilot blocker** |
| Full repository clean provisioning | Open platform workstream |
| Controlled staging | Ready |
| Employee pilot | Conditional No-Go |
| Company-wide rollout | No-Go |

---

## 3. What is verified

Automated: 340 admin tests passing, type checks clean. Regression coverage was
added specifically for the defect classes found during review: audit
durability, schema assumptions, attachment authorization, notification retry
policy, and signed-URL safety.

Behavioural properties proven directly against Postgres (each probe written to
roll itself back, leaving production untouched):

- A decision and its audit row commit together. Forcing the audit insert to
  fail left the request at its prior status with no orphan row.
- Compare-and-swap rejects a second decision on an already-decided request
  (`stale`), so two approvers cannot both win.
- `approval_request_activity` is append-only, enforced by a trigger the service
  role cannot bypass. A direct `UPDATE` was refused.
- Attachments attach and detach atomically with their audit entries, and a
  repeated removal is a no-op rather than a duplicate audit row.

Exercised end to end in the browser: draft creation, attachment upload with
content sniffing, download, removal, and the matching audit entries.

---

## 4. Open pilot blockers

### 4.1 Notification retry deployment

The worker exists (`src/app/api/notifications/retry/route.ts`) and pg_cron is
scheduled (`notification-email-retry`, every 10 minutes, active). It is
**operationally inactive** until all three of these agree:

1. `NOTIFICATION_RETRY_CRON_SECRET` set on Vercel for opus_admin.
2. Database settings, which must be run once:

```sql
ALTER DATABASE postgres SET app.settings.opus_admin_base_url = 'https://admin.opusfesta.com';
ALTER DATABASE postgres SET app.settings.notification_retry_secret = '<must equal NOTIFICATION_RETRY_CRON_SECRET>';
```

3. The two secret values must match exactly. Until then the trigger no-ops with
   a notice; if only the database half is set, the cron will POST every ten
   minutes and receive 401.

**Until this passes, an approval decided during a provider outage may remain
permanently uncommunicated.** The queue records the obligation correctly;
nothing drains it.

Staging acceptance test:

1. Deliberately fail a notification (unset or break the provider key).
2. Confirm the row lands in `staff_notifications` as `pending`/`failed` with a
   `next_attempt_at`.
3. Restore the provider. Confirm the worker authenticates (not 401).
4. Confirm the retry sends.
5. Confirm the row reaches `sent`.
6. Confirm the approval decision was **not** repeated.
7. Confirm the recipient received exactly one message.

### 4.2 Multi-role browser QA

Nine staging identities, exercised in a real browser:

requesting employee · unrelated employee · assigned manager · unrelated manager
· finance approver · people-ops approver · custom role with unrelated elevated
permission · administrator · deactivated or permission-revoked employee

This must confirm the whole stack together: identity → session claims →
application authorization → server action → database/RLS → visible result.
Automated and SQL-level coverage is strong but does not substitute for this.

### 4.3 Operational ownership

Named owners required for: monitoring and alerts; approval support requests;
notification retry failures; authorization incidents; rollback execution;
database migration incidents; pilot feedback and defect triage.

The rollback procedure and support escalation route must be written and tested
at least once.

---

## 5. Mobile position

The admin dashboard is **desktop-first / desktop-only** for this release. The
shared shell (`Sidebar.tsx`) has no responsive breakpoints, so below roughly
1024px it retains full width and pushes content off-screen.

Rather than leave this implicit, `DesktopOnlyNotice` renders below the `lg`
breakpoint across every admin module, explaining the limitation and offering a
"Continue anyway" escape so nobody is locked out in an emergency.

This closes the mobile gate for this release **provided** the same limitation
appears in pilot onboarding, employee documentation, support guidance, and
release notes. Repairing the shell remains a future platform enhancement, not
an Approvals blocker.

---

## 6. Repository migration status

> The Approvals migration sequence provisions successfully in isolation. The
> complete repository migration history does **not** provision from zero,
> because of pre-existing platform-level migration defects.

Evidence:

- The authoritative run (`supabase start` against a fresh local stack) fails at
  `007_vendor_availability.sql`, migration 7 of 306.
- The failure is invalid PostgreSQL: a set-returning function cast in a `FROM`
  clause (`generate_series(...)::DATE AS d(date)`).
- The function that migration intends to create is **absent from production**,
  while its sibling `check_vendor_availability` exists. The SQL has therefore
  never run anywhere, and predates this work.
- Further legacy issues: invalid subquery in a CHECK constraint
  (`025_redesign_services_offered.sql`), and three duplicate migration-version
  prefixes (`20260716000001`, `20260724000007`, `20260724000008`) where the
  tracking table primary-keys on version.
- Replaying all 306 files individually against a bare Supabase Postgres gave 48
  failures, but that figure overstates repo breakage: most are cascades from
  earlier failures or depend on Supabase-managed objects (`auth.jwt()`, the
  modern `storage.buckets` column set) that a bare image lacks.

Every Approvals migration applied cleanly in order on an empty database. The
two that did not (`staff_notifications`, `approval_attachments`) failed solely
on those Supabase-managed dependencies and applied successfully to real
Supabase.

**This distinction must stay in the record**, so the Approvals release neither
hides the repository problem nor accepts responsibility for it.

Any future baseline must handle migration tracking records, auth- and
storage-managed schemas, extensions, functions and triggers, RLS policies,
grants, seed data, existing preview databases, developer upgrade paths, and
rollback. A naive `pg_dump` will bake in Supabase-owned objects; the replay
above shows exactly which ones.

---

## 7. Release sequence

Do not add feature work before closing the operational gates.

1. Configure the retry worker secret and database settings **together**.
2. Run the notification failure-and-recovery test (§4.1).
3. Create the nine staging identities.
4. Execute the multi-role browser matrix (§4.2).
5. Assign monitoring, rollback, and support owners (§4.3).
6. Begin a small desktop-only pilot.
7. Review pilot evidence before company-wide enablement.
