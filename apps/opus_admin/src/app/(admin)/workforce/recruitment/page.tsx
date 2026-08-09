import WorkforceHeading from '../_components/PageHeading'
import Link from 'next/link'
import { getRecruitmentOverview } from './_lib/queries'
import { EmptyState, Panel, StatTile, TILE_TONES } from './_components/ui'

export const dynamic = 'force-dynamic'

// Tile tones follow the Approvals overview: amber for "needs attention",
// blue/violet for volume, green for progress, rose for risk. Each number is a
// link into the slice it counts — a count you cannot act on is decoration.
const CARDS = [
  ['Open requisitions', 'openRequisitions', TILE_TONES.violet, '/workforce/recruitment/requisitions'],
  ['Published jobs', 'publishedJobs', TILE_TONES.blue, '/workforce/recruitment/jobs'],
  ['New applications', 'newApplications', TILE_TONES.blue, '/workforce/recruitment/applications'],
  ['Awaiting review', 'awaitingReview', TILE_TONES.amber, '/workforce/recruitment/applications?queue=stale'],
  ['Interviews this week', 'interviewsThisWeek', TILE_TONES.green, '/workforce/recruitment/interviews'],
  ['Scorecards overdue', 'scorecardsOverdue', TILE_TONES.rose, '/workforce/recruitment/interviews?queue=scorecards'],
  ['Offers to approve', 'offersAwaitingApproval', TILE_TONES.amber, '/workforce/recruitment/offers?queue=approval'],
  ['Jobs closing soon', 'closingSoon', TILE_TONES.rose, '/workforce/recruitment/jobs?queue=closing'],
] as const

export default async function RecruitmentPage() {
  const overview = await getRecruitmentOverview()

  return (
    <>
      <WorkforceHeading
        title="Recruitment overview"
        subtitle="Hiring plan, pipeline health, interviews and offers in one operational view."
      />

      <section aria-label="Recruitment metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {CARDS.map(([label, key, tone, href]) => {
          const value = overview[key]
          return (
            <StatTile
              key={label}
              label={label}
              value={value}
              accent={tone.accent}
              tint={tone.tint}
              href={href}
              // A non-zero queue that needs a person reads differently from a
              // calm zero, exactly as it does on the Approvals overview.
              emphasis={tone === TILE_TONES.amber && value > 0}
            />
          )
        })}
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
        <Panel title="Action queues">
          {overview.urgentQueues.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-gray-500">
              Nothing needs recruiting-team attention right now.
            </p>
          ) : (
            <ul>
              {overview.urgentQueues.map((queue) => (
                <li key={queue.label}>
                  <Link
                    href={queue.href}
                    className="flex min-h-14 w-full items-center justify-between gap-4 border-b border-gray-100 px-5 py-3 text-sm transition-colors last:border-b-0 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7E5896]"
                  >
                    <span className="font-medium text-gray-700">{queue.label}</span>
                    <span className="min-w-8 rounded-full bg-gray-100 px-2 py-1 text-center text-xs font-bold text-gray-800">
                      {queue.count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Application mix">
          {overview.applicationsByStatus.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No applications yet"
                hint="Nothing has entered the pipeline within your recruitment scope."
              />
            </div>
          ) : (
            <ul>
              {overview.applicationsByStatus.slice(0, 8).map((item) => (
                <li
                  key={item.status}
                  className="flex items-center justify-between gap-4 border-b border-gray-100 px-5 py-3 last:border-b-0"
                >
                  <span className="text-sm capitalize text-gray-600">
                    {item.status.replaceAll('_', ' ')}
                  </span>
                  <span className="text-sm font-semibold text-gray-950">{item.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  )
}
