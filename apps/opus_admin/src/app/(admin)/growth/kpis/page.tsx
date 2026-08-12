import { hasAnyPermission } from '@/lib/admin-auth'
import { DEPARTMENTS } from '../../workforce/_lib/types'
import { getGrowthEmployeeOptions } from '../_lib/queries'
import SetGrowthHeading from '../_components/SetGrowthHeading'
import GrowthFoundationsUnavailable from '../_components/GrowthFoundationsUnavailable'
import { isGrowthFoundationsUnavailableError } from '../_lib/foundation-availability'
import {
  approveTargetAction,
  archiveMetricDefinitionAction,
  createManualActualAction,
  createManualOverrideAction,
  createMetricDefinitionAction,
  createTargetDraftAction,
  createTargetRevisionAction,
  rejectTargetAction,
  submitTargetAction,
} from '../foundations/actions'
import {
  listGrowthActuals,
  listGrowthBusinessUnits,
  listGrowthMetricDefinitions,
  listGrowthPeriods,
  listGrowthTargets,
} from '../foundations/queries'
import { calculateGrowthKpiStatus } from '../foundations/status-engine'

export const dynamic = 'force-dynamic'

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

function decimalLabel(value: string | null, unit: string): string {
  if (value === null) return '—'
  return unit === 'currency' ? `TZS ${Number(value).toLocaleString('en-US')}` : value
}

async function loadGrowthKpiData() {
  try {
    return await Promise.all([
      listGrowthBusinessUnits(),
      listGrowthPeriods(),
      listGrowthMetricDefinitions(),
      listGrowthTargets(),
      listGrowthActuals(),
      getGrowthEmployeeOptions(),
    ])
  } catch (error) {
    if (isGrowthFoundationsUnavailableError(error)) return null
    throw error
  }
}

