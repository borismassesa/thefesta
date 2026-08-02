import { requirePermission } from '@/lib/admin-auth'
import CollectionPage from '../_components/CollectionPage'
import { getRequisitionRows } from '../_lib/collections'

export default async function MyRequisitionsPage() {
  await requirePermission('workforce.requisitions.read')
  const rows = await getRequisitionRows(true)
  return <CollectionPage title="My requisitions" subtitle="Requisitions where you are a hiring manager, recruiter, approver or scoped team member." rows={rows} emptyMessage="No requisitions are assigned to you." />
}
