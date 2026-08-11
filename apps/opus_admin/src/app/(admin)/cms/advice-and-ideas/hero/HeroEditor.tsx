'use client'

import { useEffect, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { AdviceHeroContent } from '@/lib/cms/advice-ideas'
import { useEditorActions } from '../EditorActionsContext'
import { Card, CharCount, Field, FieldGroup, inputCls } from '../_ui'
import { discardAdvicePageDraft, publishAdvicePage, saveAdvicePageDraft } from '../page-actions'

type Props = { initial: AdviceHeroContent; hasDraft: boolean }

export default function HeroEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<AdviceHeroContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [rotatingIndex, setRotatingIndex] = useState(0)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const { bind, unbind } = useEditorActions()

  const set = <K extends keyof AdviceHeroContent>(key: K, value: AdviceHeroContent[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const updateWord = (i: number, v: string) =>
    set(
      'rotating_words',
      draft.rotating_words.map((w, idx) => (idx === i ? v : w))
    )
  const removeWord = (i: number) =>
    set(
      'rotating_words',
      draft.rotating_words.filter((_, idx) => idx !== i)
    )
  const moveWord = (i: number, dir: -1 | 1) => {
    const t = i + dir
    if (t < 0 || t >= draft.rotating_words.length) return
    const next = [...draft.rotating_words]
    ;[next[i], next[t]] = [next[t], next[i]]
    set('rotating_words', next)
  }
  const addWord = () => set('rotating_words', [...draft.rotating_words, 'new word'])

  useEffect(() => {
    if (draft.rotating_words.length === 0) return
    const iv = setInterval(
      () => setRotatingIndex((i) => (i + 1) % draft.rotating_words.length),
      1500
    )
    return () => clearInterval(iv)
  }, [draft.rotating_words.length])

  const handleSaveDraft = () =>
    startTransition(async () => {
      await saveAdvicePageDraft('hero', draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })
  const handlePublish = () =>
    startTransition(async () => {
      await saveAdvicePageDraft('hero', draft)
      await publishAdvicePage('hero')
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })
  const handleDiscard = () =>
    startTransition(async () => {
      await discardAdvicePageDraft('hero')
      setDraft(initial)
      setHasDraft(false)
      setMessage('Draft discarded.')
    })

  useEffect(() => {
    bind({
      hasDraft,
      pending,
      message,
      onSaveDraft: handleSaveDraft,
      onPublish: handlePublish,
      onDiscard: handleDiscard,
    })
    return () => unbind()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDraft, pending, message, draft])

  const currentWord = draft.rotating_words[rotatingIndex] ?? ''

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6 items-start">
      <Card title="Hero headline & copy">
        <FieldGroup label="Headline structure">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Line 1 (static)">
              <input
                type="text"
                value={draft.headline_prefix}
                onChange={(e) => set('headline_prefix', e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label={'Line 2 prefix (before the rotating word)'}>
              <input
                type="text"
                value={draft.headline_suffix_prefix}
                onChange={(e) => set('headline_suffix_prefix', e.target.value)}
                className={inputCls}
                placeholder='e.g. "that feels"'
              />
            </Field>
          </div>
        </FieldGroup>

        <FieldGroup
          label={`Rotating words (${draft.rotating_words.length}) — cycled on the second line`}
        >
          <div className="space-y-2">
            {draft.rotating_words.map((word, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={word}
                  onChange={(e) => updateWord(i, e.target.value)}
                  className={inputCls}
                />
                <IconBtn title="Move up" onClick={() => moveWord(i, -1)} disabled={i === 0}>
                  <ArrowUp className="w-3.5 h-3.5" />
                </IconBtn>
                <IconBtn
                  title="Move down"
                  onClick={() => moveWord(i, 1)}
                  disabled={i === draft.rotating_words.length - 1}
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </IconBtn>
                <IconBtn title="Remove" onClick={() => removeWord(i)} danger>
                  <Trash2 className="w-3.5 h-3.5" />
                </IconBtn>
              </div>
            ))}
            {draft.rotating_words.length === 0 && (
              <p className="text-xs text-gray-400">No rotating words — add at least one.</p>
            )}
          </div>
          <button data-opus-button="control"
            type="button"
            onClick={addWord}
            className="flex items-center gap-1 text-xs font-semibold text-[#7E5896] hover:text-[#5c3f72]"
          >
            <Plus className="w-3.5 h-3.5" />
            Add word
          </button>
        </FieldGroup>

        <Field label="Subheadline" hint={<CharCount value={draft.subheadline} max={320} />}>
          <textarea
            value={draft.subheadline}
            onChange={(e) => set('subheadline', e.target.value)}
            rows={3}
            className={inputCls}
          />
        </Field>

        <FieldGroup label="Primary CTA (accent pill)">
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
                placeholder="#editor-picks"
              />
            </Field>
          </div>
        </FieldGroup>

        <FieldGroup label="Secondary CTA (underlined link)">
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
                placeholder="#latest-stories"
              />
            </Field>
          </div>
        </FieldGroup>
      </Card>

      <Card title="Live preview" action={<span className="text-xs text-gray-400">Approximate</span>}>
        <div className="rounded-xl border border-gray-100 bg-neutral-50 p-6 text-center">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-black uppercase tracking-tighter leading-[1.15] text-[#1A1A1A]">
            <span className="block">{draft.headline_prefix || '—'}</span>
            <span className="block">
              {draft.headline_suffix_prefix}{' '}
              <span className="text-[#9E62BA]">{currentWord}</span>
            </span>
          </h1>
          <p className="mt-5 mx-auto max-w-xl text-sm text-gray-600 leading-relaxed">
            {draft.subheadline}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <span className="rounded-full bg-[#C9A0DC] px-5 py-2 text-xs font-bold text-[#1A1A1A]">
              {draft.primary_cta_label || 'Primary CTA'}
            </span>
            <span className="text-xs font-bold text-[#1A1A1A] underline underline-offset-4">
              {draft.secondary_cta_label || 'Secondary CTA'}
            </span>
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-3">
          Rotating word cycles live in the preview above.
        </p>
      </Card>
    </div>
  )
}

function IconBtn({
  title,
  onClick,
  disabled,
  danger,
  children,
}: {
  title: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button data-opus-button="danger" data-opus-button-size="medium"
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded-md transition-colors disabled:opacity-30 ${
        danger
          ? 'text-gray-500 hover:text-red-600 hover:bg-red-50'
          : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  )
}
