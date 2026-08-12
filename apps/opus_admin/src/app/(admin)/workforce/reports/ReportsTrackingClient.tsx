'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { CalendarDays, Eye, FileText, Users, X } from 'lucide-react'
import type { ReportSubmission } from '../_lib/report-schema'
import { ReportViewerModal } from '../_components/ReportDocument'

type Option = { id: string; name: string }

function formatGroupDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

function groupByDate(reports: ReportSubmission[]): Array<[string, ReportSubmission[]]> {
  const map = new Map<string, ReportSubmission[]>()
  for (const r of reports) {
    const list = map.get(r.reportDate)
    if (list) list.push(r)
    else map.set(r.reportDate, [r])
  }
  return [...map.entries()]
}

export default function ReportsTrackingClient({
  reports,
  templates,
  employees,
  activeTemplateId,
  activeEmployeeId,
  activeDate,
}: {
  reports: ReportSubmission[]
  templates: Option[]
  employees: Option[]
  activeTemplateId: string | null
  activeEmployeeId: string | null
  activeDate: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [viewing, setViewing] = useState<ReportSubmission | null>(null)

  function applyFilters(next: {
    template?: string | null
    employee?: string | null
    date?: string | null
  }) {
    const params = new URLSearchParams()
    const template = next.template !== undefined ? next.template : activeTemplateId
    const employee = next.employee !== undefined ? next.employee : activeEmployeeId
    const date = next.date !== undefined ? next.date : activeDate
    if (template) params.set('template', template)
    if (employee) params.set('employee', employee)
    if (date) params.set('date', date)
    const qs = params.toString()
    startTransition(() => {
      router.push(qs ? `/workforce/reports?${qs}` : '/workforce/reports')
    })
  }

  const hasFilters = Boolean(activeTemplateId || activeEmployeeId || activeDate)
  const groups = groupByDate(reports)

  const selectCls =
    'rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-900 focus:border-gray-400 focus:outline-none'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <label className="flex items-center gap-2 text-xs font-medium text-gray-500">
          <FileText className="h-4 w-4 text-gray-400" />
          <select
            value={activeTemplateId ?? ''}
            onChange={(e) => applyFilters({ template: e.target.value || null })}
            className={selectCls}
          >
            <option value="">All report types</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-gray-500">
          <Users className="h-4 w-4 text-gray-400" />
          <select
            value={activeEmployeeId ?? ''}
            onChange={(e) => applyFilters({ employee: e.target.value || null })}
            className={selectCls}
          >
            <option value="">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-gray-500">
          <CalendarDays className="h-4 w-4 text-gray-400" />
          <input
            type="date"
            value={activeDate ?? ''}
            onChange={(e) => applyFilters({ date: e.target.value || null })}
            className={selectCls}
          />
        </label>
        {hasFilters && (
          <button data-opus-button="control"
            type="button"
            onClick={() => applyFilters({ template: null, employee: null, date: null })}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
        <span className="ml-auto text-xs text-gray-400">
          {pending ? 'Loading…' : `${reports.length} report${reports.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          <p className="text-sm font-semibold text-gray-900">No reports found</p>
          <p className="mt-1 text-xs text-gray-500">
            {hasFilters ? 'Try different filters.' : 'Submitted reports show up here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(([date, dayReports]) => (
            <section key={date} className="space-y-3">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                {formatGroupDate(date)}
                <span className="ml-2 font-normal text-gray-400">{dayReports.length}</span>
              </h2>
              <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
                <ul className="divide-y divide-gray-100">
                  {dayReports.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-5 py-3.5">
                      {r.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-gray-700"
                          style={{ backgroundColor: r.avatarColor }}
                        >
                          {initials(r.employeeName)}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/workforce/performance/${r.employeeId}`}
                          className="truncate text-sm font-semibold text-gray-900 hover:text-[#6B4E8C] hover:underline"
                        >
                          {r.employeeName}
                        </Link>
                        <p className="truncate text-[11px] text-gray-500">
                          {r.templateName}
                          {r.department && <> · {r.department}</>}
                          {r.recipientName && <> · To {r.recipientName}</>}
                        </p>
                      </div>
                      <button data-opus-button="control"
                        type="button"
                        onClick={() => setViewing(r)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <Eye className="h-3 w-3" /> View
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </div>
      )}

      {viewing && <ReportViewerModal submission={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}
