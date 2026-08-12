import 'server-only'
import { cache } from 'react'
import { auth, currentUser } from '@clerk/nextjs/server'
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/supabase'
import {
  escapeLike,
  getCallerEmail,
  getCallerEmployeeId,
  isAdminAuthDisabled,
} from '@/lib/admin-auth'
import { recordAuditEvent } from '@/lib/audit-log'
import { logDbError } from '@/lib/log-safe'
import { resolveAccessState, isOnboarding, type WorkspaceAccessState } from './access'
import {
  normalizeEmail,
  resolveIdentity,
  resolutionErrorCode,
  type EmployeeIdentityCandidate,
} from './identity-core'
import { recordWorkspaceActivity } from './activity'

// Server-side resolution of "who is this, and what may their Workspace do".
//
// This is the only way a Workspace route may learn an employee id. Nothing
// downstream — no page, no server action, no route handler — accepts an
// employee_id from the browser for a self-service read or write. The id comes
// from here or the request does not happen.
//
// Wrapped in React.cache so a layout, its page, and any server action on the
// same request share one Clerk + Supabase resolution instead of repeating it.

const EMPLOYEE_COLUMNS =
  'id, employee_code, full_name, email, phone, job_title, department, location, manager_id, employment_type, status, start_date, leave_balance_days, avatar_color, avatar_url, dashboard_access, clerk_user_id'

type EmployeeRow = {
  id: string
  employee_code: string
  full_name: string
  email: string
  phone: string | null
  job_title: string
  department: string
  location: string
  manager_id: string | null
  employment_type: string
  status: string
  start_date: string
  leave_balance_days: number
  avatar_color: string
  avatar_url: string | null
  dashboard_access: boolean
  clerk_user_id: string | null
}

export type WorkspaceEmployee = {
  id: string
  employeeCode: string
  name: string
  email: string
  phone: string | null
  jobTitle: string
  department: string
  location: string
  managerId: string | null
  managerName: string | null
  employmentType: string
  status: string
  startDate: string
  leaveBalanceDays: number
  avatarColor: string
  avatarUrl: string | null
  clerkUserId: string | null
}

export type WorkspaceSession =
  /** No Clerk session. */
  | { status: 'unauthenticated' }
  /**
   * Signed in, but we will not name an employee: no row, several rows, or a row
   * belonging to someone else's account. Fails safe — the caller renders an
   * explanation and Workspace stays shut.
   */
  | { status: 'unresolved'; code: 'no_employee_record' | 'ambiguous_identity' | 'identity_conflict' }
  /** Resolved. `access` may still be 'denied'; the caller enforces it. */
  | {
      status: 'resolved'
      employee: WorkspaceEmployee
      access: WorkspaceAccessState
      onboarding: boolean
    }

function mapEmployee(row: EmployeeRow, managerName: string | null): WorkspaceEmployee {
  return {
    id: row.id,
    employeeCode: row.employee_code,
    name: row.full_name,
    email: row.email,
    phone: row.phone,
    jobTitle: row.job_title,
    department: row.department,
    location: row.location,
    managerId: row.manager_id,
    managerName,
    employmentType: row.employment_type,
    status: row.status,
    startDate: row.start_date,
    leaveBalanceDays: row.leave_balance_days,
    avatarColor: row.avatar_color,
    avatarUrl: row.avatar_url,
    clerkUserId: row.clerk_user_id,
  }
}

function toCandidate(row: EmployeeRow): EmployeeIdentityCandidate {
  return { id: row.id, clerkUserId: row.clerk_user_id, email: row.email }
}

/**
 * Resolve the signed-in Clerk account to exactly one employee.
 *
 * Never throws for an identity problem — an unresolvable caller is a state the
 * UI renders, not an exception. It only throws if Supabase itself is
 * unreachable, and that is caught by the callers in guards.ts.
 */
