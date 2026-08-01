'use client'

// "My Requests" tab — the submitter's tracking page. Answers the one
// question employees ask constantly: has my request been approved, and who
// is it sitting with?
//
// The status and period filters are controlled from the URL, not local
// state, so a filtered view survives a refresh and can be linked to. The
// Overview stat tiles deep-link straight into the slice they count.

import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { categoryLabel, findCategory } from './catalog'
import type { ApprovalCategory, ApprovalRequest } from './types'
import {
  CategoryChip,
  EmptyState,
  FilterPills,
  StatusPill,
  currentApproverLabel,
  formatDate,
} from './ui'

const FILTERS = ['All', 'To Submit', 'Submitted', 'Approved', 'Refused'] as const
type Filter = (typeof FILTERS)[number]

function parseFilter(value: string | null): Filter {
  return FILTERS.includes(value as Filter) ? (value as Filter) : 'All'
}

const GRID =
  'grid min-w-[900px] grid-cols-[minmax(0,2fr)_150px_120px_120px_minmax(0,1.4fr)] items-center gap-3'

export default function MyRequestsView({
  requests,
  status,
  period,
  onFilter,
  onOpen,
  now,
  categories,
}: {
  requests: ApprovalRequest[]
  status: string | null
  // Only `this-month` is understood. Anything else is ignored rather than
  // erroring — a mangled URL should degrade to the unfiltered list.
  period: string | null
  onFilter: (next: { status?: string; period?: string }) => void
  onOpen: (id: string) => void
  now: number
  categories: ApprovalCategory[]
}) {
  const filter = parseFilter(status)
  const monthOnly = period === 'this-month'
  const [search, setSearch] = useState('')

  const scoped = useMemo(() => {
    if (!monthOnly) return requests
    const ref = new Date(now)
    const month = ref.getMonth()
    const year = ref.getFullYear()
    return requests.filter((r) => {
      const d = new Date(r.updatedAt)
      return d.getMonth() === month && d.getFullYear() === year
    })
  }, [requests, monthOnly, now])

  const counts = useMemo(() => {
    const acc: Partial<Record<Filter, number>> = { All: scoped.length }
    for (const r of scoped) acc[r.status] = (acc[r.status] ?? 0) + 1
    return acc
  }, [scoped])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return scoped.filter((r) => {
      if (filter !== 'All' && r.status !== filter) return false
      if (!q) return true
      return (
        r.subject.toLowerCase().includes(q) ||
        categoryLabel(categories, r.category).toLowerCase().includes(q)
      )
    })
  }, [scoped, filter, search, categories])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <FilterPills
          options={FILTERS}
          value={filter}
          onChange={(next) => onFilter({ status: next, period: period ?? undefined })}
          counts={counts}
        />
        {monthOnly && (
          <button
            type="button"
            onClick={() => onFilter({ status: filter })}
            className="inline-flex items-center gap-1 rounded-full bg-[#F0DFF6] px-2.5 py-1 text-xs font-semibold text-[#5B2D8E] hover:bg-[#E8CEF4]"
          >
            This month
            <X className="h-3 w-3" />
            <span className="sr-only">Clear the this-month filter</span>
          </button>
        )}
        <div className="relative ml-auto w-60">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search subject or type…"
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={
            requests.length === 0
              ? 'You have no requests yet'
              : `Nothing matches this filter`
          }
          hint={
            requests.length === 0
              ? 'Create a request when you need approval for travel, payment, procurement or another service.'
              : 'Try a different status, or clear the search.'
          }
        />
      ) : (
        <div className="no-scrollbar overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          <div
            className={`${GRID} border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500`}
          >
            <span>Request</span>
            <span>Type</span>
            <span>Submitted</span>
            <span>Status</span>
            <span>Current approver</span>
          </div>
          {visible.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onOpen(r.id)}
              className={`${GRID} w-full border-b border-gray-100 px-5 py-3 text-left last:border-b-0 hover:bg-gray-50`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{r.subject}</p>
                <p className="truncate text-xs text-gray-500">
                  Raised {formatDate(r.createdAt)}
                </p>
              </div>
              <CategoryChip category={findCategory(categories, r.category)} fallback={r.category} />
              <span className="text-xs text-gray-600">{formatDate(r.submittedAt)}</span>
              <StatusPill status={r.status} />
              <span className="truncate text-xs text-gray-600">{currentApproverLabel(r)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
