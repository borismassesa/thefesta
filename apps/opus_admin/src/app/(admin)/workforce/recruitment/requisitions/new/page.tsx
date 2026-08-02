import WorkforceHeading from '../../../_components/PageHeading'
import { requirePermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import RequisitionForm from './RequisitionForm'

export default async function NewRequisitionPage() {
  await requirePermission('workforce.requisitions.create')
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_employees')
    .select('id, full_name, job_title, department')
    .in('status', ['Active', 'Onboarding'])
    .order('full_name')
  if (error) throw error
  const employees = (data ?? []).map((employee) => ({
    id: employee.id,
    name: employee.full_name,
    jobTitle: employee.job_title,
    department: employee.department,
  }))
  return (
    <>
      <WorkforceHeading title="New requisition" subtitle="Start with the internal hiring need. Approval must finish before a public job can be published." />
      <RequisitionForm employees={employees} />
    </>
  )
}
