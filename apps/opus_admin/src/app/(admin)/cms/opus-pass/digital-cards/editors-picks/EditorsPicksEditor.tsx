'use client'

import { useEffect, useState, useTransition } from 'react'
import { ChevronsDownUp, ChevronsUpDown, Image as ImageIcon, Plus, Sparkles, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  EDITORS_PICKS_TREATMENTS,
  type OpusPassEditorsPicksMediaType,
  type OpusPassEditorsPicksOverlay,
  type OpusPassEditorsPicksPick,
  type OpusPassEditorsPicksRow,
  type OpusPassEditorsPicksRowAlign,
  type OpusPassEditorsPicksTreatment,
  type OpusPassDigitalCardsEditorsPicksContent,
} from '@/lib/cms/opus-pass-digital-cards-editors-picks'
import { CollapsibleCard } from '@/components/cms/CollapsibleCard'
import { MediaUploadField } from '@/components/cms/MediaUploadField'
import { BilingualField } from '@/components/cms/BilingualField'
import { LOCALES, LOCALE_LABELS, resolveLocalized, type Locale } from '@/lib/cms/localized'
import { resolveOpusPassAssetUrl } from '@/lib/cms/opus-pass-asset-url'
import { useEditorActions } from '../EditorActionsContext'
import {
  discardOpusPassDigitalCardsEditorsPicksDraft,
  publishOpusPassDigitalCardsEditorsPicks,
  saveOpusPassDigitalCardsEditorsPicksDraft,
} from './actions'

