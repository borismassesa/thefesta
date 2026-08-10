import Link from 'next/link'
import { hasPermission, requirePermission } from '@/lib/admin-auth'
import CollectionPage from '../_components/CollectionPage'
import { getRequisitionRows } from '../_lib/collections'

/**
 * "Mine" was its own nine-line tab (`/my-requisitions`) calling this same
 * query with one boolean. That made a filter look like a section, and gave it
 * the same weight in the nav as Applications. It is a scope switch here now,
 * and the old route redirects in.
 */
function ScopeTabs({ mine }: { mine: boolean }) {
  const tab = 'inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-semibold transition-colors'
  const on = 'bg-gray-100 text-gray-900'
  const off = 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
  return (
    <nav aria-label="Requisition scope" className="flex gap-1">
      <Link href="/workforce/recruitment/requisitions" aria-current={mine ? undefined : 'page'} className={`${tab} ${mine ? off : on}`}>
        All requisitions
      </Link>
      <Link href="/workforce/recruitment/requisitions?mine=1" aria-current={mine ? 'page' : undefined} className={`${tab} ${mine ? on : off}`}>
        Mine
      </Link>
    </nav>
  )
}

export default async function RequisitionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requirePermission('workforce.requisitions.read')
  const [params, canCreate] = await Promise.all([searchParams, hasPermission('workforce.requisitions.create')])
  const mine = params.mine === '1'
  const rows = await getRequisitionRows(mine)
  return (
    <CollectionPage
      title="Requisitions"
      subtitle={
        mine
          ? 'Requisitions where you are a hiring manager, recruiter, approver or scoped team member.'
          : 'Internal requests, approval routing, openings and hiring ownership.'
      }
      rows={rows}
      filters={<ScopeTabs mine={mine} />}
      emptyMessage={
        mine
          ? 'No requisitions are assigned to you.'
          : 'Create a requisition before publishing a vacancy so budget, ownership and approvals remain auditable.'
      }
      action={canCreate ? { href: '/workforce/recruitment/requisitions/new', label: 'New requisition' } : undefined}
    />
  )
}