export default async function GrowthKpisPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const canRead = await hasAnyPermission(['growth.kpi.read', 'growth.read', 'growth.write', 'growth.admin'])
  if (!canRead) throw new Error("You don't have permission to view Growth KPIs.")
  const [canManage, canApprove, canEnterActual, canOverrideActual] = await Promise.all([
    hasAnyPermission(['growth.kpi.manage', 'growth.admin']),
    hasAnyPermission(['growth.kpi.approve', 'growth.admin']),
    hasAnyPermission(['growth.actual.enter', 'growth.admin']),
    hasAnyPermission(['growth.actual.override', 'growth.admin']),
  ])

  const growthData = await loadGrowthKpiData()
  if (!growthData) {
    return (
      <GrowthFoundationsUnavailable
        title="Growth KPIs"
        subtitle="Canonical metric definitions, target versions, and actual history."
      />
    )
  }
  const [businessUnits, periods, metrics, targets, actuals, employees] = growthData

  const params = await searchParams
  const q = firstParam(params?.q).trim().toLowerCase()
  const visibleMetrics = q
    ? metrics.filter((metric) => `${metric.code} ${metric.name} ${metric.description}`.toLowerCase().includes(q))
    : metrics
  const businessUnitById = new Map(businessUnits.map((unit) => [unit.id, unit]))
  const periodById = new Map(periods.map((period) => [period.id, period]))
  const openPeriods = periods.filter((period) => period.status === 'open')

  return (
    <div className="space-y-6 pb-16">
      <SetGrowthHeading title="Growth KPIs" subtitle="Canonical metric definitions, target versions, and actual history." />

      <form className="flex gap-2 text-[12px]">
        <input type="search" name="q" defaultValue={q} className="w-full rounded-md border border-gray-200 bg-white px-3 py-2" placeholder="Search metric code, name, or description" />
        <button data-opus-button="neutral" data-opus-button-size="medium" className="rounded-md border border-gray-200 bg-white px-3 py-2 font-semibold text-gray-700">Search</button>
      </form>

      {canManage ? (
        <form action={createMetricDefinitionAction} className="grid gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-[12px] shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)] md:grid-cols-6">
          <label className="space-y-1">
            <span className="font-medium text-gray-600">Code</span>
            <input name="code" required className="w-full rounded-md border border-gray-200 px-2 py-2" placeholder="MONTHLY_REVENUE" />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="font-medium text-gray-600">Name</span>
            <input name="name" required className="w-full rounded-md border border-gray-200 px-2 py-2" />
          </label>
          <label className="space-y-1">
            <span className="font-medium text-gray-600">Business Unit</span>
            <select name="businessUnitId" className="w-full rounded-md border border-gray-200 px-2 py-2">
              <option value="">Organization-wide</option>
              {businessUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="font-medium text-gray-600">Department</span>
            <select name="department" className="w-full rounded-md border border-gray-200 px-2 py-2">
              <option value="">Any</option>
              {DEPARTMENTS.map((department) => <option key={department} value={department}>{department}</option>)}
            </select>
          </label>
          <button data-opus-button="primary" data-opus-button-size="medium" className="self-end rounded-xl bg-[#7E5896] px-4 py-2.5 font-semibold text-white hover:bg-[#6c4884]">Create Metric</button>
          <label className="space-y-1 md:col-span-2">
            <span className="font-medium text-gray-600">Unit</span>
            <select name="measurementUnit" className="w-full rounded-md border border-gray-200 px-2 py-2">
              {['count', 'currency', 'percentage', 'decimal', 'days', 'hours', 'score', 'ratio'].map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="font-medium text-gray-600">Source</span>
            <select name="sourceMode" className="w-full rounded-md border border-gray-200 px-2 py-2">
              {['manual', 'calculated', 'hybrid'].map((mode) => <option key={mode} value={mode}>{mode}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="font-medium text-gray-600">Direction</span>
            <select name="direction" className="w-full rounded-md border border-gray-200 px-2 py-2">
              {['higher_is_better', 'lower_is_better', 'target_range', 'informational'].map((direction) => <option key={direction} value={direction}>{direction}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="font-medium text-gray-600">Aggregation</span>
            <select name="aggregationMethod" className="w-full rounded-md border border-gray-200 px-2 py-2">
              {['sum', 'average', 'weighted_average', 'latest', 'minimum', 'maximum', 'ratio', 'percentage', 'formula'].map((method) => <option key={method} value={method}>{method}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="font-medium text-gray-600">Value Type</span>
            <select name="valueType" className="w-full rounded-md border border-gray-200 px-2 py-2">
              {['integer', 'decimal', 'currency', 'percentage', 'duration', 'score', 'ratio'].map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <input type="hidden" name="defaultCurrencyCode" value="TZS" />
          <input type="hidden" name="reviewFrequency" value="monthly" />
          <label className="space-y-1 md:col-span-2">
            <span className="font-medium text-gray-600">Calculation Key</span>
            <input name="calculationKey" className="w-full rounded-md border border-gray-200 px-2 py-2" placeholder="Optional safe key" />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="font-medium text-gray-600">Data Source Key</span>
            <input name="dataSourceKey" className="w-full rounded-md border border-gray-200 px-2 py-2" placeholder="Optional safe key" />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="font-medium text-gray-600">Owner</span>
            <select name="ownerEmployeeId" className="w-full rounded-md border border-gray-200 px-2 py-2">
              <option value="">Unassigned</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 md:col-span-6">
            <span className="font-medium text-gray-600">Description</span>
            <input name="description" className="w-full rounded-md border border-gray-200 px-2 py-2" />
          </label>
        </form>
      ) : null}

      <div className="space-y-4">
        {visibleMetrics.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-[12px] text-gray-500">
            No Growth KPI definitions match this view.
          </div>
        ) : visibleMetrics.map((metric) => {
          const metricTargets = targets.filter((target) => target.metricDefinitionId === metric.id)
          const metricActuals = actuals.filter((actual) => actual.metricDefinitionId === metric.id)
          const currentTarget = metricTargets.find((target) => target.isCurrent) ?? null
          const currentActual = metricActuals.find((actual) => actual.isCurrent) ?? null
          const currentPeriod = currentTarget ? periodById.get(currentTarget.periodId) ?? null : null
          const status = currentTarget && currentActual && currentPeriod
            ? calculateGrowthKpiStatus({
              direction: metric.direction,
              targetValue: currentTarget.targetValue,
              lowerBound: currentTarget.lowerBound,
              upperBound: currentTarget.upperBound,
              currentActual: currentActual.value,
              periodStart: currentPeriod.startDate,
              periodEndExclusive: currentPeriod.endDate,
              asOfDate: currentActual.asOfDate,
            })
            : null

          return (
            <section key={metric.id} className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
              <div className="grid gap-3 border-b border-gray-100 px-4 py-3 text-[12px] md:grid-cols-[1fr_auto]">
                <div>
                  <div className="font-mono text-[11px] font-semibold text-gray-500">{metric.code}</div>
                  <h2 className="text-[15px] font-semibold text-gray-900">{metric.name}</h2>
                  <p className="mt-1 text-gray-500">{metric.description || 'No description.'}</p>
                </div>
                <div className="grid gap-1 text-right text-gray-500">
                  <span>{metric.isActive ? 'Active' : 'Inactive'} · {metric.sourceMode} · {metric.direction}</span>
                  <span>{businessUnitById.get(metric.businessUnitId ?? '')?.name ?? 'Organization-wide'} · {metric.measurementUnit} · {metric.aggregationMethod}</span>
                  {status ? <span className="font-semibold text-gray-900">Health: {status.status}</span> : <span>No current target and actual.</span>}
                </div>
              </div>

              <div className="grid gap-4 p-4 text-[12px] xl:grid-cols-2">
                <div className="space-y-3">
                  <div className="font-semibold text-gray-800">Targets</div>
                  {canManage && openPeriods.length > 0 ? (
                    <form action={createTargetDraftAction} className="grid gap-2 rounded-lg border border-gray-100 p-3 md:grid-cols-4">
                      <input type="hidden" name="metricDefinitionId" value={metric.id} />
                      <input type="hidden" name="direction" value={metric.direction} />
                      <select name="periodId" className="rounded-md border border-gray-200 px-2 py-2">
                        {openPeriods.map((period) => <option key={period.id} value={period.id}>{period.label}</option>)}
                      </select>
                      <input name="targetValue" className="rounded-md border border-gray-200 px-2 py-2" placeholder="Target" />
                      <input name="lowerBound" className="rounded-md border border-gray-200 px-2 py-2" placeholder="Lower bound" />
                      <input name="upperBound" className="rounded-md border border-gray-200 px-2 py-2" placeholder="Upper bound" />
                      <select name="businessUnitId" className="rounded-md border border-gray-200 px-2 py-2">
                        <option value="">Org scope</option>
                        {businessUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                      </select>
                      <select name="department" className="rounded-md border border-gray-200 px-2 py-2">
                        <option value="">Any department</option>
                        {DEPARTMENTS.map((department) => <option key={department} value={department}>{department}</option>)}
                      </select>
                      <select name="ownerEmployeeId" className="rounded-md border border-gray-200 px-2 py-2">
                        <option value="">No owner</option>
                        {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                      </select>
                      <button data-opus-button="control" className="rounded-md border border-gray-200 px-2 py-2 font-semibold text-gray-700">Create Draft</button>
                    </form>
                  ) : null}
                  <div className="overflow-x-auto">
                    <table className="opus-table w-full">
                      <thead>
                        <tr>
                          <th>Period</th>
                          <th data-numeric="true">Target</th>
                          <th>Status</th>
                          <th data-numeric="true">Rev</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {metricTargets.length === 0 ? (
                          <tr><td colSpan={5} className="py-4 text-gray-500">No target versions.</td></tr>
                        ) : metricTargets.map((target) => (
                          <tr key={target.id}>
                            <th scope="row" className="opus-table-cell--leading">{periodById.get(target.periodId)?.label ?? 'Unknown'}</th>
                            <td data-numeric="true">
                              {metric.direction === 'target_range'
                                ? `${decimalLabel(target.lowerBound, metric.measurementUnit)} - ${decimalLabel(target.upperBound, metric.measurementUnit)}`
                                : decimalLabel(target.targetValue, metric.measurementUnit)}
                            </td>
                            <td className="opus-table-cell--status">{target.status}{target.isCurrent ? ' · current' : ''}</td>
                            <td data-numeric="true">{target.revisionNumber}</td>
                            <td>
                              <div className="flex flex-wrap gap-1">
                                {canManage && target.status === 'draft' ? (
                                  <form action={submitTargetAction}>
                                    <input type="hidden" name="targetId" value={target.id} />
                                    <input type="hidden" name="lockVersion" value={target.lockVersion} />
                                    <button data-opus-button="control" className="rounded-md border border-gray-200 px-2 py-1 text-gray-700">Submit</button>
                                  </form>
                                ) : null}
                                {canApprove && target.status === 'pending_approval' ? (
                                  <>
                                    <form action={approveTargetAction}>
                                      <input type="hidden" name="targetId" value={target.id} />
                                      <input type="hidden" name="lockVersion" value={target.lockVersion} />
                                      <button data-opus-button="control" className="rounded-md border border-gray-200 px-2 py-1 text-gray-700">Approve</button>
                                    </form>
                                    <form action={rejectTargetAction}>
                                      <input type="hidden" name="targetId" value={target.id} />
                                      <input type="hidden" name="lockVersion" value={target.lockVersion} />
                                      <input type="hidden" name="reason" value="Rejected from Phase 1A KPI page" />
                                      <button data-opus-button="control" className="rounded-md border border-gray-200 px-2 py-1 text-gray-700">Reject</button>
                                    </form>
                                  </>
                                ) : null}
                                {canManage && target.status === 'approved' ? (
                                  <form action={createTargetRevisionAction}>
                                    <input type="hidden" name="targetId" value={target.id} />
                                    <input type="hidden" name="reason" value="Revision started from Phase 1A KPI page" />
                                    <button data-opus-button="control" className="rounded-md border border-gray-200 px-2 py-1 text-gray-700">Revise</button>
                                  </form>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="font-semibold text-gray-800">Actuals</div>
                  {canEnterActual && openPeriods.length > 0 && ['manual', 'hybrid'].includes(metric.sourceMode) ? (
                    <form action={createManualActualAction} className="grid gap-2 rounded-lg border border-gray-100 p-3 md:grid-cols-4">
                      <input type="hidden" name="metricDefinitionId" value={metric.id} />
                      <select name="periodId" className="rounded-md border border-gray-200 px-2 py-2">
                        {openPeriods.map((period) => <option key={period.id} value={period.id}>{period.label}</option>)}
                      </select>
                      <input name="asOfDate" type="date" required className="rounded-md border border-gray-200 px-2 py-2" />
                      <input name="value" required className="rounded-md border border-gray-200 px-2 py-2" placeholder="Actual" />
                      <button data-opus-button="control" className="rounded-md border border-gray-200 px-2 py-2 font-semibold text-gray-700">Enter Actual</button>
                    </form>
                  ) : null}
                  <div className="overflow-x-auto">
                    <table className="opus-table w-full">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th data-numeric="true">Value</th>
                          <th>Origin</th>
                          <th>Current</th>
                          <th>Override</th>
                        </tr>
                      </thead>
                      <tbody>
                        {metricActuals.length === 0 ? (
                          <tr><td colSpan={5} className="py-4 text-gray-500">No actual values.</td></tr>
                        ) : metricActuals.map((actual) => (
                          <tr key={actual.id}>
                            <td className="font-mono">{actual.asOfDate}</td>
                            <td data-numeric="true">{decimalLabel(actual.value, metric.measurementUnit)}</td>
                            <td>{actual.originType}</td>
                            <td>{actual.isCurrent ? 'Yes' : 'No'}</td>
                            <td>
                              {canOverrideActual && actual.isCurrent ? (
                                <form action={createManualOverrideAction} className="flex gap-1">
                                  <input type="hidden" name="actualId" value={actual.id} />
                                  <input name="value" required className="w-24 rounded-md border border-gray-200 px-2 py-1" placeholder="Value" />
                                  <input name="reason" required className="w-40 rounded-md border border-gray-200 px-2 py-1" placeholder="Reason" />
                                  <button data-opus-button="control" className="rounded-md border border-gray-200 px-2 py-1 text-gray-700">Override</button>
                                </form>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {canManage ? (
                <form action={archiveMetricDefinitionAction} className="border-t border-gray-100 px-4 py-3 text-right">
                  <input type="hidden" name="id" value={metric.id} />
                  <input type="hidden" name="lockVersion" value={metric.lockVersion} />
                  <button data-opus-button="control" disabled={Boolean(metric.archivedAt)} className="rounded-md border border-gray-200 px-3 py-1.5 text-[12px] font-medium text-gray-700 disabled:text-gray-300">
                    Archive Metric
                  </button>
                </form>
              ) : null}
            </section>
          )
        })}
      </div>
    </div>
  )
}
