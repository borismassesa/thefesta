// Pure task-scope policy. NO imports, and deliberately NOT `server-only`.
//
// task-scope.ts does the I/O (resolving the caller, fetching direct reports)
// and must stay server-only. The decision itself lives here so it can be
// unit-tested under `tsx --test`: importing a module that pulls in
// `server-only` from a plain node test throws at load time.
//
// Same split as lib/workforce/*: adapters fetch, policy decides.

export type CallerScope =
  | { canAssignAll: true; employeeId: string | null }
  | { canAssignAll: false; reportIds: string[]; employeeId: string }

/**
 * Is this employee inside the caller's task-management scope?
 *
 * Team tier is directReportIds ONLY. This narrowed live behaviour: a manager
 * previously gained authority over their entire DEPARTMENT on the strength of
 * one direct report, so they could manage tasks for peers who did not report
 * to them. Department-wide reach now requires workforce.tasks.assign.
 *
 * Note the caller's own id is not in reportIds, so self-assignment is denied
 * here like anyone else out of scope. Completing your OWN task is a separate,
 * unpermissioned path — see canCompleteTask in lib/workforce/approvals.ts.
 */
export function isInTaskScope(scope: CallerScope, employeeId: string): boolean {
  return scope.canAssignAll || scope.reportIds.includes(employeeId)
}
