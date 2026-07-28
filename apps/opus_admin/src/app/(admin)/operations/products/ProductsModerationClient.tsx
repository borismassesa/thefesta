'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import Image from 'next/image'
import { AlertCircle, Check, Package, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { approveProduct, rejectProduct } from './actions'
import type {
  ModerationProduct,
  ProductFilter,
  ProductModerationSummary,
} from './queries'

const FILTERS: { key: ProductFilter; label: string }[] = [
  { key: 'review', label: 'Needs review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
]

function formatTzs(v: number): string {
  return `TZS ${v.toLocaleString('en-US')}`
}

const STATUS_CLASS: Record<ModerationProduct['status'], string> = {
  draft: 'border-gray-200 bg-gray-50 text-gray-600',
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rejected: 'border-rose-200 bg-rose-50 text-rose-700',
}

export default function ProductsModerationClient({
  products,
  summary,
  filter,
  query,
}: {
  products: ModerationProduct[]
  summary: ProductModerationSummary
  filter: ProductFilter
  query: string
}) {
  const router = useRouter()
  const [q, setQ] = useState(query)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function go(next: { filter?: ProductFilter; q?: string }) {
    const params = new URLSearchParams()
    params.set('filter', next.filter ?? filter)
    const term = next.q ?? q
    if (term.trim()) params.set('q', term.trim())
    router.push(`/operations/products?${params.toString()}`)
  }

  function onApprove(id: string) {
    setBusyId(id)
    setError(null)
    startTransition(async () => {
      const res = await approveProduct(id)
      if (!res.ok) setError(res.error)
      else router.refresh()
      setBusyId(null)
    })
  }

  function onReject(id: string) {
    setBusyId(id)
    setError(null)
    startTransition(async () => {
      const res = await rejectProduct(id, rejectNote)
      if (!res.ok) setError(res.error)
      else {
        setRejectingId(null)
        setRejectNote('')
        router.refresh()
      }
      setBusyId(null)
    })
  }

  const tiles: { key: ProductFilter; label: string; value: number }[] = [
    { key: 'review', label: 'Needs review', value: summary.review },
    { key: 'approved', label: 'Approved', value: summary.approved },
    { key: 'rejected', label: 'Rejected', value: summary.rejected },
  ]

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Products</h1>
        <p className="mt-1 text-sm text-gray-500">
          Review products vendors list for the registry shop. Approving makes a
          product publicly buyable; rejecting sends the vendor your note.
        </p>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => go({ filter: t.key })}
            className={cn(
              'rounded-2xl border px-4 py-3 text-left transition-colors',
              filter === t.key ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white hover:border-gray-300',
            )}
          >
            <p className={cn('text-2xl font-bold tabular-nums', filter === t.key ? 'text-white' : 'text-gray-900')}>
              {t.value}
            </p>
            <p className={cn('text-xs font-medium', filter === t.key ? 'text-white/70' : 'text-gray-500')}>
              {t.label}
            </p>
          </button>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => go({ filter: f.key })}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
                filter === f.key ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <form
          className="relative ml-auto"
          onSubmit={(e) => {
            e.preventDefault()
            go({ q })
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products…"
            className="w-56 rounded-full border border-gray-200 bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-gray-400"
          />
        </form>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</p>
      ) : null}

      {products.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-16 text-center">
          <Package className="h-8 w-8 text-gray-300" />
          <p className="text-sm font-semibold text-gray-900">Nothing here</p>
          <p className="text-sm text-gray-500">No products match this filter.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {products.map((p) => (
            <div key={p.id} className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-start gap-4">
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-50">
                  {p.images[0] ? (
                    <Image src={p.images[0]} alt="" fill sizes="80px" className="object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-gray-300">
                      <Package className="h-6 w-6" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-gray-900">{p.name}</h3>
                    <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', STATUS_CLASS[p.status])}>
                      {p.status === 'pending' ? 'Needs review' : p.status}
                    </span>
                    {!p.published ? (
                      <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
                        Hidden by vendor
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {p.vendorName}
                    {p.vendorStatus !== 'active' ? (
                      <span className="ml-1 text-amber-600">· vendor {p.vendorStatus}</span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-sm font-bold text-gray-900">
                    {formatTzs(p.priceTzs)}
                    {p.compareAtPriceTzs ? (
                      <span className="ml-2 text-xs font-normal text-gray-400 line-through">
                        {formatTzs(p.compareAtPriceTzs)}
                      </span>
                    ) : null}
                    <span className="ml-3 text-xs font-normal text-gray-500">
                      {p.madeToOrder
                        ? 'Made to order'
                        : p.stockQuantity === null
                          ? 'Stock untracked'
                          : `${p.stockQuantity} in stock`}
                    </span>
                    {p.categorySlug ? (
                      <span className="ml-3 text-xs font-normal text-gray-500">{p.categorySlug}</span>
                    ) : null}
                  </p>
                  {p.status === 'rejected' && p.rejectionNote ? (
                    <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700">
                      <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" /> {p.rejectionNote}
                    </p>
                  ) : null}
                </div>
                {p.status !== 'approved' ? (
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => onApprove(p.id)}
                      disabled={busyId === p.id}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" /> Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRejectingId(rejectingId === p.id ? null : p.id)
                        setRejectNote('')
                      }}
                      disabled={busyId === p.id}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" /> Reject
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setRejectingId(rejectingId === p.id ? null : p.id)
                      setRejectNote('')
                    }}
                    disabled={busyId === p.id}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Unpublish
                  </button>
                )}
              </div>

              {rejectingId === p.id ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
                  <input
                    autoFocus
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    placeholder="Reason (sent to the vendor)…"
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                  />
                  <button
                    type="button"
                    onClick={() => onReject(p.id)}
                    disabled={busyId === p.id || !rejectNote.trim()}
                    className="inline-flex h-9 items-center rounded-lg bg-rose-600 px-3.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    {p.status === 'approved' ? 'Unpublish' : 'Reject'}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
