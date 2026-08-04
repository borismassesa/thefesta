import { requirePermission } from '@/lib/admin-auth'
import CollectionPage from '../_components/CollectionPage'
import { getAssessmentRows } from '../_lib/collections'

export default async function AssessmentsPage() {
  await requirePermission('workforce.assessments.read')
  const rows = await getAssessmentRows()
  return <CollectionPage title="Assessments" subtitle="Assignments, candidate submissions and structured rubric reviews." rows={rows} emptyMessage="Create an assessment template, then assign it to an application." />
}
