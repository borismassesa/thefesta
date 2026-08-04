import { cache } from 'react'
import { auth, currentUser } from '@clerk/nextjs/server'
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/supabase'
import { escapeLike, getCallerEmail, getCallerPermissions } from '@/lib/admin-auth'
import { recordAuditEvent } from '@/lib/audit-log'
import {
  EMPTY_TEAM_SCOPE,
  buildCallerScope,
  canAutoLinkIdentity,
  deriveTeamScope,
  hasAnyWorkforcePermission,
  resolveSelfIdentity,
  selfIdentityMessage,
  type CallerScope,
  type EmployeeStatus,
  type SelfEmployee,
  type SelfIdentityResult,
} from './scope'

// ---------------------------------------------------------------------------
// Self-identity adapter — the ONLY way to answer "who am I".
// ---------------------------------------------------------------------------
// Implements section 2 of docs/WORKSPACE_WORKFORCE_ARCHITECTURE.md.
//
// This module is deliberately thin: it fetches rows and hands them to the pure
// policy in ./scope.ts. Nothing here decides anything. That split is what lets
// the policy be unit-tested without a database.
//
// It replaces eleven ad-hoc "resolve me by email" lookups, EIGHT of which
// omitted escapeLike() and were therefore pattern-injectable — an address such
// as `john_doe@x.com` matches any single character at the `_` and could
// silently resolve to a different employee:
//
//   workforce/my-tasks/page.tsx:41       workforce/employees/actions.ts:277
//   workforce/my-tasks/actions.ts:36     workforce/employees/[id]/record-actions.ts:56
//   workforce/_lib/queries.ts:772        support/actions.ts:27
//   _dashboard/queries.ts:185            lib/contribute/profile.ts:36
//
// Migrating those call sites happens in PR B / PR C; this lands the mechanism.

const EMPLOYEE_COLUMNS =
  'id, full_name, email, status, department, manager_id, clerk_user_id'

type EmployeeRow = {
  id: string
  full_name: string
  email: string
  status: string
  department: string
  manager_id: string | null
  clerk_user_id: string | null
}

function toSelfEmployee(row: EmployeeRow): SelfEmployee {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    status: row.status as EmployeeStatus,
    department: row.department,
    managerId: row.manager_id,
    clerkUserId: row.clerk_user_id,
  }
}

/**
 * Persist clerk_user_id onto a row matched by email, so the email fallback
 * becomes a ONE-TIME repair rather than a permanent authentication mechanism.
 *
 * The UPDATE is conditional on clerk_user_id IS NULL and its row count is
 * checked, because two concurrent requests can both reach this point before
 * either writes. The UNIQUE constraint on clerk_user_id
 * (20260514213347_workforce_dashboard_access.sql:33) prevents corruption, but
 * the application still has to handle the race cleanly rather than throwing.
 *
 * Returns true when THIS request won the link.
 */
async function tryLinkClerkId(
  employeeId: string,
  clerkUserId: string,
): Promise<boolean> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_employees')
    .update({ clerk_user_id: clerkUserId })
    .eq('id', employeeId)
    .is('clerk_user_id', null)
    .select('id')
    .returns<Array<{ id: string }>>()

  if (error) {
    // A unique violation means someone else won the race; that is expected
    // and benign, so it is not surfaced as an error.
    if ((error as { code?: string }).code !== '23505') {
      console.warn('[workforce-identity] could not link clerk_user_id', error)
    }
    return false
  }
  const linked = (data?.length ?? 0) > 0
  if (linked) {
    void recordAuditEvent({
      eventType: 'workforce.identity_linked',
      severity: 'info',
      message: `Linked Clerk account to employee ${employeeId} via verified email fallback`,
      actorClerkId: clerkUserId,
      targetResource: `workforce_employees:${employeeId}`,
      metadata: { source: 'verified_email_fallback' },
    })
  }
  return linked
}

/**
 * Resolve the signed-in caller to a workforce employee.
 *
 * Order: clerk_user_id first, then normalised email. Never returns a bare
 * null — callers need to distinguish "not signed in" from "signed in but no
 * profile" from "more than one profile" in order to render useful copy.
 *
 * NOTE on email matching: workforce_employees.email is `text NOT NULL UNIQUE`
 * (20260512000004:84), a CASE-SENSITIVE constraint, so `alice@x.com` and
 * `Alice@x.com` can both exist. That is why this still uses ilike + escapeLike
 * rather than exact equality, and why it selects ALL matches instead of
 * maybeSingle: two case-variant rows must surface as AMBIGUOUS_IDENTITY and
 * fail closed, not throw. Once the normalisation migration adds a
 * UNIQUE(lower(email)) index this can become an exact match.
 *
 * Cached per request so a Workspace layout and its page share one round trip.
 */
