// ---------------------------------------------------------------------------
// Segregation of duties + Team resource scope — PURE.
// ---------------------------------------------------------------------------
// Implements sections 2.7, 2.8, 3.3 and 4.1 of
// docs/WORKSPACE_WORKFORCE_ARCHITECTURE.md.

import type { PermissionKey } from './permissions'
import type { CallerScope } from './scope'

// ---------------------------------------------------------------------------
// Self-approval (spec 4.1)
// ---------------------------------------------------------------------------
// A RECORD-LEVEL rule that overrides Org permission. Nobody approves their own
// leave, their own attendance correction, or their own timesheet, even holding
// an org-wide approval key. Any owner override, if one is ever added, requires
// a stated reason and an audit event.

export type ApprovableRecord = {
  /** The employee the record is ABOUT, not who submitted it. */
  employeeId: string
}

export function isSelfApproval(
  record: ApprovableRecord,
  scope: Pick<CallerScope, 'employee'>,
): boolean {
  return scope.employee !== null && record.employeeId === scope.employee.id
}

export type ApprovalDecision =
  | { allowed: true }
  | { allowed: false; reason: string }

/**
 * May this caller approve this record?
 *
 * Order matters. The self-approval check runs FIRST, before any permission is
 * consulted, so that holding an org-wide approval key cannot buy you your own
 * signature.
 *
 * Team scope authorises approval for direct reports only, which is why a
 * manager needs no Workforce permission key to run their approval lane.
 */
export function canApprove(
  record: ApprovableRecord,
  scope: CallerScope,
  orgPermission: PermissionKey,
): ApprovalDecision {
  if (isSelfApproval(record, scope)) {
    return {
      allowed: false,
      reason: 'You cannot approve your own request. Ask your manager or People Ops.',
    }
  }
  if (scope.permissions.has(orgPermission)) return { allowed: true }
  if (scope.team.directReportIds.includes(record.employeeId)) return { allowed: true }
  return {
    allowed: false,
    reason: 'You can only approve requests for your own direct reports.',
  }
}

// ---------------------------------------------------------------------------
// Team resource scope (spec 2.8)
// ---------------------------------------------------------------------------

/**
 * Can this caller act on this employee's records at all?
 *
 * The single place that answers "is this person in my scope". Team scope is
 * `directReportIds` ONLY in Phase 0; the reserved delegation fields on
 * TeamScope are always empty and are deliberately not consulted here.
 */
export function canActOnEmployee(
  scope: CallerScope,
  targetEmployeeId: string,
  orgPermission: PermissionKey,
): boolean {
  if (scope.permissions.has(orgPermission)) return true
  return scope.team.directReportIds.includes(targetEmployeeId)
}

/**
 * Narrow a requested employee-id filter to what the caller may actually see.
 *
 * Query parameters NEVER grant authority. `?scope=team`, `?employeeId=` and
 * `?departmentId=` are presentation preferences: they may narrow an
 * already-authorised result set, never widen it. This function is the
 * mechanism that guarantees it.
 *
 * `null` requested means "everything I'm allowed to see".
 */
export function narrowEmployeeFilter(
  scope: CallerScope,
  requestedEmployeeIds: readonly string[] | null,
  orgPermission: PermissionKey,
): { scopeAll: true } | { scopeAll: false; employeeIds: string[] } {
  const hasOrg = scope.permissions.has(orgPermission)
  if (hasOrg) {
    return requestedEmployeeIds === null
      ? { scopeAll: true }
      : { scopeAll: false, employeeIds: [...requestedEmployeeIds] }
  }
  const allowed = new Set(scope.team.directReportIds)
  if (requestedEmployeeIds === null) {
    return { scopeAll: false, employeeIds: [...allowed] }
  }
  // Intersection, never union: a requested id outside scope is dropped, not
  // honoured.
  return {
    scopeAll: false,
    employeeIds: requestedEmployeeIds.filter((id) => allowed.has(id)),
  }
}

// ---------------------------------------------------------------------------
// Task authority (spec 3.3)
// ---------------------------------------------------------------------------
// Self  — complete and update own tasks, NO key required
// Team  — manage tasks for direct reports
// Org   — manage organisation-wide tasks, via workforce.tasks.assign
//
// This NARROWS live behaviour: task-scope.ts:42 currently returns
// { canAssignAll: false, department } to anyone with one non-Resigned direct
// report, and tasks/page.tsx:30-38 then scopes to that whole department.
// Production check found zero users relying on it (all four managers with
// reports hold workforce.write, so they already take the canAssignAll path).

export type TaskRef = {
  /** Employee the task is assigned to. */
  assigneeId: string
}

/** Completing your OWN task requires no permission at all. */
export function canCompleteTask(
  task: TaskRef,
  scope: Pick<CallerScope, 'employee'>,
): boolean {
  return scope.employee !== null && task.assigneeId === scope.employee.id
}

/**
 * Create, edit, reassign, reopen or cancel a task.
 *
 * Completing a task ON BEHALF OF another employee counts as management and
 * requires workforce.tasks.assign; it is audited at the call site.
 */
export function canManageTask(task: TaskRef, scope: CallerScope): boolean {
  return canActOnEmployee(scope, task.assigneeId, 'workforce.tasks.assign')
}
