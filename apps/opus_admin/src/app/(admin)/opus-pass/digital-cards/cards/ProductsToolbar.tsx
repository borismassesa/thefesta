'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import { PRODUCT_CATEGORIES } from '@/lib/cms/opus-pass-digital-cards-products'

const BASE = '/cms/opus-pass/digital-cards/products'

export default function ProductsToolbar({
  initialQ,
  initialCategory,
  actions,
}: {
  initialQ: string
  initialCategory: string
  /** Right-aligned slot (e.g. the "New card" button) shown inside the toolbar. */
  actions?: ReactNode
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [q, setQ] = useState(initialQ)

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    params.delete('page')
    router.push(`${BASE}${params.toString() ? `?${params}` : ''}`)
  }

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setParam('q', q)
  }

  return (
    <div className="flex items-center gap-3 p-3 border-b border-gray-100">
      <form onSubmit={submitSearch} className="relative flex-1 max-w-sm">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, designer…"
          className="pl-9 pr-3 py-2 bg-gray-50 border border-gray-100 rounded-lg w-full text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] focus:border-transparent transition-all"
        />
      </form>
      <select
        value={initialCategory}
        onChange={(e) => setParam('category', e.target.value)}
        className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC]"
      >
        <option value="">All categories</option>
        {PRODUCT_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {(initialQ || initialCategory) && (
        <button
          type="button"
          onClick={() => {
            setQ('')
            router.push(BASE)
          }}
          className="text-xs font-medium text-gray-500 hover:text-gray-900 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Clear
        </button>
      )}
      {actions && <div className="ml-auto shrink-0">{actions}</div>}
    </div>
  )
}
