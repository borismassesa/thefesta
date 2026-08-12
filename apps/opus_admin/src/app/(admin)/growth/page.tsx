import Link from 'next/link'
import { hasAnyPermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import MonthPager from './_components/MonthPager'
import SetGrowthHeading from './_components/SetGrowthHeading'
import StatusPill from './_components/StatusPill'
import { GtCard, GtSectionHeader, GT } from './_components/ui'
import { computePercent, computeStatus, formatUnit } from './_lib/status'
import { getKpiActuals, getKpiTargets, type GrowthCategory } from './_lib/queries'
import { monthBounds, resolveTrackerMonth, TRACKER_START } from './_lib/period'

export const dynamic = 'force-dynamic'

const CATEGORY_LABEL: Record<GrowthCategory, string> = {
  sales_marketing: 'Sales & Marketing (3-person team)',
  social_media: 'Social Media (Mid baseline)',
  studio: 'Studio (Mid baseline)',
}

const CATEGORY_HREF: Record<GrowthCategory, string> = {
  sales_marketing: '/growth/marketing',
  social_media: '/growth/social',
  studio: '/growth/studio',
}

function firstParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

function monthLabel(monthKey: string): string {
  return new Date(`${monthKey}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function pctLabel(actual: number | null, target: number): string {
  const pct = computePercent(actual, target)
  if (pct === null) return '—'
  return `${Math.round(pct * 100)}%`
}

export default async function GrowthDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const canView = await hasAnyPermission(['growth.write', 'growth.admin'])
  if (!canView) throw new Error("You don't have permission to view the Growth Tracker.")

  const params = await searchParams
  const requested = firstParam(params?.month)
  const month = resolveTrackerMonth(requested)
  const bounds = monthBounds(month)
  const supabase = createSupabaseAdminClient()

  const [marketingTargets, socialTargets, studioTargets] = await Promise.all([
    getKpiTargets('sales_marketing'),
    getKpiTargets('social_media'),
    getKpiTargets('studio'),
  ])
  const allTargetIds = [...marketingTargets, ...socialTargets, ...studioTargets].map((t) => t.id)
  const allActuals = await getKpiActuals(allTargetIds)
  const actualByTargetId = new Map(
    allActuals.filter((a) => a.month === month).map((a) => [a.kpiTargetId, a] as const),
  )

  const [{ data: rosterRows }, { data: logRows }] = await Promise.all([
    supabase
      .from('growth_vendor_outreach_targets')
      .select('target_outreach, target_meetings, target_signed')
      .returns<{ target_outreach: number; target_meetings: number; target_signed: number }[]>(),
    supabase
      .from('growth_vendor_outreach_log')
      .select('stage, outcome, log_date')
      .gte('log_date', bounds.start)
      .lt('log_date', bounds.next)
      .returns<{ stage: string; outcome: string; log_date: string }[]>(),
  ])

  const outreachTarget = (rosterRows ?? []).reduce((s, r) => s + r.target_outreach, 0)
  const meetingsTarget = (rosterRows ?? []).reduce((s, r) => s + r.target_meetings, 0)
  const signedTarget = (rosterRows ?? []).reduce((s, r) => s + r.target_signed, 0)

  const rows = logRows ?? []
  const outreachActual = rows.length
  const meetingsActual = rows.filter((r) =>
    ['4. Meeting Held', '5. Proposal Sent', '6. Signed Up'].includes(r.stage),
  ).length
  const signedActual = rows.filter((r) => r.outcome === 'Won — Signed Up').length

  function metricTable(
    items: {
      key: string
      label: string
      target: number
      actual: number | null
      unit: string
      notes: string
    }[],
  ) {
    return (
      <div className={GT.tableShell}>
        <table className={GT.table}>
          <thead>
            <tr>
              <th>Metric</th>
              <th data-numeric="true">Target</th>
              <th data-numeric="true">Actual</th>
              <th data-numeric="true">% to Target</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const status = computeStatus(item.actual, item.target)
              return (
                <tr key={item.key}>
                  <th scope="row" className="opus-table-cell--leading">
                    {item.label}
                  </th>
                  <td data-numeric="true">{formatUnit(item.target, item.unit)}</td>
                  <td data-numeric="true">
                    {item.actual === null ? '—' : formatUnit(item.actual, item.unit)}
                  </td>
                  <td data-numeric="true">{pctLabel(item.actual, item.target)}</td>
                  <td className="opus-table-cell--status">
                    <StatusPill status={status} />
                  </td>
                  <td className="text-gray-500">
                    {item.notes ||
                      (status === 'behind' ? 'Needs a comment on the tracker page.' : '—')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  function categorySection(category: GrowthCategory, targets: typeof marketingTargets) {
    return (
      <GtCard key={category}>
        <GtSectionHeader
          title={CATEGORY_LABEL[category]}
          action={
            <Link href={`${CATEGORY_HREF[category]}?month=${month}`} className={GT.link}>
              View tracker →
            </Link>
          }
        />
        {metricTable(
          targets.map((t) => {
            const row = actualByTargetId.get(t.id)
            return {
              key: t.id,
              label: t.label,
              target: t.monthlyTarget,
              actual: row?.actual ?? null,
              unit: t.unit,
              notes: row?.notes ?? '',
            }
          }),
        )}
      </GtCard>
    )
  }

  return (
    <div className="space-y-5 pb-10">
      <SetGrowthHeading
        title="Monthly Dashboard"
        subtitle={`Roll-up of all trackers · starts ${monthLabel(TRACKER_START)}`}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">
            Reporting period
          </p>
          <p className="mt-0.5 text-sm text-gray-600">
            Fill Actuals on each tracker at month-end. % to Target and Status auto-calculate.
          </p>
        </div>
        <MonthPager month={month} hrefForMonth={(m) => `/growth?month=${m}`} />
      </div>

      <GtCard>
        <GtSectionHeader
          title={
            <>
              Vendor Outreach <span className="font-normal text-[#7E5896]/70">(all staff)</span>
            </>
          }
          action={
            <Link href={`/growth/vendor-outreach?month=${month}`} className={GT.link}>
              View tracker →
            </Link>
          }
        />
        {metricTable([
          {
            key: 'outreach',
            label: 'Total Outreaches (all staff)',
            target: outreachTarget,
            actual: outreachActual,
            unit: 'count',
            notes: '',
          },
          {
            key: 'meetings',
            label: 'Total Meetings Secured',
            target: meetingsTarget,
            actual: meetingsActual,
            unit: 'count',
            notes: '',
          },
          {
            key: 'signed',
            label: 'Total Vendors Signed Up',
            target: signedTarget,
            actual: signedActual,
            unit: 'count',
            notes: '',
          },
        ])}
      </GtCard>

      {categorySection('sales_marketing', marketingTargets)}
      {categorySection('social_media', socialTargets)}
      {categorySection('studio', studioTargets)}

      <GtCard padded>
        <p className="text-[13px] font-semibold text-gray-900">How to use this dashboard</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[13px] text-gray-600">
          <li>Trackers start June 2026. Vendor targets are aggressive by design.</li>
          <li>
            ✓ Met = 100%+, ~ On Track = 60–99%, ✗ Behind = under 60%. Anything Behind needs a Note.
          </li>
          <li>
            Vendor Outreach actuals come live from the outreach log. Marketing, Social, and Studio
            actuals are entered on their tracker pages.
          </li>
          <li>
            Social Media and Studio sit at the Mid baseline — steady, not pressured. Vendor
            acquisition is where the push is.
          </li>
        </ul>
      </GtCard>
    </div>
  )
}
