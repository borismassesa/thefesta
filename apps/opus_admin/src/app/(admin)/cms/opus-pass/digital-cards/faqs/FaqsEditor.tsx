'use client'

import { useEffect, useState, useTransition } from 'react'
import { ChevronsDownUp, ChevronsUpDown, Plus } from 'lucide-react'
import type {
  OpusPassFaqItem,
  OpusPassDigitalCardsFaqsContent,
} from '@/lib/cms/opus-pass-digital-cards-faqs'
import { CollapsibleCard } from '@/components/cms/CollapsibleCard'
import { BilingualField } from '@/components/cms/BilingualField'
import { LOCALES, LOCALE_LABELS, resolveLocalized, type Locale } from '@/lib/cms/localized'
import { cn } from '@/lib/utils'
import { useEditorActions } from '../EditorActionsContext'
import {
  discardOpusPassDigitalCardsFaqsDraft,
  publishOpusPassDigitalCardsFaqs,
  saveOpusPassDigitalCardsFaqsDraft,
} from './actions'

type Props = {
  initial: OpusPassDigitalCardsFaqsContent
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

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="border border-gray-200 rounded-lg p-3 pt-2 space-y-3">
      <legend className="px-1 text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</legend>
      {children}
    </fieldset>
  )
}

function randomId(): string {
  return `faq-${Math.random().toString(36).slice(2, 9)}`
}

export default function FaqsEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<OpusPassDigitalCardsFaqsContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewLocale, setPreviewLocale] = useState<Locale>('en')
  const { bind, unbind } = useEditorActions()

  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
  const toggleExpanded = (idx: number) =>
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  const expandAll = () => setExpanded(new Set(draft.items.map((_, i) => i)))
  const collapseAll = () => setExpanded(new Set())

  const setField = <K extends keyof OpusPassDigitalCardsFaqsContent>(
    key: K,
    value: OpusPassDigitalCardsFaqsContent[K],
  ) => setDraft((d) => ({ ...d, [key]: value }))

  const setItem = (idx: number, patch: Partial<OpusPassFaqItem>) =>
    setDraft((d) => ({
      ...d,
      items: d.items.map((item, i) => (i === idx ? { ...item, ...patch } : item)),
    }))

  const addItem = () =>
    setDraft((d) => ({
      ...d,
      items: [...d.items, { id: randomId(), question: '', answer: '' }],
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
      await saveOpusPassDigitalCardsFaqsDraft(draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })

  const handlePublish = () =>
    runAction(async () => {
      await saveOpusPassDigitalCardsFaqsDraft(draft)
      await publishOpusPassDigitalCardsFaqs()
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })

  const handleDiscard = () =>
    runAction(async () => {
      await discardOpusPassDigitalCardsFaqsDraft()
      setDraft(initial)
      setHasDraft(false)
      setMessage('Draft discarded.')
    })

  useEffect(() => {
    bind({
      hasDraft,
      pending,
      message,
      error,
      onSaveDraft: handleSaveDraft,
      onPublish: handlePublish,
      onDiscard: handleDiscard,
    })
    return () => unbind()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDraft, pending, message, error, draft])

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start pb-12">
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] space-y-5">
        <h3 className="text-[15px] font-semibold text-gray-900">FAQs content</h3>

        <FieldGroup label="Section header">
          <BilingualField
            label="Heading"
            value={draft.heading}
            onChange={(v) => setField('heading', v)}
            placeholder="Frequently asked questions"
          />
          <BilingualField
            label="Description"
            value={draft.description}
            onChange={(v) => setField('description', v)}
            multiline
            rows={2}
          />
        </FieldGroup>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 px-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Q&amp;A pairs ({draft.items.length})
            </p>
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
              title={resolveLocalized(item.question, 'en') || 'New question'}
              collapsed={!expanded.has(idx)}
              onToggle={() => toggleExpanded(idx)}
              onMoveUp={() => moveItem(idx, -1)}
              onMoveDown={() => moveItem(idx, 1)}
              onRemove={() => removeItem(idx)}
              disableMoveUp={idx === 0}
              disableMoveDown={idx === draft.items.length - 1}
            >
              <BilingualField
                label="Question"
                value={item.question}
                onChange={(v) => setItem(idx, { question: v })}
              />
              <BilingualField
                label="Answer"
                value={item.answer}
                onChange={(v) => setItem(idx, { answer: v })}
                multiline
                rows={4}
              />
            </CollapsibleCard>
          ))}
          <button data-opus-button="neutral" data-opus-button-size="medium"
            type="button"
            onClick={addItem}
            className="flex items-center gap-2 text-sm font-medium text-[#7E5896] hover:text-[#5d3a78] px-3 py-2 rounded-lg border border-dashed border-[#C9A0DC] hover:bg-[#F0DFF6] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add FAQ
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] xl:sticky xl:top-6 max-h-[calc(100vh-3rem)] overflow-y-auto">
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
        <FaqsPreview content={draft} locale={previewLocale} />
      </div>
    </div>
  )
}

function FaqsPreview({
  content,
  locale,
}: {
  content: OpusPassDigitalCardsFaqsContent
  locale: Locale
}) {
  return (
    <div>
      <div className="text-center mb-5">
        <h2 className="text-base font-serif font-medium text-gray-900 mb-1.5">
          {resolveLocalized(content.heading, locale) || 'Section heading'}
        </h2>
        <p className="text-[10px] text-gray-700 leading-relaxed">
          {resolveLocalized(content.description, locale)}
        </p>
      </div>
      <div className="border-y border-gray-200">
        {content.items.map((item) => (
          <div key={item.id} className="border-b border-gray-200 last:border-b-0 py-3">
            <p className="text-xs font-medium text-gray-900 leading-snug">
              {resolveLocalized(item.question, locale)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
