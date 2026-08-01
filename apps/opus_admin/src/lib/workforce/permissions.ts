// ---------------------------------------------------------------------------
// Workforce permission catalogue + legacy expansion — PURE, no imports, no I/O.
// ---------------------------------------------------------------------------
// Implements sections 3.2 and 3.5 of docs/WORKSPACE_WORKFORCE_ARCHITECTURE.md.
//
// This module is the single source of truth for which permission keys exist.
// It deliberately imports nothing so that:
//   * unit tests can load it under `tsx --test` (admin-auth pulls in
//     `server-only` via audit-log and cannot be imported from a test), and
//   * client components can reference keys without a server-only boundary
//     violation breaking the Turbopack production build.
//
// Before this module the key list was duplicated between
// lib/admin-auth.ts (ALL_PERMISSION_KEYS) and workforce/_lib/types.ts
// (PERMISSIONS), and the two had already drifted: `support.read` and
// `support.write` existed in the former but not the latter, which meant the
// Roles matrix could not display them AND validatePermissionKeys rejected
// them, so Support access could not be granted through the UI at all.
// permissions.sync.test.ts now fails if they diverge again.

export type PermissionKey = string

// ---------------------------------------------------------------------------
// Granular workforce keys (spec 3.2)
// ---------------------------------------------------------------------------
// Replaces the single blunt `workforce.read` / `workforce.write` pair, which
// could not express "approves leave but cannot see salaries". The legacy keys
// are retained and expand into these (see EXPANSION below), so no existing
// role breaks and no role has to be edited before this ships.

export const WORKFORCE_PEOPLE_KEYS = [
  'workforce.employees.read',
  'workforce.employees.write',
  'workforce.employee_records.read',
  'workforce.employee_records.write',
  'workforce.employee_documents.read',
  'workforce.employee_documents.write',
  'workforce.employee_documents.legal',
] as const

export const WORKFORCE_TIME_KEYS = [
  'workforce.leave.read',
  'workforce.leave.approve',
  'workforce.leave.admin',
  'workforce.attendance.read',
  'workforce.attendance.approve',
  'workforce.attendance.admin',
  'workforce.scheduling.read',
  'workforce.scheduling.write',
  'workforce.timesheets.read',
  'workforce.timesheets.approve',
] as const

export const WORKFORCE_WORK_KEYS = [
  'workforce.tasks.read',
  'workforce.tasks.assign',
  'workforce.report_templates.write',
  'workforce.reports.read',
] as const

export const WORKFORCE_TALENT_KEYS = [
  'workforce.performance.read',
  'workforce.performance.write',
  'workforce.recruitment.read',
  'workforce.recruitment.write',
] as const

// roles.* ship in PR 0 (the roles authorisation hotfix) and are listed here
// only so the expansion table below can reference them. Their gates live in
// lib/roles-authz.ts, which remains authoritative.
export const WORKFORCE_ROLES_KEYS = [
  'workforce.roles.read',
  'workforce.roles.write',
  'workforce.roles.assign',
] as const

// ---------------------------------------------------------------------------
// Legacy expansion (spec 3.5)
// ---------------------------------------------------------------------------
// A REVIEWED table, not "every key". Derived by enumerating every existing
// gate: 51 references to the legacy keys, of which 49 are live (45 on
// workforce.write, 4 on workforce.read) and 2 are comments. Compatibility must
// prevent LOSS of access without granting NEW authority.

/** `workforce.read` implies every read-level key. */
export const LEGACY_READ_EXPANSION: readonly PermissionKey[] = [
  'workforce.employees.read',
  'workforce.employee_records.read',
  'workforce.leave.read',
  'workforce.attendance.read',
  'workforce.scheduling.read',
  'workforce.timesheets.read',
  'workforce.tasks.read',
  'workforce.performance.read',
  'workforce.recruitment.read',
  'workforce.reports.read',
  'workforce.roles.read',
] as const

/**
 * `workforce.write` implies everything in LEGACY_READ_EXPANSION plus these.
 *
 * Deliberately EXCLUDED, each for a specific reason:
 *   workforce.roles.write   — the Roles actions never gated on workforce.write.
 *   workforce.roles.assign  — same. Granting it would be new authority.
 *   employee_documents.legal— new authority; never granted implicitly.
 *   workforce.payroll       — already an independent key, unchanged.
 */
export const LEGACY_WRITE_EXPANSION: readonly PermissionKey[] = [
  'workforce.employees.write',
  'workforce.employee_records.write',
  'workforce.employee_documents.read',
  'workforce.employee_documents.write',
  'workforce.leave.approve',
  'workforce.leave.admin',
  'workforce.attendance.approve',
  'workforce.attendance.admin',
  'workforce.scheduling.write',
  'workforce.timesheets.approve',
  'workforce.tasks.assign',
  'workforce.performance.write',
  'workforce.recruitment.write',
  'workforce.report_templates.write',
] as const

/** Keys that must NEVER be produced by legacy expansion. Asserted by test. */
export const NEVER_EXPANDED: readonly PermissionKey[] = [
  'workforce.roles.write',
  'workforce.roles.assign',
  'workforce.employee_documents.legal',
  'workforce.payroll',
  'platform.admin',
] as const

/**
 * Expand legacy `workforce.read` / `workforce.write` into the granular keys.
 *
 * Applied in getCallerPermissions AFTER the RPC returns, deliberately not
 * inside workforce_permissions_for_employee, so that no migration is needed
 * for compatibility and the Roles matrix keeps rendering
 * workforce_roles.permission_keys verbatim. People Ops migrates each role to
 * granular keys at their own pace.
 *
 * Pure: returns a new Set, never mutates the input.
 */
export function expandLegacyPermissions(
  permissions: ReadonlySet<PermissionKey>,
): Set<PermissionKey> {
  const next = new Set(permissions)
  if (next.has('workforce.read')) {
    for (const k of LEGACY_READ_EXPANSION) next.add(k)
  }
  if (next.has('workforce.write')) {
    for (const k of LEGACY_READ_EXPANSION) next.add(k)
    for (const k of LEGACY_WRITE_EXPANSION) next.add(k)
  }
  return next
}

// ---------------------------------------------------------------------------
// The full key catalogue
// ---------------------------------------------------------------------------
// Every key the application recognises. admin-auth's owner short-circuit
// grants exactly this set, and roles/actions.ts validates against it.

export const ALL_PERMISSION_KEYS: readonly PermissionKey[] = [
  'cms.read',
  'cms.write',
  'cms.publish',
  'vendor.read',
  'vendor.moderate',
  'bookings.read',
  'bookings.write',
  'finance.read',
  'finance.write',
  // Legacy workforce pair, retained for compatibility (see expansion above).
  'workforce.read',
  'workforce.write',
  'workforce.payroll',
  ...WORKFORCE_ROLES_KEYS,
  ...WORKFORCE_PEOPLE_KEYS,
  ...WORKFORCE_TIME_KEYS,
  ...WORKFORCE_WORK_KEYS,
  ...WORKFORCE_TALENT_KEYS,
  'insights.read',
  'platform.admin',
  'opuspass.checkin',
  'opuspass.tickets',
  'opuspass.pledges.read',
  'opuspass.pledges.write',
  'opuspass.couples.read',
  'opuspass.couples.write',
  'opuspass.couples.delete',
  'md_tracker.opusfesta.write',
  'md_tracker.opusstudio.write',
  'md_tracker.opuspass.write',
  'md_tracker.review',
  'growth.write',
  'growth.admin',
  'support.read',
  'support.write',
] as const
