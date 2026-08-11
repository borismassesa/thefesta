'use client'

import { useEffect, useState, useTransition } from 'react'
import type {
  OpusPassGuestsFeatureCard,
  OpusPassGuestsFeaturesContent,
} from '@/lib/cms/opus-pass-guests-features'
import { cn } from '@/lib/utils'
import { BilingualField } from '@/components/cms/BilingualField'
import { LOCALES, LOCALE_LABELS, resolveLocalized, type Locale } from '@/lib/cms/localized'
import { useEditorActions } from '../EditorActionsContext'
import {
  discardOpusPassGuestsFeaturesDraft,
  publishOpusPassGuestsFeatures,
  saveOpusPassGuestsFeaturesDraft,
} from './actions'

type Props = {
  initial: OpusPassGuestsFeaturesContent
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

export default function FeaturesEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<OpusPassGuestsFeaturesContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewLocale, setPreviewLocale] = useState<Locale>('en')
  const { bind, unbind } = useEditorActions()

  const setField = <K extends keyof OpusPassGuestsFeaturesContent>(
    key: K,
    value: OpusPassGuestsFeaturesContent[K],
  ) => setDraft((d) => ({ ...d, [key]: value }))

  const setCard = (idx: number, patch: Partial<OpusPassGuestsFeatureCard>) =>
    setDraft((d) => ({
      ...d,
      cards: d.cards.map((card, i) => (i === idx ? { ...card, ...patch } : card)),
    }))

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
      await saveOpusPassGuestsFeaturesDraft(draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })

  const handlePublish = () =>
    runAction(async () => {
      await saveOpusPassGuestsFeaturesDraft(draft)
      await publishOpusPassGuestsFeatures()
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })

  const handleDiscard = () =>
    runAction(async () => {
      await discardOpusPassGuestsFeaturesDraft()
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
        <h3 className="text-[15px] font-semibold text-gray-900">Feature grid content</h3>
        <p className="text-xs text-gray-500 -mt-3">
          The animated dashboard widgets (RSVP bars, pledge ticker, charts) are fixed illustration. Edit the
          section header and the three feature cards below.
        </p>

        <FieldGroup label="Section header">
          <BilingualField
            label="Heading"
            value={draft.heading}
            onChange={(v) => setField('heading', v)}
            placeholder="Everything your guests need, in one place"
          />
          <BilingualField
            label="Description"
            value={draft.description}
            onChange={(v) => setField('description', v)}
            multiline
          />
        </FieldGroup>

        {draft.cards.map((card, idx) => (
          <FieldGroup
            key={card.id}
            label={`${idx + 1} · ${resolveLocalized(card.title, previewLocale) || card.id} card`}
          >
            <BilingualField
              label="Title"
              value={card.title}
              onChange={(v) => setCard(idx, { title: v })}
            />
            <BilingualField
              label="Description"
              value={card.description}
              onChange={(v) => setCard(idx, { description: v })}
              multiline
            />
            <BilingualField
              label="CTA label"
              value={card.cta_label}
              onChange={(v) => setCard(idx, { cta_label: v })}
            />
            <Field label="CTA link">
              <input
                type="text"
                value={card.cta_href}
                onChange={(e) => setCard(idx, { cta_href: e.target.value })}
                className={inputCls}
              />
            </Field>
          </FieldGroup>
        ))}
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
          <div className="text-center mb-5">
            <h2 className="text-base font-serif font-medium text-gray-900 mb-1.5">
              {resolveLocalized(draft.heading, previewLocale) || 'Section heading'}
            </h2>
            <p className="text-[10px] text-gray-700 leading-relaxed">
              {resolveLocalized(draft.description, previewLocale)}
            </p>
          </div>
          <div className="space-y-3">
            {draft.cards.map((card) => (
              <div key={card.id} className="rounded-lg border border-gray-200 p-3">
                <p className="text-xs font-bold text-gray-900">
                  {resolveLocalized(card.title, previewLocale) || 'Card title'}
                </p>
                <p className="text-[10px] text-gray-600 leading-relaxed mt-1">
                  {resolveLocalized(card.description, previewLocale)}
                </p>
                <p className="text-[10px] font-semibold text-[#b97fd0] mt-1.5">
                  {resolveLocalized(card.cta_label, previewLocale)} →
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