export const getWorkspaceSession = cache(async (): Promise<WorkspaceSession> => {
  // The local admin-auth bypass deliberately has no Clerk session. Treat it as
  // an authenticated development caller and resolve the explicitly selected
  // employee (DEV_EMPLOYEE_ID / dev_employee_id cookie), falling back to the
  // standard development email. Without this branch, clicking the now-stable
  // Workspace tab bounced developers to a sign-in screen that the bypass can
  // never complete.
  if (isAdminAuthDisabled()) {
    if (!hasSupabaseAdminConfig()) {
      console.error('[workspace] development identity unavailable: Supabase admin env is missing')
      return { status: 'unresolved', code: 'no_employee_record' }
    }

    const [employeeId, email] = await Promise.all([
      getCallerEmployeeId(),
      getCallerEmail(),
    ])
    const supabase = createSupabaseAdminClient()

    // Prefer an explicit DEV_EMPLOYEE_ID / cookie, but fall back to the
    // development email when that id is missing or stale. Without the
    // fallback, a leftover `dev_employee_id` cookie silently closes Workspace
    // even though a matching row exists for getCallerEmail().
    let rows: EmployeeRow[] = []
    if (employeeId) {
      const byId = await supabase
        .from('workforce_employees')
        .select(EMPLOYEE_COLUMNS)
        .eq('id', employeeId)
        .limit(2)
        .returns<EmployeeRow[]>()
      if (byId.error) {
        logDbError('workspace.identity.development_lookup', byId.error, { employeeId })
        return { status: 'unresolved', code: 'no_employee_record' }
      }
      rows = byId.data ?? []
    }
    if (rows.length === 0 && email) {
      const byEmail = await supabase
        .from('workforce_employees')
        .select(EMPLOYEE_COLUMNS)
        .ilike('email', escapeLike(email))
        .limit(2)
        .returns<EmployeeRow[]>()
      if (byEmail.error) {
        logDbError('workspace.identity.development_lookup', byEmail.error, { email })
        return { status: 'unresolved', code: 'no_employee_record' }
      }
      rows = byEmail.data ?? []
    }

    if (rows.length !== 1) {
      return {
        status: 'unresolved',
        code: rows.length > 1 ? 'ambiguous_identity' : 'no_employee_record',
      }
    }

    const row = rows[0]
    return {
      status: 'resolved',
      employee: mapEmployee(row, await fetchManagerName(row.manager_id)),
      access: resolveAccessState({
        status: row.status,
        dashboardAccess: Boolean(row.dashboard_access),
      }),
      onboarding: isOnboarding(row.status),
    }
  }

  const { userId, sessionClaims } = await auth()
  if (!userId) return { status: 'unauthenticated' }

  if (!hasSupabaseAdminConfig()) {
    console.error('[workspace] identity unavailable: Supabase admin env is missing')
    return { status: 'unresolved', code: 'no_employee_record' }
  }

  const user = await currentUser()
  const claimEmail =
    sessionClaims && typeof sessionClaims === 'object' && 'email' in sessionClaims
      ? (sessionClaims as { email?: unknown }).email
      : null
  const email = normalizeEmail(
    user?.primaryEmailAddress?.emailAddress ||
      user?.emailAddresses?.[0]?.emailAddress ||
      (typeof claimEmail === 'string' ? claimEmail : null),
  )

  const supabase = createSupabaseAdminClient()

  // Both lookups take limit(2). One row is the answer; a second row is the
  // signal that we must not answer at all. maybeSingle() is wrong here — it
  // raises a raw PostgREST error on multiple rows, which would surface the
  // ambiguity as an unexplained crash instead of a handled refusal.
  const [clerkMatch, emailMatch] = await Promise.all([
    supabase
      .from('workforce_employees')
      .select(EMPLOYEE_COLUMNS)
      .eq('clerk_user_id', userId)
      .limit(2)
      .returns<EmployeeRow[]>(),
    email
      ? supabase
          .from('workforce_employees')
          .select(EMPLOYEE_COLUMNS)
          // escapeLike matters: an address such as john_doe@x.com would
          // otherwise be an ILIKE pattern where '_' matches any character,
          // silently resolving to a different person's row.
          .ilike('email', escapeLike(email))
          .limit(2)
          .returns<EmployeeRow[]>()
      : Promise.resolve({ data: [] as EmployeeRow[], error: null }),
  ])

  if (clerkMatch.error || emailMatch.error) {
    logDbError('workspace.identity.lookup', clerkMatch.error ?? emailMatch.error, {
      clerkUserId: userId,
    })
    // A lookup failure is not "you have no profile" — but it resolves to the
    // same closed door, and the employee gets a message that does not describe
    // the database.
    return { status: 'unresolved', code: 'no_employee_record' }
  }

  const byClerkId = clerkMatch.data ?? []
  const byEmail = emailMatch.data ?? []

  const resolution = resolveIdentity({
    clerkUserId: userId,
    email,
    byClerkId: byClerkId.map(toCandidate),
    byEmail: byEmail.map(toCandidate),
  })

  if (resolution.outcome !== 'resolved') {
    // Ambiguity and conflict are security-relevant: someone signed in and we
    // could have handed them the wrong Workspace. Audited, with ids only.
    if (resolution.outcome !== 'no_match') {
      void recordAuditEvent({
        eventType: `workspace.identity_${resolution.outcome}`,
        severity: 'critical',
        message: `Workspace identity ${resolution.outcome} — refused to resolve`,
        actorClerkId: userId,
        metadata: {
          outcome: resolution.outcome,
          candidateCount:
            resolution.outcome === 'ambiguous' ? resolution.candidateCount : byEmail.length,
        },
        resolveActor: false,
      })
    }
    return { status: 'unresolved', code: resolutionErrorCode(resolution) }
  }

  const row =
    byClerkId.find((r) => r.id === resolution.employeeId) ??
    byEmail.find((r) => r.id === resolution.employeeId)
  if (!row) {
    // Unreachable: the resolution only ever names a row we passed in.
    console.error('[workspace] resolved employee id not present in candidates')
    return { status: 'unresolved', code: 'no_employee_record' }
  }

  if (resolution.shouldPersistClerkId) {
    await linkClerkAccount(row.id, userId)
    row.clerk_user_id = userId
  }

  const managerName = await fetchManagerName(row.manager_id)

  return {
    status: 'resolved',
    employee: mapEmployee(row, managerName),
    access: resolveAccessState({
      status: row.status,
      dashboardAccess: Boolean(row.dashboard_access),
    }),
    onboarding: isOnboarding(row.status),
  }
})

