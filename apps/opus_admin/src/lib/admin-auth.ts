import { cache } from 'react'
import { auth, currentUser } from '@clerk/nextjs/server'
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/supabase'
import { auditPermissionDenied, recordAuditEvent } from '@/lib/audit-log'

export type AdminAccessRole = 'owner' | 'admin' | 'editor' | 'author' | 'viewer'

const ADMIN_ACCESS_ROLES: AdminAccessRole[] = [
  'owner',
  'admin',
  'editor',
  'author',
  'viewer',
]

// TEMPORARY: when DISABLE_ADMIN_AUTH=true every caller is treated as an
// `owner` so the dashboard is reachable without signing in. This is a
// development convenience only — the Clerk + admin_whitelist machinery below
// is left untouched. Remove the flag (or set it to anything but 'true') to
// restore real auth. Mirrored in proxy.ts, which skips route protection under
// the same flag. Hard-gated to non-production builds so a leaked env var can
// never open the admin in prod.
function isAdminAuthDisabled(): boolean {
  return (
    process.env.DISABLE_ADMIN_AUTH === 'true' &&
    process.env.NODE_ENV !== 'production'
  )
}

// Roles that are allowed to load the admin dashboard (everything under
// `(admin)/`). Authors write articles via /contribute and shouldn't see the
// admin shell — see comment in operations/articles/actions.ts.
const ADMIN_DASHBOARD_ROLES: readonly AdminAccessRole[] = [
  'owner',
  'admin',
  'editor',
  'viewer',
]

export function isAdminDashboardRole(role: AdminAccessRole | null): boolean {
  return role !== null && ADMIN_DASHBOARD_ROLES.includes(role)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeRole(value: unknown): AdminAccessRole | null {
  if (typeof value !== 'string') return null
  const role = value.trim().toLowerCase()
  return ADMIN_ACCESS_ROLES.includes(role as AdminAccessRole)
    ? (role as AdminAccessRole)
    : null
}

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
  const WRITE_KEYS = new Set([
    'cms.write', 'cms.publish', 'cms.moderate',
    'vendor.moderate',
    'workforce.payroll',
    'platform.admin',
  ])
  const hasWrite = permissionKeys.some((k) => WRITE_KEYS.has(k))
  return hasWrite ? 'admin' : 'viewer'
}

function readMetadataRole(value: unknown): AdminAccessRole | null {
  if (!isRecord(value)) return null
  return normalizeRole(value.role)
}

function readClaimRole(claims: unknown): AdminAccessRole | null {
  if (!isRecord(claims)) return null
  return (
    readMetadataRole(claims.metadata) ||
    readMetadataRole(claims.publicMetadata) ||
    readMetadataRole(claims.public_metadata) ||
    readMetadataRole(claims.app_metadata) ||
    normalizeRole(claims.role)
  )
}

function readClaimEmail(claims: unknown): string | null {
  if (!isRecord(claims)) return null
  const value = claims.email || claims.email_address
  return typeof value === 'string' && value.includes('@') ? value : null
}

type EmployeeLookup =
  | { kind: 'found'; id: string; role: AdminAccessRole }
  | { kind: 'absent' }

// Shared per-request cache for the workforce_employees row. Called by both
// getAdminAccessRole and getCallerPermissions so the two Supabase round-trips
// collapse into one.
const getCallerEmployee = cache(async (userId: string): Promise<EmployeeLookup> => {
  if (!hasSupabaseAdminConfig()) return { kind: 'absent' }
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_employees')
    .select('id, workforce_roles!dashboard_role_id(slug, permission_keys)')
    .eq('clerk_user_id', userId)
    .eq('dashboard_access', true)
    .maybeSingle<{
      id: string
      workforce_roles: { slug: string; permission_keys: string[] } | null
    }>()
  if (error) {
    const e = error as { message?: string; code?: string }
    console.error('[admin-auth] workforce_employees lookup error', {
      message: e?.message, code: e?.code,
    })
    return { kind: 'absent' }
  }
  if (!data) return { kind: 'absent' }
  const slug = data.workforce_roles?.slug ?? ''
  const permKeys = data.workforce_roles?.permission_keys ?? []
  const role = slug ? legacyRoleBucket(slug, permKeys) : null
  if (!role) return { kind: 'absent' }
  return { kind: 'found', id: data.id, role }
})

