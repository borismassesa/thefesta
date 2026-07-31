import { redirect } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { getAdminAccessRole, hasPermission, isAdminDashboardRole } from '@/lib/admin-auth'
import { getCommissionMetrics, type MetricRow } from './queries'

export const dynamic = 'force-dynamic'

/**
 * Commission analytics.
 * Specs: OP-CCS-PRD-001 §9; OP-CCS-TDD-001 step 11.
 *
 * Every figure is shown against the target the PRD actually committed to.
 * A bare "83%" tells nobody whether to act; "83% against a target of 85%"
 * does. Where the sample is too small to mean anything the number is withheld
 * rather than dressed up — a 100% attainment on two orders is noise, and
 * treating it as a result is how a dashboard starts lying to you.
 */

const RANGES = [30, 90, 180] as const

export default async function CommissionAnalyticsPage(props: {
  searchParams: Promise<{ days?: string }>
}) {
  const role = await getAdminAccessRole()
  if (!isAdminDashboardRole(role)) redirect('/sign-in')
  if (!(await hasPermission('commissions.read'))) redirect('/')

  const searchParams = await props.searchParams
  const days = RANGES.find((r) => String(r) === searchParams.days) ?? 90
  const { metrics, designers, totalOrders } = await getCommissionMetrics(days)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Commission analytics
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Margin here is designer throughput against a salary cost, so turnaround time is the
            profitability lever rather than just an ops concern. Targets are the ones committed in
            the PRD.
          </p>
        </div>
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/opus-pass/commissions/analytics?days=${r}`}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-semibold',
                days === r
                  ? 'border-[#C9A0DC] bg-[#F5EFF7] text-[#4A2D5C]'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-[#C9A0DC]',
              )}
            >
              {r} days
            </Link>
          ))}
        </div>
      </header>

      {totalOrders === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center">
          <p className="text-sm font-semibold text-gray-900">No commissions in this period</p>
          <p className="mt-1 text-sm text-gray-600">
            Metrics appear once orders start flowing through the studio.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-600">
            {totalOrders} commission{totalOrders === 1 ? '' : 's'} created in the last {days} days.
          </p>

          <div className="grid gap-3 lg:grid-cols-2">
            {metrics.map((m) => (
              <MetricCard key={m.key} metric={m} />
            ))}
          </div>

          <section className="rounded-2xl border border-gray-100 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-900">Designer throughput</h2>
            <p className="mt-1 text-xs text-gray-500">
              Median first-draft time is measured from ACCEPTING a task, not from assignment, and
              excludes time the clock was paused waiting on the customer.
            </p>

            {designers.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500">No designer profiles yet.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wider text-gray-500">
                      <th className="pb-2 font-semibold">Designer</th>
                      <th className="pb-2 font-semibold">Grade</th>
                      <th className="pb-2 font-semibold">Delivered</th>
                      <th className="pb-2 font-semibold">Median first draft</th>
                      <th className="pb-2 font-semibold">SLA met</th>
                      <th className="pb-2 font-semibold">Avg rounds</th>
                      <th className="pb-2 font-semibold">Load</th>
                    </tr>
                  </thead>
                  <tbody>
                    {designers.map((d) => (
                      <tr key={d.displayName} className="border-b border-gray-50 last:border-0">
                        <td className="py-2 font-medium text-gray-900">{d.displayName}</td>
                        <td className="py-2 text-gray-600">{d.grade.replace(/_/g, ' ')}</td>
                        <td className="py-2 text-gray-900">{d.delivered}</td>
                        <td className="py-2 text-gray-600">
                          {d.medianFirstDraftHours === null ? '—' : `${d.medianFirstDraftHours}h`}
                        </td>
                        <td
                          className={cn(
                            'py-2 font-semibold',
                            d.slaAttainmentPct === null
                              ? 'text-gray-400'
                              : d.slaAttainmentPct >= 90
                                ? 'text-emerald-700'
                                : d.slaAttainmentPct >= 75
                                  ? 'text-amber-700'
                                  : 'text-rose-600',
                          )}
                        >
                          {d.slaAttainmentPct === null ? '—' : `${d.slaAttainmentPct}%`}
                        </td>
                        <td className="py-2 text-gray-600">{d.avgRevisionRounds ?? '—'}</td>
                        <td className="py-2 text-gray-600">
                          {d.openTasks}/{d.capacity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

/** A sample below this is not reported — it would be noise dressed as a result. */
const MIN_SAMPLE = 5

function MetricCard({ metric }: { metric: MetricRow }) {
  const thin = metric.sample < MIN_SAMPLE
  const meeting =
    metric.value === null
      ? null
      : metric.higherIsBetter
        ? metric.value >= metric.target
        : metric.value <= metric.target

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-gray-900">{metric.label}</p>
        <span className="shrink-0 text-xs text-gray-500">
          target {metric.higherIsBetter ? '≥' : '<'}
          {metric.target}%
        </span>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span
          className={cn(
            'text-2xl font-semibold tracking-tight',
            metric.value === null || thin
              ? 'text-gray-400'
              : meeting
                ? 'text-emerald-700'
                : 'text-rose-600',
          )}
        >
          {metric.value === null ? '—' : `${metric.value}%`}
        </span>
        <span className="text-xs text-gray-500">
          {thin
            ? `only ${metric.sample} order${metric.sample === 1 ? '' : 's'} — too few to read`
            : `n = ${metric.sample}`}
        </span>
      </div>

      {metric.note && <p className="mt-2 text-xs leading-relaxed text-gray-500">{metric.note}</p>}
    </div>
  )
}
