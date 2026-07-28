'use client'

import { useEffect, useState, useTransition } from 'react'
import { ChevronsDownUp, ChevronsUpDown, Plus } from 'lucide-react'
import type {
  OpusPassDigitalCardCategory,
  OpusPassDigitalCardsCategoriesContent,
} from '@/lib/cms/opus-pass-digital-cards-categories'
import { ImageUploadField } from '@/components/cms/ImageUploadField'
import { CollapsibleCard } from '@/components/cms/CollapsibleCard'
import { BilingualField } from '@/components/cms/BilingualField'
import { LOCALES, LOCALE_LABELS, resolveLocalized, type Locale } from '@/lib/cms/localized'
import { cn } from '@/lib/utils'
import { resolveOpusPassAssetUrl } from '@/lib/cms/opus-pass-asset-url'
import { useEditorActions } from '../EditorActionsContext'
import {
  discardOpusPassDigitalCardsCategoriesDraft,
  publishOpusPassDigitalCardsCategories,
  saveOpusPassDigitalCardsCategoriesDraft,
} from './actions'

type Props = {
  initial: OpusPassDigitalCardsCategoriesContent
  hasDraft: boolean
}

const inputCls =
  'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] focus:border-transparent transition-all'

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
      <legend className="px-1 text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</legend>
      {children}
    </fieldset>
  )
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function randomSlugSuffix(): string {
  return Math.random().toString(36).slice(2, 7)
}

