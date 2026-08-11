'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  ArrowUpDown,
  ChevronRight,
  Clock,
  FileSignature,
  MailQuestion,
  MessageSquare,
  Search,
  Sparkles,
  Timer,
  UserPlus,
} from 'lucide-react'
import type { Booking, BookingStage } from '@/lib/mock-data'
import {
  PIPELINE_STAGES,
  STAGE_META,
  buildStageLabel,
  deriveAttention,
  durationUntil,
  formatTZS,
  relativeDays,
  shortEventDate,
  timeAgo,
  type AttentionItem,
  type AttentionKind,
} from '@/lib/bookings'
import { cn } from '@/lib/utils'
import { usePortalT, type Translator } from '@/components/providers/PortalUIStringsProvider'

type StageFilter = BookingStage | 'all'
type SortKey = 'soonest' | 'value' | 'recent_activity'

export default function BookingsPipelineClient({
  initialBookings,
}: {
  initialBookings: Booking[]
}) {
  const t = usePortalT('bookings')
  const [filter, setFilter] = useState<StageFilter>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('soonest')

  const counts = useMemo(() => {
    const out: Record<StageFilter, number> = {
      all: 0,
      quoted: 0,
      reserved: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
    }
    for (const b of initialBookings) {
      out.all += 1
      out[b.stage] += 1
    }
    return out
  }, [initialBookings])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = initialBookings.filter((b) => {
      if (filter !== 'all' && b.stage !== filter) return false
      if (!q) return true
      return (
        b.couple.toLowerCase().includes(q) ||
        b.location.toLowerCase().includes(q) ||
        b.packageName.toLowerCase().includes(q)
      )
    })
    list = [...list].sort((a, b) => {
      if (sort === 'soonest') return a.date.localeCompare(b.date)
      if (sort === 'value') return b.totalValue - a.totalValue
      const ax = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
      const bx = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
      return bx - ax
    })
    return list
  }, [filter, search, sort, initialBookings])

  const attention = useMemo(() => deriveAttention(initialBookings, new Date(), t), [initialBookings, t])

  return (
    <div className="px-8 pt-5 pb-10">
      <div className="space-y-5">
        {attention.length > 0 ? <NeedsAttention items={attention} /> : null}

        <FilterBar
          filter={filter}
          counts={counts}
          onFilter={setFilter}
          search={search}
          onSearch={setSearch}
          sort={sort}
          onSort={setSort}
        />

        {visible.length === 0 ? (
          <EmptyState filter={filter} search={search} />
        ) : (
          <BookingsTable rows={visible} />
        )}
      </div>
    </div>
  )
}

/* ---------- Needs attention strip ---------- */

const ATTENTION_ICON: Record<AttentionKind, typeof Timer> = {
  slot_expiring: Timer,
  deposit_overdue: Clock,
  contract_unsigned: FileSignature,
  event_soon: Sparkles,
  review_request: MailQuestion,
}

function buildAttentionTone(t: Translator): Record<
  AttentionKind,
  { iconClass: string; chipClass: string; chipLabel: string }
> {
  return {
    slot_expiring: {
      iconClass: 'bg-rose-50 text-rose-600',
      chipClass: 'bg-rose-50 text-rose-700 border-rose-200',
      chipLabel: t('attention_urgent'),
    },
    deposit_overdue: {
      iconClass: 'bg-amber-50 text-amber-700',
      chipClass: 'bg-amber-50 text-amber-700 border-amber-200',
      chipLabel: t('attention_follow_up'),
    },
    contract_unsigned: {
      iconClass: 'bg-amber-50 text-amber-700',
      chipClass: 'bg-amber-50 text-amber-700 border-amber-200',
      chipLabel: t('attention_this_week'),
    },
    event_soon: {
      iconClass: 'bg-emerald-50 text-emerald-700',
      chipClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      chipLabel: t('attention_prep'),
    },
    review_request: {
      iconClass: 'bg-[#F0DFF6] text-[#7E5896]',
      chipClass: 'bg-[#F0DFF6] text-[#7E5896] border-[#E0C7EE]',
      chipLabel: t('attention_just_done'),
    },
  }
}

