// Server-only data access for the Workforce module. All reads use the
// service-role admin client and apply admin-only filtering. Pages call
// these from server components; actions in each route call them when
// they need to refresh data after a mutation.

import 'server-only'
import { clerkClient } from '@clerk/nextjs/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { countLeaveWeekdaysInclusive } from './leave-days'
import {
  parseSections,
  type ReportCadence,
  type ReportContent,
  type ReportStatus,
  type ReportSubmission,
  type ReportTemplate,
} from './report-schema'
import type {
  AssignedTask,
  Candidate,
  CurrentlyClockedEmployee,
  Department,
  Employee,
  TaskAssignment,
  TaskCadence,
  TaskCategory,
  TaskStatus,
  TaskTargetType,
  EmployeeStatus,
  EmploymentType,
  Job,
  JobStatus,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  Location,
  PayrollRun,
  PayrollStatus,
  PunchSource,
  PunchType,
  ShiftType,
  TimeClockStatus,
  TimePunch,
  WorkforceShift,
  WorkforceAttendance,
  WorkforceRole,
} from './types'

type EmployeeRow = {
  id: string
  employee_code: string
  full_name: string
  email: string
  phone: string | null
  job_title: string
  department: Department
  manager_id: string | null
  employment_type: EmploymentType
  status: EmployeeStatus
  location: Location
  start_date: string
  salary_tzs: number
  leave_balance_days: number
  avatar_color: string
  avatar_url: string | null
  notes: string | null
  dashboard_access: boolean | null
  dashboard_role_id: string | null
  invited_at: string | null
  last_dashboard_login: string | null
  clerk_user_id: string | null
}

const EMPLOYEE_COLUMNS =
  'id, employee_code, full_name, email, phone, job_title, department, manager_id, employment_type, status, location, start_date, salary_tzs, leave_balance_days, avatar_color, avatar_url, notes, dashboard_access, dashboard_role_id, invited_at, last_dashboard_login, clerk_user_id'

function mapEmployee(row: EmployeeRow, managerName: string | null): Employee {
  return {
    id: row.id,
    employeeCode: row.employee_code,
    name: row.full_name,
    email: row.email,
    phone: row.phone ?? '',
    jobTitle: row.job_title,
    department: row.department,
    manager: managerName,
    managerId: row.manager_id,
    notes: row.notes,
    employmentType: row.employment_type,
    status: row.status,
    location: row.location,
    startDate: row.start_date,
    salaryTzs: Number(row.salary_tzs),
    leaveBalanceDays: row.leave_balance_days,
    avatarColor: row.avatar_color,
    avatarUrl: row.avatar_url ?? null,
    dashboardAccess: Boolean(row.dashboard_access),
    dashboardRoleId: row.dashboard_role_id,
    invitedAt: row.invited_at,
    lastDashboardLogin: row.last_dashboard_login,
    clerkUserId: row.clerk_user_id,
  }
}

export async function getEmployees(): Promise<Employee[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_employees')
    .select(EMPLOYEE_COLUMNS)
    .order('employee_code', { ascending: true })
    .returns<EmployeeRow[]>()
  if (error) throw new Error(`[workforce] getEmployees: ${error.message}`)

  const rows = data ?? []

  // Resync Clerk profile pictures so users see their latest avatar even
  // after they update it in Clerk. The cached avatar_url is set at
  // invite-accept / grant time; without this resync the row would only
  // refresh on the next re-grant. Cached for 5 minutes (CLERK_AVATAR_TTL_MS)
  // so a heavily-loaded page doesn't hammer Clerk's API on every request.
  const freshAvatars = await refreshClerkAvatarsIfStale(supabase, rows)

  const nameById = new Map(rows.map((r) => [r.id, r.full_name]))
  return rows.map((row) => {
    const overriddenAvatar = freshAvatars.get(row.id)
    const enriched: EmployeeRow = overriddenAvatar !== undefined
      ? { ...row, avatar_url: overriddenAvatar }
      : row
    return mapEmployee(
      enriched,
      row.manager_id ? nameById.get(row.manager_id) ?? null : null,
    )
  })
}

// ---------------------------------------------------------------------------
// Clerk avatar resync
// ---------------------------------------------------------------------------
// Workforce employees who completed Clerk sign-up have their imageUrl
// cached on workforce_employees.avatar_url. Clerk doesn't notify us when
// the user uploads a new picture, so without this helper the cached
// avatar would go stale until the next invite-accept / re-grant.
//
// Strategy:
//   1. Cache the in-memory snapshot for 5 minutes (one fetch covers all
//      rows that share the request).
//   2. After the request, batch-fetch all linked Clerk users in one
//      `getUserList({ userId: [...] })` call.
//   3. For any row whose Supabase avatar_url disagrees with Clerk's
//      current imageUrl, schedule a background UPDATE — don't block the
//      response on it.
//   4. Return the freshest URLs to the caller so the very same render
//      shows the new picture (no second refresh needed).

const CLERK_AVATAR_TTL_MS = 5 * 60 * 1000

type AvatarCacheEntry = {
  fetchedAt: number
  byClerkId: Map<string, string | null>
}

