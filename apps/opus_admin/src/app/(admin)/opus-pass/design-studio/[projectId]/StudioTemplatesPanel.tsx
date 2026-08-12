'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, Frame, Mic, Plus, Search, Sparkles } from 'lucide-react'

import {
  ARTBOARD_PRESET_CATEGORIES,
  ARTBOARD_PRESETS,
  CARD_STARTERS,
  CARD_STARTER_EVENT_TYPES,
  type ArtboardPreset,
  type CardStarter,
  type CardStarterEventType,
} from '@opusfesta/design-engine'

type Props = {
  currentPresetKey?: string | null
  currentWidth?: number
  currentHeight?: number
  activeStarterKey?: string | null
  onApplyStarter: (starter: CardStarter) => void
  onApplyFramePreset: (preset: ArtboardPreset) => void
}

const PREVIEW_LINES: Record<string, { eyebrow: string; title: string; sub: string }> = {
  wedding_ivory: { eyebrow: 'Together with their families', title: 'Amara &\nJabari', sub: 'request the pleasure' },
  wedding_navy: { eyebrow: 'An evening celebration', title: 'Amara &\nJabari', sub: 'joyfully invite you' },
  wedding_lavender: { eyebrow: 'With love', title: 'Amara &\nJabari', sub: 'celebrate with us' },
  send_off: { eyebrow: 'With joyful hearts', title: 'Send-Off', sub: 'of Amara & Jabari' },
  kitchen_party: { eyebrow: 'You are invited', title: 'Kitchen\nParty', sub: 'in honour of Amara' },
  bridal_shower: { eyebrow: 'Please join us', title: 'Bridal\nShower', sub: 'celebrating Amara' },
  save_the_date: { eyebrow: 'Save the Date', title: '12 · 09\n2026', sub: 'Amara & Jabari' },
  contribution_pledge: { eyebrow: 'With gratitude', title: 'Your\nGift', sub: 'in celebration of' },
}

function StarterPreview({ starter }: { starter: CardStarter }) {
  const t = starter.theme
  const copy = PREVIEW_LINES[starter.key] ?? {
    eyebrow: starter.eventTypeLabel,
    title: starter.name.split('·')[0]?.trim() ?? starter.name,
    sub: 'Invitation',
  }
  const dark = t.background.toLowerCase() < '#888888'

  return (
    <div
      className="relative aspect-4/5 w-full overflow-hidden rounded-xl"
      style={{ background: t.background }}
    >
      {/* Soft atmosphere */}
      <div
        className="pointer-events-none absolute -left-6 -top-8 h-24 w-24 rounded-full opacity-50 blur-2xl"
        style={{ background: t.accentSoft }}
      />
      <div
        className="pointer-events-none absolute -bottom-10 -right-4 h-28 w-28 rounded-full opacity-40 blur-2xl"
        style={{ background: t.accent }}
      />

      {/* Floral / ornament accents */}
      <div
        className="absolute left-2 top-3 h-10 w-10 rounded-full opacity-70"
        style={{ background: t.accentSoft }}
      />
      <div
        className="absolute right-2 top-5 h-7 w-7 rounded-full opacity-55"
        style={{ background: t.accent }}
      />
      <div
        className="absolute bottom-3 left-1/2 h-8 w-[70%] -translate-x-1/2 rounded-[40%] opacity-35"
        style={{ background: t.accentSoft }}
      />

      {/* Content panel */}
      <div
        className="absolute inset-x-3 top-[22%] bottom-[18%] flex flex-col items-center justify-center rounded-lg px-2 text-center shadow-sm"
        style={{ background: `${t.panel}ee` }}
      >
        <p
          className="text-[7px] font-medium uppercase tracking-[0.14em]"
          style={{ color: t.muted }}
        >
          {copy.eyebrow}
        </p>
        <p
          className="mt-1 whitespace-pre-line text-[13px] font-semibold leading-[1.05] tracking-tight"
          style={{
            color: t.ink,
            fontFamily: 'Georgia, "Times New Roman", serif',
          }}
        >
          {copy.title}
        </p>
        <div
          className="my-1.5 h-px w-8 opacity-50"
          style={{ background: t.accent }}
        />
        <p className="text-[7px] leading-tight" style={{ color: t.muted }}>
          {copy.sub}
        </p>
      </div>

      {/* Bottom dress / accent dots */}
      <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
        {[t.swatchA, t.swatchB, t.swatchC].map((c, i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full ring-1 ring-black/5"
            style={{ background: c }}
          />
        ))}
      </div>

      {/* Subtle edge */}
      <div
        className={`pointer-events-none absolute inset-0 rounded-xl ring-1 ${
          dark ? 'ring-white/10' : 'ring-black/5'
        }`}
      />
    </div>
  )
}

