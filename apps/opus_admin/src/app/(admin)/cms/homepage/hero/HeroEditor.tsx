'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Pause, Play, Upload } from 'lucide-react'
import type { HeroContent } from '@/lib/cms/hero'
import { uploadCmsMedia } from '@/lib/cms/upload-client'
import { cn } from '@/lib/utils'
import { useEditorActions } from '../EditorActionsContext'
import { discardHeroDraft, publishHero, saveHeroDraft } from './actions'

type Props = {
  initial: HeroContent
  hasDraft: boolean
}

export default function HeroEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<HeroContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { bind, unbind } = useEditorActions()

  const set = <K extends keyof HeroContent>(key: K, value: HeroContent[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  // Server-action invocations all run inside startTransition. Any throw we
  // don't catch becomes an unhandled rejection in the browser — the admin
  // sees nothing change and assumes "Save" did its job. Wrap each entry
  // point so failures surface as visible red text instead.
  const runAction = (job: () => Promise<void>) =>
    startTransition(async () => {
      setError(null)
      try {
        await job()
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        setError(`That didn’t go through: ${detail}`)
        setMessage(null)
        console.error('[hero-editor] server action failed:', err)
      }
    })

  const handleSaveDraft = () =>
    runAction(async () => {
      await saveHeroDraft(draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })

  const handlePublish = () =>
    runAction(async () => {
      await saveHeroDraft(draft)
      await publishHero()
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })

  const handleDiscard = () =>
    runAction(async () => {
      await discardHeroDraft()
      setDraft(initial)
      setHasDraft(false)
      setMessage('Draft discarded.')
    })

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset the input so re-selecting the same file still fires onChange.
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('video/')) {
      setError(`That file is "${file.type || 'unknown'}" — please pick a video.`)
      return
    }
    runAction(async () => {
      const { url } = await uploadCmsMedia(file, 'homepage/hero', 'video')
      setDraft((d) => ({ ...d, media_url: url, media_type: 'video' }))
      setMessage('Video uploaded.')
    })
  }

  // Keep the layout's header action bar in sync with this editor's state.
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
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] space-y-5">
          <h3 className="text-[15px] font-semibold text-gray-900">Hero content</h3>

          <FieldGroup label="Headline">
            <Field label="Line 1" hint={<CharCount value={draft.headline_line_1} max={HEADLINE_MAX} />}>
              <input
                type="text"
                value={draft.headline_line_1}
                onChange={(e) => set('headline_line_1', e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Line 2" hint={<CharCount value={draft.headline_line_2} max={HEADLINE_MAX} />}>
              <input
                type="text"
                value={draft.headline_line_2}
                onChange={(e) => set('headline_line_2', e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Line 3" hint={<CharCount value={draft.headline_line_3} max={HEADLINE_MAX} />}>
              <input
                type="text"
                value={draft.headline_line_3}
                onChange={(e) => set('headline_line_3', e.target.value)}
                className={inputCls}
              />
            </Field>
          </FieldGroup>

          <Field label="Subheadline" hint={<CharCount value={draft.subheadline} max={SUBHEADLINE_MAX} />}>
            <textarea
              value={draft.subheadline}
              onChange={(e) => set('subheadline', e.target.value)}
              rows={3}
              className={inputCls}
            />
          </Field>

          <FieldGroup label="Primary CTA">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Label">
                <input
                  type="text"
                  value={draft.primary_cta_label}
                  onChange={(e) => set('primary_cta_label', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Link">
                <input
                  type="text"
                  value={draft.primary_cta_href}
                  onChange={(e) => set('primary_cta_href', e.target.value)}
                  className={inputCls}
                  placeholder="/path or https://…"
                />
              </Field>
            </div>
          </FieldGroup>

          <FieldGroup label="Secondary CTA">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Label">
                <input
                  type="text"
                  value={draft.secondary_cta_label}
                  onChange={(e) => set('secondary_cta_label', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Link">
                <input
                  type="text"
                  value={draft.secondary_cta_href}
                  onChange={(e) => set('secondary_cta_href', e.target.value)}
                  className={inputCls}
                  placeholder="/path or https://…"
                />
              </Field>
            </div>
          </FieldGroup>

          <Field label="Hero video">
            <div className="space-y-3">
              {draft.media_url ? (
                <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-100 aspect-video relative">
                  <video
                    key={draft.media_url}
                    src={resolveMediaUrl(draft.media_url)}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 aspect-video flex items-center justify-center">
                  <span className="text-xs text-gray-400">No video uploaded</span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <button data-opus-button="control"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
                  disabled={pending}
                >
                  <Upload className="w-4 h-4" />
                  {draft.media_url ? 'Replace video' : 'Upload video'}
                </button>
                {draft.media_url && (
                  <span className="text-xs text-gray-400 truncate min-w-0">
                    {draft.media_url.split('/').pop()}
                  </span>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                hidden
                onChange={handleUpload}
              />
              {error && (
                <p className="text-xs text-red-600 leading-snug">{error}</p>
              )}
            </div>
          </Field>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] font-semibold text-gray-900">Live preview</h3>
            <span className="text-xs text-gray-400">Approximate</span>
          </div>
          <HeroPreview content={draft} />
        </div>
      </div>
    </div>
  )
}

const HEADLINE_MAX = 60
const SUBHEADLINE_MAX = 200

function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: React.ReactNode
}) {
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
      <legend className="px-1 text-[11px] font-bold uppercase tracking-wider text-gray-500">
        {label}
      </legend>
      {children}
    </fieldset>
  )
}

function CharCount({ value, max }: { value: string; max: number }) {
  const len = (value ?? '').length
  const over = len > max
  const near = !over && len > max * 0.85
  return (
    <span
      className={cn(
        'tabular-nums font-medium',
        over ? 'text-red-500' : near ? 'text-amber-600' : 'text-gray-400'
      )}
    >
      {len}/{max}
    </span>
  )
}

const inputCls =
  'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] focus:border-transparent transition-all'

function resolveMediaUrl(url: string): string {
  if (!url) return ''
  if (/^https?:\/\//.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return url
  if (url.startsWith('/')) {
    const base = process.env.NEXT_PUBLIC_WEBSITE_URL ?? ''
    return base ? `${base}${url}` : url
  }
  return url
}

function HeroPreview({ content }: { content: HeroContent }) {
  const [playing, setPlaying] = useState(true)
  const [mediaError, setMediaError] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const resolvedUrl = resolveMediaUrl(content.media_url)

  // Reset error state when URL or type changes (e.g. after upload)
  useEffect(() => {
    setMediaError(false)
  }, [resolvedUrl, content.media_type])

  const togglePlay = () => {
    if (!videoRef.current) return
    if (playing) videoRef.current.pause()
    else videoRef.current.play().catch(() => {})
  }
  return (
    <div className="bg-white text-center">
      <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tighter leading-[0.95] text-[#1A1A1A]">
        {[content.headline_line_1, content.headline_line_2, content.headline_line_3]
          .filter((line) => line && line.trim().length > 0)
          .map((line, i) => (
            <span key={i} className="block">{line}</span>
          ))}
      </h1>
      <p className="mt-4 text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
        {content.subheadline}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <span className="bg-[#C9A0DC] text-[#1A1A1A] px-4 py-2 rounded-full font-bold text-xs">
          {content.primary_cta_label}
        </span>
        <span className="text-[#1A1A1A] font-bold text-xs underline underline-offset-4">
          {content.secondary_cta_label}
        </span>
      </div>
      <div className="mt-5 rounded-xl overflow-hidden relative aspect-video bg-gray-100">
        {!resolvedUrl || mediaError ? (
          <MediaFallback url={content.media_url} />
        ) : content.media_type === 'video' ? (
          <>
            <video
              ref={videoRef}
              key={resolvedUrl}
              src={resolvedUrl}
              autoPlay
              loop
              muted
              playsInline
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onError={() => setMediaError(true)}
              className="w-full h-full object-cover"
            />
            <button data-opus-button="control"
              type="button"
              onClick={togglePlay}
              aria-label={playing ? 'Pause preview' : 'Play preview'}
              className="absolute top-2 right-2 w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-sm text-[#1A1A1A]"
            >
              {playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
            </button>
          </>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolvedUrl}
            alt="Hero preview"
            onError={() => setMediaError(true)}
            className="w-full h-full object-cover"
          />
        )}
      </div>
    </div>
  )
}

function MediaFallback({ url }: { url: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">
        Media not previewable
      </span>
      <span className="text-[11px] text-gray-500 break-all max-w-full px-4">
        {url || 'No media URL set'}
      </span>
    </div>
  )
}
