'use client'

import { useEffect, useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { resolveOpusPassAssetUrl } from '@/lib/cms/opus-pass-asset-url'
import type {
  OpusPassWebsitesSellingPointItem,
  OpusPassWebsitesSellingPointsContent,
} from '@/lib/cms/opus-pass-websites-selling-points'
import { CollapsibleCard } from '@/components/cms/CollapsibleCard'
import { ImageUploadField } from '@/components/cms/ImageUploadField'
import { BilingualField } from '@/components/cms/BilingualField'
import { cn } from '@/lib/utils'
import { LOCALES, LOCALE_LABELS, resolveLocalized, type Locale } from '@/lib/cms/localized'
import { useEditorActions } from '../EditorActionsContext'
import {
  discardOpusPassWebsitesSellingPointsDraft,
  publishOpusPassWebsitesSellingPoints,
  saveOpusPassWebsitesSellingPointsDraft,
} from './actions'

type Props = {
  initial: OpusPassWebsitesSellingPointsContent
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
  return `block-${Math.random().toString(36).slice(2, 9)}`
}

export default function SellingPointsEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<OpusPassWebsitesSellingPointsContent>(initial)
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

  const setField = <K extends keyof OpusPassWebsitesSellingPointsContent>(
    key: K,
    value: OpusPassWebsitesSellingPointsContent[K],
  ) => setDraft((d) => ({ ...d, [key]: value }))

  const setItem = (idx: number, patch: Partial<OpusPassWebsitesSellingPointItem>) =>
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
          headline: '',
          body: '',
          cta_label: '',
          cta_href: '',
          image: '',
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
      await saveOpusPassWebsitesSellingPointsDraft(draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })

  const handlePublish = () =>
    runAction(async () => {
      await saveOpusPassWebsitesSellingPointsDraft(draft)
      await publishOpusPassWebsitesSellingPoints()
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })

  const handleDiscard = () =>
    runAction(async () => {
      await discardOpusPassWebsitesSellingPointsDraft()
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
        <h3 className="text-[15px] font-semibold text-gray-900">Selling points</h3>

        <FieldGroup label="Section header">
          <BilingualField
            label="Heading"
            value={draft.heading}
            onChange={(v) => setField('heading', v)}
            placeholder="Built to fit your wedding"
          />
          <BilingualField
            label="Description"
            value={draft.description}
            onChange={(v) => setField('description', v)}
            multiline
            rows={3}
          />
        </FieldGroup>

        <div className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 px-1">
            Blocks ({draft.items.length})
          </p>
          {draft.items.map((item, idx) => (
            <CollapsibleCard
              key={item.id}
              index={idx}
              title={resolveLocalized(item.headline, previewLocale) || 'New block'}
              collapsed={!expanded.has(idx)}
              onToggle={() => toggleExpanded(idx)}
              onMoveUp={() => moveItem(idx, -1)}
              onMoveDown={() => moveItem(idx, 1)}
              onRemove={() => removeItem(idx)}
              disableMoveUp={idx === 0}
              disableMoveDown={idx === draft.items.length - 1}
            >
              <BilingualField
                label="Headline"
                value={item.headline}
                onChange={(v) => setItem(idx, { headline: v })}
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
                placeholder="Explore designs"
              />
              <Field label="CTA destination">
                <input
                  type="text"
                  value={item.cta_href}
                  onChange={(e) => setItem(idx, { cta_href: e.target.value })}
                  placeholder="/sign-up"
                  className={inputCls}
                />
              </Field>
              <ImageUploadField
                label="Photo"
                value={item.image}
                onChange={(v) => setItem(idx, { image: v })}
                pathPrefix="opus-pass/websites/selling-points"
                previewAspect="aspect-[4/3]"
                previewWidth="max-w-xs"
              />
            </CollapsibleCard>
          ))}
          <button data-opus-button="neutral" data-opus-button-size="medium"
            type="button"
            onClick={addItem}
            className="flex items-center gap-2 text-sm font-medium text-[#7E5896] hover:text-[#5d3a78] px-3 py-2 rounded-lg border border-dashed border-[#C9A0DC] hover:bg-[#F0DFF6] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add block
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
        <SellingPointsPreview content={draft} locale={previewLocale} />
      </div>
    </div>
  )
}

function SellingPointsPreview({
  content,
  locale,
}: {
  content: OpusPassWebsitesSellingPointsContent
  locale: Locale
}) {
  return (
    <div>
      <div className="text-center mb-5">
        <h2 className="text-base font-serif font-medium text-gray-900 mb-1.5">
          {resolveLocalized(content.heading, locale) || 'Section heading'}
        </h2>
        <p className="text-[10px] text-gray-700 leading-relaxed line-clamp-3">
          {resolveLocalized(content.description, locale)}
        </p>
      </div>
      <div className="space-y-3">
        {content.items.map((block, idx) => {
          const reverse = idx % 2 === 1
          const headline = resolveLocalized(block.headline, locale)
          const body = resolveLocalized(block.body, locale)
          const ctaLabel = resolveLocalized(block.cta_label, locale)
          return (
            <div
              key={block.id}
              className="grid grid-cols-2 overflow-hidden rounded-lg ring-1 ring-gray-100 bg-white"
            >
              <div
                className={
                  reverse
                    ? 'order-2 relative aspect-[4/3] bg-gray-100'
                    : 'relative aspect-[4/3] bg-gray-100'
                }
              >
                {block.image && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={resolveOpusPassAssetUrl(block.image)}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}
              </div>
              <div
                className={
                  reverse
                    ? 'order-1 p-3 flex flex-col justify-center'
                    : 'p-3 flex flex-col justify-center'
                }
              >
                <p className="text-[11px] font-bold text-gray-900 leading-tight line-clamp-2">
                  {headline || 'Block headline'}
                </p>
                <p className="mt-1.5 text-[9px] text-gray-600 leading-snug line-clamp-3">
                  {body}
                </p>
                {ctaLabel && (
                  <span className="mt-2 inline-block w-fit rounded-full bg-[#1A1A1A] px-2 py-0.5 text-[8px] font-bold text-white">
                    {ctaLabel}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
