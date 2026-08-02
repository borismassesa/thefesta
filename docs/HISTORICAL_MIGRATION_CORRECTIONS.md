# Historical Migration Corrections

These source corrections exist only so an empty database can reproduce the
approved operational schema. They do not authorize editing migration-history
rows or rerunning historical files in shared environments.

## 025_redesign_services_offered.sql

- **Original design:** convert `public.vendors.services_offered` from `text[]`
  to JSONB `{title, description}` objects.
- **Failure:** the proposed CHECK contained a subquery, which PostgreSQL does
  not allow in a CHECK expression.
- **Deployed state:** production records migration `025`, but the column remains
  nullable `text[] DEFAULT '{}'::text[]`; no replacement column or CHECK exists.
- **Canonical model:** active onboarding, vendor storefront, admin, OpusPass
  mobile, website, and seed paths use service-title string lists. No active workflow
  captures per-service descriptions.
- **Source correction:** migration `025` now validates the preceding `text[]`
  schema, normalizes its default, preserves nullability and existing values,
  and documents the abandoned redesign.
- **Shared environments:** production migration-history statements remain
  unchanged. No forward reconciliation migration is required because the
  deployed schema already matches the approved model.

A future richer service model must use a separately reviewed product migration
covering data conversion, all writers and readers, deployment, and rollback.
