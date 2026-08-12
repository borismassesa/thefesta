'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  Check,
  Clock,
  Download,
  History,
  MessageSquare,
  RotateCcw,
  Send,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { isContentEditable, stateLabel, type ReportState } from '@/lib/reports/state'
import { allFields, type FieldError, type ReportContent } from '@/lib/reports/fields'
import type { ReportDetail } from '@/lib/reports/queries'
import FieldInput, { type FieldOptions } from '../_components/FieldInput'
import type { ActionResult } from '../actions'

// The report form and its history.
//
// AUTOSAVE. Every save quotes the revision the client last saw. If the server
// says the stored revision has moved on, another tab or device saved in the
// meantime: we stop saving, tell the author their text was NOT applied, and
// offer a reload. Silently winning that race would destroy whichever copy lost,
// and the author would never know which.

const AUTOSAVE_DELAY_MS = 2500

type Actions = {
  saveDraft: (
    id: string,
    content: ReportContent,
    expectedRevision: number,
  ) => Promise<ActionResult<{ revision: number }>>
  submitReport: (id: string, options?: { emailCopy?: boolean }) => Promise<ActionResult<{ version: number }>>
  reviewReport: (
    id: string,
    action: 'start_review' | 'return_for_correction' | 'accept' | 'reopen' | 'waive' | 'cancel',
    note?: string,
  ) => Promise<ActionResult>
  addComment: (
    id: string,
    body: string,
    options?: { fieldKey?: string | null; internal?: boolean },
  ) => Promise<ActionResult>
}

type SaveState = 'idle' | 'saving' | 'saved' | 'conflict' | 'error'

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

