'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Car,
  Check,
  CheckCircle2,
  CloudUpload,
  FileCheck2,
  FileSignature,
  FileText,
  MessageCircleQuestion,
  PackageOpen,
  Pencil,
  Plane,
  Plus,
  Send,
  ShoppingCart,
  StickyNote,
  UserPlus,
  Wallet,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { HeaderBadgeSlot } from '@/components/HeaderPortals'
import { APPROVER_ROSTER } from './data'
import { joinDateTime, joinRange, sortKey, splitDateTime, splitRange } from './datetime'
import type {
  ApprovalActivity,
  ApprovalActor,
  ApprovalApprover,
  ApprovalCategory,
  ApprovalField,
  ApprovalRequest,
  ApprovalStatus,
} from './types'
import type { NotificationOutcome } from './actions'
import { getApprovalAttachmentUrl } from './attachment-actions'

// Decisions an approver can take on a submitted request. `info` keeps
// the request in flight but routes it back to the submitter for edits.
export type DecisionKind = 'approve' | 'refuse' | 'info'

const ICONS: Record<ApprovalCategory['iconKey'], LucideIcon> = {
  Plane,
  PackageOpen,
  FileCheck2,
  FileSignature,
  Wallet,
  Car,
  UserPlus,
  ShoppingCart,
  FileText,
}

export type RequestFormDraft = {
  category: ApprovalCategory['key']
  subject: string
  fields: Record<string, string>
  approvers: ApprovalApprover[]
}

