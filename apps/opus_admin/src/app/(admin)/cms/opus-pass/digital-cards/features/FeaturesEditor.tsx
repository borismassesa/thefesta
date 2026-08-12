'use client'

import { useEffect, useState, useTransition } from 'react'
import { ChevronsDownUp, ChevronsUpDown, Plus } from 'lucide-react'
import { CollapsibleCard } from '@/components/cms/CollapsibleCard'
import { ImageUploadField } from '@/components/cms/ImageUploadField'
import { BilingualField } from '@/components/cms/BilingualField'
import { LOCALES, LOCALE_LABELS, resolveLocalized, type Locale } from '@/lib/cms/localized'
import { cn } from '@/lib/utils'
import {
  DIGITAL_CARDS_FEATURE_VISUALS,
  type OpusPassDigitalCardsFeatureCard,
  type OpusPassDigitalCardsFeatureVisual,
  type OpusPassDigitalCardsFeaturesContent,
} from '@/lib/cms/opus-pass-digital-cards-features'
import { useEditorActions } from '../EditorActionsContext'
import {
  discardOpusPassDigitalCardsFeaturesDraft,
  publishOpusPassDigitalCardsFeatures,
  saveOpusPassDigitalCardsFeaturesDraft,
} from './actions'

type Props = {
  initial: OpusPassDigitalCardsFeaturesContent
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
  return `card-${Math.random().toString(36).slice(2, 9)}`
}

