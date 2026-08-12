'use client'

import { useEffect, useState, useTransition, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { MediaUploadField } from '@/components/cms/MediaUploadField'
import { BilingualField } from '@/components/cms/BilingualField'
import DashboardPreview from '@/components/cms/opus-pass-dashboard/DashboardPreview'
import type {
  DashboardHeroContent,
  DashboardHeroMediaType,
  DashboardHeroSlug,
} from '@/lib/cms/opus-pass-dashboard-hero'
import type { DashboardCopyContent } from '@/lib/cms/opus-pass-dashboard-copy'
import { useEditorActions } from '../../EditorActionsContext'
import {
  discardDashboardHeroDraft,
  publishDashboardHero,
  saveDashboardHeroDraft,
} from './actions'

type Props = {
  slug: DashboardHeroSlug
  label: string
  initial: DashboardHeroContent
  hasDraft: boolean
  copy: DashboardCopyContent
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
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

function FieldGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="border border-gray-200 rounded-lg p-3 pt-2 space-y-3">
      <legend className="px-1 text-[11px] font-bold uppercase tracking-wider text-gray-500">
        {label}
      </legend>
      {children}
    </fieldset>
  )
}

export default function HeroEditor({
  slug,
  label,
  initial,
  hasDraft: initialHasDraft,
  copy,
}: Props) {
  const [draft, setDraft] = useState<DashboardHeroContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { bind, unbind } = useEditorActions()

  // When switching between dashboard slugs (the layout stays mounted), re-seed.
  useEffect(() => {
    setDraft(initial)
    setHasDraft(initialHasDraft)
    setMessage(null)
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  const set = <K extends keyof DashboardHeroContent>(key: K, value: DashboardHeroContent[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

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
      await saveDashboardHeroDraft(slug, draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })

  const handlePublish = () =>
    runAction(async () => {
      await saveDashboardHeroDraft(slug, draft)
      await publishDashboardHero(slug)
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })

  const handleDiscard = () =>
    runAction(async () => {
      await discardDashboardHeroDraft(slug)
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
        <h3 className="text-[15px] font-semibold text-gray-900">{label} hero content</h3>

        <FieldGroup label="Text">
          <BilingualField
            label="Eyebrow"
            value={draft.eyebrow}
            onChange={(v) => set('eyebrow', v)}
            placeholder="Dashboard"
            max={40}
          />
          <p className="-mt-1 text-[11px] text-gray-400">
            The live dashboard currently shows a plain text header — only the title and subtitle
            appear (see preview). Eyebrow and cover media are stored for a future layout.
          </p>
          <BilingualField
            label="Title"
            value={draft.title}
            onChange={(v) => set('title', v)}
            placeholder="Welcome back"
            max={80}
          />
          <BilingualField
            label="Subtitle"
            value={draft.subtitle}
            onChange={(v) => set('subtitle', v)}
            placeholder="Plan, send and track everything in one place…"
            multiline
            max={240}
          />
        </FieldGroup>

        <FieldGroup label="Cover media (optional)">
          <Field label="Media kind">
            <div className="flex gap-2">
              {(['none', 'image', 'video'] as DashboardHeroMediaType[]).map((kind) => {
                const isActive = draft.media_type === kind
                return (
                  <button data-opus-button="neutral" data-opus-button-size="small"
                    key={kind}
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        media_type: kind,
                        // Clear the URL when switching to 'none' so the public site falls back cleanly.
                        media_url: kind === 'none' ? '' : d.media_url,
                      }))
                    }
                    className={cn(
                      'flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold capitalize border transition-colors',
                      isActive
                        ? 'bg-[#F0DFF6] border-[#C9A0DC] text-[#7E5896]'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50',
                    )}
                  >
                    {kind === 'none' ? 'No media (gradient)' : kind}
                  </button>
                )
              })}
            </div>
          </Field>

          {draft.media_type !== 'none' && (
            <>
              <MediaUploadField
                label="Upload or paste a URL"
                value={draft.media_url}
                mediaType={draft.media_type}
                onChange={({ url, type }) =>
                  setDraft((d) => ({ ...d, media_url: url, media_type: type }))
                }
                pathPrefix={`opus-pass/dashboard-hero/${slug}`}
                previewAspect="aspect-[16/9]"
                previewWidth="max-w-md"
              />
              <BilingualField
                label="Alt text"
                value={draft.media_alt}
                onChange={(v) => set('media_alt', v)}
                placeholder="Couple celebrating at sunset"
              />
              <p className="-mt-1 text-[11px] text-gray-400">
                Describe the image for screen readers / accessibility.
              </p>
            </>
          )}
        </FieldGroup>
      </div>

      <div className="xl:sticky xl:top-6">
        <DashboardPreview slug={slug} hero={draft} copy={copy} />
      </div>
    </div>
  )
}
