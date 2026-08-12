'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, CheckCircle2, Circle, Plus, Trash2, Upload } from 'lucide-react'
import type {
  ChecklistItem,
  FeatureCard,
  FeatureIconKey,
  PricingComparisonContent,
} from '@/lib/cms/pricing-comparison'
import { FEATURE_ICON_OPTIONS, getFeatureIcon } from '@/lib/cms/pricing-comparison-icons'
import { uploadCmsMedia } from '@/lib/cms/upload-client'
import { cn } from '@/lib/utils'
import { useEditorActions } from '../EditorActionsContext'
import {
  discardPricingComparisonDraft,
  publishPricingComparison,
  savePricingComparisonDraft,
} from './actions'

type Props = {
  initial: PricingComparisonContent
  hasDraft: boolean
}

const HEADLINE_MAX = 40
const SUBHEAD_MAX = 200
const FEATURE_TITLE_MAX = 50
const FEATURE_BODY_MAX = 200

function resolveMediaUrl(url: string): string {
  if (!url) return ''
  if (/^https?:\/\//.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return url
  if (url.startsWith('/')) {
    const base = process.env.NEXT_PUBLIC_WEBSITE_URL ?? ''
    return base ? `${base}${url}` : url
  }
  return url
}

export default function PricingComparisonEditor({
  initial,
  hasDraft: initialHasDraft,
}: Props) {
  const [draft, setDraft] = useState<PricingComparisonContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const { bind, unbind } = useEditorActions()

  const setField = <K extends keyof PricingComparisonContent>(
    key: K,
    value: PricingComparisonContent[K]
  ) => setDraft((d) => ({ ...d, [key]: value }))

  // Checklist
  const updateChecklistItem = (id: string, patch: Partial<ChecklistItem>) =>
    setDraft((d) => ({
      ...d,
      checklist: d.checklist.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }))
  const removeChecklistItem = (id: string) =>
    setDraft((d) => ({ ...d, checklist: d.checklist.filter((it) => it.id !== id) }))
  const moveChecklistItem = (id: string, dir: -1 | 1) =>
    setDraft((d) => {
      const idx = d.checklist.findIndex((it) => it.id === id)
      const target = idx + dir
      if (idx < 0 || target < 0 || target >= d.checklist.length) return d
      const next = [...d.checklist]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...d, checklist: next }
    })
  const addChecklistItem = () =>
    setDraft((d) => ({
      ...d,
      checklist: [
        ...d.checklist,
        {
          id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          label: 'New checklist item',
          weeks: '4 wks left',
          done: false,
        },
      ],
    }))

  // Features
  const updateFeature = (id: string, patch: Partial<FeatureCard>) =>
    setDraft((d) => ({
      ...d,
      features: d.features.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }))
  const removeFeature = (id: string) =>
    setDraft((d) => ({ ...d, features: d.features.filter((it) => it.id !== id) }))
  const moveFeature = (id: string, dir: -1 | 1) =>
    setDraft((d) => {
      const idx = d.features.findIndex((it) => it.id === id)
      const target = idx + dir
      if (idx < 0 || target < 0 || target >= d.features.length) return d
      const next = [...d.features]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...d, features: next }
    })
  const addFeature = () =>
    setDraft((d) => ({
      ...d,
      features: [
        ...d.features,
        {
          id: `feat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          icon: 'sparkles' as FeatureIconKey,
          title: 'New feature',
          body: 'Describe what this feature does for couples.',
        },
      ],
    }))

  const handleSaveDraft = () =>
    startTransition(async () => {
      await savePricingComparisonDraft(draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })
  const handlePublish = () =>
    startTransition(async () => {
      await savePricingComparisonDraft(draft)
      await publishPricingComparison()
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })
  const handleDiscard = () =>
    startTransition(async () => {
      await discardPricingComparisonDraft()
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

  const uploadFor = (target: 'couple_image_url' | 'promo_image_url') => (file: File) => {
    startTransition(async () => {
      try {
        const { url } = await uploadCmsMedia(file, 'homepage/pricing-comparison', 'image')
        setField(target, url)
        setMessage('Image uploaded.')
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        setMessage(`Upload failed: ${detail}`)
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <div className="space-y-4">
          {/* Section copy */}
          <Card title="Section copy">
            <FieldGroup label="Headline">
              <Field
                label="Line 1"
                hint={<CharCount value={draft.headline_line_1} max={HEADLINE_MAX} />}
              >
                <input
                  type="text"
                  value={draft.headline_line_1}
                  onChange={(e) => setField('headline_line_1', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field
                label="Line 2"
                hint={<CharCount value={draft.headline_line_2} max={HEADLINE_MAX} />}
              >
                <input
                  type="text"
                  value={draft.headline_line_2}
                  onChange={(e) => setField('headline_line_2', e.target.value)}
                  className={inputCls}
                />
              </Field>
            </FieldGroup>

            <Field
              label="Subheadline"
              hint={<CharCount value={draft.subheadline} max={SUBHEAD_MAX} />}
            >
              <textarea
                value={draft.subheadline}
                onChange={(e) => setField('subheadline', e.target.value)}
                rows={2}
                className={inputCls}
              />
            </Field>

            <FieldGroup label="Call to action">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Label">
                  <input
                    type="text"
                    value={draft.cta_label}
                    onChange={(e) => setField('cta_label', e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Link">
                  <input
                    type="text"
                    value={draft.cta_href}
                    onChange={(e) => setField('cta_href', e.target.value)}
                    className={inputCls}
                    placeholder="/path or https://…"
                  />
                </Field>
              </div>
            </FieldGroup>
          </Card>

          {/* Bento images */}
          <Card title="Bento images">
            <ImageField
              label="Couple photo (left, tall)"
              value={draft.couple_image_url}
              onChange={(v) => setField('couple_image_url', v)}
              onUpload={uploadFor('couple_image_url')}
              pending={pending}
            />
            <ImageField
              label="Promo background (top right)"
              value={draft.promo_image_url}
              onChange={(v) => setField('promo_image_url', v)}
              onUpload={uploadFor('promo_image_url')}
              pending={pending}
            />
          </Card>

          {/* Promo overlay text */}
          <Card title="Promo overlay text">
            <FieldGroup label="Heading">
              <Field label="Line 1">
                <input
                  type="text"
                  value={draft.promo_heading_line_1}
                  onChange={(e) => setField('promo_heading_line_1', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Line 2">
                <input
                  type="text"
                  value={draft.promo_heading_line_2}
                  onChange={(e) => setField('promo_heading_line_2', e.target.value)}
                  className={inputCls}
                />
              </Field>
            </FieldGroup>
            <Field label="Subheading">
              <input
                type="text"
                value={draft.promo_subheading}
                onChange={(e) => setField('promo_subheading', e.target.value)}
                className={inputCls}
              />
            </Field>
          </Card>

          {/* Checklist */}
          <Card
            title="Checklist preview"
            count={draft.checklist.length}
          >
            <Field label="Checklist label">
              <input
                type="text"
                value={draft.checklist_label}
                onChange={(e) => setField('checklist_label', e.target.value)}
                className={inputCls}
              />
            </Field>

            <div className="space-y-1.5 mt-2">
              {draft.checklist.map((item, i) => (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  index={i}
                  total={draft.checklist.length}
                  onChange={(patch) => updateChecklistItem(item.id, patch)}
                  onRemove={() => removeChecklistItem(item.id)}
                  onMoveUp={() => moveChecklistItem(item.id, -1)}
                  onMoveDown={() => moveChecklistItem(item.id, 1)}
                />
              ))}
            </div>

            <button data-opus-button="control"
              type="button"
              onClick={addChecklistItem}
              className="w-full flex items-center justify-center gap-2 py-2 mt-2 border-2 border-dashed border-gray-200 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-900 hover:border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add checklist item
            </button>
            <p className="text-[11px] text-gray-400">
              Only the first 4 items are shown in the bento card.
            </p>
          </Card>

          {/* Feature cards */}
          <Card title="Feature cards" count={draft.features.length}>
            <div className="space-y-2">
              {draft.features.map((feat, i) => (
                <FeatureCardEditor
                  key={feat.id}
                  card={feat}
                  index={i}
                  total={draft.features.length}
                  onChange={(patch) => updateFeature(feat.id, patch)}
                  onRemove={() => removeFeature(feat.id)}
                  onMoveUp={() => moveFeature(feat.id, -1)}
                  onMoveDown={() => moveFeature(feat.id, 1)}
                />
              ))}
            </div>
            <button data-opus-button="control"
              type="button"
              onClick={addFeature}
              className="w-full flex items-center justify-center gap-2 py-2.5 mt-2 border-2 border-dashed border-gray-200 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-900 hover:border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add feature card
            </button>
          </Card>
        </div>

        {/* Live preview */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] font-semibold text-gray-900">Live preview</h3>
            <span className="text-xs text-gray-400">Approximate</span>
          </div>
          <PricingComparisonPreview content={draft} />
        </div>
      </div>
    </div>
  )
}

function Card({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-gray-900">{title}</h3>
        {typeof count === 'number' && (
          <span className="text-xs text-gray-400 tabular-nums">{count} item{count === 1 ? '' : 's'}</span>
        )}
      </div>
      {children}
    </div>
  )
}

function ImageField({
  label,
  value,
  onChange,
  onUpload,
  pending,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onUpload: (file: File) => void
  pending: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const resolved = resolveMediaUrl(value)
  const [errored, setErrored] = useState(false)

  // Reset error state when URL changes (e.g. after upload)
  useEffect(() => {
    setErrored(false)
  }, [resolved])

  return (
    <Field label={label}>
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
                <span className="text-[11px] text-gray-500 break-all max-w-full px-4">
                  {value}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => {
              onChange(e.target.value)
              setErrored(false)
            }}
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
              if (f) {
                onUpload(f)
                setErrored(false)
              }
            }}
          />
        </div>
      </div>
    </Field>
  )
}

function ChecklistRow({
  item,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  item: ChecklistItem
  index: number
  total: number
  onChange: (patch: Partial<ChecklistItem>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 group border border-transparent hover:border-gray-100">
      <button data-opus-button="control"
        type="button"
        onClick={() => onChange({ done: !item.done })}
        aria-label={item.done ? 'Mark not done' : 'Mark done'}
        className="text-gray-400 hover:text-gray-700 shrink-0"
      >
        {item.done ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
      </button>
      <input
        type="text"
        value={item.label}
        onChange={(e) => onChange({ label: e.target.value })}
        className="flex-1 min-w-0 px-2 py-1 bg-transparent border-0 text-sm text-gray-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#C9A0DC] rounded"
      />
      <input
        type="text"
        value={item.weeks}
        onChange={(e) => onChange({ weeks: e.target.value })}
        className="w-24 px-2 py-1 bg-transparent border-0 text-xs text-gray-500 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#C9A0DC] rounded text-right shrink-0"
        placeholder="3 wks left"
      />
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button data-opus-button="control"
          type="button"
          onClick={onMoveUp}
          disabled={index === 0}
          aria-label="Move up"
          className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button data-opus-button="control"
          type="button"
          onClick={onMoveDown}
          disabled={index === total - 1}
          aria-label="Move down"
          className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
        <button data-opus-button="control"
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

function FeatureCardEditor({
  card,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  card: FeatureCard
  index: number
  total: number
  onChange: (patch: Partial<FeatureCard>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
          Feature {index + 1}
        </span>
        <div className="flex items-center gap-0.5">
          <button data-opus-button="control"
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            aria-label="Move up"
            className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button data-opus-button="control"
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            aria-label="Move down"
            className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button data-opus-button="control"
            type="button"
            onClick={onRemove}
            aria-label="Remove"
            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <Field label="Icon">
        <FeatureIconPicker value={card.icon} onChange={(icon) => onChange({ icon })} />
      </Field>
      <Field
        label="Title"
        hint={<CharCount value={card.title} max={FEATURE_TITLE_MAX} />}
      >
        <input
          type="text"
          value={card.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className={inputCls}
        />
      </Field>
      <Field
        label="Body"
        hint={<CharCount value={card.body} max={FEATURE_BODY_MAX} />}
      >
        <textarea
          value={card.body}
          onChange={(e) => onChange({ body: e.target.value })}
          rows={3}
          className={inputCls}
        />
      </Field>
    </div>
  )
}

function FeatureIconPicker({
  value,
  onChange,
}: {
  value: FeatureIconKey
  onChange: (v: FeatureIconKey) => void
}) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {FEATURE_ICON_OPTIONS.map((opt) => {
        const Icon = opt.icon
        const isActive = opt.key === value
        return (
          <button data-opus-button="control"
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            title={opt.label}
            aria-label={opt.label}
            className={cn(
              'flex items-center justify-center aspect-square rounded-lg border transition-colors',
              isActive
                ? 'border-[#C9A0DC] bg-[#F0DFF6] text-[#7E5896]'
                : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'
            )}
          >
            <Icon className="w-4 h-4 stroke-[1.5]" />
          </button>
        )
      })}
    </div>
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

function PricingComparisonPreview({ content }: { content: PricingComparisonContent }) {
  const couple = resolveMediaUrl(content.couple_image_url)
  const promo = resolveMediaUrl(content.promo_image_url)
  const checklistShown = content.checklist.slice(0, 4)

  return (
    <div className="bg-[#C9A0DC] rounded-xl p-4 space-y-4">
      <div>
        <h2 className="text-xl font-black uppercase tracking-tighter leading-[0.95] text-[#1A1A1A]">
          <span className="block">{content.headline_line_1}</span>
          <span className="block">{content.headline_line_2}</span>
        </h2>
        <p className="text-xs text-[#1A1A1A]/60 mt-2 leading-relaxed">{content.subheadline}</p>
        <button data-opus-button="primary" data-opus-button-size="medium" className="mt-3 bg-[#1A1A1A] text-white text-[11px] font-bold px-4 py-2 rounded-full">
          {content.cta_label}
        </button>
      </div>

      <div className="grid grid-cols-2 grid-rows-2 gap-2 h-44">
        <div className="row-span-2 bg-gray-200 rounded-lg overflow-hidden">
          {couple ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={couple} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="flex items-center justify-center text-[10px] text-gray-500 h-full">No image</div>
          )}
        </div>
        <div
          className="rounded-lg flex flex-col justify-end gap-1 px-3 py-2 relative overflow-hidden bg-cover bg-center"
          style={{ backgroundImage: promo ? `url('${promo}')` : undefined }}
        >
          {!promo && <div className="absolute inset-0 bg-gray-200" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <p className="relative text-white text-sm font-black tracking-tighter leading-tight">
            {content.promo_heading_line_1}
            <br />
            {content.promo_heading_line_2}
          </p>
          <p className="relative text-white text-[9px] font-semibold leading-relaxed">
            {content.promo_subheading}
          </p>
        </div>
        <div className="bg-[#1A1A1A] rounded-lg flex flex-col justify-center gap-1 px-2 py-2 overflow-hidden">
          <p className="text-[8px] font-black uppercase tracking-widest text-white mb-0.5">
            {content.checklist_label}
          </p>
          {checklistShown.map((it) => (
            <div key={it.id} className="flex items-center gap-1.5">
              {it.done ? (
                <CheckCircle2 className="w-2.5 h-2.5 text-white shrink-0" />
              ) : (
                <Circle className="w-2.5 h-2.5 text-white/40 shrink-0" />
              )}
              <p
                className={cn(
                  'text-[9px] font-semibold truncate',
                  it.done ? 'line-through text-white/20' : 'text-white'
                )}
              >
                {it.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[#1A1A1A]/15">
        {content.features.map((feat) => {
          const Icon = getFeatureIcon(feat.icon)
          return (
            <div key={feat.id} className="space-y-1">
              <Icon className="w-4 h-4 text-[#1A1A1A]" />
              <h4 className="text-[#1A1A1A] font-black text-[10px] uppercase tracking-tight">
                {feat.title}
              </h4>
              <p className="text-[#1A1A1A]/60 text-[9px] leading-relaxed line-clamp-3">
                {feat.body}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
