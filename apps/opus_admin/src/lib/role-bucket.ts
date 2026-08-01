// ---------------------------------------------------------------------------
// Legacy admin role buckets — PURE, no imports, no I/O.
// ---------------------------------------------------------------------------
// Extracted from admin-auth.ts so it can be unit-tested and imported without
// dragging in `server-only` (admin-auth -> audit-log -> server-only). Same
// reason a pure helper should never live in a 'server-only' module: any client
// component that touches it breaks the Turbopack production build.
//
// IMPORTANT: a legacy bucket is NOT an authorisation decision. It exists so
// old shell and routing behaviour keeps working while call sites migrate to
// explicit permission keys. Do not gate a mutation on it. See
// lib/roles-authz.ts for why: every seeded role in use buckets to 'admin',
// which made requireAdminRole(['owner','admin']) a no-op gate on the Roles
// actions.

export type AdminAccessRole = 'owner' | 'admin' | 'editor' | 'author' | 'viewer'

export const ADMIN_ACCESS_ROLES: AdminAccessRole[] = [
  'owner',
  'admin',
  'editor',
  'author',
  'viewer',
]

// Roles allowed to load the admin dashboard (everything under `(admin)/`).
// Authors write articles via /contribute and shouldn't see the admin shell.
export const ADMIN_DASHBOARD_ROLES: readonly AdminAccessRole[] = [
  'owner',
  'admin',
  'editor',
  'viewer',
]

export function isAdminDashboardRole(role: AdminAccessRole | null): boolean {
  return role !== null && ADMIN_DASHBOARD_ROLES.includes(role)
}

// Permission keys that imply "this role can change things", used to bucket a
// custom role when its slug isn't one of the legacy five.
const WRITE_KEYS = new Set([
  'cms.write', 'cms.publish', 'cms.moderate',
  'vendor.moderate',
  'workforce.payroll',
  'workforce.roles.write', 'workforce.roles.assign',
  'platform.admin',
])

// Maps a workforce_roles row (slug + permission_keys) to a legacy role bucket,
// mirroring the SQL function workforce_role_legacy_bucket(). Legacy slugs map
// 1:1; custom roles are bucketed by their permission_keys.
export function legacyRoleBucket(
  slug: string,
  permissionKeys: string[],
): AdminAccessRole {
  switch (slug) {
    case 'owner': return 'owner'
    case 'admin': return 'admin'
    case 'editor': return 'editor'
    case 'author': return 'author'
    case 'viewer': return 'viewer'
  }
  const hasWrite = permissionKeys.some((k) => WRITE_KEYS.has(k))
  return hasWrite ? 'admin' : 'viewer'
}
