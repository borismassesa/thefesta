import { hasPermission, requirePermission } from '@/lib/admin-auth'
import CollectionPage from '../_components/CollectionPage'
import { getRequisitionRows } from '../_lib/collections'
import RequisitionScopeFilter from './RequisitionScopeFilter'

/**
 * "Mine" was its own nine-line tab (`/my-requisitions`) calling this same
 * query with one boolean. That made a filter look like a section. It is now a
 * labeled scope control in the collection toolbar; the old route redirects in.
 */
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
      filters={<RequisitionScopeFilter mine={mine} />}
      emptyMessage={
        mine
          ? 'No requisitions are assigned to you.'
          : 'Create a requisition before publishing a vacancy so budget, ownership and approvals remain auditable.'
      }
      action={canCreate ? { href: '/workforce/recruitment/requisitions/new', label: 'New requisition' } : undefined}
    />
  )
}