const avatarCache: { current: AvatarCacheEntry | null } = { current: null }

async function refreshClerkAvatarsIfStale(
  supabase: SupabaseClient,
  rows: EmployeeRow[],
): Promise<Map<string, string | null>> {
  const linked = rows.filter(
    (r): r is EmployeeRow & { clerk_user_id: string } => Boolean(r.clerk_user_id),
  )
  if (linked.length === 0) return new Map()

  // Cache hit — reuse the previous snapshot, but still surface the
  // freshest URLs to the caller in case Supabase's avatar_url is older
  // than the cached Clerk one.
  const cache = avatarCache.current
  const cacheValid = cache && Date.now() - cache.fetchedAt < CLERK_AVATAR_TTL_MS
  let byClerkId: Map<string, string | null>
  if (cacheValid) {
    byClerkId = cache.byClerkId
  } else {
    try {
      const clerk = await clerkClient()
      const { data: users } = await clerk.users.getUserList({
        userId: linked.map((r) => r.clerk_user_id),
        limit: linked.length,
      })
      byClerkId = new Map(users.map((u) => [u.id, u.imageUrl ?? null]))
      avatarCache.current = { fetchedAt: Date.now(), byClerkId }
    } catch (err) {
      console.warn('[workforce] Clerk avatar resync failed', err)
      // Soft fail — keep returning whatever we already had cached.
      return new Map()
    }
  }

  // Build the per-employee fresh-URL map AND the list of Supabase rows
  // whose cached value drifted (need a background UPDATE).
  const result = new Map<string, string | null>()
  const drifted: { id: string; avatar_url: string }[] = []
  for (const row of linked) {
    const fresh = byClerkId.get(row.clerk_user_id)
    if (fresh === undefined) continue
    result.set(row.id, fresh)
    if (fresh && fresh !== row.avatar_url) {
      drifted.push({ id: row.id, avatar_url: fresh })
    }
  }

  if (drifted.length > 0) {
    // Fire-and-forget — don't block the page render on the writeback.
    void persistAvatarUpdates(supabase, drifted).catch((err) => {
      console.warn('[workforce] avatar writeback failed', err)
    })
  }

  return result
}

async function persistAvatarUpdates(
  supabase: SupabaseClient,
  updates: { id: string; avatar_url: string }[],
): Promise<void> {
  // Per-row UPDATEs — there's no native Supabase batch-by-id helper and
  // the workforce roster is small (~10s), so individual updates stay
  // well under any rate limit.
  await Promise.all(
    updates.map(({ id, avatar_url }) =>
      supabase.from('workforce_employees').update({ avatar_url }).eq('id', id),
    ),
  )
}

export async function getEmployeeById(id: string): Promise<Employee | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_employees')
    .select(EMPLOYEE_COLUMNS)
    .eq('id', id)
    .maybeSingle<EmployeeRow>()
  if (error) throw new Error(`[workforce] getEmployeeById: ${error.message}`)
  if (!data) return null
  let managerName: string | null = null
  if (data.manager_id) {
    const { data: m } = await supabase
      .from('workforce_employees')
      .select('full_name')
      .eq('id', data.manager_id)
      .maybeSingle<{ full_name: string }>()
    managerName = m?.full_name ?? null
  }
  return mapEmployee(data, managerName)
}

// Companion helper to getEmployeeById that also returns the raw manager_id
// — the public Employee shape only exposes the manager *name* (so list
// rows can render without an extra join), but the detail page's org
// chart needs the id to pull the manager's avatar/role card.
export async function getEmployeeWithManagerId(
  id: string,
): Promise<{ employee: Employee; managerId: string | null } | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_employees')
    .select(EMPLOYEE_COLUMNS)
    .eq('id', id)
    .maybeSingle<EmployeeRow>()
  if (error) throw new Error(`[workforce] getEmployeeWithManagerId: ${error.message}`)
  if (!data) return null
  let managerName: string | null = null
  if (data.manager_id) {
    const { data: m } = await supabase
      .from('workforce_employees')
      .select('full_name')
      .eq('id', data.manager_id)
      .maybeSingle<{ full_name: string }>()
    managerName = m?.full_name ?? null
  }
  return {
    employee: mapEmployee(data, managerName),
    managerId: data.manager_id,
  }
}

// Minimal employee shape for org-chart cards on the detail page —
// avoids hauling the full row (and its avatar resync) every time
// we want to show a name + role + photo.
export type EmployeeOrgNode = {
  id: string
  name: string
  jobTitle: string
  avatarColor: string
  avatarUrl: string | null
}

type OrgNodeRow = {
  id: string
  full_name: string
  job_title: string
  avatar_color: string
  avatar_url: string | null
}

function toOrgNode(row: OrgNodeRow): EmployeeOrgNode {
  return {
    id: row.id,
    name: row.full_name,
    jobTitle: row.job_title,
    avatarColor: row.avatar_color,
    avatarUrl: row.avatar_url,
  }
}