export default function ReportDetailClient({
  detail,
  isAdmin,
  options,
  actions,
}: {
  detail: ReportDetail
  isAdmin: boolean
  options: FieldOptions
  actions: Actions
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const editable = detail.isOwner && isContentEditable(detail.submission.state)
  const [content, setContent] = useState<ReportContent>(detail.draftContent)
  const [revision, setRevision] = useState(detail.draftRevision)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([])
  const [emailCopy, setEmailCopy] = useState(false)
  const [reviewNote, setReviewNote] = useState('')
  const [comment, setComment] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)

  const persist = useCallback(
    async (next: ReportContent, atRevision: number) => {
      setSaveState('saving')
      const result = await actions.saveDraft(detail.submission.id, next, atRevision)
      if (result.ok) {
        setRevision(result.revision)
        setSaveState('saved')
        setFieldErrors([])
        dirty.current = false
        return
      }
      if (result.conflict) {
        // Stop autosaving. Continuing would keep firing saves that can never
        // land, and every one of them would look like a failure to the author.
        setSaveState('conflict')
        setMessage(result.error)
        return
      }
      setSaveState('error')
      setMessage(result.error)
      if (result.fieldErrors) setFieldErrors(result.fieldErrors)
    },
    [actions, detail.submission.id],
  )

  // Debounced autosave. Cancelled on unmount so a pending save cannot fire
  // against a form the author has already left.
  useEffect(() => {
    if (!editable || !dirty.current || saveState === 'conflict') return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void persist(content, revision)
    }, AUTOSAVE_DELAY_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [content, revision, editable, persist, saveState])

  const update = (key: string, value: unknown) => {
    dirty.current = true
    setSaveState('idle')
    setContent((prev) => ({ ...prev, [key]: value }))
  }

  const errorsFor = (key: string) => fieldErrors.filter((e) => e.fieldKey === key)

  const runReview = (
    action: 'start_review' | 'return_for_correction' | 'accept' | 'reopen' | 'waive' | 'cancel',
  ) => {
    setMessage(null)
    startTransition(async () => {
      const result = await actions.reviewReport(detail.submission.id, action, reviewNote || undefined)
      if (result.ok) {
        setReviewNote('')
        router.refresh()
      } else {
        setMessage(result.error)
      }
    })
  }

  const submit = () => {
    setMessage(null)
    setFieldErrors([])
    startTransition(async () => {
      // Flush any pending edit first, so what is filed is what is on screen.
      if (dirty.current) {
        const saved = await actions.saveDraft(detail.submission.id, content, revision)
        if (!saved.ok) {
          setMessage(saved.error)
          if (saved.fieldErrors) setFieldErrors(saved.fieldErrors)
          if (saved.conflict) setSaveState('conflict')
          return
        }
        setRevision(saved.revision)
        dirty.current = false
      }
      const result = await actions.submitReport(detail.submission.id, { emailCopy })
      if (result.ok) router.refresh()
      else {
        setMessage(result.error)
        if (result.fieldErrors) setFieldErrors(result.fieldErrors)
      }
    })
  }

  const canReview =
    (isAdmin || !detail.isOwner) &&
    ['submitted', 'under_review', 'resubmitted'].includes(detail.submission.state)

  const latestReturn = detail.reviews.find((r) => r.action === 'return_for_correction')

  return (
    <div className="space-y-5">
      {/* ---- Header ---- */}
      <section className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div>
          <span
            className={cn(
              'inline-flex items-center rounded-full px-3 py-1 text-[12px] font-semibold',
              STATE_TONE[detail.submission.state],
            )}
          >
            {stateLabel(detail.submission.state)}
          </span>
          <p className="mt-2 text-sm text-gray-500">
            {detail.submission.periodLabel}
            {detail.submission.currentVersion > 0 &&
              ` · version ${detail.submission.currentVersion}`}
            {detail.submission.employeeName && ` · ${detail.submission.employeeName}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {editable && (
            <span className="flex items-center gap-1.5 text-[13px] text-gray-500">
              <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
              {saveState === 'saving' && 'Saving…'}
              {saveState === 'saved' && 'Saved'}
              {saveState === 'idle' && 'Autosaves as you type'}
              {saveState === 'error' && <span className="text-rose-600">Not saved</span>}
              {saveState === 'conflict' && <span className="text-amber-700">Out of date</span>}
            </span>
          )}
          {detail.submission.currentVersion > 0 && (
            <a
              href={`/api/reports/${detail.submission.id}/pdf?version=${detail.submission.currentVersion}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-4 py-2 text-[13px] font-semibold text-gray-700 hover:bg-gray-50"
            >
              <Download className="h-4 w-4" strokeWidth={1.75} />
              PDF
            </a>
          )}
        </div>
      </section>

      {saveState === 'conflict' && (
        <section className="flex items-start justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div>
            <h2 className="text-sm font-semibold text-amber-900">
              This report changed somewhere else
            </h2>
            <p className="mt-1 text-sm text-amber-900/90">{message}</p>
          </div>
          <button data-opus-button="warning" data-opus-button-size="medium"
            type="button"
            onClick={() => router.refresh()}
            className="shrink-0 rounded-full bg-amber-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-amber-800"
          >
            Reload
          </button>
        </section>
      )}

      {detail.submission.state === 'returned' && latestReturn && (
        <section className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <RotateCcw className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" strokeWidth={1.75} />
          <div>
            <h2 className="text-sm font-semibold text-amber-900">
              Returned for correction
              {latestReturn.reviewerName && ` by ${latestReturn.reviewerName}`}
            </h2>
            <p className="mt-1 text-sm text-amber-900/90">{latestReturn.note}</p>
            <p className="mt-2 text-[13px] text-amber-900/70">
              Your previous version is kept. Correcting this files a new one beside it.
            </p>
          </div>
        </section>
      )}

      {message && saveState !== 'conflict' && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{message}</p>
      )}

      {/* ---- The form, or the filed content ---- */}
      {editable ? (
        <div className="space-y-5">
          {detail.definition.sections.map((section) => (
            <section
              key={section.key}
              className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"
            >
              <h2 className="text-sm font-semibold text-gray-900">{section.title}</h2>
              {section.description && (
                <p className="mt-1 text-[13px] text-gray-500">{section.description}</p>
              )}
              <div className="mt-4 space-y-5">
                {section.fields.map((field) => {
                  const errors = errorsFor(field.key)
                  return (
                    <div key={field.key}>
                      <label className="block text-[13px] font-semibold text-gray-700">
                        {field.label}
                        {field.required && <span className="text-rose-500"> *</span>}
                      </label>
                      {field.help && (
                        <p className="mb-1.5 mt-0.5 text-[12px] text-gray-500">{field.help}</p>
                      )}
                      <div className="mt-1.5">
                        <FieldInput
                          field={field}
                          value={content[field.key]}
                          onChange={(next) => update(field.key, next)}
                          options={options}
                          invalid={errors.length > 0}
                        />
                      </div>
                      {errors.map((e, i) => (
                        <p key={i} className="mt-1 text-[12px] text-rose-600">
                          {e.rowIndex !== undefined ? `Row ${e.rowIndex + 1}: ` : ''}
                          {e.message}
                        </p>
                      ))}
                    </div>
                  )
                })}
              </div>
            </section>
          ))}

          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-5">
            {detail.template?.allowEmailCopy && (
              <label className="flex items-center gap-2 text-[13px] text-gray-600">
                <input
                  type="checkbox"
                  checked={emailCopy}
                  onChange={(e) => setEmailCopy(e.target.checked)}
                />
                Email a copy to the recipients
              </label>
            )}
            <button data-opus-button="primary" data-opus-button-size="medium"
              type="button"
              disabled={pending || saveState === 'conflict'}
              onClick={submit}
              className="ml-auto inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
            >
              <Send className="h-4 w-4" strokeWidth={2} />
              {detail.submission.state === 'returned' ? 'Resubmit' : 'Submit'}
            </button>
          </section>
        </div>
      ) : (
        <FiledView detail={detail} />
      )}

      {/* ---- Reviewer actions ---- */}
      {canReview && (
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          <h2 className="text-sm font-semibold text-gray-900">Your decision</h2>
          <textarea
            rows={3}
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            placeholder="Why are you returning it? The author sees this."
            className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {detail.submission.state === 'submitted' && (
              <button data-opus-button="control"
                type="button"
                disabled={pending}
                onClick={() => runReview('start_review')}
                className="rounded-full border border-gray-200 px-4 py-2 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Start review
              </button>
            )}
            <button data-opus-button="warning" data-opus-button-size="medium"
              type="button"
              disabled={pending}
              onClick={() => runReview('return_for_correction')}
              className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              Return for correction
            </button>
            <button data-opus-button="control"
              type="button"
              disabled={pending}
              onClick={() => runReview('accept')}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#9FE870] px-4 py-2 text-[13px] font-semibold text-gray-900 hover:brightness-95 disabled:opacity-50"
            >
              <Check className="h-4 w-4" strokeWidth={2} />
              Accept
            </button>
          </div>
        </section>
      )}

      {/* ---- Comments ---- */}
      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-gray-500">
          <MessageSquare className="h-4 w-4 text-gray-400" strokeWidth={1.75} />
          Comments
        </h2>
        {detail.comments.length > 0 ? (
          <ul className="mt-4 space-y-3">
            {detail.comments.map((c) => (
              <li key={c.id} className="rounded-xl bg-gray-50 px-4 py-3">
                <p className="text-[13px] font-semibold text-gray-900">
                  {c.authorName}
                  {c.visibility === 'internal' && (
                    <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                      Reviewers only
                    </span>
                  )}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{c.body}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-gray-400">No comments yet.</p>
        )}
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a comment"
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <button data-opus-button="primary" data-opus-button-size="medium"
            type="button"
            disabled={pending || comment.trim().length === 0}
            onClick={() => {
              startTransition(async () => {
                const result = await actions.addComment(detail.submission.id, comment)
                if (result.ok) {
                  setComment('')
                  router.refresh()
                } else setMessage(result.error)
              })
            }}
            className="rounded-full bg-gray-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            Post
          </button>
        </div>
      </section>

      {/* ---- History ---- */}
      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <button data-opus-button="control"
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className="flex w-full items-center justify-between gap-2"
        >
          <span className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-gray-500">
            <History className="h-4 w-4 text-gray-400" strokeWidth={1.75} />
            History
          </span>
          <span className="text-[12px] font-semibold text-gray-500">
            {showHistory ? 'Hide' : `${detail.reviews.length} events`}
          </span>
        </button>

        {showHistory && (
          <div className="mt-4 space-y-4">
            <ul className="space-y-2">
              {detail.reviews.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 text-sm">
                  <span>
                    <span className="font-medium text-gray-900">
                      {r.action.replace(/_/g, ' ')}
                    </span>
                    {r.reviewerName && <span className="text-gray-500"> by {r.reviewerName}</span>}
                    {r.note && <span className="block text-[13px] text-gray-500">{r.note}</span>}
                  </span>
                  <span className="shrink-0 text-[12px] text-gray-400">
                    {new Date(r.createdAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </li>
              ))}
            </ul>

            {detail.versions.length > 0 && (
              <div className="border-t border-gray-100 pt-4">
                <p className="text-[13px] font-semibold text-gray-700">Filed versions</p>
                <ul className="mt-2 space-y-1.5">
                  {detail.versions.map((v) => (
                    <li key={v.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">
                        Version {v.version} · {v.reason}
                      </span>
                      <a
                        href={`/api/reports/${detail.submission.id}/pdf?version=${v.version}`}
                        className="text-[13px] font-semibold text-gray-500 hover:text-gray-900"
                      >
                        PDF
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

/** What a filed report looks like: the stored version, not the live form. */
function FiledView({ detail }: { detail: ReportDetail }) {
  const version = detail.versions[0]
  if (!version) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
        Nothing has been filed yet.
      </div>
    )
  }

  // Rendered against the snapshot taken when this version was filed, not
  // against the current template. A template edited since must not change what
  // an already-filed report appears to say.
  const fields = allFields(version.fieldSnapshot)

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <div className="mb-4 flex items-center gap-2 text-[12px] text-gray-400">
        <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} />
        Showing version {version.version} as filed.
      </div>
      <dl className="space-y-4">
        {fields.map((field) => (
          <div key={field.key}>
            <dt className="text-[13px] font-semibold text-gray-700">{field.label}</dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm text-gray-900">
              {renderValue(version.content[field.key])}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not answered'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) {
    if (value.length === 0) return 'Not answered'
    return value
      .map((row) =>
        typeof row === 'object' && row !== null
          ? Object.values(row as Record<string, unknown>)
              .filter((v) => v !== null && v !== '')
              .join(' · ')
          : String(row),
      )
      .join('\n')
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== null && v !== '',
    )
    if (entries.length === 0) return 'Not answered'
    return entries.map(([k, v]) => `${k}: ${String(v)}`).join(' · ')
  }
  return String(value)
}
