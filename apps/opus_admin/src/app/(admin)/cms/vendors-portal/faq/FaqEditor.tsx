'use client'

import { useEffect, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import type { FaqContent, FaqItem } from '@/lib/cms/vendors-portal-faq'
import { cn } from '@/lib/utils'
import { BilingualField } from '@/components/cms/BilingualField'
import { LOCALES, LOCALE_LABELS, resolveLocalized, type Locale } from '@/lib/cms/localized'
import { useEditorActions } from '../EditorActionsContext'
import { discardFaqDraft, publishFaq, saveFaqDraft } from './actions'

type Props = { initial: FaqContent; hasDraft: boolean }

const HEADLINE_MAX = 30
const QUESTION_MAX = 120
const ANSWER_MAX = 360

export default function FaqEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<FaqContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [openItemId, setOpenItemId] = useState<string | null>(initial.items[0]?.id ?? null)
  const [previewLocale, setPreviewLocale] = useState<Locale>('en')
  const { bind, unbind } = useEditorActions()

  const setField = <K extends keyof FaqContent>(key: K, value: FaqContent[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const updateItem = (id: string, patch: Partial<FaqItem>) =>
    setDraft((d) => ({
      ...d,
      items: d.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }))

  const removeItem = (id: string) =>
    setDraft((d) => ({ ...d, items: d.items.filter((it) => it.id !== id) }))

  const moveItem = (id: string, dir: -1 | 1) =>
    setDraft((d) => {
      const idx = d.items.findIndex((it) => it.id === id)
      const t = idx + dir
      if (idx < 0 || t < 0 || t >= d.items.length) return d
      const next = [...d.items]
      ;[next[idx], next[t]] = [next[t], next[idx]]
      return { ...d, items: next }
    })

  const addItem = () => {
    const id = `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setDraft((d) => ({
      ...d,
      items: [
        ...d.items,
        { id, q: 'New question?', a: 'Answer to the new question.' },
      ],
    }))
    setOpenItemId(id)
  }

  const handleSaveDraft = () =>
    startTransition(async () => {
      await saveFaqDraft(draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })
  const handlePublish = () =>
    startTransition(async () => {
      await saveFaqDraft(draft)
      await publishFaq()
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })
  const handleDiscard = () =>
    startTransition(async () => {
      await discardFaqDraft()
      setDraft(initial)
      setHasDraft(false)
      setMessage('Draft discarded.')
    })

  useEffect(() => {
    bind({
      hasDraft, pending, message,
      onSaveDraft: handleSaveDraft, onPublish: handlePublish, onDiscard: handleDiscard,
    })
    return () => unbind()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDraft, pending, message, draft])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <div className="space-y-4">
          {/* Section header */}
          <Card title="Section header">
            <BilingualField
              label="Eyebrow"
              value={draft.eyebrow}
              onChange={(v) => setField('eyebrow', v)}
            />
            <FieldGroup label="Headline (3 lines)">
              {(['headline_line_1', 'headline_line_2', 'headline_line_3'] as const).map((k, i) => (
                <BilingualField
                  key={k}
                  label={`Line ${i + 1}`}
                  value={draft[k]}
                  onChange={(v) => setField(k, v)}
                  max={HEADLINE_MAX}
                />
              ))}
            </FieldGroup>
            <BilingualField
              label="Subheadline"
              value={draft.subheadline}
              onChange={(v) => setField('subheadline', v)}
              multiline
              rows={2}
            />
            <FieldGroup label="Call to action">
              <BilingualField
                label="Label"
                value={draft.cta_label}
                onChange={(v) => setField('cta_label', v)}
              />
              <Field label="Link">
                <input
                  type="text"
                  value={draft.cta_href}
                  onChange={(e) => setField('cta_href', e.target.value)}
                  className={inputCls}
                />
              </Field>
            </FieldGroup>
          </Card>

          {/* FAQ items */}
          <Card title="Questions & answers" count={draft.items.length}>
            <div className="space-y-2">
              {draft.items.map((item, i) => (
                <ItemAccordion
                  key={item.id}
                  item={item}
                  index={i}
                  total={draft.items.length}
                  isOpen={openItemId === item.id}
                  onToggle={() => setOpenItemId((cur) => (cur === item.id ? null : item.id))}
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
              Add question
            </button>
          </Card>
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
          <FaqPreview content={draft} locale={previewLocale} />
        </div>
      </div>
    </div>
  )
}

function ItemAccordion({
  item, index, total, isOpen, onToggle, onChange, onRemove, onMoveUp, onMoveDown,
}: {
  item: FaqItem
  index: number
  total: number
  isOpen: boolean
  onToggle: () => void
  onChange: (patch: Partial<FaqItem>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50/50">
        <button data-opus-button="control" type="button" onClick={onToggle} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
          <span className="text-sm font-semibold text-gray-900 truncate">{resolveLocalized(item.q, 'en')}</span>
        </button>
        <div className="flex items-center gap-0.5 shrink-0">
          <IconBtn onClick={onMoveUp} disabled={index === 0} aria-label="Move up"><ArrowUp className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn onClick={onMoveDown} disabled={index === total - 1} aria-label="Move down"><ArrowDown className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn onClick={onRemove} aria-label="Remove" danger><Trash2 className="w-3.5 h-3.5" /></IconBtn>
        </div>
      </div>

      {isOpen && (
        <div className="p-4 space-y-3 border-t border-gray-100">
          <BilingualField
            label="Question"
            value={item.q}
            onChange={(v) => onChange({ q: v })}
            max={QUESTION_MAX}
          />
          <BilingualField
            label="Answer"
            value={item.a}
            onChange={(v) => onChange({ a: v })}
            multiline
            rows={4}
            max={ANSWER_MAX}
          />
        </div>
      )}
    </div>
  )
}

function IconBtn({
  onClick, disabled, danger, children, ...rest
}: {
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: React.ReactNode
} & React.AriaAttributes) {
  return (
    <button data-opus-button="control"
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'p-1 rounded transition-colors',
        danger
          ? 'text-gray-400 hover:text-red-600 hover:bg-red-50'
          : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
        'disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400'
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

function Card({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-gray-900">{title}</h3>
        {typeof count === 'number' && (
          <span className="text-xs text-gray-400 tabular-nums">{count} item{count === 1 ? '' : 's'}</span>
        )}
      </div>
      {children}
    </div>
  )
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="border border-gray-200 rounded-lg p-3 pt-2 space-y-3">
      <legend className="px-1 text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</legend>
      {children}
    </fieldset>
  )
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
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

const inputCls =
  'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] focus:border-transparent transition-all'

function FaqPreview({ content, locale }: { content: FaqContent; locale: Locale }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0)
  return (
    <div className="space-y-4">
      <div>
        <span className="text-[#C9A0DC] text-[9px] font-bold uppercase tracking-widest">{resolveLocalized(content.eyebrow, locale)}</span>
        <h2 className="text-2xl font-black uppercase tracking-tighter leading-[0.9] mt-1 text-[#1A1A1A]">
          {resolveLocalized(content.headline_line_1, locale)}<br />{resolveLocalized(content.headline_line_2, locale)}<br />{resolveLocalized(content.headline_line_3, locale)}
        </h2>
        <div className="w-8 h-1 bg-[#C9A0DC] rounded-full my-2" />
        <p className="text-[10px] text-gray-500 leading-relaxed">{resolveLocalized(content.subheadline, locale)}</p>
        <button data-opus-button="primary" data-opus-button-size="small" className="mt-2 inline-flex items-center gap-2 bg-[#1A1A1A] text-white text-[10px] font-bold px-3 py-1.5 rounded-full">
          {resolveLocalized(content.cta_label, locale)}
          <span className="w-3 h-3 rounded-full bg-[#C9A0DC] flex items-center justify-center text-[#1A1A1A] text-[8px] leading-none">→</span>
        </button>
      </div>

      <div className="divide-y divide-gray-100">
        {content.items.map((it, i) => {
          const open = openIdx === i
          return (
            <div key={it.id}>
              <button data-opus-button="control"
                onClick={() => setOpenIdx(open ? null : i)}
                className="w-full flex items-center justify-between py-3 text-left gap-3 group"
              >
                <span className={cn('text-xs font-bold leading-snug', open ? 'text-[#1A1A1A]' : 'text-gray-600 group-hover:text-[#1A1A1A]')}>
                  {resolveLocalized(it.q, locale)}
                </span>
                <span className={cn('shrink-0 text-base font-black leading-none transition-transform', open ? 'text-[#C9A0DC] rotate-45' : 'text-gray-400')}>
                  +
                </span>
              </button>
              {open && (
                <p className="pb-3 text-[10px] text-gray-500 font-medium leading-relaxed">
                  {resolveLocalized(it.a, locale)}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