export async function getEmployeeOrgContext(
  employeeId: string,
  managerId: string | null,
): Promise<{ manager: EmployeeOrgNode | null; reports: EmployeeOrgNode[] }> {
  const supabase = createSupabaseAdminClient()

  const managerPromise = managerId
    ? supabase
        .from('workforce_employees')
        .select('id, full_name, job_title, avatar_color, avatar_url')
        .eq('id', managerId)
        .maybeSingle<OrgNodeRow>()
        .then((res) => {
          if (res.error) {
            throw new Error(`[workforce] getEmployeeOrgContext manager: ${res.error.message}`)
          }
          return res.data ? toOrgNode(res.data) : null
        })
    : Promise.resolve<EmployeeOrgNode | null>(null)

  const reportsPromise = supabase
    .from('workforce_employees')
    .select('id, full_name, job_title, avatar_color, avatar_url')
    .eq('manager_id', employeeId)
    .order('full_name', { ascending: true })
    .returns<OrgNodeRow[]>()
    .then((res) => {
      if (res.error) {
        throw new Error(`[workforce] getEmployeeOrgContext reports: ${res.error.message}`)
      }
      return (res.data ?? []).map(toOrgNode)
    })

  const [manager, reports] = await Promise.all([managerPromise, reportsPromise])
  return { manager, reports }
}

// --- Schedule ---

type ShiftRow = {
  id: string
  employee_id: string
  weekday: number
  shift_type: ShiftType
  start_time: string | null
  end_time: string | null
  note: string | null
}

export async function getShifts(): Promise<WorkforceShift[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_shifts')
    .select('id, employee_id, weekday, shift_type, start_time, end_time, note')
    .returns<ShiftRow[]>()
  if (error) throw new Error(`[workforce] getShifts: ${error.message}`)
  return (data ?? []).map((r) => ({
    id: r.id,
    employeeId: r.employee_id,
    weekday: r.weekday,
    type: r.shift_type,
    start: r.start_time ? r.start_time.slice(0, 5) : undefined,
    end: r.end_time ? r.end_time.slice(0, 5) : undefined,
    note: r.note ?? undefined,
  }))
}

// --- Payroll ---

type PayrollRow = {
  id: string
  period: string
  pay_date: string
  status: PayrollStatus
  headcount: number
  gross_tzs: number
  paye_tzs: number
  nssf_tzs: number
  net_tzs: number
}

export async function getPayrollRuns(): Promise<PayrollRun[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_payroll_runs')
    .select('id, period, pay_date, status, headcount, gross_tzs, paye_tzs, nssf_tzs, net_tzs')
    .order('pay_date', { ascending: false })
    .returns<PayrollRow[]>()
  if (error) throw new Error(`[workforce] getPayrollRuns: ${error.message}`)
  return (data ?? []).map((r) => ({
    id: r.id,
    period: r.period,
    payDate: r.pay_date,
    status: r.status,
    headcount: r.headcount,
    grossTzs: Number(r.gross_tzs),
    payeTzs: Number(r.paye_tzs),
    nssfTzs: Number(r.nssf_tzs),
    netTzs: Number(r.net_tzs),
  }))
}

// --- Leave ---

type LeaveRow = {
  id: string
  employee_id: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  days: number
  status: LeaveStatus
  reason: string
  submitted_at: string
}

export async function getLeaveRequests(): Promise<LeaveRequest[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_leave_requests')
    .select('id, employee_id, leave_type, start_date, end_date, days, status, reason, submitted_at')
    .order('submitted_at', { ascending: false })
    .returns<LeaveRow[]>()
  if (error) throw new Error(`[workforce] getLeaveRequests: ${error.message}`)
  return (data ?? []).map((r) => ({
    id: r.id,
    employeeId: r.employee_id,
    type: r.leave_type,
    startDate: r.start_date,
    endDate: r.end_date,
    days: countLeaveWeekdaysInclusive(r.start_date, r.end_date),
    status: r.status,
    reason: r.reason,
    submittedAt: r.submitted_at,
  }))
}

// --- Attendance ---

type AttendanceRow = {
  id: string
  employee_id: string
  work_date: string
  clock_in: string | null
  clock_out: string | null
  status: WorkforceAttendance['status']
  worked_hours: number
}

export async function getAttendance(date: string): Promise<WorkforceAttendance[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_attendance')
    .select('id, employee_id, work_date, clock_in, clock_out, status, worked_hours')
    .eq('work_date', date)
    .returns<AttendanceRow[]>()
  if (error) throw new Error(`[workforce] getAttendance: ${error.message}`)
  return (data ?? []).map((r) => ({
    id: r.id,
    employeeId: r.employee_id,
    date: r.work_date,
    clockIn: r.clock_in ? r.clock_in.slice(0, 5) : null,
    clockOut: r.clock_out ? r.clock_out.slice(0, 5) : null,
    status: r.status,
    workedHours: Number(r.worked_hours),
  }))
}

// --- Roles ---

type RoleRow = {
  id: string
  slug: string
  name: string
  description: string
  permission_keys: string[]
  members_count: number
  is_system: boolean
}

export async function getRoles(): Promise<WorkforceRole[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_roles')
    .select('id, slug, name, description, permission_keys, members_count, is_system')
    .order('is_system', { ascending: false })
    .order('name', { ascending: true })
    .returns<RoleRow[]>()
  if (error) throw new Error(`[workforce] getRoles: ${error.message}`)
  return (data ?? []).map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    members: r.members_count,
    permissionKeys: r.permission_keys,
    isSystem: r.is_system,
  }))
}

