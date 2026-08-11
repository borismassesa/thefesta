'use client'

// "Pending Approvals" tab — the approver's inbox. One list across every
// category, oldest first, because the thing an approver actually needs is
// "what is blocked on me right now", not "show me the trips".
//
// Rows open the full request form rather than approving inline: the
// decision flow there carries the mandatory note and fires the
// approved/refused notification emails. A shortcut button here would be a
// second decision path that silently skips both.

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BAND_TEXT, ageBand } from './ageing'
import { CATEGORY_GROUPS } from './data'
import { findCategory } from './catalog'
import type { ApprovalCategory, ApprovalGroupKey, ApprovalRequest } from './types'
import { CategoryChip, EmptyState, OwnerCell, formatAge, formatDate } from './ui'

const GRID =
  'grid min-w-[940px] grid-cols-[minmax(0,2fr)_150px_minmax(0,1.2fr)_110px_110px] items-center gap-3'

export default function PendingApprovalsView({
  requests,
  onOpen,
  now,
  categories,
}: {
  requests: ApprovalRequest[]
  onOpen: (id: string) => void
  categories: ApprovalCategory[]
  // Request-time timestamp from the server. Ages are "as of page load"
  // and don't tick, which is what the numbers here mean anyway.
  now: number
}) {
  const [group, setGroup] = useState<ApprovalGroupKey | 'all'>('all')
  const [search, setSearch] = useState('')

  // Oldest-waiting first: the whole point of an inbox is to surface what's
  // been stuck longest, not what arrived last.
  const sorted = useMemo(
    () =>
      [...requests].sort((a, b) => {
        const at = new Date(a.submittedAt ?? a.createdAt).getTime()
        const bt = new Date(b.submittedAt ?? b.createdAt).getTime()
        return at - bt
      }),
    [requests],
  )

  const groupCounts = useMemo(() => {
    const acc = new Map<ApprovalGroupKey, number>()
    for (const r of requests) {
      const g = findCategory(categories, r.category)?.group
      if (!g) continue
      acc.set(g, (acc.get(g) ?? 0) + 1)
    }
    return acc
  }, [requests, categories])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sorted.filter((r) => {
      if (group !== 'all' && findCategory(categories, r.category)?.group !== group) return false
      if (!q) return true
      return r.subject.toLowerCase().includes(q) || r.owner.toLowerCase().includes(q)
    })
  }, [sorted, group, search, categories])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div className="flex flex-wrap gap-1.5">
          <GroupPill
            label="All"
            count={requests.length}
            active={group === 'all'}
            onClick={() => setGroup('all')}
          />
          {CATEGORY_GROUPS.filter((g) => (groupCounts.get(g.key) ?? 0) > 0).map((g) => (
            <GroupPill
              key={g.key}
              label={g.label}
              count={groupCounts.get(g.key) ?? 0}
              active={group === g.key}
              onClick={() => setGroup(g.key)}
            />
          ))}
        </div>
        <div className="relative ml-auto w-60">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search subject or requester…"
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={
            requests.length === 0
              ? 'Nothing is waiting on you.'
              : 'No pending requests match this filter.'
          }
          hint={
            requests.length === 0
              ? 'Requests appear here the moment someone routes one to your email address.'
              : undefined
          }
        />
      ) : (
        <div className="no-scrollbar overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          <div
            className={`${GRID} border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500`}
          >
            <span>Request</span>
            <span>Type</span>
            <span>Requester</span>
            <span>Waiting</span>
            <span />
          </div>
          {visible.map((r) => {
            const band = ageBand(r.submittedAt ?? r.createdAt, now)
            return (
              <div
                key={r.id}
                className={`${GRID} border-b border-gray-100 px-5 py-3 last:border-b-0 hover:bg-gray-50`}
              >
                <button data-opus-button="control" type="button" onClick={() => onOpen(r.id)} className="min-w-0 text-left">
                  <p className="truncate text-sm font-semibold text-gray-900 hover:underline">
                    {r.subject}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    Submitted {formatDate(r.submittedAt)}
                  </p>
                </button>
                <CategoryChip category={findCategory(categories, r.category)} fallback={r.category} />
                <OwnerCell name={r.owner} initials={r.ownerInitials} />
                <span className={cn('text-xs font-semibold', BAND_TEXT[band])}>
                  {formatAge(r.submittedAt ?? r.createdAt, now)}
                </span>
                <button data-opus-button="control"
                  type="button"
                  onClick={() => onOpen(r.id)}
                  className="ml-auto inline-flex items-center rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white hover:bg-emerald-700"
                >
                  Review
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function GroupPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button data-opus-button="secondary" data-opus-button-size="small"
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
        active ? 'bg-[#F0DFF6] text-[#5B2D8E]' : 'text-gray-500 hover:bg-gray-50',
      )}
    >
      {label}
      <span className={cn('ml-1.5', active ? 'text-[#7E5896]' : 'text-gray-400')}>{count}</span>
    </button>
  )
}

