import { workspaceErrorCode } from '@/lib/workspace/errors'
import { requireWorkspaceCapability } from '@/lib/workspace/guards'
import {
  getMyObligations,
  getMySubmissions,
  getReportCatalogue,
  getReviewQueue,
} from '@/lib/reports/queries'
import AccessNotice from '../_components/AccessNotice'
import WorkspaceHeading from '../_components/WorkspaceHeading'
import ReportsClient from './ReportsClient'
import { startReport } from './actions'

export const dynamic = 'force-dynamic'

// The reports hub: catalogue, what is due, drafts, filed, returned, history,
// and anything waiting on this person as a reviewer.
//
// Every list is loaded scoped to the resolved employee. There is no id in any
// of these calls that came from the request.
export default async function ReportsPage() {
  let context
  try {
    context = await requireWorkspaceCapability('tools.use', { action: 'reports.view' })
  } catch (error) {
    return (
      <>
        <WorkspaceHeading title="Reports" />
        <AccessNotice code={workspaceErrorCode(error)} />
      </>
    )
  }

  const { employee } = context
  const [catalogue, obligations, drafts, filed, returned, history, reviewQueue] =
    await Promise.all([
      getReportCatalogue(employee),
      getMyObligations(employee),
      getMySubmissions(employee, ['draft']),
      getMySubmissions(employee, ['submitted', 'under_review', 'resubmitted']),
      getMySubmissions(employee, ['returned']),
      getMySubmissions(employee, ['accepted', 'locked', 'cancelled', 'waived']),
      getReviewQueue(employee),
    ])

  return (
    <>
      <WorkspaceHeading
        title="Reports"
        subtitle="What you owe, what you have filed, and what is waiting on you."
      />
      <ReportsClient
        catalogue={catalogue}
        obligations={obligations}
        drafts={drafts}
        filed={filed}
        returned={returned}
        history={history}
        reviewQueue={reviewQueue}
        startReport={startReport}
      />
    </>
  )
}