export async function getRoleMembers(roleId: string): Promise<string[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_role_members')
    .select('employee_id')
    .eq('role_id', roleId)
    .returns<Array<{ employee_id: string }>>()
  if (error) throw new Error(`[workforce] getRoleMembers: ${error.message}`)
  return (data ?? []).map((r) => r.employee_id)
}

// Who "holds" a role for display/assignment purposes — the union of the
// employee's PRIMARY role (workforce_employees.dashboard_role_id) and any
// SECONDARY memberships (workforce_role_members). The Roles page's read-only
// "Members" count already did this union inline in RolesClient.tsx; this
// query previously only read workforce_role_members, so the "Assign members"
// modal (which sources its pre-checked state from here) silently disagreed
// with the member count shown right next to it — e.g. showing "13 people
// hold this role" but only 2 checkboxes ticked when the modal opened. Fixed
// by unioning both sources here so every consumer sees the same truth.
export async function getAllRoleMembers(): Promise<Map<string, string[]>> {
  const supabase = createSupabaseAdminClient()
  const [{ data: memberRows, error: memberError }, { data: employeeRows, error: employeeError }] = await Promise.all([
    supabase
      .from('workforce_role_members')
      .select('role_id, employee_id')
      .returns<Array<{ role_id: string; employee_id: string }>>(),
    supabase
      .from('workforce_employees')
      .select('id, dashboard_role_id')
      .not('dashboard_role_id', 'is', null)
      .returns<Array<{ id: string; dashboard_role_id: string }>>(),
  ])
  if (memberError) throw new Error(`[workforce] getAllRoleMembers: ${memberError.message}`)
  if (employeeError) throw new Error(`[workforce] getAllRoleMembers: ${employeeError.message}`)

  const map = new Map<string, Set<string>>()
  for (const row of memberRows ?? []) {
    const set = map.get(row.role_id) ?? new Set<string>()
    set.add(row.employee_id)
    map.set(row.role_id, set)
  }
  for (const row of employeeRows ?? []) {
    const set = map.get(row.dashboard_role_id) ?? new Set<string>()
    set.add(row.id)
    map.set(row.dashboard_role_id, set)
  }
  return new Map(Array.from(map, ([roleId, ids]) => [roleId, Array.from(ids)]))
}

// --- Jobs + Candidates ---

type JobRow = {
  id: string
  slug: string
  title: string
  department: Department
  location: Location
  employment_type: EmploymentType
  status: JobStatus
  opened_at: string
  posted_salary_min_tzs: number
  posted_salary_max_tzs: number
  hiring_manager: string
}

type CandidateRow = {
  id: string
  job_id: string
  full_name: string
  email: string
  stage: Candidate['stage']
  source: Candidate['source']
  rating: number
  applied_at: string
}

export async function getJobsWithCandidates(): Promise<Job[]> {
  const supabase = createSupabaseAdminClient()
  const [jobsRes, candidatesRes] = await Promise.all([
    supabase
      .from('workforce_jobs')
      .select(
        'id, slug, title, department, location, employment_type, status, opened_at, posted_salary_min_tzs, posted_salary_max_tzs, hiring_manager'
      )
      .order('opened_at', { ascending: false })
      .returns<JobRow[]>(),
    supabase
      .from('workforce_candidates')
      .select('id, job_id, full_name, email, stage, source, rating, applied_at')
      .order('applied_at', { ascending: false })
      .returns<CandidateRow[]>(),
  ])

  if (jobsRes.error) throw new Error(`[workforce] getJobs: ${jobsRes.error.message}`)
  if (candidatesRes.error) throw new Error(`[workforce] getCandidates: ${candidatesRes.error.message}`)

  const byJob = new Map<string, Candidate[]>()
  for (const c of candidatesRes.data ?? []) {
    const list = byJob.get(c.job_id) ?? []
    list.push({
      id: c.id,
      name: c.full_name,
      email: c.email,
      stage: c.stage,
      source: c.source,
      rating: Math.max(1, Math.min(5, c.rating)) as Candidate['rating'],
      appliedAt: c.applied_at,
    })
    byJob.set(c.job_id, list)
  }

  return (jobsRes.data ?? []).map((j) => ({
    id: j.id,
    slug: j.slug,
    title: j.title,
    department: j.department,
    location: j.location,
    type: j.employment_type,
    status: j.status,
    openedAt: j.opened_at,
    postedSalaryTzs: [Number(j.posted_salary_min_tzs), Number(j.posted_salary_max_tzs)],
    hiringManager: j.hiring_manager,
    candidates: byJob.get(j.id) ?? [],
  }))
}

// DEPARTMENTS lives in `types.ts` so client components can import it
// without dragging `server-only` into the browser bundle. Re-export here
// for back-compat with existing call sites.
export { DEPARTMENTS } from './types'

// --- Invitations ---

export type WorkforceInvitationListRow = {
  id: string
  employeeId: string
  employeeName: string
  employeeCode: string
  email: string
  roleId: string
  roleName: string
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
  invitedAt: string
  expiresAt: string
  acceptedAt: string | null
  revokedAt: string | null
}

