'use client'

import { useState } from 'react'
import { Eye } from 'lucide-react'
import type { ReportSubmission } from '../_lib/report-schema'
import { ReportViewerModal } from '../_components/ReportDocument'

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function PerformanceReports({ reports }: { reports: ReportSubmission[] }) {
  const [viewing, setViewing] = useState<ReportSubmission | null>(null)

  if (reports.length === 0) {
    return (
      <p className="px-5 py-6 text-center text-xs text-gray-400">No reports yet.</p>
    )
  }

  return (
    <>
      <ul className="divide-y divide-gray-100">
        {reports.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-gray-900">{r.templateName}</p>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${r.status === 'submitted' ? 'bg-[#9FE870]/30 text-gray-900' : 'bg-amber-50 text-amber-700'}`}
                >
                  {r.status === 'submitted' ? 'Submitted' : 'Draft'}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">{formatDate(r.reportDate)}</p>
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
      {viewing && <ReportViewerModal submission={viewing} onClose={() => setViewing(null)} />}
    </>
  )
}
