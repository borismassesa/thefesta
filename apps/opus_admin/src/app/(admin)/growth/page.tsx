import Link from 'next/link'
import { hasAnyPermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import SetGrowthHeading from './_components/SetGrowthHeading'
import StatusPill from './_components/StatusPill'
import { computeStatus, formatUnit } from './_lib/status'
import { getKpiActuals, getKpiTargets, type GrowthCategory } from './_lib/queries'
import { currentMonthKey, monthBounds } from './_lib/period'

export const dynamic = 'force-dynamic'

const CATEGORY_LABEL: Record<GrowthCategory, string> = {
  sales_marketing: 'Sales & Marketing (3-person team)',
  social_media: 'Social Media',
  studio: 'Studio Performance',
}

const CATEGORY_HREF: Record<GrowthCategory, string> = {
  sales_marketing: '/growth/marketing',
  social_media: '/growth/social',
  studio: '/growth/studio',
}

function monthLabel(monthKey: string): string {
  const d = new Date(`${monthKey}T00:00:00Z`)
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export default async function GrowthDashboardPage() {
  const canView = await hasAnyPermission(['growth.write', 'growth.admin'])
  if (!canView) throw new Error("You don't have permission to view the Growth Tracker.")

  const month = currentMonthKey()
  const bounds = monthBounds(month)
  const supabase = createSupabaseAdminClient()

  const [marketingTargets, socialTargets, studioTargets] = await Promise.all([
    getKpiTargets('sales_marketing'),
    getKpiTargets('social_media'),
    getKpiTargets('studio'),
  ])
  const allTargetIds = [...marketingTargets, ...socialTargets, ...studioTargets].map((t) => t.id)
  const allActuals = await getKpiActuals(allTargetIds)
  const actualByTargetId = new Map(allActuals.filter((a) => a.month === month).map((a) => [a.kpiTargetId, a.actual]))

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

  function categorySection(category: GrowthCategory, targets: typeof marketingTargets) {
    return (
      <div key={category} className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div className="text-[12px] font-semibold tracking-wide text-gray-900">{CATEGORY_LABEL[category].toUpperCase()}</div>
          <Link href={CATEGORY_HREF[category]} className="text-[12px] font-medium text-gray-500 hover:text-gray-800">
            View tracker →
          </Link>
        </div>
        <table className="opus-table w-full text-[12px]">
          <thead>
            <tr className="border-b border-gray-100 text-left text-gray-500">
              <th className="px-4 py-2 font-medium">Metric</th>
              <th className="px-3 py-2 font-medium">Target</th>
              <th className="px-3 py-2 font-medium">Actual</th>
              <th className="px-3 py-2 font-medium">% to Target</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => {
              const actual = actualByTargetId.get(t.id) ?? null
              const status = computeStatus(actual, t.monthlyTarget)
              return (
                <tr key={t.id} className="border-b border-gray-50">
                  <td className="px-4 py-2 text-gray-800">{t.label}</td>
                  <td className="px-3 py-2 text-gray-500">{formatUnit(t.monthlyTarget, t.unit)}</td>
                  <td className="px-3 py-2 text-gray-800">{actual === null ? '—' : formatUnit(actual, t.unit)}</td>
                  <td className="px-3 py-2 text-gray-500">
                    {actual === null || t.monthlyTarget === 0 ? '—' : `${((actual / t.monthlyTarget) * 100).toFixed(0)}%`}
                  </td>
                  <td className="px-3 py-2"><StatusPill status={status} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-16">
      <SetGrowthHeading title="Growth Tracker" subtitle={`Roll-up of all trackers · ${monthLabel(month)}`} />
      <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div className="text-[12px] font-semibold tracking-wide text-gray-900">
            VENDOR OUTREACH <span className="font-normal text-gray-400">(all staff)</span>
          </div>
          <Link href="/growth/vendor-outreach" className="text-[12px] font-medium text-gray-500 hover:text-gray-800">
            View tracker →
          </Link>
        </div>
        <table className="opus-table w-full text-[12px]">
          <thead>
            <tr className="border-b border-gray-100 text-left text-gray-500">
              <th className="px-4 py-2 font-medium">Metric</th>
              <th className="px-3 py-2 font-medium">Target</th>
              <th className="px-3 py-2 font-medium">Actual</th>
              <th className="px-3 py-2 font-medium">% to Target</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Total Outreaches', outreachTarget, outreachActual],
              ['Total Meetings Secured', meetingsTarget, meetingsActual],
              ['Total Vendors Signed Up', signedTarget, signedActual],
            ].map(([label, target, actual]) => {
              const status = computeStatus(actual as number, target as number)
              return (
                <tr key={label as string} className="border-b border-gray-50">
                  <td className="px-4 py-2 text-gray-800">{label}</td>
                  <td className="px-3 py-2 text-gray-500">{target}</td>
                  <td className="px-3 py-2 text-gray-800">{actual}</td>
                  <td className="px-3 py-2 text-gray-500">{target ? `${(((actual as number) / (target as number)) * 100).toFixed(0)}%` : '—'}</td>
                  <td className="px-3 py-2"><StatusPill status={status} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {categorySection('sales_marketing', marketingTargets)}
      {categorySection('social_media', socialTargets)}
      {categorySection('studio', studioTargets)}

      <div className="rounded-2xl border border-gray-100 bg-white p-4 text-[12px] text-gray-500 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
        <div className="mb-2 font-semibold text-gray-700">How to use this dashboard:</div>
        <ul className="list-disc space-y-1 pl-4">
          <li>Vendor Outreach actuals come live from the outreach log — no manual re-entry.</li>
          <li>Marketing / Social / Studio actuals are filled in each month-end on their own tracker page.</li>
          <li>✓ Met = 100%+, ~ On Track = 60–99%, ✗ Behind = &lt;60%.</li>
        </ul>
      </div>
    </div>
  )
}
