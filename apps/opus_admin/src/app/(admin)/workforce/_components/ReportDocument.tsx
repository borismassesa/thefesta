'use client'

import { Printer, X } from 'lucide-react'
import {
  formatLetterheadDate,
  PrintLetterhead,
  PrintLetterheadFooter,
  type LetterheadMeta,
} from '@/components/PrintLetterhead'
import {
  FOLLOWUP_STATUS_LABELS,
  readBlockers,
  readBullets,
  readFollowups,
  readGoals,
  readGroupedBullets,
  readMetrics,
  readNumber,
  readText,
  type ReportSection,
  type ReportSubmission,
} from '../_lib/report-schema'

function formatShortDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const followupBadgeCls: Record<string, string> = {
  done: 'bg-emerald-100 text-emerald-800',
  partial: 'bg-amber-100 text-amber-800',
  not_done: 'bg-rose-100 text-rose-800',
  '': 'bg-gray-100 text-gray-500',
}

// Renders a submitted report on the shared OpusFesta letterhead
// (components/PrintLetterhead.tsx) — the same masthead, title / date block
// and footer the @react-pdf documents use — so a Print → "Save as PDF"
// produces the company's standard report document.

function SectionBody({
  section,
  submission,
}: {
  section: ReportSection
  submission: ReportSubmission
}) {
  const { content } = submission
  switch (section.type) {
    case 'text':
    case 'short_text':
    case 'department_select': {
      const v = readText(content, section)
      if (!v) return <p className="text-sm italic text-gray-400">—</p>
      return <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{v}</p>
    }
    case 'number': {
      const n = readNumber(content, section)
      return <p className="text-sm text-gray-800">{n ?? '—'}</p>
    }
    case 'bullets': {
      const items = readBullets(content, section)
      if (items.length === 0) return <p className="text-sm italic text-gray-400">—</p>
      return (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-gray-800">
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      )
    }
    case 'grouped_bullets': {
      const groups = readGroupedBullets(content, section)
      const any = groups.some((g) => g.items.length > 0)
      if (!any) return <p className="text-sm italic text-gray-400">—</p>
      return (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.id}>
              <p className="text-sm font-semibold text-gray-700">
                {g.label} ({g.items.length})
              </p>
              {g.items.length > 0 && (
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-gray-800">
                  {g.items.map((it, i) => (
                    <li key={i}>{it}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )
    }
    case 'metrics_table': {
      const rows = readMetrics(content, section)
      if (rows.length === 0) return <p className="text-sm italic text-gray-400">—</p>
      return (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
              <th className="py-1.5 pr-3 font-semibold">Metric</th>
              <th className="py-1.5 pr-3 font-semibold">This month</th>
              <th className="py-1.5 pr-3 font-semibold">Last month</th>
              <th className="py-1.5 font-semibold">Target</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-gray-100 text-gray-800">
                <td className="py-1.5 pr-3">{r.name}</td>
                <td className="py-1.5 pr-3">{r.thisMonth || '—'}</td>
                <td className="py-1.5 pr-3">{r.lastMonth || '—'}</td>
                <td className="py-1.5">{r.target || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )
    }
    case 'goal_list': {
      const items = readGoals(content, section)
      if (items.length === 0) return <p className="text-sm italic text-gray-400">—</p>
      return (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={i} className="text-sm text-gray-800">
              <p>• {it.text}</p>
              <p className="pl-3 text-xs text-gray-500">
                Owner: {it.owner || '—'} · Target date: {formatShortDate(it.targetDate)}
              </p>
            </li>
          ))}
        </ul>
      )
    }
    case 'blocker_list': {
      const items = readBlockers(content, section)
      if (items.length === 0) return <p className="text-sm italic text-gray-400">—</p>
      return (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={i} className="text-sm text-gray-800">
              <p>• {it.text}</p>
              <p className="pl-3 text-xs text-gray-500">
                Waiting on: {it.waitingOn || '—'} · Since: {formatShortDate(it.since)}
              </p>
            </li>
          ))}
        </ul>
      )
    }
    case 'followup_list': {
      const items = readFollowups(content, section)
      if (items.length === 0) return <p className="text-sm italic text-gray-400">No carried-forward priorities this period.</p>
      return (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={i} className="text-sm text-gray-800">
              <span className="mr-2">• {it.text}</span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${followupBadgeCls[it.status]}`}>
                {it.status ? FOLLOWUP_STATUS_LABELS[it.status] : 'No status set'}
              </span>
              {(it.status === 'partial' || it.status === 'not_done') && it.reason && (
                <p className="pl-3 text-xs text-gray-500">Reason: {it.reason}</p>
              )}
            </li>
          ))}
        </ul>
      )
    }
  }
}

export function ReportDocument({ submission }: { submission: ReportSubmission }) {
  const meta: LetterheadMeta[] = [
    {
      label: 'Date',
      value:
        formatLetterheadDate(submission.reportDate) +
        (submission.periodEnd ? ` – ${formatLetterheadDate(submission.periodEnd)}` : ''),
    },
    {
      label: 'Prepared by',
      value:
        (submission.preparedByName ?? submission.employeeName) +
        (submission.preparedByRole ? ` — ${submission.preparedByRole}` : ''),
    },
  ]
  if (submission.recipientName) meta.push({ label: 'Submitted to', value: submission.recipientName })

  return (
    <div className="report-print-root mx-auto max-w-[760px] bg-white px-10 py-10 text-gray-900">
      <PrintLetterhead title={submission.templateName} meta={meta} />

      {/* Sections */}
      <div className="mt-7 space-y-6">
        {submission.sections.map((section, i) => (
          <section key={section.id}>
            <h2 className="text-base font-bold text-gray-900">
              {i + 1}. {section.title}
            </h2>
            <div className="mt-2">
              <SectionBody section={section} submission={submission} />
            </div>
          </section>
        ))}
      </div>

      <PrintLetterheadFooter className="mt-12" />
    </div>
  )
}

// Full-screen overlay that shows a ReportDocument with Print + Close. The
// injected print stylesheet hides the rest of the app so the browser's
// "Save as PDF" outputs only the letterhead document.
export function ReportViewerModal({
  submission,
  onClose,
}: {
  submission: ReportSubmission
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-black/40 p-4 sm:p-8">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        .report-print-root, .report-print-root * { visibility: visible !important; }
        .report-print-root { position: absolute !important; left: 0; top: 0; width: 100%; box-shadow: none !important; }
        .report-print-hide { display: none !important; }
      }`}</style>
      <div className="mx-auto max-w-[820px]">
        <div className="report-print-hide mb-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
          >
            <Printer className="h-4 w-4" /> Print / Save as PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/40 bg-white/90 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-white"
          >
            <X className="h-4 w-4" /> Close
          </button>
        </div>
        <div className="overflow-hidden rounded-xl shadow-2xl">
          <ReportDocument submission={submission} />
        </div>
      </div>
    </div>
  )
}
