import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import WorkforceHeading from '../../_components/PageHeading'
import {
  getAssignedTasksForEmployee,
  getEmployeeById,
  getPunchesForEmployee,
  getReportsForEmployee,
} from '../../_lib/queries'
import { summarizePunchesByDay } from '../../_lib/time-summary'
import PerformanceReports from '../PerformanceReports'
import RangeTabs from '../RangeTabs'
import ExportButton from '../ExportButton'
import { formatHours, parsePeriod, performanceWindow, PERF_TZ } from '../_range'

export const dynamic = 'force-dynamic'

// Per-employee performance + history. Reports submitted, clock in/out
// history, and task progress over the last 30 days. Gated by the
// (admin)/workforce layout (workforce.read).

function timeOnly(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString(undefined, {
    timeZone: PERF_TZ,
    hour: 'numeric',
    minute: '2-digit',
  })
}

function dayLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-500">{sub}</p>}
    </div>
  )
}

export default async function EmployeePerformancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ range?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const period = parsePeriod(sp.range)
  const w = performanceWindow(period)

  const [employee, reports, tasks, punches] = await Promise.all([
    getEmployeeById(id),
    getReportsForEmployee(id),
    getAssignedTasksForEmployee(id),
    getPunchesForEmployee(id, w.startIso, w.endExclusiveIso),
  ])
  if (!employee) notFound()

  const days = summarizePunchesByDay(punches, PERF_TZ).slice().reverse() // newest first
  const totalMinutes = days.reduce((s, d) => s + d.workedMinutes, 0)
  const daysPresent = days.length
  const avgMinutes = daysPresent > 0 ? Math.round(totalMinutes / daysPresent) : 0

  const reportsInWindow = reports.filter(
    (r) => r.status === 'submitted' && r.reportDate >= w.startDate,
  ).length
  // Tasks due within the window. A task with no due_date can't be placed in
  // a dated window, so it's excluded here — the generator always stamps a
  // due_date, so in practice every instance is covered. The open/done lists
  // below are derived from the same set so the listed tasks always match the
  // "X/Y done" stat above them.
  const windowTasks = tasks.filter((t) => (t.dueDate ?? '') >= w.startDate)
  const tasksDone = windowTasks.filter((t) => t.status === 'Done').length
  const tasksTotal = windowTasks.length
  const completionPct = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0

  const openTasks = windowTasks.filter((t) => t.status === 'Todo' || t.status === 'In Progress')
  const doneTasks = windowTasks.filter((t) => t.status === 'Done')

  const clockExportRows = days.map((d) => [
    d.date,
    timeOnly(d.firstInIso),
    d.openShift ? '' : timeOnly(d.lastOutIso),
    d.workedMinutes > 0 ? formatHours(d.workedMinutes) : '0',
    d.openShift ? 'Yes' : 'No',
  ])
  const reportExportRows = reports.map((r) => [r.reportDate, r.templateName, r.status])

  return (
    <div className="pb-12">
      <WorkforceHeading
        title={employee.name}
        subtitle={`${employee.jobTitle} · ${employee.department}`}
      />
      <div className="space-y-6 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/workforce/performance"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800"
          >
            <ChevronLeft className="h-4 w-4" /> All performance
          </Link>
          <RangeTabs active={period} />
        </div>

        {/* Summary */}
        <div>
          <p className="mb-2 text-[11px] font-medium text-gray-400">{w.label} · {w.rangeLabel}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Reports" value={String(reportsInWindow)} sub="submitted" />
            <StatCard
              label="Task completion"
              value={tasksTotal > 0 ? `${completionPct}%` : '—'}
              sub={tasksTotal > 0 ? `${tasksDone}/${tasksTotal} done` : 'no tasks due'}
            />
            <StatCard label="Days clocked in" value={String(daysPresent)} sub={w.label.toLowerCase()} />
            <StatCard
              label="Hours worked"
              value={totalMinutes > 0 ? `${formatHours(totalMinutes)}h` : '—'}
              sub={avgMinutes > 0 ? `avg ${formatHours(avgMinutes)}h/day` : undefined}
            />
          </div>
        </div>

        {/* Reports */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Reports <span className="ml-2 font-normal text-gray-400">{reports.length}</span>
            </h2>
            {reports.length > 0 && (
              <ExportButton
                headers={['Date', 'Report type', 'Status']}
                rows={reportExportRows}
                filename={`${employee.name}-reports.csv`}
              />
            )}
          </div>
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            <PerformanceReports reports={reports} />
          </div>
        </section>

        {/* Time clock */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Time clock <span className="ml-2 font-normal text-gray-400">{w.label.toLowerCase()}</span>
            </h2>
            {days.length > 0 && (
              <ExportButton
                headers={['Day', 'Clock in', 'Clock out', 'Hours', 'Open shift']}
                rows={clockExportRows}
                filename={`${employee.name}-timeclock-${w.startDate}-to-${w.endDate}.csv`}
              />
            )}
          </div>
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            {days.length === 0 ? (
              <p className="px-5 py-6 text-center text-xs text-gray-400">No clock-ins in this window.</p>
            ) : (
              <table className="opus-table w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    <th className="px-5 py-2.5">Day</th>
                    <th className="px-3 py-2.5">Clock in</th>
                    <th className="px-3 py-2.5">Clock out</th>
                    <th className="px-5 py-2.5 text-right">Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {days.map((d) => (
                    <tr key={d.date} className="hover:bg-gray-50/70">
                      <td className="px-5 py-2.5 font-medium text-gray-900">{dayLabel(d.date)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-gray-700">{timeOnly(d.firstInIso)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-gray-700">
                        {d.openShift ? (
                          <span className="text-[#6B4E8C]">Still in</span>
                        ) : (
                          timeOnly(d.lastOutIso)
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-gray-700">
                        {d.workedMinutes > 0 ? `${formatHours(d.workedMinutes)}h` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Tasks */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
            Tasks <span className="ml-2 font-normal text-gray-400">{openTasks.length} open · {doneTasks.length} done</span>
          </h2>
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            {windowTasks.length === 0 ? (
              <p className="px-5 py-6 text-center text-xs text-gray-400">No tasks due in this window.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {[...openTasks, ...doneTasks].map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${t.status === 'Done' ? 'bg-[#9FE870]/30 text-gray-900' : t.status === 'In Progress' ? 'bg-sky-50 text-sky-700' : 'bg-gray-100 text-gray-600'}`}
                    >
                      {t.status}
                    </span>
                    <span className={`min-w-0 flex-1 truncate text-sm ${t.status === 'Done' ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                      {t.title}
                    </span>
                    {t.dueDate && (
                      <span className="shrink-0 text-[11px] tabular-nums text-gray-400">{dayLabel(t.dueDate)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
