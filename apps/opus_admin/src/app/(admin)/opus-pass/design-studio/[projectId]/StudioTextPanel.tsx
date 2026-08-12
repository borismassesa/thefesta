'use client'

import { useMemo, useState } from 'react'
import { Pencil, Search, Sparkles, Type } from 'lucide-react'

import {
  TEXT_PHRASES,
  TEXT_PRESETS,
  type TextElement,
} from '@opusfesta/design-engine'

type FontOpt = { id: string; familyName: string | null }

export type TextStyleInsert = {
  name: string
  content: string
  fontSize?: number
  fontWeight?: number
  height?: number
  fontFamily?: string
  italic?: boolean
  uppercase?: boolean
  color?: string
  letterSpacing?: number
}

export type FontCombination = {
  key: string
  label: string
  bg: string
  lines: Array<{
    content: string
    fontFamily: string
    fontSize: number
    fontWeight: number
    italic?: boolean
    color: string
    letterSpacing?: number
    uppercase?: boolean
  }>
}

type Props = {
  brandFont?: string
  onAddEmpty: () => void
  onAddStyle: (style: TextStyleInsert) => void
  onAddPhrase: (phrase: (typeof TEXT_PHRASES)[number]) => void
  onAddCombination: (combo: FontCombination) => void
  onApplyFont?: (family: string) => void
  fonts?: FontOpt[]
  selectedText?: TextElement | null
}

const DEFAULT_STYLES: TextStyleInsert[] = [
  {
    name: 'Heading',
    content: 'Add a heading',
    fontSize: 56,
    fontWeight: 600,
    height: 88,
  },
  {
    name: 'Subheading',
    content: 'Add a subheading',
    fontSize: 28,
    fontWeight: 500,
    height: 48,
  },
  {
    name: 'Body text',
    content: 'Add a little bit of body text',
    fontSize: 20,
    fontWeight: 400,
    height: 40,
  },
]

const FONT_COMBINATIONS: FontCombination[] = [
  {
    key: 'ivory_classic',
    label: 'Ivory classic',
    bg: '#F7F1E8',
    lines: [
      {
        content: 'Together with their families',
        fontFamily: 'Cormorant Garamond',
        fontSize: 11,
        fontWeight: 400,
        italic: true,
        color: '#7A6A55',
      },
      {
        content: 'Amara & Jabari',
        fontFamily: 'Cormorant Garamond',
        fontSize: 22,
        fontWeight: 600,
        color: '#2C2416',
      },
    ],
  },
  {
    key: 'navy_gold',
    label: 'Navy gold',
    bg: '#0F1C2E',
    lines: [
      {
        content: 'YOU ARE INVITED',
        fontFamily: 'Montserrat',
        fontSize: 8,
        fontWeight: 600,
        letterSpacing: 2,
        uppercase: true,
        color: '#D4AF37',
      },
      {
        content: 'Amara &\nJabari',
        fontFamily: 'Cormorant Garamond',
        fontSize: 20,
        fontWeight: 500,
        color: '#F4EFE6',
      },
    ],
  },
  {
    key: 'script_soft',
    label: 'Soft script',
    bg: '#FDF4F6',
    lines: [
      {
        content: 'Celebrating',
        fontFamily: 'Great Vibes',
        fontSize: 16,
        fontWeight: 400,
        color: '#9A7580',
      },
      {
        content: 'Amara',
        fontFamily: 'Playfair Display',
        fontSize: 22,
        fontWeight: 600,
        color: '#4A2F38',
      },
    ],
  },
  {
    key: 'save_date',
    label: 'Save the date',
    bg: '#F5F2EC',
    lines: [
      {
        content: 'SAVE THE DATE',
        fontFamily: 'Montserrat',
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 1.5,
        uppercase: true,
        color: '#8B7355',
      },
      {
        content: '12 · 09 · 26',
        fontFamily: 'Cormorant Garamond',
        fontSize: 22,
        fontWeight: 500,
        color: '#1F1A14',
      },
    ],
  },
  {
    key: 'modern_clean',
    label: 'Modern clean',
    bg: '#FAFAFA',
    lines: [
      {
        content: 'THE WEDDING OF',
        fontFamily: 'Montserrat',
        fontSize: 8,
        fontWeight: 500,
        letterSpacing: 1.2,
        uppercase: true,
        color: '#888',
      },
      {
        content: 'Moses & Dayness',
        fontFamily: 'Playfair Display',
        fontSize: 16,
        fontWeight: 600,
        color: '#111',
      },
    ],
  },
  {
    key: 'lavender',
    label: 'Lavender',
    bg: '#F4EEF8',
    lines: [
      {
        content: 'With joy',
        fontFamily: 'Great Vibes',
        fontSize: 15,
        fontWeight: 400,
        color: '#9B7EBD',
      },
      {
        content: 'Join our celebration',
        fontFamily: 'Cormorant Garamond',
        fontSize: 14,
        fontWeight: 500,
        color: '#3D2E4A',
      },
    ],
  },
]

