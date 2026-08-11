import Link from 'next/link'
import WorkforceHeading from '../_components/PageHeading'
import {
  getEmployees,
  getPunchesForRange,
  getReportCountsByEmployee,
  getTaskCountsByEmployee,
} from '../_lib/queries'
import { summarizePunchesByDay } from '../_lib/time-summary'
import type { TimePunch } from '../_lib/types'
import { formatHours, parsePeriod, performanceWindow, PERF_TZ } from './_range'
import RangeTabs from './RangeTabs'
import ExportButton from './ExportButton'

export const dynamic = 'force-dynamic'

// Team performance overview. The (admin)/workforce layout gates on
// workforce.read. Shows each employee's last-30-day activity: reports
// submitted, task completion, attendance days + hours. Rows link to the
// per-employee detail with full history.

function Avatar({ name, color, url }: { name: string; color: string; url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="h-8 w-8 rounded-full object-cover" />
  }
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
  return (
    <span
      className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold text-gray-700"
      style={{ backgroundColor: color }}
    >
      {initials}
    </span>
  )
}

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  const sp = await searchParams
  const period = parsePeriod(sp.range)
  const w = performanceWindow(period)
  const [employees, punches, reportCounts, taskCounts] = await Promise.all([
    getEmployees(),
    getPunchesForRange(w.startIso, w.endExclusiveIso),
    getReportCountsByEmployee(w.startDate),
    getTaskCountsByEmployee(w.startDate),
  ])

  // Group punches per employee so we can summarize attendance days/hours.
  const punchesByEmployee = new Map<string, TimePunch[]>()
  for (const p of punches) {
    const arr = punchesByEmployee.get(p.employeeId)
    if (arr) arr.push(p)
    else punchesByEmployee.set(p.employeeId, [p])
  }

  const rows = employees
    .map((e) => {
      const days = summarizePunchesByDay(punchesByEmployee.get(e.id) ?? [], PERF_TZ)
      const totalMinutes = days.reduce((s, d) => s + d.workedMinutes, 0)
      const tasks = taskCounts.get(e.id) ?? { total: 0, done: 0 }
      const lastIn = days.length > 0 ? days[days.length - 1].firstInIso : null
      return {
        employee: e,
        reports: reportCounts.get(e.id) ?? 0,
        tasksDone: tasks.done,
        tasksTotal: tasks.total,
        daysPresent: days.length,
        totalMinutes,
        lastIn,
      }
    })
    .sort((a, b) => b.daysPresent - a.daysPresent || b.reports - a.reports)

  const exportHeaders = [
    'Employee', 'Department', 'Reports', 'Tasks done', 'Tasks total', 'Days clocked in', 'Hours', 'Last clock-in',
  ]
  const exportRows = rows.map((r) => [
    r.employee.name,
    r.employee.department,
    r.reports,
    r.tasksDone,
    r.tasksTotal,
    r.daysPresent,
    r.totalMinutes > 0 ? formatHours(r.totalMinutes) : '0',
    r.lastIn ? new Date(r.lastIn).toLocaleString('en-GB', { timeZone: PERF_TZ }) : '',
  ])

  return (
    <div className="pb-12">
      <WorkforceHeading
        title="Performance"
        subtitle={`${w.label} (${w.rangeLabel}) — reports, tasks and attendance.`}
      />
      <div className="space-y-4 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <RangeTabs active={period} />
          <ExportButton
            headers={exportHeaders}
            rows={exportRows}
            filename={`performance-${w.startDate}-to-${w.endDate}.csv`}
          />
        </div>
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          <table className="opus-table w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3">Employee</th>
                <th className="px-3 py-3 text-center">Reports</th>
                <th className="px-3 py-3 text-center">Tasks</th>
                <th className="px-3 py-3 text-center">Days in</th>
                <th className="px-3 py-3 text-center">Hours</th>
                <th className="px-5 py-3 text-right">Last clock-in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.employee.id} className="hover:bg-gray-50/70">
                  <td className="px-5 py-3">
                    <Link href={`/workforce/performance/${r.employee.id}`} className="flex items-center gap-3">
                      <Avatar name={r.employee.name} color={r.employee.avatarColor} url={r.employee.avatarUrl} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-gray-900">{r.employee.name}</span>
                        <span className="block truncate text-[11px] text-gray-500">{r.employee.department}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-center tabular-nums text-gray-700">{r.reports}</td>
                  <td className="px-3 py-3 text-center tabular-nums text-gray-700">
                    {r.tasksTotal > 0 ? `${r.tasksDone}/${r.tasksTotal}` : '—'}
                  </td>
                  <td className="px-3 py-3 text-center tabular-nums text-gray-700">{r.daysPresent}</td>
                  <td className="px-3 py-3 text-center tabular-nums text-gray-700">
                    {r.totalMinutes > 0 ? `${formatHours(r.totalMinutes)}h` : '—'}
                  </td>
                  <td className="px-5 py-3 text-right text-[11px] text-gray-500">
                    {r.lastIn
                      ? new Date(r.lastIn).toLocaleString(undefined, {
                          timeZone: PERF_TZ,
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
