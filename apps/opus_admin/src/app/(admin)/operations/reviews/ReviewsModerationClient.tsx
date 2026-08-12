'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  AlertCircle,
  Check,
  Clock,
  Star,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSetPageHeading } from '@/components/PageHeading'
import { publishReview, rejectReview } from './actions'

export type ReviewRow = {
  id: string
  vendorId: string
  vendorName: string
  vendorSlug: string
  vendorCode: string | null
  authorName: string
  authorEmail: string
  rating: number
  body: string
  weddingDate: string | null
  status: 'pending' | 'published' | 'rejected'
  rejectionReason: string | null
  submittedIp: string | null
  submittedUserAgent: string | null
  reviewedAt: string | null
  createdAt: string
}

type Filter = 'pending' | 'published' | 'rejected' | 'all'
type Counts = Record<Filter, number>

const FILTER_TABS: Array<{ id: Filter; label: string; description: string }> = [
  { id: 'pending', label: 'Awaiting moderation', description: 'New submissions waiting for review.' },
  { id: 'published', label: 'Published', description: 'Visible publicly on vendor profiles.' },
  { id: 'rejected', label: 'Rejected', description: 'Declined and kept for the audit trail.' },
  { id: 'all', label: 'All', description: 'Every review submission ever received.' },
]

