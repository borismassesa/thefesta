import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import WorkforceHeading from '../../workforce/_components/PageHeading'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { escapeLike, hasPermission } from '@/lib/admin-auth'
import { getEmployees, getReportsForEmployee, getReportTemplates } from '../../workforce/_lib/queries'
import {
  readGoals,
  REPORT_CADENCES,
  seedFollowupFromGoals,
  type FollowupItem,
  type ReportSubmission,
  type ReportTemplate,
} from '../../workforce/_lib/report-schema'
import MyReportsClient from './MyReportsClient'
import { saveReport } from './actions'

export const dynamic = 'force-dynamic'

// "My reports" — the personal report surface. The employee picks a report
// type from the templates available to their department, fills the dynamic
// form, saves as draft or submits, and browses their own history. Admins
// track everyone's submissions at /workforce/reports.

const TZ = 'Africa/Dar_es_Salaam'

function todayInTz(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

// For each monthly-style template with a follow-up section, find that
// employee's most recent past submission of the same template and carry its
// goal_list content forward as the seed for a brand-new report's follow-up.
// `reports` is already ordered report_date desc, so the first match is the
// most recent one — good enough without an extra per-template query.
function computeFollowupSeeds(
  templates: ReportTemplate[],
  reports: ReportSubmission[],
): Record<string, FollowupItem[]> {
  const out: Record<string, FollowupItem[]> = {}
  for (const t of templates) {
    const followup = t.sections.find((s) => s.type === 'followup_list' && s.followsSectionId)
    if (!followup?.followsSectionId) continue
    const goalsSection = t.sections.find((s) => s.id === followup.followsSectionId)
    if (!goalsSection) continue
    const prior = reports.find((r) => r.templateId === t.id)
    if (!prior) continue
    out[t.id] = seedFollowupFromGoals(readGoals(prior.content, goalsSection))
  }
  return out
}

export default async function MyReportsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in?redirect_url=/me/reports')

  const user = await currentUser()
  const email =
    user?.primaryEmailAddress?.emailAddress?.toLowerCase() ??
    user?.emailAddresses?.[0]?.emailAddress?.toLowerCase() ??
    null
  if (!email) redirect('/')

  const supabase = createSupabaseAdminClient()
  const { data: employee } = await supabase
    .from('workforce_employees')
    .select('id, full_name, department, job_title')
    .ilike('email', escapeLike(email))
    .maybeSingle<{ id: string; full_name: string; department: string; job_title: string }>()

  if (!employee) {
    return (
      <div className="pb-12">
        <WorkforceHeading
          title="My reports"
          subtitle="No workforce record yet — ask an admin to add you."
        />
      </div>
    )
  }

  const [allTemplates, reports, canSeeAll, allEmployees] = await Promise.all([
    getReportTemplates({ activeOnly: true }),
    getReportsForEmployee(employee.id),
    hasPermission('workforce.write'),
    getEmployees(),
  ])

  const recipients = allEmployees
    .filter((e) => e.id !== employee.id)
    .map((e) => ({ id: e.id, name: e.name, jobTitle: e.jobTitle }))

  // Admins/owners (workforce.write) oversee everything, so they can write
  // any report type. Regular employees see unrestricted templates plus the
  // ones offered to their department.
  const scoped = canSeeAll
    ? allTemplates
    : allTemplates.filter(
        (t) => t.departments.length === 0 || t.departments.includes(employee.department),
      )

  // Cadence order (daily → weekly → biweekly → monthly → quarterly) instead
  // of alphabetical by name, so the picker reads like a calendar.
  const templates = [...scoped].sort((a, b) => {
    const byCadence = REPORT_CADENCES.indexOf(a.cadence) - REPORT_CADENCES.indexOf(b.cadence)
    return byCadence !== 0 ? byCadence : a.name.localeCompare(b.name)
  })

  const followupSeeds = computeFollowupSeeds(templates, reports)

  return (
    <div className="pb-12">
      <WorkforceHeading
        title="My reports"
        subtitle="Pick a report type, fill it in, and submit. Your team leads can see these."
      />
      <div className="pt-2">
        <MyReportsClient
          templates={templates}
          reports={reports}
          recipients={recipients}
          followupSeeds={followupSeeds}
          today={todayInTz()}
          saveReport={saveReport}
        />
      </div>
    </div>
  )
}