export default function RequestFormView({
  actor,
  category,
  request,
  isNew,
  onSave,
  onDiscard,
  onTransition,
  onAppendNote,
  onUploadAttachment,
  onRemoveAttachment,
}: {
  actor: ApprovalActor
  category: ApprovalCategory
  // For an existing request, pass the record. For a brand-new one, pass
  // null and `isNew=true`; the form starts empty and "Save" promotes it.
  request: ApprovalRequest | null
  isNew: boolean
  // Persist the current draft to Supabase. Resolves with the saved (or
  // freshly-created) request so the parent can swap in the canonical
  // reference; rejects with an Error the form surfaces.
  onSave: (draft: RequestFormDraft) => Promise<ApprovalRequest>
  onDiscard: () => void
  // Resolves with the saved request plus whatever the server-side
  // notification fan-out did, so the form can report it without owning
  // dispatch itself.
  onTransition: (
    id: string,
    next: ApprovalStatus,
    decision?: { kind: DecisionKind; note?: string },
  ) => Promise<{ request: ApprovalRequest; notification?: NotificationOutcome }>
  onAppendNote: (id: string, body: string) => Promise<void>
  // Receipts, quotes and invoices. Both resolve with the refreshed request so
  // the attachment list and the activity feed move together — an upload writes
  // an audit entry, and showing one without the other would look like a bug.
  onUploadAttachment: (id: string, file: File) => Promise<void>
  onRemoveAttachment: (attachmentId: string) => Promise<void>
}) {
  const Icon = ICONS[category.iconKey]

  // Local draft state — survives across re-renders without saving.
  const [subject, setSubject] = useState(request?.subject ?? '')
  const [values, setValues] = useState<Record<string, string>>(() =>
    request?.fields ?? defaultsFor(category.fields),
  )
  const [approvers, setApprovers] = useState<ApprovalApprover[]>(request?.approvers ?? [])
  const [rightPanel, setRightPanel] = useState<'activity' | 'note'>('activity')
  const [noteText, setNoteText] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Decision dialog state — null when nothing's open. Decision flows
  // share one dialog with different copy/required-vs-optional note rules.
  const [decision, setDecision] = useState<DecisionKind | null>(null)
  // Pending state for any in-flight server action (email dispatch).
  const [busy, setBusy] = useState(false)
  // Surfaces email dispatch outcome — success, partial failure, or
  // gracefully-degraded when Resend isn't configured.
  const [dispatchToast, setDispatchToast] = useState<string | null>(null)
  // Tracks whether any local edit has happened so the save controls
  // know they have work to flush.
  const [dirty, setDirty] = useState(false)

  // Reset when the underlying record changes (eg. user clicks a
  // different request from the dashboard list).
  useEffect(() => {
    setSubject(request?.subject ?? '')
    setValues(request?.fields ?? defaultsFor(category.fields))
    setApprovers(request?.approvers ?? [])
    setDirty(false)
    setError(null)
    setNoteText('')
  }, [request, category.fields])

  const status: ApprovalStatus = request?.status ?? 'To Submit'

  function setValue(id: string, v: string) {
    setValues((prev) => ({ ...prev, [id]: v }))
    setDirty(true)
  }

  function setApproverList(list: ApprovalApprover[]) {
    setApprovers(list)
    setDirty(true)
  }

  async function save(): Promise<ApprovalRequest | null> {
    setError(null)
    const trimmed = subject.trim()
    if (!trimmed) {
      setError('Approval subject is required.')
      return null
    }
    for (const f of category.fields) {
      // Subject is held in its own `subject` state, not in the values
      // dict — skip it here so we don't double-check against an empty
      // values.subject entry that never gets written.
      if (f.id === 'subject') continue
      const v = values[f.id]?.trim() ?? ''
      // Date fields are checked on their date part, never the time: the
      // time is optional everywhere, so "14:30 with no day" reads as empty
      // rather than as a satisfied requirement. Range ordering is checked
      // whether or not the field is required — an optional period that
      // ends before it starts is still wrong.
      if (f.kind === 'date') {
        if (f.required && !splitDateTime(v).date) {
          setError(`"${f.label}" is required.`)
          return null
        }
        continue
      }
      if (f.kind === 'date-range') {
        const [s, e] = splitRange(v)
        const startDate = splitDateTime(s).date
        const endDate = splitDateTime(e).date
        if (f.required && (!startDate || !endDate)) {
          setError(`"${f.label}" is required.`)
          return null
        }
        if (startDate && endDate && sortKey(e) < sortKey(s)) {
          setError(`"${f.label}" — the end must be on or after the start.`)
          return null
        }
        continue
      }
      if (!f.required) continue
      if (!v) {
        setError(`"${f.label}" is required.`)
        return null
      }
    }
    try {
      const saved = await onSave({
        category: category.key,
        subject: trimmed,
        fields: values,
        approvers,
      })
      setDirty(false)
      return saved
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the request.')
      return null
    }
  }

  // ----- Server-action wrappers ----------------------------------------------

  function summarizeDispatch(verb: string, summary: NotificationOutcome | undefined): string {
    if (!summary) return `${verb}.`
    const { emailsSent, emailsFailed, bellCreated, configured } = summary
    const parts: string[] = []
    if (bellCreated > 0) {
      parts.push(`${bellCreated} notified in-app`)
    }
    if (!configured) {
      parts.push('email not sent (RESEND_API_KEY is not configured)')
    } else if (emailsSent > 0) {
      parts.push(`${emailsSent} email${emailsSent === 1 ? '' : 's'} sent`)
    }
    if (emailsFailed > 0) {
      parts.push(`${emailsFailed} email${emailsFailed === 1 ? '' : 's'} failed`)
    }
    return parts.length > 0 ? `${verb}. ${parts.join(', ')}.` : `${verb}.`
  }

  async function submit() {
    // Persist the request first (create if new, or flush pending edits),
    // then move it to Submitted, then fire the notification emails.
    let current = request ?? (await save())
    if (!current) return
    if (request && dirty) {
      const re = await save()
      if (!re) return
      current = re
    }

    setBusy(true)
    setDispatchToast(null)
    try {
      // Notification dispatch happens inside this action, server-side. The
      // browser is no longer responsible for telling the approvers — closing
      // the tab mid-flight used to mean nobody was told.
      const result = await onTransition(current.id, 'Submitted')
      setDispatchToast(summarizeDispatch('Submitted', result.notification))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit the request.')
    } finally {
      setBusy(false)
    }
  }

  async function runDecision(kind: DecisionKind, note: string) {
    if (!request) return
    const trimmed = note.trim()
    const nextStatus: ApprovalStatus =
      kind === 'approve' ? 'Approved' : kind === 'refuse' ? 'Refused' : 'To Submit'

    setDecision(null)
    setBusy(true)
    setDispatchToast(null)
    try {
      const result = await onTransition(request.id, nextStatus, { kind, note: trimmed })
      const verb = kind === 'approve' ? 'Approved' : kind === 'refuse' ? 'Refused' : 'Info requested'
      setDispatchToast(summarizeDispatch(verb, result.notification))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the request.')
    } finally {
      setBusy(false)
    }
  }

  async function appendNote() {
    if (!request || !noteText.trim()) return
    const body = noteText.trim()
    try {
      await onAppendNote(request.id, body)
      setNoteText('')
      setRightPanel('activity')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the note.')
    }
  }

  const subjectField = category.fields.find((f) => f.id === 'subject')
  // A request with no approvers routes to nobody: no email goes out and it
  // sits in Submitted forever. Block submission rather than let it happen
  // silently.
  const iAmOwner = Boolean(
    request && request.ownerEmail.trim().toLowerCase() === actor.email.trim().toLowerCase(),
  )
  const noOneElseCanDecide =
    status === 'Submitted' &&
    iAmOwner &&
    approvers.every((a) => a.email.trim().toLowerCase() === actor.email.trim().toLowerCase())

  const blockingReason =
    status === 'To Submit' && approvers.length === 0
      ? 'Add at least one approver before submitting.'
      : noOneElseCanDecide
        ? 'You raised this request, so you cannot decide on it. Reopen it as a draft and route it to someone else.'
        : null

  return (
    <div className="space-y-4">
      {isNew && !request && (
        <HeaderBadgeSlot>
          <span className="inline-flex items-center rounded-md border border-[#C9A0DC] bg-[#F8EDFF] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[#5B2D8E]">
            New
          </span>
        </HeaderBadgeSlot>
      )}

      {/* Everything that acts on the record lives in one sticky bar:
          where the request is, and what you can do to it next. Sticky
          because the form below scrolls past it on smaller screens. */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-gray-100 bg-white/95 px-4 py-3 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] backdrop-blur">
        <RequestProgress status={status} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {dirty && (
            <>
              <span className="text-xs font-medium text-amber-600">Unsaved changes</span>
              <button data-opus-button="control"
                type="button"
                onClick={onDiscard}
                className="rounded-lg px-2.5 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              >
                Discard
              </button>
              <button data-opus-button="neutral" data-opus-button-size="medium"
                type="button"
                onClick={() => save()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
              >
                <CloudUpload className="h-4 w-4" />
                Save draft
              </button>
            </>
          )}
          <PrimaryActions
            status={status}
            busy={busy}
            blockingReason={blockingReason}
            onSubmit={submit}
            onApprove={() => setDecision('approve')}
            onRefuse={() => setDecision('refuse')}
            onRequestInfo={() => setDecision('info')}
            onReopen={() => {
              if (request) {
                onTransition(request.id, 'To Submit').catch((err) =>
                  setError(err instanceof Error ? err.message : 'Could not reopen the request.'),
                )
              }
            }}
          />
        </div>
      </div>

      {error && (
        // role=alert so validation failure is announced. The message is the
        // only feedback a save gives when a required field is empty, and
        // without this a screen-reader user clicks Save and hears nothing.
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700"
        >
          {error}
        </p>
      )}
      {dispatchToast && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {dispatchToast}
        </p>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(320px,1fr)]">
        {/* ---- Form ---- */}
        <div className="space-y-4">
          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            <div className="flex items-start gap-4">
              <span
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: category.tint, color: category.accent }}
              >
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <label htmlFor="approval-subject" className="mb-1.5 flex items-center gap-1">
                  <span className="text-xs font-semibold text-gray-700">Approval subject</span>
                  <span className="text-[10px] font-bold text-rose-500">*</span>
                </label>
                <input
                  id="approval-subject"
                  type="text"
                  value={subject}
                  // The asterisk above is visual only; this is what carries
                  // "required" to assistive tech.
                  aria-required
                  onChange={(e) => {
                    setSubject(e.target.value)
                    setDirty(true)
                  }}
                  // Never the bare category name — a placeholder reading
                  // "Bolt Service" on a Bolt Service form looks like a
                  // filled-in title rather than an empty required field.
                  placeholder={subjectField?.placeholder ?? 'Short summary of what you need approved'}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-base font-semibold text-gray-900 outline-none placeholder:font-normal placeholder:text-gray-400 focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
                />
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                  <span>
                    Raised by{' '}
                    <span className="font-semibold text-gray-700">
                      {request?.owner ?? actor.name}
                    </span>
                  </span>
                  <span className="text-gray-300">·</span>
                  <span>{category.label}</span>
                </p>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            <h2 className="border-b border-gray-100 px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">
              Details
            </h2>
            <div className="divide-y divide-gray-50">
              {category.fields
                .filter((f) => f.id !== 'subject' && f.id !== 'description' && f.kind !== 'list')
                .map((f) => (
                  <FieldRow
                    key={f.id}
                    label={f.label}
                    required={f.required}
                    hint={f.hint}
                    htmlFor={`field-${f.id}`}
                  >
                    <FieldInput
                      field={f}
                      value={values[f.id] ?? ''}
                      onChange={(v) => setValue(f.id, v)}
                    />
                  </FieldRow>
                ))}
            </div>
          </section>

          <DescriptionSection category={category} values={values} onChange={setValue} />
        </div>

        {/* ---- Routing + activity rail ---- */}
        <div className="space-y-4 lg:sticky lg:top-24">
          <ApproversCard
            value={approvers}
            onChange={setApproverList}
            status={status}
            editable={status === 'To Submit'}
            actorEmail={actor.email}
          />
          <AttachmentsCard
            request={request}
            actorEmail={actor.email}
            onUpload={onUploadAttachment}
            onRemove={onRemoveAttachment}
          />
          <ActivityPanel
            activity={request?.activity ?? []}
            isNew={isNew && !request}
            panel={rightPanel}
            onPanel={setRightPanel}
            noteText={noteText}
            onNoteText={setNoteText}
            onAppendNote={appendNote}
            canNote={Boolean(request)}
          />
        </div>
      </div>

      {decision && (
        <DecisionDialog
          kind={decision}
          busy={busy}
          onClose={() => setDecision(null)}
          onConfirm={(note) => runDecision(decision, note)}
        />
      )}
    </div>
  )
}

