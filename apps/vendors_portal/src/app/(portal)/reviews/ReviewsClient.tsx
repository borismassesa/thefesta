'use client'

import { useMemo, useState } from 'react'
import {
  Camera,
  Check,
  Filter,
  Flag,
  MessageSquareReply,
  Pin,
  PinOff,
  Send,
  Star,
} from 'lucide-react'
import type { Review, ReviewInviteCandidate } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import { usePortalT, type Translator } from '@/components/providers/PortalUIStringsProvider'

type ReviewSort = 'recent' | 'highest' | 'lowest' | 'awaiting-reply'
type ReviewFilter = 'all' | 'with-photos' | 'awaiting-reply'

export type ReviewsSource =
  | { kind: 'live' }
  | { kind: 'no-application' }
  | { kind: 'pending-approval' }
  | { kind: 'suspended' }
  | { kind: 'no-env' }

function buildBannerBySource(t: Translator): Record<ReviewsSource['kind'], string | null> {
  return {
    live: null,
    'no-application': t('banner_no_application'),
    'pending-approval': t('banner_pending_approval'),
    suspended: t('banner_suspended'),
    'no-env': t('banner_no_env'),
  }
}

type ReviewsClientProps = {
  initialReviews: Review[]
  inviteCandidates: ReviewInviteCandidate[]
  invitesAvailable: boolean
  source: ReviewsSource
}

