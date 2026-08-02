import WorkforceHeading from '../_components/PageHeading'
import LeaveClient from './LeaveClient'
import { getAttendance, getEmployees } from '../_lib/queries'
import { toEmployeeLeaveView } from '../_lib/types'
import { getScopedLeaveRequests } from './_lib/queries'

export const dynamic = 'force-dynamic'

// "Today" comes from the request rather than a hard-coded date so the
// dashboard tracks the calendar. Locked to UTC date for now; we'll
// switch to TZ-aware once we wire `intl-tz` into the admin app.
function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

// Leave & Attendance. Team callers see only their direct reports; org callers
// see everyone. The scope is applied in the DATABASE query, not filtered here,
// so out-of-scope rows never reach this process.
export default async function LeavePage() {
  const today = todayDate()
  const [scoped, allEmployees, attendance] = await Promise.all([
    getScopedLeaveRequests(),
    getEmployees(),
    getAttendance(today),
  ])

  // The employee list is narrowed to the same population as the requests, so
  // a manager's filters and name lookups cannot enumerate the whole company.
  // It is also PROJECTED: passing the full Employee row to a client component
  // would serialise salary, phone, notes and clerk_user_id into the RSC
  // payload for anyone who can open this page.
  const inScope = new Set(scoped.requests.map((r) => r.employeeId))
  const employees = allEmployees
    .filter((e) => (scoped.isOrgScope ? true : inScope.has(e.id)))
    .map(toEmployeeLeaveView)

  return (
    <>
      <WorkforceHeading title="Leave & Attendance" />
      <LeaveClient
        employees={employees}
        requests={scoped.requests}
        attendance={scoped.isOrgScope ? attendance : []}
        isOrgScope={scoped.isOrgScope}
        isEmptyTeam={scoped.isEmptyTeam}
      />
    </>
  )
}
