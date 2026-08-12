'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  FileText,
  Inbox,
  PenLine,
  RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { REPORT_CADENCE_LABELS, type ReportCadence } from '@/lib/reports/periods'
import { stateLabel, type ReportState } from '@/lib/reports/state'
import type {
  ReportObligation,
  ReportSubmissionSummary,
  ReportTemplateSummary,
} from '@/lib/reports/queries'
import type { ActionResult } from './actions'

const GREEN_PILL =
  'inline-flex items-center rounded-full bg-[#9FE870] px-2.5 py-0.5 text-[11px] font-semibold text-gray-900'

const STATE_TONE: Record<ReportState, string> = {
  draft: 'bg-gray-100 text-gray-700',
  submitted: 'bg-blue-50 text-blue-700',
  under_review: 'bg-blue-50 text-blue-700',
  returned: 'bg-amber-50 text-amber-700',
  resubmitted: 'bg-blue-50 text-blue-700',
  accepted: 'bg-emerald-50 text-emerald-700',
  locked: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-gray-100 text-gray-500',
  waived: 'bg-gray-100 text-gray-500',
}

type Tab = 'due' | 'drafts' | 'filed' | 'returned' | 'history' | 'review' | 'catalogue'

function cadenceLabel(cadence: ReportCadence | 'ad_hoc'): string {
  return cadence === 'ad_hoc' ? 'On request' : REPORT_CADENCE_LABELS[cadence]
}

function formatDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export default function ReportsClient({
  catalogue,
  obligations,
  drafts,
  filed,
  returned,
  history,
  reviewQueue,
  startReport,
}: {
  catalogue: ReportTemplateSummary[]
  obligations: ReportObligation[]
  drafts: ReportSubmissionSummary[]
  filed: ReportSubmissionSummary[]
  returned: ReportSubmissionSummary[]
  history: ReportSubmissionSummary[]
  reviewQueue: ReportSubmissionSummary[]
  startReport: (obligationId: string) => Promise<ActionResult<{ submissionId: string }>>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const outstanding = obligations.filter(
    (o) => o.state === 'open' || o.state === 'overdue',
  )
  const overdue = outstanding.filter((o) => o.status === 'overdue')

  const [tab, setTab] = useState<Tab>(
    outstanding.length > 0 ? 'due' : returned.length > 0 ? 'returned' : 'drafts',
  )

  const TABS: { id: Tab; label: string; count: number; icon: typeof FileText }[] = [
    { id: 'due', label: 'Due', count: outstanding.length, icon: CalendarClock },
    { id: 'drafts', label: 'Drafts', count: drafts.length, icon: PenLine },
    { id: 'returned', label: 'Returned', count: returned.length, icon: RotateCcw },
    { id: 'filed', label: 'Filed', count: filed.length, icon: FileText },
    { id: 'review', label: 'To review', count: reviewQueue.length, icon: Inbox },
    { id: 'history', label: 'History', count: history.length, icon: CheckCircle2 },
    { id: 'catalogue', label: 'Catalogue', count: catalogue.length, icon: BookOpen },
  ]

  const open = (obligationId: string) => {
    setError(null)
    startTransition(async () => {
      const result = await startReport(obligationId)
      if (result.ok) router.push(`/workspace/reports/${result.submissionId}`)
      else setError(result.error)
    })
  }

  return (
    <div className="space-y-5">
      {overdue.length > 0 && (
        <section className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" strokeWidth={1.75} />
          <div>
            <h2 className="text-sm font-semibold text-rose-900">
              {overdue.length === 1
                ? 'One report is overdue'
                : `${overdue.length} reports are overdue`}
            </h2>
            <p className="mt-1 text-sm text-rose-900/90">
              {overdue.map((o) => `${o.templateName} for ${o.periodLabel}`).join(', ')}.
            </p>
          </div>
        </section>
      )}

      <nav className="flex flex-wrap gap-1 border-b border-gray-100 pb-3">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button data-opus-button="control"
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors',
                tab === t.id
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} />
              {t.label}
              {t.count > 0 && (
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[11px] font-semibold',
                    tab === t.id ? 'bg-white/20' : 'bg-gray-200 text-gray-700',
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {error && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>
      )}

      {tab === 'due' && (
        <Panel empty="Nothing is due. Everything assigned to you is filed." items={outstanding.length}>
          <ul className="space-y-2.5">
            {outstanding.map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{o.templateName}</p>
                  <p className="mt-0.5 text-[13px] text-gray-500">
                    {o.periodLabel} · due {formatDay(o.dueDate)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={GREEN_PILL}>{cadenceLabel(o.cadence)}</span>
                  {o.status === 'overdue' && (
                    <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700">
                      Overdue
                    </span>
                  )}
                  {o.status === 'due_today' && (
                    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                      Due today
                    </span>
                  )}
                  {o.submissionId ? (
                    <Link
                      href={`/workspace/reports/${o.submissionId}`}
                      className="rounded-full bg-gray-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-gray-800"
                    >
                      Continue
                    </Link>
                  ) : (
                    <button data-opus-button="primary" data-opus-button-size="medium"
                      type="button"
                      disabled={pending}
                      onClick={() => open(o.id)}
                      className="rounded-full bg-gray-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                    >
                      Start
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {tab === 'drafts' && <SubmissionList items={drafts} empty="No drafts in progress." />}
      {tab === 'returned' && (
        <SubmissionList
          items={returned}
          empty="Nothing has been returned to you."
          hint="These came back with a reviewer's note. Your earlier version is kept; correcting one files a new version."
        />
      )}
      {tab === 'filed' && (
        <SubmissionList items={filed} empty="Nothing is waiting for review." />
      )}
      {tab === 'review' && (
        <SubmissionList
          items={reviewQueue}
          empty="No reports are waiting on you."
          showAuthor
        />
      )}
      {tab === 'history' && (
        <SubmissionList items={history} empty="No completed reports yet." />
      )}

      {tab === 'catalogue' && (
        <Panel empty="No report types are assigned to you." items={catalogue.length}>
          <ul className="grid gap-3 sm:grid-cols-2">
            {catalogue.map((t) => (
              <li
                key={t.id}
                className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"
              >
                <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                {t.description && (
                  <p className="mt-1 text-[13px] text-gray-500">{t.description}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className={GREEN_PILL}>{cadenceLabel(t.cadence)}</span>
                  <span className={GREEN_PILL}>{t.scope}</span>
                  {t.requiresReview && <span className={GREEN_PILL}>Reviewed</span>}
                </div>
                <p className="mt-3 text-[12px] text-gray-400">
                  Due {t.dueOffsetDays} {t.dueOffsetDays === 1 ? 'day' : 'days'} after each period
                  ends.
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}

function Panel({
  items,
  empty,
  children,
}: {
  items: number
  empty: string
  children: React.ReactNode
}) {
  if (items === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
        {empty}
      </div>
    )
  }
  return <>{children}</>
}

function SubmissionList({
  items,
  empty,
  hint,
  showAuthor,
}: {
  items: ReportSubmissionSummary[]
  empty: string
  hint?: string
  showAuthor?: boolean
}) {
  return (
    <Panel items={items.length} empty={empty}>
      <div className="space-y-2.5">
        {hint && <p className="text-[13px] text-gray-500">{hint}</p>}
        <ul className="space-y-2.5">
          {items.map((s) => (
            <li key={s.id}>
              <Link
                href={`/workspace/reports/${s.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] transition-colors hover:border-gray-200"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{s.templateName}</p>
                  <p className="mt-0.5 text-[13px] text-gray-500">
                    {s.periodLabel}
                    {showAuthor && s.employeeName && ` · ${s.employeeName}`}
                    {s.currentVersion > 1 && ` · version ${s.currentVersion}`}
                    {s.returnedCount > 0 &&
                      ` · returned ${s.returnedCount} ${s.returnedCount === 1 ? 'time' : 'times'}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                      STATE_TONE[s.state],
                    )}
                  >
                    {stateLabel(s.state)}
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-gray-400" strokeWidth={2} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  )
}