// Both wrapped in React.cache so a single request resolves Clerk +
// workforce_employees exactly once even when invoked from layout, page,
// and downstream server actions.
export const getAdminAccessRole = cache(
  async (): Promise<AdminAccessRole | null> => {
    if (isAdminAuthDisabled()) return 'owner'
    const { userId, sessionClaims } = await auth()
    if (!userId) return null

    // workforce_employees is the source of truth for dashboard access.
    const lookup = await getCallerEmployee(userId)
    if (lookup.kind === 'found') return lookup.role

    // Fallback: Clerk session claims / publicMetadata. Used only for
    // /contribute authors who have no employee record. Dashboard roles
    // (owner/admin/editor/viewer) must come from workforce_employees — a
    // user without a row gets no dashboard access even if their Clerk
    // metadata says otherwise.
    const claimRole = readClaimRole(sessionClaims)
    if (claimRole === 'author') return claimRole

    const user = await currentUser()
    const metadataRole =
      readMetadataRole(user?.publicMetadata) ||
      readMetadataRole(user?.privateMetadata) ||
      readMetadataRole(user?.unsafeMetadata)
    if (metadataRole === 'author') return metadataRole

    return null
  },
)

// Escape Postgres LIKE/ILIKE metacharacters so a value used as an equality
// match can't be interpreted as a pattern. Without this, an email such as
// `john_doe@x.com` would match any single character at the `_`, silently
// resolving to a different employee row.
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

// Resolve the best email from a Clerk user + session claims (primary → first →
// claim), normalised to lowercase, or null. No dev-bypass handling — callers
// layer that on. Shared by getCallerEmail and getCallerProfile so the
// resolution order stays in one place.
function resolveUserEmail(
  user: Awaited<ReturnType<typeof currentUser>>,
  sessionClaims: unknown,
): string | null {
  const email =
    user?.primaryEmailAddress?.emailAddress ||
    user?.emailAddresses?.[0]?.emailAddress ||
    readClaimEmail(sessionClaims)
  return email ? email.trim().toLowerCase() : null
}

export const getCallerEmail = cache(async (): Promise<string | null> => {
  // A real Clerk session always wins, even under the dev bypass — someone
  // actually signed in (e.g. locally against the Clerk dev instance) should
  // resolve to their own workforce_employees row, not a placeholder that no
  // row will ever match. Only fall back to the placeholder when there's no
  // session at all, matching getCallerProfile's resolution order.
  const { userId, sessionClaims } = await auth()
  if (userId) {
    const user = await currentUser()
    const email = resolveUserEmail(user, sessionClaims)
    if (email) return email
  }
  return isAdminAuthDisabled() ? 'dev@opusfesta.com' : null
})

export async function requireAdminRole(
  roles: readonly AdminAccessRole[]
): Promise<AdminAccessRole> {
  const role = await getAdminAccessRole()
  if (!role || !roles.includes(role)) {
    const { userId } = await auth()
    const user = userId ? await currentUser() : null
    const email =
      user?.primaryEmailAddress?.emailAddress ||
      user?.emailAddresses?.[0]?.emailAddress ||
      null
    const detail = `userId=${userId ?? '(none)'} email=${email ?? '(none)'} resolvedRole=${role ?? '(none)'} allowedRoles=[${roles.join(',')}]`
    console.error('[admin-auth] requireAdminRole denied:', detail)
    // Fire-and-forget audit write. We don't await — denial-throwing
    // must stay synchronous for the action's error UX, and the audit
    // helper already catches its own errors.
    void recordAuditEvent({
      eventType: 'auth.role_denied',
      severity: 'critical',
      message: `Role denied for ${email ?? 'unknown caller'}`,
      actorEmail: email,
      actorClerkId: userId ?? null,
      metadata: { resolvedRole: role, allowedRoles: roles },
      resolveActor: false,
    })
    throw new Error(
      "You don't have permission for that. Ask an owner to add you to the admin team, or sign in with an admin account."
    )
  }
  return role
}

// ---------------------------------------------------------------------------
// Permission-based gating (RBAC)
// ---------------------------------------------------------------------------
// Built on top of workforce_roles.permission_keys. The caller's permission
// set is derived by:
//   1. Looking up their workforce_employees row by clerk_user_id
//   2. Unioning permission_keys from their primary dashboard_role and from
//      every role attached via workforce_role_members
//   3. Owners short-circuit to the full permission catalog — they can always
//      do everything
//
// Use `requirePermission('workforce.write')` in server actions and
// `await getCallerPermissions()` to feed the Sidebar / route layouts.

export type PermissionKey = string

