'use client'

import { useEffect, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import type {
  VendorIconKey,
  VendorSearchContent,
  VendorSearchItem,
} from '@/lib/cms/vendor-search'
import { VENDOR_ICON_OPTIONS, getVendorIcon } from '@/lib/cms/vendor-search-icons'
import { cn } from '@/lib/utils'
import { useEditorActions } from '../EditorActionsContext'
import {
  discardVendorSearchDraft,
  publishVendorSearch,
  saveVendorSearchDraft,
} from './actions'

type Props = {
  initial: VendorSearchContent
  hasDraft: boolean
}

const HEADLINE_MAX = 60
const SUBHEAD_MAX = 200

export default function VendorSearchEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<VendorSearchContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [openItemId, setOpenItemId] = useState<string | null>(initial.items[0]?.id ?? null)
  const { bind, unbind } = useEditorActions()

  const setField = <K extends keyof VendorSearchContent>(key: K, value: VendorSearchContent[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const updateItem = (id: string, patch: Partial<VendorSearchItem>) =>
    setDraft((d) => ({
      ...d,
      items: d.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }))

  const removeItem = (id: string) =>
    setDraft((d) => ({ ...d, items: d.items.filter((it) => it.id !== id) }))

  const moveItem = (id: string, dir: -1 | 1) =>
    setDraft((d) => {
      const idx = d.items.findIndex((it) => it.id === id)
      const target = idx + dir
      if (idx < 0 || target < 0 || target >= d.items.length) return d
      const next = [...d.items]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...d, items: next }
    })

  const addItem = () => {
    const newId = `vendor-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setDraft((d) => ({
      ...d,
      items: [
        ...d.items,
        {
          id: newId,
          type: 'New Vendor Type',
          city: 'Dar es Salaam',
          city_short: 'Dar',
          detail1_icon: 'users' as VendorIconKey,
          detail1_label: '100 Guests',
          detail1_meta: 'Capacity',
          detail2_icon: 'calendar' as VendorIconKey,
          detail2_label: 'TBD',
          detail2_meta: 'Availability',
          perk: 'A great perk',
          budget: 'TZS 0',
          count: '0 results',
          cta: 'Find Vendors',
        },
      ],
    }))
    setOpenItemId(newId)
  }

  const handleSaveDraft = () =>
    startTransition(async () => {
      await saveVendorSearchDraft(draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })

  const handlePublish = () =>
    startTransition(async () => {
      await saveVendorSearchDraft(draft)
      await publishVendorSearch()
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })

  const handleDiscard = () =>
    startTransition(async () => {
      await discardVendorSearchDraft()
      setDraft(initial)
      setHasDraft(false)
      setMessage('Draft discarded.')
    })

  useEffect(() => {
    bind({
      hasDraft,
      pending,
      message,
      onSaveDraft: handleSaveDraft,
      onPublish: handlePublish,
      onDiscard: handleDiscard,
    })
    return () => unbind()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDraft, pending, message, draft])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <div className="space-y-4">
          {/* Section copy */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] space-y-4">
            <h3 className="text-[15px] font-semibold text-gray-900">Section copy</h3>

            <FieldGroup label="Headline">
              <Field
                label="Line 1"
                hint={<CharCount value={draft.headline_line_1} max={HEADLINE_MAX} />}
              >
                <input
                  type="text"
                  value={draft.headline_line_1}
                  onChange={(e) => setField('headline_line_1', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field
                label="Line 2"
                hint={<CharCount value={draft.headline_line_2} max={HEADLINE_MAX} />}
              >
                <input
                  type="text"
                  value={draft.headline_line_2}
                  onChange={(e) => setField('headline_line_2', e.target.value)}
                  className={inputCls}
                />
              </Field>
            </FieldGroup>

            <Field
              label="Subheadline"
              hint={<CharCount value={draft.subheadline} max={SUBHEAD_MAX} />}
            >
              <textarea
                value={draft.subheadline}
                onChange={(e) => setField('subheadline', e.target.value)}
                rows={3}
                className={inputCls}
              />
            </Field>

            <FieldGroup label="Card chrome">
              <div className="grid grid-cols-2 gap-3">
                <Field label='"Looking for…" label'>
                  <input
                    type="text"
                    value={draft.looking_label}
                    onChange={(e) => setField('looking_label', e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Count suffix">
                  <input
                    type="text"
                    value={draft.count_suffix}
                    onChange={(e) => setField('count_suffix', e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Budget label">
                  <input
                    type="text"
                    value={draft.budget_label}
                    onChange={(e) => setField('budget_label', e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Currency code">
                  <input
                    type="text"
                    value={draft.budget_currency}
                    onChange={(e) => setField('budget_currency', e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Perk badge text">
                  <input
                    type="text"
                    value={draft.perk_badge}
                    onChange={(e) => setField('perk_badge', e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Verified badge">
                  <input
                    type="text"
                    value={draft.verified_badge}
                    onChange={(e) => setField('verified_badge', e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Verified row label">
                  <input
                    type="text"
                    value={draft.verified_label}
                    onChange={(e) => setField('verified_label', e.target.value)}
                    className={cn(inputCls, 'col-span-2')}
                  />
                </Field>
              </div>
            </FieldGroup>
          </div>

          {/* Vendor items */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] space-y-3">
            <h3 className="text-[15px] font-semibold text-gray-900">
              Vendor examples{' '}
              <span className="text-gray-400 font-normal">({draft.items.length})</span>
            </h3>

            <div className="space-y-2">
              {draft.items.map((item, i) => (
                <ItemAccordion
                  key={item.id}
                  item={item}
                  index={i}
                  total={draft.items.length}
                  isOpen={openItemId === item.id}
                  onToggle={() =>
                    setOpenItemId((cur) => (cur === item.id ? null : item.id))
                  }
                  onChange={(patch) => updateItem(item.id, patch)}
                  onRemove={() => removeItem(item.id)}
                  onMoveUp={() => moveItem(item.id, -1)}
                  onMoveDown={() => moveItem(item.id, 1)}
                />
              ))}
            </div>

            <button data-opus-button="control"
              type="button"
              onClick={addItem}
              className="w-full flex items-center justify-center gap-2 py-2.5 mt-2 border-2 border-dashed border-gray-200 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-900 hover:border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add vendor example
            </button>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] font-semibold text-gray-900">Live preview</h3>
            <span className="text-xs text-gray-400">Approximate</span>
          </div>
          <VendorSearchPreview content={draft} />
        </div>
      </div>
    </div>
  )
}

function ItemAccordion({
  item,
  index,
  total,
  isOpen,
  onToggle,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  item: VendorSearchItem
  index: number
  total: number
  isOpen: boolean
  onToggle: () => void
  onChange: (patch: Partial<VendorSearchItem>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50/50">
        <button data-opus-button="control"
          type="button"
          onClick={onToggle}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
          )}
          <span className="text-sm font-semibold text-gray-900 truncate">{item.type}</span>
          <span className="text-xs text-gray-400 truncate">· {item.city}</span>
        </button>
        <div className="flex items-center gap-0.5 shrink-0">
          <button data-opus-button="control"
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            aria-label="Move up"
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button data-opus-button="control"
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            aria-label="Move down"
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button data-opus-button="control"
            type="button"
            onClick={onRemove}
            aria-label="Remove"
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="p-4 space-y-3 border-t border-gray-100">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vendor type">
              <input
                type="text"
                value={item.type}
                onChange={(e) => onChange({ type: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="City">
              <input
                type="text"
                value={item.city}
                onChange={(e) => onChange({ city: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="City — short (mobile)">
              <input
                type="text"
                value={item.city_short ?? ''}
                onChange={(e) => onChange({ city_short: e.target.value })}
                className={inputCls}
                placeholder="optional"
              />
            </Field>
            <Field label="CTA button text">
              <input
                type="text"
                value={item.cta}
                onChange={(e) => onChange({ cta: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>

          <FieldGroup label="Detail row 1">
            <Field label="Icon">
              <IconPicker
                value={item.detail1_icon}
                onChange={(detail1_icon) => onChange({ detail1_icon })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Label">
                <input
                  type="text"
                  value={item.detail1_label}
                  onChange={(e) => onChange({ detail1_label: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="Meta (badge)">
                <input
                  type="text"
                  value={item.detail1_meta}
                  onChange={(e) => onChange({ detail1_meta: e.target.value })}
                  className={inputCls}
                />
              </Field>
            </div>
          </FieldGroup>

          <FieldGroup label="Detail row 2">
            <Field label="Icon">
              <IconPicker
                value={item.detail2_icon}
                onChange={(detail2_icon) => onChange({ detail2_icon })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Label">
                <input
                  type="text"
                  value={item.detail2_label}
                  onChange={(e) => onChange({ detail2_label: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="Meta (badge)">
                <input
                  type="text"
                  value={item.detail2_meta}
                  onChange={(e) => onChange({ detail2_meta: e.target.value })}
                  className={inputCls}
                />
              </Field>
            </div>
          </FieldGroup>

          <Field label="Perk">
            <input
              type="text"
              value={item.perk}
              onChange={(e) => onChange({ perk: e.target.value })}
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Budget">
              <input
                type="text"
                value={item.budget}
                onChange={(e) => onChange({ budget: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Result count">
              <input
                type="text"
                value={item.count}
                onChange={(e) => onChange({ count: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>
        </div>
      )}
    </div>
  )
}

function IconPicker({
  value,
  onChange,
}: {
  value: VendorIconKey
  onChange: (v: VendorIconKey) => void
}) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {VENDOR_ICON_OPTIONS.map((opt) => {
        const Icon = opt.icon
        const isActive = opt.key === value
        return (
          <button data-opus-button="control"
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            title={opt.label}
            aria-label={opt.label}
            className={cn(
              'flex items-center justify-center aspect-square rounded-lg border transition-colors',
              isActive
                ? 'border-[#C9A0DC] bg-[#F0DFF6] text-[#7E5896]'
                : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'
            )}
          >
            <Icon className="w-4 h-4 stroke-[1.5]" />
          </button>
        )
      })}
    </div>
  )
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="border border-gray-200 rounded-lg p-3 pt-2 space-y-3">
      <legend className="px-1 text-[11px] font-bold uppercase tracking-wider text-gray-500">
        {label}
      </legend>
      {children}
    </fieldset>
  )
}

function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: React.ReactNode
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs font-semibold text-gray-600">{label}</span>
        {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
      </div>
      {children}
    </label>
  )
}

function CharCount({ value, max }: { value: string; max: number }) {
  const len = (value ?? '').length
  const over = len > max
  const near = !over && len > max * 0.85
  return (
    <span
      className={cn(
        'tabular-nums font-medium',
        over ? 'text-red-500' : near ? 'text-amber-600' : 'text-gray-400'
      )}
    >
      {len}/{max}
    </span>
  )
}

const inputCls =
  'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] focus:border-transparent transition-all'

function VendorSearchPreview({ content }: { content: VendorSearchContent }) {
  const [activeIdx, setActiveIdx] = useState(0)
  useEffect(() => {
    if (content.items.length === 0) return
    const id = setInterval(() => setActiveIdx((i) => (i + 1) % content.items.length), 4500)
    return () => clearInterval(id)
  }, [content.items.length])

  if (content.items.length === 0) {
    return (
      <div className="text-xs text-gray-400 py-8 text-center">
        Add at least one vendor example to preview the card.
      </div>
    )
  }

  const v = content.items[Math.min(activeIdx, content.items.length - 1)]
  const D1 = getVendorIcon(v.detail1_icon)
  const D2 = getVendorIcon(v.detail2_icon)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tighter leading-[0.95] text-[#1A1A1A]">
          <span className="block">{content.headline_line_1}</span>
          <span className="block">{content.headline_line_2}</span>
        </h2>
        <p className="text-xs text-gray-600 mt-2 leading-relaxed">{content.subheadline}</p>
      </div>

      <div className="rounded-2xl border border-gray-100 p-4 space-y-3 bg-white shadow-sm">
        <div className="border border-gray-200 rounded-xl px-3 py-2 flex justify-between items-center gap-2">
          <div className="min-w-0">
            <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide whitespace-nowrap">
              {content.looking_label}
            </p>
            <p className="text-base font-black text-[#1A1A1A]">{v.type}</p>
          </div>
          <span className="text-[10px] font-bold bg-[#C9A0DC] text-[#1A1A1A] rounded-full px-2 py-1 shrink-0">
            {v.city}
          </span>
        </div>

        <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 text-xs">
          <Row icon={D1} label={v.detail1_label} meta={v.detail1_meta} />
          <Row icon={D2} label={v.detail2_label} meta={v.detail2_meta} />
          <Row label={v.perk} meta={content.perk_badge} />
          <Row label={content.verified_label} meta={content.verified_badge} />
        </div>

        <div className="border border-gray-200 rounded-xl px-3 py-2 flex justify-between items-center">
          <div>
            <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide">
              {content.budget_label}
            </p>
            <p className="text-sm font-black text-[#1A1A1A]">{v.budget}</p>
          </div>
          <span className="text-[10px] font-bold bg-[#C9A0DC] text-[#1A1A1A] rounded-full px-2 py-1">
            {content.budget_currency}
          </span>
        </div>

        <p className="text-[11px] text-gray-400 px-1">
          {v.count} {content.count_suffix}
        </p>

        <button data-opus-button="primary" data-opus-button-size="small" className="w-full bg-[#1A1A1A] text-white text-xs font-bold py-2.5 rounded-full">
          {v.cta}
        </button>

        <div className="flex justify-center gap-1.5 pt-1">
          {content.items.map((it, i) => (
            <button data-opus-button="primary" data-opus-button-size="medium"
              key={it.id}
              onClick={() => setActiveIdx(i)}
              className={cn(
                'rounded-full transition-all',
                i === activeIdx ? 'w-4 h-1.5 bg-[#1A1A1A]' : 'w-1.5 h-1.5 bg-gray-300'
              )}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function Row({
  icon: Icon,
  label,
  meta,
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  meta: string
}) {
  return (
    <div className="flex justify-between items-center px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        {Icon && <Icon className="w-3 h-3 text-gray-400 shrink-0" />}
        <span className="text-[#1A1A1A] truncate">{label}</span>
      </div>
      <span className="text-[10px] font-bold bg-[#C9A0DC] text-[#1A1A1A] rounded-full px-2 py-1 shrink-0">
        {meta}
      </span>
    </div>
  )
}
