'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Mail,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import {
  coerceContent,
  FOLLOWUP_STATUS_LABELS,
  REPORT_CADENCE_LABELS,
  type BlockerItem,
  type FollowupItem,
  type FollowupStatus,
  type GoalItem,
  type MetricRow,
  type ReportContent,
  type ReportSection,
  type ReportSubmission,
  type ReportTemplate,
} from '../../workforce/_lib/report-schema'
import { DEPARTMENTS } from '../../workforce/_lib/types'
import { ReportViewerModal } from '../../workforce/_components/ReportDocument'
import type { SaveReportInput, SaveReportResult } from './actions'

type Recipient = { id: string; name: string; jobTitle: string }

type Mode =
  | { kind: 'list' }
  | { kind: 'edit'; template: ReportTemplate; existing: ReportSubmission | null }

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// The 3rd business day (Mon–Fri) of the given month — mirrors the docx
// template's "submit by the 3rd business day of the following month"
// policy. The month being reported is always the one just finished, so
// this is the 3rd business day of the CURRENT calendar month.
function thirdBusinessDayOfMonth(year: number, monthIndex0: number): Date {
  const d = new Date(year, monthIndex0, 1)
  let count = 0
  while (count < 3) {
    const weekday = d.getDay()
    if (weekday !== 0 && weekday !== 6) count++
    if (count < 3) d.setDate(d.getDate() + 1)
  }
  return d
}

