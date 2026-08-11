'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  FlipHorizontal,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react'
import type {
  FeatureBlock,
  FeatureMediaItem,
  FeaturePill,
  FeaturesContent,
} from '@/lib/cms/features'
import { uploadCmsMedia } from '@/lib/cms/upload-client'
import { cn } from '@/lib/utils'
import { useEditorActions } from '../EditorActionsContext'
import {
  discardFeaturesDraft,
  publishFeatures,
  saveFeaturesDraft,
} from './actions'

type Props = { initial: FeaturesContent; hasDraft: boolean }

const HEADLINE_MAX = 30
const BODY_MAX = 220

function resolveMediaUrl(url: string): string {
  if (!url) return ''
  if (/^https?:\/\//.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return url
  if (url.startsWith('/')) {
    const base = process.env.NEXT_PUBLIC_WEBSITE_URL ?? ''
    return base ? `${base}${url}` : url
  }
  return url
}

export default function FeaturesEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<FeaturesContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [openBlockId, setOpenBlockId] = useState<string | null>(initial.blocks[0]?.id ?? null)
  const { bind, unbind } = useEditorActions()

  const setField = <K extends keyof FeaturesContent>(key: K, value: FeaturesContent[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  // Blocks
  const updateBlock = (id: string, patch: Partial<FeatureBlock>) =>
    setDraft((d) => ({
      ...d,
      blocks: d.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }))
  const removeBlock = (id: string) =>
    setDraft((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id) }))
  const moveBlock = (id: string, dir: -1 | 1) =>
    setDraft((d) => {
      const idx = d.blocks.findIndex((b) => b.id === id)
      const t = idx + dir
      if (idx < 0 || t < 0 || t >= d.blocks.length) return d
      const next = [...d.blocks]
      ;[next[idx], next[t]] = [next[t], next[idx]]
      return { ...d, blocks: next }
    })
  const addBlock = () => {
    const id = `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setDraft((d) => ({
      ...d,
      blocks: [
        ...d.blocks,
        {
          id,
          reverse: d.blocks.length % 2 === 1,
          headline_line_1: 'New feature',
          headline_line_2: 'block.',
          body: 'Describe what this feature offers.',
          pills: [
            { id: 'p1', label: 'Highlight 1' },
            { id: 'p2', label: 'Highlight 2' },
          ],
          primary_cta_label: 'Learn more',
          primary_cta_href: '#',
          secondary_cta_label: 'See more',
          secondary_cta_href: '#',
          media_main: { type: 'image', url: '' },
          media_secondary: { type: 'image', url: '' },
          media_overlay: { type: 'image', url: '' },
          overlay_eyebrow: 'Eyebrow',
          overlay_caption_line_1: 'Caption line 1',
          overlay_caption_line_2: 'line 2',
        },
      ],
    }))
    setOpenBlockId(id)
  }

  // Pills (per block)
  const updatePill = (blockId: string, pillId: string, label: string) =>
    setDraft((d) => ({
      ...d,
      blocks: d.blocks.map((b) =>
        b.id === blockId
          ? { ...b, pills: b.pills.map((p) => (p.id === pillId ? { ...p, label } : p)) }
          : b
      ),
    }))
  const removePill = (blockId: string, pillId: string) =>
    setDraft((d) => ({
      ...d,
      blocks: d.blocks.map((b) =>
        b.id === blockId ? { ...b, pills: b.pills.filter((p) => p.id !== pillId) } : b
      ),
    }))
  const movePill = (blockId: string, pillId: string, dir: -1 | 1) =>
    setDraft((d) => ({
      ...d,
      blocks: d.blocks.map((b) => {
        if (b.id !== blockId) return b
        const idx = b.pills.findIndex((p) => p.id === pillId)
        const t = idx + dir
        if (idx < 0 || t < 0 || t >= b.pills.length) return b
        const next = [...b.pills]
        ;[next[idx], next[t]] = [next[t], next[idx]]
        return { ...b, pills: next }
      }),
    }))
  const addPill = (blockId: string) =>
    setDraft((d) => ({
      ...d,
      blocks: d.blocks.map((b) =>
        b.id === blockId
          ? {
              ...b,
              pills: [
                ...b.pills,
                {
                  id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  label: 'New pill',
                },
              ],
            }
          : b
      ),
    }))

  const handleSaveDraft = () =>
    startTransition(async () => {
      await saveFeaturesDraft(draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })
  const handlePublish = () =>
    startTransition(async () => {
      await saveFeaturesDraft(draft)
      await publishFeatures()
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })
  const handleDiscard = () =>
    startTransition(async () => {
      await discardFeaturesDraft()
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

  const uploadFor =
    (cb: (item: FeatureMediaItem) => void) =>
    (file: File) => {
      startTransition(async () => {
        try {
          const { url, type } = await uploadCmsMedia(file, 'homepage/features', 'media')
          cb({ url, type })
          setMessage('Media uploaded.')
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
          {/* Section header */}
          <Card title="Section header">
            <Field label="Eyebrow">
              <input
                type="text"
                value={draft.eyebrow}
                onChange={(e) => setField('eyebrow', e.target.value)}
                className={inputCls}
              />
            </Field>
            <FieldGroup label="Headline (2 lines)">
              <Field label="Line 1" hint={<CharCount value={draft.headline_line_1} max={HEADLINE_MAX} />}>
                <input
                  type="text"
                  value={draft.headline_line_1}
                  onChange={(e) => setField('headline_line_1', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Line 2" hint={<CharCount value={draft.headline_line_2} max={HEADLINE_MAX} />}>
                <input
                  type="text"
                  value={draft.headline_line_2}
                  onChange={(e) => setField('headline_line_2', e.target.value)}
                  className={inputCls}
                />
              </Field>
            </FieldGroup>
            <Field label="Subheadline">
              <textarea
                value={draft.subheadline}
                onChange={(e) => setField('subheadline', e.target.value)}
                rows={2}
                className={inputCls}
              />
            </Field>
          </Card>

          {/* Feature blocks */}
          <Card title="Feature blocks" count={draft.blocks.length}>
            <div className="space-y-2">
              {draft.blocks.map((block, i) => (
                <BlockAccordion
                  key={block.id}
                  block={block}
                  index={i}
                  total={draft.blocks.length}
                  isOpen={openBlockId === block.id}
                  onToggle={() => setOpenBlockId((cur) => (cur === block.id ? null : block.id))}
                  onChange={(patch) => updateBlock(block.id, patch)}
                  onRemove={() => removeBlock(block.id)}
                  onMoveUp={() => moveBlock(block.id, -1)}
                  onMoveDown={() => moveBlock(block.id, 1)}
                  pending={pending}
                  uploadFor={uploadFor}
                  onAddPill={() => addPill(block.id)}
                  onUpdatePill={(pillId, label) => updatePill(block.id, pillId, label)}
                  onRemovePill={(pillId) => removePill(block.id, pillId)}
                  onMovePill={(pillId, dir) => movePill(block.id, pillId, dir)}
                />
              ))}
            </div>
            <button data-opus-button="control"
              type="button"
              onClick={addBlock}
              className="w-full flex items-center justify-center gap-2 py-2.5 mt-2 border-2 border-dashed border-gray-200 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-900 hover:border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add feature block
            </button>
          </Card>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] font-semibold text-gray-900">Live preview</h3>
            <span className="text-xs text-gray-400">Approximate</span>
          </div>
          <FeaturesPreview content={draft} />
        </div>
      </div>
    </div>
  )
}

function BlockAccordion({
  block, index, total, isOpen, onToggle, onChange, onRemove, onMoveUp, onMoveDown,
  pending, uploadFor,
  onAddPill, onUpdatePill, onRemovePill, onMovePill,
}: {
  block: FeatureBlock
  index: number
  total: number
  isOpen: boolean
  onToggle: () => void
  onChange: (patch: Partial<FeatureBlock>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  pending: boolean
  uploadFor: (cb: (item: FeatureMediaItem) => void) => (file: File) => void
  onAddPill: () => void
  onUpdatePill: (pillId: string, label: string) => void
  onRemovePill: (pillId: string) => void
  onMovePill: (pillId: string, dir: -1 | 1) => void
}) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50/50">
        <button data-opus-button="control" type="button" onClick={onToggle} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
          <span className="text-sm font-semibold text-gray-900 truncate">
            {block.headline_line_1} {block.headline_line_2}
          </span>
          <span className="text-xs text-gray-400 truncate flex items-center gap-1 shrink-0">
            <FlipHorizontal className={cn('w-3 h-3', block.reverse && 'text-[#7E5896]')} />
            {block.reverse ? 'media left' : 'media right'}
          </span>
        </button>
        <div className="flex items-center gap-0.5 shrink-0">
          <IconBtn onClick={onMoveUp} disabled={index === 0} aria-label="Move up"><ArrowUp className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn onClick={onMoveDown} disabled={index === total - 1} aria-label="Move down"><ArrowDown className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn onClick={onRemove} aria-label="Remove" danger><Trash2 className="w-3.5 h-3.5" /></IconBtn>
        </div>
      </div>

      {isOpen && (
        <div className="p-4 space-y-4 border-t border-gray-100">
          <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={block.reverse}
              onChange={(e) => onChange({ reverse: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300"
            />
            Flip layout (media on left, text on right)
          </label>

          <FieldGroup label="Headline">
            <Field label="Line 1" hint={<CharCount value={block.headline_line_1} max={HEADLINE_MAX} />}>
              <input type="text" value={block.headline_line_1} onChange={(e) => onChange({ headline_line_1: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Line 2" hint={<CharCount value={block.headline_line_2} max={HEADLINE_MAX} />}>
              <input type="text" value={block.headline_line_2} onChange={(e) => onChange({ headline_line_2: e.target.value })} className={inputCls} />
            </Field>
          </FieldGroup>

          <Field label="Body" hint={<CharCount value={block.body} max={BODY_MAX} />}>
            <textarea value={block.body} onChange={(e) => onChange({ body: e.target.value })} rows={3} className={inputCls} />
          </Field>

          <FieldGroup label={`Pills (${block.pills.length})`}>
            <div className="space-y-1.5">
              {block.pills.map((pill, pi) => (
                <div key={pill.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 group border border-transparent hover:border-gray-100">
                  <input
                    type="text"
                    value={pill.label}
                    onChange={(e) => onUpdatePill(pill.id, e.target.value)}
                    className="flex-1 min-w-0 px-2 py-1 bg-transparent border-0 text-sm text-gray-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#C9A0DC] rounded"
                  />
                  <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-600 shrink-0">
                    {pill.label || 'Preview'}
                  </span>
                  <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <IconBtn onClick={() => onMovePill(pill.id, -1)} disabled={pi === 0} aria-label="Move up"><ArrowUp className="w-3 h-3" /></IconBtn>
                    <IconBtn onClick={() => onMovePill(pill.id, 1)} disabled={pi === block.pills.length - 1} aria-label="Move down"><ArrowDown className="w-3 h-3" /></IconBtn>
                    <IconBtn onClick={() => onRemovePill(pill.id)} aria-label="Remove" danger><Trash2 className="w-3 h-3" /></IconBtn>
                  </div>
                </div>
              ))}
              <button data-opus-button="control"
                type="button"
                onClick={onAddPill}
                className="w-full flex items-center justify-center gap-2 py-1.5 border border-dashed border-gray-200 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-900 hover:border-gray-300 hover:bg-gray-50 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add pill
              </button>
            </div>
          </FieldGroup>

          <FieldGroup label="CTAs">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Primary label">
                <input type="text" value={block.primary_cta_label} onChange={(e) => onChange({ primary_cta_label: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Primary link">
                <input type="text" value={block.primary_cta_href} onChange={(e) => onChange({ primary_cta_href: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Secondary label">
                <input type="text" value={block.secondary_cta_label} onChange={(e) => onChange({ secondary_cta_label: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Secondary link">
                <input type="text" value={block.secondary_cta_href} onChange={(e) => onChange({ secondary_cta_href: e.target.value })} className={inputCls} />
              </Field>
            </div>
          </FieldGroup>

          <FieldGroup label="Bento media (3 slots)">
            <MediaSlot
              label="Main (large, spans 2 rows)"
              value={block.media_main}
              onChange={(v) => onChange({ media_main: v })}
              onUpload={uploadFor((item) => onChange({ media_main: item }))}
              pending={pending}
            />
            <MediaSlot
              label="Secondary (top right)"
              value={block.media_secondary}
              onChange={(v) => onChange({ media_secondary: v })}
              onUpload={uploadFor((item) => onChange({ media_secondary: item }))}
              pending={pending}
            />
            <MediaSlot
              label="Overlay (bottom right, has text overlay)"
              value={block.media_overlay}
              onChange={(v) => onChange({ media_overlay: v })}
              onUpload={uploadFor((item) => onChange({ media_overlay: item }))}
              pending={pending}
            />
            <Field label="Overlay eyebrow">
              <input type="text" value={block.overlay_eyebrow} onChange={(e) => onChange({ overlay_eyebrow: e.target.value })} className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Overlay caption — line 1">
                <input type="text" value={block.overlay_caption_line_1} onChange={(e) => onChange({ overlay_caption_line_1: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Overlay caption — line 2">
                <input type="text" value={block.overlay_caption_line_2} onChange={(e) => onChange({ overlay_caption_line_2: e.target.value })} className={inputCls} />
              </Field>
            </div>
          </FieldGroup>
        </div>
      )}
    </div>
  )
}

function MediaSlot({
  label, value, onChange, onUpload, pending,
}: {
  label: string
  value: FeatureMediaItem
  onChange: (v: FeatureMediaItem) => void
  onUpload: (file: File) => void
  pending: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [errored, setErrored] = useState(false)
  const resolved = resolveMediaUrl(value.url)

  // Reset error state when URL or type changes (e.g. after upload)
  useEffect(() => {
    setErrored(false)
  }, [resolved, value.type])

  return (
    <Field label={label}>
      <div className="space-y-2">
        <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-100 aspect-video relative">
          {resolved && !errored ? (
            value.type === 'video' ? (
              <video
                key={resolved}
                src={resolved}
                autoPlay
                muted
                loop
                playsInline
                controls
                onError={() => setErrored(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={resolved}
                src={resolved}
                alt=""
                onError={() => setErrored(true)}
                className="w-full h-full object-cover"
              />
            )
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                {value.url ? 'Cannot preview' : 'No media'}
              </span>
              {value.url && (
                <span className="text-[10px] text-gray-400">
                  Browser may not support this file format. MP4/JPG/PNG/WebP work best.
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={value.type}
            onChange={(e) => onChange({ ...value, type: e.target.value as 'video' | 'image' })}
            className={cn(inputCls, 'w-24 text-xs shrink-0')}
          >
            <option value="image">Image</option>
            <option value="video">Video</option>
          </select>
          <input
            type="text"
            value={value.url}
            onChange={(e) => { onChange({ ...value, url: e.target.value }); setErrored(false) }}
            className={cn(inputCls, 'text-xs')}
            placeholder="https://… or /assets/…"
          />
          <button data-opus-button="control"
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
            className="flex items-center gap-1 text-xs font-medium text-gray-700 px-2 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50 shrink-0"
          >
            <Upload className="w-3 h-3" />
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) { onUpload(f); setErrored(false) }
            }}
          />
        </div>
      </div>
    </Field>
  )
}

function IconBtn({
  onClick, disabled, danger, children, ...rest
}: {
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: React.ReactNode
} & React.AriaAttributes) {
  return (
    <button data-opus-button="control"
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'p-1 rounded transition-colors',
        danger
          ? 'text-gray-400 hover:text-red-600 hover:bg-red-50'
          : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
        'disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400'
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

function Card({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
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

function CharCount({ value, max }: { value: string; max: number }) {
  const len = (value ?? '').length
  const over = len > max
  const near = !over && len > max * 0.85
  return (
    <span className={cn('tabular-nums font-medium', over ? 'text-red-500' : near ? 'text-amber-600' : 'text-gray-400')}>
      {len}/{max}
    </span>
  )
}

const inputCls =
  'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] focus:border-transparent transition-all'

function FeaturesPreview({ content }: { content: FeaturesContent }) {
  return (
    <div className="space-y-5">
      <div className="text-center">
        <span className="text-[#C9A0DC] text-[9px] font-bold uppercase tracking-widest">{content.eyebrow}</span>
        <h2 className="text-2xl font-black uppercase tracking-tighter leading-[0.9] mt-1 text-[#1A1A1A]">
          {content.headline_line_1}<br />{content.headline_line_2}
        </h2>
        <p className="text-[10px] text-gray-500 mt-1">{content.subheadline}</p>
      </div>

      {content.blocks.map((b) => (
        <div key={b.id} className={cn('flex gap-3 items-center', b.reverse && 'flex-row-reverse')}>
          <div className="flex-1">
            <h3 className="text-sm font-black uppercase tracking-tighter leading-tight text-[#1A1A1A]">
              {b.headline_line_1}<br />{b.headline_line_2}
            </h3>
            <p className="text-[9px] text-gray-600 mt-1 leading-relaxed line-clamp-3">{b.body}</p>
            <div className="flex flex-wrap gap-1 mt-2">
              {b.pills.slice(0, 4).map((p) => (
                <span key={p.id} className="bg-gray-100 text-gray-600 text-[8px] font-bold px-2 py-0.5 rounded-full">{p.label}</span>
              ))}
            </div>
            <div className="flex gap-1.5 mt-2">
              <span className="bg-[#1A1A1A] text-white text-[9px] font-bold px-2.5 py-1 rounded-full">{b.primary_cta_label}</span>
              <span className="text-[#1A1A1A] text-[9px] font-bold underline px-1">{b.secondary_cta_label}</span>
            </div>
          </div>
          <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-1 h-24">
            <MediaThumb item={b.media_main} className="row-span-2" />
            <MediaThumb item={b.media_secondary} />
            <div className="rounded overflow-hidden relative bg-gray-100">
              {b.media_overlay.url && resolveMediaUrl(b.media_overlay.url) ? (
                b.media_overlay.type === 'video' ? (
                  <video src={resolveMediaUrl(b.media_overlay.url)} autoPlay muted loop playsInline className="w-full h-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={resolveMediaUrl(b.media_overlay.url)} alt="" className="w-full h-full object-cover" />
                )
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-1">
                <p className="text-white/50 text-[6px] font-black uppercase tracking-widest truncate">{b.overlay_eyebrow}</p>
                <p className="text-white text-[7px] font-black leading-tight truncate">
                  {b.overlay_caption_line_1}<br />{b.overlay_caption_line_2}
                </p>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function MediaThumb({ item, className }: { item: FeatureMediaItem; className?: string }) {
  const url = resolveMediaUrl(item.url)
  return (
    <div className={cn('rounded overflow-hidden bg-gray-100', className)}>
      {url ? (
        item.type === 'video' ? (
          <video src={url} autoPlay muted loop playsInline className="w-full h-full object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="w-full h-full object-cover" />
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[7px] text-gray-400">No media</div>
      )}
    </div>
  )
}