// Keep this list in sync with apps/opus_admin/src/app/(admin)/workforce/_lib/types.ts
// — duplicated here so this file stays free of the workforce module
// import (which would create a cycle when workforce actions import from
// admin-auth).
const ALL_PERMISSION_KEYS: readonly PermissionKey[] = [
  'cms.read',
  'cms.write',
  'cms.publish',
  'vendor.read',
  'vendor.moderate',
  'bookings.read',
  'bookings.write',
  'finance.read',
  'finance.write',
  'workforce.read',
  'workforce.write',
  'workforce.payroll',
  'insights.read',
  'platform.admin',
  // OpusPass door-staff check-in: assigning attendants + viewing live scans.
  'opuspass.checkin',
  // OpusPass ticket generation: importing guest lists + printable entry-pass tickets.
  'opuspass.tickets',
  // Pledge Concierge: staff-run pledge campaigns for Elegant/Signature couples.
  'opuspass.pledges.read',
  'opuspass.pledges.write',
  // Couple Accounts: the cross-couple directory + per-couple event console.
  'opuspass.couples.read',
  'opuspass.couples.write',
  // MD Daily Tracker: each engine's MD can only write their own engine's rows.
  'md_tracker.opusfesta.write',
  'md_tracker.opusstudio.write',
  'md_tracker.opuspass.write',
  // MD Daily Tracker: CEO/owner review — edit ceo_comment + reviewed_by across all engines.
  'md_tracker.review',
  // Growth Tracker: log outreach contacts / campaigns / content posts / studio bookings.
  'growth.write',
  // Growth Tracker: edit KPI targets, the vendor-outreach roster, challenge definitions, content-ideas bank.
  'growth.admin',
  // Opus customer-support console: view conversations / reply as an agent.
  'support.read',
  'support.write',
] as const

// Wrapped in React.cache so that the layout's permission lookup and
// page.tsx's permission lookup on the same request resolve via one
// chain of Clerk + Supabase calls. Without this, the dashboard fires
// 4–6 sequential round-trips twice per render.
export const getCallerPermissions = cache(
  async (): Promise<Set<PermissionKey>> => {
    const role = await getAdminAccessRole()
    // Owners always have everything — keeps founders unblocked even before
    // they're attached to a workforce role.
    if (role === 'owner') return new Set(ALL_PERMISSION_KEYS)
    // No dashboard access at all → empty set.
    if (!role) return new Set()

    const { userId } = await auth()
    if (!userId) return new Set()

    const employee = await getCallerEmployee(userId)
    if (employee.kind === 'absent') return fallbackRolePermissions(role)

    if (!hasSupabaseAdminConfig()) {
      console.warn('[admin-auth] permission lookup unavailable: Supabase admin env is missing')
      return new Set()
    }
    const supabase = createSupabaseAdminClient()
    // Single SQL trip via the permission helper added in
    // 20260514213347_workforce_dashboard_access.sql.
    const { data, error } = await supabase
      .rpc('workforce_permissions_for_employee', { p_employee_id: employee.id })
      .returns<string[]>()
    if (error) {
      console.error('[admin-auth] workforce_permissions_for_employee error', error)
      return fallbackRolePermissions(role)
    }
    return new Set(Array.isArray(data) ? data : [])
  },
)

// Best-effort fallback for the legacy admin_whitelist roles when there's
// no matching workforce employee record yet. Mirrors what the system
// roles in workforce_roles seed would grant — used so existing admins
// keep working during the rollout.
function fallbackRolePermissions(role: AdminAccessRole): Set<PermissionKey> {
  switch (role) {
    case 'owner':
    case 'admin':
      // Same keys as the seeded 'admin' workforce role (everything except
      // platform.admin, which only owners get).
      return new Set([
        'cms.read', 'cms.write', 'cms.publish',
        'vendor.read', 'vendor.moderate',
        'bookings.read', 'bookings.write',
        'finance.read', 'finance.write',
        'workforce.read', 'workforce.write', 'workforce.payroll',
        'insights.read',
        'opuspass.checkin',
        'opuspass.tickets',
        'opuspass.pledges.read',
        'opuspass.pledges.write',
        'opuspass.couples.read',
        'opuspass.couples.write',
        'md_tracker.opusfesta.write',
        'md_tracker.opusstudio.write',
        'md_tracker.opuspass.write',
        'md_tracker.review',
        'growth.write',
        'growth.admin',
        'support.read',
        'support.write',
      ])
    case 'editor':
      return new Set(['cms.read', 'cms.write', 'cms.publish', 'vendor.read'])
    case 'viewer':
      return new Set([
        'cms.read', 'vendor.read', 'bookings.read', 'finance.read',
        'workforce.read', 'insights.read',
      ])
    case 'author':
      // Authors don't access the dashboard — they live under /contribute.
      return new Set()
    default:
      return new Set()
  }
}

