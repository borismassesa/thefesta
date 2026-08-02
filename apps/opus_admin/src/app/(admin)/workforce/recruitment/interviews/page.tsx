import { requirePermission } from '@/lib/admin-auth'
import CollectionPage from '../_components/CollectionPage'
import { getInterviewRows } from '../_lib/collections'

export default async function InterviewsPage() {
  await requirePermission('workforce.interviews.read')
  const rows = await getInterviewRows()
  return <CollectionPage title="Interviews" subtitle="Candidate availability, interview kits, participants, rooms and feedback." rows={rows} emptyMessage="Scheduled interviews within your assigned hiring scope will appear here." />
}
