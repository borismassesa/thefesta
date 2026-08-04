import 'server-only'
import { recordAuditEvent } from '@/lib/audit-log'
import { logDbError } from '@/lib/log-safe'
import { assertCapability, can, type WorkspaceAccessState, type WorkspaceCapability } from './access'
import { WorkspaceError, toSafeMessage, type WorkspaceErrorCode } from './errors'
import { getWorkspaceSession, type WorkspaceEmployee, type WorkspaceSession } from './identity'

// The authorization helpers every Workspace query and mutation goes through.
//
// The contract, in one line: a Workspace server action may not touch a row
// until it has called one of these and been handed an employee id.
//
// Two layers, both mandatory:
//   1. Identity — resolved from the Clerk session (identity.ts), never from the
//      request payload.
//   2. Access state — derived from employment status + dashboard_access
//      (access.ts), re-checked on every call rather than trusted from the
//      layout that rendered the page.
//
// Hidden navigation is not a third layer. It is a courtesy.

export type WorkspaceContext = {
  employee: WorkspaceEmployee
  access: WorkspaceAccessState
  onboarding: boolean
}

/**
 * Resolve the caller, or throw a WorkspaceError whose message is safe to render.
 * Does not check capabilities — use requireWorkspaceCapability for that.
 */
export async function requireWorkspaceContext(): Promise<WorkspaceContext> {
  let session: WorkspaceSession
  try {
    session = await getWorkspaceSession()
  } catch (error) {
    // Supabase or Clerk fell over. The employee gets 'unavailable'; the real
    // error goes to the log with its SQLSTATE and nothing else.
    logDbError('workspace.session', error)
    throw new WorkspaceError('unavailable')
  }

  switch (session.status) {
    case 'unauthenticated':
      throw new WorkspaceError('not_signed_in')
    case 'unresolved':
      throw new WorkspaceError(session.code)
    case 'resolved':
      return {
        employee: session.employee,
        access: session.access,
        onboarding: session.onboarding,
      }
  }
}

/**
 * Resolve the caller AND enforce a capability. The return value carries the
 * employee id — which is the only id a Workspace action may use.
 *
 * Denials are audited before throwing: "someone with documents-only access
 * tried to clock in" is exactly the event an audit trail is for.
 */
export async function requireWorkspaceCapability(
  capability: WorkspaceCapability,
  context?: { action?: string },
): Promise<WorkspaceContext> {
  const ctx = await requireWorkspaceContext()
  if (can(ctx.access, capability)) return ctx

  void recordAuditEvent({
    eventType: 'workspace.capability_denied',
    severity: 'warn',
    message: `Workspace denied ${capability} for ${ctx.employee.employeeCode}`,
    actorClerkId: ctx.employee.clerkUserId,
    targetResource: `workforce_employees:${ctx.employee.id}`,
    metadata: {
      employeeId: ctx.employee.id,
      capability,
      accessState: ctx.access,
      employeeStatus: ctx.employee.status,
      action: context?.action ?? null,
    },
    resolveActor: false,
  })

  // assertCapability picks the code that describes the actual situation
  // ('read_only' vs 'documents_only' vs 'access_denied').
  assertCapability(ctx.access, capability)
  // Unreachable — assertCapability throws whenever `can` was false.
  throw new WorkspaceError('access_denied')
}

/** Sugar for the two most common gates. */
export function requireWorkspaceRead(action?: string): Promise<WorkspaceContext> {
  return requireWorkspaceCapability('workspace.read', { action })
}

export function requireWorkspaceWrite(action?: string): Promise<WorkspaceContext> {
  return requireWorkspaceCapability('workspace.write', { action })
}

export type WorkspaceActionResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string; code: WorkspaceErrorCode }

/**
 * Wrap a Workspace server action so no raw error can escape to the browser.
 *
 * Every mutation exported to a client component should be the body passed to
 * this. WorkspaceErrors keep their (fixed, safe) message; anything else — a
 * PostgREST unique violation carrying the colliding value, a Resend error
 * echoing a recipient, a TypeError with a file path — collapses to the generic
 * 'unavailable' line, and the real error is logged by SQLSTATE only.
 */
export async function runWorkspaceAction<T extends object>(
  operation: string,
  body: () => Promise<T>,
): Promise<WorkspaceActionResult<T>> {
  try {
    const result = await body()
    return { ok: true, ...result }
  } catch (error) {
    if (!(error instanceof WorkspaceError)) {
      logDbError(`workspace.${operation}`, error)
    }
    return {
      ok: false,
      error: toSafeMessage(error),
      code: error instanceof WorkspaceError ? error.code : 'unavailable',
    }
  }
}