type InvitationJoinRow = {
  id: string
  employee_id: string
  email: string
  role_id: string
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
  invited_at: string
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
  workforce_employees: { full_name: string; employee_code: string } | null
  workforce_roles: { name: string } | null
}

export async function getWorkforceInvitations(
  status?: WorkforceInvitationListRow['status']
): Promise<WorkforceInvitationListRow[]> {
  const supabase = createSupabaseAdminClient()
  let query = supabase
    .from('workforce_invitations')
    .select(
      'id, employee_id, email, role_id, status, invited_at, expires_at, accepted_at, revoked_at, workforce_employees!employee_id(full_name, employee_code), workforce_roles(name)'
    )
    .order('invited_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data, error } = await query.returns<InvitationJoinRow[]>()
  if (error) throw new Error(`[workforce] getWorkforceInvitations: ${error.message}`)
  return (data ?? []).map((row) => ({
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.workforce_employees?.full_name ?? row.email,
    employeeCode: row.workforce_employees?.employee_code ?? '—',
    email: row.email,
    roleId: row.role_id,
    roleName: row.workforce_roles?.name ?? 'Unknown role',
    status: row.status,
    invitedAt: row.invited_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
  }))
}

export async function getOpenJobsCount(): Promise<number> {
  const supabase = createSupabaseAdminClient()
  const { count, error } = await supabase
    .from('workforce_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'Open')
  if (error) throw new Error(`[workforce] getOpenJobsCount: ${error.message}`)
  return count ?? 0
}

// ---------------------------------------------------------------------------
// Time clock — event-log queries
// ---------------------------------------------------------------------------
// All times are stored as timestamptz. The DB returns ISO strings; we keep
// them as ISO and let the client format in the viewer's timezone.

type TimePunchRow = {
  id: string
  employee_id: string
  punch_at: string
  punch_type: PunchType
  source: PunchSource
  note: string | null
  location_label: string | null
  created_by_clerk_id: string | null
}

const TIME_PUNCH_COLUMNS =
  'id, employee_id, punch_at, punch_type, source, note, location_label, created_by_clerk_id'

function mapPunch(row: TimePunchRow): TimePunch {
  return {
    id: row.id,
    employeeId: row.employee_id,
    punchAt: row.punch_at,
    type: row.punch_type,
    source: row.source,
    note: row.note,
    locationLabel: row.location_label,
    createdByClerkId: row.created_by_clerk_id,
  }
}

// Look up the workforce_employees row for the Clerk user that's currently
// signed in. Returns null if there's no matching record (e.g. an admin
// added via admin_whitelist who isn't also in the employee directory).
// Matches on clerk_user_id first (set on invite acceptance) and falls
// back to email so newly-added admins work before the link is established.
export async function getCurrentEmployee(
  clerkUserId: string,
  email: string | null,
): Promise<Employee | null> {
  const supabase = createSupabaseAdminClient()

  const { data: byClerk, error: clerkError } = await supabase
    .from('workforce_employees')
    .select(EMPLOYEE_COLUMNS)
    .eq('clerk_user_id', clerkUserId)
    .maybeSingle<EmployeeRow>()
  if (clerkError) throw new Error(`[workforce] getCurrentEmployee(clerk): ${clerkError.message}`)
  if (byClerk) return mapEmployee(byClerk, null)

  if (!email) return null
  const { data: byEmail, error: emailError } = await supabase
    .from('workforce_employees')
    .select(EMPLOYEE_COLUMNS)
    .ilike('email', email)
    .maybeSingle<EmployeeRow>()
  if (emailError) throw new Error(`[workforce] getCurrentEmployee(email): ${emailError.message}`)
  return byEmail ? mapEmployee(byEmail, null) : null
}

// Punches for one employee in a date range (inclusive on both ends, in
// the IANA timezone of the caller). The range is interpreted as
// [start 00:00:00, end+1 00:00:00) in the given tz.
export async function getPunchesForEmployee(
  employeeId: string,
  rangeStartIso: string,
  rangeEndIsoExclusive: string,
): Promise<TimePunch[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_time_punches')
    .select(TIME_PUNCH_COLUMNS)
    .eq('employee_id', employeeId)
    .gte('punch_at', rangeStartIso)
    .lt('punch_at', rangeEndIsoExclusive)
    .order('punch_at', { ascending: true })
    .returns<TimePunchRow[]>()
  if (error) throw new Error(`[workforce] getPunchesForEmployee: ${error.message}`)
  return (data ?? []).map(mapPunch)
}

// Punches for many employees in a date range — used by the admin grid.
export async function getPunchesForRange(
  rangeStartIso: string,
  rangeEndIsoExclusive: string,
): Promise<TimePunch[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_time_punches')
    .select(TIME_PUNCH_COLUMNS)
    .gte('punch_at', rangeStartIso)
    .lt('punch_at', rangeEndIsoExclusive)
    .order('punch_at', { ascending: true })
    .returns<TimePunchRow[]>()
  if (error) throw new Error(`[workforce] getPunchesForRange: ${error.message}`)
  return (data ?? []).map(mapPunch)
}

// Current clock state for one employee. Returns isClockedIn=false if the
// employee has never punched.
export async function getTimeClockStatus(employeeId: string): Promise<TimeClockStatus> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_time_punches')
    .select(TIME_PUNCH_COLUMNS)
    .eq('employee_id', employeeId)
    .order('punch_at', { ascending: false })
    .limit(1)
    .returns<TimePunchRow[]>()
  if (error) throw new Error(`[workforce] getTimeClockStatus: ${error.message}`)
  const last = (data ?? [])[0]
  if (!last) return { employeeId, isClockedIn: false, sinceIso: null, lastPunch: null }
  const lastPunch = mapPunch(last)
  return {
    employeeId,
    isClockedIn: lastPunch.type === 'in',
    sinceIso: lastPunch.type === 'in' ? lastPunch.punchAt : null,
    lastPunch,
  }
}

// Everyone whose most-recent punch is 'in'. Uses DISTINCT ON to pick the
// latest punch per employee in a single round-trip, then joins to the
// employee directory for display.
export async function getCurrentlyClockedEmployees(): Promise<CurrentlyClockedEmployee[]> {
  const supabase = createSupabaseAdminClient()

  // Pull the latest punch per employee via the workforce_last_punch
  // function. Simpler than a window query and uses the (employee_id,
  // punch_at DESC) index.
  const { data: emps, error: empsErr } = await supabase
    .from('workforce_employees')
    .select('id, full_name, employee_code, avatar_url, avatar_color')
    .order('full_name', { ascending: true })
    .returns<Array<{ id: string; full_name: string; employee_code: string; avatar_url: string | null; avatar_color: string }>>()
  if (empsErr) throw new Error(`[workforce] getCurrentlyClockedEmployees: ${empsErr.message}`)

  const out: CurrentlyClockedEmployee[] = []
  await Promise.all(
    (emps ?? []).map(async (e) => {
      const { data: last, error: lastErr } = await supabase
        .from('workforce_time_punches')
        .select('punch_at, punch_type')
        .eq('employee_id', e.id)
        .order('punch_at', { ascending: false })
        .limit(1)
        .returns<Array<{ punch_at: string; punch_type: PunchType }>>()
      if (lastErr) return
      const lp = (last ?? [])[0]
      if (!lp || lp.punch_type !== 'in') return
      out.push({
        employeeId: e.id,
        employeeName: e.full_name,
        employeeCode: e.employee_code,
        avatarUrl: e.avatar_url,
        avatarColor: e.avatar_color,
        sinceIso: lp.punch_at,
      })
    }),
  )
  return out.sort((a, b) => a.sinceIso.localeCompare(b.sinceIso))
}

// --- Task assignments ---

type AssignmentRow = {
  id: string
  title: string
  description: string | null
  category: TaskCategory
  target_type: TaskTargetType
  target_employee_id: string | null
  target_department: Department | null
  cadence: TaskCadence
  start_date: string
  end_date: string | null
  is_active: boolean
  created_at: string
  target_employee: { full_name: string; department: Department } | null
  assigned_by_employee: { full_name: string } | null
}

// Admin tracking list. Optionally filter to one department (a manager's
// own department, or an admin narrowing the view). Completion rollups are
// fetched in a second query and merged so we don't N+1 per assignment.
//
// Department scoping happens in JS, not in the query: employee-targeted
// assignments store target_department = NULL, so a plain
// `.eq('target_department', dept)` would hide every task a manager assigned
// to one of their own reports. We keep a row when it targets the department
// directly OR it targets an employee who belongs to that department.
export async function getTaskAssignments(filters?: {
  department?: string | null
}): Promise<TaskAssignment[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_task_assignments')
    .select(
      'id, title, description, category, target_type, target_employee_id, ' +
        'target_department, cadence, start_date, end_date, is_active, created_at, ' +
        'target_employee:workforce_employees!workforce_task_assignments_target_employee_id_fkey(full_name, department), ' +
        'assigned_by_employee:workforce_employees!workforce_task_assignments_assigned_by_fkey(full_name)',
    )
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(300)
    .returns<AssignmentRow[]>()
  if (error) throw new Error(`[workforce] getTaskAssignments: ${error.message}`)

  const dept = filters?.department
  const rows = dept
    ? (data ?? []).filter(
        (r) =>
          r.target_department === dept ||
          (r.target_type === 'employee' && r.target_employee?.department === dept),
      )
    : data ?? []
  const ids = rows.map((r) => r.id)
  const stats = await getAssignmentStats(supabase, ids)

  return rows.map((r) => {
    const s = stats.get(r.id) ?? { total: 0, done: 0 }
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      category: r.category,
      targetType: r.target_type,
      targetEmployeeId: r.target_employee_id,
      targetEmployeeName: r.target_employee?.full_name ?? null,
      targetDepartment: r.target_department,
      cadence: r.cadence,
      startDate: r.start_date,
      endDate: r.end_date,
      isActive: r.is_active,
      assignedByName: r.assigned_by_employee?.full_name ?? null,
      createdAt: r.created_at,
      totalTasks: s.total,
      doneTasks: s.done,
    }
  })
}

