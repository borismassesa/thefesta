'use client'

import { useEffect, useState, useTransition } from 'react'
import { ChevronsDownUp, ChevronsUpDown, Plus, Trash2, ArrowDown, ArrowUp } from 'lucide-react'
import type {
  OpusPassExploreStyleColumn,
  OpusPassExploreStyleLink,
  OpusPassDigitalCardsExploreStylesContent,
} from '@/lib/cms/opus-pass-digital-cards-explore-styles'
import { CollapsibleCard } from '@/components/cms/CollapsibleCard'
import { BilingualField } from '@/components/cms/BilingualField'
import {
  LOCALES,
  LOCALE_LABELS,
  resolveLocalized,
  type Locale,
  type MaybeLocalized,
} from '@/lib/cms/localized'
import { cn } from '@/lib/utils'
import { useEditorActions } from '../EditorActionsContext'
import {
  discardOpusPassDigitalCardsExploreStylesDraft,
  publishOpusPassDigitalCardsExploreStyles,
  saveOpusPassDigitalCardsExploreStylesDraft,
} from './actions'

type Props = {
  initial: OpusPassDigitalCardsExploreStylesContent
  hasDraft: boolean
}

const inputCls =
  'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] focus:border-transparent transition-all'

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

export default function ExploreStylesEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<OpusPassDigitalCardsExploreStylesContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewLocale, setPreviewLocale] = useState<Locale>('en')
  const { bind, unbind } = useEditorActions()

  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
  const toggleExpanded = (idx: number) =>
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  const expandAll = () => setExpanded(new Set(draft.columns.map((_, i) => i)))
  const collapseAll = () => setExpanded(new Set())

  const setHeading = (heading: MaybeLocalized) => setDraft((d) => ({ ...d, heading }))

  const patchColumn = (idx: number, patch: Partial<OpusPassExploreStyleColumn>) =>
    setDraft((d) => ({
      ...d,
      columns: d.columns.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }))

  const addColumn = () =>
    setDraft((d) => ({
      ...d,
      columns: [
        ...d.columns,
        { id: randomId('col'), heading: 'New column', items: [] },
      ],
    }))

  const removeColumn = (idx: number) =>
    setDraft((d) => ({ ...d, columns: d.columns.filter((_, i) => i !== idx) }))

  const moveColumn = (idx: number, delta: number) =>
    setDraft((d) => {
      const next = [...d.columns]
      const target = idx + delta
      if (target < 0 || target >= next.length) return d
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...d, columns: next }
    })

  const patchLink = (colIdx: number, linkIdx: number, patch: Partial<OpusPassExploreStyleLink>) =>
    setDraft((d) => ({
      ...d,
      columns: d.columns.map((c, i) =>
        i === colIdx
          ? { ...c, items: c.items.map((it, j) => (j === linkIdx ? { ...it, ...patch } : it)) }
          : c,
      ),
    }))

  const addLink = (colIdx: number) =>
    setDraft((d) => ({
      ...d,
      columns: d.columns.map((c, i) =>
        i === colIdx
          ? { ...c, items: [...c.items, { id: randomId('lnk'), label: '', href: '/digital-cards/catalog' }] }
          : c,
      ),
    }))

  const removeLink = (colIdx: number, linkIdx: number) =>
    setDraft((d) => ({
      ...d,
      columns: d.columns.map((c, i) =>
        i === colIdx ? { ...c, items: c.items.filter((_, j) => j !== linkIdx) } : c,
      ),
    }))

  const moveLink = (colIdx: number, linkIdx: number, delta: number) =>
    setDraft((d) => ({
      ...d,
      columns: d.columns.map((c, i) => {
        if (i !== colIdx) return c
        const next = [...c.items]
        const target = linkIdx + delta
        if (target < 0 || target >= next.length) return c
        ;[next[linkIdx], next[target]] = [next[target], next[linkIdx]]
        return { ...c, items: next }
      }),
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
      await saveOpusPassDigitalCardsExploreStylesDraft(draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })

  const handlePublish = () =>
    runAction(async () => {
      await saveOpusPassDigitalCardsExploreStylesDraft(draft)
      await publishOpusPassDigitalCardsExploreStyles()
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })

  const handleDiscard = () =>
    runAction(async () => {
      await discardOpusPassDigitalCardsExploreStylesDraft()
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
        <BilingualField
          label="Section heading"
          value={draft.heading}
          onChange={(v) => setHeading(v)}
          placeholder="Explore other styles"
        />

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-100">
          <h3 className="text-[15px] font-semibold text-gray-900">Columns</h3>
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
        <p className="text-xs text-gray-500 leading-relaxed">
          Footer link columns shown at the bottom of the catalog + category pages. 4 columns is the
          recommended layout — each column has a heading and a list of links.
        </p>

        <div className="space-y-3">
          {draft.columns.map((col, colIdx) => (
            <CollapsibleCard
              key={col.id}
              index={colIdx}
              title={resolveLocalized(col.heading, 'en') || 'New column'}
              collapsed={!expanded.has(colIdx)}
              onToggle={() => toggleExpanded(colIdx)}
              onMoveUp={() => moveColumn(colIdx, -1)}
              onMoveDown={() => moveColumn(colIdx, 1)}
              onRemove={() => removeColumn(colIdx)}
              disableMoveUp={colIdx === 0}
              disableMoveDown={colIdx === draft.columns.length - 1}
            >
              <BilingualField
                label="Column heading"
                value={col.heading}
                onChange={(v) => patchColumn(colIdx, { heading: v })}
                placeholder="By style"
              />

              <div className="pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-600 mb-2">Links</p>
                <div className="space-y-2">
                  {col.items.map((link, linkIdx) => (
                    <div
                      key={link.id}
                      className="bg-gray-50 border border-gray-100 rounded-lg p-2 space-y-2"
                    >
                      <BilingualField
                        label="Label"
                        value={link.label}
                        onChange={(v) => patchLink(colIdx, linkIdx, { label: v })}
                        placeholder="Modern"
                      />
                      <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                        <input
                          type="text"
                          value={link.href}
                          onChange={(e) => patchLink(colIdx, linkIdx, { href: e.target.value })}
                          placeholder="/digital-cards/catalog"
                          className={inputCls}
                        />
                        <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveLink(colIdx, linkIdx, -1)}
                          disabled={linkIdx === 0}
                          className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                          aria-label="Move up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveLink(colIdx, linkIdx, 1)}
                          disabled={linkIdx === col.items.length - 1}
                          className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                          aria-label="Move down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeLink(colIdx, linkIdx)}
                          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                          aria-label="Remove link"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addLink(colIdx)}
                    className="flex items-center gap-2 text-xs font-medium text-[#7E5896] hover:text-[#5d3a78] px-2 py-1.5 rounded-lg border border-dashed border-[#C9A0DC] hover:bg-[#F0DFF6] transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add link
                  </button>
                </div>
              </div>
            </CollapsibleCard>
          ))}
          <button
            type="button"
            onClick={addColumn}
            className="flex items-center gap-2 text-sm font-medium text-[#7E5896] hover:text-[#5d3a78] px-3 py-2 rounded-lg border border-dashed border-[#C9A0DC] hover:bg-[#F0DFF6] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add column
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
        <ExploreStylesPreview content={draft} locale={previewLocale} />
      </div>
    </div>
  )
}

function ExploreStylesPreview({
  content,
  locale,
}: {
  content: OpusPassDigitalCardsExploreStylesContent
  locale: Locale
}) {
  return (
    <div className="border-t border-gray-200 pt-6">
      <h2 className="font-serif text-[18px] text-[#1A1A1A]">
        {resolveLocalized(content.heading, locale) || 'Explore other styles'}
      </h2>
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-6">
        {content.columns.map((c) => (
          <div key={c.id}>
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-[#1A1A1A]/60">
              {resolveLocalized(c.heading, locale) || 'Column'}
            </p>
            <ul className="mt-2 space-y-1.5">
              {c.items.map((it) => (
                <li key={it.id} className="text-[12px] text-[#1A1A1A]/85">
                  {resolveLocalized(it.label, locale) || '(empty)'}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
