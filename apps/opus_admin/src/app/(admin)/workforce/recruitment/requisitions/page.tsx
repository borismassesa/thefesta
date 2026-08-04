import { hasPermission, requirePermission } from '@/lib/admin-auth'
import CollectionPage from '../_components/CollectionPage'
import { getRequisitionRows } from '../_lib/collections'

export default async function RequisitionsPage() {
  await requirePermission('workforce.requisitions.read')
  const [rows, canCreate] = await Promise.all([
    getRequisitionRows(),
    hasPermission('workforce.requisitions.create'),
  ])
  return <CollectionPage title="Requisitions" subtitle="Internal requests, approval routing, openings and hiring ownership." rows={rows} emptyMessage="Create a requisition before publishing a vacancy so budget, ownership and approvals remain auditable." action={canCreate ? { href: '/workforce/recruitment/requisitions/new', label: 'New requisition' } : undefined} />
}