async function getAssignmentStats(
  supabase: SupabaseClient,
  assignmentIds: string[],
): Promise<Map<string, { total: number; done: number }>> {
  const out = new Map<string, { total: number; done: number }>()
  if (assignmentIds.length === 0) return out
  const { data, error } = await supabase
    .from('workforce_tasks')
    .select('assignment_id, status')
    .in('assignment_id', assignmentIds)
    .returns<Array<{ assignment_id: string; status: TaskStatus }>>()
  if (error) throw new Error(`[workforce] getAssignmentStats: ${error.message}`)
  for (const row of data ?? []) {
    const cur = out.get(row.assignment_id) ?? { total: 0, done: 0 }
    cur.total += 1
    if (row.status === 'Done') cur.done += 1
    out.set(row.assignment_id, cur)
  }
  return out
}

// Per-employee instances for the My tasks page.
type AssignedTaskRow = {
  id: string
  title: string
  description: string | null
  category: TaskCategory
  cadence: TaskCadence
  status: TaskStatus
  due_date: string | null
  occurrence_date: string
  completed_at: string | null
  created_at: string
}

export async function getAssignedTasksForEmployee(
  employeeId: string,
): Promise<AssignedTask[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_tasks')
    .select(
      'id, title, description, category, cadence, status, due_date, occurrence_date, completed_at, created_at',
    )
    .eq('employee_id', employeeId)
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(300)
    .returns<AssignedTaskRow[]>()
  if (error) throw new Error(`[workforce] getAssignedTasksForEmployee: ${error.message}`)
  return (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    category: r.category,
    cadence: r.cadence,
    status: r.status,
    dueDate: r.due_date,
    occurrenceDate: r.occurrence_date,
    completedAt: r.completed_at,
    createdAt: r.created_at,
  }))
}

