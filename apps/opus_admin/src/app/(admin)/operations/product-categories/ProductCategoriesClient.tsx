'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check, Plus, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  addProductCategory,
  deleteProductCategory,
  updateProductCategory,
} from './actions'
import type { ProductCategoryRow } from './page'

export default function ProductCategoriesClient({
  categories,
}: {
  categories: ProductCategoryRow[]
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ slug: '', label: '', icon: 'Gift', sortOrder: categories.length + 1 })
  const [pending, startTransition] = useTransition()

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) setError(res.error ?? 'Something went wrong')
      else router.refresh()
    })
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Product categories</h1>
          <p className="mt-1 text-sm text-gray-500">
            The browse taxonomy for the registry shop. Vendors tag each product with one.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-800"
        >
          <Plus className="h-4 w-4" /> Add category
        </button>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</p>
      ) : null}

      {adding ? (
        <div className="mb-4 grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2 rounded-2xl border border-gray-200 bg-white p-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-700">Label</span>
            <input
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder="Kitchen & Dining"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-700">Slug</span>
            <input
              value={draft.slug}
              onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
              placeholder="kitchen-dining"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-700">Icon</span>
            <input
              value={draft.icon}
              onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
              placeholder="CookingPot"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
            />
          </label>
          <button
            type="button"
            disabled={pending || !draft.label.trim() || !draft.slug.trim()}
            onClick={() =>
              run(async () => {
                const res = await addProductCategory(draft)
                if (res.ok) {
                  setAdding(false)
                  setDraft({ slug: '', label: '', icon: 'Gift', sortOrder: categories.length + 2 })
                }
                return res
              })
            }
            className="inline-flex h-10 items-center rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        {categories.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500">No categories yet.</p>
        ) : (
          categories.map((c) => (
            <div
              key={c.slug}
              className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">{c.label}</p>
                <p className="text-xs text-gray-500">
                  {c.slug} · {c.icon} · sort {c.sort_order}
                </p>
              </div>
              <button
                type="button"
                onClick={() => run(() => updateProductCategory(c.slug, { active: !c.active }))}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold',
                  c.active
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-gray-200 bg-gray-50 text-gray-500',
                )}
              >
                {c.active ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                {c.active ? 'Active' : 'Hidden'}
              </button>
              <button
                type="button"
                onClick={() => run(() => deleteProductCategory(c.slug))}
                aria-label={`Delete ${c.label}`}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
