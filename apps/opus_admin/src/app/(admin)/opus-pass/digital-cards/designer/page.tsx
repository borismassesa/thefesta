import { redirect } from 'next/navigation'
import { getCallerEmployeeId, hasPermission } from '@/lib/admin-auth'
import DigitalCardsNavTabs from '../DigitalCardsNavTabs'
import SetDigitalCardsHeading from '../SetDigitalCardsHeading'
import { getDesignQueue } from './queries'
import { summariseQueue } from './types'
import DesignQueueClient from './DesignQueueClient'

export const dynamic = 'force-dynamic'

export default async function CardDesignerQueuePage({
  searchParams,
}: {
  // `q` prefills the queue's search. It exists so other surfaces can link to
  // the work for one order rather than dumping the reader on the whole queue
  // to find it by eye — Orders & Fulfilment does exactly that.
  searchParams: Promise<{ status?: string; view?: string; q?: string }>
}) {
  if (!(await hasPermission('digitalcards.read'))) redirect('/')

  const [{ status, view, q }, jobs, canWrite, myEmployeeId] = await Promise.all([
    searchParams,
    getDesignQueue(),
    hasPermission('digitalcards.write'),
    // Drives "Mine" vs a colleague's name on each row. Null for an owner or
    // admin who has no employee record; the queue then simply never says
    // "Mine", which is accurate — nothing can be assigned to them.
    getCallerEmployeeId(),
  ])

  return (
    <>
      <SetDigitalCardsHeading />
      <DigitalCardsNavTabs />
      <div className="px-8 pt-6 pb-6">
        <DesignQueueClient
          jobs={jobs}
          summary={summariseQueue(jobs)}
          activeStatus={status ?? ''}
          view={view === 'table' ? 'table' : 'list'}
          canWrite={canWrite}
          myEmployeeId={myEmployeeId}
          initialQuery={q ?? ''}
        />
      </div>
    </>
  )
}