function NeedsAttention({ items }: { items: AttentionItem[] }) {
  const t = usePortalT('bookings')
  const attentionTone = buildAttentionTone(t)
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-5 lg:p-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">
          {t('needs_attention_header')}
        </p>
        <span className="text-xs text-gray-400 tabular-nums">
          {items.length} {items.length === 1 ? t('attention_item_singular') : t('attention_item_plural')}
        </span>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((it) => {
          const Icon = ATTENTION_ICON[it.kind]
          const tone = attentionTone[it.kind]
          return (
            <Link
              key={`${it.kind}-${it.bookingId}`}
              href={`/bookings/${it.bookingId}`}
              className="group flex flex-col gap-2 p-3.5 rounded-xl border border-gray-100 hover:border-gray-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                    tone.iconClass,
                  )}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <span
                  className={cn(
                    'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border',
                    tone.chipClass,
                  )}
                >
                  {tone.chipLabel}
                </span>
              </div>
              <p className="text-sm font-semibold text-gray-900 leading-snug">
                {it.title}
              </p>
              <p className="text-xs text-gray-500 leading-snug">{it.detail}</p>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 mt-auto pt-1 group-hover:text-gray-900">
                {it.ctaLabel}
                <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

/* ---------- Filter bar ---------- */

function FilterBar({
  filter,
  counts,
  onFilter,
  search,
  onSearch,
  sort,
  onSort,
}: {
  filter: StageFilter
  counts: Record<StageFilter, number>
  onFilter: (f: StageFilter) => void
  search: string
  onSearch: (v: string) => void
  sort: SortKey
  onSort: (s: SortKey) => void
}) {
  const t = usePortalT('bookings')
  const stageLabel = buildStageLabel(t)
  return (
    <div className="flex flex-wrap items-center gap-2 bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-2.5">
      <div className="flex items-center gap-1 flex-wrap">
        <FilterPill
          label={t('filter_all')}
          count={counts.all}
          active={filter === 'all'}
          onClick={() => onFilter('all')}
        />
        {PIPELINE_STAGES.map((s) => (
          <FilterPill
            key={s}
            label={stageLabel[s]}
            count={counts[s]}
            active={filter === s}
            dotClass={STAGE_META[s].dotClass}
            onClick={() => onFilter(s)}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={t('search_placeholder')}
            aria-label={t('search_aria_label')}
            className="pl-9 pr-3 py-1.5 bg-white border border-gray-200 rounded-md text-sm w-56 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
          />
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 px-2 py-1.5 border border-gray-200 rounded-md bg-white">
          <ArrowUpDown className="w-3.5 h-3.5 text-gray-500" />
          <select
            value={sort}
            onChange={(e) => onSort(e.target.value as SortKey)}
            aria-label={t('sort_aria_label')}
            className="bg-transparent outline-none cursor-pointer"
          >
            <option value="soonest">{t('sort_soonest')}</option>
            <option value="value">{t('sort_highest_value')}</option>
            <option value="recent_activity">{t('sort_recent_activity')}</option>
          </select>
        </label>
      </div>
    </div>
  )
}

function FilterPill({
  label,
  count,
  active,
  dotClass,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  dotClass?: string
  onClick: () => void
}) {
  return (
    <button data-opus-button="control"
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors',
        active
          ? 'bg-gray-900 text-white'
          : 'text-gray-700 hover:bg-gray-100',
      )}
      aria-pressed={active}
    >
      {dotClass && <span className={cn('w-2 h-2 rounded-full shrink-0', dotClass)} aria-hidden />}
      {label}
      <span
        className={cn(
          'tabular-nums text-[10px] font-bold px-1.5 py-0.5 rounded',
          active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600',
        )}
      >
        {count}
      </span>
    </button>
  )
}

/* ---------- Table ---------- */

function BookingsTable({ rows }: { rows: Booking[] }) {
  const t = usePortalT('bookings')
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="hidden md:grid md:grid-cols-[2fr_1.4fr_1fr_1.1fr_1fr_1.5fr_auto] gap-4 px-5 py-2.5 border-b border-gray-100 bg-gray-50/60 text-[10px] font-bold uppercase tracking-wider text-gray-500">
        <span>{t('table_couple')}</span>
        <span>{t('table_event_date')}</span>
        <span>{t('table_stage')}</span>
        <span className="text-right">{t('table_value')}</span>
        <span>{t('table_deposit')}</span>
        <span>{t('table_last_activity')}</span>
        <span className="sr-only">{t('table_open')}</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {rows.map((b) => (
          <li key={b.id}>
            <BookingRow b={b} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function BookingRow({ b }: { b: Booking }) {
  const t = usePortalT('bookings')
  const stageLabel = buildStageLabel(t)
  const stage = STAGE_META[b.stage]
  const initials = b.couple.split(/\s*&\s*|\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || 'C'

  let depositText: string
  let depositTone: 'paid' | 'pending' | 'na'
  if (b.stage === 'cancelled') {
    depositText = b.depositPaid ? t('deposit_forfeited') : '—'
    depositTone = 'na'
  } else if (b.stage === 'quoted') {
    depositText = '—'
    depositTone = 'na'
  } else if (b.depositPaid) {
    depositText = t('deposit_paid')
    depositTone = 'paid'
  } else {
    depositText = t('deposit_pending')
    depositTone = 'pending'
  }

  return (
    <Link
      href={`/bookings/${b.id}`}
      className="grid grid-cols-1 md:grid-cols-[2fr_1.4fr_1fr_1.1fr_1fr_1.5fr_auto] gap-4 px-5 py-3.5 items-center hover:bg-gray-50 transition-colors"
    >
      {/* Couple */}
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="w-9 h-9 rounded-full bg-cover bg-center bg-gray-200 shrink-0 ring-1 ring-white shadow-sm"
          style={{
            backgroundImage: b.avatarUrl ? `url('${b.avatarUrl}')` : undefined,
          }}
          aria-hidden
        >
          {!b.avatarUrl ? (
            <span className="w-full h-full flex items-center justify-center text-[11px] font-bold text-gray-600">
              {initials}
            </span>
          ) : null}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{b.couple}</p>
          <p className="text-xs text-gray-500 truncate">
            {b.packageName} · {b.location}
          </p>
        </div>
      </div>

      {/* Event date */}
      <div className="text-sm">
        <p className="text-gray-900 tabular-nums">{shortEventDate(b.date)}</p>
        <p className="text-xs text-gray-500">{relativeDays(b.date)}</p>
      </div>

      {/* Stage */}
      <div>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border',
            stage.pillClass,
          )}
        >
          {stageLabel[b.stage]}
        </span>
        {b.stage === 'reserved' && b.slotHeldUntil ? (
          <p className="text-[10px] text-rose-600 mt-1 inline-flex items-center gap-1 font-semibold">
            <Timer className="w-3 h-3" />
            {durationUntil(b.slotHeldUntil)} {t('slot_left_suffix')}
          </p>
        ) : null}
      </div>

      {/* Value */}
      <div className="text-sm text-right tabular-nums">
        <p className="text-gray-900 font-semibold">{formatTZS(b.totalValue, { compact: true })}</p>
      </div>

      {/* Deposit */}
      <div>
        <span
          className={cn(
            'inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md',
            depositTone === 'paid' && 'bg-emerald-50 text-emerald-700',
            depositTone === 'pending' && 'bg-amber-50 text-amber-700',
            depositTone === 'na' && 'bg-gray-50 text-gray-500',
          )}
        >
          {depositText}
        </span>
      </div>

      {/* Last activity */}
      <div className="min-w-0 text-xs">
        {b.lastMessageAt ? (
          <>
            <p className="text-gray-700 truncate inline-flex items-center gap-1">
              <MessageSquare className="w-3 h-3 text-gray-400 shrink-0" />
              <span className="truncate">{b.lastMessagePreview}</span>
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(b.lastMessageAt)}</p>
          </>
        ) : (
          <p className="text-gray-400 italic">{t('no_messages_yet')}</p>
        )}
      </div>

      {/* Open arrow */}
      <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 hidden md:inline-block" aria-hidden />
    </Link>
  )
}

/* ---------- Empty state ---------- */

function EmptyState({ filter, search }: { filter: StageFilter; search: string }) {
  const t = usePortalT('bookings')
  const hasFilter = filter !== 'all' || search.length > 0
  return (
    <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
      <span className="mx-auto w-12 h-12 rounded-2xl bg-[#F0DFF6] text-[#7E5896] flex items-center justify-center">
        {hasFilter ? <Search className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
      </span>
      <h3 className="text-base font-semibold text-gray-900 mt-4">
        {hasFilter ? t('empty_filter_title') : t('empty_no_bookings_title')}
      </h3>
      <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
        {hasFilter ? t('empty_filter_desc') : t('empty_no_bookings_desc')}
      </p>
    </div>
  )
}
