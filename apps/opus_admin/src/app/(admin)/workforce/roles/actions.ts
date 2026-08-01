'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  escapeLike,
  getAdminAccessRole,
  getCallerEmail,
  getCallerPermissions,
  requirePermission,
} from '@/lib/admin-auth'
import { recordAuditEvent } from '@/lib/audit-log'
import {
  canAssignRole,
  canDeleteRole,
  canGrantPermissionKeys,
  canWriteRoleDefinition,
  type AuthzCaller,
  type Decision,
  type RoleSummary,
} from '@/lib/roles-authz'
import { revokeInvitation as revokeWorkforceInvitation } from '@/lib/workforce-invitations'
import {
  grantDashboardAccess as grantDashboardAccessAction,
} from '../employees/actions'
import { PERMISSIONS } from '../_lib/types'

const PERMISSION_KEYS = new Set(PERMISSIONS.map((p) => p.key))

// ---------------------------------------------------------------------------
// Authorisation plumbing
// ---------------------------------------------------------------------------
// Every gate below resolves the caller ONCE and then defers to the pure policy
// in lib/roles-authz.ts. Nothing here authorises off legacyRoleBucket /
// requireAdminRole any more: that bucket promotes every seeded role to 'admin'
// (content-editor via cms.write, finance and people-ops via workforce.payroll,
// vendor-success via vendor.moderate), so it authorised nothing useful while
// appearing to. Server actions are POST endpoints, so the /workforce layout's
// workforce.read redirect never protected them.

async function resolveCaller(): Promise<AuthzCaller> {
  const [role, permissions, email] = await Promise.all([
    getAdminAccessRole(),
    getCallerPermissions(),
    getCallerEmail(),
  ])
  let employeeId: string | null = null
  if (email) {
    const supabase = createSupabaseAdminClient()
    const { data } = await supabase
      .from('workforce_employees')
      .select('id')
      .ilike('email', escapeLike(email))
      .maybeSingle<{ id: string }>()
    employeeId = data?.id ?? null
  }
  return { isOwner: role === 'owner', permissions, employeeId }
}

/**
 * Enforce a policy decision. On denial: audit it, then throw a message that
 * says what is missing without leaking role internals or the caller's own
 * permission set.
 */
async function enforce(
  decision: Decision,
  context: { action: string; roleId?: string; roleSlug?: string },
): Promise<void> {
  if (decision.allowed) return
  void recordAuditEvent({
    eventType: 'workforce.role_authorization_rejected',
    severity: 'critical',
    message: `Denied ${context.action}: ${decision.reason}`,
    targetResource: context.roleId ? `workforce_roles:${context.roleId}` : undefined,
    metadata: { action: context.action, roleSlug: context.roleSlug ?? null },
  })
  throw new Error(decision.reason)
}

async function loadRole(id: string): Promise<RoleSummary> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_roles')
    .select('id, slug, is_system, permission_keys')
    .eq('id', id)
    .single<{ id: string; slug: string; is_system: boolean; permission_keys: string[] }>()
  if (error) throw new Error(error.message || 'Could not load this role.')
  return {
    id: data.id,
    slug: data.slug,
    isSystem: data.is_system,
    permissionKeys: data.permission_keys ?? [],
  }
}

async function auditRole(
  eventType: string,
  message: string,
  role: { id: string; slug: string },
  metadata: Record<string, unknown> = {},
  severity: 'info' | 'warn' | 'critical' = 'warn',
): Promise<void> {
  const { userId } = await auth()
  void recordAuditEvent({
    eventType,
    severity,
    message,
    actorClerkId: userId ?? null,
    targetResource: `workforce_roles:${role.id}`,
    metadata: { roleSlug: role.slug, ...metadata },
  })
}

// ---------------------------------------------------------------------------
// Workforce roles — custom RBAC catalog over workforce_roles + role_members
// ---------------------------------------------------------------------------

function sanitizeSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
    .slice(0, 64)
}

function validatePermissionKeys(keys: string[]): string[] {
  const unique = Array.from(new Set(keys))
  for (const k of unique) {
    if (!PERMISSION_KEYS.has(k)) throw new Error(`Unknown permission key: ${k}`)
  }
  return unique
}

