'use client'

// "Request types" — owner/admin author the catalog that everyone else requests
// from. Previously this was a hardcoded array plus a CHECK constraint, so a new
// type needed a code change and a migration.
//
// The field editor writes the same ApprovalField[] schema the request form
// already renders, so an admin-created type gets the identical form engine as
// the built-ins. There is no second rendering path to keep in step.

import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CATEGORY_GROUPS } from './data'
import {
  createApprovalCategory,
  setApprovalCategoryActive,
  updateApprovalCategory,
  type CategoryInput,
} from './category-actions'
import type { ApprovalCategory, ApprovalField, ApprovalFieldKind } from './types'
import { EmptyState, ICONS } from './ui'

const ICON_KEYS: ApprovalCategory['iconKey'][] = [
  'Plane', 'PackageOpen', 'FileCheck2', 'FileSignature',
  'Wallet', 'Car', 'UserPlus', 'ShoppingCart', 'FileText',
]

const FIELD_KINDS: { value: ApprovalFieldKind; label: string }[] = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'date', label: 'Date' },
  { value: 'date-range', label: 'Date range' },
  { value: 'amount', label: 'Money (TZS)' },
  { value: 'number', label: 'Number' },
  { value: 'list', label: 'List of lines' },
]

// A new type starts with the two fields every request needs. Without them the
// form renders an empty shell and the first person to use it has nowhere to
// say what they want or why.
const STARTER_FIELDS: ApprovalField[] = [
  { id: 'subject', label: 'Approval Subject', kind: 'text', required: true,
    placeholder: 'Short summary of what you need approved' },
  { id: 'description', label: 'Description', kind: 'textarea', required: true,
    placeholder: 'Provide context, business justification and any links…' },
]

function blankDraft(): CategoryInput {
  return {
    label: '', blurb: '', group: 'workplace',
    accent: '#5B2D8E', tint: '#EFE3F8', iconKey: 'FileCheck2',
    fields: STARTER_FIELDS.map((f) => ({ ...f })),
  }
}

function toDraft(c: ApprovalCategory): CategoryInput {
  return {
    key: c.key, label: c.label, blurb: c.blurb, group: c.group,
    accent: c.accent, tint: c.tint, iconKey: c.iconKey,
    fields: c.fields.map((f) => ({ ...f })), sortOrder: c.sortOrder,
  }
}

