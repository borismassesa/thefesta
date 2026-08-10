import WorkforceHeading from '../../_components/PageHeading'
import { getCallerPermissions, requirePermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getRecruitmentScope } from '../_lib/queries'
import { PANEL, StatTile, TILE_TONES } from '../_components/ui'

const NONE = ['00000000-0000-0000-0000-000000000000']
const FIELD =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#7E5896] focus:ring-2 focus:ring-[#F0DFF6]'
const LABEL = 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500'
function median(values: number[]) { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2 }
function days(value: number | null) { return value == null ? '—' : `${value.toFixed(1)} days` }

export default async function RecruitmentReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission('workforce.recruitment_reports.read'); const [scope, permissions, params] = await Promise.all([getRecruitmentScope(), getCallerPermissions(), searchParams]); const db = createSupabaseAdminClient()
  // The default window is "the last 90 days as at this request", so it has to
  // read the clock. Same shape the other time-relative admin pages use.
  // eslint-disable-next-line react-hooks/purity -- server component, reflects request time
  const requestedAt = Date.now()
  const from = typeof params.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.from) ? params.from : new Date(requestedAt - 90 * 86_400_000).toISOString().slice(0, 10); const to = typeof params.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.to) ? params.to : new Date(requestedAt).toISOString().slice(0, 10); const department = typeof params.department === 'string' ? params.department : ''; const source = typeof params.source === 'string' ? params.source : ''
  let appsQuery = db.from('recruitment_applications').select('id, job_id, candidate_id, status, source, submitted_at, created_at, hired_at, withdrawn_at, rejected_at, last_stage_changed_at, workforce_jobs(title, department)').gte('created_at', `${from}T00:00:00Z`).lte('created_at', `${to}T23:59:59Z`).limit(5000)
  if (!scope.organizationWide) appsQuery = appsQuery.in('id', scope.applicationIds.length ? scope.applicationIds : NONE); if (source) appsQuery = appsQuery.eq('source', source)
  const applications = await appsQuery; if (applications.error) throw applications.error
  const filtered = (applications.data ?? []).filter((app) => { const job = Array.isArray(app.workforce_jobs) ? app.workforce_jobs[0] : app.workforce_jobs; return !department || job?.department === department })
  const appIds = filtered.map((app) => app.id); const jobIds = [...new Set(filtered.map((app) => app.job_id))]
  const [history, interviews, offers, postings, requisitions, workforcePlans, postHire] = await Promise.all([
    appIds.length ? db.from('recruitment_application_stage_history').select('application_id, from_status, to_status, created_at').in('application_id', appIds).order('created_at') : Promise.resolve({ data: [], error: null }),
    appIds.length ? db.from('recruitment_interviews').select('application_id, status, starts_at, created_at').in('application_id', appIds) : Promise.resolve({ data: [], error: null }),
    appIds.length ? db.from('recruitment_offers').select('application_id, status, created_at, sent_at, responded_at').in('application_id', appIds) : Promise.resolve({ data: [], error: null }),
    jobIds.length ? db.from('recruitment_job_postings').select('workforce_job_id, created_at, published_at').in('workforce_job_id', jobIds) : Promise.resolve({ data: [], error: null }),
    db.from('recruitment_requisitions').select('id, department, created_at, submitted_at, approved_at, status, headcount, openings_filled').gte('created_at', `${from}T00:00:00Z`).lte('created_at', `${to}T23:59:59Z`),
    db.from('recruitment_workforce_plans').select('department, planned_headcount, approved_headcount, planned_budget_tzs, status'),
    db.from('recruitment_post_hire_reviews').select('hiring_manager_satisfaction, performance_outcome, retention_status, reviewed_at').not('reviewed_at', 'is', null),
  ]); for (const result of [history, interviews, offers, postings, requisitions, workforcePlans, postHire]) if (result.error) throw result.error
  const reqRows = (requisitions.data ?? []).filter((req) => (!department || req.department === department) && (scope.organizationWide || scope.requisitionIds.includes(req.id)))
  const total = filtered.length; const hires = filtered.filter((app) => app.status === 'hired').length; const withdrawals = filtered.filter((app) => app.status === 'withdrawn').length; const interviewCount = (interviews.data ?? []).filter((item) => item.status !== 'cancelled').length; const noShows = (interviews.data ?? []).filter((item) => item.status === 'no_show').length; const issuedOffers = (offers.data ?? []).filter((offer) => ['sent', 'viewed', 'accepted', 'declined', 'expired'].includes(offer.status)).length; const acceptedOffers = (offers.data ?? []).filter((offer) => offer.status === 'accepted').length
  const timeToHire = filtered.filter((app) => app.hired_at && app.submitted_at).map((app) => (new Date(app.hired_at!).getTime() - new Date(app.submitted_at!).getTime()) / 86_400_000); const timeToApprove = reqRows.filter((req) => req.approved_at && req.submitted_at).map((req) => (new Date(req.approved_at!).getTime() - new Date(req.submitted_at!).getTime()) / 86_400_000); const timeToPublish = (postings.data ?? []).filter((posting) => posting.published_at).map((posting) => (new Date(posting.published_at!).getTime() - new Date(posting.created_at).getTime()) / 86_400_000)
  const stageCounts = new Map<string, number>(); for (const app of filtered) stageCounts.set(app.status, (stageCounts.get(app.status) ?? 0) + 1); const sourceCounts = new Map<string, { applications: number; hires: number }>(); for (const app of filtered) { const current = sourceCounts.get(app.source) ?? { applications: 0, hires: 0 }; current.applications += 1; if (app.status === 'hired') current.hires += 1; sourceCounts.set(app.source, current) }
  const departments = [...new Set((applications.data ?? []).map((app) => { const job = Array.isArray(app.workforce_jobs) ? app.workforce_jobs[0] : app.workforce_jobs; return job?.department }).filter(Boolean))] as string[]; const sources = [...new Set((applications.data ?? []).map((app) => app.source))]
  const metrics = [['Applications', total], ['Qualified / active', filtered.filter((app) => !['draft', 'rejected', 'withdrawn', 'duplicate', 'disqualified', 'archived'].includes(app.status)).length], ['Interviews', interviewCount], ['Offers issued', issuedOffers], ['Hires', hires], ['Offer acceptance', issuedOffers ? `${Math.round(acceptedOffers / issuedOffers * 100)}%` : '—'], ['Withdrawal rate', total ? `${Math.round(withdrawals / total * 100)}%` : '—'], ['Interview no-show', interviewCount ? `${Math.round(noShows / interviewCount * 100)}%` : '—']]
  const queryString = new URLSearchParams({ from, to, ...(department ? { department } : {}), ...(source ? { source } : {}) }).toString()
  // Cycled so adjacent tiles differ; the tones are the Approvals set the
  // Recruitment overview already uses, which is what makes this page look like
  // the rest of the module instead of a spreadsheet.
  const TONES = [TILE_TONES.violet, TILE_TONES.blue, TILE_TONES.green, TILE_TONES.amber]
  const funnel = [...stageCounts.entries()].sort((a, b) => b[1] - a[1])
  const sourceRows = [...sourceCounts.entries()]
  const planRows = (workforcePlans.data ?? []).filter((plan) => !department || plan.department === department)
  const openings = reqRows.reduce((sum, row) => sum + row.headcount, 0)
  const filledOpenings = reqRows.reduce((sum, row) => sum + row.openings_filled, 0)

  return (
    <>
      <WorkforceHeading title="Recruitment reports" subtitle="Scoped funnel, speed, source quality, candidate experience, workforce planning and post-hire outcomes." />

      <form className={`${PANEL} p-4`}>
        <div className="grid gap-3 md:grid-cols-5">
          <label className="block"><span className={LABEL}>From</span><input className={FIELD} name="from" type="date" defaultValue={from} /></label>
          <label className="block"><span className={LABEL}>To</span><input className={FIELD} name="to" type="date" defaultValue={to} /></label>
          <label className="block"><span className={LABEL}>Department</span>
            <select className={FIELD} name="department" defaultValue={department}><option value="">All in scope</option>{departments.map((value) => <option key={value}>{value}</option>)}</select>
          </label>
          <label className="block"><span className={LABEL}>Source</span>
            <select className={FIELD} name="source" defaultValue={source}><option value="">All sources</option>{sources.map((value) => <option key={value}>{value}</option>)}</select>
          </label>
          <div className="flex items-end gap-2">
            <button className="rounded-lg bg-[#7E5896] px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90">Apply</button>
            <a href={`/api/recruitment/reports/export?${queryString}`} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50">CSV</a>
          </div>
        </div>
      </form>

      <section aria-label="Recruitment metrics" className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map(([label, value], index) => {
          const tone = TONES[index % TONES.length]
          return <StatTile key={String(label)} label={String(label)} value={value} accent={tone.accent} tint={tone.tint} />
        })}
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className={`${PANEL} p-5`}>
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Speed</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <div><dt className="text-xs text-gray-400">Median approval</dt><dd className="mt-0.5 font-semibold text-gray-900">{days(median(timeToApprove))}</dd></div>
            <div><dt className="text-xs text-gray-400">Median publish</dt><dd className="mt-0.5 font-semibold text-gray-900">{days(median(timeToPublish))}</dd></div>
            <div><dt className="text-xs text-gray-400">Median hire</dt><dd className="mt-0.5 font-semibold text-gray-900">{days(median(timeToHire))}</dd></div>
          </dl>
          <h3 className="mt-5 text-sm font-semibold text-gray-900">Current funnel</h3>
          {funnel.length === 0
            ? <p className="mt-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-500">No applications in this window, so there is no funnel to show.</p>
            : funnel.map(([stage, count]) => <div key={stage} className="mt-2 flex justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm"><span className="capitalize text-gray-700">{stage.replaceAll('_', ' ')}</span><b className="text-gray-900">{count}</b></div>)}
        </section>

        <section className={`${PANEL} p-5`}>
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Source quality</h2>
          {sourceRows.length === 0 ? (
            <p className="mt-3 rounded-lg bg-gray-50 p-3 text-xs text-gray-500">No applications in this window. Source conversion appears once candidates start arriving.</p>
          ) : (
            <div className="no-scrollbar mt-3 overflow-x-auto">
              <table className="w-full min-w-[380px] text-left text-sm">
                <thead><tr className="text-[11px] font-semibold uppercase tracking-wide text-gray-400"><th className="py-2">Source</th><th>Applications</th><th>Hires</th><th>Conversion</th></tr></thead>
                <tbody>{sourceRows.map(([name, values]) => <tr key={name} className="border-t border-gray-100"><td className="py-2 text-gray-700">{name}</td><td className="text-gray-700">{values.applications}</td><td className="text-gray-700">{values.hires}</td><td className="text-gray-700">{values.applications ? Math.round(values.hires / values.applications * 100) : 0}%</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </section>

        <section className={`${PANEL} p-5`}>
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Workforce plan</h2>
          {/* "1 approved openings" read as a typo on every singular count. */}
          <p className="mt-3 text-3xl font-semibold text-gray-900">{filledOpenings} <span className="text-base font-normal text-gray-500">{filledOpenings === 1 ? 'hire' : 'hires'} against {openings} approved {openings === 1 ? 'opening' : 'openings'}</span></p>
          {planRows.length === 0
            ? <p className="mt-3 rounded-lg bg-gray-50 p-3 text-xs text-gray-500">No workforce plan covers this selection. Approve one to set headcount and budget for the year.</p>
            : planRows.map((plan, index) => <p key={`${plan.department}-${index}`} className="mt-2 rounded-lg bg-gray-50 p-2 text-xs text-gray-600">{plan.department ?? 'Company'}: {plan.approved_headcount}/{plan.planned_headcount} headcount · TZS {Number(plan.planned_budget_tzs).toLocaleString()}</p>)}
        </section>

        <section className={`${PANEL} p-5`}>
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Post-hire quality</h2>
          <p className="mt-3 text-sm text-gray-600">Hiring-manager satisfaction: {(() => { const values = (postHire.data ?? []).map((review) => Number(review.hiring_manager_satisfaction)).filter(Number.isFinite); return values.length ? `${(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)}/5` : 'Awaiting reviews' })()}</p>
          <p className="mt-2 text-sm text-gray-600">Retention outcomes captured: {(postHire.data ?? []).filter((review) => review.retention_status).length}</p>
          {/* Lavender, not amber. This is a standing note about how the data
              works, not a warning that something is wrong. */}
          {permissions.has('recruitment.candidate.sensitive')
            ? <p className="mt-4 rounded-xl border border-[#F0DFF6] bg-[#FCF7FF] p-3 text-xs text-[#7E5896]">Restricted diversity reporting is available only as aggregated cohorts. Candidate-level demographics are never shown here.</p>
            : <p className="mt-4 text-xs text-gray-400">Restricted diversity reporting requires the sensitive analytics permission.</p>}
        </section>
      </div>
    </>
  )
}
