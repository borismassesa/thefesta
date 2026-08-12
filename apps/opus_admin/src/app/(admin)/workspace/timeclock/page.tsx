import { workspaceErrorCode } from '@/lib/workspace/errors'
import { requireWorkspaceCapability } from '@/lib/workspace/guards'
import { getAttendanceOverview, getPunchHistory } from '@/lib/attendance/queries'
import AccessNotice from '../_components/AccessNotice'
import WorkspaceHeading from '../_components/WorkspaceHeading'
import TimeclockClient from './TimeclockClient'
import { clockIn, clockOut, endBreak, requestCorrection, startBreak, submitTimesheet } from './actions'

export const dynamic = 'force-dynamic'

// My Clock — the employee's own punch face and day record.
//
// Every number on this page was computed server-side against the database
// clock. The client re-renders a counter from `serverNow`, and that is the only
// thing the browser's clock is allowed to touch.
export default async function TimeclockPage() {
  let context
  try {
    context = await requireWorkspaceCapability('tools.use', { action: 'timeclock.view' })
  } catch (error) {
    return (
      <>
        <WorkspaceHeading title="My Clock" />
        <AccessNotice code={workspaceErrorCode(error)} />
      </>
    )
  }

  const [overview, punches] = await Promise.all([
    getAttendanceOverview(context.employee),
    getPunchHistory(context.employee, 60),
  ])

  return (
    <>
      <WorkspaceHeading
        title="My Clock"
        subtitle="Are you on the clock, and how does today look against your 9–5?"
      />
      <TimeclockClient
        employeeName={context.employee.name}
        overview={overview}
        punches={punches}
        actions={{
          clockIn,
          clockOut,
          startBreak,
          endBreak,
          requestCorrection,
          submitTimesheet,
        }}
      />
    </>
  )
}
