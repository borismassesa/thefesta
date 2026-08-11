'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  ChevronsDownUp,
  ChevronsUpDown,
  Gem,
  Heart,
  MessageCircle,
  Palette,
  Plus,
  ShieldCheck,
  Sparkles,
  Star,
  Wand2,
  type LucideIcon,
} from 'lucide-react'
import {
  PROMISE_ICON_KEYS,
  type OpusPassPromiseItem,
  type OpusPassPromisesContent,
  type PromiseIconKey,
} from '@/lib/cms/opus-pass-promises'
import { CollapsibleCard } from '@/components/cms/CollapsibleCard'
import { BilingualField } from '@/components/cms/BilingualField'
import { LOCALES, LOCALE_LABELS, resolveLocalized, type Locale } from '@/lib/cms/localized'
import { cn } from '@/lib/utils'
import { useEditorActions } from '../EditorActionsContext'

const ICON_MAP: Record<PromiseIconKey, LucideIcon> = {
  sparkles: Sparkles,
  palette: Palette,
  wand2: Wand2,
  'message-circle': MessageCircle,
  heart: Heart,
  'shield-check': ShieldCheck,
  star: Star,
  gem: Gem,
}
import {
  discardOpusPassPromisesDraft,
  publishOpusPassPromises,
  saveOpusPassPromisesDraft,
} from './actions'

type Props = {
  initial: OpusPassPromisesContent
  hasDraft: boolean
}

const inputCls =
  'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] focus:border-transparent transition-all'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</span>
      {children}
    </label>
  )
}

function randomId(): string {
  return `promise-${Math.random().toString(36).slice(2, 9)}`
}

