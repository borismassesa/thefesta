'use client'

import { useEffect, useState, useTransition } from 'react'
import { ChevronsDownUp, ChevronsUpDown, Plus, Star } from 'lucide-react'
import { CollapsibleCard } from '@/components/cms/CollapsibleCard'
import type {
  OpusPassWebsitesTestimonialFg,
  OpusPassWebsitesTestimonialItem,
  OpusPassWebsitesTestimonialsContent,
} from '@/lib/cms/opus-pass-websites-testimonials'
import { ImageUploadField } from '@/components/cms/ImageUploadField'
import { BilingualField } from '@/components/cms/BilingualField'
import { cn } from '@/lib/utils'
import { LOCALES, LOCALE_LABELS, resolveLocalized, type Locale } from '@/lib/cms/localized'
import { resolveOpusPassAssetUrl } from '@/lib/cms/opus-pass-asset-url'
import { useEditorActions } from '../EditorActionsContext'
import {
  discardOpusPassWebsitesTestimonialsDraft,
  publishOpusPassWebsitesTestimonials,
  saveOpusPassWebsitesTestimonialsDraft,
} from './actions'

type Props = {
  initial: OpusPassWebsitesTestimonialsContent
  hasDraft: boolean
}

type Column = 'column1' | 'column2'

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
  return `wt-${Math.random().toString(36).slice(2, 9)}`
}

