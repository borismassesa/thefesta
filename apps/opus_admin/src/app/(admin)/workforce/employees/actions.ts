'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getCallerEmail, requirePermission } from '@/lib/admin-auth'
import { getAnnualLeaveEntitlementDays, getLeavePolicies } from '../_lib/leave-policy'
import {
  inviteEmployee as inviteEmployeeViaClerk,
  revokeInvitation as revokeWorkforceInvitation,
} from '@/lib/workforce-invitations'
import type {
  Department,
  EmployeeStatus,
  EmploymentType,
  Location,
} from '../_lib/types'
import { EMPLOYEE_STATUSES } from '../_lib/types'

const DEPARTMENTS = new Set<Department>([
  'Technology',
  'Marketing & Partnership',
  'Content, Brand and Social Media',
  'Finance & Accountings',
  'UI & UX Design',
  'Operations',
  'Studio',
  'Founders',
  'HR',
])

const EMPLOYMENT_TYPES = new Set<EmploymentType>([
  'Permanent',
  'Contract',
  'Probation',
  'Intern',
])

const STATUSES = new Set<EmployeeStatus>(EMPLOYEE_STATUSES)

const LOCATIONS = new Set<Location>([
  'Dar es Salaam',
  'Arusha',
  'Zanzibar',
  'Remote',
])

const AVATAR_PALETTE = [
  '#F0DFF6',
  '#FFF3D9',
  '#E5F2FB',
  '#FCE8F0',
  '#DDF6E3',
  '#FFE3D1',
  '#E4E0FB',
  '#D6F0EE',
]

export type CreateEmployeeInput = {
  fullName: string
  email: string
  phone?: string
  jobTitle: string
  department: Department
  employmentType: EmploymentType
  status?: EmployeeStatus
  location: Location
  startDate: string
  salaryTzs: number
  leaveBalanceDays?: number
  managerId?: string | null
  notes?: string | null
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function pickAvatarColor(seed: string): string {
  const hash = [...seed].reduce((s, c) => s + c.charCodeAt(0), 0)
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
}

async function nextEmployeeCode(): Promise<string> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_employees')
    .select('employee_code')
    .like('employee_code', 'OF-%')
    .order('employee_code', { ascending: false })
    .limit(1)
    .returns<Array<{ employee_code: string }>>()
  if (error) throw new Error(error.message || 'Could not generate an employee code.')
  const last = data?.[0]?.employee_code
  const lastNum = last ? Number.parseInt(last.replace('OF-', ''), 10) : 0
  const next = Number.isFinite(lastNum) ? lastNum + 1 : 1
  return `OF-${String(next).padStart(3, '0')}`
}

// Result types let user-facing errors survive Next.js's production
// obfuscation of thrown server-action errors — a thrown Error becomes
// the generic "An error occurred in the Server Components render"
// message client-side, which hides the actual cause from the user.
export type CreateEmployeeResult =
  | { ok: true; id: string; employeeCode: string }
  | { ok: false; error: string }

export async function createEmployee(input: CreateEmployeeInput): Promise<CreateEmployeeResult> {
  await requirePermission('workforce.write')

  const fullName = input.fullName.trim()
  const email = normalizeEmail(input.email)
  const jobTitle = input.jobTitle.trim()

  if (fullName.length <= 1) return { ok: false, error: 'Full name is required.' }
  if (!email.includes('@')) return { ok: false, error: 'A valid email address is required.' }
  if (jobTitle.length <= 1) return { ok: false, error: 'Job title is required.' }
  if (!DEPARTMENTS.has(input.department)) return { ok: false, error: 'Pick a known department.' }
  if (!EMPLOYMENT_TYPES.has(input.employmentType)) return { ok: false, error: 'Pick a known employment type.' }
  if (!LOCATIONS.has(input.location)) return { ok: false, error: 'Pick a known location.' }
  if (input.salaryTzs < 0) return { ok: false, error: 'Salary must be ≥ 0.' }

  const status = input.status ?? 'Onboarding'
  if (!STATUSES.has(status)) return { ok: false, error: 'Pick a known status.' }

  const leavePolicies = await getLeavePolicies()
  const supabase = createSupabaseAdminClient()
  const employeeCode = await nextEmployeeCode()

  const { data, error } = await supabase
    .from('workforce_employees')
    .insert({
      employee_code: employeeCode,
      full_name: fullName,
      email,
      phone: input.phone?.trim() || null,
      job_title: jobTitle,
      department: input.department,
      manager_id: input.managerId ?? null,
      employment_type: input.employmentType,
      status,
      location: input.location,
      start_date: input.startDate,
      salary_tzs: Math.round(input.salaryTzs),
      leave_balance_days: input.leaveBalanceDays ?? getAnnualLeaveEntitlementDays(leavePolicies),
      avatar_color: pickAvatarColor(email),
      notes: input.notes?.trim() || null,
    })
    .select('id, employee_code')
    .single<{ id: string; employee_code: string }>()

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return { ok: false, error: `${email} is already an employee.` }
    }
    console.error('[workforce] createEmployee insert failed', error)
    return { ok: false, error: error.message || 'Could not save this employee.' }
  }

  revalidatePath('/workforce/employees')
  revalidatePath('/workforce/schedule')

  return { ok: true, id: data.id, employeeCode: data.employee_code }
}

