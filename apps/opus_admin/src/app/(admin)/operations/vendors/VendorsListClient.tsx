'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Building2,
  ChevronDown,
  Clock,
  Eye,
  Gauge,
  GitMerge,
  Loader2,
  Mail,
  MapPin,
  Plus,
  Search,
  ShoppingBag,
  SquarePen,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { useSetPageHeading } from '@/components/PageHeading'
import { HeaderActionsSlot } from '@/components/HeaderPortals'
import { VendorAvatar } from './_components/VendorAvatar'
import { StatusPill, type StatusPillVariant } from './_components/StatusPill'
import { MergeVendorDialog } from './_components/MergeVendorDialog'
import { createVendorAccount } from './actions'
import {
  VENDOR_VERTICALS,
  VERTICAL_LABELS,
  type QueueHealth,
  type VendorAccount,
  type VendorStatus,
  type VendorStatusCounts,
  type VendorVertical,
  type VerticalCounts,
} from './_lib/types'

const NEW_VENDOR_CATEGORIES = [
  'Venues',
  'Photographers',
  'Videographers',
  'Caterers',
  'Wedding Planners',
  'Florists',
  'DJs & Music',
  'Beauty & Makeup',
  'Bridal Salons',
  'Cake & Desserts',
  'Decorators',
  'Officiants',
  'Rentals',
  'Transportation',
] as const

type ListStatus = VendorStatus | 'all'
type ListVertical = VendorVertical | 'all'
type SortMode = 'oldest' | 'newest' | 'name'

// 'All' first so the filter reads the same way the Status pill does.
const VERTICAL_FILTER_OPTIONS: Array<{ id: ListVertical; label: string }> = [
  { id: 'all', label: 'All' },
  ...VENDOR_VERTICALS.map((v) => ({ id: v as ListVertical, label: VERTICAL_LABELS[v] })),
]

function verticalOptionLabel(id: ListVertical, counts: VerticalCounts): string {
  const option = VERTICAL_FILTER_OPTIONS.find((v) => v.id === id)
  return `${option?.label ?? 'All'} (${counts[id]})`
}

const SORT_LABELS: Record<SortMode, string> = {
  oldest: 'Oldest in queue',
  newest: 'Newest first',
  name: 'Name (A → Z)',
}

const STATUS_TABS: Array<{ id: ListStatus; label: string; description: string }> = [
  {
    id: 'all',
    label: 'All',
    description: 'Every vendor record.',
  },
  {
    id: 'awaiting_review',
    label: 'Awaiting review',
    description: 'Submitted everything, waiting on us.',
  },
  {
    id: 'needs_corrections',
    label: 'Corrections',
    description: 'Bounced back to vendor with notes.',
  },
  {
    id: 'uploading_docs',
    label: 'Uploading',
    description: 'Application submitted, docs in progress.',
  },
  {
    id: 'drafting',
    label: 'Drafting',
    description: 'Started the wizard, not yet submitted.',
  },
  {
    id: 'active',
    label: 'Active',
    description: 'Approved and live on OpusFesta.',
  },
  {
    id: 'suspended',
    label: 'Suspended',
    description: 'Manually disabled by admin.',
  },
]

const STATUS_BADGE: Record<
  VendorStatus,
  { label: string; variant: StatusPillVariant }
> = {
  awaiting_review: { label: 'Submitted', variant: 'warning' },
  needs_corrections: { label: 'Corrections', variant: 'danger' },
  uploading_docs: { label: 'Uploading', variant: 'info' },
  drafting: { label: 'Drafting', variant: 'neutral' },
  active: { label: 'Active', variant: 'success' },
  suspended: { label: 'Suspended', variant: 'neutral' },
}

// Vendor hasn't finished their side yet — these read as "in progress" (dashed,
// muted) so a half-built record never masquerades as a live one.
const IN_PROGRESS_STATUSES = new Set<VendorStatus>(['drafting', 'uploading_docs'])

// Shared 6-column grid for the list "table" (CSS grid, not <table> — mirrors
// the Employees page). Columns: Vendor · Vendor ID · Category · Status ·
// Joined · Actions.
const ROW_GRID =
  'grid min-w-[860px] grid-cols-[minmax(0,2.4fr)_110px_minmax(0,1.8fr)_130px_minmax(130px,1fr)_64px] items-center gap-5'