/**
 * Step 4 of the ladder: stamp the Clerk account onto the row so the next sign-in
 * resolves by link rather than by email.
 *
 * `is('clerk_user_id', null)` is the race guard. Two concurrent first sign-ins
 * (or a People Ops link landing at the same moment) must not overwrite an
 * existing link — the second update matches zero rows and does nothing.
 *
 * Best-effort: a failed link leaves the employee resolving by email next time,
 * which still works. It must never block the request.
 */
async function linkClerkAccount(employeeId: string, clerkUserId: string): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('workforce_employees')
      .update({ clerk_user_id: clerkUserId })
      .eq('id', employeeId)
      .is('clerk_user_id', null)
      .select('id')
      .returns<{ id: string }[]>()
    if (error) {
      logDbError('workspace.identity.link', error, { employeeId })
      return
    }
    if (!data || data.length === 0) return // Someone else linked it first.

    void recordWorkspaceActivity({
      employeeId,
      eventType: 'workspace.identity.linked',
      summary: 'Signed in to Workspace for the first time and linked this account',
      actorEmployeeId: employeeId,
      actorClerkId: clerkUserId,
      targetResource: `workforce_employees:${employeeId}`,
    })
    void recordAuditEvent({
      eventType: 'workspace.identity_linked',
      severity: 'info',
      message: 'Workspace linked a Clerk account to an employee record',
      actorClerkId: clerkUserId,
      targetResource: `workforce_employees:${employeeId}`,
      metadata: { employeeId, matchedBy: 'email' },
      resolveActor: false,
    })
  } catch (error) {
    logDbError('workspace.identity.link', error, { employeeId })
  }
}

async function fetchManagerName(managerId: string | null): Promise<string | null> {
  if (!managerId) return null
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('workforce_employees')
      .select('full_name')
      .eq('id', managerId)
      .maybeSingle<{ full_name: string }>()
    if (error) {
      logDbError('workspace.identity.manager', error, { managerId })
      return null
    }
    return data?.full_name ?? null
  } catch (error) {
    logDbError('workspace.identity.manager', error, { managerId })
    return null
  }
}