export default function CategoriesEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<OpusPassDigitalCardsCategoriesContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewLocale, setPreviewLocale] = useState<Locale>('en')
  const { bind, unbind } = useEditorActions()

  // Tracks which category indices are expanded. Default = all collapsed because
  // 17 fully-expanded cards would scroll forever.
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
  const toggleExpanded = (idx: number) =>
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  const expandAll = () => setExpanded(new Set(draft.categories.map((_, i) => i)))
  const collapseAll = () => setExpanded(new Set())

  const setField = <K extends keyof OpusPassDigitalCardsCategoriesContent>(
    key: K,
    value: OpusPassDigitalCardsCategoriesContent[K],
  ) => setDraft((d) => ({ ...d, [key]: value }))

  const setCat = (idx: number, patch: Partial<OpusPassDigitalCardCategory>) =>
    setDraft((d) => ({
      ...d,
      categories: d.categories.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }))

  const setCatMatchers = (idx: number, text: string) =>
    setCat(idx, { product_matchers: text.split('\n').map((s) => s.trim()).filter(Boolean) })

  const addCat = () =>
    setDraft((d) => ({
      ...d,
      categories: [
        ...d.categories,
        {
          slug: `new-category-${randomSlugSuffix()}`,
          label: 'New category',
          img: '',
          alt: '',
          subtitle: '',
          product_matchers: [],
        },
      ],
    }))

  const removeCat = (idx: number) =>
    setDraft((d) => ({ ...d, categories: d.categories.filter((_, i) => i !== idx) }))

  const moveCat = (idx: number, delta: number) =>
    setDraft((d) => {
      const next = [...d.categories]
      const target = idx + delta
      if (target < 0 || target >= next.length) return d
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...d, categories: next }
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
      await saveOpusPassDigitalCardsCategoriesDraft(draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })

  const handlePublish = () =>
    runAction(async () => {
      await saveOpusPassDigitalCardsCategoriesDraft(draft)
      await publishOpusPassDigitalCardsCategories()
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })

  const handleDiscard = () =>
    runAction(async () => {
      await discardOpusPassDigitalCardsCategoriesDraft()
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
        <h3 className="text-[15px] font-semibold text-gray-900">Categories content</h3>

        <FieldGroup label="Section header">
          <BilingualField
            label="Heading"
            value={draft.heading}
            onChange={(v) => setField('heading', v)}
            placeholder="Digital Cards for Every Moment"
          />
          <BilingualField
            label="Description"
            value={draft.description}
            onChange={(v) => setField('description', v)}
            multiline
            rows={4}
          />
        </FieldGroup>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 px-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Categories ({draft.categories.length})
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={expandAll}
                className="flex items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
              >
                <ChevronsUpDown className="w-3 h-3" />
                Expand all
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="flex items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
              >
                <ChevronsDownUp className="w-3 h-3" />
                Collapse all
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed px-1">
            Each category becomes a card on the landing grid and a route at{' '}
            <code className="bg-gray-100 px-1 rounded">/digital-cards/&lt;slug&gt;</code>. Changing a
            slug breaks existing bookmarks — edit slugs with care.
          </p>
          {draft.categories.map((cat, idx) => (
            <CollapsibleCard
              key={`${cat.slug}-${idx}`}
              index={idx}
              title={resolveLocalized(cat.label, 'en') || 'New category'}
              subtitle={cat.slug}
              collapsed={!expanded.has(idx)}
              onToggle={() => toggleExpanded(idx)}
              onMoveUp={() => moveCat(idx, -1)}
              onMoveDown={() => moveCat(idx, 1)}
              onRemove={() => removeCat(idx)}
              disableMoveUp={idx === 0}
              disableMoveDown={idx === draft.categories.length - 1}
            >
              <div className="flex items-center justify-end -mb-1">
                <button
                  type="button"
                  onClick={() => setCat(idx, { slug: slugify(resolveLocalized(cat.label, 'en')) })}
                  className="text-[11px] text-[#7E5896] hover:underline"
                  title="Regenerate slug from label"
                >
                  sync slug
                </button>
              </div>
              <BilingualField
                label="Label (shown on the card)"
                value={cat.label}
                onChange={(v) => setCat(idx, { label: v })}
              />

              <Field label="URL slug (used in /digital-cards/<slug>)">
                <input
                  type="text"
                  value={cat.slug}
                  onChange={(e) => setCat(idx, { slug: slugify(e.target.value) })}
                  placeholder="save-the-date"
                  className={inputCls}
                />
              </Field>

              <ImageUploadField
                label="Thumbnail"
                value={cat.img}
                onChange={(v) => setCat(idx, { img: v })}
                pathPrefix="opus-pass/invitations/categories"
                previewAspect="aspect-square"
                previewWidth="max-w-[120px]"
              />

              <BilingualField
                label="Alt text"
                value={cat.alt}
                onChange={(v) => setCat(idx, { alt: v })}
              />

              <BilingualField
                label="Subtitle (shown beneath the title on the category page)"
                value={cat.subtitle}
                onChange={(v) => setCat(idx, { subtitle: v })}
                multiline
                rows={3}
              />

              <Field label="Product matchers (one per line — substrings matched against product.category)">
                <textarea
                  rows={3}
                  value={cat.product_matchers.join('\n')}
                  onChange={(e) => setCatMatchers(idx, e.target.value)}
                  placeholder="Save the Date"
                  className={`${inputCls} font-mono text-[12px]`}
                />
              </Field>
            </CollapsibleCard>
          ))}
          <button
            type="button"
            onClick={addCat}
            className="flex items-center gap-2 text-sm font-medium text-[#7E5896] hover:text-[#5d3a78] px-3 py-2 rounded-lg border border-dashed border-[#C9A0DC] hover:bg-[#F0DFF6] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add category
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] xl:sticky xl:top-6 max-h-[calc(100vh-3rem)] overflow-y-auto">
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
        <CategoriesPreview content={draft} locale={previewLocale} />
      </div>
    </div>
  )
}

function CategoriesPreview({
  content,
  locale,
}: {
  content: OpusPassDigitalCardsCategoriesContent
  locale: Locale
}) {
  return (
    <div>
      <div className="text-center mb-5">
        <h2 className="text-base font-serif font-medium text-gray-900 mb-1.5">
          {resolveLocalized(content.heading, locale) || 'Section heading'}
        </h2>
        <p className="text-[10px] text-gray-700 leading-relaxed">
          {resolveLocalized(content.description, locale)}
        </p>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {content.categories.slice(0, 16).map((cat, i) => (
          <div key={`${cat.slug}-${i}`} className="flex flex-col items-center gap-1">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-100 ring-1 ring-gray-200">
              {cat.img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={resolveOpusPassAssetUrl(cat.img)} alt="" className="w-full h-full object-cover" />
              ) : null}
            </div>
            <span className="text-[8px] text-center text-gray-700 leading-tight line-clamp-2">
              {resolveLocalized(cat.label, locale) || cat.slug}
            </span>
          </div>
        ))}
      </div>
      {content.categories.length > 16 && (
        <p className="mt-2 text-[10px] text-gray-400 text-center">
          + {content.categories.length - 16} more…
        </p>
      )}
    </div>
  )
}