// --- Report templates + submissions ---

type ReportTemplateRow = {
  id: string
  slug: string
  name: string
  description: string | null
  cadence: ReportCadence
  departments: string[] | null
  sections: unknown
  is_active: boolean
  created_at: string
  updated_at: string
}

function mapTemplate(r: ReportTemplateRow): ReportTemplate {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    cadence: r.cadence,
    departments: r.departments ?? [],
    sections: parseSections(r.sections),
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const TEMPLATE_COLUMNS =
  'id, slug, name, description, cadence, departments, sections, is_active, created_at, updated_at'

export async function getReportTemplates(opts?: {
  activeOnly?: boolean
}): Promise<ReportTemplate[]> {
  const supabase = createSupabaseAdminClient()
  let query = supabase
    .from('report_templates')
    .select(TEMPLATE_COLUMNS)
    .order('name', { ascending: true })
  if (opts?.activeOnly) query = query.eq('is_active', true)
  const { data, error } = await query.returns<ReportTemplateRow[]>()
  if (error) throw new Error(`[workforce] getReportTemplates: ${error.message}`)
  return (data ?? []).map(mapTemplate)
}

export async function getReportTemplateById(id: string): Promise<ReportTemplate | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('report_templates')
    .select(TEMPLATE_COLUMNS)
    .eq('id', id)
    .maybeSingle<ReportTemplateRow>()
  if (error) throw new Error(`[workforce] getReportTemplateById: ${error.message}`)
  return data ? mapTemplate(data) : null
}

type ReportSubmissionRow = {
  id: string
  template_id: string | null
  template_snapshot: unknown
  employee_id: string
  report_date: string
  period_end: string | null
  status: ReportStatus
  content: ReportContent | null
  prepared_by_name: string | null
  prepared_by_role: string | null
  submitted_at: string | null
  created_at: string
  updated_at: string
  recipient_id: string | null
  recipient_emails: string[] | null
  workforce_employees: {
    full_name: string
    employee_code: string
    department: string
    avatar_color: string
    avatar_url: string | null
  } | null
  recipient: { full_name: string; email: string } | null
  report_templates: { name: string; slug: string; sections: unknown } | null
}

