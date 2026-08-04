import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getRecruitmentScope } from '@/app/(admin)/workforce/recruitment/_lib/queries'

const NONE = ['00000000-0000-0000-0000-000000000000']
function cell(value: unknown) { const text = value == null ? '' : String(value); return `"${text.replaceAll('"', '""')}"` }

export async function GET(request: NextRequest) {
  await requirePermission('workforce.recruitment_reports.read'); const scope = await getRecruitmentScope(); const params = request.nextUrl.searchParams
  const from = /^\d{4}-\d{2}-\d{2}$/.test(params.get('from') ?? '') ? params.get('from')! : new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10); const to = /^\d{4}-\d{2}-\d{2}$/.test(params.get('to') ?? '') ? params.get('to')! : new Date().toISOString().slice(0, 10); const department = params.get('department') ?? ''; const source = params.get('source') ?? ''
  let query = createSupabaseAdminClient().from('recruitment_applications').select('application_reference, status, source, submitted_at, hired_at, workforce_jobs(title, department)').gte('created_at', `${from}T00:00:00Z`).lte('created_at', `${to}T23:59:59Z`).limit(10_000); if (!scope.organizationWide) query = query.in('id', scope.applicationIds.length ? scope.applicationIds : NONE); if (source) query = query.eq('source', source)
  const { data, error } = await query; if (error) return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  const header = ['Application reference', 'Job', 'Department', 'Status', 'Source', 'Submitted at', 'Hired at']; const lines = [header.map(cell).join(',')]
  for (const row of data ?? []) { const job = Array.isArray(row.workforce_jobs) ? row.workforce_jobs[0] : row.workforce_jobs; if (department && job?.department !== department) continue; lines.push([row.application_reference, job?.title, job?.department, row.status, row.source, row.submitted_at, row.hired_at].map(cell).join(',')) }
  await createSupabaseAdminClient().from('recruitment_audit_events').insert({ event_type: 'recruitment.report_exported', entity_type: 'recruitment_report', actor_type: 'employee', metadata: { from, to, department: department || null, source: source || null, columns: header } })
  return new NextResponse(`\uFEFF${lines.join('\n')}`, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="recruitment-report-${from}-${to}.csv"`, 'cache-control': 'private, no-store' } })
}
