'use client'

import { useEffect, useState, useTransition } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  OPUS_PASS_WEBSITES_FEATURE_ICONS,
  OPUS_PASS_WEBSITES_FEATURE_VISUALS,
  type OpusPassWebsitesFeatureIcon,
  type OpusPassWebsitesFeatureItem,
  type OpusPassWebsitesFeaturesContent,
} from '@/lib/cms/opus-pass-websites-features'
import { CollapsibleCard } from '@/components/cms/CollapsibleCard'
import { ImageUploadField } from '@/components/cms/ImageUploadField'
import { BilingualField } from '@/components/cms/BilingualField'
import { cn } from '@/lib/utils'
import { LOCALES, LOCALE_LABELS, resolveLocalized, type Locale } from '@/lib/cms/localized'
import { useEditorActions } from '../EditorActionsContext'
import {
  discardOpusPassWebsitesFeaturesDraft,
  publishOpusPassWebsitesFeatures,
  saveOpusPassWebsitesFeaturesDraft,
} from './actions'

type Props = {
  initial: OpusPassWebsitesFeaturesContent
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
  return `feat-${Math.random().toString(36).slice(2, 9)}`
}

export default function FeaturesEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<OpusPassWebsitesFeaturesContent>(initial)
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

  const setField = <K extends keyof OpusPassWebsitesFeaturesContent>(
    key: K,
    value: OpusPassWebsitesFeaturesContent[K],
  ) => setDraft((d) => ({ ...d, [key]: value }))

  const setItem = (idx: number, patch: Partial<OpusPassWebsitesFeatureItem>) =>
    setDraft((d) => ({
      ...d,
      items: d.items.map((item, i) => (i === idx ? { ...item, ...patch } : item)),
    }))

  const addItem = () =>
    setDraft((d) => ({
      ...d,
      items: [
        ...d.items,
        {
          id: randomId(),
          icon: 'sparkles',
          title: '',
          body: '',
          cta_label: '',
          cta_href: '',
          visual: 'laptop',
          image_url: '',
        },
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
      await saveOpusPassWebsitesFeaturesDraft(draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })

  const handlePublish = () =>
    runAction(async () => {
      await saveOpusPassWebsitesFeaturesDraft(draft)
      await publishOpusPassWebsitesFeatures()
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })

  const handleDiscard = () =>
    runAction(async () => {
      await discardOpusPassWebsitesFeaturesDraft()
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
        <h3 className="text-[15px] font-semibold text-gray-900">Features</h3>

        <FieldGroup label="Section header">
          <BilingualField
            label="Heading"
            value={draft.heading}
            onChange={(v) => setField('heading', v)}
            placeholder="Create your free website"
          />
          <BilingualField
            label="Description"
            value={draft.description}
            onChange={(v) => setField('description', v)}
            multiline
            rows={2}
          />
          <Field label="Card background colour (hex)">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={draft.background_color}
                onChange={(e) => setField('background_color', e.target.value)}
                className="w-10 h-10 rounded border border-gray-200 p-0 overflow-hidden cursor-pointer"
              />
              <input
                type="text"
                value={draft.background_color}
                onChange={(e) => setField('background_color', e.target.value)}
                placeholder="#FCE9C2"
                className={`${inputCls} flex-1 font-mono text-[12px]`}
              />
              <button data-opus-button="control"
                type="button"
                onClick={() => setField('background_color', '#FCE9C2')}
                className="p-1 text-gray-400 hover:text-gray-700 shrink-0"
                title="Reset to default (#FCE9C2)"
                aria-label="Reset background colour"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </Field>
        </FieldGroup>

        <div className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 px-1">
            Cards ({draft.items.length})
          </p>
          {draft.items.map((item, idx) => (
            <CollapsibleCard
              key={item.id}
              index={idx}
              title={resolveLocalized(item.title, previewLocale) || 'New card'}
              collapsed={!expanded.has(idx)}
              onToggle={() => toggleExpanded(idx)}
              onMoveUp={() => moveItem(idx, -1)}
              onMoveDown={() => moveItem(idx, 1)}
              onRemove={() => removeItem(idx)}
              disableMoveUp={idx === 0}
              disableMoveDown={idx === draft.items.length - 1}
            >
              <div className="grid grid-cols-2 gap-3">
                <Field label="Icon">
                  <select
                    value={item.icon}
                    onChange={(e) =>
                      setItem(idx, { icon: e.target.value as OpusPassWebsitesFeatureItem['icon'] })
                    }
                    className={inputCls}
                  >
                    {OPUS_PASS_WEBSITES_FEATURE_ICONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Visual mock">
                  <select
                    value={item.visual}
                    onChange={(e) =>
                      setItem(idx, { visual: e.target.value as OpusPassWebsitesFeatureItem['visual'] })
                    }
                    className={inputCls}
                  >
                    {OPUS_PASS_WEBSITES_FEATURE_VISUALS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <BilingualField
                label="Title"
                value={item.title}
                onChange={(v) => setItem(idx, { title: v })}
              />
              <BilingualField
                label="Body"
                value={item.body}
                onChange={(v) => setItem(idx, { body: v })}
                multiline
                rows={3}
              />
              <BilingualField
                label="CTA label"
                value={item.cta_label}
                onChange={(v) => setItem(idx, { cta_label: v })}
              />
              <div className="grid grid-cols-1 gap-3">
                <Field label="CTA destination">
                  <input
                    type="text"
                    value={item.cta_href}
                    onChange={(e) => setItem(idx, { cta_href: e.target.value })}
                    className={inputCls}
                  />
                </Field>
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Optional — when set, replaces the built-in CSS mock ({item.visual}) inside the card.
                </p>
                <ImageUploadField
                  label="Card image"
                  value={item.image_url}
                  onChange={(v) => setItem(idx, { image_url: v })}
                  pathPrefix="opus-pass/websites/features"
                  previewAspect="aspect-[4/3]"
                  previewWidth="max-w-xs"
                />
              </div>
            </CollapsibleCard>
          ))}
          <button data-opus-button="neutral" data-opus-button-size="medium"
            type="button"
            onClick={addItem}
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
  content: OpusPassWebsitesFeaturesContent
  locale: Locale
}) {
  return (
    <div>
      <div className="text-center mb-4">
        <h2 className="text-base font-serif font-medium text-gray-900 mb-1.5">
          {resolveLocalized(content.heading, locale) || 'Section heading'}
        </h2>
        <p className="text-[10px] text-gray-700 leading-relaxed line-clamp-2">
          {resolveLocalized(content.description, locale)}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3 pt-1">
        {content.items.slice(0, 3).map((card) => {
          const title = resolveLocalized(card.title, locale)
          const body = resolveLocalized(card.body, locale)
          const ctaLabel = resolveLocalized(card.cta_label, locale)
          return (
            <div key={card.id} className="flex flex-col items-center px-1 text-center">
              <div className="grid h-7 w-7 place-items-center rounded-full bg-gray-100 text-[10px] uppercase tracking-wider text-gray-500">
                {ICON_GLYPH[card.icon] ?? '•'}
              </div>
              <p className="mt-2 text-[10px] font-extrabold text-[#1A1A1A] leading-tight line-clamp-2">
                {title || 'Card title'}
              </p>
              <p className="mt-1 text-[8px] text-[#1A1A1A]/65 leading-snug line-clamp-3">
                {body}
              </p>
              {ctaLabel && (
                <span className="mt-1.5 text-[8px] font-bold text-[#1A1A1A] underline">
                  {ctaLabel}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Compact glyphs standing in for the public page's line-art icons (icon chosen per card). */
const ICON_GLYPH: Record<OpusPassWebsitesFeatureIcon, string> = {
  sparkles: '✦',
  users: '👥',
  link: '🔗',
}
