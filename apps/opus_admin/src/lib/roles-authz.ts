// ---------------------------------------------------------------------------
// Roles authorisation policy — PURE functions, no I/O.
// ---------------------------------------------------------------------------
// Every decision about who may read, edit or assign a workforce role lives
// here so it can be unit-tested under `tsx --test` without a database, and so
// the rules exist in exactly one place rather than as scattered conditionals
// in the server actions.
//
// Background: before this module, the role-mutating server actions authorised
// via requireAdminRole(['owner','admin']). That check reads the LEGACY ROLE
// BUCKET produced by legacyRoleBucket(), which maps every seeded role in use
// (content-editor via cms.write, vendor-success via vendor.moderate, finance
// and people-ops via workforce.payroll) to 'admin'. Server actions are POST
// endpoints, so the workforce.read redirect in the /workforce layout does not
// protect them — it only guards the page render. The net effect was that any
// dashboard user could invoke updateRolePermissions and grant themselves
// platform.admin.
//
// The rule going forward:
//
//   Permission keys authorise operations. Legacy role buckets are for shell
//   and routing compatibility only, never for authorisation.

export type RolePermissionKey =
  | 'workforce.roles.read'
  | 'workforce.roles.write'
  | 'workforce.roles.assign'

export const ROLE_PERMISSION_KEYS: readonly RolePermissionKey[] = [
  'workforce.roles.read',
  'workforce.roles.write',
  'workforce.roles.assign',
] as const

// Permissions that confer platform-level or irreversible authority. A role
// holding any of these can never be handed out by a caller who merely holds
// roles.assign, and can never be composed by a caller who does not already
// hold the permission themselves.
//
// Kept deliberately short. Every addition widens what a non-owner cannot do,
// so it fails safe, but an over-long list makes the Roles page unusable for
// People Ops. PR A replaces this with an `assignment_tier` column on
// workforce_roles plus a database trigger; until then this list is the policy.
export const CRITICAL_PERMISSION_KEYS: ReadonlySet<string> = new Set([
  'platform.admin',
  'workforce.roles.write',
  'workforce.roles.assign',
  'workforce.payroll',
  'finance.write',
  'opuspass.couples.delete',
])

// Roles only an Owner may hand to anybody. Matched on slug because these are
// the seeded system roles whose meaning is fixed.
export const OWNER_ONLY_ASSIGNABLE_SLUGS: ReadonlySet<string> = new Set([
  'owner',
  'admin',
])

export type RoleSummary = {
  id: string
  slug: string
  isSystem: boolean
  permissionKeys: readonly string[]
}

export type AuthzCaller = {
  isOwner: boolean
  permissions: ReadonlySet<string>
  // Null when the caller has no workforce_employees row (an Org-only
  // administrator). Self-assignment checks are skipped in that case because
  // there is no "self" to elevate.
  employeeId: string | null
}

export type Decision =
  | { allowed: true }
  | { allowed: false; reason: string }

const allow = (): Decision => ({ allowed: true })
const deny = (reason: string): Decision => ({ allowed: false, reason })

/** Does this role carry any platform-level or irreversible permission? */
export function isCriticalRole(permissionKeys: readonly string[]): boolean {
  return permissionKeys.some((k) => CRITICAL_PERMISSION_KEYS.has(k))
}

/** Read the Roles page and its permission matrix. */
export function canReadRoles(caller: AuthzCaller): Decision {
  if (caller.isOwner) return allow()
  return caller.permissions.has('workforce.roles.read')
    ? allow()
    : deny('You need the Roles read permission to view this page.')
}

/**
 * Create, duplicate, rename, or change a role's permission bundle.
 *
 * `role` is undefined when creating from scratch. System roles stay locked for
 * everyone including owners, preserving the pre-existing "clone to customise"
 * behaviour.
 */
export function canWriteRoleDefinition(
  caller: AuthzCaller,
  role?: RoleSummary,
): Decision {
  if (!caller.isOwner && !caller.permissions.has('workforce.roles.write')) {
    return deny('You need the Roles write permission to change role definitions.')
  }
  if (role?.isSystem) {
    return deny('System roles cannot be edited. Clone the role to customise.')
  }
  return allow()
}

/**
 * Containment rule for composing a permission bundle.
 *
 * A non-owner may only put permissions into a role that they already hold
 * themselves. Without this, someone with roles.write could mint a role
 * containing platform.admin and hand it to a colleague, which is the same
 * escalation by a slower route.
 *
 * Owners are exempt: they already hold every permission.
 */
export function canGrantPermissionKeys(
  caller: AuthzCaller,
  requestedKeys: readonly string[],
): Decision {
  if (caller.isOwner) return allow()
  const notHeld = requestedKeys.filter((k) => !caller.permissions.has(k))
  if (notHeld.length > 0) {
    return deny(
      `You cannot grant permissions you do not hold yourself: ${notHeld.join(', ')}.`,
    )
  }
  return allow()
}

/**
 * Assign or revoke a role's members.
 *
 * Fails closed. Order matters: the owner-only and critical checks run before
 * the self-assignment check so that an Owner is never blocked by their own
 * membership edits.
 */
export function canAssignRole(
  caller: AuthzCaller,
  role: RoleSummary,
  targetEmployeeIds: readonly string[],
): Decision {
  if (caller.isOwner) return allow()

  if (!caller.permissions.has('workforce.roles.assign')) {
    return deny('You need the Roles assign permission to change role members.')
  }
  if (OWNER_ONLY_ASSIGNABLE_SLUGS.has(role.slug)) {
    return deny('Only an owner can assign the Owner or Admin role.')
  }
  if (isCriticalRole(role.permissionKeys)) {
    return deny(
      'This role grants platform-level permissions and can only be assigned by an owner.',
    )
  }
  // Self-elevation: you may not put yourself into a role. Removing yourself is
  // equally blocked, because "assign" is a set-membership operation and we
  // cannot tell the two apart from the desired-set alone without trusting the
  // client's view of current membership.
  if (caller.employeeId && targetEmployeeIds.includes(caller.employeeId)) {
    return deny('You cannot change your own role assignments.')
  }
  return allow()
}

/**
 * Permanently delete a role. Owner-only, on top of the write permission.
 * Retained as an additional restriction rather than a replacement, per the
 * hotfix brief.
 */
export function canDeleteRole(caller: AuthzCaller, role: RoleSummary): Decision {
  if (role.isSystem) return deny('System roles cannot be deleted.')
  if (!caller.isOwner) return deny('Only an owner can delete a role.')
  return allow()
}

/**
 * Legacy compatibility, deliberately narrow.
 *
 * `workforce.read` expands to `workforce.roles.read` so existing holders keep
 * the visibility they have today. `workforce.write` expands to NEITHER
 * `roles.write` NOR `roles.assign` — that is the whole point of the hotfix, and
 * is asserted by test.
 *
 * The broader expansion table lands in PR A. This function handles the three
 * roles.* keys only.
 */
export function expandRolePermissions(
  permissions: ReadonlySet<string>,
): Set<string> {
  const next = new Set(permissions)
  if (next.has('workforce.read')) next.add('workforce.roles.read')
  return next
}