// ----- Progress track --------------------------------------------------------

// A request has three moments, not four: it's a draft, it's out with
// approvers, or it's been decided. The old stepper numbered
// "Approved" 3 and "Refused" 4, which read as a sequence — as though a
// request had to be approved before it could be refused. Refusal is an
// alternate outcome of the same step, so both collapse into one terminal
// node whose colour and label carry the result.
type ProgressStep = {
  key: string
  label: string
  state: 'done' | 'current' | 'pending'
  tone: 'neutral' | 'good' | 'bad'
}

function progressFor(status: ApprovalStatus): ProgressStep[] {
  const decided = status === 'Approved' || status === 'Refused'
  return [
    {
      key: 'draft',
      label: 'Draft',
      state: status === 'To Submit' ? 'current' : 'done',
      tone: 'neutral',
    },
    {
      key: 'submitted',
      label: 'Submitted',
      state: status === 'To Submit' ? 'pending' : decided ? 'done' : 'current',
      tone: 'neutral',
    },
    {
      key: 'decision',
      label: status === 'Approved' ? 'Approved' : status === 'Refused' ? 'Refused' : 'Decision',
      state: decided ? 'current' : 'pending',
      tone: status === 'Approved' ? 'good' : status === 'Refused' ? 'bad' : 'neutral',
    },
  ]
}

