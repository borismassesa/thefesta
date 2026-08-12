'use client'

import { useState, useTransition } from 'react'
import { Eye, EyeOff, Pencil, Plus, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { addCategory, updateCategory } from './actions'
import type { CategoryRow } from './page'

const ICON_OPTIONS = [
  'Building2', 'ChefHat', 'Camera', 'Cake', 'Flower2', 'ClipboardList',
  'Music2', 'Heart', 'Video', 'PartyPopper', 'Wand2', 'HelpCircle', 'Tag',
]

type EditState = {
  slug: string
  label: string
  profileLabel: string
  dbValue: string
  icon: string
  sortOrder: number
}

type AddState = {
  slug: string
  label: string
  profileLabel: string
  dbValue: string
  icon: string
  sortOrder: number
}

const EMPTY_ADD: AddState = {
  slug: '', label: '', profileLabel: '', dbValue: '', icon: 'Tag', sortOrder: 0,
}

export default function CategoriesClient({ categories }: { categories: CategoryRow[] }) {
  const [editing, setEditing] = useState<EditState | null>(null)
  const [adding, setAdding] = useState(false)
  const [addState, setAddState] = useState<AddState>(EMPTY_ADD)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const saveEdit = () => {
    if (!editing) return
    setError(null)
    startTransition(async () => {
      const result = await updateCategory(editing.slug, {
        label: editing.label,
        profileLabel: editing.profileLabel,
        dbValue: editing.dbValue,
        icon: editing.icon,
        sortOrder: editing.sortOrder,
      })
      if (!result.ok) { setError(result.error); return }
      setEditing(null)
    })
  }

  const toggleActive = (slug: string, current: boolean) => {
    setError(null)
    startTransition(async () => {
      const result = await updateCategory(slug, { active: !current })
      if (!result.ok) setError(result.error)
    })
  }

  const toggleSellsProducts = (slug: string, current: boolean) => {
    setError(null)
    startTransition(async () => {
      const result = await updateCategory(slug, { sellsProducts: !current })
      if (!result.ok) setError(result.error)
    })
  }

  const saveAdd = () => {
    setError(null)
    startTransition(async () => {
      const result = await addCategory({
        slug: addState.slug,
        label: addState.label,
        profileLabel: addState.profileLabel || addState.label,
        dbValue: addState.dbValue,
        icon: addState.icon,
        sortOrder: addState.sortOrder,
      })
      if (!result.ok) { setError(result.error); return }
      setAdding(false)
      setAddState(EMPTY_ADD)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vendor Categories</h1>
          <p className="mt-1 text-sm text-gray-500">
            Add or edit categories without a code rebuild. Active categories appear on the onboarding portal.
          </p>
        </div>
        <button data-opus-button="primary" data-opus-button-size="medium"
          onClick={() => { setAdding(true); setAddState(EMPTY_ADD); setError(null) }}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-700"
        >
          <Plus className="w-4 h-4" /> Add category
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Add form */}
      {adding && (
        <div className="border border-gray-200 rounded-xl p-5 bg-gray-50 space-y-4">
          <p className="text-sm font-semibold text-gray-700">New category</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Slug (unique id)" value={addState.slug} onChange={(v) => setAddState((s) => ({ ...s, slug: v }))} placeholder="e.g. photo-booth" />
            <Field label="Onboarding label" value={addState.label} onChange={(v) => setAddState((s) => ({ ...s, label: v }))} placeholder="e.g. Photo booth rental" />
            <Field label="Profile label" value={addState.profileLabel} onChange={(v) => setAddState((s) => ({ ...s, profileLabel: v }))} placeholder="e.g. Photo booth" />
            <Field label="DB value (display name)" value={addState.dbValue} onChange={(v) => setAddState((s) => ({ ...s, dbValue: v }))} placeholder="e.g. Photo Booths" />
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Icon name</label>
              <select
                value={addState.icon}
                onChange={(e) => setAddState((s) => ({ ...s, icon: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                {ICON_OPTIONS.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <Field label="Sort order" value={String(addState.sortOrder)} onChange={(v) => setAddState((s) => ({ ...s, sortOrder: parseInt(v) || 0 }))} placeholder="12" />
          </div>
          <div className="flex gap-2">
            <button data-opus-button="primary" data-opus-button-size="medium" onClick={saveAdd} disabled={isPending} className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
              Save
            </button>
            <button data-opus-button="control" onClick={() => { setAdding(false); setError(null) }} className="px-4 py-2 border border-gray-200 text-sm font-medium rounded-lg hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="opus-table w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['#', 'Slug', 'Onboarding label', 'Profile label', 'DB value', 'Icon', 'Products', 'Status', ''].map((h) => (
                <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {categories.map((cat) => {
              const isEditing = editing?.slug === cat.slug
              return (
                <tr key={cat.slug} className={cn('hover:bg-gray-50', !cat.active && 'opacity-50')}>
                  <td className="px-4 py-3 text-gray-400 tabular-nums">{cat.sort_order}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{cat.slug}</td>
                  <td className="px-4 py-3">
                    {isEditing
                      ? <input value={editing.label} onChange={(e) => setEditing((s) => s && ({ ...s, label: e.target.value }))} className="border border-gray-300 rounded px-2 py-1 text-sm w-full" />
                      : cat.label}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing
                      ? <input value={editing.profileLabel} onChange={(e) => setEditing((s) => s && ({ ...s, profileLabel: e.target.value }))} className="border border-gray-300 rounded px-2 py-1 text-sm w-full" />
                      : cat.profile_label}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {isEditing
                      ? <input value={editing.dbValue} onChange={(e) => setEditing((s) => s && ({ ...s, dbValue: e.target.value }))} className="border border-gray-300 rounded px-2 py-1 text-sm w-full" />
                      : cat.db_value}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {isEditing
                      ? <select value={editing.icon} onChange={(e) => setEditing((s) => s && ({ ...s, icon: e.target.value }))} className="border border-gray-300 rounded px-2 py-1 text-sm">
                          {ICON_OPTIONS.map((i) => <option key={i} value={i}>{i}</option>)}
                        </select>
                      : cat.icon}
                  </td>
                  <td className="px-4 py-3">
                    <button data-opus-button="control"
                      onClick={() => toggleSellsProducts(cat.slug, cat.sells_products)}
                      disabled={isPending}
                      title={cat.sells_products ? 'Sells products — click to disable' : 'Enable the Products tab for this category'}
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
                        cat.sells_products
                          ? 'bg-violet-50 text-violet-700 border-violet-200'
                          : 'bg-gray-50 text-gray-400 border-gray-200',
                      )}
                    >
                      {cat.sells_products ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      {cat.sells_products ? 'Yes' : 'No'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                      cat.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'
                    )}>
                      {cat.active ? 'Active' : 'Hidden'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      {isEditing ? (
                        <>
                          <button data-opus-button="control" onClick={saveEdit} disabled={isPending} title="Save" className="p-1 text-emerald-600 hover:text-emerald-800"><Check className="w-4 h-4" /></button>
                          <button data-opus-button="control" onClick={() => setEditing(null)} title="Cancel" className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                        </>
                      ) : (
                        <>
                          <button data-opus-button="control"
                            onClick={() => setEditing({ slug: cat.slug, label: cat.label, profileLabel: cat.profile_label, dbValue: cat.db_value, icon: cat.icon, sortOrder: cat.sort_order })}
                            title="Edit"
                            className="p-1 text-gray-400 hover:text-gray-700"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button data-opus-button="control"
                            onClick={() => toggleActive(cat.slug, cat.active)}
                            disabled={isPending}
                            title={cat.active ? 'Hide' : 'Show'}
                            className="p-1 text-gray-400 hover:text-gray-700"
                          >
                            {cat.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
      />
    </div>
  )
}
