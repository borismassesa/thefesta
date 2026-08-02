# Vendor Availability Reconciliation Runbook

This runbook applies only to the approved forward Vendor Availability migration.
It does not edit migration `007` history and must not be combined with Growth
Phase 0 or Phase 1A deployment.

## Pre-Deployment

1. Confirm the target project reference and require a second operator to verify
   that it is OpusFesta production.
2. Run the approved read-only catalog audit again. Confirm that
   `public.vendor_availability` is still absent and capture definitions and ACLs
   for `get_vendor_availability`, `check_vendor_availability`,
   `sync_inquiry_to_availability`, and `sync_all_inquiries_to_availability`.
3. Confirm deployed mobile versions still call `get_vendor_availability` and
   upsert `vendor_availability` with conflict target `vendor_id,date`.
4. Confirm `public.vendors`, `public.vendor_memberships`,
   `public.vendor_member_role`, `public.is_vendor_member(uuid,
   vendor_member_role[])`, and `public.update_updated_at_column()` exist.
5. Take a Supabase platform-supported backup or confirm the latest recoverable
   backup and point-in-time recovery boundary.
6. Review active database sessions and schedule a low-traffic window. The
   migration takes a transaction advisory lock and short catalog/table locks for
   table creation, grants, policies, functions, and triggers. It performs no
   data backfill or table scan when the table is absent.
7. Record the migration version and SHA-256 checksum. Approve only
   `20260802045655_restore_vendor_availability.sql`.

## Deployment

1. Apply the single approved forward migration through the repository-standard
   Supabase deployment workflow. Do not run `supabase migration repair`, edit
   migration history, or apply the corrected historical `007` file remotely.
2. Capture complete migration output and duration.
3. Stop immediately on a compatibility exception. Do not patch the database
   manually or weaken a failed check.
4. Confirm migration version `20260802045655` is recorded exactly once.
5. Inspect catalogs to verify the table, seven columns, PK, cascading vendor FK,
   vendor/date uniqueness, four named indexes, RLS, three policies, updated-at
   trigger, two core RPC definitions, explicit grants, and disabled inquiry-sync
   trigger.

## Post-Deployment Smoke Test

Use dedicated non-production-like test accounts with no customer data in logs.

1. As an authorized owner or manager, read a short date range through
   `get_vendor_availability`.
2. Upsert one test date, read it back, restore its prior state, and confirm the
   `updated_at` trigger changed the timestamp.
3. As vendor staff, confirm the calendar is readable and writes are denied.
4. As an unrelated authenticated user, confirm direct reads, writes, and RPC
   access to that vendor are denied.
5. Confirm anonymous table and RPC access is denied.
6. Confirm the mobile calendar has no PostgREST, hydration, or raw database error.

## Rollback And Containment

Prefer a forward containment migration. Do not drop `vendor_availability` after
deployment because vendors may already have written new availability records.

1. If a policy is too broad, revoke the affected table/function grant and replace
   the policy while preserving rows.
2. If an RPC is faulty, revoke its client `EXECUTE` grant or replace its body with
   a safe fail-closed implementation. Keep service access only when required for
   diagnosis.
3. If mobile writes fail, preserve the table and records, capture sanitized
   errors, and correct grants/RLS through a reviewed forward migration.
4. Restore from backup only for confirmed destructive corruption and only under
   the platform recovery procedure.

## Completion Evidence

Archive the approved migration checksum, migration output, catalog verification,
smoke-test results, operator names, duration, and any containment action. Do not
include tokens, connection strings, customer rows, or service-role credentials.