const LIBRARY_FONTS = [
  'Cormorant Garamond',
  'Playfair Display',
  'Great Vibes',
  'Montserrat',
  'Georgia',
]

function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-[12px] font-semibold text-gray-900">{children}</h3>
      {action}
    </div>
  )
}

export function StudioTextPanel({
  brandFont = 'Cormorant Garamond',
  onAddEmpty,
  onAddStyle,
  onAddPhrase,
  onAddCombination,
  onApplyFont,
  fonts = [],
  selectedText,
}: Props) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const brandFonts = useMemo(() => {
    const names = fonts
      .map((f) => f.familyName?.trim())
      .filter((n): n is string => Boolean(n))
    return Array.from(new Set(names))
  }, [fonts])

  const libraryFonts = useMemo(() => {
    const all = Array.from(new Set([brandFont, ...brandFonts, ...LIBRARY_FONTS].filter(Boolean)))
    if (!q) return all
    return all.filter((f) => f.toLowerCase().includes(q))
  }, [brandFont, brandFonts, q])

  const combos = useMemo(() => {
    if (!q) return FONT_COMBINATIONS
    return FONT_COMBINATIONS.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.lines.some(
          (l) =>
            l.content.toLowerCase().includes(q) ||
            l.fontFamily.toLowerCase().includes(q),
        ),
    )
  }, [q])

  const phrases = useMemo(() => {
    if (!q) return TEXT_PHRASES
    return TEXT_PHRASES.filter(
      (p) =>
        p.label.toLowerCase().includes(q) || p.content.toLowerCase().includes(q),
    )
  }, [q])

  const presets = useMemo(() => {
    if (!q) return TEXT_PRESETS
    return TEXT_PRESETS.filter(
      (p) =>
        p.label.toLowerCase().includes(q) || p.content.toLowerCase().includes(q),
    )
  }, [q])

  const defaultStyles = useMemo(() => {
    if (!q) return DEFAULT_STYLES
    return DEFAULT_STYLES.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || s.content.toLowerCase().includes(q),
    )
  }, [q])

  return (
    <div className="flex flex-col gap-5">
      {/* Search */}
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search fonts and combinations"
          className="h-10 w-full rounded-xl border border-gray-200 bg-[#F7F7F8] py-2 pl-9 pr-3 text-[13px] text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:ring-2 focus:ring-gray-900/5"
        />
      </label>

      {/* Primary actions */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={onAddEmpty}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gray-900 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-gray-800"
        >
          <Type className="h-4 w-4" />
          Add a text box
        </button>
        <button
          type="button"
          onClick={() => {
            const phrase = TEXT_PHRASES[0]
            if (phrase) onAddPhrase(phrase)
          }}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white text-[12px] font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-50"
          title="Insert a classic invitation line"
        >
          <Sparkles className="h-3.5 w-3.5 text-amber-600" />
          Add invitation line
        </button>
      </div>

      {/* Brand kit */}
      <div>
        <SectionTitle
          action={
            <span className="text-[10px] font-medium text-gray-400">
              {selectedText ? 'Tap to apply' : 'Select text first'}
            </span>
          }
        >
          Brand fonts
        </SectionTitle>
        {brandFonts.length > 0 ? (
          <div className="space-y-1.5">
            {brandFonts.map((family) => {
              const active = selectedText?.typography.fontFamily === family
              return (
                <button
                  key={family}
                  type="button"
                  onClick={() => onApplyFont?.(family)}
                  disabled={!selectedText}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    active
                      ? 'border-[#0B99FF]/40 bg-[#E8F4FF]'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                  style={{ fontFamily: family }}
                >
                  <span className="text-[14px] font-medium text-gray-900">{family}</span>
                  <span className="text-[10px] text-gray-400">Aa</span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-200 bg-[#FAFAFA] px-3 py-3">
            <p className="text-[12px] font-medium text-gray-800">Using project default</p>
            <p
              className="mt-1 text-[15px] text-gray-700"
              style={{ fontFamily: brandFont }}
            >
              {brandFont}
            </p>
            <p className="mt-1.5 text-[10px] text-gray-400">
              Upload brand fonts in Brand, or apply from the library below.
            </p>
          </div>
        )}
      </div>

      {/* Default text styles — Canva stacked previews */}
      {defaultStyles.length > 0 ? (
        <div>
          <SectionTitle>Default text styles</SectionTitle>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            {defaultStyles.map((style, i) => (
              <button
                key={style.name}
                type="button"
                onClick={() =>
                  onAddStyle({
                    ...style,
                    fontFamily: brandFont,
                    content:
                      style.name === 'Heading'
                        ? 'Moses & Dayness'
                        : style.name === 'Subheading'
                          ? 'Together with their families'
                          : 'Sala Sala · 08 August 2026',
                  })
                }
                className={`flex w-full items-center px-3.5 py-3.5 text-left transition-colors hover:bg-[#F7F7F8] ${
                  i > 0 ? 'border-t border-gray-100' : ''
                }`}
              >
                <span
                  className="w-full truncate text-gray-900"
                  style={{
                    fontFamily: `${brandFont}, Georgia, serif`,
                    fontSize:
                      style.name === 'Heading' ? 22 : style.name === 'Subheading' ? 15 : 12,
                    fontWeight: style.fontWeight,
                  }}
                >
                  {style.content}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Invitation style presets */}
      {presets.length > 0 ? (
        <div>
          <SectionTitle>Invitation styles</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {presets.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() =>
                  onAddStyle({
                    name: preset.label,
                    content: preset.content,
                    fontSize: preset.fontSize,
                    fontWeight: preset.fontWeight,
                    height: preset.height,
                    fontFamily: brandFont,
                  })
                }
                className="flex min-h-24 flex-col justify-between rounded-xl border border-gray-200 bg-[#F7F7F8] px-2.5 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:bg-white hover:shadow-sm"
              >
                <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">
                  {preset.label}
                </span>
                <span
                  className="mt-1 line-clamp-3 leading-tight text-gray-900"
                  style={{
                    fontFamily: `${brandFont}, Georgia, serif`,
                    fontSize: Math.min(18, Math.max(11, preset.fontSize * 0.26)),
                    fontWeight: preset.fontWeight,
                  }}
                >
                  {preset.content}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Font combinations */}
      {combos.length > 0 ? (
        <div>
          <SectionTitle>Font combinations</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {combos.map((combo) => (
              <button
                key={combo.key}
                type="button"
                title={`Add “${combo.label}” combination`}
                onClick={() => onAddCombination(combo)}
                className="group relative overflow-hidden rounded-xl border border-black/5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                style={{ background: combo.bg }}
              >
                <div className="flex aspect-4/3 flex-col items-center justify-center gap-1 px-2 py-3 text-center">
                  {combo.lines.map((line, i) => (
                    <span
                      key={i}
                      className="whitespace-pre-line leading-tight"
                      style={{
                        fontFamily: line.fontFamily,
                        fontSize: line.fontSize,
                        fontWeight: line.fontWeight,
                        fontStyle: line.italic ? 'italic' : 'normal',
                        color: line.color,
                        letterSpacing: line.letterSpacing,
                        textTransform: line.uppercase ? 'uppercase' : undefined,
                      }}
                    >
                      {line.content}
                    </span>
                  ))}
                </div>
                <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/40 to-transparent px-2 pb-1.5 pt-5 text-[9px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {combo.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Font library */}
      {libraryFonts.length > 0 ? (
        <div>
          <SectionTitle
            action={
              selectedText ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-400">
                  <Pencil className="h-3 w-3" />
                  Apply
                </span>
              ) : null
            }
          >
            Font library
          </SectionTitle>
          <div className="space-y-1">
            {libraryFonts.map((family) => {
              const active = selectedText?.typography.fontFamily === family
              return (
                <button
                  key={family}
                  type="button"
                  onClick={() => onApplyFont?.(family)}
                  disabled={!selectedText && !onApplyFont}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors ${
                    active
                      ? 'bg-[#E8F4FF] text-gray-900'
                      : 'text-gray-800 hover:bg-gray-50'
                  } ${!selectedText ? 'opacity-60' : ''}`}
                  style={{ fontFamily: family }}
                  title={
                    selectedText
                      ? `Apply ${family}`
                      : 'Select a text layer to apply a font'
                  }
                >
                  <span className="truncate text-[13px]">{family}</span>
                  <span className="text-[12px] text-gray-400">Ag</span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {/* Phrases */}
      {phrases.length > 0 ? (
        <div>
          <SectionTitle>Invitation phrases</SectionTitle>
          <div className="space-y-1">
            {phrases.map((phrase) => (
              <button
                key={phrase.key}
                type="button"
                onClick={() => onAddPhrase(phrase)}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-transparent bg-[#F7F7F8] px-3 py-2.5 text-left hover:border-gray-200 hover:bg-white"
              >
                <span
                  className="min-w-0 truncate text-[12px] text-gray-800"
                  style={{ fontFamily: `${brandFont}, Georgia, serif` }}
                >
                  {phrase.content}
                </span>
                <span className="shrink-0 text-[10px] font-semibold text-gray-400">Add</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-snug text-gray-400">
            Guest names and event fields live in Data — Text is for look & copy.
          </p>
        </div>
      ) : null}

      {q &&
      defaultStyles.length === 0 &&
      presets.length === 0 &&
      combos.length === 0 &&
      phrases.length === 0 &&
      libraryFonts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-[#FAFAFA] px-4 py-8 text-center">
          <p className="text-[13px] font-medium text-gray-700">No matches</p>
          <button
            type="button"
            className="mt-2 text-[11px] font-semibold text-gray-800 underline-offset-2 hover:underline"
            onClick={() => setQuery('')}
          >
            Clear search
          </button>
        </div>
      ) : null}
    </div>
  )
}
