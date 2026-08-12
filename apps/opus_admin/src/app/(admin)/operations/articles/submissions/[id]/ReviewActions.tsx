'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Send,
  Undo2,
  XCircle,
} from 'lucide-react'
import {
  approveAdviceSubmission,
  rejectAdviceSubmission,
  requestAdviceSubmissionCorrections,
} from '@/lib/advice-submission-actions'
import type { AdviceSubmissionStatus } from '@/lib/advice-submissions'

type Mode = null | 'request_changes' | 'reject'

const TERMINAL_STATUSES: AdviceSubmissionStatus[] = ['rejected']

export default function ReviewActions({
  submissionId,
  status,
  authorName,
  authorEmail,
  adminNotes,
  correctionNotes,
  sourcePostId,
  slug,
  publishedAt,
}: {
  submissionId: string
  status: AdviceSubmissionStatus
  authorName: string
  authorEmail: string
  adminNotes: string | null
  correctionNotes: string | null
  sourcePostId: string | null
  slug: string
  publishedAt: string
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>(null)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const isPending = status === 'pending' || status === 'submitted'
  const isApproved = status === 'approved'
  const isPublished = status === 'published'
  const isRejected = TERMINAL_STATUSES.includes(status)
  const inRevision = status === 'changes_requested' || status === 'revisions'

  function run(action: () => Promise<unknown>) {
    setError(null)
    startTransition(async () => {
      try {
        await action()
        setMode(null)
        setNotes('')
        router.refresh()
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : 'Could not complete that action.')
      }
    })
  }

  return (
    <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
      <Card>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-500">Author</p>
        <p className="mt-3 text-sm font-semibold text-gray-950">{authorName}</p>
        <a
          className="mt-1 block break-all text-xs text-gray-500 underline-offset-4 hover:text-[#7E5896] hover:underline"
          href={`mailto:${authorEmail}`}
        >
          {authorEmail}
        </a>
      </Card>

      {(adminNotes || correctionNotes) && (
        <Card>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-500">
            Editor notes
          </p>
          {correctionNotes && (
            <div className="mt-3 rounded-lg bg-amber-50/70 p-3 text-sm leading-6 text-amber-950">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">
                Sent to author
              </p>
              <p className="mt-1">{correctionNotes}</p>
            </div>
          )}
          {adminNotes && (
            <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm leading-6 text-gray-700">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500">
                Internal
              </p>
              <p className="mt-1">{adminNotes}</p>
            </div>
          )}
        </Card>
      )}

      {(isApproved || isPublished) && sourcePostId && (
        <Card>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-500">Public post</p>
          <p className="mt-3 break-all text-sm font-medium text-gray-950">
            /advice-and-ideas/{slug || '—'}
          </p>
          {isPublished && (
            <p className="mt-1 text-xs text-gray-500">
              Published {new Date(publishedAt).toLocaleDateString()}
            </p>
          )}
          {slug && (
            <a
              href={`/advice-and-ideas/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#7E5896] hover:underline"
            >
              View on site
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </Card>
      )}

      <Card>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-500">Decision</p>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {mode === null && (
          <div className="mt-4 space-y-2">
            {(isPending || inRevision) && (
              <>
                <PrimaryButton
                  onClick={() => run(() => approveAdviceSubmission(submissionId, true))}
                  pending={pending}
                  icon={Send}
                  label="Approve & publish"
                />
                <SecondaryButton
                  onClick={() => run(() => approveAdviceSubmission(submissionId, false))}
                  pending={pending}
                  icon={CheckCircle2}
                  label="Approve as draft post"
                />
                <SecondaryButton
                  onClick={() => setMode('request_changes')}
                  pending={pending}
                  icon={Undo2}
                  label="Request changes"
                />
                <DestructiveButton
                  onClick={() => setMode('reject')}
                  pending={pending}
                  icon={XCircle}
                  label="Reject"
                />
              </>
            )}

            {isApproved && (
              <PrimaryButton
                onClick={() => run(() => approveAdviceSubmission(submissionId, true))}
                pending={pending}
                icon={Send}
                label="Publish now"
              />
            )}

            {isPublished && (
              <p className="text-sm text-gray-500">
                Published. Re-opening this submission for review isn&rsquo;t supported yet.
              </p>
            )}

            {isRejected && (
              <p className="text-sm text-gray-500">
                Submission was not accepted. The author can&rsquo;t edit it from here.
              </p>
            )}
          </div>
        )}

        {mode === 'request_changes' && (
          <NotesForm
            label="Notes for the author"
            placeholder="Be specific. What should they change before resubmitting?"
            required
            confirmLabel="Send notes"
            confirmIntent="primary"
            pending={pending}
            notes={notes}
            onChange={setNotes}
            onCancel={() => {
              setMode(null)
              setNotes('')
              setError(null)
            }}
            onConfirm={() => {
              if (!notes.trim()) {
                setError('Please write at least a sentence so the author knows what to change.')
                return
              }
              run(() => requestAdviceSubmissionCorrections(submissionId, notes))
            }}
          />
        )}

        {mode === 'reject' && (
          <NotesForm
            label="Internal note (optional)"
            placeholder="Why this didn't make the cut. Visible only to the editorial team."
            required={false}
            confirmLabel="Reject submission"
            confirmIntent="destructive"
            pending={pending}
            notes={notes}
            onChange={setNotes}
            onCancel={() => {
              setMode(null)
              setNotes('')
              setError(null)
            }}
            onConfirm={() => run(() => rejectAdviceSubmission(submissionId, notes))}
          />
        )}
      </Card>
    </aside>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      {children}
    </section>
  )
}

function PrimaryButton({
  onClick,
  pending,
  icon: Icon,
  label,
}: {
  onClick: () => void
  pending: boolean
  icon: typeof Send
  label: string
}) {
  return (
    <button data-opus-button="control"
      type="button"
      onClick={onClick}
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#5B2D8E] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4D247A] disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </button>
  )
}

function SecondaryButton({
  onClick,
  pending,
  icon: Icon,
  label,
}: {
  onClick: () => void
  pending: boolean
  icon: typeof Send
  label: string
}) {
  return (
    <button data-opus-button="neutral" data-opus-button-size="medium"
      type="button"
      onClick={onClick}
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-60"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

function DestructiveButton({
  onClick,
  pending,
  icon: Icon,
  label,
}: {
  onClick: () => void
  pending: boolean
  icon: typeof XCircle
  label: string
}) {
  return (
    <button data-opus-button="danger" data-opus-button-size="medium"
      type="button"
      onClick={onClick}
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-transparent px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-60"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

function NotesForm({
  label,
  placeholder,
  required,
  confirmLabel,
  confirmIntent,
  pending,
  notes,
  onChange,
  onCancel,
  onConfirm,
}: {
  label: string
  placeholder: string
  required: boolean
  confirmLabel: string
  confirmIntent: 'primary' | 'destructive'
  pending: boolean
  notes: string
  onChange: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const confirmClass =
    confirmIntent === 'destructive'
      ? 'bg-red-600 hover:bg-red-700'
      : 'bg-[#5B2D8E] hover:bg-[#4D247A]'

  return (
    <div className="mt-4 space-y-3">
      <label className="block">
        <span className="text-xs font-semibold text-gray-700">
          {label} {required && <span className="text-red-700">*</span>}
        </span>
        <textarea
          value={notes}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={5}
          className="mt-2 w-full resize-none rounded-lg border border-gray-200 p-3 text-sm leading-6 outline-none focus:border-[#5B2D8E]"
        />
      </label>
      <div className="flex justify-end gap-2">
        <button data-opus-button="control"
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 disabled:opacity-60"
        >
          Cancel
        </button>
        <button data-opus-button="control"
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-60 ${confirmClass}`}
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {confirmLabel}
        </button>
      </div>
    </div>
  )
}