export default function PromisesEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<OpusPassPromisesContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initial))
  const isDirty = JSON.stringify(draft) !== savedSnapshot
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewLocale, setPreviewLocale] = useState<Locale>('en')
  const { bind, unbind } = useEditorActions()

  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([0, 1, 2, 3]))
  const toggleExpanded = (idx: number) =>
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  const expandAll = () => setExpanded(new Set(draft.items.map((_, i) => i)))
  const collapseAll = () => setExpanded(new Set())

  const setItem = (idx: number, patch: Partial<OpusPassPromiseItem>) =>
    setDraft((d) => ({
      ...d,
      items: d.items.map((item, i) => (i === idx ? { ...item, ...patch } : item)),
    }))

  const addItem = () =>
    setDraft((d) => ({
      ...d,
      items: [
        ...d.items,
        { id: randomId(), icon: 'sparkles' as PromiseIconKey, title: '', description: '' },
      ],
    }))

  const removeItem = (idx: number) =>
    setDraft((d) => ({ ...d, items: d.items.filter((_, i) => i !== idx) }))

  const moveItem = (idx: number, delta: number) =>
    setDraft((d) => {
      const next = [...d.items]
      const target = idx + delta
      if (target < 0 || target >= next.length) return d
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...d, items: next }
    })

  const runAction = (job: () => Promise<void>) =>
    startTransition(async () => {
      setError(null)
      try {
        await job()
      } catch (err) {
        setError(`That didn't go through: ${err instanceof Error ? err.message : String(err)}`)
        setMessage(null)
      }
    })

  const handleSaveDraft = () =>
    runAction(async () => {
      await saveOpusPassPromisesDraft(draft)
      setHasDraft(true)
      setSavedSnapshot(JSON.stringify(draft))
      setMessage('Draft saved.')
    })

  const handlePublish = () =>
    runAction(async () => {
      await saveOpusPassPromisesDraft(draft)
      await publishOpusPassPromises()
      setHasDraft(false)
      setSavedSnapshot(JSON.stringify(draft))
      setMessage('Published — changes are live.')
    })

  const handleDiscard = () =>
    runAction(async () => {
      await discardOpusPassPromisesDraft()
      setDraft(initial)
      setHasDraft(false)
      setSavedSnapshot(JSON.stringify(initial))
      setMessage('Draft discarded.')
    })

  useEffect(() => {
    bind({
      hasDraft,
      isDirty,
      pending,
      message,
      error,
      onSaveDraft: handleSaveDraft,
      onPublish: handlePublish,
      onDiscard: handleDiscard,
    })
    return () => unbind()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDraft, isDirty, pending, message, error, draft])

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start pb-12">
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[15px] font-semibold text-gray-900">Quality Promises content</h3>
          <div className="flex items-center gap-1">
            <button data-opus-button="control"
              type="button"
              onClick={expandAll}
              className="flex items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
            >
              <ChevronsUpDown className="w-3 h-3" />
              Expand all
            </button>
            <button data-opus-button="control"
              type="button"
              onClick={collapseAll}
              className="flex items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
            >
              <ChevronsDownUp className="w-3 h-3" />
              Collapse all
            </button>
          </div>
        </div>
      {draft.items.map((item, idx) => (
        <CollapsibleCard
          key={item.id}
          index={idx}
          title={resolveLocalized(item.title, previewLocale) || 'New pillar'}
          subtitle={item.icon}
          collapsed={!expanded.has(idx)}
          onToggle={() => toggleExpanded(idx)}
          onMoveUp={() => moveItem(idx, -1)}
          onMoveDown={() => moveItem(idx, 1)}
          onRemove={() => removeItem(idx)}
          disableMoveUp={idx === 0}
          disableMoveDown={idx === draft.items.length - 1}
        >
          <Field label="Icon">
            <select
              value={item.icon}
              onChange={(e) => setItem(idx, { icon: e.target.value as PromiseIconKey })}
              className={inputCls}
            >
              {PROMISE_ICON_KEYS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </Field>
          <BilingualField
            label="Title"
            value={item.title}
            onChange={(v) => setItem(idx, { title: v })}
            placeholder="Premium quality"
          />
          <BilingualField
            label="Description"
            value={item.description}
            onChange={(v) => setItem(idx, { description: v })}
            placeholder="Short, punchy explanation of this pillar."
            multiline
            rows={2}
          />
        </CollapsibleCard>
      ))}
      <button data-opus-button="neutral" data-opus-button-size="medium"
        type="button"
        onClick={addItem}
        className="flex items-center gap-2 text-sm font-medium text-[#7E5896] hover:text-[#5d3a78] px-3 py-2 rounded-lg border border-dashed border-[#C9A0DC] hover:bg-[#F0DFF6] transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add pillar
      </button>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] xl:sticky xl:top-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-semibold text-gray-900">Live preview</h3>
          <div className="inline-flex items-center rounded-full border border-gray-200 p-0.5 text-[11px] font-semibold">
            {LOCALES.map((l) => (
              <button data-opus-button="control"
                key={l}
                type="button"
                onClick={() => setPreviewLocale(l)}
                aria-pressed={previewLocale === l}
                className={cn(
                  'rounded-full px-2.5 py-0.5 transition-colors',
                  previewLocale === l ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
                )}
              >
                {LOCALE_LABELS[l]}
              </button>
            ))}
          </div>
        </div>
        <PromisesPreview content={draft} locale={previewLocale} />
      </div>
    </div>
  )
}

function PromisesPreview({ content, locale }: { content: OpusPassPromisesContent; locale: Locale }) {
  return (
    <div className="border-t border-gray-200 pt-6">
      <div className="grid grid-cols-2 gap-x-4 gap-y-6">
        {content.items.map((item) => {
          const Icon = ICON_MAP[item.icon] ?? Sparkles
          return (
            <div key={item.id}>
              <div className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center mb-3">
                <Icon className="text-[#1A1A1A]" size={16} />
              </div>
              <h4 className="font-bold text-xs text-[#1A1A1A] mb-1.5">
                {resolveLocalized(item.title, locale) || 'Title'}
              </h4>
              <p className="text-gray-600 text-[10px] leading-relaxed line-clamp-3">
                {resolveLocalized(item.description, locale)}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
