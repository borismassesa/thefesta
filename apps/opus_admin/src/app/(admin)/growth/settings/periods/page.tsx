import { hasAnyPermission } from '@/lib/admin-auth'
import GrowthFoundationsUnavailable from '../../_components/GrowthFoundationsUnavailable'
import SetGrowthHeading from '../../_components/SetGrowthHeading'
import { isGrowthFoundationsUnavailableError } from '../../_lib/foundation-availability'
import { closePeriodAction, createPeriodAction, lockPeriodAction } from '../../foundations/actions'
import { listGrowthPeriods } from '../../foundations/queries'

export const dynamic = 'force-dynamic'

export default async function GrowthPeriodsPage() {
  const canManage = await hasAnyPermission(['growth.period.manage', 'growth.admin'])
  if (!canManage) throw new Error("You don't have permission to manage Growth periods.")
  let periods
  try {
    periods = await listGrowthPeriods()
  } catch (error) {
    if (!isGrowthFoundationsUnavailableError(error)) throw error
    return (
      <GrowthFoundationsUnavailable
        title="Growth Periods"
        subtitle="Calendar reporting periods with exclusive end dates."
      />
    )
  }

  return (
    <div className="space-y-6 pb-16">
      <SetGrowthHeading title="Growth Periods" subtitle="Calendar reporting periods with exclusive end dates." />

      <div className="rounded-2xl border border-gray-100 bg-white p-4 text-[12px] text-gray-600 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
        <div className="grid gap-2 md:grid-cols-3">
          <div><span className="font-semibold text-gray-800">Open:</span> KPI targets and actuals can be created.</div>
          <div><span className="font-semibold text-gray-800">Locked:</span> new target and actual mutations are blocked by the database.</div>
          <div><span className="font-semibold text-gray-800">Closed:</span> final state for Phase 1A; reopening is deferred to an audited future operation.</div>
        </div>
      </div>

      <form action={createPeriodAction} className="grid gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-[12px] shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)] md:grid-cols-5">
        <label className="space-y-1">
          <span className="font-medium text-gray-600">Type</span>
          <select name="periodType" className="w-full rounded-md border border-gray-200 px-2 py-2">
            <option value="month">Month</option>
            <option value="quarter">Quarter</option>
            <option value="year">Year</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="font-medium text-gray-600">Start Date</span>
          <input name="startDate" type="date" required className="w-full rounded-md border border-gray-200 px-2 py-2" />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="font-medium text-gray-600">Label</span>
          <input name="label" className="w-full rounded-md border border-gray-200 px-2 py-2" placeholder="Optional; generated when blank" />
        </label>
        <button className="self-end rounded-md bg-gray-900 px-3 py-2 font-semibold text-white hover:bg-gray-700">
          Create Period
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
        <table className="w-full text-left text-[12px]">
          <thead className="border-b border-gray-100 text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Label</th>
              <th className="px-3 py-3 font-medium">Type</th>
              <th className="px-3 py-3 font-medium">Start</th>
              <th className="px-3 py-3 font-medium">Exclusive End</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {periods.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No Growth periods have been created.</td></tr>
            ) : periods.map((period) => (
              <tr key={period.id} className="border-b border-gray-50">
                <td className="px-4 py-3 font-semibold text-gray-800">{period.label}</td>
                <td className="px-3 py-3 text-gray-600">{period.periodType}</td>
                <td className="px-3 py-3 font-mono text-gray-600">{period.startDate}</td>
                <td className="px-3 py-3 font-mono text-gray-600">{period.endDate}</td>
                <td className="px-3 py-3 text-gray-600">{period.status}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <form action={lockPeriodAction}>
                      <input type="hidden" name="id" value={period.id} />
                      <button disabled={period.status !== 'open'} className="rounded-md border border-gray-200 px-2 py-1 font-medium text-gray-700 disabled:text-gray-300">
                        Lock
                      </button>
                    </form>
                    <form action={closePeriodAction}>
                      <input type="hidden" name="id" value={period.id} />
                      <button disabled={period.status === 'closed'} className="rounded-md border border-gray-200 px-2 py-1 font-medium text-gray-700 disabled:text-gray-300">
                        Close
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