export type UpdateEmployeeInput = Partial<{
  fullName: string
  email: string
  phone: string | null
  jobTitle: string
  department: Department
  employmentType: EmploymentType
  status: EmployeeStatus
  location: Location
  startDate: string
  salaryTzs: number
  leaveBalanceDays: number
  managerId: string | null
  notes: string | null
}>

export type UpdateEmployeeResult = { ok: true } | { ok: false; error: string }

export async function updateEmployee(id: string, input: UpdateEmployeeInput): Promise<UpdateEmployeeResult> {
  await requirePermission('workforce.write')

  const patch: Record<string, unknown> = {}
  if (input.fullName !== undefined) patch.full_name = input.fullName.trim()
  if (input.email !== undefined) patch.email = normalizeEmail(input.email)
  if (input.phone !== undefined) patch.phone = input.phone?.trim() || null
  if (input.jobTitle !== undefined) patch.job_title = input.jobTitle.trim()
  if (input.department !== undefined) {
    if (!DEPARTMENTS.has(input.department)) return { ok: false, error: 'Pick a known department.' }
    patch.department = input.department
  }
  if (input.employmentType !== undefined) {
    if (!EMPLOYMENT_TYPES.has(input.employmentType)) return { ok: false, error: 'Pick a known employment type.' }
    patch.employment_type = input.employmentType
  }
  if (input.status !== undefined) {
    if (!STATUSES.has(input.status)) return { ok: false, error: 'Pick a known status.' }
    patch.status = input.status
  }
  if (input.location !== undefined) {
    if (!LOCATIONS.has(input.location)) return { ok: false, error: 'Pick a known location.' }
    patch.location = input.location
  }
  if (input.startDate !== undefined) patch.start_date = input.startDate
  if (input.salaryTzs !== undefined) {
    if (input.salaryTzs < 0) return { ok: false, error: 'Salary must be ≥ 0.' }
    patch.salary_tzs = Math.round(input.salaryTzs)
  }
  if (input.leaveBalanceDays !== undefined) {
    if (input.leaveBalanceDays < 0) return { ok: false, error: 'Leave balance must be ≥ 0.' }
    patch.leave_balance_days = input.leaveBalanceDays
  }
  if (input.managerId !== undefined) {
    // Self-reference would create a cycle. The DB CHECK / FK would
    // catch this, but a friendlier error here saves the round-trip.
    if (input.managerId === id) {
      return { ok: false, error: 'An employee can’t be their own manager.' }
    }
    patch.manager_id = input.managerId
  }
  if (input.notes !== undefined) {
    const trimmed = input.notes?.trim() ?? null
    patch.notes = trimmed && trimmed.length > 0 ? trimmed : null
  }

  if (Object.keys(patch).length === 0) return { ok: true }

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from('workforce_employees').update(patch).eq('id', id)
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return { ok: false, error: 'That email is already used by another employee.' }
    }
    console.error('[workforce] updateEmployee failed', error)
    return { ok: false, error: error.message || 'Could not save changes.' }
  }

  revalidatePath('/workforce/employees')
  revalidatePath('/workforce/schedule')
  revalidatePath('/finance/payroll')
  return { ok: true }
}

