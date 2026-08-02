import { hasPermission } from '@/lib/admin-auth'
import { workspaceErrorCode } from '@/lib/workspace/errors'
import { requireWorkspaceCapability } from '@/lib/workspace/guards'
import {
  getApprovalQueue,
  getHolidays,
  getLeaveTypes,
  getMyBalances,
  getMyRequests,
  getTeamAvailability,
  getUpcomingLeave,
} from '@/lib/leave/queries'
import { addDays } from '@/lib/leave/days'
import AccessNotice from '../_components/AccessNotice'
import WorkspaceHeading from '../_components/WorkspaceHeading'
import LeaveClient from './LeaveClient'
import { cancelRequest, createRequest, decideRequest, submitRequest } from './actions'

export const dynamic = 'force-dynamic'

// Leave: balances, requests, the team calendar and the approval queue.
//
// Every read is scoped to the resolved employee. The one exception is team
// availability, which returns colleagues but only whether they are in, never
// why: "on leave" is fine to share, "bereavement leave" is not.
export default async function LeavePage() {
  let context
  try {
    context = await requireWorkspaceCapability('tools.use', { action: 'leave.view' })
  } catch (error) {
    return (
      <>
        <WorkspaceHeading title="Leave" />
        <AccessNotice code={workspaceErrorCode(error)} />
      </>
    )
  }

  const { employee } = context
  const today = new Date().toISOString().slice(0, 10)
  const isHr = await hasPermission('workforce.write')

  const [types, balances, requests, upcoming, holidays, availability, queue] = await Promise.all([
    getLeaveTypes(),
    getMyBalances(employee),
    getMyRequests(employee),
    getUpcomingLeave(employee),
    getHolidays(`${today.slice(0, 4)}-01-01`, `${today.slice(0, 4)}-12-31`),
    getTeamAvailability(employee, today, addDays(today, 27)),
    getApprovalQueue(employee, { isHr }),
  ])

  return (
    <>
      <WorkspaceHeading
        title="Leave"
        subtitle="Your balances, your requests, and who is in over the next four weeks."
      />
      <LeaveClient
        today={today}
        types={types}
        balances={balances}
        requests={requests}
        upcoming={upcoming}
        holidays={holidays}
        availability={availability}
        approvalQueue={queue}
        isHr={isHr}
        actions={{ createRequest, submitRequest, decideRequest, cancelRequest }}
      />
    </>
  )
}