export async function createRole(input: {
  name: string
  description?: string
  permissionKeys: string[]
}): Promise<{ id: string }> {
  const caller = await resolveCaller()
  await enforce(canWriteRoleDefinition(caller), { action: 'createRole' })

  const name = input.name.trim()
  if (name.length < 2) throw new Error('Role name is required.')
  const slug = sanitizeSlug(name)
  if (!slug) throw new Error('Role name must contain letters or digits.')
  const perms = validatePermissionKeys(input.permissionKeys)
  // Containment: a non-owner cannot mint a role granting more than they hold.
  await enforce(canGrantPermissionKeys(caller, perms), {
    action: 'createRole',
    roleSlug: slug,
  })

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_roles')
    .insert({
      slug,
      name,
      description: input.description?.trim() ?? '',
      permission_keys: perms,
      is_system: false,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new Error('A role with that name already exists.')
    }
    throw new Error(error.message || 'Could not create this role.')
  }
  await auditRole(
    'workforce.role_created',
    `Role "${name}" created`,
    { id: data.id, slug },
    { permissionsAfter: perms },
  )
  revalidatePath('/workforce/roles')
  return { id: data.id }
}

export async function updateRolePermissions(id: string, permissionKeys: string[]): Promise<void> {
  const caller = await resolveCaller()
  const perms = validatePermissionKeys(permissionKeys)
  // System roles stay locked for everyone, including owners — the pre-existing
  // "clone to customise" behaviour, now enforced through the policy module.
  const role = await loadRole(id)
  await enforce(canWriteRoleDefinition(caller, role), {
    action: 'updateRolePermissions',
    roleId: id,
    roleSlug: role.slug,
  })
  // Containment: block escalation-by-editing. Without this, roles.write alone
  // would let someone compose a role holding platform.admin.
  await enforce(canGrantPermissionKeys(caller, perms), {
    action: 'updateRolePermissions',
    roleId: id,
    roleSlug: role.slug,
  })

  const before = new Set(role.permissionKeys)
  const after = new Set(perms)
  const added = perms.filter((k) => !before.has(k))
  const removed = role.permissionKeys.filter((k) => !after.has(k))

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('workforce_roles')
    .update({ permission_keys: perms })
    .eq('id', id)
  if (error) throw new Error(error.message || 'Could not save permissions.')

  await auditRole(
    'workforce.role_updated',
    `Role "${role.slug}" permissions updated`,
    role,
    { permissionsBefore: role.permissionKeys, permissionsAfter: perms },
  )
  if (added.length > 0) {
    await auditRole(
      'workforce.role_permission_added',
      `Added ${added.length} permission(s) to "${role.slug}"`,
      role,
      { added },
    )
  }
  if (removed.length > 0) {
    await auditRole(
      'workforce.role_permission_removed',
      `Removed ${removed.length} permission(s) from "${role.slug}"`,
      role,
      { removed },
    )
  }
  revalidatePath('/workforce/roles')
}

