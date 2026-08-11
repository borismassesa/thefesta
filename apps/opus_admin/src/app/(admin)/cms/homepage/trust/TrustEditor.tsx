'use client'

import { useEffect, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { TrustContent, TrustIconKey, TrustItem } from '@/lib/cms/trust'
import { TRUST_ICON_OPTIONS, getTrustIcon } from '@/lib/cms/trust-icons'
import { cn } from '@/lib/utils'
import { useEditorActions } from '../EditorActionsContext'
import { discardTrustDraft, publishTrust, saveTrustDraft } from './actions'

type Props = {
  initial: TrustContent
  hasDraft: boolean
}

const TITLE_MAX = 60
const DESCRIPTION_MAX = 200

export default function TrustEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<TrustContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const { bind, unbind } = useEditorActions()

  const updateItem = (id: string, patch: Partial<TrustItem>) =>
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

  const addItem = () =>
    setDraft((d) => ({
      ...d,
      items: [
        ...d.items,
        {
          id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          icon: 'shield-check' as TrustIconKey,
          title: 'New trust point',
          description: 'Describe why couples can trust you.',
        },
      ],
    }))

  const handleSaveDraft = () =>
    startTransition(async () => {
      await saveTrustDraft(draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })

  const handlePublish = () =>
    startTransition(async () => {
      await saveTrustDraft(draft)
      await publishTrust()
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })

  const handleDiscard = () =>
    startTransition(async () => {
      await discardTrustDraft()
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
        <div className="space-y-3">
          {draft.items.map((item, i) => (
            <ItemEditor
              key={item.id}
              item={item}
              index={i}
              total={draft.items.length}
              onChange={(patch) => updateItem(item.id, patch)}
              onRemove={() => removeItem(item.id)}
              onMoveUp={() => moveItem(item.id, -1)}
              onMoveDown={() => moveItem(item.id, 1)}
            />
          ))}
          <button data-opus-button="control"
            type="button"
            onClick={addItem}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-medium text-gray-500 hover:text-gray-900 hover:border-gray-300 hover:bg-gray-50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add trust point
          </button>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] font-semibold text-gray-900">Live preview</h3>
            <span className="text-xs text-gray-400">Approximate</span>
          </div>
          <TrustPreview content={draft} />
        </div>
      </div>
    </div>
  )
}

function ItemEditor({
  item,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  item: TrustItem
  index: number
  total: number
  onChange: (patch: Partial<TrustItem>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
          Trust point {index + 1}
        </span>
        <div className="flex items-center gap-1">
          <button data-opus-button="control"
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            aria-label="Move up"
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-md disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <button data-opus-button="control"
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            aria-label="Move down"
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-md disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
          <button data-opus-button="control"
            type="button"
            onClick={onRemove}
            aria-label="Remove"
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <Field label="Icon">
        <IconPicker value={item.icon} onChange={(icon) => onChange({ icon })} />
      </Field>

      <Field label="Title" hint={<CharCount value={item.title} max={TITLE_MAX} />}>
        <input
          type="text"
          value={item.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className={inputCls}
        />
      </Field>

      <Field label="Description" hint={<CharCount value={item.description} max={DESCRIPTION_MAX} />}>
        <textarea
          value={item.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={2}
          className={inputCls}
        />
      </Field>
    </div>
  )
}

function IconPicker({ value, onChange }: { value: TrustIconKey; onChange: (v: TrustIconKey) => void }) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {TRUST_ICON_OPTIONS.map((opt) => {
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
            <Icon className="w-5 h-5 stroke-[1.5]" />
          </button>
        )
      })}
    </div>
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

function TrustPreview({ content }: { content: TrustContent }) {
  return (
    <div className="space-y-5">
      {content.items.map((item) => {
        const Icon = getTrustIcon(item.icon)
        return (
          <div key={item.id} className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center shrink-0">
              <Icon className="text-[#1A1A1A] w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="font-bold text-sm text-[#1A1A1A] mb-1">{item.title}</h4>
              <p className="text-xs text-gray-600 leading-relaxed">{item.description}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
