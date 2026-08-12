'use client'

import { useEffect, useState, useTransition } from 'react'
import { ArrowRight, Plus, Star, Trash2 } from 'lucide-react'
import type { OpusPassWebsitesHeroContent } from '@/lib/cms/opus-pass-websites-hero'
import { cn } from '@/lib/utils'
import { ImageUploadField } from '@/components/cms/ImageUploadField'
import { BilingualField } from '@/components/cms/BilingualField'
import { LOCALES, LOCALE_LABELS, resolveLocalized, type Locale } from '@/lib/cms/localized'
import { resolveOpusPassAssetUrl } from '@/lib/cms/opus-pass-asset-url'
import { useEditorActions } from '../EditorActionsContext'
import {
  discardOpusPassWebsitesHeroDraft,
  publishOpusPassWebsitesHero,
  saveOpusPassWebsitesHeroDraft,
} from './actions'

type Props = {
  initial: OpusPassWebsitesHeroContent
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

export default function HeroEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<OpusPassWebsitesHeroContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewLocale, setPreviewLocale] = useState<Locale>('en')
  const { bind, unbind } = useEditorActions()

  const set = <K extends keyof OpusPassWebsitesHeroContent>(
    key: K,
    value: OpusPassWebsitesHeroContent[K],
  ) => setDraft((d) => ({ ...d, [key]: value }))

  // Avatar cluster (string[] of asset paths)
  const setAvatar = (idx: number, value: string) =>
    setDraft((d) => ({ ...d, avatars: d.avatars.map((a, i) => (i === idx ? value : a)) }))
  const addAvatar = () => setDraft((d) => ({ ...d, avatars: [...d.avatars, ''] }))
  const removeAvatar = (idx: number) =>
    setDraft((d) => ({ ...d, avatars: d.avatars.filter((_, i) => i !== idx) }))

  // Press wordmarks (string[])
  const setPress = (idx: number, value: string) =>
    setDraft((d) => ({ ...d, featured_in: d.featured_in.map((p, i) => (i === idx ? value : p)) }))
  const addPress = () => setDraft((d) => ({ ...d, featured_in: [...d.featured_in, ''] }))
  const removePress = (idx: number) =>
    setDraft((d) => ({ ...d, featured_in: d.featured_in.filter((_, i) => i !== idx) }))

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
      await saveOpusPassWebsitesHeroDraft(draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })

  const handlePublish = () =>
    runAction(async () => {
      await saveOpusPassWebsitesHeroDraft(draft)
      await publishOpusPassWebsitesHero()
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })

  const handleDiscard = () =>
    runAction(async () => {
      await discardOpusPassWebsitesHeroDraft()
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
          <p className="text-[11px] text-gray-500 leading-relaxed">
            The last word of line 1 is underlined, and a ⚡ is appended after line 2 — automatically on
            the live page.
          </p>
          <BilingualField
            label="Line 1"
            value={draft.headline_line_1}
            onChange={(v) => set('headline_line_1', v)}
            placeholder="Create your wedding website"
            max={60}
          />
          <BilingualField
            label="Line 2"
            value={draft.headline_line_2}
            onChange={(v) => set('headline_line_2', v)}
            placeholder="in just minutes"
            max={60}
          />
          <BilingualField
            label="Description"
            value={draft.description}
            onChange={(v) => set('description', v)}
            placeholder="Build a beautiful wedding website…"
            multiline
            rows={4}
            max={400}
          />
        </FieldGroup>

        <FieldGroup label="Primary CTA (filled pill)">
          <BilingualField
            label="Label"
            value={draft.primary_cta_label}
            onChange={(v) => set('primary_cta_label', v)}
            placeholder="Start your website"
            max={30}
          />
          <Field label="Destination URL">
            <input
              type="text"
              value={draft.primary_cta_href}
              onChange={(e) => set('primary_cta_href', e.target.value)}
              placeholder="/sign-up"
              className={inputCls}
            />
          </Field>
        </FieldGroup>

        <FieldGroup label="Secondary CTA (outline button)">
          <BilingualField
            label="Label"
            value={draft.secondary_cta_label}
            onChange={(v) => set('secondary_cta_label', v)}
            placeholder="Explore designs"
            max={30}
          />
          <Field label="Destination URL">
            <input
              type="text"
              value={draft.secondary_cta_href}
              onChange={(e) => set('secondary_cta_href', e.target.value)}
              placeholder="#designs"
              className={inputCls}
            />
          </Field>
        </FieldGroup>

        <FieldGroup label="Trust badge">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Star rating" hint="0–5">
              <input
                type="text"
                value={draft.rating}
                onChange={(e) => set('rating', e.target.value)}
                placeholder="4.5"
                className={inputCls}
              />
            </Field>
            <Field label="Couple count">
              <input
                type="text"
                value={draft.trust_count}
                onChange={(e) => set('trust_count', e.target.value)}
                placeholder="1000+"
                className={inputCls}
              />
            </Field>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Avatar cluster ({draft.avatars.length})
            </p>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              Couple photos shown beside the rating. Leave empty to use the built-in photos.
            </p>
            {draft.avatars.map((avatar, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <div className="flex-1">
                  <ImageUploadField
                    label={`Avatar ${idx + 1}`}
                    value={avatar}
                    onChange={(v) => setAvatar(idx, v)}
                    pathPrefix="opus-pass/websites/hero-avatars"
                    previewAspect="aspect-square"
                    previewWidth="max-w-[88px]"
                  />
                </div>
                <button data-opus-button="control"
                  type="button"
                  onClick={() => removeAvatar(idx)}
                  className="mt-6 p-1.5 text-gray-400 hover:text-red-600 shrink-0"
                  aria-label={`Remove avatar ${idx + 1}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
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
          </div>
        </FieldGroup>

        <FieldGroup label="As featured in">
          <p className="text-[11px] text-gray-500 leading-relaxed">
            Press wordmarks under the hero. Leave empty to use the built-in list.
          </p>
          {draft.featured_in.map((name, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setPress(idx, e.target.value)}
                placeholder="The Citizen"
                className={`${inputCls} flex-1`}
              />
              <button data-opus-button="control"
                type="button"
                onClick={() => removePress(idx)}
                className="p-1.5 text-gray-400 hover:text-red-600 shrink-0"
                aria-label={`Remove press name ${idx + 1}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button data-opus-button="neutral" data-opus-button-size="medium"
            type="button"
            onClick={addPress}
            className="flex items-center gap-2 text-sm font-medium text-[#7E5896] hover:text-[#5d3a78] px-3 py-2 rounded-lg border border-dashed border-[#C9A0DC] hover:bg-[#F0DFF6] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add press name
          </button>
        </FieldGroup>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] xl:sticky xl:top-6">
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
        <HeroPreview content={draft} locale={previewLocale} />
      </div>
    </div>
  )
}

function HeroPreview({ content, locale }: { content: OpusPassWebsitesHeroContent; locale: Locale }) {
  const headline1 = resolveLocalized(content.headline_line_1, locale)
  const headline2 = resolveLocalized(content.headline_line_2, locale)
  const description = resolveLocalized(content.description, locale)
  const primaryLabel = resolveLocalized(content.primary_cta_label, locale)
  const secondaryLabel = resolveLocalized(content.secondary_cta_label, locale)
  // Mirror LandingHero: underline the last word of line 1.
  const line1 = headline1.trim().replace(/,\s*$/, '')
  const lastSpace = line1.lastIndexOf(' ')
  const head = lastSpace === -1 ? '' : line1.slice(0, lastSpace + 1)
  const lastWord = lastSpace === -1 ? line1 : line1.slice(lastSpace + 1)
  const avatars = content.avatars.filter((a) => a.trim())
  const press = content.featured_in.filter((p) => p.trim())
  return (
    <div className="rounded-md bg-white px-4 py-6 text-center">
      {/* Trust badge */}
      <div className="flex items-center justify-center gap-2">
        <div className="flex -space-x-2">
          {(avatars.length > 0 ? avatars : ['', '', '']).slice(0, 5).map((src, i) => (
            <span
              key={i}
              className="inline-block h-7 w-7 overflow-hidden rounded-full ring-2 ring-white bg-gray-200"
            >
              {src ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={resolveOpusPassAssetUrl(src)} alt="" className="h-full w-full object-cover" />
              ) : null}
            </span>
          ))}
        </div>
        <div className="text-left">
          <div className="flex items-center gap-1 text-[#F59E0B]">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} size={10} className="fill-current" strokeWidth={0} />
            ))}
            <span className="text-[10px] font-extrabold text-[#1A1A1A]">{content.rating || '4.5'}</span>
          </div>
          <p className="text-[9px] leading-tight text-[#1A1A1A]/70">
            Trusted by <span className="font-bold text-[#1A1A1A]">{content.trust_count || '1000+'}</span> couples
          </p>
        </div>
      </div>

      {/* Headline */}
      <h1 className="mt-4 text-xl font-black tracking-tight leading-[1.1] text-[#1A1A1A]">
        {head}
        <span className="underline decoration-[#1A1A1A] decoration-2 underline-offset-2">{lastWord}</span>
        <br />
        {headline2 || 'Headline line 2'} <span aria-hidden>⚡</span>
      </h1>

      {/* Description */}
      <p className="mx-auto mt-3 max-w-sm text-[11px] leading-relaxed text-[#1A1A1A]/70 line-clamp-4">
        {description}
      </p>

      {/* CTAs */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <span className="inline-flex items-center rounded-full bg-[#C9A0DC] px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#1A1A1A]">
          {primaryLabel || 'Primary CTA'}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-[10px] font-semibold text-[#1A1A1A]">
          {secondaryLabel || 'Secondary CTA'}
          <ArrowRight size={11} aria-hidden="true" />
        </span>
      </div>

      {/* Press strip */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <span className="text-[8px] font-semibold uppercase tracking-[0.18em] text-[#1A1A1A]/40">
          As featured in
        </span>
        {(press.length > 0 ? press : ['The Citizen', 'Clouds FM', 'Bongo5']).map((name, i) => (
          <span key={i} className="text-[11px] font-bold text-[#1A1A1A]/40">
            {name}
          </span>
        ))}
      </div>
    </div>
  )
}