export default function ReviewsModerationClient({
  rows,
  filter,
  counts,
}: {
  rows: ReviewRow[]
  filter: Filter
  counts: Counts
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const activeTab = FILTER_TABS.find((t) => t.id === filter)
  useSetPageHeading({
    title: 'Reviews & moderation',
    subtitle: activeTab?.description,
  })

  const writeFilter = (next: Filter) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    if (next === 'pending') params.delete('status')
    else params.set('status', next)
    const qs = params.toString()
    router.push(qs ? `/operations/reviews?${qs}` : '/operations/reviews')
  }

  return (
    <div className="px-8 pt-4 pb-12">
      <div className="max-w-[1200px] mx-auto">
        {/* Tabs */}
        <div className="bg-gray-50 rounded-lg p-1 mb-4 overflow-x-auto">
          <div className="flex items-center gap-0.5 min-w-max">
            {FILTER_TABS.map((tab) => {
              const isActive = tab.id === filter
              return (
                <button data-opus-button="control"
                  key={tab.id}
                  type="button"
                  onClick={() => writeFilter(tab.id)}
                  aria-pressed={isActive}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors',
                    isActive
                      ? 'bg-gray-900 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900',
                  )}
                >
                  {tab.label}
                  <span
                    className={cn(
                      'inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[11px] font-semibold tabular-nums',
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-gray-200/70 text-gray-600',
                    )}
                  >
                    {counts[tab.id]}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Empty state */}
        {rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
              <Star className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-gray-700 mt-4">
              {filter === 'pending'
                ? 'No reviews waiting for moderation.'
                : filter === 'published'
                  ? 'No reviews are published yet.'
                  : filter === 'rejected'
                    ? 'No reviews have been rejected.'
                    : 'No reviews have been submitted yet.'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {filter === 'pending'
                ? 'New submissions land here for approval.'
                : 'When reviews land in this state they show up here.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ReviewCard({ review }: { review: ReviewRow }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState(review.rejectionReason ?? '')
  const [error, setError] = useState<string | null>(null)

  const onPublish = () => {
    setError(null)
    startTransition(async () => {
      const res = await publishReview(review.id)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  const onReject = () => {
    if (!rejectReason.trim()) {
      setError('Rejection reason is required.')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await rejectReview(review.id, rejectReason)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setShowReject(false)
      router.refresh()
    })
  }

  const isPending = review.status === 'pending'
  const isPublished = review.status === 'published'
  const isRejected = review.status === 'rejected'

  return (
    <li className="bg-white rounded-2xl border border-gray-200 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-5">
      <header className="flex items-start gap-3 flex-wrap mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/operations/vendors/${review.vendorId}`}
              className="text-base font-semibold text-gray-900 hover:underline"
            >
              {review.vendorName}
            </Link>
            {review.vendorCode && (
              <span className="font-mono text-[11px] text-gray-500">
                {review.vendorCode}
              </span>
            )}
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border',
                isPublished && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                isPending && 'bg-amber-50 text-amber-800 border-amber-200',
                isRejected && 'bg-rose-50 text-rose-700 border-rose-200',
              )}
            >
              {isPublished && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
              {isPending && <Clock className="w-2.5 h-2.5" />}
              {isRejected && <XCircle className="w-2.5 h-2.5" />}
              {review.status}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            <span className="font-semibold text-gray-700">{review.authorName}</span>{' '}
            · {review.authorEmail}
            {review.weddingDate && ` · wedding ${formatDate(review.weddingDate)}`}
            {' · submitted '}
            {formatRelative(review.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-1 text-amber-500">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star
              key={i}
              className="w-3.5 h-3.5"
              fill={i <= Math.round(review.rating) ? 'currentColor' : 'none'}
            />
          ))}
          <span className="ml-1.5 text-sm font-semibold text-gray-900 tabular-nums">
            {review.rating.toFixed(1)}
          </span>
        </div>
      </header>

      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line bg-gray-50 rounded-lg px-4 py-3 mb-3">
        {review.body}
      </p>

      {isRejected && review.rejectionReason && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-100 px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
          <p className="text-xs text-rose-800 leading-relaxed">
            <span className="font-semibold">Rejection reason:</span>{' '}
            {review.rejectionReason}
          </p>
        </div>
      )}

      {(review.submittedIp || review.submittedUserAgent) && (
        <details className="text-[11px] text-gray-500 mb-3">
          <summary className="cursor-pointer font-semibold">Audit metadata</summary>
          <ul className="mt-2 space-y-0.5 font-mono">
            {review.submittedIp && <li>IP: {review.submittedIp}</li>}
            {review.submittedUserAgent && (
              <li className="break-all">UA: {review.submittedUserAgent}</li>
            )}
            {review.reviewedAt && <li>Reviewed: {formatRelative(review.reviewedAt)}</li>}
          </ul>
        </details>
      )}

      {error && (
        <div className="mb-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-800">
          {error}
        </div>
      )}

      {isPending && (
        <div className="flex items-center gap-2 flex-wrap">
          <button data-opus-button="control"
            type="button"
            onClick={onPublish}
            disabled={pending}
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-3.5 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-colors"
          >
            <ThumbsUp className="w-3.5 h-3.5" />
            Publish
          </button>
          <button data-opus-button="danger" data-opus-button-size="small"
            type="button"
            onClick={() => setShowReject((s) => !s)}
            className={cn(
              'inline-flex items-center gap-1.5 text-sm font-semibold px-3.5 py-1.5 rounded-full transition-colors',
              showReject
                ? 'bg-rose-100 text-rose-800'
                : 'bg-white border border-rose-200 text-rose-700 hover:bg-rose-50',
            )}
          >
            <ThumbsDown className="w-3.5 h-3.5" />
            {showReject ? 'Cancel' : 'Reject…'}
          </button>
        </div>
      )}

      {isPending && showReject && (
        <div className="mt-3 rounded-xl bg-rose-50/40 border border-rose-100 p-3">
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Rejection note (kept on the audit trail; not shown publicly)
          </label>
          <textarea
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. Submitted by someone unrelated to the vendor; cannot verify."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
          />
          <button data-opus-button="danger" data-opus-button-size="small"
            type="button"
            onClick={onReject}
            disabled={pending || !rejectReason.trim()}
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold px-3.5 py-1.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50 transition-colors"
          >
            <XCircle className="w-3.5 h-3.5" />
            Send rejection
          </button>
        </div>
      )}
    </li>
  )
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return formatDate(iso)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
