// OF-ADM-EDITORIAL-001 — single submission row. Action button replaces the
// pencil icon used elsewhere because the verb here is heavier — opening a
// review interface to decide a submission's fate, not editing metadata.
//
// Up-next treatment: a 3px lavender (#7E5896) left border, soft tint, and a
// small "UP NEXT" pill on the title, applied to the oldest pending row only.
// One filled-button at a time across the queue prevents the "ten primary
// CTAs on a page" trap — every other pending row uses the outline style.

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import StatusPill, { type StatusVariant } from '../../../_shared/StatusPill'
import { categoryLabel } from '../../../_shared/CategoryBadge'
import { formatRelativeTime } from '../../../_shared/relativeTime'
import AuthorAvatar from '../../../authors/_authors/AuthorAvatar'

export type SubmissionListEntry = {
  id: string
  title: string
  category: string
  authorName: string
  authorEmail: string
  authorAvatarUrl: string | null
  status: 'pending' | 'submitted' | 'revisions' | 'changes_requested' | 'approved' | 'rejected' | 'published'
  readTime: number
  submittedAt: string | null
  reviewedAt: string | null
  updatedAt: string
  sourcePostId: string | null
}

const STATUS_TO_PILL: Record<SubmissionListEntry['status'], StatusVariant> = {
  submitted: 'pending',
  pending: 'pending',
  changes_requested: 'revisions',
  revisions: 'revisions',
  approved: 'approved',
  published: 'published',
  rejected: 'rejected',
}

function metaLine(entry: SubmissionListEntry): string {
  const parts: string[] = [`by ${entry.authorName || entry.authorEmail}`]
  parts.push(categoryLabel(entry.category))
  parts.push(`${entry.readTime} min read`)
  if ((entry.status === 'submitted' || entry.status === 'pending') && entry.submittedAt) {
    parts.push(`submitted ${formatRelativeTime(entry.submittedAt)}`)
  } else if ((entry.status === 'changes_requested' || entry.status === 'revisions') && entry.reviewedAt) {
    parts.push(`revisions sent ${formatRelativeTime(entry.reviewedAt)}`)
  } else if (entry.status === 'approved') {
    parts.push('approved · published as draft')
  } else if (entry.status === 'published') {
    parts.push('published')
  } else if (entry.status === 'rejected' && entry.reviewedAt) {
    parts.push(`declined ${formatRelativeTime(entry.reviewedAt)}`)
  }
  return parts.join(' · ')
}

export default function SubmissionRow({
  entry,
  isUpNext,
}: {
  entry: SubmissionListEntry
  isUpNext: boolean
}) {
  const reviewHref = `/operations/articles/submissions/${entry.id}`
  const articleHref = entry.sourcePostId
    ? `/operations/articles/${entry.sourcePostId}`
    : reviewHref

  return (
    <div data-opus-table-header
      role="row"
      className={cn(
        'relative grid grid-cols-[36px_minmax(0,1fr)_120px_120px] items-center gap-3 border-b border-gray-100 bg-white px-4 py-3.5 transition-colors hover:bg-gray-50/60',
        isUpNext && 'bg-[#FCFAFE]'
      )}
    >
      {isUpNext && (
        <span
          aria-hidden
          className="absolute left-0 top-0 h-full w-[3px] bg-[#7E5896]"
        />
      )}

      <AuthorAvatar
        name={entry.authorName || entry.authorEmail}
        avatarUrl={entry.authorAvatarUrl}
        seed={entry.authorEmail || entry.authorName}
      />

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={reviewHref}
            className="truncate text-sm font-semibold text-gray-900 hover:text-[#7E5896]"
            title={entry.title || 'Untitled submission'}
          >
            {entry.title || 'Untitled submission'}
          </Link>
          {isUpNext && (
            <span className="shrink-0 rounded-full bg-[#7E5896] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-white">
              Up next
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-gray-500" title={metaLine(entry)}>
          {metaLine(entry)}
        </p>
      </div>

      <div role="cell" className="flex items-center">
        <StatusPill variant={STATUS_TO_PILL[entry.status]} />
      </div>

      <div role="cell" className="flex items-center justify-end">
        <ActionButton entry={entry} isUpNext={isUpNext} reviewHref={reviewHref} articleHref={articleHref} />
      </div>
    </div>
  )
}

function ActionButton({
  entry,
  isUpNext,
  reviewHref,
  articleHref,
}: {
  entry: SubmissionListEntry
  isUpNext: boolean
  reviewHref: string
  articleHref: string
}) {
  const baseCls =
    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors'

  if (entry.status === 'submitted' || entry.status === 'pending') {
    if (isUpNext) {
      return (
        <Link
          href={reviewHref}
          className={cn(baseCls, 'bg-[#C9A0DC] text-white shadow-sm hover:bg-[#b97fd0]')}
        >
          Review <ArrowRight className="h-3 w-3" />
        </Link>
      )
    }
    return (
      <Link
        href={reviewHref}
        className={cn(
          baseCls,
          'border border-[#E7D5EE] text-[#7E5896] hover:bg-[#F8F0FB]'
        )}
      >
        Review <ArrowRight className="h-3 w-3" />
      </Link>
    )
  }

  if (entry.status === 'changes_requested' || entry.status === 'revisions') {
    return (
      <Link
        href={reviewHref}
        className={cn(baseCls, 'border border-gray-200 text-gray-700 hover:bg-gray-50')}
      >
        View <ArrowRight className="h-3 w-3" />
      </Link>
    )
  }

  // approved | published | rejected — read-only-ish; route to the article
  // editor when we created one, otherwise back to the review page.
  return (
    <Link
      href={articleHref}
      className={cn(baseCls, 'text-gray-600 hover:bg-gray-100')}
    >
      Open <ArrowRight className="h-3 w-3" />
    </Link>
  )
}