export default function RequestTypesView({
  categories,
  onChanged,
}: {
  // All types including retired ones — this is the management view.
  categories: ApprovalCategory[]
  onChanged: (next: ApprovalCategory[]) => void
}) {
  const [editing, setEditing] = useState<{ draft: CategoryInput; isNew: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!editing) return
    setBusy(true)
    setError(null)
    const res = editing.isNew
      ? await createApprovalCategory(editing.draft)
      : await updateApprovalCategory(editing.draft.key!, editing.draft)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onChanged(res.categories)
    setEditing(null)
  }

  async function toggleActive(c: ApprovalCategory) {
    setBusy(true)
    const res = await setApprovalCategoryActive(c.key, !c.active)
    setBusy(false)
    if (!res.ok) setError(res.error)
    else onChanged(res.categories)
  }

  if (editing) {
    return (
      <Editor
        draft={editing.draft}
        isNew={editing.isNew}
        busy={busy}
        error={error}
        onChange={(d) => setEditing({ ...editing, draft: d })}
        onCancel={() => { setEditing(null); setError(null) }}
        onSave={save}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <p className="text-xs text-gray-600">
          Types you create here appear in <span className="font-semibold">Create</span> for
          everyone. Retiring one stops it being offered without affecting requests already raised
          against it.
        </p>
        <button
          type="button"
          onClick={() => { setEditing({ draft: blankDraft(), isNew: true }); setError(null) }}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-emerald-700"
        >
          <Plus className="h-3.5 w-3.5" />
          New request type
        </button>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </p>
      )}

      {categories.length === 0 ? (
        <EmptyState title="No request types yet" hint="Create one and it appears under Create." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          {categories.map((c) => {
            const Icon = ICONS[c.iconKey]
            return (
              <div
                key={c.key}
                className={cn(
                  'flex items-center gap-3 border-b border-gray-100 px-5 py-3 last:border-b-0',
                  !c.active && 'bg-gray-50/60',
                )}
              >
                <span
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: c.tint, color: c.accent }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-sm font-semibold', c.active ? 'text-gray-900' : 'text-gray-500')}>
                    {c.label}
                    {!c.active && (
                      <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-600">
                        Retired
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {CATEGORY_GROUPS.find((g) => g.key === c.group)?.label ?? c.group} ·{' '}
                    {c.fields.length} field{c.fields.length === 1 ? '' : 's'} · {c.key}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { setEditing({ draft: toDraft(c), isNew: false }); setError(null) }}
                  className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-[#5B2D8E] hover:bg-[#F8EDFF] disabled:opacity-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => toggleActive(c)}
                  className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50"
                >
                  {c.active ? <Trash2 className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  {c.active ? 'Retire' : 'Restore'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ----- Editor ---------------------------------------------------------------

const INPUT =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]'

function Editor({
  draft, isNew, busy, error, onChange, onCancel, onSave,
}: {
  draft: CategoryInput
  isNew: boolean
  busy: boolean
  error: string | null
  onChange: (d: CategoryInput) => void
  onCancel: () => void
  onSave: () => void
}) {
  const set = (patch: Partial<CategoryInput>) => onChange({ ...draft, ...patch })
  const setField = (i: number, patch: Partial<ApprovalField>) =>
    set({ fields: draft.fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) })
  const move = (i: number, by: number) => {
    const next = [...draft.fields]
    const j = i + by
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    set({ fields: next })
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-gray-100 bg-white/95 px-4 py-3 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] backdrop-blur">
        <p className="text-sm font-semibold text-gray-900">
          {isNew ? 'New request type' : `Editing ${draft.label || draft.key}`}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onCancel} disabled={busy}
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={onSave} disabled={busy}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {busy ? 'Saving…' : isNew ? 'Create type' : 'Save changes'}
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </p>
      )}

      <section className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-gray-700">Name</span>
            <input className={INPUT} value={draft.label} placeholder="e.g. Petty Cash"
              onChange={(e) => set({ label: e.target.value })} />
            {isNew && (
              <span className="mt-1 block text-[11px] text-gray-500">
                The key is derived from this and cannot be changed later.
              </span>
            )}
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-gray-700">Section</span>
            <select className={INPUT} value={draft.group} onChange={(e) => set({ group: e.target.value })}>
              {CATEGORY_GROUPS.map((g) => (
                <option key={g.key} value={g.key}>{g.label}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-gray-700">Description</span>
          <input className={INPUT} value={draft.blurb} placeholder="One line, shown on the card"
            onChange={(e) => set({ blurb: e.target.value })} />
        </label>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto]">
          <div>
            <span className="mb-1.5 block text-xs font-semibold text-gray-700">Icon</span>
            <div className="flex flex-wrap gap-1.5">
              {ICON_KEYS.map((k) => {
                const Icon = ICONS[k]
                const on = draft.iconKey === k
                return (
                  <button key={k} type="button" onClick={() => set({ iconKey: k })}
                    aria-label={k} aria-pressed={on}
                    className={cn('inline-flex h-9 w-9 items-center justify-center rounded-lg border transition',
                      on ? 'border-[#7E5896] ring-2 ring-[#C9A0DC]' : 'border-gray-200 hover:border-gray-300')}
                    style={on ? { backgroundColor: draft.tint, color: draft.accent } : undefined}>
                    <Icon className="h-4 w-4" />
                  </button>
                )
              })}
            </div>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-gray-700">Icon colour</span>
            <input type="color" value={draft.accent} onChange={(e) => set({ accent: e.target.value })}
              className="h-9 w-16 cursor-pointer rounded border border-gray-200" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-gray-700">Background</span>
            <input type="color" value={draft.tint} onChange={(e) => set({ tint: e.target.value })}
              className="h-9 w-16 cursor-pointer rounded border border-gray-200" />
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Form fields</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            What the requester fills in. Order here is the order on the form.
          </p>
        </div>
        <div className="divide-y divide-gray-50">
          {draft.fields.map((f, i) => (
            <div key={i} className="grid gap-2 px-5 py-3 lg:grid-cols-[minmax(0,1.3fr)_140px_minmax(0,1.3fr)_auto_auto]">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-gray-500">Label</span>
                <input className={INPUT} value={f.label}
                  onChange={(e) => {
                    const label = e.target.value
                    // Derive the id from the label only while it is untouched,
                    // so renaming a field later never silently orphans values
                    // already stored under the old id.
                    const derived = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
                    setField(i, { label, ...(f.id === '' ? { id: derived } : {}) })
                  }} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-gray-500">Type</span>
                <select className={INPUT} value={f.kind}
                  onChange={(e) => setField(i, { kind: e.target.value as ApprovalFieldKind })}>
                  {FIELD_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-gray-500">Hint text</span>
                <input className={INPUT} value={f.placeholder ?? ''} placeholder="Optional"
                  onChange={(e) => setField(i, { placeholder: e.target.value })} />
              </label>
              <label className="flex items-end gap-1.5 pb-2 text-xs font-medium text-gray-700">
                <input type="checkbox" checked={f.required === true}
                  onChange={(e) => setField(i, { required: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300" />
                Required
              </label>
              <div className="flex items-end gap-1 pb-1">
                <button type="button" onClick={() => move(i, -1)} aria-label="Move up"
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-700">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => move(i, 1)} aria-label="Move down"
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-700">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label={`Remove ${f.label || 'field'}`}
                  onClick={() => set({ fields: draft.fields.filter((_, idx) => idx !== i) })}
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-50 hover:text-rose-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 p-3">
          <button
            type="button"
            onClick={() => set({ fields: [...draft.fields, { id: '', label: '', kind: 'text' }] })}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-semibold text-[#5B2D8E] hover:border-[#C9A0DC] hover:bg-[#F8EDFF]"
          >
            <Plus className="h-3.5 w-3.5" />
            Add field
          </button>
        </div>
      </section>
    </div>
  )
}