export default function VendorsListClient({
  vendors,
  status,
  vertical,
  counts,
  verticalCounts,
  health,
  slaHours,
}: {
  vendors: VendorAccount[]
  status: ListStatus
  vertical: ListVertical
  counts: VendorStatusCounts
  verticalCounts: VerticalCounts
  health: QueueHealth
  slaHours: number
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const initialQ = searchParams?.get('q') ?? ''
  const initialSort = (searchParams?.get('sort') as SortMode) ?? 'oldest'

  const [search, setSearch] = useState(initialQ)
  const [categoryFilter, setCategoryFilter] = useState(
    searchParams?.get('category') ?? 'All',
  )
  const [sort, setSort] = useState<SortMode>(
    initialSort === 'oldest' || initialSort === 'newest' || initialSort === 'name'
      ? initialSort
      : 'oldest',
  )

  // Header is driven by live status data per OF-ENG-SPEC-002 §5.
  const activeTab = STATUS_TABS.find((t) => t.id === status)
  useSetPageHeading({
    title: 'Vendor accounts',
    subtitle: activeTab?.description ?? 'Every vendor record.',
  })

  // URL sync — debounced for `q`, immediate for the rest. Uses replace so
  // the tab/sort doesn't pollute history.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const next = new URLSearchParams(searchParams?.toString() ?? '')
      if (search.trim()) next.set('q', search.trim())
      else next.delete('q')
      const current = searchParams?.get('q') ?? ''
      if ((current ?? '') === (next.get('q') ?? '')) return
      router.replace(
        next.toString() ? `/operations/vendors?${next}` : '/operations/vendors',
        { scroll: false },
      )
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search, router, searchParams])

  const writeParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams?.toString() ?? '')
    if (value && value !== 'all') next.set(key, value)
    else next.delete(key)
    router.replace(
      next.toString() ? `/operations/vendors?${next}` : '/operations/vendors',
      { scroll: false },
    )
  }

  const handleStatusChange = (next: ListStatus) => {
    // `writeParam` already drops the URL key when value is 'all' (the new
    // default), so we just hand it the raw status — clicking 'all' clears
    // the param, every other tab sets it.
    writeParam('status', next)
  }

  // Vertical is a server-side filter (the roster is capped at 200 rows), so it
  // only writes the URL param and lets the page refetch.
  const handleVerticalChange = (next: ListVertical) => {
    writeParam('vertical', next)
  }

  const handleSortChange = (next: SortMode) => {
    setSort(next)
    writeParam('sort', next === 'oldest' ? null : next)
  }

  const handleCategoryChange = (next: string) => {
    setCategoryFilter(next)
    writeParam('category', next === 'All' ? null : next)
  }

  const [view, setView] = useState<'list' | 'grid'>('grid')

  // Distinct categories present in the roster, title-cased, for the filter.
  const categoryOptions = useMemo(() => {
    const set = new Set<string>()
    for (const v of vendors) {
      const label = titleCaseCategory(v.category)
      if (label) set.add(label)
    }
    return ['All', ...Array.from(set).sort((a, b) => a.localeCompare(b))]
  }, [vendors])

  // One router.replace for the lot. Calling writeParam per filter would have
  // each call build its URL from the same stale `searchParams`, so only the
  // last one survived and the others silently stayed in the URL.
  const clearFilters = () => {
    setSearch('')
    setCategoryFilter('All')
    const next = new URLSearchParams(searchParams?.toString() ?? '')
    for (const key of ['q', 'category', 'status', 'vertical']) next.delete(key)
    router.replace(
      next.toString() ? `/operations/vendors?${next}` : '/operations/vendors',
      { scroll: false },
    )
  }

  const visibleVendors = useMemo(() => {
    let list = vendors

    if (categoryFilter !== 'All') {
      list = list.filter((v) => titleCaseCategory(v.category) === categoryFilter)
    }

    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((v) => {
        const haystack = [
          v.businessName,
          v.publicId,
          v.category,
          v.city ?? '',
          v.submittedByName ?? '',
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(q)
      })
    }

    const sorted = [...list]
    sorted.sort((a, b) => {
      switch (sort) {
        case 'oldest': {
          const aT = a.submittedAt ? new Date(a.submittedAt).getTime() : Infinity
          const bT = b.submittedAt ? new Date(b.submittedAt).getTime() : Infinity
          return aT - bT
        }
        case 'newest': {
          const aT = a.submittedAt
            ? new Date(a.submittedAt).getTime()
            : new Date(a.createdAt).getTime()
          const bT = b.submittedAt
            ? new Date(b.submittedAt).getTime()
            : new Date(b.createdAt).getTime()
          return bT - aT
        }
        case 'name':
          return a.businessName.localeCompare(b.businessName, undefined, {
            sensitivity: 'base',
          })
      }
    })
    return sorted
  }, [vendors, search, sort, categoryFilter])

  const totalCount = vendors.length

  const [createOpen, setCreateOpen] = useState(false)
  const [mergeAnchor, setMergeAnchor] = useState<VendorAccount | null>(null)

  return (
    <div className="px-8 pt-4 pb-12">
      {/* Create vendor CTA — portaled into the global Header so it sits
          next to the help/bell icons, matching the pattern used on the
          vendor review page. */}
      <HeaderActionsSlot>
        <button data-opus-button="control"
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full bg-[#7E5896] hover:bg-[#6B4880] text-white shadow-sm transition-colors"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
          New vendor
        </button>
      </HeaderActionsSlot>

      <CreateVendorDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => {
          setCreateOpen(false)
          router.push(`/operations/vendors/${id}`)
        }}
      />

      <MergeVendorDialog
        anchor={mergeAnchor}
        vendors={vendors}
        onClose={() => setMergeAnchor(null)}
        onMerged={() => {
          setMergeAnchor(null)
          router.refresh()
        }}
      />

      <div className="space-y-5">
        {/* KPI cards — same visual language as the Employees page. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Total vendors"
            value={String(counts.all)}
            delta={`${counts.active} active`}
            deltaTone="neutral"
            icon={<Building2 className="h-4 w-4" />}
          />
          <Kpi
            label="Awaiting review"
            value={String(counts.awaiting_review)}
            hint="in the review queue"
            icon={<Clock className="h-4 w-4" />}
          />
          <Kpi
            label="Avg review time"
            value={health.avgReviewTimeDays > 0 ? `${health.avgReviewTimeDays}d` : '—'}
            hint="per vendor"
            icon={<Gauge className="h-4 w-4" />}
          />
          <Kpi
            label="SLA at risk"
            value={String(health.slaAtRisk)}
            delta={health.slaAtRisk > 0 ? 'attention' : undefined}
            deltaTone="negative"
            hint={health.slaAtRisk > 0 ? undefined : 'all on track'}
            icon={<AlertTriangle className="h-4 w-4" />}
          />
        </div>

        {/* Toolbar — search + status/sort pills + view toggle. */}
        <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, category, city, ID…"
                aria-label="Search vendors"
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC] [&::-webkit-search-cancel-button]:hidden"
              />
            </div>
            <FilterPill
              label="Vertical"
              // Counts ride in the option labels: "Gift shop (3)" answers the
              // question an admin actually opens this filter to ask, without
              // having to select it first. `value` carries the same string so
              // the native <select> stays in sync with the pill.
              value={verticalOptionLabel(vertical, verticalCounts)}
              options={VERTICAL_FILTER_OPTIONS.map((v) =>
                verticalOptionLabel(v.id, verticalCounts),
              )}
              active={vertical !== 'all'}
              onChange={(label) => {
                const match = VERTICAL_FILTER_OPTIONS.find(
                  (v) => verticalOptionLabel(v.id, verticalCounts) === label,
                )
                if (match) handleVerticalChange(match.id)
              }}
            />
            <FilterPill
              label="Category"
              value={categoryFilter}
              options={categoryOptions}
              onChange={handleCategoryChange}
            />
            <FilterPill
              label="Status"
              value={activeTab?.label ?? 'All'}
              options={STATUS_TABS.map((t) => t.label)}
              onChange={(label) => {
                const tab = STATUS_TABS.find((t) => t.label === label)
                if (tab) handleStatusChange(tab.id)
              }}
            />
            <FilterPill
              label="Sort"
              value={SORT_LABELS[sort]}
              options={Object.values(SORT_LABELS)}
              onChange={(label) => {
                const mode = (Object.keys(SORT_LABELS) as SortMode[]).find(
                  (m) => SORT_LABELS[m] === label,
                )
                if (mode) handleSortChange(mode)
              }}
            />
            {(search.trim() ||
              status !== 'all' ||
              vertical !== 'all' ||
              categoryFilter !== 'All') && (
              <button data-opus-button="control"
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-gray-500 hover:text-[#5B2D8E]"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            )}
            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs text-gray-500 tabular-nums">
                {visibleVendors.length === vendors.length
                  ? `${vendors.length} ${vendors.length === 1 ? 'vendor' : 'vendors'}`
                  : `${visibleVendors.length} of ${vendors.length}`}
              </span>
              <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs font-semibold">
                <button data-opus-button="control"
                  type="button"
                  onClick={() => setView('grid')}
                  className={cn(
                    'rounded-md px-2.5 py-1 transition-colors',
                    view === 'grid' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500',
                  )}
                >
                  Cards
                </button>
                <button data-opus-button="control"
                  type="button"
                  onClick={() => setView('list')}
                  className={cn(
                    'rounded-md px-2.5 py-1 transition-colors',
                    view === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500',
                  )}
                >
                  Table
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Results — list (grid-row table) or card grid. */}
        {visibleVendors.length === 0 ? (
          <EmptyState search={search} totalInStatus={totalCount} />
        ) : view === 'list' ? (
          <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            <div data-opus-table-header
              role="row"
              className={cn(
                ROW_GRID,
                'border-b border-gray-100 bg-gray-50/60 px-5 py-2.5 text-[11px] font-semibold text-gray-500',
              )}
            >
              <span>Vendor</span>
              <span>Vendor ID</span>
              <span>Category</span>
              <span>Status</span>
              <span>Joined</span>
              <span className="pr-1 text-right">Actions</span>
            </div>
            {visibleVendors.map((v) => (
              <VendorRow
                key={v.id}
                vendor={v}
                slaHours={slaHours}
                onOpen={() => router.push(`/operations/vendors/${v.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleVendors.map((v) => (
              <VendorCard
                key={v.id}
                vendor={v}
                onOpen={() => router.push(`/operations/vendors/${v.id}`)}
                onMerge={() => setMergeAnchor(v)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// --- Sub-components --------------------------------------------------------

// Vertical badge, shown only for product vendors. 'service' is the default and
// the overwhelming majority, so labelling every row "Wedding service" would be
// noise; the exceptions are what an admin needs to spot, because a shop filed
// under the wrong vertical is published to the wrong public catalogue.
function VerticalPill({ vertical }: { vertical: VendorVertical }) {
  if (vertical === 'service') return null
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[#9FE870] px-2 py-0.5 text-[11px] font-semibold text-[#14532D]">
      <ShoppingBag className="h-3 w-3" />
      {VERTICAL_LABELS[vertical]}
    </span>
  )
}

// Pill-shaped filter with a transparent native <select> overlaid — same
// pattern as the Employees page so the two pages read identically.
function FilterPill({
  label,
  value,
  onChange,
  options,
  active: activeOverride,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: readonly string[]
  /** For filters whose "unset" option isn't literally the string 'All'. */
  active?: boolean
}) {
  const active =
    activeOverride ?? (value !== 'All' && value !== SORT_LABELS.oldest)
  return (
    <label
      className={cn(
        'relative inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
        active
          ? 'border-[#E0BEEC] bg-[#F0DFF6] text-[#5B2D8E]'
          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
      )}
    >
      <span className="text-gray-400">{label}:</span>
      <span className={active ? 'text-[#5B2D8E]' : 'text-gray-900'}>{value}</span>
      <ChevronDown className="h-3 w-3 text-gray-400" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  )
}

// --- KPI card (mirrors workforce/_components/Kpi) --------------------------

function Kpi({
  label,
  value,
  delta,
  deltaTone = 'positive',
  hint,
  icon,
}: {
  label: string
  value: string
  delta?: string
  deltaTone?: 'positive' | 'negative' | 'neutral'
  hint?: string
  icon?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[12px] font-medium text-gray-500">{label}</div>
        {icon && (
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
            {icon}
          </span>
        )}
      </div>
      <div className="mt-2 text-[28px] font-semibold leading-none tracking-tight text-gray-900">
        {value}
      </div>
      {(delta || hint) && (
        <div className="mt-2 flex items-center gap-2 text-[11px]">
          {delta && (
            <span
              className={cn(
                'inline-flex items-center rounded-full px-1.5 py-0.5 font-semibold',
                deltaTone === 'positive' && 'bg-emerald-50 text-emerald-700',
                deltaTone === 'negative' && 'bg-rose-50 text-rose-700',
                deltaTone === 'neutral' && 'bg-gray-100 text-gray-600',
              )}
            >
              {delta}
            </span>
          )}
          {hint && <span className="text-gray-400">{hint}</span>}
        </div>
      )}
    </div>
  )
}

// --- List row --------------------------------------------------------------

function VendorRow({
  vendor,
  slaHours,
  onOpen,
}: {
  vendor: VendorAccount
  slaHours: number
  onOpen: () => void
}) {
  const badge = STATUS_BADGE[vendor.status]
  return (
    <div data-opus-table-row
      role="row"
      onClick={onOpen}
      className={cn(
        ROW_GRID,
        'group cursor-pointer border-b border-gray-100 px-5 py-3 transition-colors last:border-b-0 hover:bg-gray-50/80',
      )}
    >
      {/* Vendor: logo + name + city */}
      <div className="flex min-w-0 items-center gap-3">
        <VendorAvatar
          logoUrl={vendor.logoUrl}
          businessName={vendor.businessName}
          category={vendor.category}
          size={32}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-950">
            {vendor.businessName}
          </p>
          <p className="truncate text-xs text-gray-500">{vendor.city || '—'}</p>
        </div>
      </div>

      {/* Vendor ID */}
      <div className="min-w-0">
        <span className="font-mono text-[12px] font-semibold tracking-tight text-gray-700 tabular-nums">
          {vendor.publicId}
        </span>
      </div>

      {/* Category + submitter */}
      <div className="min-w-0">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-gray-900">
          <span className="truncate">{titleCaseCategory(vendor.category) || '—'}</span>
          <VerticalPill vertical={vendor.vertical} />
        </p>
        {vendor.submittedByName && (
          <p className="truncate text-xs text-gray-500">
            via {vendor.submittedByName}
          </p>
        )}
      </div>

      {/* Status */}
      <div>
        <StatusPill variant={badge.variant}>{badge.label}</StatusPill>
      </div>

      {/* Joined */}
      <div className="min-w-0">
        <p className="truncate text-sm text-gray-700 tabular-nums">
          {formatDate(vendor.submittedAt ?? vendor.createdAt)}
        </p>
        <p
          className={cn(
            'truncate text-[11px]',
            ageTone(vendor, slaHours),
          )}
        >
          {formatRelativeTime(vendor.submittedAt ?? vendor.createdAt)}
        </p>
      </div>

      {/* Actions */}
      <div
        className="flex items-center justify-end"
        onClick={(e) => {
          e.stopPropagation()
        }}
      >
        <a
          href={`/operations/vendors/${vendor.id}`}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
            e.preventDefault()
            onOpen()
          }}
          aria-label={`Review ${vendor.businessName}`}
          title="Open vendor"
          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-[#F0DFF6] hover:text-[#5B2D8E]"
        >
          <ArrowUpRight className="h-4 w-4" />
        </a>
      </div>
    </div>
  )
}

// --- Grid card -------------------------------------------------------------

function VendorCard({
  vendor,
  onOpen,
  onMerge,
}: {
  vendor: VendorAccount
  onOpen: () => void
  onMerge: () => void
}) {
  const badge = STATUS_BADGE[vendor.status]
  const inProgress = IN_PROGRESS_STATUSES.has(vendor.status)
  const suspended = vendor.status === 'suspended'

  // Flat surfaces — a border carries the card, no drop shadow. State drives the
  // treatment so the grid is scannable: in-progress = dashed/flat, suspended =
  // muted, everything else (live + in-queue) = neutral gray border with a
  // lavender hover accent. Status itself is read from the pill, so we keep one
  // calm treatment across the grid rather than colour-coding live vs. queued.
  const surface = inProgress
    ? 'border-2 border-dashed border-gray-300 bg-gray-50/50 hover:border-[#C9A0DC]'
    : suspended
      ? 'border-2 border-gray-200 bg-gray-50/70 hover:border-gray-300'
      : 'border-2 border-gray-200 bg-white hover:border-[#C9A0DC]'

  const reviewHref = `/operations/vendors/${vendor.id}`

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        'group relative flex cursor-pointer flex-col rounded-xl p-4 text-left transition-all',
        surface,
      )}
    >
      {/* Header: logo tile + name with the category pill tucked directly
          beneath the name; status pill pinned right. */}
      <div className="flex items-start gap-3">
        <VendorAvatar
          logoUrl={vendor.logoUrl}
          businessName={vendor.businessName}
          category={vendor.category}
          size={44}
          className={suspended ? 'opacity-70 grayscale' : undefined}
        />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'line-clamp-2 text-sm font-semibold leading-snug',
              suspended ? 'text-gray-500' : 'text-gray-950',
            )}
          >
            {vendor.businessName}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center whitespace-nowrap rounded-full bg-[#F0DFF6] px-2 py-0.5 text-[11px] font-semibold text-[#5B2D8E]">
              {titleCaseCategory(vendor.category) || 'Uncategorized'}
            </span>
            <VerticalPill vertical={vendor.vertical} />
            {inProgress && (
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-dashed border-[#C9A0DC] px-2 py-0.5 text-[11px] font-semibold text-[#7E5896]">
                {vendor.documentsTotal > 0
                  ? `Docs ${vendor.documentsVerified}/${vendor.documentsTotal}`
                  : 'Awaiting docs'}
              </span>
            )}
          </div>
        </div>
        <StatusPill variant={badge.variant}>{badge.label}</StatusPill>
      </div>

      {/* Meta row: location + labeled timestamp */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-black/5 pt-2.5 text-xs text-gray-500">
        <span className="inline-flex min-w-0 items-center gap-1">
          <MapPin className="h-3 w-3 shrink-0 text-gray-400" />
          <span className="truncate">{vendor.city || 'Location TBC'}</span>
        </span>
        <span className="shrink-0 text-gray-400">
          Updated {formatRelativeTime(vendor.updatedAt)}
        </span>
      </div>

      {/* Footer: demoted ID caption + hover quick-actions. mt-auto pins it to the
          bottom so it stays aligned across cards of differing content height. */}
      <div className="mt-auto flex items-center justify-between gap-2 pt-2.5">
        <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-gray-400 tabular-nums">
          {vendor.publicId}
        </span>
        <div className="flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <CardAction label="View vendor" href={reviewHref} onActivate={onOpen}>
            <Eye className="h-3.5 w-3.5" />
          </CardAction>
          <CardAction label="Edit storefront" href={reviewHref} onActivate={onOpen}>
            <SquarePen className="h-3.5 w-3.5" />
          </CardAction>
          {vendor.contactEmail && (
            <CardAction
              label="Message vendor"
              href={`mailto:${vendor.contactEmail}`}
            >
              <Mail className="h-3.5 w-3.5" />
            </CardAction>
          )}
          <button data-opus-button="control"
            type="button"
            title="Merge duplicate"
            aria-label="Merge duplicate"
            onClick={(e) => {
              e.stopPropagation()
              onMerge()
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white/80 text-gray-500 transition-colors hover:border-[#C9A0DC] hover:bg-[#F0DFF6] hover:text-[#5B2D8E]"
          >
            <GitMerge className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

// Small hover quick-action on a card. Anchor-based so View/Edit support
// cmd-click (open in new tab) and Message is a real mailto; clicks are
// stopped from bubbling to the card's onClick.
function CardAction({
  label,
  href,
  onActivate,
  children,
}: {
  label: string
  href: string
  onActivate?: () => void
  children: ReactNode
}) {
  return (
    <a
      href={href}
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        // Plain left-clicks on internal links route via the SPA; let modified
        // clicks (new tab) and mailto fall through to the browser.
        if (onActivate && !(e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)) {
          e.preventDefault()
          onActivate()
        }
      }}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white/80 text-gray-500 transition-colors hover:border-[#C9A0DC] hover:bg-[#F0DFF6] hover:text-[#5B2D8E]"
    >
      {children}
    </a>
  )
}

// --- Time / text helpers ---------------------------------------------------

function ageTone(vendor: VendorAccount, slaHours: number): string {
  if (vendor.status !== 'awaiting_review' || !vendor.submittedAt) {
    return 'text-gray-400'
  }
  const ageMs = Date.now() - new Date(vendor.submittedAt).getTime()
  const slaMs = slaHours * 60 * 60 * 1000
  if (ageMs > slaMs * 2) return 'text-rose-600'
  if (ageMs > slaMs) return 'text-amber-600'
  return 'text-gray-400'
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return '—'
  const target = new Date(iso).getTime()
  if (Number.isNaN(target)) return '—'
  const diffMs = Date.now() - target
  if (diffMs < 60_000) return 'just now'
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo`
  return `${Math.floor(days / 365)}y`
}

function titleCaseCategory(raw: string): string {
  if (!raw) return ''
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
}

function EmptyState({
  search,
  totalInStatus,
}: {
  search: string
  totalInStatus: number
}) {
  const filtered = Boolean(search.trim())
  return (
    <div className="bg-white rounded-xl border border-dashed border-gray-200 p-16 text-center">
      <div className="w-12 h-12 rounded-2xl bg-[#EEEDFE] text-[#5B2D8E] flex items-center justify-center mx-auto">
        <Building2 className="w-6 h-6" strokeWidth={1.6} />
      </div>
      <p className="text-sm font-semibold text-gray-700 mt-4">
        {filtered
          ? 'No vendors match those filters.'
          : totalInStatus === 0
            ? 'No vendors in this status'
            : 'Nothing here.'}
      </p>
      <p className="text-xs text-gray-500 mt-1">
        {filtered
          ? 'Clear the search to see all vendors.'
          : 'When vendors hit this state, they’ll appear here.'}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create vendor dialog
//
// Admin spins up a vendor row directly with the bare minimum (business
// name, category, contact email). Status starts at
// `application_in_progress` so the admin can fill in everything else
// (address, packages, photos, etc.) via the existing per-section editors
// on the review page. The contact email also creates a placeholder
// `users` row — when the real vendor signs in with the matching email,
// they pick up the existing membership and storefront.
// ---------------------------------------------------------------------------

function CreateVendorDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (vendorId: string) => void
}) {
  const [businessName, setBusinessName] = useState('')
  const [category, setCategory] = useState<string>('')
  const [contactEmail, setContactEmail] = useState('')
  const [city, setCity] = useState('')
  const [phone, setPhone] = useState('')
  const [bio, setBio] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Reset the form whenever the dialog opens so reopening doesn't show
  // stale input from the previous attempt.
  useEffect(() => {
    if (!open) return
    setBusinessName('')
    setCategory('')
    setContactEmail('')
    setCity('')
    setPhone('')
    setBio('')
    setError(null)
  }, [open])

  // Close on Esc — small affordance, no library needed.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, pending, onClose])

  if (!open) return null

  const submit = () => {
    setError(null)
    startTransition(async () => {
      const res = await createVendorAccount({
        businessName,
        category,
        contactEmail,
        city: city || undefined,
        phone: phone || undefined,
        bio: bio || undefined,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      onCreated(res.vendorId)
    })
  }

  const valid =
    businessName.trim().length > 1 &&
    category.length > 0 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail.trim())

  const fieldCls =
    'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7E5896]/30 focus:border-[#7E5896]/40'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-vendor-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose()
      }}
    >
      <div className="relative bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-lg">
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3 border-b border-gray-100">
          <div>
            <h2
              id="create-vendor-title"
              className="text-base font-semibold text-gray-900"
            >
              New vendor account
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Fill in the basics. You can complete the storefront (packages,
              photos, hours) on the review page.
            </p>
          </div>
          <button data-opus-button="control"
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-gray-400 hover:text-gray-700 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-3">
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2">
              <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
              <p className="text-xs text-rose-800 leading-relaxed">{error}</p>
            </div>
          )}

          <FormField label="Business name">
            <input
              autoFocus
              className={fieldCls}
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Bahari Catering"
            />
          </FormField>

          <FormField label="Category">
            <select
              className={fieldCls}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Select a category…</option>
              {NEW_VENDOR_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Contact email">
            <input
              type="email"
              className={fieldCls}
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="owner@example.co.tz"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              The vendor claims the account when they sign in with this email.
            </p>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="City (optional)">
              <input
                className={fieldCls}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Dar es Salaam"
              />
            </FormField>
            <FormField label="Phone (optional)">
              <input
                className={fieldCls}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+255 7XX XXX XXX"
              />
            </FormField>
          </div>

          <FormField label="Short bio (optional)">
            <textarea
              rows={2}
              className={fieldCls}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="One sentence about the vendor — couples see this on the listing card."
            />
          </FormField>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-gray-100">
          <button data-opus-button="control"
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-sm font-semibold px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button data-opus-button="control"
            type="button"
            onClick={submit}
            disabled={!valid || pending}
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg bg-[#7E5896] hover:bg-[#6B4880] text-white disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {pending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating…
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" /> Create vendor
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function FormField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}