function RequestProgress({ status }: { status: ApprovalStatus }) {
  const steps = progressFor(status)
  return (
    <ol className="flex items-center gap-1" aria-label={`Request status: ${status}`}>
      {steps.map((s, i) => {
        const active = s.state === 'current'
        const done = s.state === 'done'
        return (
          <li key={s.key} className="flex items-center gap-1">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full py-1.5 pl-2 pr-3 text-xs font-semibold transition-colors',
                done && 'text-gray-500',
                active && s.tone === 'neutral' && 'bg-[#F0DFF6] text-[#5B2D8E]',
                active && s.tone === 'good' && 'bg-emerald-50 text-emerald-700',
                active && s.tone === 'bad' && 'bg-rose-50 text-rose-700',
                s.state === 'pending' && 'text-gray-400',
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                  done && 'bg-emerald-500 text-white',
                  active && s.tone === 'neutral' && 'bg-[#7E5896] text-white',
                  active && s.tone === 'good' && 'bg-emerald-600 text-white',
                  active && s.tone === 'bad' && 'bg-rose-600 text-white',
                  s.state === 'pending' && 'border border-gray-200 bg-white text-gray-400',
                )}
              >
                {done || (active && s.tone === 'good') ? (
                  <Check className="h-3 w-3" strokeWidth={3} />
                ) : active && s.tone === 'bad' ? (
                  <X className="h-3 w-3" strokeWidth={3} />
                ) : (
                  i + 1
                )}
              </span>
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span
                className={cn(
                  'h-px w-5 shrink-0',
                  steps[i + 1].state === 'pending' ? 'bg-gray-200' : 'bg-emerald-400',
                )}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

// ----- Primary actions -------------------------------------------------------

// Only what you can actually do to the record, in the state it's in. The
// previous bar also carried "Attach Document", "Send message" and
// "Activity" chips that had no handler at all — controls that do nothing
// when clicked are worse than absent ones, so they're gone until the
// features behind them exist.
function PrimaryActions({
  status,
  busy,
  blockingReason,
  onSubmit,
  onApprove,
  onRefuse,
  onRequestInfo,
  onReopen,
}: {
  status: ApprovalStatus
  busy: boolean
  // Non-null when the request isn't fit to submit. Shown next to the
  // disabled button so the block is explained, not just enforced.
  blockingReason: string | null
  onSubmit: () => void
  onApprove: () => void
  onRefuse: () => void
  onRequestInfo: () => void
  onReopen: () => void
}) {
  if (status === 'To Submit') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {blockingReason && (
          <span id="submit-blocked-reason" className="text-xs font-medium text-gray-500">
            {blockingReason}
          </span>
        )}
        <button data-opus-button="control"
          type="button"
          onClick={onSubmit}
          disabled={busy || Boolean(blockingReason)}
          // describedby, not title: a title attribute wins the accessible
          // name in some readers, so the button announces the reason
          // instead of what it does.
          aria-describedby={blockingReason ? 'submit-blocked-reason' : undefined}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
          {busy ? 'Submitting…' : 'Submit for approval'}
        </button>
      </div>
    )
  }

  if (status === 'Submitted') {
    if (blockingReason) {
      // Reached when the only people who could decide are barred from doing
      // so — in practice, the requester routed it to themselves. Say why,
      // and name the way out, instead of rendering buttons that will fail.
      return (
        <p className="max-w-md text-xs font-medium text-amber-700">{blockingReason}</p>
      )
    }
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button data-opus-button="warning" data-opus-button-size="medium"
          type="button"
          onClick={onRequestInfo}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
        >
          <MessageCircleQuestion className="h-4 w-4" />
          Request info
        </button>
        <button data-opus-button="danger" data-opus-button-size="medium"
          type="button"
          onClick={onRefuse}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
        >
          <XCircle className="h-4 w-4" />
          Refuse
        </button>
        <button data-opus-button="control"
          type="button"
          onClick={onApprove}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <CheckCircle2 className="h-4 w-4" />
          Approve
        </button>
      </div>
    )
  }

  return (
    <button data-opus-button="neutral" data-opus-button-size="medium"
      type="button"
      onClick={onReopen}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
    >
      <Pencil className="h-4 w-4" />
      Reopen as draft
    </button>
  )
}

// ----- Field row + inputs ----------------------------------------------------

function FieldRow({
  label,
  required,
  hint,
  htmlFor,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-1 gap-1.5 px-5 py-3 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center sm:gap-4">
      <label htmlFor={htmlFor} className="text-xs font-semibold text-gray-700">
        <span className="flex items-center gap-1">
          {label}
          {required && <span className="text-[10px] font-bold text-rose-500">*</span>}
        </span>
        {hint && <span className="mt-0.5 block font-normal text-gray-400">{hint}</span>}
      </label>
      <div className="min-w-0 text-sm text-gray-900">{children}</div>
    </div>
  )
}

// Every editable field renders as a bordered box. The previous `compact`
// variant drew a transparent border on a transparent background, so
// half the form (pickup, dropoff, category, amount) looked like static
// grey text and people did not realise it could be typed into.
const INPUT_CLASS =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]'

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: ApprovalField
  value: string
  onChange: (v: string) => void
}) {
  const baseInput = INPUT_CLASS

  const id = `field-${field.id}`
  // The label renders a red asterisk. That is colour and glyph only, so on
  // its own it tells assistive tech nothing: aria-required is what makes
  // "this is required" available before a save fails rather than after.
  // Deliberately aria-required and not the native `required` attribute —
  // validation is done in save() so it can report one clear message, and the
  // native attribute would hand the browser a competing popup.
  const req = field.required || undefined

  if (field.kind === 'text') {
    return (
      <input
        id={id}
        type="text"
        value={value}
        aria-required={req}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={baseInput}
      />
    )
  }
  if (field.kind === 'textarea') {
    return (
      <textarea
        id={id}
        value={value}
        rows={5}
        aria-required={req}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={baseInput}
      />
    )
  }
  if (field.kind === 'date') {
    return (
      <DateTimeInput
        id={id}
        label={field.label}
        value={value}
        required={req}
        onChange={onChange}
      />
    )
  }
  if (field.kind === 'date-range') {
    // Four controls do not fit on one line in this column, so the two ends
    // stack. Stacked, a bare "to" between them stops carrying its weight —
    // each row gets its own From / To label instead.
    const [start, end] = splitRange(value)
    return (
      <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-x-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          From
        </span>
        <DateTimeInput
          id={id}
          label={`${field.label} — start`}
          value={start}
          required={req}
          onChange={(v) => onChange(joinRange(v, end))}
        />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">To</span>
        <DateTimeInput
          label={`${field.label} — end`}
          value={end}
          required={req}
          onChange={(v) => onChange(joinRange(start, v))}
        />
      </div>
    )
  }
  if (field.kind === 'amount') {
    // Currency sits inside the box as a prefix so the field reads as one
    // control rather than a stray label next to an invisible input.
    return (
      <div className="flex w-full items-stretch overflow-hidden rounded-lg border border-gray-200 bg-white focus-within:border-transparent focus-within:ring-2 focus-within:ring-[#C9A0DC] sm:max-w-[240px]">
        <span className="flex items-center border-r border-gray-200 bg-gray-50 px-3 text-xs font-semibold text-gray-500">
          TZS
        </span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value.replace(/^TZS\s*/, '')}
          aria-required={req}
          placeholder="0.00"
          onChange={(e) => onChange(e.target.value ? `TZS ${e.target.value}` : '')}
          className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400"
        />
      </div>
    )
  }
  if (field.kind === 'number') {
    return (
      <input
        id={id}
        type="number"
        value={value}
        aria-required={req}
        onChange={(e) => onChange(e.target.value)}
        className={cn(baseInput, 'sm:max-w-[200px]')}
      />
    )
  }
  return (
    <ListInput value={value} placeholder={field.placeholder} required={req} onChange={onChange} />
  )
}

