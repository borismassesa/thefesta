import { redirect } from 'next/navigation'
import { hasPermission } from '@/lib/admin-auth'
import DigitalCardsNavTabs from '../DigitalCardsNavTabs'
import SetDigitalCardsHeading from '../SetDigitalCardsHeading'
import { getDesignQueue } from './queries'
import { summariseQueue } from './types'
import DesignQueueClient from './DesignQueueClient'

export const dynamic = 'force-dynamic'

export default async function CardDesignerQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; view?: string }>
}) {
  if (!(await hasPermission('cms.read'))) redirect('/')

  const [{ status, view }, jobs, canWrite] = await Promise.all([
    searchParams,
    getDesignQueue(),
    hasPermission('cms.write'),
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
        />
      </div>
    </>
  )
}
