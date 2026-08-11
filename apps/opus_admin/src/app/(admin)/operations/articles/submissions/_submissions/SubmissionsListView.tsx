// OF-ADM-EDITORIAL-001 — owns search + filter + sort state for the
// Submissions queue. The "up next" row is the *first row whose status is
// submitted*, not necessarily the first row in the visible list — that way
// changing the sort or filter doesn't move the up-next pill onto an
// already-reviewed row.

'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import { CheckCircle2, Inbox, Search } from 'lucide-react'
import EmptyState from '../../../_shared/EmptyState'
import SubmissionsFilterBar, {
  type SubmissionSort,
  type SubmissionStatusFilter,
} from './SubmissionsFilterBar'
import SubmissionRow, { type SubmissionListEntry } from './SubmissionRow'

type Props = {
  submissions: SubmissionListEntry[]
  // ID of the "next up" submission, computed server-side from the oldest
  // pending submission so the highlight is stable across re-renders.
  upNextId: string | null
}

const STATUS_PREDICATE: Record<
  SubmissionStatusFilter,
  (s: SubmissionListEntry) => boolean
> = {
  all: () => true,
  pending: (s) => s.status === 'submitted',
  revisions: (s) => s.status === 'changes_requested',
  approved: (s) => s.status === 'approved' || s.status === 'published',
  rejected: (s) => s.status === 'rejected',
}

const SORT_FNS: Record<
  SubmissionSort,
  (a: SubmissionListEntry, b: SubmissionListEntry) => number
> = {
  oldest: (a, b) => keyDate(a) - keyDate(b),
  newest: (a, b) => keyDate(b) - keyDate(a),
  longest: (a, b) => b.readTime - a.readTime,
}

function keyDate(s: SubmissionListEntry): number {
  return new Date(s.submittedAt ?? s.updatedAt).getTime()
}

function matchesSearch(entry: SubmissionListEntry, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  return (
    entry.title.toLowerCase().includes(needle) ||
    entry.authorName.toLowerCase().includes(needle) ||
    entry.authorEmail.toLowerCase().includes(needle) ||
    entry.category.toLowerCase().includes(needle)
  )
}

export default function SubmissionsListView({ submissions, upNextId }: Props) {
  const [searchInput, setSearchInput] = useState('')
  const search = useDeferredValue(searchInput).trim()
  const [statusFilter, setStatusFilter] = useState<SubmissionStatusFilter>('all')
  const [authorFilter, setAuthorFilter] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [sort, setSort] = useState<SubmissionSort>('oldest')

  const authors = useMemo(() => {
    const set = new Set<string>()
    for (const s of submissions) if (s.authorName) set.add(s.authorName)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [submissions])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const s of submissions) if (s.category) set.add(s.category)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [submissions])

  const visible = useMemo(() => {
    const filtered = submissions.filter((s) => {
      if (!STATUS_PREDICATE[statusFilter](s)) return false
      if (authorFilter && s.authorName !== authorFilter) return false
      if (categoryFilter && s.category !== categoryFilter) return false
      return matchesSearch(s, search)
    })
    return filtered.sort(SORT_FNS[sort])
  }, [submissions, statusFilter, authorFilter, categoryFilter, sort, search])

  const filtersActive =
    !!search ||
    statusFilter !== 'all' ||
    !!authorFilter ||
    !!categoryFilter

  function clearFilters() {
    setSearchInput('')
    setStatusFilter('all')
    setAuthorFilter(null)
    setCategoryFilter(null)
  }

  // The "up next" highlight only renders if that row is currently visible —
  // otherwise it would lurk invisibly behind a filter and the page would
  // feel weirdly inconsistent.
  const visibleUpNextId =
    upNextId && visible.some((s) => s.id === upNextId) ? upNextId : null

  return (
    <div className="space-y-4">
      <SubmissionsFilterBar
        statusFilter={statusFilter}
        authors={authors}
        authorFilter={authorFilter}
        categories={categories}
        categoryFilter={categoryFilter}
        sort={sort}
        onStatusChange={setStatusFilter}
        onAuthorChange={setAuthorFilter}
        onCategoryChange={setCategoryFilter}
        onSortChange={setSort}
        searchSlot={
          <div className="relative w-full max-w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search submissions"
              aria-label="Search submissions"
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
            />
          </div>
        }
      />

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div data-opus-table-header
          role="row"
          className="grid grid-cols-[36px_minmax(0,1fr)_120px_120px] items-center gap-3 border-b border-gray-100 bg-gray-50/60 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500"
        >
          <span aria-hidden />
          <span>Submission</span>
          <span>Status</span>
          <span className="text-right">Action</span>
        </div>

        {visible.length === 0 ? (
          filtersActive ? (
            <EmptyState
              icon={<Inbox className="h-5 w-5" />}
              title="No submissions match these filters"
              body="Adjust the filters or clear them to see the full queue."
              action={
                <button data-opus-button="control"
                  type="button"
                  onClick={clearFilters}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Clear filters
                </button>
              }
            />
          ) : (
            <EmptyState
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="All caught up"
              body="New submissions will appear here when contributors hit submit."
            />
          )
        ) : (
          visible.map((entry) => (
            <SubmissionRow
              key={entry.id}
              entry={entry}
              isUpNext={entry.id === visibleUpNextId}
            />
          ))
        )}
      </div>
    </div>
  )
}
