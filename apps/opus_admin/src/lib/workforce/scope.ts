// ---------------------------------------------------------------------------
// Self identity, Workspace access, and composite caller scope — PURE.
// ---------------------------------------------------------------------------
// Implements sections 1.1, 2.2, 2.4 and 2.5 of
// docs/WORKSPACE_WORKFORCE_ARCHITECTURE.md.
//
// No imports, no I/O. The Supabase adapters that fetch rows live elsewhere and
// call into these functions; all policy is here so it can be unit-tested
// without a database.

import type { PermissionKey } from './permissions'

// ---------------------------------------------------------------------------
// Employee status allow-lists (spec 1.1, 2.4)
// ---------------------------------------------------------------------------
// POSITIVE lists, never a `!== 'Resigned'` exclusion. A future status such as
// Suspended or Terminated must not silently join the team or become
// auto-linkable just because nobody remembered to add it to a deny-list.
//
// Mirrors the CHECK constraint on workforce_employees.status
// (20260512000004_workforce_module.sql:95), which today allows exactly:
//   'Active' | 'On Leave' | 'Onboarding' | 'Resigned'

export type EmployeeStatus = 'Active' | 'On Leave' | 'Onboarding' | 'Resigned'

/** Direct reports in these statuses count towards a manager's Team scope. */
export const TEAM_MEMBER_STATUSES: readonly EmployeeStatus[] = [
  'Active',
  'On Leave',
  'Onboarding',
] as const

/** Only these statuses may have a Clerk id auto-linked by identity repair. */
export const LINKABLE_STATUSES: readonly EmployeeStatus[] = [
  'Active',
  'On Leave',
  'Onboarding',
] as const

export function isTeamMemberStatus(status: string): boolean {
  return (TEAM_MEMBER_STATUSES as readonly string[]).includes(status)
}

export function isLinkableStatus(status: string): boolean {
  return (LINKABLE_STATUSES as readonly string[]).includes(status)
}

// ---------------------------------------------------------------------------
// Workspace access (spec 2.5)
// ---------------------------------------------------------------------------
// "A row exists" is too blunt a gate. The resolver returns an access level so
// the policy can evolve without rewriting every page.

export type WorkspaceAccess = 'full' | 'read_only' | 'documents_only' | 'denied'

/**
 * Map an employment status onto a Workspace experience.
 *
 * `read_only` and `denied` have no status mapping today. They exist so that
 * suspension and termination, when People Ops needs them, are a new status
 * value plus one line here rather than a redesign. Callers are written against
 * WorkspaceAccess, never against status.
 *
 * Unknown statuses fail CLOSED.
 */
export function resolveWorkspaceAccess(status: string): WorkspaceAccess {
  switch (status) {
    case 'Active':
    case 'On Leave':
    case 'Onboarding':
      return 'full'
    // Payslips and letters stay reachable after leaving; no clock-in, no new
    // requests.
    case 'Resigned':
      return 'documents_only'
    default:
      return 'denied'
  }
}

// Which Workspace nav items each access level may see (spec 2.6). Navigation
// is a convenience; the server enforces the same policy independently.
export type WorkspaceNavItem =
  | 'home'
  | 'time-clock'
  | 'leave'
  | 'tasks'
  | 'reports'
  | 'tracker'
  | 'calendar'
  | 'documents'

const FULL_NAV: readonly WorkspaceNavItem[] = [
  'home', 'time-clock', 'leave', 'tasks', 'reports', 'tracker', 'calendar', 'documents',
]

export function workspaceNavFor(
  access: WorkspaceAccess,
): readonly WorkspaceNavItem[] {
  switch (access) {
    case 'full':
      return FULL_NAV
    case 'read_only':
      return ['home', 'reports', 'calendar', 'documents']
    case 'documents_only':
      return ['home', 'documents']
    case 'denied':
      return []
  }
}

// ---------------------------------------------------------------------------
// Self identity (spec 2.2)
// ---------------------------------------------------------------------------
// Identity resolution success is SEPARATE from access policy. Finding a
// resigned employee is a successful resolution: the person is identified,
// their available actions are restricted. Conflating the two makes the
// resolver harder to reason about.
//
// Two questions, two answers:
//   Identity — who is this?
//   Access   — what Workspace experience do they get?

export type SelfIdentityError =
  | 'UNAUTHENTICATED'
  | 'EMPLOYEE_NOT_LINKED'
  | 'AMBIGUOUS_IDENTITY'

export type SelfEmployee = {
  id: string
  fullName: string
  email: string
  status: EmployeeStatus
  department: string
  managerId: string | null
  clerkUserId: string | null
}

export type SelfIdentityResult =
  | { ok: true; employee: SelfEmployee; access: WorkspaceAccess }
  | { ok: false; error: SelfIdentityError }

/**
 * Decide the identity outcome from candidate rows matched for a caller.
 *
 * Pure: the adapter does the lookup and hands the rows here.
 *   0 rows  -> EMPLOYEE_NOT_LINKED
 *   1 row   -> ok, with the access level derived from status
 *   2+ rows -> AMBIGUOUS_IDENTITY, fails closed and audits
 */
export function resolveSelfIdentity(
  isAuthenticated: boolean,
  candidates: readonly SelfEmployee[],
): SelfIdentityResult {
  if (!isAuthenticated) return { ok: false, error: 'UNAUTHENTICATED' }
  if (candidates.length === 0) return { ok: false, error: 'EMPLOYEE_NOT_LINKED' }
  if (candidates.length > 1) return { ok: false, error: 'AMBIGUOUS_IDENTITY' }
  const employee = candidates[0]
  return { ok: true, employee, access: resolveWorkspaceAccess(employee.status) }
}

