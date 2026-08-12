'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
  Lock,
  Globe,
  Megaphone,
  Monitor,
  Pencil,
  Search,
  Smartphone,
  Sparkles,
  Upload,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { FONT_OPTIONS, FONT_STACKS, type FontKey } from '@/lib/builder/types'
import {
  ANIMATION_STYLES,
  COLOR_DOTS,
  DESIGN_COLORS,
  DESIGN_PRESETS,
  DESIGN_STYLES,
  FONT_EFFECTS,
  TRANSITIONS,
  formatLongDate,
  getLayout,
  getPreset,
  photoLabel,
  SAMPLE_PHOTOS,
  LAYOUT_OPTIONS,
  type DesignColor,
  type DesignPreset,
  type DesignStyle,
} from '@/lib/builder/presets'
import type { BuilderApi } from '../useBuilder'
import { uploadWebsitePhoto } from '../actions'
import { Field, TextInput } from './ui'

// ─────────────────────────────────────────────────────────────────────────────
//  Shared bits
// ─────────────────────────────────────────────────────────────────────────────

function PanelTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-[20px] font-semibold tracking-tight text-[#1A1A1A]">{children}</h2>
      {action}
    </div>
  )
}

/** Multi-select dropdown with checkbox rows (and optional colour dots). */
function FilterMenu({
  label,
  options,
  selected,
  onToggle,
  dots,
}: {
  label: string
  options: string[]
  selected: string[]
  onToggle: (v: string) => void
  dots?: Record<string, string>
}) {
  const [open, setOpen] = useState(false)
  const count = selected.length
  return (
    <div className="relative">
      <button data-opus-button="neutral" data-opus-button-size="small"
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
          count ? 'border-[#C9A0DC] bg-[#F3EAFA] text-[#7A3FB8]' : 'border-black/15 text-gray-700 hover:border-black/30',
        )}
      >
        {label}
        {count > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#7A3FB8] px-1 text-[10px] font-bold text-white">
            {count}
          </span>
        )}
        <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 z-30 mt-1.5 max-h-80 w-56 overflow-auto rounded-2xl border border-black/10 bg-white py-1.5 shadow-xl">
            {options.map((o) => {
              const on = selected.includes(o)
              return (
                <button data-opus-button="control"
                  key={o}
                  type="button"
                  onClick={() => onToggle(o)}
                  className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-[#F3EAFA]"
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
                      on ? 'border-[#7A3FB8] bg-[#7A3FB8] text-white' : 'border-black/25',
                    )}
                  >
                    {on && <Check size={13} strokeWidth={3} />}
                  </span>
                  {dots && (
                    <span className="h-4 w-4 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: dots[o] }} />
                  )}
                  <span className="text-[15px] text-[#1A1A1A]">{o}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  DESIGN — "Pick a design"
// ─────────────────────────────────────────────────────────────────────────────

export type DesignView = 'summary' | 'grid'

export function DesignPanel({
  api,
  view,
  onViewChange,
}: {
  api: BuilderApi
  view: DesignView
  onViewChange: (v: DesignView) => void
}) {
  // Two levels, like Zola: the design summary (current design + fonts + colours)
  // and the "Pick a design" grid. Back from the grid returns to the summary.
  return view === 'summary' ? (
    <DesignSummary api={api} onChangeDesign={() => onViewChange('grid')} />
  ) : (
    <DesignGrid api={api} onBack={() => onViewChange('summary')} />
  )
}

// ── Design summary (the default Design view) ─────────────────────────────────

export function DesignSummary({ api, onChangeDesign }: { api: BuilderApi; onChangeDesign: () => void }) {
  const meta = api.doc.meta
  const preset = getPreset(meta.presetId)
  const p = preset.palette

  return (
    <div className="space-y-6">
      <h2 className="text-[20px] font-semibold tracking-tight">Design</h2>

      {/* Current design */}
      <div className="flex items-start gap-5">
        <div className="w-[140px] shrink-0 overflow-hidden rounded-lg ring-1 ring-black/10">
          <DesignThumb preset={preset} />
        </div>
        <div className="pt-2">
          <p className="text-[20px] font-semibold tracking-tight text-[#1A1A1A]">{preset.name}</p>
          <p className="mt-1 max-w-[220px] text-[12.5px] leading-snug text-gray-500">{preset.tagline}</p>
          <button data-opus-button="primary" data-opus-button-size="medium"
            type="button"
            onClick={onChangeDesign}
            className="mt-3 rounded-full bg-[#1A1A1A] px-6 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-black"
          >
            Change design
          </button>
        </div>
      </div>

      {/* Fonts */}
      <Field label="Header font">
        <FontSelect
          value={meta.headingFont ?? preset.headingFont}
          defaultFont={preset.headingFont}
          onChange={(f) => api.updateMeta({ headingFont: f })}
        />
      </Field>
      <Field label="Body font">
        <FontSelect
          value={meta.bodyFont ?? preset.bodyFont}
          defaultFont={preset.bodyFont}
          onChange={(f) => api.updateMeta({ bodyFont: f })}
        />
      </Field>

      <div className="border-t border-black/8" />

      {/* Colours */}
      <div className="overflow-hidden rounded-2xl border border-black/10">
        <ColorControl
          label="Background color"
          value={meta.bgColor ?? p.bg}
          swatches={['#FFFFFF', p.bg]}
          onChange={(c) => api.updateMeta({ bgColor: c })}
        />
        <ColorControl
          label="Heading font color"
          value={meta.headingColor ?? p.accent}
          swatches={[p.accent, '#1A1A1A']}
          onChange={(c) => api.updateMeta({ headingColor: c })}
        />
        <ColorControl
          label="Paragraph font color"
          value={meta.paragraphColor ?? p.ink}
          swatches={['#1A1A1A', p.ink]}
          onChange={(c) => api.updateMeta({ paragraphColor: c })}
        />
        <ColorControl
          label="Button and link color"
          value={meta.accentOverride ?? p.accent}
          swatches={[p.accent, '#1A1A1A']}
          onChange={(c) => api.updateMeta({ accentOverride: c })}
        />
      </div>

      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={meta.navDifferent ?? false}
          onChange={(e) => api.updateMeta({ navDifferent: e.target.checked })}
          className="h-4 w-4 rounded border-black/25 accent-[#7A3FB8]"
        />
        <span className="text-[14px] text-[#1A1A1A]">Use different colors for navigation</span>
      </label>
    </div>
  )
}

function FontSelect({
  value,
  defaultFont,
  onChange,
}: {
  value: FontKey
  defaultFont: FontKey
  onChange: (f: FontKey) => void
}) {
  const [open, setOpen] = useState(false)
  const label = (f: FontKey) => (f === defaultFont ? `${f} (Default)` : f)
  return (
    <div className="relative">
      <button data-opus-button="neutral" data-opus-button-size="large"
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-black/15 bg-white px-4 py-3 text-[15px] transition-colors hover:border-black/30"
      >
        <span style={{ fontFamily: FONT_STACKS[value] }}>{label(value)}</span>
        <ChevronDown size={18} className={cn('text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul className="absolute z-30 mt-1.5 max-h-72 w-full overflow-auto rounded-lg border border-black/10 bg-white py-1 shadow-lg">
          {FONT_OPTIONS.map((f) => (
            <li key={f}>
              <button data-opus-button="control"
                type="button"
                onClick={() => {
                  onChange(f)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between px-4 py-2.5 text-left text-[15px] hover:bg-[#F3EAFA]',
                  f === value && 'bg-[#FBF7FE]',
                )}
                style={{ fontFamily: FONT_STACKS[f] }}
              >
                {label(f)}
                {f === value && <Check size={15} className="text-[#7A3FB8]" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ColorControl({
  label,
  value,
  swatches,
  onChange,
}: {
  label: string
  value: string
  swatches: string[]
  onChange: (c: string) => void
}) {
  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
  return (
    <div className="flex items-center justify-between border-b border-black/8 px-4 py-3.5 last:border-b-0">
      <span className="text-[14px] text-[#1A1A1A]">{label}</span>
      <div className="flex items-center gap-2">
        {swatches.map((c) => (
          <button data-opus-button="control"
            key={c}
            type="button"
            aria-label={`${label} ${c}`}
            onClick={() => onChange(c)}
            className={cn(
              'h-7 w-7 rounded-full ring-1 ring-black/15 transition-all',
              eq(value, c) && 'ring-2 ring-[#1A1A1A] ring-offset-1',
            )}
            style={{ backgroundColor: c }}
          />
        ))}
        {/* Custom colour — native picker behind a rainbow swatch */}
        <label
          className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full ring-1 ring-black/15"
          style={{ background: 'conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red)' }}
        >
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute -inset-2 cursor-pointer opacity-0"
            aria-label={`Custom ${label}`}
          />
        </label>
      </div>
    </div>
  )
}

// ── "Pick a design" grid ─────────────────────────────────────────────────────

type SortKey = 'featured' | 'newest' | 'popular'
const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: 'featured', label: 'Featured' },
  { id: 'newest', label: 'Newest' },
  { id: 'popular', label: 'Popular' },
]

// Curated "Popular" ranking; designs not listed fall to the end in original order.
const POPULAR_ORDER = ['serengeti', 'bagamoyo', 'zahari', 'dhahabu', 'tanzanite', 'mwangaza', 'amani', 'kanga']
const popRank = (id: string) => {
  const i = POPULAR_ORDER.indexOf(id)
  return i === -1 ? POPULAR_ORDER.length + 1 : i
}

function SortMenu({ value, onChange }: { value: SortKey; onChange: (v: SortKey) => void }) {
  const [open, setOpen] = useState(false)
  const current = SORT_OPTIONS.find((o) => o.id === value)?.label ?? 'Featured'
  return (
    <div className="relative">
      <button data-opus-button="control"
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[13px] font-semibold text-gray-700 transition-colors hover:text-[#1A1A1A]"
      >
        Sort: {current}
        <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-30 mt-1.5 w-48 overflow-hidden rounded-2xl border border-black/10 bg-white py-1.5 shadow-xl">
            {SORT_OPTIONS.map((o) => (
              <button data-opus-button="control"
                key={o.id}
                type="button"
                onClick={() => {
                  onChange(o.id)
                  setOpen(false)
                }}
                className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-[14px] hover:bg-[#F3EAFA]"
              >
                {o.label}
                {value === o.id && <Check size={14} className="text-[#7A3FB8]" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function DesignGrid({ api, onBack }: { api: BuilderApi; onBack: () => void }) {
  const [styles, setStyles] = useState<DesignStyle[]>([])
  const [colors, setColors] = useState<DesignColor[]>([])
  const [sort, setSort] = useState<SortKey>('featured')
  const current = api.doc.meta.presetId

  const toggle = <T,>(set: React.Dispatch<React.SetStateAction<T[]>>, v: T) =>
    set((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]))

  const visible = DESIGN_PRESETS.filter(
    (p) => (!styles.length || styles.includes(p.style)) && (!colors.length || colors.includes(p.color)),
  )
  if (sort === 'newest') visible.reverse()
  else if (sort === 'popular') visible.sort((a, b) => popRank(a.id) - popRank(b.id))

  // Selecting a template clears every per-design override so it starts clean,
  // and adopts the template's own default hero layout.
  const selectPreset = (id: string) =>
    api.updateMeta({
      presetId: id,
      layoutId: getPreset(id).defaultLayoutId,
      accentOverride: undefined,
      headingFont: undefined,
      bodyFont: undefined,
      bgColor: undefined,
      headingColor: undefined,
      paragraphColor: undefined,
    })

  return (
    <div className="space-y-5">
      {/* Header: ← Back · centered title · Sort */}
      <div className="flex items-center">
        <button data-opus-button="control"
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-[14px] font-semibold text-[#1A1A1A] transition-opacity hover:opacity-70"
        >
          <ArrowLeft size={17} /> Back
        </button>
        <h2 className="flex-1 text-center text-[19px] font-semibold tracking-tight">Pick a design</h2>
        <span className="w-[58px]" aria-hidden />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FilterMenu label="Style" options={DESIGN_STYLES} selected={styles} onToggle={(v) => toggle(setStyles, v as DesignStyle)} />
          <FilterMenu label="Color" options={DESIGN_COLORS} selected={colors} onToggle={(v) => toggle(setColors, v as DesignColor)} dots={COLOR_DOTS} />
        </div>
        <SortMenu value={sort} onChange={setSort} />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-6 xl:grid-cols-3">
        {visible.map((p) => {
          const selected = p.id === current
          return (
            <div key={p.id} className="group">
              <button data-opus-button="neutral" data-opus-button-size="medium"
                type="button"
                onClick={() => selectPreset(p.id)}
                className={cn(
                  'relative block w-full overflow-hidden rounded-lg bg-white ring-1 transition-all',
                  selected ? 'ring-2 ring-[#1A1A1A]' : 'ring-black/10 group-hover:ring-black/25',
                )}
              >
                <DesignThumb preset={p} />
                {selected && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[#9FE870] px-2 py-0.5 text-[10px] font-bold text-[#1A1A1A] shadow ring-1 ring-black/5">
                    <Check size={11} strokeWidth={3} /> Selected
                  </span>
                )}
              </button>
              <p
                className={cn(
                  'mt-2 text-[14px] font-semibold text-[#1A1A1A]',
                  selected && 'underline underline-offset-[3px]',
                )}
              >
                {p.name}
              </p>
              <div className="mt-1.5 flex items-center gap-1.5">
                {p.swatches.map((c, i) => (
                  <button data-opus-button="control"
                    key={`${c}-${i}`}
                    type="button"
                    aria-label={`Select ${p.name}`}
                    onClick={() => selectPreset(p.id)}
                    className={cn(
                      'h-4 w-4 rounded-full ring-1 ring-black/10 transition-all',
                      selected && i === 0 && 'ring-2 ring-[#1A1A1A] ring-offset-1',
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Realistic mini-site thumbnail ────────────────────────────────────────────

/** Browser chrome + a faithful miniature hero in the preset's colours/fonts. */
function DesignThumb({ preset }: { preset: DesignPreset }) {
  const kind = preset.thumb
  return (
    <div className="flex aspect-[5/6] w-full flex-col overflow-hidden" style={{ backgroundColor: preset.palette.surface }}>
      <ThumbChrome />
      {kind === 'photo' && <ThumbPhoto preset={preset} />}
      {kind === 'floral' && <ThumbFloral preset={preset} />}
      {kind === 'text' && <ThumbText preset={preset} />}
    </div>
  )
}

function ThumbChrome() {
  return (
    <div className="flex shrink-0 items-center gap-[3px] bg-[#ECEAE6] px-2 py-[5px]">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-[3px] w-[3px] rounded-full bg-black/25" />
      ))}
    </div>
  )
}

function ThumbTitle({ preset }: { preset: DesignPreset }) {
  return (
    <p
      className="text-center text-[5.5px] font-semibold uppercase tracking-[0.16em]"
      style={{ color: preset.palette.ink, fontFamily: FONT_STACKS[preset.headingFont] }}
    >
      Neema &amp; Amani
    </p>
  )
}

function ThumbNav() {
  return (
    <div className="mt-1 flex justify-center gap-[3px]">
      {Array.from({ length: 7 }).map((_, i) => (
        <span key={i} className="h-[2px] w-2 rounded-full bg-black/12" />
      ))}
    </div>
  )
}

function ThumbNames({ preset, size = 13 }: { preset: DesignPreset; size?: number }) {
  const p = preset.palette
  const h = { fontFamily: FONT_STACKS[preset.headingFont], color: p.ink, lineHeight: 1.04 }
  return (
    <div className="flex flex-col items-center gap-[1px]">
      <span style={{ ...h, fontSize: size }}>Neema</span>
      <span style={{ color: p.accent, fontSize: size * 0.42 }}>&amp;</span>
      <span style={{ ...h, fontSize: size }}>Amani</span>
    </div>
  )
}

function ThumbMeta({ preset }: { preset: DesignPreset }) {
  return (
    <span className="text-[5px] uppercase tracking-[0.2em]" style={{ color: preset.palette.ink, opacity: 0.55 }}>
      22 Aug 2026
    </span>
  )
}

function ThumbRsvp({ preset }: { preset: DesignPreset }) {
  return (
    <span
      className="rounded-full px-2.5 py-[3px] text-[4.5px] font-bold uppercase tracking-[0.14em]"
      style={{ backgroundColor: preset.palette.accent, color: preset.palette.onAccent }}
    >
      RSVP
    </span>
  )
}

function ThumbPhoto({ preset }: { preset: DesignPreset }) {
  return (
    <div className="flex flex-1 flex-col px-2.5 pb-2.5 pt-1.5">
      <ThumbTitle preset={preset} />
      <ThumbNav />
      <div className="relative mt-1.5 h-[42%] w-full overflow-hidden rounded-[2px]">
        <Image src={preset.heroPhoto} alt="" fill sizes="160px" className="object-cover" />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-1">
        <ThumbNames preset={preset} size={11} />
        <ThumbMeta preset={preset} />
      </div>
      <div className="mt-auto flex justify-center">
        <ThumbRsvp preset={preset} />
      </div>
    </div>
  )
}

function ThumbFloral({ preset }: { preset: DesignPreset }) {
  return (
    <div className="relative flex flex-1 flex-col px-2.5 pb-2.5 pt-1.5">
      <LeafCorner className="left-0 top-5" />
      <LeafCorner className="right-0 top-5" flip />
      <div className="relative z-10 flex flex-1 flex-col">
        <ThumbTitle preset={preset} />
        <ThumbNav />
        <div className="flex flex-1 flex-col items-center justify-center gap-1">
          <ThumbNames preset={preset} size={12} />
          <span className="block h-px w-4" style={{ backgroundColor: preset.palette.accent, opacity: 0.4 }} />
          <ThumbMeta preset={preset} />
        </div>
        <div className="mt-auto flex justify-center">
          <ThumbRsvp preset={preset} />
        </div>
      </div>
    </div>
  )
}

function ThumbText({ preset }: { preset: DesignPreset }) {
  return (
    <div className="flex flex-1 flex-col px-2.5 pb-2.5 pt-1.5">
      <ThumbTitle preset={preset} />
      <ThumbNav />
      <div className="flex flex-1 flex-col items-center justify-center gap-1">
        <ThumbNames preset={preset} size={13} />
        <ThumbMeta preset={preset} />
      </div>
      <div className="mt-auto flex justify-center">
        <ThumbRsvp preset={preset} />
      </div>
    </div>
  )
}

/** Small watercolour-style greenery cluster for floral/classic thumbnails. */
function LeafCorner({ className, flip }: { className?: string; flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden
      className={cn('pointer-events-none absolute h-[40%] w-[40%]', flip && 'scale-x-[-1]', className)}
    >
      <path d="M6 8 Q34 26 50 60" fill="none" stroke="#6E7A56" strokeWidth="2.4" strokeLinecap="round" />
      {[
        [14, 20, -32, '#7E8C5A'],
        [24, 34, -20, '#5C6B4D'],
        [34, 48, -8, '#8DA06A'],
        [20, 12, -55, '#9CAE78'],
        [40, 30, -38, '#4F5B3C'],
      ].map(([cx, cy, rot, fill], i) => (
        <ellipse key={i} cx={cx as number} cy={cy as number} rx="5" ry="9" fill={fill as string} transform={`rotate(${rot} ${cx} ${cy})`} opacity="0.92" />
      ))}
      <circle cx="46" cy="20" r="2.4" fill="#D7B7C0" />
      <circle cx="52" cy="27" r="2" fill="#E4C9D0" />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  LAYOUT
// ─────────────────────────────────────────────────────────────────────────────

export function LayoutPanel({ api }: { api: BuilderApi }) {
  const meta = api.doc.meta
  return (
    <div className="space-y-7">
      <PanelTitle>Layout</PanelTitle>

      <div className="grid grid-cols-4 gap-x-3 gap-y-4">
        {LAYOUT_OPTIONS.map((l) => {
          const active = meta.layoutId === l.id
          return (
            <button data-opus-button="control"
              key={l.id}
              type="button"
              onClick={() => api.updateMeta({ layoutId: l.id })}
              className="group text-center"
            >
              <div
                className={cn(
                  'flex aspect-[4/3] items-center justify-center rounded-xl border-2 bg-white p-3 transition-colors',
                  active ? 'border-[#1A1A1A]' : 'border-gray-200 group-hover:border-gray-300',
                )}
              >
                <LayoutGlyph id={l.id} active={active} />
              </div>
              <span className={cn('mt-1.5 block text-[12px] leading-tight', active ? 'font-bold text-[#1A1A1A]' : 'font-medium text-gray-600')}>
                {l.label}
              </span>
            </button>
          )
        })}
      </div>

      <PhotoUploaders api={api} />

      <div>
        <Field label="Welcome message">
          <TextInput
            value={meta.welcome}
            onChange={(v) => api.updateMeta({ welcome: v.slice(0, 150) })}
            placeholder="We're getting married!"
          />
        </Field>
        <p className="mt-1 text-right text-[11px] text-gray-400">{meta.welcome.length}/150</p>
      </div>

      <SaveTheDatePromo meta={meta} />
    </div>
  )
}

// ── Per-layout photo uploaders ───────────────────────────────────────────────

function PhotoUploaders({ api }: { api: BuilderApi }) {
  const meta = api.doc.meta
  const layout = getLayout(meta.layoutId)
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  if (layout.max === 0) return null

  const photos = meta.photos ?? []
  const rows =
    layout.min === layout.max ? layout.max : Math.max(layout.min, Math.min(layout.max, photos.length || layout.min))
  const eff = (i: number) => photos[i] || SAMPLE_PHOTOS[i % SAMPLE_PHOTOS.length]

  const setPhoto = (i: number, url: string) => {
    const next = Array.from({ length: Math.max(rows, photos.length) }, (_, k) => (k === i ? url : photos[k] ?? eff(k)))
    api.updateMeta({ photos: next })
  }
  const move = (i: number, dir: -1 | 1) => {
    const arr = Array.from({ length: rows }, (_, k) => photos[k] ?? eff(k))
    const j = i + dir
    if (j < 0 || j >= arr.length) return
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    api.updateMeta({ photos: arr })
  }
  const addPhoto = () => {
    const cur = Array.from({ length: rows }, (_, k) => photos[k] ?? eff(k))
    if (cur.length >= layout.max) return
    api.updateMeta({ photos: [...cur, SAMPLE_PHOTOS[cur.length % SAMPLE_PHOTOS.length]] })
  }
  const canAdd = layout.min !== layout.max && rows < layout.max
  const multi = rows > 1

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[15px] font-medium text-[#1A1A1A]">{photoLabel(layout)}</span>
        <div className="flex items-center gap-1 rounded-full bg-[#F2F0EB] p-1 ring-1 ring-black/5">
          {([
            { k: 'desktop' as const, Icon: Monitor },
            { k: 'mobile' as const, Icon: Smartphone },
          ]).map(({ k, Icon }) => (
            <button data-opus-button="control"
              key={k}
              type="button"
              aria-label={k}
              onClick={() => setDevice(k)}
              className={cn(
                'flex h-7 w-9 items-center justify-center rounded-full transition-colors',
                device === k ? 'bg-white text-[#1A1A1A] shadow-sm' : 'text-gray-400 hover:text-gray-700',
              )}
            >
              <Icon size={15} />
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-black/10">
        {Array.from({ length: rows }).map((_, i) => (
          <PhotoRow key={i} src={eff(i)} index={i} total={rows} multi={multi} onUpload={(u) => setPhoto(i, u)} onMove={move} />
        ))}
      </div>
      {canAdd && (
        <button data-opus-button="primary" data-opus-button-size="medium"
          type="button"
          onClick={addPhoto}
          className="mt-3 rounded-full bg-[#1A1A1A] px-5 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-black"
        >
          Add a photo
        </button>
      )}
    </div>
  )
}

function PhotoRow({
  src,
  index,
  total,
  multi,
  onUpload,
  onMove,
}: {
  src: string
  index: number
  total: number
  multi: boolean
  onUpload: (url: string) => void
  onMove: (i: number, dir: -1 | 1) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Signed-in couples get a durable storage URL (keeps the published doc lean);
    // otherwise fall back to a local data URL for editing.
    try {
      const fd = new FormData()
      fd.append('file', file)
      const url = await uploadWebsitePhoto(fd)
      onUpload(url)
      return
    } catch {
      /* not signed in / upload failed — use a local preview */
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') onUpload(reader.result)
    }
    reader.readAsDataURL(file)
  }
  return (
    <div className="flex items-center gap-3 border-b border-black/8 px-3 py-2.5 last:border-b-0">
      {multi && (
        <span className="flex flex-col text-gray-400">
          <button data-opus-button="control"
            type="button"
            aria-label="Move up"
            onClick={() => onMove(index, -1)}
            disabled={index === 0}
            className="transition-opacity hover:text-[#1A1A1A] disabled:opacity-25"
          >
            <ChevronDown size={14} className="rotate-180" />
          </button>
          <button data-opus-button="control"
            type="button"
            aria-label="Move down"
            onClick={() => onMove(index, 1)}
            disabled={index === total - 1}
            className="transition-opacity hover:text-[#1A1A1A] disabled:opacity-25"
          >
            <ChevronDown size={14} />
          </button>
        </span>
      )}
      <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-md bg-gray-100 ring-1 ring-black/10">
        <Image src={src} alt="" fill sizes="64px" className="object-cover" />
      </div>
      <button data-opus-button="control"
        type="button"
        onClick={() => inputRef.current?.click()}
        className="ml-auto flex items-center gap-1.5 text-[14px] font-semibold text-[#1A1A1A] transition-opacity hover:opacity-70"
      >
        <Upload size={15} /> Upload
      </button>
      <input ref={inputRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
    </div>
  )
}

/** Light-gray wireframe placeholder used inside every layout glyph. */
function Ph({ className }: { className?: string }) {
  return <div className={cn('rounded-[3px] bg-[#E6E4DF]', className)} />
}

function LayoutGlyph({ id, active }: { id: string; active: boolean }) {
  switch (id) {
    case 'banner':
      return (
        <div className="flex h-full w-full flex-col justify-start gap-1.5">
          <Ph className="h-[42%] w-full" />
          <Ph className="h-[14%] w-1/2" />
        </div>
      )
    case 'full-width':
      return <Ph className="h-full w-full" />
    case 'side-by-side':
      return (
        <div className="flex h-full w-full gap-1.5">
          <Ph className="h-full flex-[1.7]" />
          <Ph className="h-full flex-1" />
        </div>
      )
    case 'squares':
      return (
        <div className="relative h-full w-full">
          <Ph className="absolute bottom-0 left-0 h-[68%] w-[58%]" />
          <Ph className="absolute right-0 top-0 h-[68%] w-[58%] ring-2 ring-white" />
        </div>
      )
    case 'slideshow':
      return (
        <div className="relative h-full w-full">
          <Ph className="h-full w-full" />
          <span className="absolute right-1 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-white/80" />
          <span className="absolute bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5">
            <span className="h-1 w-1 rounded-full bg-white/90" />
            <span className="h-1 w-1 rounded-full bg-white/50" />
            <span className="h-1 w-1 rounded-full bg-white/50" />
          </span>
        </div>
      )
    case 'marquee':
      return (
        <div className="flex h-full w-full items-center gap-1">
          <Ph className="h-[78%] flex-1" />
          <Ph className="h-[78%] flex-1" />
          <Ph className="h-[78%] flex-1" />
        </div>
      )
    case 'text-only':
      return (
        <div className="relative flex items-center justify-center rounded-[3px] border border-[#1A1A1A]/40 px-3 py-1.5">
          <span className="text-[10px] font-semibold tracking-wide text-[#1A1A1A]/55">ABC</span>
          {active &&
            ['-left-1 -top-1', '-right-1 -top-1', '-left-1 -bottom-1', '-right-1 -bottom-1'].map((pos) => (
              <span key={pos} className={cn('absolute h-1.5 w-1.5 rounded-[1px] border border-[#1A1A1A] bg-white', pos)} />
            ))}
        </div>
      )
    case 'single-page':
      return (
        <div className="flex h-full w-full gap-1.5">
          <Ph className="h-full flex-1" />
          <Ph className="h-full w-[18%]" />
        </div>
      )
    default:
      return null
  }
}

// ── Save-the-dates promo ─────────────────────────────────────────────────────

function SaveTheDatePromo({ meta }: { meta: BuilderApi['doc']['meta'] }) {
  const tints = ['#E07A5F', '#9FB89B', '#C9A0DC', '#1A1A1A']
  const [tint, setTint] = useState(tints[0])
  return (
    <div className="rounded-2xl bg-[#F4F2EC] p-4">
      <div className="flex gap-4">
        <SaveTheDateCard meta={meta} tint={tint} />
        <div className="flex min-w-0 flex-1 flex-col">
          <p
            className="text-[18px] font-bold leading-[1.15] text-[#1A1A1A]"
            style={{ fontFamily: FONT_STACKS['Playfair Display'] }}
          >
            Test drive your save the dates
          </p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-gray-600">
            See your paper in real life, printed with your names and wedding date.
          </p>
          <button data-opus-button="primary" data-opus-button-size="medium"
            type="button"
            className="mt-3 inline-flex w-fit rounded-full bg-[#1A1A1A] px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-black"
          >
            Get your free sample
          </button>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        {tints.map((c) => (
          <button data-opus-button="control"
            key={c}
            type="button"
            aria-label={`Paper colour ${c}`}
            onClick={() => setTint(c)}
            className={cn(
              'h-6 w-6 rounded-full ring-1 ring-black/10 transition-all',
              tint === c && 'ring-2 ring-[#1A1A1A] ring-offset-1',
            )}
            style={{ backgroundColor: c }}
          />
        ))}
        <span className="ml-1 text-[12.5px] font-semibold text-gray-500">More</span>
      </div>
    </div>
  )
}

function SaveTheDateCard({ meta, tint }: { meta: BuilderApi['doc']['meta']; tint: string }) {
  const a = meta.partnerA.trim().split(/\s+/)[0] || meta.partnerA
  const b = meta.partnerB.trim().split(/\s+/)[0] || meta.partnerB
  return (
    <div className="w-[100px] shrink-0 overflow-hidden rounded-md bg-white shadow-[0_8px_24px_-8px_rgba(0,0,0,0.3)] ring-1 ring-black/5">
      <div className="flex aspect-[5/7] flex-col">
        <div
          className="h-[44%] w-full"
          style={{ background: `linear-gradient(135deg, ${tint}26 0%, ${tint}99 100%)` }}
        />
        <div className="flex flex-1 flex-col items-center justify-center px-1.5 text-center">
          <span className="text-[5px] font-bold uppercase tracking-[0.22em] text-gray-500">Save the Date</span>
          <span
            className="mt-1 text-[9px] font-semibold leading-tight text-[#1A1A1A]"
            style={{ fontFamily: FONT_STACKS['Playfair Display'] }}
          >
            {a} &amp; {b}
          </span>
          <span className="mt-1 text-[5.5px] uppercase tracking-[0.16em] text-gray-600">{formatLongDate(meta.date)}</span>
          {meta.location && <span className="mt-0.5 text-[5px] text-gray-400">{meta.location}</span>}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  PAGES
// ─────────────────────────────────────────────────────────────────────────────

export function PagesPanel({ api }: { api: BuilderApi }) {
  const meta = api.doc.meta
  const setPageVisible = (key: string, visible: boolean) =>
    api.updateMeta({ pages: meta.pages.map((p) => (p.key === key ? { ...p, visible } : p)) })

  return (
    <div className="space-y-6">
      <PanelTitle action={<Pencil size={16} className="text-gray-400" />}>Home</PanelTitle>

      <Accordion title="Your names" defaultOpen>
        <div className="space-y-3">
          <Field label="Partner one">
            <TextInput value={meta.partnerA} onChange={(v) => api.updateMeta({ partnerA: v })} />
          </Field>
          <Field label="Partner two">
            <TextInput value={meta.partnerB} onChange={(v) => api.updateMeta({ partnerB: v })} />
          </Field>
        </div>
      </Accordion>

      <Accordion title="Wedding details" defaultOpen>
        <div className="space-y-3">
          <Field label="Date">
            <input
              type="date"
              value={meta.date}
              onChange={(e) => api.updateMeta({ date: e.target.value })}
              className="w-full rounded-lg border border-black/12 bg-white px-3 py-2.5 text-[14px] outline-none focus:border-[#C9A0DC] focus:ring-2 focus:ring-[#C9A0DC]/30"
            />
            <p className="mt-1 text-[12px] text-gray-500">{formatLongDate(meta.date)}</p>
          </Field>
          <Field label="Location">
            <TextInput value={meta.location} onChange={(v) => api.updateMeta({ location: v })} placeholder="City, Country" />
          </Field>
        </div>
      </Accordion>

      <Accordion title="Pages">
        <div className="overflow-hidden rounded-xl border border-black/10">
          {meta.pages.map((p, i) => (
            <div
              key={p.key}
              className={cn('flex items-center gap-3 px-3 py-2.5', i > 0 && 'border-t border-black/8')}
            >
              <GripVertical size={15} className="text-gray-300" />
              <span className={cn('flex-1 text-[14px]', p.visible ? 'text-[#1A1A1A]' : 'text-gray-400')}>{p.label}</span>
              <button data-opus-button="control"
                type="button"
                aria-label={p.visible ? `Hide ${p.label}` : `Show ${p.label}`}
                onClick={() => setPageVisible(p.key, !p.visible)}
                className="text-gray-400 transition-colors hover:text-[#7A3FB8]"
              >
                {p.visible ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-gray-500">Toggle a page to show or hide it from your guests.</p>
      </Accordion>
    </div>
  )
}

function Accordion({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-black/8 pb-5">
      <button data-opus-button="control"
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between py-1 text-left"
      >
        <span className="text-[15px] font-bold text-[#1A1A1A]">{title}</span>
        <ChevronDown size={18} className={cn('text-gray-500 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  ANIMATION
// ─────────────────────────────────────────────────────────────────────────────

export function AnimationPanel({ api }: { api: BuilderApi }) {
  const meta = api.doc.meta
  return (
    <div className="space-y-7 pb-24">
      <span className="inline-block rounded-md bg-gradient-to-r from-[#3FA9C9] to-[#8350E8] px-2.5 py-1 text-[11px] font-bold text-white">
        Premium
      </span>

      <Section title="Animation" onClear={() => api.updateMeta({ animationStyle: 'none' })}>
        <div className="grid grid-cols-3 gap-3">
          {ANIMATION_STYLES.filter((a) => a.id !== 'none').map((a) => (
            <Tile
              key={a.id}
              label={a.label}
              active={meta.animationStyle === a.id}
              onClick={() => api.updateMeta({ animationStyle: a.id })}
            >
              <Sparkles size={20} className="text-[#7A3FB8]" />
            </Tile>
          ))}
        </div>
      </Section>

      <Section title="Transitions" onClear={() => api.updateMeta({ transition: 'rise' })}>
        <div className="grid grid-cols-4 gap-3">
          {TRANSITIONS.map((t) => (
            <Tile
              key={t.id}
              label={t.label}
              active={meta.transition === t.id}
              onClick={() => api.updateMeta({ transition: t.id })}
            >
              <span className="text-[11px] font-bold text-[#1A1A1A]">ABC</span>
            </Tile>
          ))}
        </div>
      </Section>

      <Section title="Font effects" onClear={() => api.updateMeta({ fontEffect: 'none' })}>
        <div className="grid grid-cols-3 gap-3">
          {FONT_EFFECTS.filter((f) => f.id !== 'none').map((f) => (
            <Tile
              key={f.id}
              label={f.label}
              active={meta.fontEffect === f.id}
              onClick={() => api.updateMeta({ fontEffect: f.id })}
            >
              <span className="text-[11px] font-bold text-[#1A1A1A]">Aa</span>
            </Tile>
          ))}
        </div>
      </Section>
    </div>
  )
}

function Section({
  title,
  onClear,
  children,
}: {
  title: string
  onClear: () => void
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[17px] font-bold text-[#1A1A1A]">{title}</h3>
        <button data-opus-button="control" type="button" onClick={onClear} className="text-[13px] font-semibold text-gray-500 underline hover:text-[#1A1A1A]">
          Clear
        </button>
      </div>
      {children}
    </div>
  )
}

function Tile({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button data-opus-button="control" type="button" onClick={onClick} className="text-center">
      <div
        className={cn(
          'flex aspect-square items-center justify-center rounded-xl bg-[#F7F6F2] transition-all',
          active ? 'ring-2 ring-[#7A3FB8]' : 'ring-1 ring-black/10 hover:ring-black/25',
        )}
      >
        {children}
      </div>
      <span className={cn('mt-1.5 block text-[12.5px]', active ? 'font-bold text-[#1A1A1A]' : 'font-medium text-gray-600')}>
        {label}
      </span>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsPanel({ api }: { api: BuilderApi }) {
  const meta = api.doc.meta
  return (
    <div className="space-y-8">
      <div>
        <h3 className="mb-3 text-[17px] font-bold text-[#1A1A1A]">General settings</h3>
        <div className="overflow-hidden rounded-2xl border border-black/10">
          <SettingRow
            icon={<Globe size={17} />}
            title="Website visibility"
            sub="Make the site viewable to your guests."
            value={
              <ValuePill
                on={meta.visibility === 'published'}
                onLabel="Published"
                offLabel="Private"
                onToggle={() => api.updateMeta({ visibility: meta.visibility === 'published' ? 'private' : 'published' })}
              />
            }
          />
          <SettingRow
            icon={<Megaphone size={17} />}
            title="Announcement banner"
            sub="Share important messages with guests."
            value={
              <ValuePill
                on={meta.announcement}
                onLabel="Enabled"
                offLabel="Not enabled"
                onToggle={() => api.updateMeta({ announcement: !meta.announcement })}
              />
            }
          />
          <SettingRow
            icon={<Pencil size={17} />}
            title="Website title and display"
            sub="Shown at the top of your site."
            value={<span className="text-[13.5px] font-semibold text-gray-700">{api.doc.title}</span>}
          />
          <SettingRow
            icon={<ChevronRight size={17} />}
            title="Website URL"
            sub="Personalize your website link."
            value={<span className="max-w-[160px] truncate text-[13.5px] font-semibold text-gray-700">{meta.slug}</span>}
          >
            <div className="mt-3 flex items-center rounded-lg border border-black/12 bg-white px-3 py-2 text-[13px]">
              <span className="text-gray-400">opuspass.opusfesta.com/i/</span>
              <input
                value={meta.slug}
                onChange={(e) => api.updateMeta({ slug: slugify(e.target.value) })}
                className="min-w-0 flex-1 bg-transparent font-semibold text-[#1A1A1A] outline-none"
              />
            </div>
          </SettingRow>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-[17px] font-bold text-[#1A1A1A]">Privacy settings</h3>
        <div className="overflow-hidden rounded-2xl border border-black/10">
          <SettingRow
            icon={<Lock size={17} />}
            title="Password protection"
            sub="Limit access to guests with a password."
            value={
              <ValuePill
                on={meta.password}
                onLabel="Enabled"
                offLabel="Not enabled"
                onToggle={() => api.updateMeta({ password: !meta.password })}
              />
            }
          />
          <SettingRow
            icon={<Search size={17} />}
            title="Search engine visibility"
            sub="Appear on Google, etc.?"
            value={
              <ValuePill
                on={meta.searchVisible}
                onLabel="Enabled"
                offLabel="Hidden"
                onToggle={() => api.updateMeta({ searchVisible: !meta.searchVisible })}
              />
            }
          />
        </div>
      </div>
    </div>
  )
}

function SettingRow({
  icon,
  title,
  sub,
  value,
  children,
}: {
  icon: React.ReactNode
  title: string
  sub: string
  value: React.ReactNode
  children?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  // A plain div (not a button) so the interactive `value` (a ValuePill button)
  // is never nested inside a button — which is invalid HTML / hydration error.
  return (
    <div className="border-b border-black/8 last:border-b-0">
      <div
        onClick={() => children && setOpen((v) => !v)}
        className={cn('flex w-full items-center gap-3 px-4 py-4 text-left', children ? 'cursor-pointer' : undefined)}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F3EAFA] text-[#7A3FB8]">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-[#1A1A1A]">{title}</span>
          <span className="block text-[12.5px] text-gray-500">{sub}</span>
        </span>
        <span onClick={(e) => e.stopPropagation()}>{value}</span>
      </div>
      {children && open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

function ValuePill({
  on,
  onLabel,
  offLabel,
  onToggle,
}: {
  on: boolean
  onLabel: string
  offLabel: string
  onToggle: () => void
}) {
  return (
    <button data-opus-button="control"
      type="button"
      onClick={onToggle}
      className={cn('text-[13.5px] font-semibold transition-colors', on ? 'text-[#3FA34D]' : 'text-gray-400')}
    >
      {on ? onLabel : offLabel}
    </button>
  )
}

function slugify(v: string) {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 40)
}