export async function duplicateRole(id: string): Promise<{ id: string }> {
  // Clone an existing role (typically a system role) into a brand-new
  // custom role. Lets admins start from a sensible baseline ("copy Admin,
  // remove Finance write") instead of building from scratch.
  const caller = await resolveCaller()
  // No `role` argument: duplicating a system role is allowed (that is the
  // point), but the CLONE is what gets created, and it must not carry
  // permissions the caller does not hold.
  await enforce(canWriteRoleDefinition(caller), { action: 'duplicateRole', roleId: id })

  const supabase = createSupabaseAdminClient()
  const { data: source, error: fetchError } = await supabase
    .from('workforce_roles')
    .select('name, description, permission_keys')
    .eq('id', id)
    .single<{ name: string; description: string; permission_keys: string[] }>()
  if (fetchError) throw new Error(fetchError.message || 'Could not load the source role.')
  await enforce(canGrantPermissionKeys(caller, source.permission_keys ?? []), {
    action: 'duplicateRole',
    roleId: id,
  })

  // Append " (copy)" — bump to "(copy 2)" / "(copy 3)" if there's a name
  // collision so duplicating twice doesn't fail.
  const baseName = `${source.name} (copy)`
  let name = baseName
  let attempt = 2
  while (attempt < 20) {
    const slug = sanitizeSlug(name)
    const { count } = await supabase
      .from('workforce_roles')
      .select('id', { count: 'exact', head: true })
      .eq('slug', slug)
    if (!count) break
    name = `${source.name} (copy ${attempt++})`
  }

  const slug = sanitizeSlug(name)
  const { data, error } = await supabase
    .from('workforce_roles')
    .insert({
      slug,
      name,
      description: source.description,
      permission_keys: source.permission_keys,
      is_system: false,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(error.message || 'Could not duplicate this role.')

  await auditRole(
    'workforce.role_created',
    `Role "${name}" created by duplicating role ${id}`,
    { id: data.id, slug },
    { duplicatedFrom: id, permissionsAfter: source.permission_keys ?? [] },
  )
  revalidatePath('/workforce/roles')
  return { id: data.id }
}

export async function deleteRole(id: string): Promise<void> {
  const caller = await resolveCaller()
  const role = await loadRole(id)
  // Destructive: needs the write permission AND owner, per the hotfix brief.
  // canDeleteRole carries the owner requirement; the write gate is layered on
  // top so the two authorities are both explicit.
  await enforce(canWriteRoleDefinition(caller), {
    action: 'deleteRole',
    roleId: id,
    roleSlug: role.slug,
  })
  await enforce(canDeleteRole(caller, role), {
    action: 'deleteRole',
    roleId: id,
    roleSlug: role.slug,
  })

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from('workforce_roles').delete().eq('id', id)
  if (error) throw new Error(error.message || 'Could not delete this role.')

  await auditRole(
    'workforce.owner_destructive_role_action',
    `Role "${role.slug}" deleted`,
    role,
    { operation: 'deleteRole', permissionsBefore: role.permissionKeys },
    'critical',
  )
  revalidatePath('/workforce/roles')
}

export async function setRoleMembers(
  roleId: string,
  employeeIds: string[],
): Promise<void> {
  const caller = await resolveCaller()
  const role = await loadRole(roleId)
  // The direct self-elevation vector: this action writes
  // workforce_employees.dashboard_role_id, so an unguarded call could put the
  // caller straight into Owner. canAssignRole blocks owner/admin targets,
  // critical-permission roles, and any set containing the caller themselves.
  await enforce(canAssignRole(caller, role, employeeIds), {
    action: 'setRoleMembers',
    roleId,
    roleSlug: role.slug,
  })

  const supabase = createSupabaseAdminClient()
  const desired = new Set(employeeIds)

  // "Holding a role" comes from two places — a PRIMARY assignment
  // (workforce_employees.dashboard_role_id, one per employee) or a
  // SECONDARY membership (workforce_role_members, many-to-many). The
  // "Assign members" modal now pre-checks the union of both (see
  // getAllRoleMembers in _lib/queries.ts), so saving must be able to
  // revoke access via whichever mechanism actually granted it — previously
  // this only ever touched workforce_role_members, so unchecking someone
  // whose access came from their primary role silently did nothing.
  const [{ data: current, error: fetchError }, { data: employees, error: employeesError }] = await Promise.all([
    supabase
      .from('workforce_role_members')
      .select('employee_id')
      .eq('role_id', roleId)
      .returns<Array<{ employee_id: string }>>(),
    supabase
      .from('workforce_employees')
      .select('id, full_name, dashboard_role_id')
      .returns<Array<{ id: string; full_name: string; dashboard_role_id: string | null }>>(),
  ])
  if (fetchError) throw new Error(fetchError.message || 'Could not load current members.')
  if (employeesError) throw new Error(employeesError.message || 'Could not load employees.')

  const existingSecondary = new Set((current ?? []).map((r) => r.employee_id))
  const dashboardRoleById = new Map((employees ?? []).map((e) => [e.id, e.dashboard_role_id]))
  const nameById = new Map((employees ?? []).map((e) => [e.id, e.full_name]))
  const primaryHolders = new Set((employees ?? []).filter((e) => e.dashboard_role_id === roleId).map((e) => e.id))
  const existing = new Set([...existingSecondary, ...primaryHolders])

  const toAdd = [...desired].filter((id) => !existing.has(id))
  const toRemove = [...existing].filter((id) => !desired.has(id))

  // Newly checked, no primary role yet → make this their primary role
  // (matches "should hold this role" without a redundant secondary row).
  // Newly checked, already has a DIFFERENT primary role → add as a
  // secondary membership instead; permissions union, and this never
  // demotes an existing primary assignment (e.g. an Owner staying Owner).
  const toAddAsPrimary = toAdd.filter((id) => !dashboardRoleById.get(id))
  const toAddAsSecondary = toAdd.filter((id) => dashboardRoleById.get(id))

  // Newly unchecked, only ever a secondary membership → remove that row.
  const toRemoveSecondary = toRemove.filter((id) => existingSecondary.has(id) && !primaryHolders.has(id))

  // Newly unchecked, this WAS their primary role → CANNOT be done here.
  // workforce_employees has a check constraint (dashboard_access = false OR
  // dashboard_role_id IS NOT NULL) — every account with dashboard access
  // must have exactly one primary role, so "remove the only role" isn't a
  // valid state; it has to become a *different* role, a per-person decision
  // this bulk checkbox list can't make. Apply everything else, then report
  // this back clearly instead of silently no-oping (the bug this replaced)
  // or violating the DB constraint (the bug the first fix introduced).
  const toRemovePrimary = toRemove.filter((id) => primaryHolders.has(id))

  if (toAddAsSecondary.length > 0) {
    const { error } = await supabase
      .from('workforce_role_members')
      .insert(toAddAsSecondary.map((employee_id) => ({ role_id: roleId, employee_id })))
    if (error) throw new Error(error.message || 'Could not add members.')
  }
  if (toRemoveSecondary.length > 0) {
    const { error } = await supabase
      .from('workforce_role_members')
      .delete()
      .eq('role_id', roleId)
      .in('employee_id', toRemoveSecondary)
    if (error) throw new Error(error.message || 'Could not remove members.')
  }
  if (toAddAsPrimary.length > 0) {
    const { error } = await supabase
      .from('workforce_employees')
      .update({ dashboard_role_id: roleId })
      .in('id', toAddAsPrimary)
    if (error) throw new Error(error.message || 'Could not assign this role.')
  }

  if (toAddAsPrimary.length > 0 || toAddAsSecondary.length > 0) {
    await auditRole(
      'workforce.role_member_assigned',
      `${toAddAsPrimary.length + toAddAsSecondary.length} member(s) assigned to "${role.slug}"`,
      role,
      { asPrimary: toAddAsPrimary, asSecondary: toAddAsSecondary },
    )
  }
  if (toRemoveSecondary.length > 0) {
    await auditRole(
      'workforce.role_member_removed',
      `${toRemoveSecondary.length} member(s) removed from "${role.slug}"`,
      role,
      { removed: toRemoveSecondary },
    )
  }

  if (toRemovePrimary.length > 0) {
    const names = toRemovePrimary.map((id) => nameById.get(id) ?? id).join(', ')
    revalidatePath('/workforce/roles')
    revalidatePath('/workforce/employees')
    throw new Error(
      `Saved the other changes. Couldn't remove this role from ${names} here — every account needs exactly one primary role. Change their role from the Employees page instead (that flow lets you pick the replacement).`,
    )
  }

  revalidatePath('/workforce/roles')
  revalidatePath('/workforce/employees')
}

// ---------------------------------------------------------------------------
// Workforce invitations — pending-invitations panel actions
// ---------------------------------------------------------------------------

export async function revokeWorkforceInvitationAction(invitationId: string): Promise<void> {
  await requirePermission('platform.admin')
  await revokeWorkforceInvitation(invitationId)
  revalidatePath('/workforce/roles')
  revalidatePath('/workforce/employees')
}

export async function resendWorkforceInvitationAction(
  employeeId: string,
  roleId: string,
): Promise<{ emailSent: boolean; emailReason?: string }> {
  // grantDashboardAccess already gates on platform.admin and revokes any
  // existing pending invitation before creating a fresh one — so calling
  // it again is a "resend" semantically.
  const result = await grantDashboardAccessAction(employeeId, roleId)
  return { emailSent: result.emailSent, emailReason: result.emailReason }
}

