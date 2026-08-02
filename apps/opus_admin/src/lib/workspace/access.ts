// Workspace access policy — pure, no I/O.
//
// Answers one question: given an employee's lifecycle status and whether their
// dashboard account is enabled, what may they do inside Workspace?
//
// Kept free of 'server-only' and of any Supabase/Clerk import on purpose. It is
// the single place the mapping is written down, it is unit-tested without a
// database, and both server code and client components can import it.
//
// Navigation visibility is NOT authorization. The sidebar and the Workspace
// secondary nav hide what an access state forbids, but every query and mutation
// re-derives the state server-side and enforces it again.

import { WorkspaceError, type WorkspaceErrorCode } from './errors'

/** Lifecycle states workforce_employees.status can hold. */
export const EMPLOYEE_STATUSES = [
  'Active',
  'On Leave',
  'Onboarding',
  'Resigned',
  'Suspended',
  'Terminated',
] as const

export type EmployeeLifecycleStatus = (typeof EMPLOYEE_STATUSES)[number]

export type WorkspaceAccessState =
  /** Everything: read, self-service writes, documents. */
  | 'full'
  /** Read own records and documents. No writes of any kind. */
  | 'read_only'
  /** Own documents only (payslips, letters, contracts). No tools, no writes. */
  | 'documents_only'
  /** Nothing. Workspace does not open. */
  | 'denied'

export type WorkspaceCapability =
  /** Open Workspace and read own records (tasks, reports, leave, schedule). */
  | 'workspace.read'
  /** Self-service writes: clock in/out, submit a report, raise a request. */
  | 'workspace.write'
  /** Read own employment documents. */
  | 'documents.read'
  /** Active-employee tools: time clock, tasks, reports, new requests. */
  | 'tools.use'

const CAPABILITIES: Record<WorkspaceAccessState, readonly WorkspaceCapability[]> = {
  full: ['workspace.read', 'workspace.write', 'documents.read', 'tools.use'],
  // Read own records and documents, change nothing. A suspended employee can
  // still see what is on file about them while their case is open.
  read_only: ['workspace.read', 'documents.read'],
  // No record browsing, no tools — just the documents a leaver is entitled to
  // collect. 'workspace.read' is deliberately absent: Workspace Home itself is
  // a live view of active work.
  documents_only: ['documents.read'],
  denied: [],
}

export function isEmployeeLifecycleStatus(value: unknown): value is EmployeeLifecycleStatus {
  return typeof value === 'string' && (EMPLOYEE_STATUSES as readonly string[]).includes(value)
}

export type AccessStateInput = {
  /** workforce_employees.status. Unknown values fail closed. */
  status: string
  /** workforce_employees.dashboard_access — the admin app's sign-in gate. */
  dashboardAccess: boolean
}

/**
 * Map an employee to their Workspace access state.
 *
 * Intentional choices, not defaults:
 *
 *   Active      -> full. The ordinary case.
 *   On Leave    -> full. Someone on annual or sick leave is still employed and
 *                  still needs to file a report, check a payslip, or extend
 *                  their leave. Withdrawing Workspace during leave would push
 *                  that work onto People Ops.
 *   Onboarding  -> full, with onboarding context. A new joiner's Workspace is
 *                  how they complete their checklist, so it cannot be reduced;
 *                  Home surfaces their onboarding tasks first instead.
 *   Resigned    -> documents_only. Employment has ended, so active tools go,
 *                  but a leaver keeps access to their own documents. This is
 *                  "where policy allows": if the leaver's dashboard account is
 *                  disabled, denied wins (below) and nothing opens.
 *   Suspended   -> read_only. Employment continues and the outcome is not
 *                  decided, so we withdraw the ability to act (no clocking in,
 *                  no submitting) without also withdrawing sight of their own
 *                  records while their case runs.
 *   Terminated  -> denied. Involuntary end of employment. Nothing opens; any
 *                  document a terminated employee is owed is issued by People
 *                  Ops rather than self-served.
 *
 * dashboard_access=false always wins. It is the flag People Ops toggles to cut
 * someone off immediately, and it must not be overridable by a status value.
 * An unrecognised status also lands on denied — a status this policy has not
 * been taught about is not a status it may grant access for.
 */
export function resolveAccessState(input: AccessStateInput): WorkspaceAccessState {
  if (!input.dashboardAccess) return 'denied'
  if (!isEmployeeLifecycleStatus(input.status)) return 'denied'

  switch (input.status) {
    case 'Active':
    case 'On Leave':
    case 'Onboarding':
      return 'full'
    case 'Resigned':
      return 'documents_only'
    case 'Suspended':
      return 'read_only'
    case 'Terminated':
      return 'denied'
  }
}

/** True when the employee is mid-onboarding — Home reorders around this. */
export function isOnboarding(status: string): boolean {
  return status === 'Onboarding'
}

export function capabilitiesFor(state: WorkspaceAccessState): readonly WorkspaceCapability[] {
  return CAPABILITIES[state]
}

export function can(state: WorkspaceAccessState, capability: WorkspaceCapability): boolean {
  return CAPABILITIES[state].includes(capability)
}

/**
 * The error code to raise when `capability` is refused in `state`. Distinct
 * codes so the employee is told what is actually happening — "read-only right
 * now" and "documents only" are different situations with different fixes.
 */
export function denialCodeFor(
  state: WorkspaceAccessState,
  capability: WorkspaceCapability,
): WorkspaceErrorCode {
  if (state === 'denied') return 'access_denied'
  if (state === 'documents_only') return 'documents_only'
  if (state === 'read_only') {
    // read_only can read; the only refusals it produces are writes and tools.
    return capability === 'workspace.write' ? 'read_only' : 'documents_only'
  }
  return 'access_denied'
}

/** Throw unless `state` grants `capability`. */
export function assertCapability(
  state: WorkspaceAccessState,
  capability: WorkspaceCapability,
): void {
  if (can(state, capability)) return
  throw new WorkspaceError(denialCodeFor(state, capability))
}

/** Human label for the access banner at the top of Workspace. */
export function accessStateLabel(state: WorkspaceAccessState): string {
  switch (state) {
    case 'full': return 'Full access'
    case 'read_only': return 'Read only'
    case 'documents_only': return 'Documents only'
    case 'denied': return 'No access'
  }
}