export const getSelfIdentity = cache(async (): Promise<SelfIdentityResult> => {
  const { userId } = await auth()

  // No Clerk session. Normally that is UNAUTHENTICATED, but the local
  // DISABLE_ADMIN_AUTH bypass grants 'owner' without ever creating one, so a
  // developer would otherwise see "please sign in" on every Workspace page
  // while the rest of the dashboard worked. getCallerEmail already owns that
  // rule (real session wins; placeholder only when there is no session at
  // all), so we defer to it rather than re-deriving the bypass here.
  //
  // Identity repair is deliberately skipped on this path: there is no Clerk
  // user to link, and writing a placeholder id would corrupt a real row.
  if (!userId) {
    const devEmail = await getCallerEmail()
    if (!devEmail || !hasSupabaseAdminConfig()) return resolveSelfIdentity(false, [])
    const supabase = createSupabaseAdminClient()
    const { data } = await supabase
      .from('workforce_employees')
      .select(EMPLOYEE_COLUMNS)
      .ilike('email', escapeLike(devEmail))
      .returns<EmployeeRow[]>()
    // Treat the bypass as AUTHENTICATED even with no matching row. A developer
    // whose placeholder email has no employee record is EMPLOYEE_NOT_LINKED,
    // not UNAUTHENTICATED — returning the latter would bounce them to
    // /sign-in, where the bypass means there is nothing to sign in to.
    return resolveSelfIdentity(true, (data ?? []).map(toSelfEmployee))
  }

  if (!hasSupabaseAdminConfig()) {
    console.warn('[workforce-identity] Supabase admin env missing')
    return resolveSelfIdentity(true, [])
  }

  const supabase = createSupabaseAdminClient()

  // 1. Stable identifier.
  const { data: byClerk, error: clerkError } = await supabase
    .from('workforce_employees')
    .select(EMPLOYEE_COLUMNS)
    .eq('clerk_user_id', userId)
    .returns<EmployeeRow[]>()
  if (clerkError) {
    console.error('[workforce-identity] clerk_user_id lookup failed', clerkError)
    return resolveSelfIdentity(true, [])
  }
  if (byClerk && byClerk.length > 0) {
    return resolveSelfIdentity(true, byClerk.map(toSelfEmployee))
  }

  // 2. Email fallback.
  const user = await currentUser()
  const primary = user?.primaryEmailAddress
  const email = (
    primary?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    ''
  )
    .trim()
    .toLowerCase()
  if (!email) return resolveSelfIdentity(true, [])

  const { data: byEmail, error: emailError } = await supabase
    .from('workforce_employees')
    .select(EMPLOYEE_COLUMNS)
    .ilike('email', escapeLike(email))
    .returns<EmployeeRow[]>()
  if (emailError) {
    console.error('[workforce-identity] email lookup failed', emailError)
    return resolveSelfIdentity(true, [])
  }

  const candidates = (byEmail ?? []).map(toSelfEmployee)
  const result = resolveSelfIdentity(true, candidates)

  if (!result.ok && result.error === 'AMBIGUOUS_IDENTITY') {
    void recordAuditEvent({
      eventType: 'workforce.ambiguous_identity_detected',
      severity: 'critical',
      message: `More than one employee profile matched a signing-in account`,
      actorClerkId: userId,
      metadata: { matchCount: candidates.length },
    })
    return result
  }

  // 3. Identity repair. Clerk marks an address verified once the user has
  //    proven ownership; linking on an unverified address would let someone
  //    claim an employee row by typing their email.
  const emailVerified = primary?.verification?.status === 'verified'
  if (result.ok && canAutoLinkIdentity(candidates, emailVerified)) {
    const won = await tryLinkClerkId(result.employee.id, userId)
    if (!won) {
      // Someone else linked first. Re-resolve by the stable identifier so we
      // never proceed on a row that now belongs to another Clerk user.
      const { data: retry } = await supabase
        .from('workforce_employees')
        .select(EMPLOYEE_COLUMNS)
        .eq('clerk_user_id', userId)
        .returns<EmployeeRow[]>()
      return resolveSelfIdentity(true, (retry ?? []).map(toSelfEmployee))
    }
  }

  return result
})

/**
 * Workspace entry point. Throws with the section 2.2 copy on failure, so no
 * page ever renders a stack trace or a bare 403.
 *
 * THE IDOR INVARIANT: no public Workspace query or mutation accepts an
 * employee_id. The route boundary resolves identity first, every time.
 * Internal helpers below the boundary may take an id; the boundary may not.
 */
export async function requireSelfEmployee(): Promise<SelfEmployee> {
  const result = await getSelfIdentity()
  if (result.ok) return result.employee
  const permissions = await getCallerPermissions()
  throw new Error(
    selfIdentityMessage(result.error, hasAnyWorkforcePermission(permissions)),
  )
}

/**
 * The composite scope: Self, Team and Org together, never mutually exclusive.
 *
 * `employee` is null for an Org-only administrator, who legitimately has no
 * workforce_employees row but may still hold organisation permissions.
 */
export const getCallerScope = cache(async (): Promise<CallerScope> => {
  const [identity, permissions] = await Promise.all([
    getSelfIdentity(),
    getCallerPermissions(),
  ])

  if (!identity.ok) {
    return buildCallerScope({
      employee: null,
      access: null,
      team: EMPTY_TEAM_SCOPE,
      permissions,
    })
  }

  // Team scope is derived from the org chart, never granted. Filtering on the
  // positive status allow-list happens in deriveTeamScope.
  const supabase = createSupabaseAdminClient()
  const { data: reports, error } = await supabase
    .from('workforce_employees')
    .select('id, status')
    .eq('manager_id', identity.employee.id)
    .returns<Array<{ id: string; status: string }>>()
  if (error) {
    console.error('[workforce-identity] direct-report lookup failed', error)
  }

  return buildCallerScope({
    employee: identity.employee,
    access: identity.access,
    team: deriveTeamScope(reports ?? []),
    permissions,
  })
})