function mapSubmission(r: ReportSubmissionRow): ReportSubmission {
  const snap =
    r.template_snapshot && typeof r.template_snapshot === 'object'
      ? (r.template_snapshot as Record<string, unknown>)
      : {}
  // Prefer the frozen snapshot so the report renders as it was written;
  // fall back to the live template (older rows / drafts).
  const sections =
    parseSections(snap.sections).length > 0
      ? parseSections(snap.sections)
      : parseSections(r.report_templates?.sections)
  const e = r.workforce_employees
  return {
    id: r.id,
    templateId: r.template_id,
    templateSlug:
      typeof snap.slug === 'string' ? snap.slug : r.report_templates?.slug ?? '',
    templateName:
      typeof snap.name === 'string' ? snap.name : r.report_templates?.name ?? 'Report',
    sections,
    employeeId: r.employee_id,
    employeeName: e?.full_name ?? 'Unknown',
    employeeCode: e?.employee_code ?? '',
    department: e?.department ?? '',
    avatarColor: e?.avatar_color ?? '#F0DFF6',
    avatarUrl: e?.avatar_url ?? null,
    recipientId: r.recipient_id,
    recipientName: r.recipient?.full_name ?? null,
    recipientEmail: r.recipient?.email ?? null,
    recipientEmails: r.recipient_emails ?? [],
    reportDate: r.report_date,
    periodEnd: r.period_end,
    status: r.status,
    content: r.content ?? {},
    preparedByName: r.prepared_by_name,
    preparedByRole: r.prepared_by_role,
    submittedAt: r.submitted_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const SUBMISSION_COLUMNS =
  'id, template_id, template_snapshot, employee_id, report_date, period_end, status, ' +
  'content, prepared_by_name, prepared_by_role, submitted_at, created_at, updated_at, recipient_id, recipient_emails, ' +
  'workforce_employees!workforce_reports_employee_id_fkey!inner(full_name, employee_code, department, avatar_color, avatar_url), ' +
  'recipient:workforce_employees!workforce_reports_recipient_id_fkey(full_name, email), ' +
  'report_templates(name, slug, sections)'

// One employee's own reports (any status) for the My reports page.
export async function getReportsForEmployee(employeeId: string): Promise<ReportSubmission[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_reports')
    .select(SUBMISSION_COLUMNS)
    .eq('employee_id', employeeId)
    .order('report_date', { ascending: false })
    .limit(200)
    .returns<ReportSubmissionRow[]>()
  if (error) throw new Error(`[workforce] getReportsForEmployee: ${error.message}`)
  return (data ?? []).map(mapSubmission)
}

// Admin tracking. Only submitted reports by default; filters narrow it.
export async function getReports(filters?: {
  templateId?: string | null
  employeeId?: string | null
  date?: string | null
  status?: ReportStatus | null
}): Promise<ReportSubmission[]> {
  const supabase = createSupabaseAdminClient()
  let query = supabase
    .from('workforce_reports')
    .select(SUBMISSION_COLUMNS)
    .order('report_date', { ascending: false })
    .limit(500)
  // `status: null` is an explicit "all statuses" sentinel; only `undefined`
  // (omitted) falls back to the submitted-only default.
  const statusFilter = filters?.status === null ? undefined : filters?.status ?? 'submitted'
  if (statusFilter) query = query.eq('status', statusFilter)
  if (filters?.templateId) query = query.eq('template_id', filters.templateId)
  if (filters?.employeeId) query = query.eq('employee_id', filters.employeeId)
  if (filters?.date) query = query.eq('report_date', filters.date)
  const { data, error } = await query.returns<ReportSubmissionRow[]>()
  if (error) throw new Error(`[workforce] getReports: ${error.message}`)
  return (data ?? []).map(mapSubmission)
}

// Per-employee counts for the performance overview. Both keyed by
// employee_id. Reports counts only submitted ones in the window; tasks
// count all instances due in the window plus how many are Done.
export async function getReportCountsByEmployee(
  sinceDate: string,
): Promise<Map<string, number>> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_reports')
    .select('employee_id')
    .eq('status', 'submitted')
    .gte('report_date', sinceDate)
    .returns<Array<{ employee_id: string }>>()
  if (error) throw new Error(`[workforce] getReportCountsByEmployee: ${error.message}`)
  const m = new Map<string, number>()
  for (const r of data ?? []) m.set(r.employee_id, (m.get(r.employee_id) ?? 0) + 1)
  return m
}

export async function getTaskCountsByEmployee(
  sinceDate: string,
): Promise<Map<string, { total: number; done: number }>> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_tasks')
    .select('employee_id, status, due_date')
    .gte('due_date', sinceDate)
    .returns<Array<{ employee_id: string; status: string }>>()
  if (error) throw new Error(`[workforce] getTaskCountsByEmployee: ${error.message}`)
  const m = new Map<string, { total: number; done: number }>()
  for (const r of data ?? []) {
    const cur = m.get(r.employee_id) ?? { total: 0, done: 0 }
    cur.total += 1
    if (r.status === 'Done') cur.done += 1
    m.set(r.employee_id, cur)
  }
  return m
}

// Most recent submission of a template by an employee, strictly before a
// given report_date — used to seed a monthly report's follow-up section
// from last period's goal_list content. Any status (draft counts too, since
// a goal set while drafting is still a real commitment worth following up).
export async function getLatestReportBefore(
  employeeId: string,
  templateId: string,
  beforeDate: string,
): Promise<ReportSubmission | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_reports')
    .select(SUBMISSION_COLUMNS)
    .eq('employee_id', employeeId)
    .eq('template_id', templateId)
    .lt('report_date', beforeDate)
    .order('report_date', { ascending: false })
    .limit(1)
    .maybeSingle<ReportSubmissionRow>()
  if (error) throw new Error(`[workforce] getLatestReportBefore: ${error.message}`)
  return data ? mapSubmission(data) : null
}

export async function getReportById(id: string): Promise<ReportSubmission | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_reports')
    .select(SUBMISSION_COLUMNS)
    .eq('id', id)
    .maybeSingle<ReportSubmissionRow>()
  if (error) throw new Error(`[workforce] getReportById: ${error.message}`)
  return data ? mapSubmission(data) : null
}

// summarizePunchesByDay (pure utility) lives in `time-summary.ts` so
// client components can import it without dragging `server-only` into
// the browser bundle.
