'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUpDown, Search } from 'lucide-react'
import {
  DEFAULT_PRODUCT_SORT,
  PRODUCT_SORTS,
  type ProductSort,
} from '@/lib/cms/opus-pass-digital-cards-products'

const BASE = '/opus-pass/digital-cards/cards'

/**
 * One value a filter can take, with how many cards it would return given the
 * other active filters. Options always render — `count: 0` says "nothing here
 * yet", which is information; a missing option is a bug.
 */
export type FilterOption = {
  value: string
  label: string
  count: number
  /** Short note appended to the label, e.g. a value outside the taxonomy. */
  flagged?: string
}

/** Back-compat alias for the category filter's option shape. */
export type CategoryOption = FilterOption

const selectCls =
  'px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC]'

export default function ProductsToolbar({
  initialQ,
  initialCategory,
  initialBadge,
  initialSort,
  categoryOptions,
  badgeOptions,
  actions,
}: {
  initialQ: string
  initialCategory: string
  initialBadge: string
  initialSort: ProductSort
  categoryOptions: FilterOption[]
  badgeOptions: FilterOption[]
  /** Right-aligned slot (e.g. the "New card" button) shown inside the toolbar. */
  actions?: ReactNode
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [q, setQ] = useState(initialQ)
  const previousInitialQ = useRef(initialQ)

  const setParam = useCallback((key: string, value: string, mode: 'push' | 'replace' = 'push') => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    // Any filter or sort change invalidates the current page number.
    params.delete('page')
    const href = `${BASE}${params.toString() ? `?${params}` : ''}`
    if (mode === 'replace') router.replace(href)
    else router.push(href)
  }, [router, searchParams])

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setParam('q', q.trim(), 'replace')
  }

  useEffect(() => {
    if (previousInitialQ.current === initialQ) return
    if (q.trim() === previousInitialQ.current) setQ(initialQ)
    previousInitialQ.current = initialQ
  }, [initialQ, q])

  useEffect(() => {
    const nextQ = q.trim()
    if (nextQ === initialQ) return

    const timeout = window.setTimeout(() => {
      setParam('q', nextQ, 'replace')
    }, 250)

    return () => window.clearTimeout(timeout)
  }, [initialQ, q, setParam])

  const hasFilters = Boolean(
    initialQ || initialCategory || initialBadge || initialSort !== DEFAULT_PRODUCT_SORT,
  )

  return (
    <div className="flex flex-wrap items-center gap-3 p-3 border-b border-gray-100">
      <form onSubmit={submitSearch} className="relative min-w-[200px] flex-1">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, designer…"
          className="pl-9 pr-3 py-2 bg-gray-50 border border-gray-100 rounded-lg w-full text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] focus:border-transparent transition-all"
        />
      </form>

      <FilterSelect
        label="All categories"
        value={initialCategory}
        options={categoryOptions}
        onChange={(v) => setParam('category', v)}
      />
      <FilterSelect
        label="All badges"
        value={initialBadge}
        options={badgeOptions}
        onChange={(v) => setParam('badge', v)}
      />

      <label className="flex items-center gap-1.5 text-sm text-gray-500">
        <ArrowUpDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span className="sr-only">Sort by</span>
        <select
          value={initialSort}
          onChange={(e) => setParam('sort', e.target.value === DEFAULT_PRODUCT_SORT ? '' : e.target.value)}
          className={selectCls}
        >
          {(Object.keys(PRODUCT_SORTS) as ProductSort[]).map((key) => (
            <option key={key} value={key}>
              {PRODUCT_SORTS[key].label}
            </option>
          ))}
        </select>
      </label>

      {hasFilters && (
        <button data-opus-button="danger" data-opus-button-size="small"
          type="button"
          onClick={() => {
            setQ('')
            router.push(BASE)
          }}
          className="text-xs font-semibold text-red-600 border border-red-300 px-3 py-2 rounded-lg hover:bg-red-50 hover:border-red-400 transition-colors"
        >
          Clear
        </button>
      )}
      {actions && <div className="ml-auto shrink-0">{actions}</div>}
    </div>
  )
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  /** Text for the unfiltered "all" option. */
  label: string
  value: string
  options: FilterOption[]
  onChange: (value: string) => void
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={selectCls}
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.flagged ? `${o.label} (${o.count}) — ${o.flagged}` : `${o.label} (${o.count})`}
        </option>
      ))}
    </select>
  )
}