/**
 * May the adapter persist clerk_user_id onto this row as identity repair?
 *
 * Turns the email fallback into a one-time repair rather than a permanent
 * authentication mechanism. Requires exactly one candidate, a linkable status,
 * a verified Clerk email, and a row not already claimed by someone else.
 */
export function canAutoLinkIdentity(
  candidates: readonly SelfEmployee[],
  emailVerified: boolean,
): boolean {
  if (!emailVerified) return false
  if (candidates.length !== 1) return false
  const employee = candidates[0]
  if (employee.clerkUserId !== null) return false
  return isLinkableStatus(employee.status)
}

// User-facing copy per failure. Never a stack trace, never a bare 403. The
// admin variant exists because an Org-only administrator with no employee row
// is a legitimate state, not a misconfiguration on their part.
export function selfIdentityMessage(
  error: SelfIdentityError,
  callerHasOrgPermissions: boolean,
): string {
  switch (error) {
    case 'UNAUTHENTICATED':
      return 'Please sign in to continue.'
    case 'EMPLOYEE_NOT_LINKED':
      return callerHasOrgPermissions
        ? 'Your account has dashboard administration access but is not linked to an employee profile. Workspace features are unavailable.'
        : 'Your employee profile has not been activated. Contact your administrator.'
    case 'AMBIGUOUS_IDENTITY':
      return 'We found more than one employee profile for your account. Contact People Ops.'
  }
}

// ---------------------------------------------------------------------------
// Composite caller scope (spec 1.1)
// ---------------------------------------------------------------------------
// A caller is frequently in several tiers at once. A People Ops lead is Self,
// Team and Org simultaneously. Modelling this as one exclusive value would
// lose the fact that they are also an employee with their own leave balance.
//
// `employee` is NULLABLE: an Org-only administrator may legitimately have no
// workforce_employees row. Owners short-circuit to the full permission set in
// getCallerPermissions before any employee lookup happens, so requiring an
// employee would lock a real administrator out of their own scope object.

export type ScopeTier = 'self' | 'team' | 'org'

export type TeamScope = {
  directReportIds: string[]
  // Reserved for delegation, matrix management and acting cover. Phase 0
  // ALWAYS returns these empty. Do not treat them as authoritative until the
  // phase that populates them ships.
  descendantReportIds: string[] // reserved, always [] in Phase 0
  delegatedEmployeeIds: string[] // reserved, always [] in Phase 0
  actingForManagerIds: string[] // reserved, always [] in Phase 0
}

export type CallerScope = {
  employee: SelfEmployee | null
  workspaceAccess: WorkspaceAccess | null // null when employee is null
  team: TeamScope
  permissions: Set<PermissionKey>
  tiers: Set<ScopeTier>
}

export const EMPTY_TEAM_SCOPE: TeamScope = {
  directReportIds: [],
  descendantReportIds: [],
  delegatedEmployeeIds: [],
  actingForManagerIds: [],
}

/**
 * Build a TeamScope from candidate direct-report rows.
 *
 * Filters on the POSITIVE status allow-list, so a resigned report stops
 * conferring Team authority the moment their status changes, and a future
 * status never joins by default.
 */
export function deriveTeamScope(
  reports: readonly { id: string; status: string }[],
): TeamScope {
  return {
    ...EMPTY_TEAM_SCOPE,
    directReportIds: reports
      .filter((r) => isTeamMemberStatus(r.status))
      .map((r) => r.id),
  }
}

/** Assemble the composite scope. `'self'` appears only when an employee resolved. */
export function buildCallerScope(input: {
  employee: SelfEmployee | null
  access: WorkspaceAccess | null
  team: TeamScope
  permissions: ReadonlySet<PermissionKey>
}): CallerScope {
  const tiers = new Set<ScopeTier>()
  if (input.employee) tiers.add('self')
  if (input.employee && input.team.directReportIds.length > 0) tiers.add('team')
  if (hasAnyWorkforcePermission(input.permissions)) tiers.add('org')

  return {
    employee: input.employee,
    workspaceAccess: input.employee ? input.access : null,
    team: input.team,
    permissions: new Set(input.permissions),
    tiers,
  }
}

/** Any `workforce.*` key at all. Drives the Workforce shell gate (spec 4). */
export function hasAnyWorkforcePermission(
  permissions: ReadonlySet<PermissionKey>,
): boolean {
  for (const k of permissions) {
    if (k.startsWith('workforce.')) return true
  }
  return false
}

/**
 * The Workforce shell opens for Org permission OR Team scope.
 *
 * Revision 1 of the spec said "any workforce.* key", which contradicted the
 * plan to put approval lanes inside /workforce/*: a manager holds no Workforce
 * key. Managers enter and see only manager-relevant navigation.
 */
export function canOpenWorkforceShell(scope: CallerScope): boolean {
  return scope.tiers.has('org') || scope.tiers.has('team')
}

/** Where `/workforce` should land a caller (spec 4). */
export function workforceLanding(
  scope: CallerScope,
): '/workforce' | '/workforce/team' | null {
  if (scope.tiers.has('org')) return '/workforce'
  if (scope.tiers.has('team')) return '/workforce/team'
  return null
}
