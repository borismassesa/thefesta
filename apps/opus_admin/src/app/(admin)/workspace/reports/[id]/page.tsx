import { notFound } from 'next/navigation'
import { hasPermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/supabase'
import { workspaceErrorCode } from '@/lib/workspace/errors'
import { requireWorkspaceCapability } from '@/lib/workspace/guards'
import { getReportDetail } from '@/lib/reports/queries'
import { allFields } from '@/lib/reports/fields'
import AccessNotice from '../../_components/AccessNotice'
import WorkspaceHeading from '../../_components/WorkspaceHeading'
import ReportDetailClient from './ReportDetailClient'
import { addComment, reviewReport, saveDraft, submitReport } from '../actions'
import type { FieldOptions } from '../_components/FieldInput'

export const dynamic = 'force-dynamic'

// One report: the form while it is editable, the filed versions once it is not,
// the review trail, and the actions available to whoever is looking.
//
// getReportDetail returns null unless the caller is the author or a named
// recipient, so an unauthorized id is a 404 rather than a permission message
// that confirms the report exists.
export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let context
  try {
    context = await requireWorkspaceCapability('workspace.read', { action: 'reports.detail' })
  } catch (error) {
    return (
      <>
        <WorkspaceHeading title="Report" />
        <AccessNotice code={workspaceErrorCode(error)} />
      </>
    )
  }

  const isAdmin = await hasPermission('workforce.write')
  const detail = await getReportDetail(context.employee, id, { asAdmin: isAdmin })
  if (!detail) notFound()

  // Options for the entity pickers. Only loaded when the definition actually
  // uses one, so a plain text report does not pull the whole directory.
  const types = new Set(allFields(detail.definition).map((f) => f.type))
  const options = await loadFieldOptions(types)

  return (
    <>
      <WorkspaceHeading
        title={detail.submission.templateName}
        subtitle={detail.submission.periodLabel}
      />
      <ReportDetailClient
        detail={detail}
        isAdmin={isAdmin}
        options={options}
        actions={{ saveDraft, submitReport, reviewReport, addComment }}
      />
    </>
  )
}

async function loadFieldOptions(types: Set<string>): Promise<FieldOptions> {
  const empty: FieldOptions = { employees: [], departments: [], projects: [], tasks: [] }
  if (!hasSupabaseAdminConfig()) return empty

  const supabase = createSupabaseAdminClient()
  const [employees, projects, tasks] = await Promise.all([
    types.has('employee_select')
      ? supabase
          .from('workforce_employees')
          .select('id, full_name')
          .in('status', ['Active', 'On Leave', 'Onboarding'])
          .order('full_name')
          .returns<{ id: string; full_name: string }[]>()
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    types.has('project_select')
      ? supabase
          .from('projects')
          .select('id, name')
          .eq('status', 'active')
          .order('name')
          .returns<{ id: string; name: string }[]>()
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    types.has('task_select')
      ? supabase
          .from('workforce_tasks')
          .select('id, title')
          .in('status', ['Todo', 'In Progress'])
          .order('title')
          .limit(200)
          .returns<{ id: string; title: string }[]>()
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ])

  return {
    employees: (employees.data ?? []).map((e) => ({ value: e.id, label: e.full_name })),
    // Departments are a CHECK constraint rather than a table, so the list is
    // the constraint's contents. Kept in step with workforce/_lib/types.ts.
    departments: types.has('department_select')
      ? [
          'Technology',
          'Marketing & Partnership',
          'Content, Brand and Social Media',
          'Finance & Accountings',
          'UI & UX Design',
          'Operations',
          'Studio',
          'Founders',
          'HR',
        ].map((d) => ({ value: d, label: d }))
      : [],
    projects: (projects.data ?? []).map((p) => ({ value: p.id, label: p.name })),
    tasks: (tasks.data ?? []).map((t) => ({ value: t.id, label: t.title })),
  }
}