export async function setEmployeeStatus(id: string, status: EmployeeStatus): Promise<UpdateEmployeeResult> {
  return updateEmployee(id, { status })
}

export async function deleteEmployee(id: string): Promise<void> {
  await requirePermission('workforce.write')
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from('workforce_employees').delete().eq('id', id)
  if (error) throw new Error(error.message || 'Could not delete this employee.')
  revalidatePath('/workforce/employees')
  revalidatePath('/workforce/schedule')
}

// ---------------------------------------------------------------------------
// Dashboard access (RBAC + invitations)
// ---------------------------------------------------------------------------
// Granting access sends a Clerk invitation. The actual `dashboard_access`
// flag flips to true after the invitee accepts (acceptInvitation in
// workforce-invitations.ts), at which point Clerk metadata is eagerly
// synced and the new resolver in admin-auth.ts picks them up.

async function getCallerEmployeeId(): Promise<string | null> {
  const email = await getCallerEmail()
  if (!email) return null
  const supabase = createSupabaseAdminClient()
  const { data } = await supabase
    .from('workforce_employees')
    .select('id')
    .ilike('email', email)
    .maybeSingle<{ id: string }>()
  return data?.id ?? null
}

export type GrantDashboardAccessResult = {
  invitationId: string
  emailSent: boolean
  emailReason?: string
  mode: 'invited' | 'granted_existing'
}

export async function grantDashboardAccess(
  employeeId: string,
  roleId: string,
): Promise<GrantDashboardAccessResult> {
  // Granting dashboard access is a privileged operation — it determines
  // who can sign in and what they can do. Only owners can do it.
  await requirePermission('platform.admin')

  const invitedById = await getCallerEmployeeId()
  const result = await inviteEmployeeViaClerk({ employeeId, roleId, invitedById })

  revalidatePath('/workforce/employees')
  revalidatePath('/workforce/roles')
  return {
    invitationId: result.invitationId,
    emailSent: result.emailSent,
    emailReason: result.emailReason,
    mode: result.mode,
  }
}

async function fetchEmployeeAccessSnapshot(employeeId: string): Promise<{
  id: string
  email: string
  fullName: string
  hasAccess: boolean
  currentRoleSlug: string | null
} | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_employees')
    .select(
      // workforce_employees reaches workforce_roles two ways — the direct
      // dashboard_role_id FK, and the M2M path via workforce_role_members —
      // so the embed must name the FK explicitly or PostgREST rejects the
      // query as ambiguous ("more than one relationship was found").
      'id, email, full_name, dashboard_access, dashboard_role_id, workforce_roles!workforce_employees_dashboard_role_id_fkey(slug)',
    )
    .eq('id', employeeId)
    .maybeSingle<{
      id: string
      email: string
      full_name: string
      dashboard_access: boolean
      dashboard_role_id: string | null
      workforce_roles: { slug: string } | null
    }>()
  if (error) throw new Error(error.message || 'Could not load employee access.')
  if (!data) return null
  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    hasAccess: data.dashboard_access,
    currentRoleSlug: data.workforce_roles?.slug ?? null,
  }
}

async function assertOtherActiveOwnerExists(excludeEmployeeId: string): Promise<void> {
  // "Owner" is defined by the linked workforce_role slug, mirrored into
  // admin_whitelist.role by the sync trigger. Count active owners other
  // than the row we're about to mutate.
  const supabase = createSupabaseAdminClient()
  const { count, error } = await supabase
    .from('workforce_employees')
    // Same ambiguous-relationship issue as fetchEmployeeAccessSnapshot above —
    // must name the FK explicitly.
    .select('id, workforce_roles!workforce_employees_dashboard_role_id_fkey!inner(slug)', { count: 'exact', head: true })
    .eq('dashboard_access', true)
    .eq('workforce_roles.slug', 'owner')
    .neq('id', excludeEmployeeId)
  if (error) throw new Error(error.message || 'Could not verify remaining owners.')
  if (!count || count < 1) {
    throw new Error(
      'There must be at least one active owner. Promote another teammate to Owner first.',
    )
  }
}