type Props = {
  initial: OpusPassDigitalCardsEditorsPicksContent
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

function randomRowId(): string {
  return `row-${Math.random().toString(36).slice(2, 9)}`
}

function randomPickId(): string {
  return `pick-${Math.random().toString(36).slice(2, 9)}`
}

export default function EditorsPicksEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<OpusPassDigitalCardsEditorsPicksContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewLocale, setPreviewLocale] = useState<Locale>('en')
  const { bind, unbind } = useEditorActions()

  // Row-level expand
  const [expandedRows, setExpandedRows] = useState<Set<number>>(() => new Set([0]))
  const toggleRow = (idx: number) =>
    setExpandedRows((s) => {
      const next = new Set(s)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  const expandAllRows = () => setExpandedRows(new Set(draft.rows.map((_, i) => i)))
  const collapseAllRows = () => setExpandedRows(new Set())

  // Pick-level expand (keyed by `${rowIdx}:${pickIdx}`)
  const [expandedPicks, setExpandedPicks] = useState<Set<string>>(() => new Set())
  const isPickExpanded = (r: number, p: number) => expandedPicks.has(`${r}:${p}`)
  const togglePick = (r: number, p: number) =>
    setExpandedPicks((s) => {
      const key = `${r}:${p}`
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const setRow = (rIdx: number, patch: Partial<OpusPassEditorsPicksRow>) =>
    setDraft((d) => ({
      ...d,
      rows: d.rows.map((r, i) => (i === rIdx ? { ...r, ...patch } : r)),
    }))

  const setPick = (rIdx: number, pIdx: number, patch: Partial<OpusPassEditorsPicksPick>) =>
    setDraft((d) => ({
      ...d,
      rows: d.rows.map((r, i) =>
        i === rIdx
          ? { ...r, picks: r.picks.map((p, j) => (j === pIdx ? { ...p, ...patch } : p)) }
          : r,
      ),
    }))

  const setPickSwatches = (rIdx: number, pIdx: number, text: string) =>
    setPick(rIdx, pIdx, { swatches: text.split('\n').map((s) => s.trim()).filter(Boolean) })

  const addRow = () =>
    setDraft((d) => ({
      ...d,
      rows: [
        ...d.rows,
        {
          id: randomRowId(),
          title_line_1: '',
          title_line_2: '',
          align: 'left' as OpusPassEditorsPicksRowAlign,
          picks: [],
        },
      ],
    }))

  const removeRow = (rIdx: number) =>
    setDraft((d) => ({ ...d, rows: d.rows.filter((_, i) => i !== rIdx) }))

  const moveRow = (rIdx: number, delta: number) =>
    setDraft((d) => {
      const next = [...d.rows]
      const target = rIdx + delta
      if (target < 0 || target >= next.length) return d
      ;[next[rIdx], next[target]] = [next[target], next[rIdx]]
      return { ...d, rows: next }
    })

  const addPick = (rIdx: number) =>
    setRow(rIdx, {
      picks: [
        ...draft.rows[rIdx].picks,
        {
          id: randomPickId(),
          category: '',
          name: '',
          price_now: 0,
          swatches: [],
          treatment: 'photo-overlay' as OpusPassEditorsPicksTreatment,
          overlay: 'none' as OpusPassEditorsPicksOverlay,
        },
      ],
    })

  const removePick = (rIdx: number, pIdx: number) =>
    setDraft((d) => ({
      ...d,
      rows: d.rows.map((r, i) =>
        i === rIdx ? { ...r, picks: r.picks.filter((_, j) => j !== pIdx) } : r,
      ),
    }))

  const movePick = (rIdx: number, pIdx: number, delta: number) =>
    setDraft((d) => ({
      ...d,
      rows: d.rows.map((r, i) => {
        if (i !== rIdx) return r
        const picks = [...r.picks]
        const target = pIdx + delta
        if (target < 0 || target >= picks.length) return r
        ;[picks[pIdx], picks[target]] = [picks[target], picks[pIdx]]
        return { ...r, picks }
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
      await saveOpusPassDigitalCardsEditorsPicksDraft(draft)
      setHasDraft(true)
      setMessage('Draft saved.')
    })

  const handlePublish = () =>
    runAction(async () => {
      await saveOpusPassDigitalCardsEditorsPicksDraft(draft)
      await publishOpusPassDigitalCardsEditorsPicks()
      setHasDraft(false)
      setMessage('Published — changes are live.')
    })

  const handleDiscard = () =>
    runAction(async () => {
      await discardOpusPassDigitalCardsEditorsPicksDraft()
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
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[15px] font-semibold text-gray-900">Editor&apos;s Picks rows</h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={expandAllRows}
              className="flex items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
            >
              <ChevronsUpDown className="w-3 h-3" />
              Expand all
            </button>
            <button
              type="button"
              onClick={collapseAllRows}
              className="flex items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
            >
              <ChevronsDownUp className="w-3 h-3" />
              Collapse all
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">
          Each row shows a 2-line title on either the left or right with up to 3 product picks
          filling the rest. Each pick can use an uploaded image/video, or a built-in CSS-art
          treatment as the visual.
        </p>

        <BilingualField
          label="Explore designs button label (shared by every row)"
          value={draft.exploreLabel}
          onChange={(v) => setDraft((d) => ({ ...d, exploreLabel: v }))}
        />

        <div className="space-y-3">
          {draft.rows.map((row, rIdx) => (
            <CollapsibleCard
              key={row.id}
              index={rIdx}
              title={
                `${resolveLocalized(row.title_line_1, 'en')} ${resolveLocalized(row.title_line_2, 'en')}`.trim() ||
                'New row'
              }
              subtitle={`${row.align} · ${row.picks.length} picks`}
              collapsed={!expandedRows.has(rIdx)}
              onToggle={() => toggleRow(rIdx)}
              onMoveUp={() => moveRow(rIdx, -1)}
              onMoveDown={() => moveRow(rIdx, 1)}
              onRemove={() => removeRow(rIdx)}
              disableMoveUp={rIdx === 0}
              disableMoveDown={rIdx === draft.rows.length - 1}
            >
              <BilingualField
                label="Title — line 1"
                value={row.title_line_1}
                onChange={(v) => setRow(rIdx, { title_line_1: v })}
              />
              <BilingualField
                label="Title — line 2"
                value={row.title_line_2}
                onChange={(v) => setRow(rIdx, { title_line_2: v })}
              />
              <Field label="Title alignment">
                <select
                  value={row.align}
                  onChange={(e) =>
                    setRow(rIdx, { align: e.target.value as OpusPassEditorsPicksRowAlign })
                  }
                  className={inputCls}
                >
                  <option value="left">Left (title on the left, picks on the right)</option>
                  <option value="right">Right (picks on the left, title on the right)</option>
                </select>
              </Field>

              <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Picks ({row.picks.length})
                </p>
                {row.picks.map((pick, pIdx) => (
                  <CollapsibleCard
                    key={pick.id}
                    index={pIdx}
                    title={pick.name || 'New pick'}
                    subtitle={pick.media_url ? pick.media_type ?? 'media' : pick.treatment}
                    collapsed={!isPickExpanded(rIdx, pIdx)}
                    onToggle={() => togglePick(rIdx, pIdx)}
                    onMoveUp={() => movePick(rIdx, pIdx, -1)}
                    onMoveDown={() => movePick(rIdx, pIdx, 1)}
                    onRemove={() => removePick(rIdx, pIdx)}
                    disableMoveUp={pIdx === 0}
                    disableMoveDown={pIdx === row.picks.length - 1}
                  >
                    <PickVisualSection
                      pick={pick}
                      onPatch={(patch) => setPick(rIdx, pIdx, patch)}
                    />

                    <Field label="Product name">
                      <input
                        type="text"
                        value={pick.name}
                        onChange={(e) => setPick(rIdx, pIdx, { name: e.target.value })}
                        className={inputCls}
                      />
                    </Field>

                    <Field label="Category (shown above the name)">
                      <input
                        type="text"
                        value={pick.category}
                        onChange={(e) => setPick(rIdx, pIdx, { category: e.target.value })}
                        placeholder="Save the Dates"
                        className={inputCls}
                      />
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Price was (TZS)">
                        <input
                          type="number"
                          value={pick.price_was ?? ''}
                          onChange={(e) =>
                            setPick(rIdx, pIdx, {
                              price_was: e.target.value ? Number(e.target.value) : undefined,
                            })
                          }
                          placeholder="195000"
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Price now (TZS)">
                        <input
                          type="number"
                          value={pick.price_now}
                          onChange={(e) =>
                            setPick(rIdx, pIdx, { price_now: Number(e.target.value) || 0 })
                          }
                          placeholder="117000"
                          className={inputCls}
                        />
                      </Field>
                    </div>

                    <Field label="Swatches (one hex colour per line)">
                      <textarea
                        rows={4}
                        value={pick.swatches.join('\n')}
                        onChange={(e) => setPickSwatches(rIdx, pIdx, e.target.value)}
                        placeholder="#1A1A1A"
                        className={`${inputCls} font-mono text-[12px]`}
                      />
                    </Field>

                    <Field label="Overlay icon">
                      <select
                        value={pick.overlay}
                        onChange={(e) =>
                          setPick(rIdx, pIdx, {
                            overlay: e.target.value as OpusPassEditorsPicksOverlay,
                          })
                        }
                        className={inputCls}
                      >
                        <option value="none">None</option>
                        <option value="play">Play (video indicator)</option>
                        <option value="heart">Heart (favourite)</option>
                      </select>
                    </Field>

                    <Field label="Card background colour (hex, optional)">
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={pick.background ?? '#ffffff'}
                          onChange={(e) => setPick(rIdx, pIdx, { background: e.target.value })}
                          className="w-10 h-10 rounded border border-gray-200 p-0 overflow-hidden cursor-pointer"
                        />
                        <input
                          type="text"
                          value={pick.background ?? ''}
                          onChange={(e) =>
                            setPick(rIdx, pIdx, { background: e.target.value || undefined })
                          }
                          placeholder="#A6A8A2"
                          className={`${inputCls} flex-1`}
                        />
                        {pick.background && (
                          <button
                            type="button"
                            onClick={() => setPick(rIdx, pIdx, { background: undefined })}
                            className="p-1 text-gray-400 hover:text-red-600 shrink-0"
                            aria-label="Clear background"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </Field>

                    <Field label="Badge text (optional, e.g. 'Foil & Letterpress')">
                      <input
                        type="text"
                        value={pick.badge ?? ''}
                        onChange={(e) =>
                          setPick(rIdx, pIdx, { badge: e.target.value || undefined })
                        }
                        className={inputCls}
                      />
                    </Field>
                  </CollapsibleCard>
                ))}
                <button
                  type="button"
                  onClick={() => addPick(rIdx)}
                  className="flex items-center gap-2 text-xs font-medium text-[#7E5896] hover:text-[#5d3a78] px-3 py-1.5 rounded-lg border border-dashed border-[#C9A0DC] hover:bg-[#F0DFF6] transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add pick
                </button>
              </div>
            </CollapsibleCard>
          ))}
          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-2 text-sm font-medium text-[#7E5896] hover:text-[#5d3a78] px-3 py-2 rounded-lg border border-dashed border-[#C9A0DC] hover:bg-[#F0DFF6] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add row
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
        <EditorsPicksPreview content={draft} locale={previewLocale} />
      </div>
    </div>
  )
}

function EditorsPicksPreview({
  content,
  locale,
}: {
  content: OpusPassDigitalCardsEditorsPicksContent
  locale: Locale
}) {
  return (
    <div className="space-y-4">
      {content.rows.map((row) => (
        <div key={row.id} className="grid grid-cols-4 gap-2">
          <div className={row.align === 'right' ? 'order-last' : ''}>
            <p className="text-xs font-bold uppercase tracking-tight leading-tight text-gray-900">
              {resolveLocalized(row.title_line_1, locale) || 'Title line 1'}
              <br />
              {resolveLocalized(row.title_line_2, locale) || 'Title line 2'}
            </p>
          </div>
          {row.picks.slice(0, 3).map((pick) => (
            <div
              key={pick.id}
              className="aspect-square rounded overflow-hidden relative"
              style={{ backgroundColor: pick.background ?? '#f3f4f6' }}
            >
              {pick.media_url && pick.media_type === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={resolveOpusPassAssetUrl(pick.media_url)} alt="" className="w-full h-full object-cover" />
              ) : pick.media_url && pick.media_type === 'video' ? (
                <video
                  src={resolveOpusPassAssetUrl(pick.media_url)}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-[8px] uppercase tracking-wider text-gray-500">
                  {pick.treatment ?? 'no visual'}
                </div>
              )}
              {pick.badge && (
                <span className="absolute top-1 left-1 bg-white/95 px-1 py-0.5 rounded text-[7px] font-bold uppercase tracking-wider text-gray-900">
                  {pick.badge}
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

type PickVisualMode = 'media' | 'design'

function PickVisualSection({
  pick,
  onPatch,
}: {
  pick: OpusPassEditorsPicksPick
  onPatch: (patch: Partial<OpusPassEditorsPicksPick>) => void
}) {
  // Initial mode derives from whatever is already saved, but the user's
  // choice persists locally so toggling to "Upload" doesn't snap back to
  // "Design" before they've actually uploaded anything.
  const [mode, setMode] = useState<PickVisualMode>(pick.media_url ? 'media' : 'design')

  const switchTo = (next: PickVisualMode) => {
    if (next === mode) return
    setMode(next)
    // Clear the other side's fields so the saved row matches what the
    // editor is actually showing — no orphan media URL hiding when the
    // admin's UI says "Built-in design".
    if (next === 'media') {
      onPatch({ treatment: undefined, centered: undefined })
    } else {
      onPatch({ media_url: undefined, media_type: undefined })
    }
  }

  return (
    <fieldset className="border border-gray-200 rounded-lg p-3 pt-2 space-y-3">
      <legend className="px-1 text-[11px] font-bold uppercase tracking-wider text-gray-500">
        Visual
      </legend>

      <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-lg">
        <button
          type="button"
          onClick={() => switchTo('media')}
          className={cn(
            'flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
            mode === 'media'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900',
          )}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          Upload image or video
        </button>
        <button
          type="button"
          onClick={() => switchTo('design')}
          className={cn(
            'flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
            mode === 'design'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900',
          )}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Use a built-in design
        </button>
      </div>

      {mode === 'media' ? (
        <MediaUploadField
          label="Image or video"
          value={pick.media_url ?? ''}
          mediaType={pick.media_type ?? 'image'}
          onChange={({ url, type }) =>
            onPatch({
              media_url: url || undefined,
              media_type: url ? type : undefined,
            })
          }
          pathPrefix="opus-pass/invitations/editors-picks"
          previewAspect="aspect-square"
          previewWidth="max-w-[200px]"
        />
      ) : (
        <>
          <Field label="Design style">
            <select
              value={pick.treatment ?? ''}
              onChange={(e) =>
                onPatch({
                  treatment:
                    (e.target.value as OpusPassEditorsPicksTreatment | '') || undefined,
                })
              }
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] focus:border-transparent transition-all"
            >
              <option value="">— pick a design —</option>
              {EDITORS_PICKS_TREATMENTS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
            <input
              type="checkbox"
              checked={pick.centered ?? false}
              onChange={(e) => onPatch({ centered: e.target.checked })}
            />
            Centered (small card with shadow)
          </label>
        </>
      )}
    </fieldset>
  )
}