export default function ReviewsClient({
  initialReviews,
  inviteCandidates,
  invitesAvailable,
  source,
}: ReviewsClientProps) {
  const t = usePortalT('reviews')
  // Reply / pin / invite state are local-only in Phase 1; writes land in Phase 4.
  const [reviews, setReviews] = useState<Review[]>(initialReviews)
  const [pendingInvites, setPendingInvites] =
    useState<ReviewInviteCandidate[]>(inviteCandidates)
  const [sentInvites, setSentInvites] = useState<string[]>([])
  const [sort, setSort] = useState<ReviewSort>('recent')
  const [filter, setFilter] = useState<ReviewFilter>('all')
  const [replying, setReplying] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')

  const banner = buildBannerBySource(t)[source.kind]

  const stats = useMemo(() => {
    const total = reviews.length
    const sum = reviews.reduce((s, r) => s + r.rating, 0)
    const avg = total === 0 ? 0 : sum / total
    const distribution = [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: reviews.filter((r) => r.rating === star).length,
    }))
    const awaitingReply = reviews.filter((r) => !r.reply).length
    return { total, avg, distribution, awaitingReply }
  }, [reviews])

  const visible = useMemo(() => {
    let list = reviews.slice()
    if (filter === 'with-photos') list = list.filter((r) => (r.photos?.length ?? 0) > 0)
    if (filter === 'awaiting-reply') list = list.filter((r) => !r.reply)
    if (sort === 'recent') list.sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))
    if (sort === 'highest') list.sort((a, b) => b.rating - a.rating || b.reviewedAt.localeCompare(a.reviewedAt))
    if (sort === 'lowest') list.sort((a, b) => a.rating - b.rating || b.reviewedAt.localeCompare(a.reviewedAt))
    if (sort === 'awaiting-reply') {
      list.sort((a, b) => {
        const aw = a.reply ? 1 : 0
        const bw = b.reply ? 1 : 0
        return aw - bw || b.reviewedAt.localeCompare(a.reviewedAt)
      })
    }
    return list.sort((a, b) => Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)))
  }, [reviews, sort, filter])

  const togglePin = (id: string) => {
    setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, isPinned: !r.isPinned } : r)))
  }

  const startReply = (id: string) => {
    const existing = reviews.find((r) => r.id === id)?.reply?.body ?? ''
    setReplying(id)
    setReplyDraft(existing)
  }

  const cancelReply = () => {
    setReplying(null)
    setReplyDraft('')
  }

  const submitReply = (id: string) => {
    const body = replyDraft.trim()
    if (!body) return
    setReviews((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, reply: { body, repliedAt: new Date().toISOString() } }
          : r,
      ),
    )
    setReplying(null)
    setReplyDraft('')
  }

  const removeReply = (id: string) => {
    setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, reply: undefined } : r)))
  }

  const sendInvite = (bookingId: string) => {
    setSentInvites((prev) => (prev.includes(bookingId) ? prev : [...prev, bookingId]))
  }

  const dismissInvite = (bookingId: string) => {
    setPendingInvites((prev) => prev.filter((c) => c.bookingId !== bookingId))
    setSentInvites((prev) => prev.filter((id) => id !== bookingId))
  }

  return (
    <div className="px-6 lg:px-10 pt-4 lg:pt-5 pb-12">
      <div className="max-w-6xl space-y-6">
        {banner && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">
            {banner}
          </div>
        )}
        <div className="grid lg:grid-cols-[2fr_1fr] gap-6 items-start">
          <StatsCard stats={stats} />
          <InviteCard
            candidates={pendingInvites}
            sentInvites={sentInvites}
            invitesAvailable={invitesAvailable}
            onSend={sendInvite}
            onDismiss={dismissInvite}
          />
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mr-1">
              {t('sort_label')}
            </span>
            <SegmentedControl
              value={sort}
              onChange={setSort}
              options={[
                { id: 'recent', label: t('sort_recent') },
                { id: 'highest', label: t('sort_highest') },
                { id: 'lowest', label: t('sort_lowest') },
                { id: 'awaiting-reply', label: t('sort_awaiting_reply') },
              ]}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            <SegmentedControl
              value={filter}
              onChange={setFilter}
              options={[
                { id: 'all', label: t('filter_all', { count: reviews.length }) },
                { id: 'with-photos', label: t('filter_with_photos') },
                { id: 'awaiting-reply', label: t('filter_awaiting', { count: stats.awaitingReply }) },
              ]}
            />
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 px-6 py-16 text-center">
            <p className="text-sm text-gray-500">
              {reviews.length === 0
                ? t('empty_no_reviews')
                : t('empty_no_match_filters')}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {visible.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                replying={replying === review.id}
                replyDraft={replyDraft}
                onReplyDraftChange={setReplyDraft}
                onStartReply={() => startReply(review.id)}
                onCancelReply={cancelReply}
                onSubmitReply={() => submitReply(review.id)}
                onRemoveReply={() => removeReply(review.id)}
                onTogglePin={() => togglePin(review.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatsCard({
  stats,
}: {
  stats: {
    total: number
    avg: number
    distribution: { star: number; count: number }[]
    awaitingReply: number
  }
}) {
  const t = usePortalT('reviews')
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-6 lg:p-7">
      <div className="flex flex-wrap items-start gap-6">
        <div className="shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">
            {t('stats_average_rating')}
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-semibold text-gray-900 tabular-nums tracking-tight">
              {stats.avg.toFixed(1)}
            </span>
            <span className="text-sm text-gray-500 tabular-nums">{t('stats_out_of_5')}</span>
          </div>
          <Stars value={stats.avg} size="md" className="mt-2" />
          <p className="text-xs text-gray-500 mt-2">
            {t('stats_from_prefix')}{' '}
            <span className="font-semibold text-gray-900 tabular-nums">{stats.total}</span>{' '}
            {stats.total === 1 ? t('stats_review_singular') : t('stats_review_plural')}
          </p>
        </div>

        <div className="flex-1 min-w-[260px]">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3">
            {t('stats_rating_distribution')}
          </p>
          <ul className="space-y-1.5">
            {stats.distribution.map(({ star, count }) => {
              const pct = stats.total === 0 ? 0 : Math.round((count / stats.total) * 100)
              return (
                <li key={star} className="flex items-center gap-3">
                  <span className="w-7 text-xs font-semibold text-gray-700 tabular-nums shrink-0">
                    {star}★
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-[width] duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-xs text-gray-500 tabular-nums shrink-0">
                    {count}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      <p className="mt-5 text-xs text-gray-500 leading-relaxed">
        {t('stats_footer_note')}
      </p>
    </div>
  )
}

function InviteCard({
  candidates,
  sentInvites,
  invitesAvailable,
  onSend,
  onDismiss,
}: {
  candidates: ReviewInviteCandidate[]
  sentInvites: string[]
  invitesAvailable: boolean
  onSend: (bookingId: string) => void
  onDismiss: (bookingId: string) => void
}) {
  const t = usePortalT('reviews')
  if (!invitesAvailable) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-6 text-center">
        <p className="text-sm font-semibold text-gray-900">{t('invite_coming_soon_title')}</p>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
          {t('invite_coming_soon_hint')}
        </p>
      </div>
    )
  }
  if (candidates.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-6 text-center">
        <p className="text-sm font-semibold text-gray-900">{t('invite_all_caught_up_title')}</p>
        <p className="text-xs text-gray-500 mt-1">
          {t('invite_all_caught_up_hint')}
        </p>
      </div>
    )
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-6">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{t('invite_request_title')}</h3>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
            {t('invite_request_hint')}
          </p>
        </div>
      </div>
      <ul className="space-y-2">
        {candidates.map((c) => {
          const sent = sentInvites.includes(c.bookingId)
          return (
            <li
              key={c.bookingId}
              className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.avatarUrl}
                alt=""
                className="w-9 h-9 rounded-full object-cover shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-900 truncate">{c.couple}</p>
                <p className="text-[11px] text-gray-500 truncate">
                  {c.packageName} · {formatDate(c.eventDate)}
                </p>
              </div>
              {sent ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Check className="w-3 h-3" />
                  {t('invite_invited_pill')}
                </span>
              ) : (
                <button data-opus-button="primary" data-opus-button-size="small"
                  type="button"
                  onClick={() => onSend(c.bookingId)}
                  className="inline-flex items-center gap-1 bg-gray-900 hover:bg-gray-800 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-md transition-colors"
                >
                  <Send className="w-3 h-3" />
                  {t('invite_send_button')}
                </button>
              )}
              <button data-opus-button="control"
                type="button"
                onClick={() => onDismiss(c.bookingId)}
                className="text-gray-400 hover:text-gray-700 text-[10px] font-medium"
                aria-label={t('invite_dismiss_aria', { couple: c.couple })}
                title={t('invite_dismiss_title')}
              >
                ✕
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { id: T; label: string }[]
}) {
  return (
    <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
      {options.map((o) => (
        <button data-opus-button="control"
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={cn(
            'text-xs font-semibold px-2.5 py-1.5 rounded-md transition-colors',
            value === o.id
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function ReviewCard({
  review,
  replying,
  replyDraft,
  onReplyDraftChange,
  onStartReply,
  onCancelReply,
  onSubmitReply,
  onRemoveReply,
  onTogglePin,
}: {
  review: Review
  replying: boolean
  replyDraft: string
  onReplyDraftChange: (v: string) => void
  onStartReply: () => void
  onCancelReply: () => void
  onSubmitReply: () => void
  onRemoveReply: () => void
  onTogglePin: () => void
}) {
  const t = usePortalT('reviews')
  return (
    <article
      className={cn(
        'bg-white rounded-2xl border shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-6',
        review.isPinned ? 'border-[#7E5896]/40 ring-1 ring-[#7E5896]/15' : 'border-gray-100',
      )}
    >
      <div className="flex items-start gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={review.avatarUrl}
          alt=""
          className="w-12 h-12 rounded-full object-cover shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-gray-900 truncate">{review.couple}</p>
            {review.isPinned ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#F0DFF6] text-[#7E5896]">
                <Pin className="w-3 h-3" />
                {t('card_pinned_pill')}
              </span>
            ) : null}
          </div>
          <Stars value={review.rating} size="sm" className="mt-1" />
          <p className="text-xs text-gray-500 mt-1.5">
            {review.packageName} · {t('card_wedding_label')} {formatDate(review.eventDate)} · {t('card_reviewed_prefix')}{' '}
            {formatRelative(review.reviewedAt, t)}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <IconAction
            label={review.isPinned ? t('action_unpin') : t('action_pin')}
            onClick={onTogglePin}
            icon={
              review.isPinned ? (
                <PinOff className="w-3.5 h-3.5" />
              ) : (
                <Pin className="w-3.5 h-3.5" />
              )
            }
          />
          <IconAction
            label={t('action_report')}
            icon={<Flag className="w-3.5 h-3.5" />}
            tone="muted"
          />
        </div>
      </div>

      <p className="mt-4 text-sm text-gray-800 leading-relaxed whitespace-pre-line">
        {review.body}
      </p>

      {review.photos && review.photos.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {review.photos.map((url, idx) => (
            <a
              key={idx}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="relative block w-32 aspect-[4/3] rounded-lg overflow-hidden bg-gray-100 group"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="w-full h-full object-cover" />
              <span className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 text-gray-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="w-3 h-3" />
              </span>
            </a>
          ))}
        </div>
      ) : null}

      {review.reply && !replying ? (
        <div className="mt-5 rounded-lg bg-gray-50 border border-gray-100 p-4">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-gray-700">
              <MessageSquareReply className="w-3 h-3" />
              {t('reply_your_reply_prefix')} · {formatRelative(review.reply.repliedAt, t)}
            </span>
            <div className="flex items-center gap-2">
              <button data-opus-button="control"
                type="button"
                onClick={onStartReply}
                className="text-[11px] font-semibold text-gray-600 hover:text-gray-900"
              >
                {t('reply_edit')}
              </button>
              <button data-opus-button="control"
                type="button"
                onClick={onRemoveReply}
                className="text-[11px] font-semibold text-rose-600 hover:text-rose-700"
              >
                {t('reply_remove')}
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">
            {review.reply.body}
          </p>
        </div>
      ) : null}

      {replying ? (
        <div className="mt-5 rounded-lg border border-gray-200 bg-white p-3">
          <textarea
            autoFocus
            value={replyDraft}
            onChange={(e) => onReplyDraftChange(e.target.value)}
            placeholder={t('reply_placeholder')}
            rows={4}
            className="w-full text-sm bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none resize-none"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[11px] text-gray-500">
              {t('reply_public_hint')}
            </p>
            <div className="flex items-center gap-2">
              <button data-opus-button="control"
                type="button"
                onClick={onCancelReply}
                className="text-xs font-semibold text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-md"
              >
                {t('reply_cancel')}
              </button>
              <button data-opus-button="primary" data-opus-button-size="small"
                type="button"
                onClick={onSubmitReply}
                disabled={!replyDraft.trim()}
                className="inline-flex items-center gap-1 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-xs font-semibold px-3 py-1.5 rounded-md transition-colors"
              >
                {t('reply_post')}
              </button>
            </div>
          </div>
        </div>
      ) : !review.reply ? (
        <button data-opus-button="control"
          type="button"
          onClick={onStartReply}
          className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 hover:text-gray-900 px-3 py-1.5 rounded-md bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          <MessageSquareReply className="w-3.5 h-3.5" />
          {t('reply_publicly_button')}
        </button>
      ) : null}
    </article>
  )
}

function Stars({
  value,
  size = 'md',
  className,
}: {
  value: number
  size?: 'sm' | 'md'
  className?: string
}) {
  const dim = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'
  return (
    <div className={cn('inline-flex items-center gap-0.5', className)} aria-label={`${value.toFixed(1)} out of 5`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const filled = value >= i + 1
        const partial = !filled && value > i
        return (
          <span key={i} className="relative">
            <Star className={cn(dim, 'text-gray-200')} />
            {(filled || partial) && (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: filled ? '100%' : `${(value - i) * 100}%` }}
                aria-hidden
              >
                <Star className={cn(dim, 'text-amber-400 fill-amber-400')} />
              </span>
            )}
          </span>
        )
      })}
    </div>
  )
}

function IconAction({
  label,
  icon,
  onClick,
  tone = 'default',
}: {
  label: string
  icon: React.ReactNode
  onClick?: () => void
  tone?: 'default' | 'muted'
}) {
  return (
    <button data-opus-button="control"
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'p-1.5 rounded-md transition-colors',
        tone === 'muted'
          ? 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'
          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
      )}
    >
      {icon}
    </button>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatRelative(iso: string, t: Translator): string {
  const d = new Date(iso)
  const now = Date.now()
  const diffDays = Math.floor((now - d.getTime()) / 86_400_000)
  if (diffDays < 1) return t('relative_today')
  if (diffDays < 2) return t('relative_yesterday')
  if (diffDays < 7) return t('relative_days_ago', { n: diffDays })
  if (diffDays < 30) return t('relative_weeks_ago', { n: Math.floor(diffDays / 7) })
  if (diffDays < 365) return t('relative_months_ago', { n: Math.floor(diffDays / 30) })
  return t('relative_years_ago', { n: Math.floor(diffDays / 365) })
}
