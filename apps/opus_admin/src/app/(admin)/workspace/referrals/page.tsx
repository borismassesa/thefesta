import { BriefcaseBusiness, CircleDollarSign, FileText, ShieldCheck, UserRoundPlus } from 'lucide-react'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { logDbError } from '@/lib/log-safe'
import { workspaceErrorCode } from '@/lib/workspace/errors'
import { requireWorkspaceCapability } from '@/lib/workspace/guards'
import AccessNotice from '../_components/AccessNotice'
import WorkspaceHeading from '../_components/WorkspaceHeading'
import ReferralForm from './ReferralForm'
import ReferralNoteForm from './ReferralNoteForm'

export const dynamic = 'force-dynamic'

type JobRow = {
  id: string
  title: string
  department: string
  location: string
  employment_type: string
  closing_date: string | null
}

type ReferralRow = {
  id: string
  referral_reference: string
  job_id: string | null
  candidate_name: string
  status: string
  created_at: string
}

type RewardRow = {
  referral_id: string
  amount_tzs: number
  status: string
  eligibility_date: string | null
  paid_at: string | null
}

type NoteRow = {
  id: string
  referral_id: string
  body: string
  created_at: string
}

type ProgramRow = {
  name: string
  rules: string | null
  reward_description: string | null
  reward_amount_tzs: number | null
}

const PUBLIC_STATUS: Record<string, string> = {
  submitted: 'Submitted',
  contacted: 'Under review',
  applied: 'Under review',
  in_process: 'In process',
  hired: 'Hired',
  not_selected: 'Closed',
  withdrawn: 'Closed',
}

const STATUS_TONE: Record<string, string> = {
  Submitted: 'bg-blue-50 text-blue-700',
  'Under review': 'bg-amber-50 text-amber-700',
  'In process': 'bg-violet-50 text-violet-700',
  Hired: 'bg-emerald-50 text-emerald-700',
  Closed: 'bg-gray-100 text-gray-600',
}

