import Link from 'next/link'
import {
  CalendarDays,
  ClipboardCheck,
  Clock,
  FileText,
  ListTodo,
  Plane,
} from 'lucide-react'
import { getCallerPermissions } from '@/lib/admin-auth'
import { requireSelfEmployee } from '@/lib/workforce/identity'
import { getSelfIdentity } from '@/lib/workforce/identity'
import { workspaceNavFor } from '@/lib/workforce/scope'
import {
  getAssignedTasksForEmployee,
  getEmployeeById,
  getLeaveRequests,
  getReportsForEmployee,
  getTimeClockStatus,
} from '../workforce/_lib/queries'
import { WORKSPACE_ROUTES } from './_lib/routes'
import { QuickActions, StatTile, TileGrid } from './_components/HomeTiles'

export const dynamic = 'force-dynamic'

const TZ = 'Africa/Dar_es_Salaam'

function greeting(nowHour: number): string {
  if (nowHour < 12) return 'Good morning'
  if (nowHour < 17) return 'Good afternoon'
  return 'Good evening'
}

function hourInTz(): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      hour: '2-digit',
      hour12: false,
    }).format(new Date()),
  )
}

function timeInTz(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

// ---------------------------------------------------------------------------
// Workspace Home — the one screen that answers "what do I need to do today?"
// ---------------------------------------------------------------------------
// Every figure here is real. Where a surface does not exist yet (Calendar in
// Phase 5, Documents in Phase 6) the tile is omitted rather than stubbed with
// a placeholder number, because a dashboard that invents data is worse than a
// smaller dashboard.
export default async function WorkspaceHomePage() {
  const employee = await requireSelfEmployee()
  const identity = await getSelfIdentity()
  const access = identity.ok ? identity.access : 'denied'
  const visible = new Set(workspaceNavFor(access))

  // documents_only (a resigned employee) gets the greeting and nothing that
  // implies they can still act.
  const canAct = access === 'full'

  const [record, clock, tasks, reports, allLeave, permissions] = await Promise.all([
    getEmployeeById(employee.id),
    getTimeClockStatus(employee.id),
    canAct ? getAssignedTasksForEmployee(employee.id) : Promise.resolve([]),
    getReportsForEmployee(employee.id),
    getLeaveRequests(),
    getCallerPermissions(),
  ])

  const openTasks = tasks.filter((t) => t.status === 'Todo' || t.status === 'In Progress')
  const draftReports = reports.filter((r) => r.status === 'draft')
  const myLeave = allLeave.filter((l) => l.employeeId === employee.id)
  const pendingLeave = myLeave.filter((l) => l.status === 'Pending')

  // The tracker is only meaningful for an MD who owns an engine, so it is
  // shown on the permission rather than to everyone.
  const isTrackerWriter = ['opusfesta', 'opusstudio', 'opuspass'].some((e) =>
    permissions.has(`md_tracker.${e}.write`),
  )

  const firstName = employee.fullName.split(/\s+/)[0] ?? employee.fullName

  return (
    <div className="pb-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          {greeting(hourInTz())}, {firstName}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {access === 'documents_only'
            ? 'Your records stay available here.'
            : "Here is where things stand today."}
        </p>
      </header>

      <TileGrid>
        {visible.has('time-clock') && (
          <StatTile
            icon={Clock}
            label="Time Clock"
            value={clock.isClockedIn ? 'Clocked in' : 'Clocked out'}
            detail={
              clock.isClockedIn && clock.sinceIso
                ? `Since ${timeInTz(clock.sinceIso)}`
                : clock.lastPunch
                  ? `Last punch ${timeInTz(clock.lastPunch.punchAt)}`
                  : 'No punches yet'
            }
            href={WORKSPACE_ROUTES['time-clock']}
            tone={clock.isClockedIn ? 'active' : 'neutral'}
          />
        )}

        {visible.has('tasks') && canAct && (
          <StatTile
            icon={ListTodo}
            label="My Tasks"
            value={String(openTasks.length)}
            detail={openTasks.length === 1 ? 'task open' : 'tasks open'}
            href={WORKSPACE_ROUTES.tasks}
          />
        )}

        {visible.has('leave') && (
          <StatTile
            icon={Plane}
            label="Leave Balance"
            value={`${record?.leaveBalanceDays ?? 0}`}
            detail={
              pendingLeave.length > 0
                ? `days left, ${pendingLeave.length} request awaiting approval`
                : 'days left'
            }
            href={WORKSPACE_ROUTES.leave}
            comingSoon
          />
        )}

        {visible.has('reports') && (
          <StatTile
            icon={FileText}
            label="My Reports"
            value={String(draftReports.length)}
            detail={draftReports.length === 1 ? 'draft to finish' : 'drafts to finish'}
            href={WORKSPACE_ROUTES.reports}
          />
        )}

        {visible.has('tracker') && isTrackerWriter && (
          <StatTile
            icon={ClipboardCheck}
            label="My Tracker"
            value="Today"
            detail="Log today's progress"
            href={WORKSPACE_ROUTES.tracker}
          />
        )}

        {visible.has('calendar') && (
          <StatTile
            icon={CalendarDays}
            label="Calendar"
            value="Soon"
            detail="Leave, shifts and deadlines in one view"
            href={WORKSPACE_ROUTES.calendar}
            comingSoon
          />
        )}
      </TileGrid>

      {canAct && (
        <QuickActions
          isClockedIn={clock.isClockedIn}
          showTracker={isTrackerWriter}
        />
      )}
    </div>
  )
}
