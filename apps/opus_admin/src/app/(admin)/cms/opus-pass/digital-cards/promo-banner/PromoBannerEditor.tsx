'use client'

import { useEffect, useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import type { OpusPassDigitalCardsPromoBannerContent } from '@/lib/cms/opus-pass-digital-cards-promo-banner'
import { BilingualField } from '@/components/cms/BilingualField'
import { LOCALES, LOCALE_LABELS, resolveLocalized, type Locale } from '@/lib/cms/localized'
import { cn } from '@/lib/utils'
import { useEditorActions } from '../EditorActionsContext'
import {
  discardOpusPassDigitalCardsPromoBannerDraft,
  publishOpusPassDigitalCardsPromoBanner,
  saveOpusPassDigitalCardsPromoBannerDraft,
} from './actions'

type Props = {
  initial: OpusPassDigitalCardsPromoBannerContent
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

export default function PromoBannerEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<OpusPassDigitalCardsPromoBannerContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewLocale, setPreviewLocale] = useState<Locale>('en')
  const { bind, unbind } = useEditorActions()

  const set = <K extends keyof OpusPassDigitalCardsPromoBannerContent>(
    key: K,
    value: OpusPassDigitalCardsPromoBannerContent[K],
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
      await saveOpusPassDigitalCardsPromoBannerDraft(draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })

  const handlePublish = () =>
    runAction(async () => {
      await saveOpusPassDigitalCardsPromoBannerDraft(draft)
      await publishOpusPassDigitalCardsPromoBanner()
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })

  const handleDiscard = () =>
    runAction(async () => {
      await discardOpusPassDigitalCardsPromoBannerDraft()
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
        <h3 className="text-[15px] font-semibold text-gray-900">Promo banner content</h3>
        <p className="text-xs text-gray-500 leading-relaxed">
          Shown at the top of both <code className="bg-gray-100 px-1 rounded">/digital-cards/catalog</code>{' '}
          and every <code className="bg-gray-100 px-1 rounded">/digital-cards/&lt;category&gt;</code> page.
        </p>

        <FieldGroup label="Copy">
          <BilingualField
            label="Eyebrow (bold uppercase label)"
            value={draft.eyebrow}
            onChange={(v) => set('eyebrow', v)}
            placeholder="40% off"
          />
          <BilingualField
            label="Body"
            value={draft.body}
            onChange={(v) => set('body', v)}
            placeholder="wedding paper with code"
          />
          <Field label="Promo code (leave empty to hide)">
            <input
              type="text"
              value={draft.promo_code}
              onChange={(e) => set('promo_code', e.target.value)}
              placeholder="KARIBU40"
              className={`${inputCls} font-mono`}
            />
          </Field>
        </FieldGroup>

        <FieldGroup label="Background">
          <Field label="Banner background colour (hex)">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={draft.background_color}
                onChange={(e) => set('background_color', e.target.value)}
                className="w-10 h-10 rounded border border-gray-200 p-0 overflow-hidden cursor-pointer"
              />
              <input
                type="text"
                value={draft.background_color}
                onChange={(e) => set('background_color', e.target.value)}
                placeholder="#FCE9C2"
                className={`${inputCls} flex-1 font-mono text-[12px]`}
              />
              <button
                type="button"
                onClick={() => set('background_color', '#FCE9C2')}
                className="p-1 text-gray-400 hover:text-gray-700 shrink-0"
                title="Reset to default"
                aria-label="Reset background colour"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </Field>
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
        <PromoBannerPreview content={draft} locale={previewLocale} />
      </div>
    </div>
  )
}

function PromoBannerPreview({
  content,
  locale,
}: {
  content: OpusPassDigitalCardsPromoBannerContent
  locale: Locale
}) {
  return (
    <div
      className="border-b border-[#E8D9A7]/50 py-2.5 px-3 rounded"
      style={{ backgroundColor: content.background_color || '#FCE9C2' }}
    >
      <div className="flex items-center justify-center gap-2 text-center flex-wrap">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#1A1A1A]">
          {resolveLocalized(content.eyebrow, locale) || 'Eyebrow'}
        </span>
        <span className="text-[11px] text-[#1A1A1A]/85">
          {resolveLocalized(content.body, locale)}
          {content.promo_code && (
            <>
              {' '}
              <strong className="font-bold text-[#1A1A1A]">{content.promo_code}</strong>
            </>
          )}
        </span>
      </div>
    </div>
  )
}
