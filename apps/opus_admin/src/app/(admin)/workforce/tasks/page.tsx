import WorkforceHeading from '../_components/PageHeading'
import { getEmployees, getTaskAssignments } from '../_lib/queries'
import { getCallerScope } from '../_lib/task-scope'
import { DEPARTMENTS, type Department } from '../_lib/types'
import TasksClient from './TasksClient'
import { createAssignment, deleteAssignment, setAssignmentActive } from './actions'

export const dynamic = 'force-dynamic'

// Admin task-assignment surface. The (admin)/workforce layout gates this
// on workforce.read, so viewers/managers can reach it. Whether the assign
// form shows — and how wide the target options are — depends on the
// caller's scope (full vs. own-department manager). The server actions
// re-check scope, so this is presentation only.

const TZ = 'Africa/Dar_es_Salaam'

function todayInTz(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export default async function TasksPage() {
  const scope = await getCallerScope()
  // Team tier is direct reports only. A manager can no longer reach every
  // colleague who happens to share their department.
  const reportIds = scope && !scope.canAssignAll ? new Set(scope.reportIds) : null

  const [assignments, allEmployees] = await Promise.all([
    getTaskAssignments(),
    getEmployees(),
  ])

  const employeeOptions = allEmployees
    .filter((e) => (reportIds ? reportIds.has(e.id) : true))
    .map((e) => ({ id: e.id, name: e.name, department: e.department }))

  // Department targeting is an ORG capability: it assigns to everyone in a
  // department, which by definition exceeds a manager's direct reports. Team
  // tier gets no department options at all, rather than a single option that
  // would over-assign.
  const departmentOptions: Department[] = scope?.canAssignAll ? DEPARTMENTS : []

  // Presentation only. The list is filtered here so a manager is not shown
  // assignments they cannot act on, but actions.ts re-checks every target.
  const visibleAssignments = reportIds
    ? assignments.filter(
        (a) => a.targetEmployeeId !== null && reportIds.has(a.targetEmployeeId),
      )
    : assignments

  const subtitle = scope
    ? scope.canAssignAll
      ? 'Assign one-off or recurring tasks to anyone or any department.'
      : `Assign tasks to your ${scope.reportIds.length} direct report${scope.reportIds.length === 1 ? '' : 's'}.`
    : 'You have view-only access to task assignments.'

  return (
    <div className="pb-12">
      <WorkforceHeading title="Tasks" subtitle={subtitle} />
      <div className="pt-6">
        <TasksClient
          assignments={visibleAssignments}
          employees={employeeOptions}
          departments={departmentOptions}
          canAssign={Boolean(scope)}
          today={todayInTz()}
          actions={{ create: createAssignment, setActive: setAssignmentActive, remove: deleteAssignment }}
        />
      </div>
    </div>
  )
}