export async function hasPermission(key: PermissionKey): Promise<boolean> {
  const perms = await getCallerPermissions()
  return perms.has(key)
}

export async function requirePermission(key: PermissionKey): Promise<void> {
  const perms = await getCallerPermissions()
  if (perms.has(key)) return
  const role = await getAdminAccessRole()
  const email = await getCallerEmail()
  console.error('[admin-auth] requirePermission denied:', {
    permission: key, email, resolvedRole: role,
    grantedPermissions: Array.from(perms),
  })
  void auditPermissionDenied(
    key,
    email,
    `resolvedRole=${role ?? '(none)'} grantedCount=${perms.size}`,
  )
  throw new Error(
    `You don't have permission to ${key}. Ask an owner to update your role.`
  )
}

// Useful when the gate is "any of these" (e.g. a section visible to
// readers OR writers). Returns true if the caller has at least one.
export async function hasAnyPermission(keys: readonly PermissionKey[]): Promise<boolean> {
  const perms = await getCallerPermissions()
  return keys.some((k) => perms.has(k))
}

export type CallerProfile = {
  name: string
  email: string | null
  imageUrl: string | null
}

/**
 * Display identity for the signed-in admin — name, email, and avatar — for the
 * sidebar profile row. A real Clerk session resolves the full name / image; the
 * DISABLE_ADMIN_AUTH dev bypass (no Clerk user) gets a placeholder.
 */
export const getCallerProfile = cache(async (): Promise<CallerProfile> => {
  // Prefer the REAL signed-in identity whenever there's a Clerk session — even
  // when access was actually granted by the DISABLE_ADMIN_AUTH dev flag. The
  // sidebar should show who you logged in as, not a bypass placeholder.
  const { userId, sessionClaims } = await auth()
  if (userId) {
    const user = await currentUser()
    const email = resolveUserEmail(user, sessionClaims)
    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim()
    const name = fullName || user?.username || email?.split('@')[0] || 'Admin'
    return {
      name,
      email,
      imageUrl: user?.imageUrl || null,
    }
  }
  // No Clerk session — only the dev bypass can reach here.
  if (isAdminAuthDisabled()) {
    return { name: 'Dev admin', email: 'dev@opusfesta.com', imageUrl: null }
  }
  return { name: 'Admin', email: null, imageUrl: null }
})

// How fresh a stored last_dashboard_login has to be before we skip the
// write. Keeps an active browsing session to ~one stamp per window instead
// of one per navigation (the admin layout is force-dynamic, so it renders
// on every page load).
const LOGIN_STAMP_THROTTLE_MS = 15 * 60 * 1000

// Stamp the signed-in admin's last dashboard sign-in onto their
// workforce_employees row. Previously last_dashboard_login was only written
// once — at invite-acceptance — so directly-seeded accounts (and everyone
// after their first visit) showed "never" on the Roles page. The admin layout
// schedules this via `after()` so it runs off the render critical path (the
// write is also throttled in SQL — only when the stored value is null or older
// than the window). The ENTIRE body is wrapped in try/catch so a failed stamp
// — including a Clerk auth() hiccup — can never take down the dashboard.
// Cached so it fires at most once per request.
export const recordDashboardLogin = cache(async (): Promise<void> => {
  try {
    if (isAdminAuthDisabled()) return
    const { userId } = await auth()
    if (!userId) return
    if (!hasSupabaseAdminConfig()) return
    const email = await getCallerEmail()
    if (!email) return

    const supabase = createSupabaseAdminClient()
    const now = new Date()
    const cutoff = new Date(now.getTime() - LOGIN_STAMP_THROTTLE_MS).toISOString()
    await supabase
      .from('workforce_employees')
      .update({ last_dashboard_login: now.toISOString() })
      .ilike('email', escapeLike(email))
      // Only write when stale/unset — avoids a row write on every navigation.
      .or(`last_dashboard_login.is.null,last_dashboard_login.lt.${cutoff}`)
  } catch (err) {
    console.warn('[admin-auth] could not stamp last_dashboard_login', err)
  }
})