export default function FeaturesEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<OpusPassDigitalCardsFeaturesContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewLocale, setPreviewLocale] = useState<Locale>('en')
  const { bind, unbind } = useEditorActions()

  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([0]))
  const toggleExpanded = (idx: number) =>
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  const expandAll = () => setExpanded(new Set(draft.cards.map((_, i) => i)))
  const collapseAll = () => setExpanded(new Set())

  const setField = <K extends keyof OpusPassDigitalCardsFeaturesContent>(
    key: K,
    value: OpusPassDigitalCardsFeaturesContent[K],
  ) => setDraft((d) => ({ ...d, [key]: value }))

  const setCard = (idx: number, patch: Partial<OpusPassDigitalCardsFeatureCard>) =>
    setDraft((d) => ({
      ...d,
      cards: d.cards.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }))

  const addCard = () =>
    setDraft((d) => ({
      ...d,
      cards: [
        ...d.cards,
        { id: randomId(), title: '', body: '', cta_label: '', cta_href: '', visual: 'invitations' },
      ],
    }))

  const removeCard = (idx: number) =>
    setDraft((d) => ({ ...d, cards: d.cards.filter((_, i) => i !== idx) }))

  const moveCard = (idx: number, delta: number) =>
    setDraft((d) => {
      const next = [...d.cards]
      const target = idx + delta
      if (target < 0 || target >= next.length) return d
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...d, cards: next }
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
      await saveOpusPassDigitalCardsFeaturesDraft(draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })

  const handlePublish = () =>
    runAction(async () => {
      await saveOpusPassDigitalCardsFeaturesDraft(draft)
      await publishOpusPassDigitalCardsFeatures()
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })

  const handleDiscard = () =>
    runAction(async () => {
      await discardOpusPassDigitalCardsFeaturesDraft()
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
        <h3 className="text-[15px] font-semibold text-gray-900">Features content</h3>

        <FieldGroup label="Section heading">
          <BilingualField
            label="Heading"
            value={draft.heading}
            onChange={(v) => setField('heading', v)}
            placeholder="Wedding stationery made easy, from invite to seat"
          />
          <BilingualField
            label="Subheading (optional)"
            value={draft.subheading ?? ''}
            onChange={(v) => setField('subheading', v)}
            multiline
            rows={2}
            placeholder="From invite to seating, beautifully organized. Track confirmations, plus-ones, and special-guest notes in one live dashboard."
          />
        </FieldGroup>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 px-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Cards ({draft.cards.length})
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
          {draft.cards.map((card, idx) => (
            <CollapsibleCard
              key={card.id}
              index={idx}
              title={resolveLocalized(card.title, 'en') || 'New card'}
              collapsed={!expanded.has(idx)}
              onToggle={() => toggleExpanded(idx)}
              onMoveUp={() => moveCard(idx, -1)}
              onMoveDown={() => moveCard(idx, 1)}
              onRemove={() => removeCard(idx)}
              disableMoveUp={idx === 0}
              disableMoveDown={idx === draft.cards.length - 1}
            >
              <BilingualField
                label="Title"
                value={card.title}
                onChange={(v) => setCard(idx, { title: v })}
              />
              <BilingualField
                label="Body"
                value={card.body}
                onChange={(v) => setCard(idx, { body: v })}
                multiline
                rows={3}
              />
              <BilingualField
                label="CTA label"
                value={card.cta_label}
                onChange={(v) => setCard(idx, { cta_label: v })}
              />
              <Field label="CTA destination URL">
                <input
                  type="text"
                  value={card.cta_href}
                  onChange={(e) => setCard(idx, { cta_href: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <ImageUploadField
                label="Image (optional — replaces the visual style below)"
                value={card.image_url ?? ''}
                onChange={(v) => setCard(idx, { image_url: v || undefined })}
                pathPrefix="opus-pass/invitations/features"
                previewAspect="aspect-square"
                previewWidth="max-w-[200px]"
              />
              <Field
                label={
                  card.image_url
                    ? 'Visual style (not used — clear the image above to enable)'
                    : 'Visual style (built-in CSS art)'
                }
              >
                <select
                  value={card.visual}
                  onChange={(e) =>
                    setCard(idx, { visual: e.target.value as OpusPassDigitalCardsFeatureVisual })
                  }
                  disabled={!!card.image_url}
                  className={`${inputCls} disabled:opacity-50 disabled:bg-gray-50`}
                >
                  {DIGITAL_CARDS_FEATURE_VISUALS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            </CollapsibleCard>
          ))}
          <button data-opus-button="neutral" data-opus-button-size="medium"
            type="button"
            onClick={addCard}
            className="flex items-center gap-2 text-sm font-medium text-[#7E5896] hover:text-[#5d3a78] px-3 py-2 rounded-lg border border-dashed border-[#C9A0DC] hover:bg-[#F0DFF6] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add card
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
        <FeaturesPreview content={draft} locale={previewLocale} />
      </div>
    </div>
  )
}

function FeaturesPreview({
  content,
  locale,
}: {
  content: OpusPassDigitalCardsFeaturesContent
  locale: Locale
}) {
  const previewSubheading = resolveLocalized(content.subheading ?? '', locale)
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-sm sm:text-base font-serif font-medium text-gray-900 leading-tight">
          {resolveLocalized(content.heading, locale) || 'Section heading'}
        </h2>
        {previewSubheading && (
          <p className="mx-auto mt-1.5 max-w-md text-[10px] leading-snug text-gray-500">
            {previewSubheading}
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
        {content.cards.map((card) => (
          <div key={card.id} className="flex flex-col items-center px-1 text-center">
            <div className="grid h-7 w-7 place-items-center rounded-full bg-gray-100 text-[10px] uppercase tracking-wider text-gray-500">
              {VISUAL_ICON_GLYPH[card.visual] ?? '•'}
            </div>
            <h3 className="mt-2 text-[11px] font-extrabold tracking-tight text-[#1A1A1A]">
              {resolveLocalized(card.title, locale) || 'Title'}
            </h3>
            <p className="mt-1 text-[9px] text-[#1A1A1A]/65 leading-snug line-clamp-3">
              {resolveLocalized(card.body, locale)}
            </p>
            <span className="mt-1.5 text-[9px] font-bold text-[#1A1A1A] underline underline-offset-2">
              {resolveLocalized(card.cta_label, locale) || 'CTA'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Compact glyphs standing in for the public page's line-art icons (icon chosen by `visual`). */
const VISUAL_ICON_GLYPH: Record<OpusPassDigitalCardsFeatureVisual, string> = {
  invitations: '✓',
  phone: '🌐',
  envelope: '✉',
}
