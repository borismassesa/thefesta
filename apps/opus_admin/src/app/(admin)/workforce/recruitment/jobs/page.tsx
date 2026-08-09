import WorkforceHeading from '../../_components/PageHeading'
import Link from 'next/link'
import { createSupabaseAdminClient } from '@/lib/supabase'
import RecruitmentClient from '../RecruitmentClient'
import { getJobsWithCandidates } from '../../_lib/queries'
import { getRecruitmentScope } from '../_lib/queries'
import { StatusPill } from '../_components/ui'

export const dynamic = 'force-dynamic'

export default async function RecruitmentJobsPage() {
  const [allJobs, scope] = await Promise.all([getJobsWithCandidates(), getRecruitmentScope()])
  const jobs = scope.organizationWide
    ? allJobs
    : allJobs.filter((job) => scope.jobIds.includes(job.id))
  const db = createSupabaseAdminClient()
  let postingsQuery = db.from('recruitment_job_postings').select('id, workforce_job_id, public_title, visibility, status, publish_at, unpublish_at, workforce_jobs(department, location)').order('created_at', { ascending: false })
  if (!scope.organizationWide) postingsQuery = postingsQuery.in('workforce_job_id', scope.jobIds.length ? scope.jobIds : ['00000000-0000-0000-0000-000000000000'])
  const postings = await postingsQuery; if (postings.error) throw postings.error
  return (
    <>
      <WorkforceHeading title="Jobs" subtitle="Govern public content, translations, questions, channels, schedules and the application pipeline." />
      <section className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{(postings.data ?? []).map((posting) => { const job = Array.isArray(posting.workforce_jobs) ? posting.workforce_jobs[0] : posting.workforce_jobs; return <Link key={posting.id} href={`/workforce/recruitment/jobs/${posting.id}`} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] hover:border-gray-200"><div className="flex justify-between gap-3"><h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">{posting.public_title}</h2><StatusPill status={posting.status} /></div><p className="mt-2 text-sm text-gray-500">{job?.department} · {job?.location} · {posting.visibility}</p><p className="mt-3 text-xs text-gray-400">{posting.publish_at ? `Publishes ${new Date(posting.publish_at).toLocaleString('en-TZ')}` : 'Manual publication'}{posting.unpublish_at ? ` · closes ${new Date(posting.unpublish_at).toLocaleString('en-TZ')}` : ''}</p></Link> })}</section>
      <RecruitmentClient jobs={jobs} />
    </>
  )
}
