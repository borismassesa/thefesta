import WorkforceHeading from '../_components/PageHeading'
import Link from 'next/link'
import {
  AlertTriangle,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  FileWarning,
  ListChecks,
  Send,
} from 'lucide-react'
import { getRecruitmentOverview } from './_lib/queries'

export const dynamic = 'force-dynamic'

export default async function RecruitmentPage() {
  const overview = await getRecruitmentOverview()
  const cards = [
    ['Open requisitions', overview.openRequisitions, ListChecks, '/workforce/recruitment/requisitions'],
    ['Published jobs', overview.publishedJobs, BriefcaseBusiness, '/workforce/recruitment/jobs'],
    ['New applications', overview.newApplications, ClipboardCheck, '/workforce/recruitment/applications'],
    ['Awaiting review', overview.awaitingReview, Clock3, '/workforce/recruitment/applications?queue=stale'],
    ['Interviews this week', overview.interviewsThisWeek, CalendarDays, '/workforce/recruitment/interviews'],
    ['Scorecards overdue', overview.scorecardsOverdue, FileWarning, '/workforce/recruitment/interviews?queue=scorecards'],
    ['Offers to approve', overview.offersAwaitingApproval, Send, '/workforce/recruitment/offers?queue=approval'],
    ['Jobs closing soon', overview.closingSoon, AlertTriangle, '/workforce/recruitment/jobs?queue=closing'],
  ] as const
  return (
    <>
      <WorkforceHeading title="Recruitment overview" subtitle="Hiring plan, pipeline health, interviews and offers in one operational view." />
      <section aria-label="Recruitment metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, Icon, href]) => (
          <Link key={label} href={href} className="group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:border-[#DCC7E7] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7E5896]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">{label}</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-950">{value}</p>
              </div>
              <span className="rounded-xl bg-[#F7EAFB] p-2.5 text-[#5B2D8E] transition group-hover:bg-[#5B2D8E] group-hover:text-white">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>
          </Link>
        ))}
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-950">Action queues</h2>
              <p className="mt-1 text-sm text-gray-500">Items that need recruiting-team attention.</p>
            </div>
          </div>
          <div className="mt-4 divide-y divide-gray-100">
            {overview.urgentQueues.map((queue) => (
              <Link key={queue.label} href={queue.href} className="flex min-h-14 items-center justify-between gap-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7E5896]">
                <span className="font-medium text-gray-700">{queue.label}</span>
                <span className="min-w-8 rounded-full bg-gray-100 px-2 py-1 text-center text-xs font-bold text-gray-800">{queue.count}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-950">Application mix</h2>
          <p className="mt-1 text-sm text-gray-500">Current canonical pipeline stages.</p>
          <div className="mt-4 space-y-3">
            {overview.applicationsByStatus.length === 0 ? (
              <p className="rounded-xl bg-gray-50 px-4 py-5 text-sm text-gray-500">No applications in your recruitment scope yet.</p>
            ) : overview.applicationsByStatus.slice(0, 8).map((item) => (
              <div key={item.status} className="flex items-center justify-between gap-4">
                <span className="text-sm text-gray-600">{item.status.replaceAll('_', ' ')}</span>
                <span className="text-sm font-semibold text-gray-950">{item.count}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}
