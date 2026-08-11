'use client'

import { useEffect, useState, useTransition } from 'react'
import type { OpusPassHomepageWhyOpusPassContent } from '@/lib/cms/opus-pass-homepage-why-opus-pass'
import { ImageUploadField } from '@/components/cms/ImageUploadField'
import { BilingualField } from '@/components/cms/BilingualField'
import { LOCALES, LOCALE_LABELS, resolveLocalized, type Locale } from '@/lib/cms/localized'
import { resolveOpusPassAssetUrl } from '@/lib/cms/opus-pass-asset-url'
import { cn } from '@/lib/utils'
import { useEditorActions } from '../EditorActionsContext'
import {
  discardOpusPassHomepageWhyOpusPassDraft,
  publishOpusPassHomepageWhyOpusPass,
  saveOpusPassHomepageWhyOpusPassDraft,
} from './actions'

type Props = {
  initial: OpusPassHomepageWhyOpusPassContent
  hasDraft: boolean
}

const inputCls =
  'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] focus:border-transparent transition-all'

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

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="border border-gray-200 rounded-lg p-3 pt-2 space-y-3">
      <legend className="px-1 text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</legend>
      {children}
    </fieldset>
  )
}

export default function WhyOpusPassEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<OpusPassHomepageWhyOpusPassContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initial))
  const isDirty = JSON.stringify(draft) !== savedSnapshot
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewLocale, setPreviewLocale] = useState<Locale>('en')
  const { bind, unbind } = useEditorActions()

  const setField = <K extends keyof OpusPassHomepageWhyOpusPassContent>(
    key: K,
    value: OpusPassHomepageWhyOpusPassContent[K],
  ) => setDraft((d) => ({ ...d, [key]: value }))

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
      await saveOpusPassHomepageWhyOpusPassDraft(draft)
      setHasDraft(true)
      setSavedSnapshot(JSON.stringify(draft))
      setMessage('Draft saved.')
    })

  const handlePublish = () =>
    runAction(async () => {
      await saveOpusPassHomepageWhyOpusPassDraft(draft)
      await publishOpusPassHomepageWhyOpusPass()
      setHasDraft(false)
      setSavedSnapshot(JSON.stringify(draft))
      setMessage('Published — changes are live.')
    })

  const handleDiscard = () =>
    runAction(async () => {
      await discardOpusPassHomepageWhyOpusPassDraft()
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
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] space-y-5">
        <h3 className="text-[15px] font-semibold text-gray-900">Why OpusPass content</h3>

        <BilingualField
          label="Headline"
          value={draft.headline}
          onChange={(v) => setField('headline', v)}
          multiline
          rows={2}
          max={120}
        />

        <FieldGroup label="Main photo">
          <ImageUploadField
            label="Image"
            value={draft.main_image_url}
            onChange={(next) => setField('main_image_url', next)}
            pathPrefix="opus-pass/homepage/why-opus-pass"
            previewAspect="aspect-[3/4]"
            previewWidth="max-w-[200px]"
          />
          <BilingualField
            label="Alt text"
            value={draft.main_image_alt}
            onChange={(v) => setField('main_image_alt', v)}
            max={120}
          />
        </FieldGroup>

        <FieldGroup label="Floating product chip">
          <ImageUploadField
            label="Chip image"
            value={draft.chip_image_url}
            onChange={(next) => setField('chip_image_url', next)}
            pathPrefix="opus-pass/homepage/why-opus-pass"
            previewAspect="aspect-square"
            previewWidth="max-w-[80px]"
          />
          <BilingualField
            label="Chip title"
            value={draft.chip_title}
            onChange={(v) => setField('chip_title', v)}
            max={24}
          />
          <BilingualField
            label="Chip subtitle"
            value={draft.chip_subtitle}
            onChange={(v) => setField('chip_subtitle', v)}
            max={24}
          />
        </FieldGroup>

        <FieldGroup label="Floating CTA pill">
          <BilingualField
            label="Label"
            value={draft.floating_cta_label}
            onChange={(v) => setField('floating_cta_label', v)}
            max={20}
          />
          <Field label="Link">
            <input
              type="text"
              value={draft.floating_cta_href}
              onChange={(e) => setField('floating_cta_href', e.target.value)}
              className={inputCls}
            />
          </Field>
        </FieldGroup>

        <FieldGroup label="Right column copy">
          <BilingualField
            label="Sub-headline"
            value={draft.subheadline}
            onChange={(v) => setField('subheadline', v)}
            max={60}
          />
          <BilingualField
            label="Body"
            value={draft.body}
            onChange={(v) => setField('body', v)}
            multiline
            rows={4}
            max={320}
          />
        </FieldGroup>

        <FieldGroup label="Primary button">
          <BilingualField
            label="Label"
            value={draft.primary_button_label}
            onChange={(v) => setField('primary_button_label', v)}
            max={24}
          />
          <Field label="Link">
            <input
              type="text"
              value={draft.primary_button_href}
              onChange={(e) => setField('primary_button_href', e.target.value)}
              className={inputCls}
            />
          </Field>
        </FieldGroup>

        <FieldGroup label="Secondary button">
          <BilingualField
            label="Label"
            value={draft.secondary_button_label}
            onChange={(v) => setField('secondary_button_label', v)}
            max={24}
          />
          <Field label="Link">
            <input
              type="text"
              value={draft.secondary_button_href}
              onChange={(e) => setField('secondary_button_href', e.target.value)}
              className={inputCls}
            />
          </Field>
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
        <div>
          <h2 className="text-center text-base font-black leading-tight text-gray-900">
            {resolveLocalized(draft.headline, previewLocale)}
          </h2>
          <div className="mt-4 grid grid-cols-2 items-center gap-4">
            <div className="relative">
              <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-gray-100">
                {draft.main_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolveOpusPassAssetUrl(draft.main_image_url)}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-400">
                    No image
                  </div>
                )}
              </div>
              <div className="absolute -left-1 top-6 flex items-center gap-1.5 rounded-lg bg-white px-1.5 py-1 shadow ring-1 ring-black/5">
                <span className="relative h-6 w-6 shrink-0 overflow-hidden rounded bg-gray-100">
                  {draft.chip_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolveOpusPassAssetUrl(draft.chip_image_url)}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : null}
                </span>
                <span className="leading-tight">
                  <span className="block text-[9px] font-extrabold text-gray-900">
                    {resolveLocalized(draft.chip_title, previewLocale)}
                  </span>
                  <span className="block text-[8px] text-gray-500">
                    {resolveLocalized(draft.chip_subtitle, previewLocale)}
                  </span>
                </span>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-black text-gray-900">
                {resolveLocalized(draft.subheadline, previewLocale)}
              </h3>
              <p className="mt-2 text-[11px] text-gray-600 leading-relaxed line-clamp-5">
                {resolveLocalized(draft.body, previewLocale)}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="text-[10px] font-bold text-white bg-[#1A1A1A] rounded-full px-3 py-1.5">
                  {resolveLocalized(draft.primary_button_label, previewLocale)}
                </span>
                <span className="text-[10px] font-bold text-gray-900 border border-gray-300 rounded-full px-3 py-1.5">
                  {resolveLocalized(draft.secondary_button_label, previewLocale)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
