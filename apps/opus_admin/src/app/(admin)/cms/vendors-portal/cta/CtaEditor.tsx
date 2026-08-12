'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Upload } from 'lucide-react'
import type { CtaContent } from '@/lib/cms/vendors-portal-cta'
import { uploadCmsMedia } from '@/lib/cms/upload-client'
import { cn } from '@/lib/utils'
import { BilingualField } from '@/components/cms/BilingualField'
import { LOCALES, LOCALE_LABELS, resolveLocalized, type Locale } from '@/lib/cms/localized'
import { useEditorActions } from '../EditorActionsContext'
import {
  discardCtaDraft,
  publishCta,
  saveCtaDraft,
} from './actions'

type Props = { initial: CtaContent; hasDraft: boolean }

const HEADLINE_MAX = 30
const SUBHEAD_MAX = 200
const FOOTNOTE_MAX = 80

function resolveMediaUrl(url: string): string {
  if (!url) return ''
  if (/^https?:\/\//.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return url
  if (url.startsWith('/')) {
    const base = process.env.NEXT_PUBLIC_WEBSITE_URL ?? ''
    return base ? `${base}${url}` : url
  }
  return url
}

export default function CtaEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<CtaContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [previewLocale, setPreviewLocale] = useState<Locale>('en')
  const { bind, unbind } = useEditorActions()

  const setField = <K extends keyof CtaContent>(key: K, value: CtaContent[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const handleUpload = (file: File) => {
    startTransition(async () => {
      try {
        const { url } = await uploadCmsMedia(file, 'vendors-portal/cta', 'image')
        setField('background_image_url', url)
        setMessage('Background uploaded.')
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        setMessage(`Upload failed: ${detail}`)
      }
    })
  }

  const handleSaveDraft = () =>
    startTransition(async () => {
      await saveCtaDraft(draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })
  const handlePublish = () =>
    startTransition(async () => {
      await saveCtaDraft(draft)
      await publishCta()
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })
  const handleDiscard = () =>
    startTransition(async () => {
      await discardCtaDraft()
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
          {/* Background */}
          <Card title="Background image">
            <BackgroundField
              value={draft.background_image_url}
              onChange={(v) => setField('background_image_url', v)}
              onUpload={handleUpload}
              pending={pending}
            />
          </Card>

          {/* Copy */}
          <Card title="Copy">
            <BilingualField
              label="Eyebrow"
              value={draft.eyebrow}
              onChange={(v) => setField('eyebrow', v)}
            />
            <FieldGroup label="Headline (3 lines — line 3 takes accent color)">
              <BilingualField
                label="Line 1"
                value={draft.headline_line_1}
                onChange={(v) => setField('headline_line_1', v)}
                max={HEADLINE_MAX}
              />
              <BilingualField
                label="Line 2"
                value={draft.headline_line_2}
                onChange={(v) => setField('headline_line_2', v)}
                max={HEADLINE_MAX}
              />
              <BilingualField
                label="Line 3"
                value={draft.headline_line_3}
                onChange={(v) => setField('headline_line_3', v)}
                max={HEADLINE_MAX}
              />
            </FieldGroup>
            <BilingualField
              label="Subheadline"
              value={draft.subheadline}
              onChange={(v) => setField('subheadline', v)}
              multiline
              rows={2}
              max={SUBHEAD_MAX}
            />
          </Card>

          {/* Button */}
          <Card title="Call to action">
            <FieldGroup label="Button">
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
                  placeholder="/path or https://…"
                />
              </Field>
            </FieldGroup>
            <BilingualField
              label="Footnote (under button)"
              value={draft.footnote}
              onChange={(v) => setField('footnote', v)}
              max={FOOTNOTE_MAX}
            />
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
          <CtaPreview content={draft} locale={previewLocale} />
        </div>
      </div>
    </div>
  )
}

function BackgroundField({
  value, onChange, onUpload, pending,
}: {
  value: string
  onChange: (v: string) => void
  onUpload: (file: File) => void
  pending: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [errored, setErrored] = useState(false)
  const resolved = resolveMediaUrl(value)

  useEffect(() => {
    setErrored(false)
  }, [resolved])

  return (
    <div className="space-y-2">
      <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-100 aspect-video relative">
        {resolved && !errored ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={resolved}
            src={resolved}
            alt=""
            onError={() => setErrored(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">
              {value ? 'Image not previewable' : 'No image set'}
            </span>
            {value && (
              <span className="text-[11px] text-gray-500 break-all max-w-full px-4">{value}</span>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
          placeholder="https://… or /assets/…"
        />
        <button data-opus-button="control"
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-700 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50 shrink-0"
        >
          <Upload className="w-4 h-4" />
          Upload
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onUpload(f)
          }}
        />
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] space-y-4">
      <h3 className="text-[15px] font-semibold text-gray-900">{title}</h3>
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

function CtaPreview({ content, locale }: { content: CtaContent; locale: Locale }) {
  const bg = resolveMediaUrl(content.background_image_url)
  const eyebrow = resolveLocalized(content.eyebrow, locale)
  const line1 = resolveLocalized(content.headline_line_1, locale)
  const line2 = resolveLocalized(content.headline_line_2, locale)
  const line3 = resolveLocalized(content.headline_line_3, locale)
  const subheadline = resolveLocalized(content.subheadline, locale)
  const ctaLabel = resolveLocalized(content.cta_label, locale)
  const footnote = resolveLocalized(content.footnote, locale)
  return (
    <div className="rounded-2xl overflow-hidden relative aspect-[4/3] flex flex-col items-center justify-center text-center p-6">
      {bg && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={bg} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative z-10 flex flex-col items-center max-w-xs">
        <span className="text-[#C9A0DC] text-[9px] font-bold uppercase tracking-widest mb-3">
          {eyebrow}
        </span>
        <h2 className="text-2xl font-black uppercase tracking-tighter leading-[0.9] text-white mb-3">
          {line1}<br />
          {line2}<br />
          <span className="text-[#C9A0DC]">{line3}</span>
        </h2>
        <p className="text-white/90 text-[10px] leading-relaxed mb-3">{subheadline}</p>
        <span className="bg-[#C9A0DC] text-[#1A1A1A] px-4 py-2 rounded-full font-bold text-xs">
          {ctaLabel}
        </span>
        <p className="text-white/70 text-[9px] font-medium mt-2">{footnote}</p>
      </div>
    </div>
  )
}
