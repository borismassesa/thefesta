'use client'

// "Request types" — owner/admin author the catalog that everyone else requests
// from. Previously this was a hardcoded array plus a CHECK constraint, so a new
// type needed a code change and a migration.
//
// The field editor writes the same ApprovalField[] schema the request form
// already renders, so an admin-created type gets the identical form engine as
// the built-ins. There is no second rendering path to keep in step.

import { useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  FilePenLine,
  ListChecks,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
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

const STATUS_FILTERS = ['All', 'Active', 'Retired'] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

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
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('All')

  const activeCount = categories.filter((c) => c.active).length
  const retiredCount = categories.length - activeCount
  const totalFields = categories.reduce((sum, c) => sum + c.fields.length, 0)
  const groupCount = new Set(categories.map((c) => c.group)).size
  const query = search.trim().toLowerCase()
  const visibleCategories = categories.filter((c) => {
    const groupLabel = CATEGORY_GROUPS.find((g) => g.key === c.group)?.label ?? c.group
    const text =
      !query ||
      c.label.toLowerCase().includes(query) ||
      c.blurb.toLowerCase().includes(query) ||
      c.key.toLowerCase().includes(query) ||
      groupLabel.toLowerCase().includes(query)
    if (!text) return false
    if (status === 'Active') return c.active
    if (status === 'Retired') return !c.active
    return true
  })
  const groupedCategories = CATEGORY_GROUPS.map((group) => ({
    group,
    items: visibleCategories.filter((c) => c.group === group.key),
  })).filter(({ items }) => items.length > 0)

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
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-100 bg-white px-4 py-4 shadow-[0_8px_28px_-24px_rgba(15,23,42,0.45)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F8EDFF] text-[#5B2D8E]">
              <ListChecks className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className="text-base font-semibold text-gray-950">Request type catalog</h2>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                  {activeCount} active
                </span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
                  Create menu
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:w-[32rem]">
            <RequestTypeStat label="Retired" value={retiredCount} accent="#6B7280" />
            <RequestTypeStat label="Fields" value={totalFields} accent="#1F5D8C" />
            <RequestTypeStat label="Departments" value={groupCount} accent="#8A5A09" />
            <RequestTypeStat label="Total" value={categories.length} accent="#5B2D8E" />
          </div>

          <button data-opus-button="neutral" data-opus-button-size="small"
            type="button"
            onClick={() => { setEditing({ draft: blankDraft(), isNew: true }); setError(null) }}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-bold uppercase tracking-wider text-white shadow-[0_12px_24px_-16px_rgba(5,150,105,0.9)] transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 xl:w-auto"
          >
            <Plus className="h-4 w-4" />
            New request type
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </p>
      )}

      {categories.length === 0 ? (
        <EmptyState title="No request types yet" hint="Create one and it appears under Create." />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search managed request types"
                placeholder="Search by type, department, key, or description..."
                className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
              />
            </div>
            <div className="inline-flex shrink-0 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
              {STATUS_FILTERS.map((option) => (
                <button data-opus-button="control"
                  key={option}
                  type="button"
                  onClick={() => setStatus(option)}
                  aria-pressed={status === option}
                  className={cn(
                    'rounded-md px-3 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A0DC]',
                    status === option
                      ? 'bg-white text-[#5B2D8E] shadow-sm'
                      : 'text-gray-500 hover:text-gray-800',
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {visibleCategories.length === 0 ? (
            <EmptyState
              title={query ? `No request types match "${search.trim()}".` : 'No request types match this filter.'}
              hint="Adjust the search or status filter to see more."
            />
          ) : (
            <div className="space-y-5">
              {groupedCategories.map(({ group, items }) => (
                <section key={group.key} className="space-y-2">
                  <div className="flex items-center gap-3 px-1">
                    <span
                      className="h-7 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: group.accent }}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900">{group.label}</h3>
                      <p className="truncate text-xs text-gray-500">{group.blurb}</p>
                    </div>
                    <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
                      {items.length}
                    </span>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
                    {items.map((c) => (
                      <RequestTypeRow
                        key={c.key}
                        category={c}
                        busy={busy}
                        onEdit={() => { setEditing({ draft: toDraft(c), isNew: false }); setError(null) }}
                        onToggle={() => toggleActive(c)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RequestTypeStat({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent: string
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold leading-6" style={{ color: accent }}>
        {value}
      </p>
    </div>
  )
}

function RequestTypeRow({
  category,
  busy,
  onEdit,
  onToggle,
}: {
  category: ApprovalCategory
  busy: boolean
  onEdit: () => void
  onToggle: () => void
}) {
  const Icon = ICONS[category.iconKey]
  const group = CATEGORY_GROUPS.find((g) => g.key === category.group)

  return (
    <div
      className={cn(
        'grid gap-3 border-b border-gray-100 px-4 py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.55fr)_auto] md:items-center',
        category.active ? 'bg-white' : 'bg-gray-50/70',
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-black/5"
          style={{ backgroundColor: category.tint, color: category.accent }}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={cn(
                'text-sm font-semibold leading-5',
                category.active ? 'text-gray-950' : 'text-gray-500',
              )}
            >
              {category.label}
            </p>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                category.active
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-gray-200 text-gray-600',
              )}
            >
              {category.active ? 'Active' : 'Retired'}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">
            {category.blurb || 'No description set.'}
          </p>
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2 md:justify-end">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold"
          style={{
            backgroundColor: group?.tint ?? '#F3F4F6',
            color: group?.accent ?? '#4B5563',
          }}
        >
          {group?.label ?? category.group}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-600">
          <ListChecks className="h-3 w-3" />
          {category.fields.length} field{category.fields.length === 1 ? '' : 's'}
        </span>
        <code className="max-w-full truncate rounded-md bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-500">
          {category.key}
        </code>
      </div>

      <div className="flex shrink-0 items-center gap-1 md:justify-end">
        <button data-opus-button="neutral" data-opus-button-size="small"
          type="button"
          disabled={busy}
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-[#5B2D8E] transition hover:bg-[#F8EDFF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A0DC] disabled:opacity-50"
        >
          <FilePenLine className="h-3.5 w-3.5" />
          Edit
        </button>
        <button data-opus-button="danger" data-opus-button-size="small"
          type="button"
          disabled={busy}
          onClick={onToggle}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 disabled:opacity-50',
            category.active
              ? 'text-gray-500 hover:bg-rose-50 hover:text-rose-700 focus-visible:ring-rose-200'
              : 'text-gray-500 hover:bg-emerald-50 hover:text-emerald-700 focus-visible:ring-emerald-200',
          )}
        >
          {category.active ? <Trash2 className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
          {category.active ? 'Retire' : 'Restore'}
        </button>
      </div>
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
          <button data-opus-button="control" type="button" onClick={onCancel} disabled={busy}
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button data-opus-button="control" type="button" onClick={onSave} disabled={busy}
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
                  <button data-opus-button="control" key={k} type="button" onClick={() => set({ iconKey: k })}
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
                <button data-opus-button="control" type="button" onClick={() => move(i, -1)} aria-label="Move up"
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-700">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button data-opus-button="control" type="button" onClick={() => move(i, 1)} aria-label="Move down"
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-700">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button data-opus-button="control" type="button" aria-label={`Remove ${f.label || 'field'}`}
                  onClick={() => set({ fields: draft.fields.filter((_, idx) => idx !== i) })}
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-50 hover:text-rose-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 p-3">
          <button data-opus-button="neutral" data-opus-button-size="small"
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
