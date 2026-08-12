'use client'

import { useEffect, useState, useTransition } from 'react'
import { Plus, X } from 'lucide-react'
import { resolveOpusPassAssetUrl } from '@/lib/cms/opus-pass-asset-url'
import {
  OPUS_PASS_WEBSITES_DESIGN_TREATMENTS,
  type OpusPassWebsitesDesignItem,
  type OpusPassWebsitesDesignsContent,
} from '@/lib/cms/opus-pass-websites-designs'
import { CollapsibleCard } from '@/components/cms/CollapsibleCard'
import { ImageUploadField } from '@/components/cms/ImageUploadField'
import { BilingualField } from '@/components/cms/BilingualField'
import { cn } from '@/lib/utils'
import { LOCALES, LOCALE_LABELS, resolveLocalized, type Locale } from '@/lib/cms/localized'
import { useEditorActions } from '../EditorActionsContext'
import {
  discardOpusPassWebsitesDesignsDraft,
  publishOpusPassWebsitesDesigns,
  saveOpusPassWebsitesDesignsDraft,
} from './actions'

type Props = {
  initial: OpusPassWebsitesDesignsContent
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
  return `dsn-${Math.random().toString(36).slice(2, 9)}`
}

export default function DesignsEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<OpusPassWebsitesDesignsContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
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

  const setField = <K extends keyof OpusPassWebsitesDesignsContent>(
    key: K,
    value: OpusPassWebsitesDesignsContent[K],
  ) => setDraft((d) => ({ ...d, [key]: value }))

  const setDesign = (idx: number, patch: Partial<OpusPassWebsitesDesignItem>) =>
    setDraft((d) => ({
      ...d,
      designs: d.designs.map((item, i) => (i === idx ? { ...item, ...patch } : item)),
    }))

  const addDesign = () =>
    setDraft((d) => ({
      ...d,
      designs: [
        ...d.designs,
        {
          id: randomId(),
          name: '',
          tags: [],
          treatment: 'floral-cream',
          photo: '',
        },
      ],
    }))

  const removeDesign = (idx: number) =>
    setDraft((d) => ({ ...d, designs: d.designs.filter((_, i) => i !== idx) }))

  const moveDesign = (idx: number, delta: number) =>
    setDraft((d) => {
      const next = [...d.designs]
      const target = idx + delta
      if (target < 0 || target >= next.length) return d
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...d, designs: next }
    })

  // Tab editing
  const setTab = (idx: number, value: string) =>
    setDraft((d) => ({ ...d, tabs: d.tabs.map((t, i) => (i === idx ? value : t)) }))
  const addTab = () => setDraft((d) => ({ ...d, tabs: [...d.tabs, ''] }))
  const removeTab = (idx: number) =>
    setDraft((d) => ({ ...d, tabs: d.tabs.filter((_, i) => i !== idx) }))

  // Tag editing per design
  const toggleDesignTag = (designIdx: number, tag: string) => {
    setDraft((d) => ({
      ...d,
      designs: d.designs.map((item, i) => {
        if (i !== designIdx) return item
        const has = item.tags.includes(tag)
        return { ...item, tags: has ? item.tags.filter((t) => t !== tag) : [...item.tags, tag] }
      }),
    }))
  }

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
      await saveOpusPassWebsitesDesignsDraft(draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })

  const handlePublish = () =>
    runAction(async () => {
      await saveOpusPassWebsitesDesignsDraft(draft)
      await publishOpusPassWebsitesDesigns()
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })

  const handleDiscard = () =>
    runAction(async () => {
      await discardOpusPassWebsitesDesignsDraft()
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
        <h3 className="text-[15px] font-semibold text-gray-900">Designs</h3>

        <FieldGroup label="Section header">
          <BilingualField
            label="Heading"
            value={draft.heading}
            onChange={(v) => setField('heading', v)}
            placeholder="Pick your wedding website design"
          />
        </FieldGroup>

        <FieldGroup label="Filter tabs">
          <p className="text-[11px] text-gray-500 leading-relaxed">
            The first tab is selected by default. Each design&apos;s tags must match one or more tabs
            for the design to appear under that filter.
          </p>
          <div className="space-y-2">
            {draft.tabs.map((tab, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  value={tab}
                  onChange={(e) => setTab(idx, e.target.value)}
                  className={inputCls}
                />
                <button data-opus-button="control"
                  type="button"
                  onClick={() => removeTab(idx)}
                  className="p-2 text-gray-400 hover:text-red-600 shrink-0"
                  aria-label={`Remove tab ${tab}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button data-opus-button="secondary" data-opus-button-size="small"
              type="button"
              onClick={addTab}
              className="flex items-center gap-1.5 text-[11px] font-medium text-[#7E5896] hover:text-[#5d3a78] px-2 py-1 rounded hover:bg-[#F0DFF6] transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add tab
            </button>
          </div>
        </FieldGroup>

        <div className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 px-1">
            Templates ({draft.designs.length})
          </p>
          {draft.designs.map((item, idx) => (
            <CollapsibleCard
              key={item.id}
              index={idx}
              title={resolveLocalized(item.name, previewLocale) || 'New design'}
              collapsed={!expanded.has(idx)}
              onToggle={() => toggleExpanded(idx)}
              onMoveUp={() => moveDesign(idx, -1)}
              onMoveDown={() => moveDesign(idx, 1)}
              onRemove={() => removeDesign(idx)}
              disableMoveUp={idx === 0}
              disableMoveDown={idx === draft.designs.length - 1}
            >
              <BilingualField
                label="Name"
                value={item.name}
                onChange={(v) => setDesign(idx, { name: v })}
                placeholder="Bagamoyo Bloom"
              />
              <Field label="Treatment (visual style)">
                <select
                  value={item.treatment}
                  onChange={(e) =>
                    setDesign(idx, {
                      treatment: e.target.value as OpusPassWebsitesDesignItem['treatment'],
                    })
                  }
                  className={inputCls}
                >
                  {OPUS_PASS_WEBSITES_DESIGN_TREATMENTS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tags (which tabs this design appears under)">
                <div className="flex flex-wrap gap-1.5">
                  {draft.tabs.map((tab) => {
                    const active = item.tags.includes(tab)
                    return (
                      <button data-opus-button="control"
                        key={tab}
                        type="button"
                        onClick={() => toggleDesignTag(idx, tab)}
                        className={
                          active
                            ? 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#C9A0DC] text-[#1A1A1A]'
                            : 'px-2.5 py-1 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }
                      >
                        {tab}
                      </button>
                    )
                  })}
                </div>
              </Field>
              <ImageUploadField
                label="Hero photo"
                value={item.photo}
                onChange={(v) => setDesign(idx, { photo: v })}
                pathPrefix="opus-pass/websites/designs"
                previewAspect="aspect-[3/2]"
                previewWidth="max-w-xs"
              />
            </CollapsibleCard>
          ))}
          <button data-opus-button="neutral" data-opus-button-size="medium"
            type="button"
            onClick={addDesign}
            className="flex items-center gap-2 text-sm font-medium text-[#7E5896] hover:text-[#5d3a78] px-3 py-2 rounded-lg border border-dashed border-[#C9A0DC] hover:bg-[#F0DFF6] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add design
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
        <DesignsPreview content={draft} locale={previewLocale} />
      </div>
    </div>
  )
}

function DesignsPreview({
  content,
  locale,
}: {
  content: OpusPassWebsitesDesignsContent
  locale: Locale
}) {
  const activeTab = content.tabs[0] ?? ''
  const visible = content.designs.filter((d) => d.tags.includes(activeTab)).slice(0, 6)
  return (
    <div>
      <div className="text-center mb-4">
        <h2 className="text-base font-serif font-medium text-gray-900">
          {resolveLocalized(content.heading, locale) || 'Section heading'}
        </h2>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1.5 mb-4">
        {content.tabs.map((tab, i) => (
          <span
            key={tab}
            className={
              i === 0
                ? 'text-[10px] font-bold text-[#1A1A1A] border-b border-[#1A1A1A] px-1.5 pb-0.5'
                : 'text-[10px] font-medium text-gray-500 px-1.5'
            }
          >
            {tab}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(visible.length > 0 ? visible : content.designs.slice(0, 6)).map((d) => {
          const name = resolveLocalized(d.name, locale)
          return (
            <div key={d.id} className="flex flex-col gap-1.5">
              <div className="relative aspect-[3/2] overflow-hidden rounded-md ring-1 ring-black/5 bg-gray-100">
                {d.photo && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={resolveOpusPassAssetUrl(d.photo)}
                    alt={name}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}
                <span className="absolute top-1.5 right-1.5 rounded-full bg-white/95 px-1.5 py-[2px] text-[7px] font-bold uppercase tracking-[0.14em] text-[#1A1A1A]">
                  Free
                </span>
              </div>
              <p className="text-[10px] font-semibold text-[#1A1A1A] truncate">
                {name || 'Untitled'}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
