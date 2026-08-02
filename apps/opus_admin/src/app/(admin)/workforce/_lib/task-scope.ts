import 'server-only'
import { hasPermission } from '@/lib/admin-auth'
import { getCallerScope as getWorkforceScope } from '@/lib/workforce/identity'
// The decision itself is pure and lives next door so it stays unit-testable;
// re-exported here so existing call sites keep one import.
import { isInTaskScope, type CallerScope } from './task-scope-policy'

export { isInTaskScope }
export type { CallerScope }

// Who may assign tasks, and how widely (spec 3.3):
//
//   Self  — complete and update your own tasks, NO key required
//   Team  — manage tasks for your DIRECT REPORTS
//   Org   — manage organisation-wide tasks, via workforce.tasks.assign
//           (workforce.write still expands into it for compatibility)
//
// Shared by the /workforce/tasks page (to scope the form + list) and the
// server actions (to enforce the gate). Both must agree, hence one module.
//
// THIS NARROWS LIVE BEHAVIOUR. Previously a manager tier was granted to anyone
// with at least one non-Resigned direct report, and it conferred authority
// over their ENTIRE DEPARTMENT — so one report was enough to manage tasks for
// every colleague in the same department, including peers who did not report
// to them. Team scope is now directReportIds only, matching every other
// Workforce module, and department-wide reach requires the explicit
// workforce.tasks.assign key.
//
// Identity resolution now comes from the shared resolver rather than a local
// ilike('email') lookup, so it keys on clerk_user_id and cannot resolve to the
// wrong employee.

export async function getCallerScope(): Promise<CallerScope | null> {
  // workforce.tasks.assign is the real key; workforce.write expands into it,
  // so existing owners/admins/People Ops keep the org tier unchanged.
  const [canAssignAll, scope] = await Promise.all([
    hasPermission('workforce.tasks.assign'),
    getWorkforceScope(),
  ])

  if (canAssignAll) return { canAssignAll: true, employeeId: scope.employee?.id ?? null }
  if (!scope.employee) return null

  // deriveTeamScope already filters to TEAM_MEMBER_STATUSES, so a resigned
  // report no longer confers authority.
  const reportIds = scope.team.directReportIds
  if (reportIds.length === 0) return null

  return { canAssignAll: false, reportIds: [...reportIds], employeeId: scope.employee.id }
}
