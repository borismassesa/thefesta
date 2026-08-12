'use client'

import { useEffect, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2 } from 'lucide-react'
import type { CategoryItem, CategoryMarqueeContent } from '@/lib/cms/vendors-portal-category-marquee'
import { cn } from '@/lib/utils'
import { BilingualField } from '@/components/cms/BilingualField'
import { LOCALES, LOCALE_LABELS, resolveLocalized, type Locale } from '@/lib/cms/localized'
import { useEditorActions } from '../EditorActionsContext'
import {
  discardCategoryMarqueeDraft,
  publishCategoryMarquee,
  saveCategoryMarqueeDraft,
} from './actions'

type Props = {
  initial: CategoryMarqueeContent
  hasDraft: boolean
}

const HEX_RE = /^#?[0-9a-fA-F]{6}$/

function normalizeHex(value: string): string {
  const v = value.trim()
  if (HEX_RE.test(v)) return v.startsWith('#') ? v : `#${v}`
  return value
}

export default function CategoryMarqueeEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<CategoryMarqueeContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [previewLocale, setPreviewLocale] = useState<Locale>('en')
  const { bind, unbind } = useEditorActions()

  const updateItem = (id: string, patch: Partial<CategoryItem>) =>
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
          id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: { en: 'New Category', sw: '' },
          bg: '#1A1A1A',
          text: '#ffffff',
        },
      ],
    }))

  const handleSaveDraft = () =>
    startTransition(async () => {
      await saveCategoryMarqueeDraft(draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })

  const handlePublish = () =>
    startTransition(async () => {
      await saveCategoryMarqueeDraft(draft)
      await publishCategoryMarquee()
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })

  const handleDiscard = () =>
    startTransition(async () => {
      await discardCategoryMarqueeDraft()
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
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] space-y-3">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-[15px] font-semibold text-gray-900">
              Categories
            </h3>
            <span className="text-xs text-gray-400 tabular-nums">
              {draft.items.filter((i) => i.visible !== false).length} visible / {draft.items.length} total
            </span>
          </div>

          <div className="space-y-2">
            {draft.items.map((item, i) => (
              <CategoryRow
                key={item.id}
                item={item}
                index={i}
                total={draft.items.length}
                previewLocale={previewLocale}
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
            Add category
          </button>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
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
          <CategoryMarqueePreview content={draft} locale={previewLocale} />
        </div>
      </div>
    </div>
  )
}

function CategoryRow({
  item,
  index,
  total,
  previewLocale,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  item: CategoryItem
  index: number
  total: number
  previewLocale: Locale
  onChange: (patch: Partial<CategoryItem>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const visible = item.visible !== false
  const resolvedName = resolveLocalized(item.name, previewLocale)
  return (
    <div
      className={cn(
        'flex flex-col gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 group transition-opacity',
        !visible && 'opacity-50'
      )}
    >
      <div className="flex items-center gap-2">
        <button data-opus-button="control"
          type="button"
          onClick={() => onChange({ visible: !visible })}
          aria-label={visible ? 'Hide on website' : 'Show on website'}
          title={visible ? 'Visible on website — click to hide' : 'Hidden on website — click to show'}
          className={cn(
            'p-1 rounded transition-colors shrink-0',
            visible
              ? 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
              : 'text-gray-300 hover:text-gray-700 hover:bg-gray-100'
          )}
        >
          {visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <ColorSwatch
            color={item.bg}
            onChange={(bg) => onChange({ bg })}
            aria-label="Background color"
          />
          <ColorSwatch
            color={item.text}
            onChange={(text) => onChange({ text })}
            aria-label="Text color"
          />
        </div>
        <div
          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap shrink-0"
          style={{ background: item.bg, color: item.text }}
        >
          {resolvedName || 'Preview'}
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button data-opus-button="control"
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            aria-label="Move up"
            className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button data-opus-button="control"
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            aria-label="Move down"
            className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button data-opus-button="control"
            type="button"
            onClick={onRemove}
            aria-label="Remove"
            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <BilingualField
        label="Name"
        value={item.name}
        onChange={(name) => onChange({ name })}
      />
    </div>
  )
}

function ColorSwatch({
  color,
  onChange,
  ...rest
}: {
  color: string
  onChange: (hex: string) => void
} & React.AriaAttributes) {
  return (
    <label
      className="relative w-7 h-7 rounded-md border border-gray-200 cursor-pointer overflow-hidden block"
      style={{ background: color }}
      title={color}
      {...rest}
    >
      <input
        type="color"
        value={HEX_RE.test(color) ? (color.startsWith('#') ? color : `#${color}`) : '#000000'}
        onChange={(e) => onChange(normalizeHex(e.target.value))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
    </label>
  )
}

function CategoryMarqueePreview({
  content,
  locale,
}: {
  content: CategoryMarqueeContent
  locale: Locale
}) {
  const visible = content.items.filter((i) => i.visible !== false)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {visible.map((item) => (
          <span
            key={item.id}
            className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap"
            style={{ background: item.bg, color: item.text }}
          >
            {resolveLocalized(item.name, locale) || 'Untitled'}
          </span>
        ))}
        {visible.length === 0 && (
          <span className="text-xs text-gray-400">
            No visible categories — toggle some on or add one to see the preview.
          </span>
        )}
      </div>
      {content.items.length !== visible.length && (
        <p className="text-[11px] text-gray-400">
          {content.items.length - visible.length} hidden item
          {content.items.length - visible.length === 1 ? '' : 's'} not shown above.
        </p>
      )}
    </div>
  )
}
