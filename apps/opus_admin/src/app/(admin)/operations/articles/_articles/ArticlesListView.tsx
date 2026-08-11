// OF-ADM-EDITORIAL-001 — owns search + filter + sort state for the Articles
// list and feeds the table. Client-only because the editorial UX wants the
// "narrow this down quickly" feel without round-tripping. We keep server
// fetch broad and filter on the client; the dataset is bounded (an editorial
// site has dozens, not thousands, of articles per month).

'use client'

import { useDeferredValue, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Newspaper, Search, Star } from 'lucide-react'
import EmptyState from '../../_shared/EmptyState'
import ArticlesFilterBar, {
  type ArticleSort,
  type ArticleStatusFilter,
} from './ArticlesFilterBar'
import ArticleRow, { type ArticleListEntry } from './ArticleRow'

// Public site renders Editor Picks as the top 5 of the featured pool.
// Surface the count + a quick link so admins know what's live without
// jumping to the dedicated front-page screen.
const FRONT_PAGE_SLOTS = 5

type Props = {
  articles: ArticleListEntry[]
}

function matchesSearch(entry: ArticleListEntry, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  return (
    entry.title.toLowerCase().includes(needle) ||
    entry.slug.toLowerCase().includes(needle) ||
    (entry.authorName?.toLowerCase().includes(needle) ?? false) ||
    entry.category.toLowerCase().includes(needle)
  )
}

const SORT_FNS: Record<
  ArticleSort,
  (a: ArticleListEntry, b: ArticleListEntry) => number
> = {
  newest: (a, b) =>
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  oldest: (a, b) =>
    new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime(),
  recently_edited: (a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
}

export default function ArticlesListView({ articles }: Props) {
  const [searchInput, setSearchInput] = useState('')
  const search = useDeferredValue(searchInput).trim()
  const [statusFilter, setStatusFilter] = useState<ArticleStatusFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [authorFilter, setAuthorFilter] = useState<string | null>(null)
  const [sort, setSort] = useState<ArticleSort>('newest')

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const a of articles) if (a.category) set.add(a.category)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [articles])

  const authors = useMemo(() => {
    const set = new Set<string>()
    for (const a of articles) if (a.authorName) set.add(a.authorName)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [articles])

  const visible = useMemo(() => {
    const filtered = articles.filter((a) => {
      if (statusFilter === 'published' && !a.published) return false
      if (statusFilter === 'draft' && a.published) return false
      if (categoryFilter && a.category !== categoryFilter) return false
      if (authorFilter && a.authorName !== authorFilter) return false
      return matchesSearch(a, search)
    })
    return filtered.sort(SORT_FNS[sort])
  }, [articles, statusFilter, categoryFilter, authorFilter, sort, search])

  const filtersActive =
    !!search || statusFilter !== 'all' || !!categoryFilter || !!authorFilter

  function clearFilters() {
    setSearchInput('')
    setStatusFilter('all')
    setCategoryFilter(null)
    setAuthorFilter(null)
  }

  const featuredPoolCount = articles.filter(
    (a) => a.featured && a.published
  ).length
  const pinnedCount = articles.filter(
    (a) => a.featured && a.featuredRank != null && a.published
  ).length
  const slotsFilled = Math.min(featuredPoolCount, FRONT_PAGE_SLOTS)

  return (
    <div className="space-y-4">
      <FrontPageStrip
        slotsFilled={slotsFilled}
        pinnedCount={pinnedCount}
        totalSlots={FRONT_PAGE_SLOTS}
      />
      <ArticlesFilterBar
        statusFilter={statusFilter}
        categories={categories}
        categoryFilter={categoryFilter}
        authors={authors}
        authorFilter={authorFilter}
        sort={sort}
        onStatusChange={setStatusFilter}
        onCategoryChange={setCategoryFilter}
        onAuthorChange={setAuthorFilter}
        onSortChange={setSort}
        searchSlot={
          <div className="relative w-full max-w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search articles"
              aria-label="Search articles"
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
            />
          </div>
        }
      />

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div data-opus-table-header
          role="row"
          className="grid grid-cols-[64px_minmax(0,1fr)_120px_120px] items-center gap-3 border-b border-gray-100 bg-gray-50/60 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500"
        >
          <span>Article</span>
          <span aria-hidden />
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>

        {/* Featured pool count is computed once for the FrontPageStrip
            above; the rendered list is whatever the filters return. */}
        {visible.length === 0 ? (
          <EmptyState
            icon={<Newspaper className="h-5 w-5" />}
            title={
              filtersActive
                ? 'No articles match these filters'
                : 'No articles yet'
            }
            body={
              filtersActive
                ? 'Clear filters or write something new.'
                : 'Write your first piece — it will appear here once you save a draft.'
            }
            action={
              filtersActive ? (
                <button data-opus-button="control"
                  type="button"
                  onClick={clearFilters}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Clear filters
                </button>
              ) : undefined
            }
          />
        ) : (
          visible.map((entry) => <ArticleRow key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  )
}

// Top-of-page banner showing what's currently rendered on the public
// `/advice-and-ideas` Editor Picks row. Counts only published + featured
// articles (drafts can't appear on the public front even if featured).
function FrontPageStrip({
  slotsFilled,
  pinnedCount,
  totalSlots,
}: {
  slotsFilled: number
  pinnedCount: number
  totalSlots: number
}) {
  const allEmpty = slotsFilled === 0
  return (
    <Link
      href="/cms/advice-and-ideas/front-page"
      className="group flex items-center justify-between gap-4 rounded-2xl border border-amber-100 bg-gradient-to-r from-amber-50/80 to-white px-5 py-4 transition-colors hover:border-amber-200 hover:from-amber-50"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <Star className="h-4 w-4 fill-amber-500 stroke-amber-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {allEmpty
              ? 'Nothing on the front page yet'
              : `${slotsFilled} / ${totalSlots} front-page ${slotsFilled === 1 ? 'slot' : 'slots'} filled`}
          </p>
          <p className="text-xs text-gray-600">
            {allEmpty
              ? 'Star a published article below to add it to the featured pool.'
              : pinnedCount > 0
                ? `${pinnedCount} pinned to a specific slot · drag to reorder`
                : 'None pinned yet — articles fill slots by recency. Drag to pin order.'}
          </p>
        </div>
      </div>
      <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-amber-700 group-hover:text-amber-800">
        Manage front page
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  )
}
