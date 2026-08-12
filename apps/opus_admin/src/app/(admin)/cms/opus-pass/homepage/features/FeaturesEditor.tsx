'use client'

import { useEffect, useState, useTransition } from 'react'
import { ChevronsDownUp, ChevronsUpDown, Plus, Trash2 } from 'lucide-react'
import type { OpusPassFeatureBlock, OpusPassFeaturesContent } from '@/lib/cms/opus-pass-features'
import { ImageUploadField } from '@/components/cms/ImageUploadField'
import { BilingualField } from '@/components/cms/BilingualField'
import { CollapsibleCard } from '@/components/cms/CollapsibleCard'
import {
  LOCALES,
  LOCALE_LABELS,
  resolveLocalized,
  type Locale,
  type LocalizedText,
} from '@/lib/cms/localized'
import { resolveOpusPassAssetUrl } from '@/lib/cms/opus-pass-asset-url'
import { cn } from '@/lib/utils'
import { useEditorActions } from '../EditorActionsContext'
import {
  discardOpusPassFeaturesDraft,
  publishOpusPassFeatures,
  saveOpusPassFeaturesDraft,
} from './actions'

type Props = {
  initial: OpusPassFeaturesContent
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

function randomId(): string {
  return `block-${Math.random().toString(36).slice(2, 9)}`
}

export default function FeaturesEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<OpusPassFeaturesContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initial))
  const isDirty = JSON.stringify(draft) !== savedSnapshot
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewLocale, setPreviewLocale] = useState<Locale>('en')
  const { bind, unbind } = useEditorActions()

  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([0]))
  const toggleExpanded = (idx: number) =>
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  const expandAll = () => setExpanded(new Set(draft.blocks.map((_, i) => i)))
  const collapseAll = () => setExpanded(new Set())

  const setField = <K extends keyof OpusPassFeaturesContent>(key: K, value: OpusPassFeaturesContent[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const setBlock = (idx: number, patch: Partial<OpusPassFeatureBlock>) =>
    setDraft((d) => ({
      ...d,
      blocks: d.blocks.map((b, i) => (i === idx ? { ...b, ...patch } : b)),
    }))

  const setPill = (blockIdx: number, pillIdx: number, value: LocalizedText) =>
    setDraft((d) => ({
      ...d,
      blocks: d.blocks.map((b, i) =>
        i === blockIdx
          ? { ...b, pills: b.pills.map((p, j) => (j === pillIdx ? value : p)) }
          : b
      ),
    }))
  const addPill = (blockIdx: number) =>
    setDraft((d) => ({
      ...d,
      blocks: d.blocks.map((b, i) =>
        i === blockIdx ? { ...b, pills: [...b.pills, { en: '', sw: '' }] } : b
      ),
    }))
  const removePill = (blockIdx: number, pillIdx: number) =>
    setDraft((d) => ({
      ...d,
      blocks: d.blocks.map((b, i) =>
        i === blockIdx ? { ...b, pills: b.pills.filter((_, j) => j !== pillIdx) } : b
      ),
    }))

  const addBlock = () =>
    setDraft((d) => ({
      ...d,
      blocks: [
        ...d.blocks,
        {
          id: randomId(),
          reverse: d.blocks.length % 2 === 1,
          media_main: '',
          media_secondary: '',
          media_overlay: '',
          overlay_eyebrow: '',
          overlay_caption_line_1: '',
          overlay_caption_line_2: '',
          headline_line_1: '',
          headline_line_2: '',
          body: '',
          pills: [],
          primary_cta_label: '',
          primary_cta_href: '',
          secondary_cta_label: '',
          secondary_cta_href: '',
        },
      ],
    }))

  const removeBlock = (idx: number) =>
    setDraft((d) => ({ ...d, blocks: d.blocks.filter((_, i) => i !== idx) }))

  const moveBlock = (idx: number, delta: number) =>
    setDraft((d) => {
      const next = [...d.blocks]
      const target = idx + delta
      if (target < 0 || target >= next.length) return d
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...d, blocks: next }
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
      await saveOpusPassFeaturesDraft(draft)
      setHasDraft(true)
      setSavedSnapshot(JSON.stringify(draft))
      setMessage('Draft saved.')
    })

  const handlePublish = () =>
    runAction(async () => {
      await saveOpusPassFeaturesDraft(draft)
      await publishOpusPassFeatures()
      setHasDraft(false)
      setSavedSnapshot(JSON.stringify(draft))
      setMessage('Published — changes are live.')
    })

  const handleDiscard = () =>
    runAction(async () => {
      await discardOpusPassFeaturesDraft()
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
        <h3 className="text-[15px] font-semibold text-gray-900">Features content</h3>
      <FieldGroup label="Section header">
        <BilingualField
          label="Title"
          value={draft.header_title}
          onChange={(v) => setField('header_title', v)}
        />
        <BilingualField
          label="Subhead / description"
          value={draft.header_description}
          onChange={(v) => setField('header_description', v)}
          multiline
          rows={2}
        />
      </FieldGroup>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
            Feature blocks ({draft.blocks.length})
          </p>
          <div className="flex items-center gap-1">
            <button data-opus-button="control"
              type="button"
              onClick={expandAll}
              className="flex items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
            >
              <ChevronsUpDown className="w-3 h-3" />
              Expand all
            </button>
            <button data-opus-button="control"
              type="button"
              onClick={collapseAll}
              className="flex items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
            >
              <ChevronsDownUp className="w-3 h-3" />
              Collapse all
            </button>
          </div>
        </div>
        {draft.blocks.map((block, idx) => (
          <CollapsibleCard
            key={block.id}
            index={idx}
            title={
              `${resolveLocalized(block.headline_line_1, previewLocale)} ${resolveLocalized(
                block.headline_line_2,
                previewLocale
              )}`.trim() || 'New block'
            }
            subtitle={block.reverse ? 'reverse' : 'standard'}
            collapsed={!expanded.has(idx)}
            onToggle={() => toggleExpanded(idx)}
            onMoveUp={() => moveBlock(idx, -1)}
            onMoveDown={() => moveBlock(idx, 1)}
            onRemove={() => removeBlock(idx)}
            disableMoveUp={idx === 0}
            disableMoveDown={idx === draft.blocks.length - 1}
          >
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 mt-1">
              <input
                type="checkbox"
                checked={block.reverse}
                onChange={(e) => setBlock(idx, { reverse: e.target.checked })}
              />
              Reverse layout (image on right, text on left)
            </label>

            <BilingualField
              label="Headline — line 1"
              value={block.headline_line_1}
              onChange={(v) => setBlock(idx, { headline_line_1: v })}
            />
            <BilingualField
              label="Headline — line 2"
              value={block.headline_line_2}
              onChange={(v) => setBlock(idx, { headline_line_2: v })}
            />
            <BilingualField
              label="Body copy"
              value={block.body}
              onChange={(v) => setBlock(idx, { body: v })}
              multiline
              rows={3}
            />
            <div className="block">
              <div className="mb-1.5 text-xs font-semibold text-gray-600">Pills</div>
              <div className="space-y-3">
                {block.pills.map((pill, pillIdx) => (
                  <div key={pillIdx} className="flex items-start gap-2 rounded-lg border border-gray-200 p-3">
                    <div className="flex-1">
                      <BilingualField
                        label={`Pill ${pillIdx + 1}`}
                        value={pill}
                        onChange={(v) => setPill(idx, pillIdx, v)}
                        max={24}
                      />
                    </div>
                    <button data-opus-button="control"
                      type="button"
                      onClick={() => removePill(idx, pillIdx)}
                      className="mt-6 p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors shrink-0"
                      aria-label="Remove pill"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button data-opus-button="neutral" data-opus-button-size="medium"
                  type="button"
                  onClick={() => addPill(idx)}
                  className="flex items-center gap-2 text-sm font-medium text-[#7E5896] hover:text-[#5d3a78] px-3 py-2 rounded-lg border border-dashed border-[#C9A0DC] hover:bg-[#F0DFF6] transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add pill
                </button>
              </div>
            </div>

            <FieldGroup label="Media collage (2×2)">
              <ImageUploadField
                label="Main image (tall, spans 2 rows on the left)"
                value={block.media_main}
                onChange={(v) => setBlock(idx, { media_main: v })}
                pathPrefix="opus-pass/features"
                previewAspect="aspect-[3/4]"
                previewWidth="max-w-xs"
              />
              <ImageUploadField
                label="Secondary image (top-right)"
                value={block.media_secondary}
                onChange={(v) => setBlock(idx, { media_secondary: v })}
                pathPrefix="opus-pass/features"
                previewAspect="aspect-[4/3]"
                previewWidth="max-w-xs"
              />
              <ImageUploadField
                label="Overlay image (bottom-right, with caption)"
                value={block.media_overlay}
                onChange={(v) => setBlock(idx, { media_overlay: v })}
                pathPrefix="opus-pass/features"
                previewAspect="aspect-[4/3]"
                previewWidth="max-w-xs"
              />
              <BilingualField
                label="Overlay eyebrow (small uppercase label)"
                value={block.overlay_eyebrow}
                onChange={(v) => setBlock(idx, { overlay_eyebrow: v })}
              />
              <BilingualField
                label="Overlay caption — line 1"
                value={block.overlay_caption_line_1}
                onChange={(v) => setBlock(idx, { overlay_caption_line_1: v })}
              />
              <BilingualField
                label="Overlay caption — line 2"
                value={block.overlay_caption_line_2}
                onChange={(v) => setBlock(idx, { overlay_caption_line_2: v })}
              />
            </FieldGroup>

            <FieldGroup label="Primary CTA (filled)">
              <BilingualField
                label="Label"
                value={block.primary_cta_label}
                onChange={(v) => setBlock(idx, { primary_cta_label: v })}
              />
              <Field label="Destination URL">
                <input
                  type="text"
                  value={block.primary_cta_href}
                  onChange={(e) => setBlock(idx, { primary_cta_href: e.target.value })}
                  className={inputCls}
                />
              </Field>
            </FieldGroup>

            <FieldGroup label="Secondary CTA (underline)">
              <BilingualField
                label="Label"
                value={block.secondary_cta_label}
                onChange={(v) => setBlock(idx, { secondary_cta_label: v })}
              />
              <Field label="Destination URL">
                <input
                  type="text"
                  value={block.secondary_cta_href}
                  onChange={(e) => setBlock(idx, { secondary_cta_href: e.target.value })}
                  className={inputCls}
                />
              </Field>
            </FieldGroup>
          </CollapsibleCard>
        ))}
        <button data-opus-button="neutral" data-opus-button-size="medium"
          type="button"
          onClick={addBlock}
          className="flex items-center gap-2 text-sm font-medium text-[#7E5896] hover:text-[#5d3a78] px-3 py-2 rounded-lg border border-dashed border-[#C9A0DC] hover:bg-[#F0DFF6] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add block
        </button>
      </div>
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
        <FeaturesPreview content={draft} locale={previewLocale} />
      </div>
    </div>
  )
}

function FeaturesPreview({ content, locale }: { content: OpusPassFeaturesContent; locale: Locale }) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-base sm:text-lg font-serif font-bold text-gray-900 leading-tight">
          {resolveLocalized(content.header_title, locale) || 'Section title'}
        </h2>
        <p className="text-[11px] text-gray-600 mt-1.5 leading-relaxed">
          {resolveLocalized(content.header_description, locale) || 'Subhead'}
        </p>
      </div>
      <div className="space-y-8">
        {content.blocks.map((block) => (
          <FeatureBlockPreview key={block.id} block={block} locale={locale} />
        ))}
      </div>
    </div>
  )
}

function FeatureBlockPreview({ block, locale }: { block: OpusPassFeatureBlock; locale: Locale }) {
  const reverseClass = block.reverse ? 'sm:flex-row-reverse' : 'sm:flex-row'
  return (
    <div className={`flex flex-col ${reverseClass} items-center gap-3`}>
      <div className="flex-1 w-full grid grid-cols-2 grid-rows-2 gap-1 h-[120px]">
        <div className="row-span-2 rounded-md overflow-hidden bg-gray-100">
          {block.media_main ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={resolveOpusPassAssetUrl(block.media_main)} alt="" className="w-full h-full object-cover" />
          ) : null}
        </div>
        <div className="rounded-md overflow-hidden bg-gray-100">
          {block.media_secondary ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={resolveOpusPassAssetUrl(block.media_secondary)} alt="" className="w-full h-full object-cover" />
          ) : null}
        </div>
        <div className="rounded-md overflow-hidden bg-gray-100 relative">
          {block.media_overlay ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={resolveOpusPassAssetUrl(block.media_overlay)} alt="" className="w-full h-full object-cover" />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-1 left-1 right-1 text-white">
            <p className="text-[7px] font-semibold uppercase tracking-wider opacity-70">
              {resolveLocalized(block.overlay_eyebrow, locale)}
            </p>
            <p className="text-[8px] font-serif leading-tight">
              {resolveLocalized(block.overlay_caption_line_1, locale)}
              <br />
              {resolveLocalized(block.overlay_caption_line_2, locale)}
            </p>
          </div>
        </div>
      </div>
      <div className="flex-1 text-center sm:text-left">
        <h2 className="text-sm font-serif font-bold leading-tight text-gray-900 mb-1.5">
          {resolveLocalized(block.headline_line_1, locale)}
          <br />
          {resolveLocalized(block.headline_line_2, locale)}
        </h2>
        <p className="text-[10px] text-gray-600 mb-2 leading-relaxed line-clamp-3">
          {resolveLocalized(block.body, locale)}
        </p>
        <div className="flex flex-wrap justify-center sm:justify-start gap-1 mb-2">
          {block.pills.map((p, i) => (
            <span key={i} className="bg-gray-100 text-gray-700 text-[9px] font-semibold px-1.5 py-0.5 rounded-full">
              {resolveLocalized(p, locale)}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap justify-center sm:justify-start gap-1.5">
          <span className="inline-block bg-gray-900 text-white px-2 py-0.5 rounded-full text-[9px] font-medium">
            {resolveLocalized(block.primary_cta_label, locale) || 'Primary'}
          </span>
          <span className="inline-block text-gray-900 px-2 py-0.5 rounded-full text-[9px] font-medium underline">
            {resolveLocalized(block.secondary_cta_label, locale) || 'Secondary'}
          </span>
        </div>
      </div>
    </div>
  )
}