export function StudioTemplatesPanel({
  currentPresetKey,
  currentWidth,
  currentHeight,
  activeStarterKey,
  onApplyStarter,
  onApplyFramePreset,
}: Props) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<CardStarterEventType | 'all'>('all')
  const [showFrames, setShowFrames] = useState(false)
  const [generateHint, setGenerateHint] = useState(false)

  const starters = useMemo(() => {
    const q = query.trim().toLowerCase()
    return CARD_STARTERS.filter((s) => {
      if (filter !== 'all' && s.eventType !== filter) return false
      if (!q) return true
      return (
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.eventTypeLabel.toLowerCase().includes(q) ||
        s.eventType.replace(/_/g, ' ').includes(q)
      )
    })
  }, [filter, query])

  const runSearch = () => {
    // Search is live-filtered; keep focus on results.
    setGenerateHint(false)
  }

  const runGenerate = () => {
    setGenerateHint(true)
    const q = query.trim().toLowerCase()
    if (!q) return
    const match =
      CARD_STARTERS.find(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.eventTypeLabel.toLowerCase().includes(q) ||
          s.eventType.replace(/_/g, ' ').includes(q),
      ) ?? null
    if (match) onApplyStarter(match)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Prompt / search — Canva-like discovery header */}
      <div className="space-y-2">
        <label className="relative block">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
            <Plus className="h-4 w-4" />
          </span>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setGenerateHint(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runSearch()
            }}
            placeholder="Describe your ideal design"
            className="h-10 w-full rounded-xl border border-gray-200 bg-[#F7F7F8] py-2 pl-9 pr-9 text-[13px] text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:ring-2 focus:ring-gray-900/5"
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
            <Mic className="h-4 w-4" />
          </span>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={runGenerate}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white text-[12px] font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-50"
            title="Suggest a starter from your description"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
            Generate
            <ChevronDown className="h-3 w-3 text-gray-400" />
          </button>
          <button
            type="button"
            onClick={runSearch}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-gray-900 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-gray-800"
          >
            <Search className="h-3.5 w-3.5" />
            Search
          </button>
        </div>

        {generateHint ? (
          <p className="rounded-lg bg-[#FFF8EE] px-2.5 py-1.5 text-[10px] leading-snug text-[#8A5A00]">
            {query.trim()
              ? 'Applied the closest matching card starter. Full AI generate is coming — browse more below.'
              : 'Describe an event (wedding, send-off, bridal shower…) then Generate, or pick a template.'}
          </p>
        ) : null}
      </div>

      {/* Category chips */}
      <div className="no-scrollbar -mx-0.5 flex gap-1.5 overflow-x-auto px-0.5 pb-0.5">
        {CARD_STARTER_EVENT_TYPES.map((t) => {
          const active = filter === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                active
                  ? 'bg-gray-900 text-white'
                  : 'bg-[#F0F0F1] text-gray-600 hover:bg-gray-200 hover:text-gray-900'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Visual template grid */}
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-[12px] font-semibold text-gray-900">
            {filter === 'all' ? 'Card templates' : CARD_STARTER_EVENT_TYPES.find((t) => t.id === filter)?.label}
          </h3>
          <span className="text-[10px] tabular-nums text-gray-400">{starters.length}</span>
        </div>

        {starters.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-[#FAFAFA] px-4 py-10 text-center">
            <p className="text-[13px] font-medium text-gray-700">No templates match</p>
            <p className="mt-1 text-[11px] text-gray-500">
              Try another event type or clear the search.
            </p>
            <button
              type="button"
              className="mt-3 text-[11px] font-semibold text-gray-800 underline-offset-2 hover:underline"
              onClick={() => {
                setQuery('')
                setFilter('all')
              }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {starters.map((starter) => {
              const active = activeStarterKey === starter.key
              return (
                <button
                  key={starter.key}
                  type="button"
                  onClick={() => onApplyStarter(starter)}
                  title={starter.description}
                  className={`group relative overflow-hidden rounded-2xl text-left transition-all ${
                    active
                      ? 'ring-2 ring-[#0B99FF] ring-offset-2'
                      : 'hover:-translate-y-0.5 hover:shadow-md'
                  }`}
                >
                  <StarterPreview starter={starter} />
                  <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/55 via-black/20 to-transparent px-2 pb-2 pt-8 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="block truncate text-[11px] font-semibold text-white">
                      {starter.name}
                    </span>
                  </div>
                  {active ? (
                    <span className="absolute right-1.5 top-1.5 rounded-md bg-[#0B99FF] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow">
                      Active
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}

        <p className="mt-2.5 text-[10px] leading-snug text-gray-400">
          Starters include guest, couple, date & venue fields — ready to bind in Data.
        </p>
      </div>

      {/* Frame sizes — secondary */}
      <div className="border-t border-gray-100 pt-3">
        <button
          type="button"
          onClick={() => setShowFrames((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl px-1 py-1 text-left hover:bg-gray-50"
        >
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-700">
            <Frame className="h-3.5 w-3.5 text-gray-400" />
            Blank frame sizes
          </span>
          <span className="text-[10px] text-gray-400">{showFrames ? 'Hide' : 'Show'}</span>
        </button>

        {showFrames ? (
          <div className="mt-2 space-y-3">
            <p className="px-1 text-[10px] leading-snug text-gray-400">
              Change canvas size without replacing your layout.
            </p>
            {ARTBOARD_PRESET_CATEGORIES.map((cat) => {
              const items = ARTBOARD_PRESETS.filter((p) => p.category === cat.key)
              if (!items.length) return null
              return (
                <div key={cat.key}>
                  <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    {cat.label}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {items.map((preset) => {
                      const active =
                        preset.key === currentPresetKey ||
                        (preset.width === currentWidth && preset.height === currentHeight)
                      const ratio = preset.height / preset.width
                      return (
                        <button
                          key={preset.key}
                          type="button"
                          onClick={() => onApplyFramePreset(preset)}
                          className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-center transition-colors ${
                            active
                              ? 'border-[#0B99FF]/40 bg-[#E8F4FF]'
                              : 'border-gray-200 bg-[#F7F7F8] hover:border-gray-300 hover:bg-white'
                          }`}
                        >
                          <span
                            className="rounded-[3px] border border-black/10 bg-white shadow-sm"
                            style={{
                              width: 28,
                              height: Math.min(40, Math.max(16, Math.round(28 * ratio))),
                            }}
                          />
                          <span className="w-full truncate text-[10px] font-medium text-gray-800">
                            {preset.name}
                          </span>
                          <span className="text-[9px] tabular-nums text-gray-400">
                            {preset.width}×{preset.height}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}