export default function TestimonialsEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<OpusPassWebsitesTestimonialsContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewLocale, setPreviewLocale] = useState<Locale>('en')
  const { bind, unbind } = useEditorActions()

  // Per-column expanded set: key is `${col}:${idx}` so the two columns can be
  // toggled independently.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const isExpanded = (col: Column, idx: number) => expanded.has(`${col}:${idx}`)
  const toggleExpanded = (col: Column, idx: number) =>
    setExpanded((s) => {
      const key = `${col}:${idx}`
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const expandAll = () => {
    const all = new Set<string>()
    draft.column1.forEach((_, i) => all.add(`column1:${i}`))
    draft.column2.forEach((_, i) => all.add(`column2:${i}`))
    setExpanded(all)
  }
  const collapseAll = () => setExpanded(new Set())

  const setField = <K extends keyof OpusPassWebsitesTestimonialsContent>(
    key: K,
    value: OpusPassWebsitesTestimonialsContent[K]
  ) => setDraft((d) => ({ ...d, [key]: value }))

  const setItem = (col: Column, idx: number, patch: Partial<OpusPassWebsitesTestimonialItem>) =>
    setDraft((d) => ({
      ...d,
      [col]: d[col].map((item, i) => (i === idx ? { ...item, ...patch } : item)),
    }))

  const addItem = (col: Column) =>
    setDraft((d) => ({
      ...d,
      [col]: [
        ...d[col],
        {
          id: randomId(),
          quote: '',
          name: '',
          location: '',
          avatar: '',
          bg: 'bg-white',
          fg: 'light' as OpusPassWebsitesTestimonialFg,
        },
      ],
    }))

  const removeItem = (col: Column, idx: number) =>
    setDraft((d) => ({ ...d, [col]: d[col].filter((_, i) => i !== idx) }))

  const moveItem = (col: Column, idx: number, delta: number) =>
    setDraft((d) => {
      const next = [...d[col]]
      const target = idx + delta
      if (target < 0 || target >= next.length) return d
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...d, [col]: next }
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
      await saveOpusPassWebsitesTestimonialsDraft(draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })

  const handlePublish = () =>
    runAction(async () => {
      await saveOpusPassWebsitesTestimonialsDraft(draft)
      await publishOpusPassWebsitesTestimonials()
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })

  const handleDiscard = () =>
    runAction(async () => {
      await discardOpusPassWebsitesTestimonialsDraft()
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

  const renderColumn = (col: Column) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
          {col === 'column1' ? 'Column 1 (scrolls up)' : 'Column 2 (scrolls down)'} ({draft[col].length})
        </p>
      </div>
      {draft[col].map((item, idx) => (
        <CollapsibleCard
          key={item.id}
          index={idx}
          title={item.name || 'New testimonial'}
          subtitle={item.location}
          collapsed={!isExpanded(col, idx)}
          onToggle={() => toggleExpanded(col, idx)}
          onMoveUp={() => moveItem(col, idx, -1)}
          onMoveDown={() => moveItem(col, idx, 1)}
          onRemove={() => removeItem(col, idx)}
          disableMoveUp={idx === 0}
          disableMoveDown={idx === draft[col].length - 1}
        >
          <BilingualField
            label="Quote"
            value={item.quote}
            onChange={(v) => setItem(col, idx, { quote: v })}
            multiline
            rows={3}
          />
          <Field label="Name (e.g. Rehema & Bakari)">
            <input
              type="text"
              value={item.name}
              onChange={(e) => setItem(col, idx, { name: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Location">
            <input
              type="text"
              value={item.location}
              onChange={(e) => setItem(col, idx, { location: e.target.value })}
              className={inputCls}
            />
          </Field>
          <ImageUploadField
            label="Avatar"
            value={item.avatar}
            onChange={(v) => setItem(col, idx, { avatar: v })}
            pathPrefix="opus-pass/websites-testimonials"
            previewAspect="aspect-square"
            previewWidth="max-w-[120px]"
          />
          <p className="text-[11px] text-gray-400 leading-relaxed">
            Card colours alternate automatically by position on the live page — no per-card colour to set.
          </p>
        </CollapsibleCard>
      ))}
      <button data-opus-button="neutral" data-opus-button-size="medium"
        type="button"
        onClick={() => addItem(col)}
        className="flex items-center gap-2 text-sm font-medium text-[#7E5896] hover:text-[#5d3a78] px-3 py-2 rounded-lg border border-dashed border-[#C9A0DC] hover:bg-[#F0DFF6] transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add testimonial
      </button>
    </div>
  )

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start pb-12">
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[15px] font-semibold text-gray-900">Testimonials content</h3>
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
      <FieldGroup label="Section header">
        <BilingualField
          label="Headline"
          value={draft.headline}
          onChange={(v) => setField('headline', v)}
        />
        <BilingualField
          label="Description (shown below the testimonial wall)"
          value={draft.description}
          onChange={(v) => setField('description', v)}
          multiline
          rows={2}
        />
        <BilingualField
          label="CTA label"
          value={draft.cta_label}
          onChange={(v) => setField('cta_label', v)}
        />
        <Field label="CTA destination URL">
          <input
            type="text"
            value={draft.cta_href}
            onChange={(e) => setField('cta_href', e.target.value)}
            className={inputCls}
          />
        </Field>
      </FieldGroup>

      {renderColumn('column1')}
      {renderColumn('column2')}
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
        <TestimonialsPreview content={draft} locale={previewLocale} />
      </div>
    </div>
  )
}

function TestimonialsPreview({
  content,
  locale,
}: {
  content: OpusPassWebsitesTestimonialsContent
  locale: Locale
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
      <div className="space-y-1.5">
        <h2 className="text-sm font-serif font-bold text-gray-900 leading-tight">
          {resolveLocalized(content.headline, locale) || 'Headline'}
        </h2>
        <p className="text-[10px] text-gray-600 leading-relaxed line-clamp-3">
          {resolveLocalized(content.description, locale)}
        </p>
        <span className="inline-block text-[10px] text-gray-900 font-semibold underline">
          {resolveLocalized(content.cta_label, locale) || 'CTA'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 max-h-[280px] overflow-hidden">
        <div className="space-y-2">
          {content.column1.slice(0, 3).map((t, i) => (
            <TestimonialCardMini key={t.id} t={t} index={i} locale={locale} />
          ))}
        </div>
        <div className="space-y-2">
          {content.column2.slice(0, 3).map((t, i) => (
            <TestimonialCardMini key={t.id} t={t} index={i} locale={locale} />
          ))}
        </div>
      </div>
    </div>
  )
}

// Mirrors the live InvitationShowcase card: colour alternates by position
// (index % 2), not by any per-item field, and the role pill is fixed.
function TestimonialCardMini({
  t,
  index,
  locale,
}: {
  t: OpusPassWebsitesTestimonialItem
  index: number
  locale: Locale
}) {
  const isDark = index % 2 === 0
  const text = isDark ? 'text-white' : 'text-[#1A1A1A]'
  const sub = isDark ? 'text-white/60' : 'text-[#1A1A1A]/60'
  return (
    <div className={`rounded-lg p-2 ${isDark ? 'bg-[#1A1A1A]' : 'bg-[#9FE870]'}`}>
      <div className="flex items-center gap-0.5 text-amber-400 mb-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} size={8} className="fill-current" strokeWidth={0} />
        ))}
      </div>
      <p className={`text-[9px] font-semibold leading-snug ${text} line-clamp-3 mb-1`}>“{resolveLocalized(t.quote, locale)}”</p>
      <div className="flex items-center gap-1.5">
        <div className="w-5 h-5 shrink-0 rounded-full overflow-hidden bg-gray-200">
          {t.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={resolveOpusPassAssetUrl(t.avatar)} alt="" className="w-full h-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-[9px] font-semibold leading-tight ${text} truncate`}>{t.name}</p>
          <p className={`text-[8px] leading-tight truncate ${sub}`}>{t.location}</p>
        </div>
        <span
          className={`shrink-0 px-1.5 py-0.5 rounded-full text-[7px] font-bold ${
            isDark ? 'bg-[#9FE870] text-[#1A1A1A]' : 'bg-white text-[#1A1A1A]'
          }`}
        >
          Couple
        </span>
      </div>
    </div>
  )
}