// "2026-07" → "2026-06" — the month whose report is due right now.
function previousMonthKey(todayIso: string): string {
  const [y, m] = todayIso.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function daysBetween(fromIso: string, to: Date): number {
  const [y, m, d] = fromIso.split('-').map(Number)
  const from = new Date(y, m - 1, d)
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

export default function MyReportsClient({
  templates,
  reports,
  recipients,
  followupSeeds,
  today,
  saveReport,
}: {
  templates: ReportTemplate[]
  reports: ReportSubmission[]
  recipients: Recipient[]
  followupSeeds: Record<string, FollowupItem[]>
  today: string
  saveReport: (input: SaveReportInput) => Promise<SaveReportResult>
}) {
  const [mode, setMode] = useState<Mode>({ kind: 'list' })
  const [viewing, setViewing] = useState<ReportSubmission | null>(null)

  if (mode.kind === 'edit') {
    return (
      <ReportForm
        template={mode.template}
        existing={mode.existing}
        recipients={recipients}
        followupSeed={followupSeeds[mode.template.id] ?? []}
        today={today}
        saveReport={saveReport}
        onClose={() => setMode({ kind: 'list' })}
      />
    )
  }

  const [dueYear, dueMonth] = today.split('-').map(Number)
  const dueDate = thirdBusinessDayOfMonth(dueYear, dueMonth - 1)
  const daysUntilDue = daysBetween(today, dueDate)
  const monthDue = previousMonthKey(today)
  const monthlyDue = templates.find(
    (t) =>
      t.cadence === 'monthly' &&
      !reports.some(
        (r) => r.templateId === t.id && r.status === 'submitted' && r.reportDate.slice(0, 7) === monthDue,
      ),
  )

  return (
    <div className="space-y-8">
      {monthlyDue && (
        <div
          className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${
            daysUntilDue < 0
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : daysUntilDue <= 3
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-gray-100 bg-white text-gray-600'
          }`}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p>
            <span className="font-semibold">{monthlyDue.name}</span> is due by{' '}
            {dueDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} —{' '}
            {daysUntilDue < 0
              ? `${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? '' : 's'} overdue`
              : daysUntilDue === 0
                ? 'due today'
                : `due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`}
            .
          </p>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
          Write a report
        </h2>
        {templates.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
            <p className="text-sm font-semibold text-gray-900">No report types available</p>
            <p className="mt-1 text-xs text-gray-500">
              Ask an admin to set up a report template for your team.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setMode({ kind: 'edit', template: t, existing: null })}
                className="group flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 text-left transition hover:border-[#C9A0DC] hover:shadow-[0_8px_24px_-12px_rgba(107,78,140,0.45)]"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F0DFF6] text-[#6B4E8C]">
                  <FileText className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-gray-900">{t.name}</span>
                    <span className="inline-flex items-center rounded-full bg-[#9FE870]/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-900">
                      {REPORT_CADENCE_LABELS[t.cadence]}
                    </span>
                  </span>
                  {t.description && (
                    <span className="mt-1 block text-xs leading-relaxed text-gray-500">{t.description}</span>
                  )}
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-[#6B4E8C]" />
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
          History <span className="ml-2 font-normal text-gray-400">{reports.length}</span>
        </h2>
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          {reports.length === 0 ? (
            <p className="px-5 py-6 text-center text-xs text-gray-400">
              No reports yet. Your submissions will show up here.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {reports.map((r) => {
                const template = templates.find((t) => t.id === r.templateId)
                return (
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
                      <p className="mt-0.5 text-xs text-gray-500">
                        {formatDate(r.reportDate)}
                        {r.recipientName && <> · To {r.recipientName}</>}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setViewing(r)}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <Eye className="h-3 w-3" /> View
                      </button>
                      {template && (
                        <button
                          type="button"
                          onClick={() => setMode({ kind: 'edit', template, existing: r })}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          <Pencil className="h-3 w-3" /> Edit
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      {viewing && <ReportViewerModal submission={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

function timeAgoLabel(from: Date, nowTick: number): string {
  const seconds = Math.max(0, Math.round((nowTick - from.getTime()) / 1000))
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return `${hours}h ago`
}

function ReportForm({
  template,
  existing,
  recipients,
  followupSeed,
  today,
  saveReport,
  onClose,
}: {
  template: ReportTemplate
  existing: ReportSubmission | null
  recipients: Recipient[]
  followupSeed: FollowupItem[]
  today: string
  saveReport: (input: SaveReportInput) => Promise<SaveReportResult>
  onClose: () => void
}) {
  const router = useRouter()
  const [reportDate, setReportDate] = useState(existing?.reportDate ?? today)
  const [periodEnd, setPeriodEnd] = useState(existing?.periodEnd ?? '')
  const [recipientId, setRecipientId] = useState(existing?.recipientId ?? '')
  const [recipientEmails, setRecipientEmails] = useState<string[]>(existing?.recipientEmails ?? [])
  const [emailDraft, setEmailDraft] = useState('')
  const [content, setContent] = useState<ReportContent>(() => {
    const base = coerceContent(template.sections, existing?.content ?? {})
    // A brand-new (never-saved) monthly report starts its follow-up section
    // seeded from last period's goals, so the accountability loop is never
    // skipped just because nobody remembered to check.
    if (!existing) {
      const followup = template.sections.find((s) => s.type === 'followup_list')
      if (followup && followupSeed.length > 0) base[followup.id] = followupSeed
    }
    return base
  })
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [emailNotice, setEmailNotice] = useState<string | null>(null)
  const [confirmingSubmit, setConfirmingSubmit] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())

  useEffect(() => {
    if (!lastSavedAt) return
    const id = setInterval(() => setNowTick(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [lastSavedAt])

  // Anything that spans more than a day collects a period-end date.
  const showPeriod = template.cadence !== 'daily'

  function setValue(sectionId: string, value: unknown) {
    setContent((prev) => ({ ...prev, [sectionId]: value }))
  }

  function addEmail() {
    const v = emailDraft.trim().toLowerCase()
    if (!v) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      setError(`“${v}” isn’t a valid email address.`)
      return
    }
    if (!recipientEmails.includes(v)) setRecipientEmails((prev) => [...prev, v])
    setEmailDraft('')
  }

  // Gates the confirm-submit panel — validates before showing "X will be
  // emailed a PDF right away" so that copy is never shown when there's
  // actually no recipient chosen yet (the real check inside submit() only
  // ran once "Yes, submit" was clicked, by which point the panel had
  // already misleadingly implied a valid recipient existed).
  function requestSubmit() {
    setError(null)
    if (!recipientId) {
      setError('Choose who to submit this report to.')
      return
    }
    setConfirmingSubmit(true)
  }

  function submit(status: 'draft' | 'submitted') {
    setError(null)
    setEmailNotice(null)
    if (status === 'submitted' && !recipientId) {
      setError('Choose who to submit this report to.')
      return
    }
    startTransition(async () => {
      const result = await saveReport({
        templateId: template.id,
        reportDate,
        periodEnd: showPeriod ? periodEnd || null : null,
        recipientId: recipientId || null,
        recipientEmails,
        content,
        status,
      })
      if (result.ok) {
        if (status === 'draft') {
          setLastSavedAt(new Date())
          setNowTick(Date.now())
        } else {
          if (result.emailStatus === 'sent') setEmailNotice('Report emailed to the recipient.')
          else if (result.emailStatus === 'failed') setEmailNotice('Saved, but the email failed to send.')
          router.refresh()
          onClose()
        }
      } else {
        setError(result.error)
      }
      setConfirmingSubmit(false)
    })
  }

  const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-gray-500'

  return (
    <div className="space-y-5">
      <h2 className="text-sm font-bold text-gray-900">{template.name}</h2>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] sm:p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className={labelCls}>{showPeriod ? 'Period start' : 'Date'}</label>
            <input
              type="date"
              value={reportDate}
              max={today}
              onChange={(e) => setReportDate(e.target.value)}
              className="mt-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
            />
          </div>
          {showPeriod && (
            <div>
              <label className={labelCls}>Period end</label>
              <input
                type="date"
                value={periodEnd}
                min={reportDate}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="mt-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-900 focus:border-gray-400 focus:outline-none"
              />
            </div>
          )}
          <div>
            <label className={labelCls}>
              Submit to <span className="ml-1 text-rose-500">*</span>
            </label>
            <select
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
              className="mt-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-900 focus:border-gray-400 focus:outline-none sm:min-w-[220px]"
            >
              <option value="">Choose a recipient…</option>
              {recipients.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.jobTitle ? ` — ${r.jobTitle}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <label className={labelCls}>
            <Mail className="mr-1 inline h-3 w-3" /> Also email to (optional)
          </label>
          <p className="mt-0.5 text-[11px] text-gray-400">
            Extra addresses that should get the PDF too — e.g. someone without a workforce login.
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {recipientEmails.map((email) => (
              <span
                key={email}
                className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700"
              >
                {email}
                <button
                  type="button"
                  onClick={() => setRecipientEmails((prev) => prev.filter((e) => e !== email))}
                  className="text-gray-400 hover:text-rose-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  addEmail()
                }
              }}
              onBlur={addEmail}
              placeholder="name@company.com"
              className="min-w-[180px] flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-6 space-y-6">
          {template.sections.map((section) => (
            <SectionInput
              key={section.id}
              section={section}
              value={content[section.id]}
              onChange={(v) => setValue(section.id, v)}
            />
          ))}
        </div>

        {error && <p role="alert" className="mt-4 text-xs font-medium text-rose-600">{error}</p>}
        {emailNotice && <p className="mt-4 text-xs font-medium text-emerald-700">{emailNotice}</p>}

        {confirmingSubmit && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">Submit this report?</p>
            <p className="mt-1 text-xs text-amber-800">
              {recipients.find((r) => r.id === recipientId)?.name ?? 'The recipient'} will be emailed a PDF
              right away. You can still edit it afterward, but they’ll already have this version.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => submit('submitted')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#9FE870] px-3 py-1.5 text-xs font-bold text-gray-900 hover:bg-[#8fd862] disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" /> Yes, submit
              </button>
              <button
                type="button"
                onClick={() => setConfirmingSubmit(false)}
                className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex items-center gap-3">
            {lastSavedAt && (
              <span className="text-[11px] text-gray-400">Draft saved {timeAgoLabel(lastSavedAt, nowTick)}</span>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => submit('draft')}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Save draft
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={requestSubmit}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#9FE870] px-4 py-2 text-sm font-bold text-gray-900 hover:bg-[#8fd862] active:translate-y-[1px] disabled:opacity-50"
            >
              <Check className="h-4 w-4" /> Submit report
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// List-type fields pre-render this many empty rows so the form signals
// "we expect more than one thing here" the same way the docx template's
// numbered blanks did, instead of a single row + "Add item".
const MIN_ROWS = 2

function SectionInput({
  section,
  value,
  onChange,
}: {
  section: ReportSection
  value: unknown
  onChange: (v: unknown) => void
}) {
  const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-gray-500'
  const inputCls =
    'mt-1.5 w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none'

  return (
    <div>
      <label className={labelCls}>
        {section.title}
        {section.required && <span className="ml-1 text-rose-500">*</span>}
        {!section.required && <span className="ml-1 font-normal normal-case text-gray-400">(optional)</span>}
      </label>
      {section.help && <p className="mt-0.5 text-[11px] text-gray-400">{section.help}</p>}

      {section.type === 'text' && (
        <textarea
          rows={4}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={section.placeholder}
          className={`${inputCls} resize-y`}
        />
      )}

      {section.type === 'short_text' && (
        <input
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={section.placeholder}
          className={inputCls}
        />
      )}

      {section.type === 'department_select' && (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputCls} sm:w-72`}
        >
          <option value="">Choose a department…</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      )}

      {section.type === 'number' && (
        <input
          type="number"
          value={value === null || value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className={`${inputCls} sm:w-40`}
        />
      )}

      {section.type === 'bullets' && (
        <BulletList
          items={Array.isArray(value) ? (value as string[]) : ['']}
          onChange={(items) => onChange(items)}
        />
      )}

      {section.type === 'grouped_bullets' && (
        <div className="mt-2 space-y-4">
          {(section.groups ?? []).map((g) => {
            const src = (value && typeof value === 'object' ? (value as Record<string, unknown>) : {})
            const items = Array.isArray(src[g.id]) ? (src[g.id] as string[]) : ['']
            const count = items.filter((x) => x.trim()).length
            return (
              <div key={g.id} className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs font-semibold text-gray-700">
                  {g.label} ({count})
                </p>
                <BulletList
                  items={items}
                  onChange={(next) => onChange({ ...src, [g.id]: next })}
                />
              </div>
            )
          })}
        </div>
      )}

      {section.type === 'metrics_table' && (
        <MetricsTable
          rows={Array.isArray(value) ? (value as MetricRow[]) : []}
          onChange={onChange}
        />
      )}

      {section.type === 'goal_list' && (
        <GoalList rows={Array.isArray(value) ? (value as GoalItem[]) : []} onChange={onChange} />
      )}

      {section.type === 'blocker_list' && (
        <BlockerList rows={Array.isArray(value) ? (value as BlockerItem[]) : []} onChange={onChange} />
      )}

      {section.type === 'followup_list' && (
        <FollowupList items={Array.isArray(value) ? (value as FollowupItem[]) : []} onChange={onChange} />
      )}
    </div>
  )
}

function BulletList({
  items,
  onChange,
}: {
  items: string[]
  onChange: (items: string[]) => void
}) {
  const rows = items.length >= MIN_ROWS ? items : [...items, ...Array(MIN_ROWS - items.length).fill('')]
  return (
    <div className="mt-2 space-y-2">
      {rows.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-gray-300">•</span>
          <input
            value={it}
            onChange={(e) => {
              const next = [...rows]
              next[i] = e.target.value
              onChange(next)
            }}
            placeholder="Add an item…"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
            className="shrink-0 rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:bg-gray-50 hover:text-rose-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, ''])}
        className="inline-flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
      >
        <Plus className="h-3 w-3" /> Add item
      </button>
    </div>
  )
}

const smallInputCls =
  'rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none'

function MetricsTable({ rows, onChange }: { rows: MetricRow[]; onChange: (rows: MetricRow[]) => void }) {
  const empty: MetricRow = { name: '', thisMonth: '', lastMonth: '', target: '' }
  const list = rows.length >= MIN_ROWS ? rows : [...rows, ...Array(MIN_ROWS - rows.length).fill(empty)]
  function update(i: number, patch: Partial<MetricRow>) {
    onChange(list.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  return (
    <div className="mt-2 space-y-2">
      {list.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 p-2.5">
          <input
            value={r.name}
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder="Metric name"
            className={`${smallInputCls} w-full sm:w-40`}
          />
          <input
            value={r.thisMonth}
            onChange={(e) => update(i, { thisMonth: e.target.value })}
            placeholder="This month"
            className={`${smallInputCls} w-28`}
          />
          <input
            value={r.lastMonth}
            onChange={(e) => update(i, { lastMonth: e.target.value })}
            placeholder="Last month"
            className={`${smallInputCls} w-28`}
          />
          <input
            value={r.target}
            onChange={(e) => update(i, { target: e.target.value })}
            placeholder="Target"
            className={`${smallInputCls} w-28`}
          />
          <button
            type="button"
            onClick={() => onChange(list.filter((_, idx) => idx !== i))}
            className="shrink-0 rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:bg-white hover:text-rose-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...list, empty])}
        className="inline-flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
      >
        <Plus className="h-3 w-3" /> Add metric
      </button>
    </div>
  )
}

function GoalList({ rows, onChange }: { rows: GoalItem[]; onChange: (rows: GoalItem[]) => void }) {
  const empty: GoalItem = { text: '', owner: '', targetDate: '' }
  const list = rows.length >= MIN_ROWS ? rows : [...rows, ...Array(MIN_ROWS - rows.length).fill(empty)]
  function update(i: number, patch: Partial<GoalItem>) {
    onChange(list.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  return (
    <div className="mt-2 space-y-2">
      {list.map((r, i) => (
        <div key={i} className="rounded-xl bg-gray-50 p-2.5">
          <div className="flex items-center gap-2">
            <span className="text-gray-300">•</span>
            <input
              value={r.text}
              onChange={(e) => update(i, { text: e.target.value })}
              placeholder="A specific, dated priority…"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => onChange(list.filter((_, idx) => idx !== i))}
              className="shrink-0 rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:bg-white hover:text-rose-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 pl-5">
            <input
              value={r.owner}
              onChange={(e) => update(i, { owner: e.target.value })}
              placeholder="Owner"
              className={`${smallInputCls} w-36`}
            />
            <input
              type="date"
              value={r.targetDate}
              onChange={(e) => update(i, { targetDate: e.target.value })}
              className={smallInputCls}
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...list, empty])}
        className="inline-flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
      >
        <Plus className="h-3 w-3" /> Add goal
      </button>
    </div>
  )
}

function BlockerList({ rows, onChange }: { rows: BlockerItem[]; onChange: (rows: BlockerItem[]) => void }) {
  const empty: BlockerItem = { text: '', waitingOn: '', since: '' }
  const list = rows.length >= MIN_ROWS ? rows : [...rows, ...Array(MIN_ROWS - rows.length).fill(empty)]
  function update(i: number, patch: Partial<BlockerItem>) {
    onChange(list.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  return (
    <div className="mt-2 space-y-2">
      {list.map((r, i) => (
        <div key={i} className="rounded-xl bg-gray-50 p-2.5">
          <div className="flex items-center gap-2">
            <span className="text-gray-300">•</span>
            <input
              value={r.text}
              onChange={(e) => update(i, { text: e.target.value })}
              placeholder="What's stuck, and why…"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => onChange(list.filter((_, idx) => idx !== i))}
              className="shrink-0 rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:bg-white hover:text-rose-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 pl-5">
            <input
              value={r.waitingOn}
              onChange={(e) => update(i, { waitingOn: e.target.value })}
              placeholder="Waiting on (person/team)"
              className={`${smallInputCls} w-56`}
            />
            <input
              type="date"
              value={r.since}
              onChange={(e) => update(i, { since: e.target.value })}
              className={smallInputCls}
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...list, empty])}
        className="inline-flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
      >
        <Plus className="h-3 w-3" /> Add blocker
      </button>
    </div>
  )
}

const STATUS_OPTIONS: Exclude<FollowupStatus, ''>[] = ['done', 'partial', 'not_done']

function FollowupList({
  items,
  onChange,
}: {
  items: FollowupItem[]
  onChange: (items: FollowupItem[]) => void
}) {
  function update(i: number, patch: Partial<FollowupItem>) {
    onChange(items.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  if (items.length === 0) {
    return (
      <p className="mt-2 rounded-xl bg-gray-50 p-3 text-xs text-gray-400">
        Nothing carried forward — either this is your first report, or last period had no goals set.
      </p>
    )
  }
  return (
    <div className="mt-2 space-y-2">
      {items.map((it, i) => (
        <div key={i} className="rounded-xl bg-gray-50 p-3">
          <p className="text-sm font-medium text-gray-800">{it.text}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => update(i, { status: opt, reason: opt === 'done' ? '' : it.reason })}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                  it.status === opt
                    ? opt === 'done'
                      ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                      : opt === 'partial'
                        ? 'border-amber-300 bg-amber-100 text-amber-800'
                        : 'border-rose-300 bg-rose-100 text-rose-800'
                    : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-100'
                }`}
              >
                {FOLLOWUP_STATUS_LABELS[opt]}
              </button>
            ))}
          </div>
          {(it.status === 'partial' || it.status === 'not_done') && (
            <input
              value={it.reason}
              onChange={(e) => update(i, { reason: e.target.value })}
              placeholder="One-line reason it wasn't fully done…"
              className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
            />
          )}
        </div>
      ))}
    </div>
  )
}
