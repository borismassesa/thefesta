'use client'

import { useEffect, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type {
  OpusPassGuestsHeroContent,
  OpusPassGuestsHeroImage,
} from '@/lib/cms/opus-pass-guests-hero'
import { cn } from '@/lib/utils'
import { ImageUploadField } from '@/components/cms/ImageUploadField'
import { BilingualField } from '@/components/cms/BilingualField'
import { LOCALES, LOCALE_LABELS, resolveLocalized, type Locale } from '@/lib/cms/localized'
import { useEditorActions } from '../EditorActionsContext'
import {
  discardOpusPassGuestsHeroDraft,
  publishOpusPassGuestsHero,
  saveOpusPassGuestsHeroDraft,
} from './actions'

type Props = {
  initial: OpusPassGuestsHeroContent
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

export default function HeroEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<OpusPassGuestsHeroContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewLocale, setPreviewLocale] = useState<Locale>('en')
  const { bind, unbind } = useEditorActions()

  const setField = <K extends keyof OpusPassGuestsHeroContent>(
    key: K,
    value: OpusPassGuestsHeroContent[K],
  ) => setDraft((d) => ({ ...d, [key]: value }))

  // ── Avatars (image list) ──
  const setAvatar = (idx: number, value: string) =>
    setDraft((d) => ({ ...d, avatars: d.avatars.map((a, i) => (i === idx ? value : a)) }))
  const addAvatar = () => setDraft((d) => ({ ...d, avatars: [...d.avatars, ''] }))
  const removeAvatar = (idx: number) =>
    setDraft((d) => ({ ...d, avatars: d.avatars.filter((_, i) => i !== idx) }))
  const moveAvatar = (idx: number, delta: number) =>
    setDraft((d) => {
      const next = [...d.avatars]
      const target = idx + delta
      if (target < 0 || target >= next.length) return d
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...d, avatars: next }
    })

  // ── Collage (image + alt list) ──
  const setCollage = (idx: number, patch: Partial<OpusPassGuestsHeroImage>) =>
    setDraft((d) => ({
      ...d,
      collage: d.collage.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }))
  const addCollage = () =>
    setDraft((d) => ({ ...d, collage: [...d.collage, { src: '', alt: '' }] }))
  const removeCollage = (idx: number) =>
    setDraft((d) => ({ ...d, collage: d.collage.filter((_, i) => i !== idx) }))
  const moveCollage = (idx: number, delta: number) =>
    setDraft((d) => {
      const next = [...d.collage]
      const target = idx + delta
      if (target < 0 || target >= next.length) return d
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...d, collage: next }
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
      await saveOpusPassGuestsHeroDraft(draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })

  const handlePublish = () =>
    runAction(async () => {
      await saveOpusPassGuestsHeroDraft(draft)
      await publishOpusPassGuestsHero()
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })

  const handleDiscard = () =>
    runAction(async () => {
      await discardOpusPassGuestsHeroDraft()
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
        <h3 className="text-[15px] font-semibold text-gray-900">Hero content</h3>

        <FieldGroup label="Headline">
          <BilingualField
            label="Line 1"
            value={draft.headline_line_1}
            onChange={(v) => setField('headline_line_1', v)}
            placeholder="Your guest list, replying in"
          />
          <BilingualField
            label="Line 2 (highlighted)"
            value={draft.headline_line_2}
            onChange={(v) => setField('headline_line_2', v)}
            placeholder="real time"
          />
        </FieldGroup>

        <BilingualField
          label="Description"
          value={draft.description}
          onChange={(v) => setField('description', v)}
          multiline
        />

        <FieldGroup label="Primary CTA">
          <BilingualField
            label="Label"
            value={draft.primary_cta_label}
            onChange={(v) => setField('primary_cta_label', v)}
          />
          <Field label="Link">
            <input
              type="text"
              value={draft.primary_cta_href}
              onChange={(e) => setField('primary_cta_href', e.target.value)}
              className={inputCls}
            />
          </Field>
        </FieldGroup>

        <FieldGroup label="Secondary CTA">
          <BilingualField
            label="Label"
            value={draft.secondary_cta_label}
            onChange={(v) => setField('secondary_cta_label', v)}
          />
          <Field label="Link">
            <input
              type="text"
              value={draft.secondary_cta_href}
              onChange={(e) => setField('secondary_cta_href', e.target.value)}
              className={inputCls}
            />
          </Field>
        </FieldGroup>

        <FieldGroup label="Trust cluster">
          <BilingualField
            label="Bold lead (e.g. “Trusted by 500+”)"
            value={draft.trust_lead}
            onChange={(v) => setField('trust_lead', v)}
          />
          <BilingualField
            label="Sub line (e.g. “Tanzanian couples”)"
            value={draft.trust_rest}
            onChange={(v) => setField('trust_rest', v)}
          />
        </FieldGroup>

        <FieldGroup label={`Avatar cluster (${draft.avatars.length})`}>
          {draft.avatars.map((src, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <div className="flex-1">
                <ImageUploadField
                  label={`Avatar ${idx + 1}`}
                  value={src}
                  onChange={(next) => setAvatar(idx, next)}
                  pathPrefix="opus-pass/guests/avatars"
                  previewAspect="aspect-square"
                  previewWidth="max-w-[64px]"
                />
              </div>
              <div className="mt-6 flex flex-col">
                <button data-opus-button="control"
                  type="button"
                  onClick={() => moveAvatar(idx, -1)}
                  disabled={idx === 0}
                  className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded hover:bg-gray-100 transition-colors"
                  aria-label="Move avatar up"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button data-opus-button="control"
                  type="button"
                  onClick={() => moveAvatar(idx, 1)}
                  disabled={idx === draft.avatars.length - 1}
                  className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded hover:bg-gray-100 transition-colors"
                  aria-label="Move avatar down"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
                <button data-opus-button="control"
                  type="button"
                  onClick={() => removeAvatar(idx)}
                  className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                  aria-label="Remove avatar"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          <button data-opus-button="neutral" data-opus-button-size="medium"
            type="button"
            onClick={addAvatar}
            className="flex items-center gap-2 text-sm font-medium text-[#7E5896] hover:text-[#5d3a78] px-3 py-2 rounded-lg border border-dashed border-[#C9A0DC] hover:bg-[#F0DFF6] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add avatar
          </button>
        </FieldGroup>

        <FieldGroup label={`Photo collage (${draft.collage.length} — first 6 shown)`}>
          {draft.collage.map((image, idx) => (
            <div key={idx} className="rounded-lg border border-gray-200 p-3 space-y-2 relative">
              <div className="absolute top-2 right-2 flex items-center gap-0.5">
                <button data-opus-button="control"
                  type="button"
                  onClick={() => moveCollage(idx, -1)}
                  disabled={idx === 0}
                  className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded hover:bg-gray-100 transition-colors"
                  aria-label="Move image up"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button data-opus-button="control"
                  type="button"
                  onClick={() => moveCollage(idx, 1)}
                  disabled={idx === draft.collage.length - 1}
                  className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded hover:bg-gray-100 transition-colors"
                  aria-label="Move image down"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
                <button data-opus-button="control"
                  type="button"
                  onClick={() => removeCollage(idx)}
                  className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                  aria-label="Remove collage image"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <ImageUploadField
                label={`Image ${idx + 1}`}
                value={image.src}
                onChange={(next) => setCollage(idx, { src: next })}
                pathPrefix="opus-pass/guests/collage"
                previewAspect="aspect-[4/3]"
                previewWidth="max-w-[160px]"
              />
              <BilingualField
                label="Alt text"
                value={image.alt}
                onChange={(v) => setCollage(idx, { alt: v })}
              />
            </div>
          ))}
          <button data-opus-button="neutral" data-opus-button-size="medium"
            type="button"
            onClick={addCollage}
            className="flex items-center gap-2 text-sm font-medium text-[#7E5896] hover:text-[#5d3a78] px-3 py-2 rounded-lg border border-dashed border-[#C9A0DC] hover:bg-[#F0DFF6] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add collage image
          </button>
        </FieldGroup>
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
        <div className="text-center">
          <h2 className="text-xl font-black leading-tight text-gray-900">
            {resolveLocalized(draft.headline_line_1, previewLocale)}
            <br />
            <span className="bg-[#C9A0DC]/40 rounded px-1">
              {resolveLocalized(draft.headline_line_2, previewLocale)}
            </span>
          </h2>
          <p className="mt-3 text-[11px] text-gray-600 leading-relaxed">
            {resolveLocalized(draft.description, previewLocale)}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <span className="text-[10px] font-semibold text-white bg-[#C9A0DC] rounded-md px-2.5 py-1">
              {resolveLocalized(draft.primary_cta_label, previewLocale)}
            </span>
            <span className="text-[10px] font-semibold text-gray-700 border border-gray-300 rounded-md px-2.5 py-1">
              {resolveLocalized(draft.secondary_cta_label, previewLocale)}
            </span>
          </div>
          <p className="mt-4 text-[10px] text-gray-600">
            <span className="font-bold text-gray-900">
              {resolveLocalized(draft.trust_lead, previewLocale)}
            </span>{' '}
            · {resolveLocalized(draft.trust_rest, previewLocale)}
          </p>
        </div>
      </div>
    </div>
  )
}