// A date and the hour on it, as one answer. The time is optional — a
// pickup or a quote deadline needs it, a hire date does not — so it is
// never required-validated and stays out of the stored value until set.
function DateTimeInput({
  id,
  label,
  value,
  required,
  onChange,
}: {
  id?: string
  label: string
  value: string
  // Marked on the date half only. The time is optional in every field that
  // uses this, so announcing the whole control as required would demand
  // something save() never checks for.
  required?: true
  onChange: (v: string) => void
}) {
  const { date, time } = splitDateTime(value)
  return (
    <div className="flex items-center gap-1.5">
      <input
        id={id}
        type="date"
        aria-label={`${label} — date`}
        aria-required={required}
        value={date}
        onChange={(e) => onChange(joinDateTime(e.target.value, time))}
        className={cn(INPUT_CLASS, 'w-auto min-w-0 flex-1 sm:max-w-[170px]')}
      />
      <input
        type="time"
        aria-label={`${label} — time`}
        value={time}
        onChange={(e) => onChange(joinDateTime(date, e.target.value))}
        className={cn(INPUT_CLASS, 'w-auto min-w-0 sm:max-w-[120px]')}
      />
    </div>
  )
}

function ListInput({
  value,
  placeholder,
  required,
  onChange,
}: {
  value: string
  placeholder?: string
  // A list satisfies "required" when its first line has content, so the
  // marker goes on the first row rather than every row.
  required?: true
  onChange: (v: string) => void
}) {
  const lines = value ? value.split('\n') : ['']
  function setLine(i: number, v: string) {
    const next = [...lines]
    next[i] = v
    onChange(next.join('\n'))
  }
  function remove(i: number) {
    const next = lines.filter((_, idx) => idx !== i)
    onChange(next.length === 0 ? '' : next.join('\n'))
  }
  return (
    <div className="space-y-2">
      {lines.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            value={l}
            aria-required={i === 0 ? required : undefined}
            placeholder={placeholder}
            onChange={(e) => setLine(i, e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
          />
          {lines.length > 1 && (
            <button data-opus-button="control"
              type="button"
              onClick={() => remove(i)}
              aria-label="Remove line"
              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-50 hover:text-rose-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
      <button data-opus-button="control"
        type="button"
        onClick={() => onChange([...lines, ''].join('\n'))}
        className="inline-flex items-center gap-1 text-xs font-semibold text-[#5B2D8E] hover:underline"
      >
        <Plus className="h-3.5 w-3.5" />
        Add a line
      </button>
    </div>
  )
}

// ----- Description + line items ----------------------------------------------

function DescriptionSection({
  category,
  values,
  onChange,
}: {
  category: ApprovalCategory
  values: Record<string, string>
  onChange: (id: string, v: string) => void
}) {
  const descriptionField = category.fields.find((f) => f.id === 'description')
  const listFields = category.fields.filter((f) => f.kind === 'list')
  if (!descriptionField && listFields.length === 0) return null

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <h2 className="border-b border-gray-100 px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">
        Justification
      </h2>
      <div className="space-y-4 p-5">
        {listFields.map((f) => (
          <div key={f.id}>
            <label
              htmlFor={`field-${f.id}`}
              className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-gray-700"
            >
              {f.label}
              {f.required && <span className="text-[10px] font-bold text-rose-500">*</span>}
            </label>
            <FieldInput field={f} value={values[f.id] ?? ''} onChange={(v) => onChange(f.id, v)} />
          </div>
        ))}
        {descriptionField && (
          <div>
            <label
              htmlFor="field-description"
              className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-gray-700"
            >
              {descriptionField.label}
              {descriptionField.required && (
                <span className="text-[10px] font-bold text-rose-500">*</span>
              )}
            </label>
            <FieldInput
              field={descriptionField}
              value={values[descriptionField.id] ?? ''}
              onChange={(v) => onChange(descriptionField.id, v)}
            />
          </div>
        )}
      </div>
    </section>
  )
}

// ----- Approvers -------------------------------------------------------------

// Promoted out of a tab into the rail. Who a request routes to is the
// single most consequential thing about it and it decides whether Submit
// works at all, so it can't be one click behind a tab labelled
// "Approver(s) (0)".
function ApproversCard({
  value,
  onChange,
  status,
  editable,
  actorEmail,
}: {
  value: ApprovalApprover[]
  onChange: (v: ApprovalApprover[]) => void
  status: ApprovalStatus
  editable: boolean
  actorEmail: string
}) {
  const [picking, setPicking] = useState(false)
  // Segregation of duties: you cannot route your own request to yourself. The
  // server already refuses the decision, but offering the choice produced a
  // request that could be submitted and then never decided by anyone — the
  // owner is blocked from approving it and no one else is named. Removing the
  // option prevents the dead end rather than catching it afterwards.
  const me = actorEmail.trim().toLowerCase()
  const available = APPROVER_ROSTER.filter(
    (a) => !value.some((v) => v.id === a.id) && a.email.trim().toLowerCase() !== me,
  )

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
          Approvers
        </h2>
        {value.length > 0 && (
          <span className="rounded-full bg-[#9FE870] px-2 py-0.5 text-[11px] font-bold text-[#14361F]">
            {value.length}
          </span>
        )}
      </div>

      {value.length === 0 ? (
        <div className="px-5 py-5 text-center">
          <p className="text-sm font-medium text-gray-700">No approvers yet</p>
          <p className="mt-1 text-xs text-gray-500">
            {editable
              ? 'This request routes to nobody until you add one.'
              : 'This request was submitted without an approver.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-50">
          {value.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-5 py-3">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F0DFF6] text-[11px] font-bold text-[#5B2D8E]">
                {initials(a.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">{a.name}</p>
                {a.role && <p className="truncate text-[11px] text-gray-500">{a.role}</p>}
              </div>
              {status === 'Submitted' && (
                <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  Pending
                </span>
              )}
              {editable && (
                <button data-opus-button="control"
                  type="button"
                  onClick={() => onChange(value.filter((v) => v.id !== a.id))}
                  className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-gray-50 hover:text-rose-600"
                  aria-label={`Remove ${a.name}`}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && available.length > 0 && (
        <div className="border-t border-gray-100 p-3">
          {picking ? (
            <ul className="max-h-56 overflow-y-auto">
              {available.map((a) => (
                <li key={a.id}>
                  <button data-opus-button="control"
                    type="button"
                    onClick={() => {
                      onChange([...value, a])
                      setPicking(false)
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-gray-50"
                  >
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F0DFF6] text-[10px] font-bold text-[#5B2D8E]">
                      {initials(a.name)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-gray-900">
                        {a.name}
                      </span>
                      {a.role && (
                        <span className="block truncate text-[11px] text-gray-500">{a.role}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <button data-opus-button="neutral" data-opus-button-size="small"
              type="button"
              onClick={() => setPicking(true)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-semibold text-[#5B2D8E] hover:border-[#C9A0DC] hover:bg-[#F8EDFF]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add approver
            </button>
          )}
        </div>
      )}

      {value.length > 0 && status === 'To Submit' && (
        <p className="border-t border-gray-100 bg-gray-50/60 px-5 py-2.5 text-[11px] text-gray-500">
          On submit, {value.length === 1 ? 'this approver gets' : 'these approvers get'} an email
          with a link to this request.
        </p>
      )}
    </section>
  )
}

// ----- Attachments -----------------------------------------------------------

// Receipts, quotes, invoices. A payment application without its receipt asks
// an approver to decide on an assertion.
//
// No URL is ever held in this component's props or state at rest. The list
// carries ids; a signed URL is fetched on click, lives 60 seconds, and is
// opened and discarded. That matters because a signed URL is a bearer token:
// keeping one in a page payload leaves it readable in devtools for as long as
// it is valid, to anyone looking at that screen.
function AttachmentsCard({
  request,
  actorEmail,
  onUpload,
  onRemove,
}: {
  request: ApprovalRequest | null
  actorEmail: string
  onUpload: (id: string, file: File) => Promise<void>
  onRemove: (attachmentId: string) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputId = 'approval-attachment-input'

  // An unsaved draft has no id to hang a file off. Saving first is the
  // honest sequence, so the control says so rather than failing on click.
  const saved = Boolean(request)
  const decided = request?.status === 'Approved' || request?.status === 'Refused'
  const isOwner =
    Boolean(request) &&
    request!.ownerEmail.trim().toLowerCase() === actorEmail.trim().toLowerCase()
  // Mirrors the server rule exactly. The server is the boundary; this only
  // avoids offering a button that would be refused.
  const canRemove = isOwner && request?.status === 'To Submit'
  const attachments = request?.attachments ?? []

  async function handleFile(file: File | undefined) {
    if (!file || !request) return
    setError(null)
    setBusy(true)
    try {
      await onUpload(request.id, file)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not attach that file.')
    } finally {
      setBusy(false)
    }
  }

  async function openAttachment(attachmentId: string) {
    setError(null)
    setBusy(true)
    try {
      const res = await getApprovalAttachmentUrl(attachmentId)
      if (!res.ok) {
        setError(res.error)
        return
      }
      // Opened rather than navigated to, so the approver keeps their place in
      // the request they are deciding on.
      window.open(res.url, '_blank', 'noopener,noreferrer')
    } catch {
      setError('Could not open that attachment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
          Attachments
        </h2>
        {attachments.length > 0 && (
          <span className="rounded-full bg-[#9FE870] px-2 py-0.5 text-[11px] font-semibold text-gray-900">
            {attachments.length}
          </span>
        )}
      </div>

      {attachments.length === 0 && (
        <p className="mb-3 text-sm text-gray-500">
          {decided
            ? 'Nothing was attached to this request.'
            : 'Attach the receipt, quote or invoice that backs this request.'}
        </p>
      )}

      <ul className="mb-3 space-y-1.5">
        {attachments.map((a) => (
          <li
            key={a.id}
            className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2"
          >
            <FileText className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
            <button data-opus-button="control"
              type="button"
              onClick={() => openAttachment(a.id)}
              disabled={busy}
              className="min-w-0 flex-1 text-left text-sm font-medium text-gray-900 underline-offset-2 hover:underline disabled:opacity-50"
            >
              {/* truncate, so a long filename cannot push the controls out of
                  the card */}
              <span className="block truncate">{a.fileName}</span>
              <span className="block text-[11px] font-normal text-gray-500">
                {formatBytes(a.sizeBytes)} · {a.uploadedBy}
              </span>
            </button>
            {canRemove && (
              <button data-opus-button="control"
                type="button"
                onClick={async () => {
                  setError(null)
                  setBusy(true)
                  try {
                    await onRemove(a.id)
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Could not remove that file.')
                  } finally {
                    setBusy(false)
                  }
                }}
                disabled={busy}
                aria-label={`Remove ${a.fileName}`}
                className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>

      {!decided && (
        <>
          <input
            id={inputId}
            type="file"
            className="sr-only"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
            disabled={!saved || busy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              // Cleared so re-picking the same file fires change again.
              e.target.value = ''
              void handleFile(file)
            }}
          />
          <label
            htmlFor={inputId}
            aria-disabled={!saved || busy}
            className={cn(
              'flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-700 hover:border-gray-400 hover:bg-gray-50',
              (!saved || busy) && 'pointer-events-none opacity-50',
            )}
          >
            <CloudUpload className="h-4 w-4" aria-hidden />
            {busy ? 'Working…' : 'Add attachment'}
          </label>
          <p className="mt-2 text-[11px] text-gray-500">
            {saved
              ? 'PDF or image, up to 10MB.'
              : 'Save this draft before attaching files.'}
          </p>
        </>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ----- Activity panel --------------------------------------------------------

function ActivityPanel({
  activity,
  isNew,
  panel,
  onPanel,
  noteText,
  onNoteText,
  onAppendNote,
  canNote,
}: {
  activity: ApprovalActivity[]
  isNew: boolean
  panel: 'activity' | 'note'
  onPanel: (p: 'activity' | 'note') => void
  noteText: string
  onNoteText: (v: string) => void
  onAppendNote: () => void
  canNote: boolean
}) {
  const groups = useMemo(() => groupByDay(activity), [activity])

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Activity</h2>
        {canNote && panel !== 'note' && (
          <button data-opus-button="control"
            type="button"
            onClick={() => onPanel('note')}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[#5B2D8E] hover:bg-[#F8EDFF]"
          >
            <StickyNote className="h-3.5 w-3.5" />
            Log note
          </button>
        )}
      </div>

      <div className="p-5">
      {panel === 'note' && canNote ? (
        <div className="mb-4 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
            Log note
          </p>
          <textarea
            value={noteText}
            onChange={(e) => onNoteText(e.target.value)}
            rows={4}
            placeholder="Internal note — visible to approvers, not to the requester."
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
          />
          <div className="flex justify-end gap-2">
            <button data-opus-button="control"
              type="button"
              onClick={() => onPanel('activity')}
              className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button data-opus-button="control"
              type="button"
              onClick={onAppendNote}
              disabled={!noteText.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              Log
            </button>
          </div>
        </div>
      ) : null}

      <div className="max-h-[420px] overflow-y-auto">
        {isNew ? (
          <p className="text-xs text-gray-500">
            Nothing yet. Saving this draft starts the trail — every submission, note and
            decision lands here.
          </p>
        ) : groups.length === 0 ? (
          <p className="text-xs text-gray-400">No activity yet.</p>
        ) : (
          groups.map((g) => (
            <ActivityDay key={g.label} label={g.label}>
              {g.items.map((a) => (
                <ActivityRow
                  key={a.id}
                  author={a.author}
                  initials={a.authorInitials}
                  color={a.authorColor}
                  time={formatTime(a.at)}
                  body={a.body}
                  muted={a.kind === 'system'}
                />
              ))}
            </ActivityDay>
          ))
        )}
      </div>
      </div>
    </section>
  )
}

function ActivityDay({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex-1 border-t border-gray-200" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          {label}
        </span>
        <span className="flex-1 border-t border-gray-200" />
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function ActivityRow({
  author,
  initials,
  color,
  time,
  body,
  muted,
}: {
  author: string
  initials: string
  color: string
  time: string
  body: string
  muted?: boolean
}) {
  return (
    <div className="flex items-start gap-2">
      <span
        className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white"
        style={{ backgroundColor: color }}
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs">
          <span className="font-semibold text-gray-900">{author}</span>
          <span className="ml-1.5 text-gray-400">{time}</span>
        </p>
        <p className={cn('mt-0.5 text-sm', muted ? 'text-gray-500' : 'text-gray-800')}>{body}</p>
      </div>
    </div>
  )
}

// ----- Helpers ---------------------------------------------------------------

function defaultsFor(fields: ApprovalField[]): Record<string, string> {
  const out: Record<string, string> = {}
  const today = new Date().toISOString().slice(0, 10)
  for (const f of fields) {
    if (f.kind === 'date') out[f.id] = today
    else if (f.kind === 'date-range') out[f.id] = `${today}/${today}`
    else out[f.id] = ''
  }
  return out
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function groupByDay(items: ApprovalActivity[]): { label: string; items: ApprovalActivity[] }[] {
  if (items.length === 0) return []
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const buckets = new Map<string, ApprovalActivity[]>()
  for (const a of items) {
    const day = a.at.slice(0, 10)
    if (!buckets.has(day)) buckets.set(day, [])
    buckets.get(day)!.push(a)
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([day, group]) => ({
      label: day === today ? 'Today' : day === yesterday ? 'Yesterday' : formatDay(day),
      items: group,
    }))
}

function formatDay(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

// ----- Decision dialog -------------------------------------------------------

const DECISION_COPY: Record<
  DecisionKind,
  { title: string; intro: string; cta: string; ctaClass: string; noteLabel: string; placeholder: string; required: boolean }
> = {
  approve: {
    title: 'Approve request',
    intro: 'The submitter will be notified by email. Add an optional note.',
    cta: 'Confirm approval',
    ctaClass: 'bg-emerald-600 hover:bg-emerald-700',
    noteLabel: 'Approver note (optional)',
    placeholder: 'Anything the submitter should know — context, conditions, next steps…',
    required: false,
  },
  refuse: {
    title: 'Refuse request',
    intro: 'The submitter will be notified by email — please share why so they can revise and resubmit.',
    cta: 'Confirm refusal',
    ctaClass: 'bg-rose-600 hover:bg-rose-700',
    noteLabel: 'Reason for refusal',
    placeholder: 'Why this can’t move forward as written.',
    required: true,
  },
  info: {
    title: 'Request more information',
    intro: 'The submitter will be notified by email. The request goes back to their queue as a draft.',
    cta: 'Send request',
    ctaClass: 'bg-amber-600 hover:bg-amber-700',
    noteLabel: 'What do you need?',
    placeholder: 'List the specific information missing — be precise so the submitter can resolve it.',
    required: true,
  },
}

function DecisionDialog({
  kind,
  busy,
  onClose,
  onConfirm,
}: {
  kind: DecisionKind
  busy: boolean
  onClose: () => void
  onConfirm: (note: string) => void
}) {
  const copy = DECISION_COPY[kind]
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function confirm() {
    const trimmed = note.trim()
    if (copy.required && !trimmed) {
      setError(`${copy.noteLabel} is required.`)
      return
    }
    onConfirm(trimmed)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-100 p-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{copy.title}</h2>
            <p className="mt-1 text-sm text-gray-500">{copy.intro}</p>
          </div>
          <button data-opus-button="control"
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 p-5">
          <label className="block">
            <span className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                {copy.noteLabel}
              </span>
              {copy.required && (
                <span className="text-[10px] font-bold text-rose-500">Required</span>
              )}
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder={copy.placeholder}
              autoFocus
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
            />
          </label>
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700"
            >
              {error}
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button data-opus-button="control"
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button data-opus-button="control"
            type="button"
            onClick={confirm}
            disabled={busy}
            className={cn(
              'rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50',
              copy.ctaClass,
            )}
          >
            {busy ? 'Sending…' : copy.cta}
          </button>
        </div>
      </div>
    </div>
  )
}
