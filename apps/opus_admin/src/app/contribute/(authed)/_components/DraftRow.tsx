'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Pencil, Trash2, Loader2 } from 'lucide-react'
import StatusPill, { type StatusVariant } from '@/app/(admin)/operations/_shared/StatusPill'
import { formatRelativeTime } from '@/app/(admin)/operations/_shared/relativeTime'
import {
  displayStatus,
  isEditableContributorStatus,
  type ContributorDraft,
} from '@/lib/contribute/types'
import { cn } from '@/lib/utils'

const CATEGORY_COLORS: Record<string, string> = {
  'Advice & Ideas': 'bg-[#F0DFF6]',
  'Real Weddings': 'bg-[#FDE8E8]',
  'Planning Guides': 'bg-[#E7F0FF]',
  Style: 'bg-[#F7E7F1]',
  Vendors: 'bg-[#E7F7EF]',
  Etiquette: 'bg-[#FFF4D8]',
}

const PILL: Record<string, StatusVariant> = {
  draft: 'draft',
  revisions: 'revisions',
  changes_requested: 'revisions',
  pending: 'pending',
  submitted: 'pending',
  approved: 'approved',
  published: 'published',
  rejected: 'rejected',
}

export default function DraftRow({
  draft,
  section,
}: {
  draft: ContributorDraft
  section: 'drafts' | 'pending' | 'published'
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const status = displayStatus(draft.status)
  const editable = isEditableContributorStatus(draft.status)
  const editorHref = `/contribute/drafts/${draft.id}`
  const publicHref = section === 'published' && draft.slug ? `/advice-and-ideas/${draft.slug}` : null
  const timeVerb =
    section === 'published'
      ? 'published'
      : section === 'pending'
        ? 'submitted'
        : 'edited'
  const timeIso =
    section === 'pending'
      ? draft.submitted_at ?? draft.updated_at
      : section === 'published'
        ? draft.reviewed_at ?? draft.updated_at
        : draft.updated_at

  function deleteDraft() {
    if (!editable) return
    const ok = window.confirm(
      'Delete this draft? This can’t be undone.'
    )
    if (!ok) return
    startTransition(async () => {
      setError(null)
      try {
        const response = await fetch(`/api/contribute/drafts/${draft.id}`, {
          method: 'DELETE',
        })
        const payload = (await response
          .json()
          .catch(() => ({}))) as { error?: string }
        if (!response.ok) {
          throw new Error(payload.error || 'Could not delete draft.')
        }
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not delete draft.')
      }
    })
  }

  return (
    <div data-opus-table-header
      role="row"
      className={cn(
        'grid grid-cols-[36px_minmax(0,1fr)_110px_120px] items-center gap-3 border-b border-gray-100 bg-white px-4 py-3.5 transition-colors last:border-b-0 hover:bg-gray-50/60 max-sm:grid-cols-[32px_minmax(0,1fr)_96px]',
        pending && 'opacity-60'
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-[#5B2D8E]',
          CATEGORY_COLORS[draft.category] ?? 'bg-gray-100'
        )}
      >
        {draft.category.slice(0, 1)}
      </span>
      <div className="min-w-0">
        <Link
          href={editorHref}
          className="block truncate text-sm font-semibold text-gray-950 hover:text-[#5B2D8E]"
          title={draft.title || 'Untitled draft'}
        >
          {draft.title || 'Untitled draft'}
        </Link>
        <p className="mt-0.5 truncate text-xs text-gray-500">
          {draft.category} · {draft.word_count.toLocaleString()} words · {timeVerb}{' '}
          {formatRelativeTime(timeIso)}
        </p>
        {error && (
          <p className="mt-1 truncate text-xs font-medium text-rose-700">
            {error}
          </p>
        )}
      </div>
      <div className="max-sm:hidden">
        <StatusPill
          variant={PILL[draft.status] ?? 'draft'}
          label={status === 'pending' ? 'Pending' : undefined}
        />
      </div>
      <div className="flex items-center justify-end gap-1">
        {editable ? (
          <>
            <Link
              href={editorHref}
              aria-label="Edit draft"
              title="Edit"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
            >
              <Pencil className="h-4 w-4" />
            </Link>
            <button data-opus-button="danger" data-opus-button-size="small"
              type="button"
              onClick={deleteDraft}
              disabled={pending}
              aria-label="Delete draft"
              title="Delete"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
          </>
        ) : (
          <Link
            href={publicHref ?? editorHref}
            target={publicHref ? '_blank' : undefined}
            rel={publicHref ? 'noopener noreferrer' : undefined}
            className="inline-flex items-center justify-end gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100"
          >
            View
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </div>
  )
}