async function assertNotSelf(employeeId: string, errorMessage: string): Promise<void> {
  const supabase = createSupabaseAdminClient()
  const callerEmail = await getCallerEmail()
  if (!callerEmail) return
  const { data } = await supabase
    .from('workforce_employees')
    .select('email')
    .eq('id', employeeId)
    .maybeSingle<{ email: string }>()
  if (data && data.email.toLowerCase() === callerEmail.toLowerCase()) {
    throw new Error(errorMessage)
  }
}

// Change an existing dashboard member's primary role. Unlike grant (which
// goes through the Clerk-invitation flow), this is a direct UPDATE — the
// trigger then mirrors the new role slug onto admin_whitelist.
export async function setDashboardRole(
  employeeId: string,
  roleId: string,
): Promise<void> {
  await requirePermission('platform.admin')

  const snapshot = await fetchEmployeeAccessSnapshot(employeeId)
  if (!snapshot) throw new Error('Employee not found.')
  if (!snapshot.hasAccess) {
    throw new Error(
      'This person doesn’t have dashboard access yet. Use "Grant access" to send an invitation.',
    )
  }

  const supabase = createSupabaseAdminClient()
  const { data: nextRole, error: roleError } = await supabase
    .from('workforce_roles')
    .select('slug')
    .eq('id', roleId)
    .maybeSingle<{ slug: string }>()
  if (roleError) throw new Error(roleError.message || 'Could not look up that role.')
  if (!nextRole) throw new Error('Role not found.')

  // Demoting the last active owner would lock the team out of admin
  // management. Promotions and lateral moves don't need this guard.
  if (snapshot.currentRoleSlug === 'owner' && nextRole.slug !== 'owner') {
    await assertOtherActiveOwnerExists(employeeId)
  }

  const { error } = await supabase
    .from('workforce_employees')
    .update({ dashboard_role_id: roleId })
    .eq('id', employeeId)
  if (error) throw new Error(error.message || 'Could not change this person’s role.')

  revalidatePath('/workforce/employees')
  revalidatePath('/workforce/roles')
}

export async function revokeDashboardAccess(employeeId: string): Promise<void> {
  await requirePermission('platform.admin')

  const snapshot = await fetchEmployeeAccessSnapshot(employeeId)
  if (!snapshot) throw new Error('Employee not found.')
  if (!snapshot.hasAccess) return // already revoked — idempotent

  // Protect the team from lockout: revoking the last active owner is
  // disallowed, and you can't revoke your own access (you'd be unable
  // to un-revoke yourself afterwards).
  if (snapshot.currentRoleSlug === 'owner') {
    await assertOtherActiveOwnerExists(employeeId)
  }
  await assertNotSelf(
    employeeId,
    'You can’t revoke your own access. Ask another owner to do it.',
  )

  const supabase = createSupabaseAdminClient()
  // Drop access on the employee row → trigger removes them from
  // admin_whitelist → next request rejects them at getAdminAccessRole.
  const { data: employee, error: employeeError } = await supabase
    .from('workforce_employees')
    .update({
      dashboard_access: false,
      dashboard_role_id: null,
    })
    .eq('id', employeeId)
    .select('id')
    .maybeSingle<{ id: string }>()
  if (employeeError) throw new Error(employeeError.message || 'Could not revoke access.')
  if (!employee) throw new Error('Employee not found.')

  // Revoke any still-pending invitations so a stale email link can't
  // re-grant access after the fact.
  const { data: pending } = await supabase
    .from('workforce_invitations')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('status', 'pending')
    .returns<Array<{ id: string }>>()

  for (const row of pending ?? []) {
    await revokeWorkforceInvitation(row.id).catch((err) => {
      console.warn('[workforce] could not revoke pending invite during access revoke', err)
    })
  }

  revalidatePath('/workforce/employees')
  revalidatePath('/workforce/roles')
}

export async function resendInvitation(employeeId: string, roleId: string): Promise<GrantDashboardAccessResult> {
  // Same gating as grant — re-issuing an invite is functionally a re-grant.
  return grantDashboardAccess(employeeId, roleId)
}