function formatDate(value: string | null): string {
  if (!value) return 'No closing date'
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTzs(value: number): string {
  return new Intl.NumberFormat('en-TZ', {
    style: 'currency',
    currency: 'TZS',
    maximumFractionDigits: 0,
  }).format(value)
}

export default async function WorkspaceReferralsPage() {
  let context
  try {
    context = await requireWorkspaceCapability('workspace.read', { action: 'referrals.view' })
  } catch (error) {
    return (
      <>
        <WorkspaceHeading title="Employee referrals" />
        <AccessNotice code={workspaceErrorCode(error)} />
      </>
    )
  }

  try {
    const supabase = createSupabaseAdminClient()
    const today = new Date().toISOString().slice(0, 10)
    const [jobsResult, referralsResult, programResult] = await Promise.all([
      supabase
        .from('workforce_jobs')
        .select('id, title, department, location, employment_type, closing_date')
        .eq('status', 'Open')
        .or(`closing_date.is.null,closing_date.gte.${today}`)
        .order('opened_at', { ascending: false })
        .limit(100)
        .returns<JobRow[]>(),
      supabase
        .from('recruitment_referrals')
        .select('id, referral_reference, job_id, candidate_name, status, created_at')
        .eq('referrer_employee_id', context.employee.id)
        .order('created_at', { ascending: false })
        .limit(100)
        .returns<ReferralRow[]>(),
      supabase
        .from('recruitment_referral_programs')
        .select('name, rules, reward_description, reward_amount_tzs')
        .eq('status', 'active')
        .or(`starts_on.is.null,starts_on.lte.${today}`)
        .or(`ends_on.is.null,ends_on.gte.${today}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle<ProgramRow>(),
    ])
    if (jobsResult.error || referralsResult.error || programResult.error) {
      throw jobsResult.error ?? referralsResult.error ?? programResult.error
    }

    const jobs = jobsResult.data ?? []
    const referrals = referralsResult.data ?? []
    const referralIds = referrals.map((referral) => referral.id)
    const [rewardResult, notesResult] = referralIds.length
      ? await Promise.all([
          supabase
            .from('recruitment_referral_rewards')
            .select('referral_id, amount_tzs, status, eligibility_date, paid_at')
            .in('referral_id', referralIds)
            .returns<RewardRow[]>(),
          supabase
            .from('recruitment_referral_notes')
            .select('id, referral_id, body, created_at')
            .in('referral_id', referralIds)
            .eq('visibility', 'employee')
            .order('created_at', { ascending: false })
            .returns<NoteRow[]>(),
        ])
      : [{ data: [] as RewardRow[], error: null }, { data: [] as NoteRow[], error: null }]
    if (rewardResult.error || notesResult.error) throw rewardResult.error ?? notesResult.error

    const jobsById = new Map(jobs.map((job) => [job.id, job]))
    const rewardsByReferral = new Map((rewardResult.data ?? []).map((reward) => [reward.referral_id, reward]))
    const notesByReferral = new Map<string, NoteRow[]>()
    for (const note of notesResult.data ?? []) {
      notesByReferral.set(note.referral_id, [...(notesByReferral.get(note.referral_id) ?? []), note])
    }

    return (
      <div className="pb-12">
        <WorkspaceHeading
          title="Employee referrals"
          subtitle="Recommend people you trust, then follow a privacy-safe hiring status."
        />
        <div className="space-y-8">
          <nav aria-label="Referral sections" className="flex flex-wrap gap-2">
            {[
              ['Open opportunities', '#opportunities'],
              ['Submit referral', '#submit'],
              ['My referrals', '#mine'],
              ['Referral policy', '#policy'],
            ].map(([label, href]) => (
              <a key={href} href={href} className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:border-violet-200 hover:text-[#5B2D8E]">
                {label}
              </a>
            ))}
          </nav>

          <section id="opportunities" aria-labelledby="opportunities-heading">
            <div className="flex items-center gap-3">
              <BriefcaseBusiness className="h-5 w-5 text-[#5B2D8E]" />
              <h2 id="opportunities-heading" className="text-lg font-semibold text-gray-950">Open opportunities</h2>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">{jobs.length}</span>
            </div>
            {jobs.length ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {jobs.map((job) => (
                  <article key={job.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <h3 className="font-semibold text-gray-950">{job.title}</h3>
                    <p className="mt-1 text-sm text-gray-600">{job.department} · {job.location}</p>
                    <p className="mt-4 text-xs font-medium text-gray-500">{job.employment_type} · Closes {formatDate(job.closing_date)}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-7 text-sm text-gray-600">There are no vacancies accepting referrals right now.</div>
            )}
          </section>

          <section id="submit" aria-labelledby="submit-heading" className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <UserRoundPlus className="h-5 w-5 text-[#5B2D8E]" />
              <div>
                <h2 id="submit-heading" className="text-lg font-semibold text-gray-950">Submit a referral</h2>
                <p className="mt-1 text-sm text-gray-600">The candidate’s contact details and CV are available only to the recruitment team.</p>
              </div>
            </div>
            <ReferralForm opportunities={jobs.map(({ id, title, department, location }) => ({ id, title, department, location }))} />
          </section>

          <section id="mine" aria-labelledby="mine-heading">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-[#5B2D8E]" />
              <h2 id="mine-heading" className="text-lg font-semibold text-gray-950">My referrals</h2>
            </div>
            {referrals.length ? (
              <div className="mt-4 space-y-4">
                {referrals.map((referral) => {
                  const job = referral.job_id ? jobsById.get(referral.job_id) : undefined
                  const status = PUBLIC_STATUS[referral.status] ?? 'Under review'
                  const reward = rewardsByReferral.get(referral.id)
                  const notes = notesByReferral.get(referral.id) ?? []
                  return (
                    <article key={referral.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-gray-950">{referral.candidate_name}</h3>
                          <p className="mt-1 text-sm text-gray-600">{job?.title ?? 'Opportunity closed'} · {referral.referral_reference}</p>
                          <p className="mt-1 text-xs text-gray-400">Submitted {formatDate(referral.created_at)}</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[status] ?? STATUS_TONE['Under review']}`}>{status}</span>
                      </div>

                      <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                          <CircleDollarSign className="h-4 w-4" /> Bonus status
                        </div>
                        <p className="mt-1 text-sm text-gray-700">
                          {reward
                            ? `${formatTzs(reward.amount_tzs)} · ${reward.status.replaceAll('_', ' ')}`
                            : 'No referral award is configured for this referral.'}
                        </p>
                        {reward?.eligibility_date && <p className="mt-1 text-xs text-gray-500">Eligibility review: {formatDate(reward.eligibility_date)}</p>}
                      </div>

                      {notes.length > 0 && (
                        <details className="mt-4">
                          <summary className="cursor-pointer text-sm font-semibold text-gray-700">Your shared notes ({notes.length})</summary>
                          <ol className="mt-3 space-y-2 border-l border-gray-200 pl-4">
                            {notes.map((note) => (
                              <li key={note.id} className="text-sm text-gray-600">
                                {note.body}<span className="ml-2 text-xs text-gray-400">{formatDate(note.created_at)}</span>
                              </li>
                            ))}
                          </ol>
                        </details>
                      )}
                      {!['hired', 'not_selected', 'withdrawn'].includes(referral.status) && <ReferralNoteForm referralId={referral.id} />}
                    </article>
                  )
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-7 text-sm text-gray-600">You have not submitted a referral yet.</div>
            )}
          </section>

          <section id="policy" aria-labelledby="policy-heading" className="rounded-2xl border border-violet-100 bg-violet-50/60 p-6">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#5B2D8E]" />
              <div>
                <h2 id="policy-heading" className="text-lg font-semibold text-gray-950">{programResult.data?.name ?? 'Referral policy'}</h2>
                <p className="mt-3 whitespace-pre-line text-sm leading-6 text-gray-700">
                  {programResult.data?.rules ?? 'People Ops has not published an active referral programme. You may still recommend candidates, but no award is currently promised.'}
                </p>
                {programResult.data?.reward_description && <p className="mt-3 text-sm leading-6 text-gray-700">{programResult.data.reward_description}</p>}
                <p className="mt-4 text-xs font-medium text-gray-500">You will see only Submitted, Under review, In process, Closed, or Hired. Interview feedback, ratings, compensation, and rejection reasons remain confidential.</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    )
  } catch (error) {
    logDbError('workspace.referrals.load', error, { employeeId: context.employee.id })
    return (
      <>
        <WorkspaceHeading title="Employee referrals" />
        <AccessNotice code="unavailable" />
      </>
    )
  }
}
