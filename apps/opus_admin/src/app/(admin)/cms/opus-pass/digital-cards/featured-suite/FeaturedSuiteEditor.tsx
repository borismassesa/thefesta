'use client'

import { useEffect, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { OpusPassDigitalCardsFeaturedSuiteContent } from '@/lib/cms/opus-pass-digital-cards-featured-suite'
import { ImageUploadField } from '@/components/cms/ImageUploadField'
import { BilingualField } from '@/components/cms/BilingualField'
import {
  LOCALES,
  LOCALE_LABELS,
  resolveLocalized,
  type Locale,
  type MaybeLocalized,
} from '@/lib/cms/localized'
import { cn } from '@/lib/utils'
import { resolveOpusPassAssetUrl } from '@/lib/cms/opus-pass-asset-url'
import { useEditorActions } from '../EditorActionsContext'
import {
  discardOpusPassDigitalCardsFeaturedSuiteDraft,
  publishOpusPassDigitalCardsFeaturedSuite,
  saveOpusPassDigitalCardsFeaturedSuiteDraft,
} from './actions'

type Props = {
  initial: OpusPassDigitalCardsFeaturedSuiteContent
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

export default function FeaturedSuiteEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<OpusPassDigitalCardsFeaturedSuiteContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewLocale, setPreviewLocale] = useState<Locale>('en')
  const { bind, unbind } = useEditorActions()

  const set = <K extends keyof OpusPassDigitalCardsFeaturedSuiteContent>(
    key: K,
    value: OpusPassDigitalCardsFeaturedSuiteContent[K],
  ) => setDraft((d) => ({ ...d, [key]: value }))

  const setTrust = (idx: number, value: MaybeLocalized) =>
    setDraft((d) => ({ ...d, trust_strip: d.trust_strip.map((s, i) => (i === idx ? value : s)) }))

  const addTrust = () =>
    setDraft((d) => ({ ...d, trust_strip: [...d.trust_strip, ''] }))

  const removeTrust = (idx: number) =>
    setDraft((d) => ({ ...d, trust_strip: d.trust_strip.filter((_, i) => i !== idx) }))

  const moveTrust = (idx: number, delta: number) =>
    setDraft((d) => {
      const next = [...d.trust_strip]
      const target = idx + delta
      if (target < 0 || target >= next.length) return d
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...d, trust_strip: next }
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
      await saveOpusPassDigitalCardsFeaturedSuiteDraft(draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })

  const handlePublish = () =>
    runAction(async () => {
      await saveOpusPassDigitalCardsFeaturedSuiteDraft(draft)
      await publishOpusPassDigitalCardsFeaturedSuite()
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })

  const handleDiscard = () =>
    runAction(async () => {
      await discardOpusPassDigitalCardsFeaturedSuiteDraft()
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
        <h3 className="text-[15px] font-semibold text-gray-900">Featured Suite content</h3>

        <FieldGroup label="Image (full-bleed left panel)">
          <ImageUploadField
            label="Image"
            value={draft.image_url}
            onChange={(v) => set('image_url', v)}
            pathPrefix="opus-pass/invitations/featured-suite"
            previewAspect="aspect-[4/3]"
            previewWidth="max-w-xs"
          />
        </FieldGroup>

        <FieldGroup label="Headline">
          <BilingualField
            label="Line 1"
            value={draft.headline_line_1}
            onChange={(v) => set('headline_line_1', v)}
            placeholder="From Save the Date"
          />
          <BilingualField
            label="Line 2"
            value={draft.headline_line_2}
            onChange={(v) => set('headline_line_2', v)}
            placeholder="to Thank You"
          />
        </FieldGroup>

        <BilingualField
          label="Body copy"
          value={draft.body}
          onChange={(v) => set('body', v)}
          multiline
          rows={4}
        />

        <FieldGroup label="Primary CTA (filled)">
          <BilingualField
            label="Label"
            value={draft.primary_cta_label}
            onChange={(v) => set('primary_cta_label', v)}
          />
          <Field label="Destination URL">
            <input
              type="text"
              value={draft.primary_cta_href}
              onChange={(e) => set('primary_cta_href', e.target.value)}
              className={inputCls}
            />
          </Field>
        </FieldGroup>

        <FieldGroup label="Secondary CTA (underline link)">
          <BilingualField
            label="Label"
            value={draft.secondary_cta_label}
            onChange={(v) => set('secondary_cta_label', v)}
          />
          <Field label="Destination URL">
            <input
              type="text"
              value={draft.secondary_cta_href}
              onChange={(e) => set('secondary_cta_href', e.target.value)}
              className={inputCls}
            />
          </Field>
        </FieldGroup>

        <FieldGroup label="Trust strip (dot-separated items at the bottom)">
          {draft.trust_strip.map((item, idx) => (
            <div key={idx} className="rounded-lg border border-gray-100 bg-gray-50 p-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Item {idx + 1}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveTrust(idx, -1)}
                    disabled={idx === 0}
                    className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 shrink-0"
                    aria-label="Move item up"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveTrust(idx, 1)}
                    disabled={idx === draft.trust_strip.length - 1}
                    className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 shrink-0"
                    aria-label="Move item down"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeTrust(idx)}
                    className="p-1 text-gray-400 hover:text-red-600 shrink-0"
                    aria-label="Remove item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <BilingualField
                label=""
                value={item}
                onChange={(v) => setTrust(idx, v)}
                placeholder="e.g. Share via WhatsApp & SMS"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={addTrust}
            className="flex items-center gap-2 text-sm font-medium text-[#7E5896] hover:text-[#5d3a78] px-3 py-2 rounded-lg border border-dashed border-[#C9A0DC] hover:bg-[#F0DFF6] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add item
          </button>
        </FieldGroup>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] xl:sticky xl:top-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-semibold text-gray-900">Live preview</h3>
          <div className="inline-flex items-center rounded-full border border-gray-200 p-0.5 text-[11px] font-semibold">
            {LOCALES.map((l) => (
              <button
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
        <FeaturedSuitePreview content={draft} locale={previewLocale} />
      </div>
    </div>
  )
}

function FeaturedSuitePreview({
  content,
  locale,
}: {
  content: OpusPassDigitalCardsFeaturedSuiteContent
  locale: Locale
}) {
  return (
    <div className="relative overflow-hidden rounded-md bg-[#F5EFE3] grid grid-cols-1 sm:grid-cols-2">
      <div className="relative aspect-[4/3] sm:aspect-auto sm:min-h-[180px] bg-gray-100">
        {content.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={resolveOpusPassAssetUrl(content.image_url)} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : null}
      </div>
      <div className="px-4 py-5 flex flex-col justify-center">
        <h2 className="text-sm sm:text-base font-black uppercase tracking-tighter leading-[1] text-[#1A1A1A]">
          {resolveLocalized(content.headline_line_1, locale) || 'Headline 1'}
          <br />
          {resolveLocalized(content.headline_line_2, locale) || 'Headline 2'}
        </h2>
        <p className="mt-2 text-[10px] text-[#1A1A1A]/75 leading-relaxed line-clamp-4">
          {resolveLocalized(content.body, locale)}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-[#C9A0DC] text-[#1A1A1A] px-3 py-1 text-[9px] font-extrabold uppercase tracking-[0.1em]">
            {resolveLocalized(content.primary_cta_label, locale) || 'Primary'}
          </span>
          <span className="text-[9px] font-semibold text-[#1A1A1A] underline underline-offset-2 decoration-[#1A1A1A]/40">
            {resolveLocalized(content.secondary_cta_label, locale) || 'Secondary'} →
          </span>
        </div>
        <div className="mt-3 pt-2 border-t border-[#1A1A1A]/10 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-[#1A1A1A]/60">
          {content.trust_strip.map((item, i) => (
            <span key={i} className="flex items-center gap-2">
              {resolveLocalized(item, locale)}
              {i < content.trust_strip.length - 1 && <span aria-hidden className="text-[#1A1A1A]/25">·</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
