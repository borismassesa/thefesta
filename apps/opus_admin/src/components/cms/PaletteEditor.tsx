'use client'

import { Plus, X, GripVertical } from 'lucide-react'
import type { DigitalCardPalette } from '@/lib/cms/opus-pass-digital-cards-products'

const MAX_PALETTES = 5

const PALETTE_ROLES: { key: keyof Omit<DigitalCardPalette, 'name'>; label: string }[] = [
  { key: 'background',   label: 'Background' },
  { key: 'surface',      label: 'Surface' },
  { key: 'accent',       label: 'Accent' },
  { key: 'textPrimary',  label: 'Text primary' },
  { key: 'textSecondary',label: 'Text secondary' },
  { key: 'muted',        label: 'Muted' },
]

const emptyPalette = (): DigitalCardPalette => ({
  name: '',
  background: '#FBF7F2',
  surface: '#FFFFFF',
  accent: '#A6B89A',
  textPrimary: '#1A1A1A',
  textSecondary: '#5C6B4D',
  muted: '#7A8A6E',
})

const inputCls =
  'w-full px-2 py-1.5 bg-white border border-gray-200 rounded text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#C9A0DC] focus:border-transparent'

export function PaletteEditor({
  value: valueProp,
  onChange,
}: {
  value: DigitalCardPalette[] | undefined | null
  onChange: (v: DigitalCardPalette[]) => void
}) {
  const value = valueProp ?? []

  function updatePalette(i: number, patch: Partial<DigitalCardPalette>) {
    onChange(value.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  }

  function removePalette(i: number) {
    onChange(value.filter((_, idx) => idx !== i))
  }

  function addPalette() {
    if (value.length >= MAX_PALETTES) return
    onChange([...value, emptyPalette()])
  }

  return (
    <div className="space-y-3">
      {value.map((palette, i) => (
        <div
          key={i}
          className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2.5"
        >
          {/* Row header */}
          <div className="flex items-center gap-2">
            <GripVertical className="w-3.5 h-3.5 text-gray-300 shrink-0" aria-hidden="true" />
            <span
              className="h-5 w-5 rounded-full ring-1 ring-black/10 shrink-0"
              style={{ backgroundColor: /^#[0-9a-fA-F]{3,8}$/.test(palette.accent) ? palette.accent : '#ccc' }}
              aria-hidden="true"
            />
            <input
              value={palette.name ?? ''}
              onChange={(e) => updatePalette(i, { name: e.target.value })}
              className={`${inputCls} flex-1`}
              placeholder={`Palette ${i + 1} name (e.g. Sage Green)`}
              aria-label={`Palette ${i + 1} name`}
            />
            <button
              type="button"
              onClick={() => removePalette(i)}
              className="p-1 text-gray-400 hover:text-red-600 rounded shrink-0"
              aria-label={`Remove palette ${i + 1}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Colour role grid */}
          <div className="grid grid-cols-3 gap-2">
            {PALETTE_ROLES.map(({ key, label }) => {
              const raw = palette[key] as string
              const isValidHex = /^#[0-9a-fA-F]{6}$/.test(raw)
              return (
                <label key={key} className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold text-gray-500">{label}</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="color"
                      value={isValidHex ? raw : '#000000'}
                      onChange={(e) => updatePalette(i, { [key]: e.target.value })}
                      className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0 shrink-0"
                      aria-label={`${label} colour picker`}
                    />
                    <input
                      value={raw}
                      onChange={(e) => updatePalette(i, { [key]: e.target.value })}
                      className="w-full min-w-0 px-1.5 py-1 bg-white border border-gray-200 rounded text-[11px] tabular-nums text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#C9A0DC]"
                      aria-label={`${label} hex value`}
                    />
                  </div>
                </label>
              )
            })}
          </div>
        </div>
      ))}

      {value.length < MAX_PALETTES && (
        <button
          type="button"
          onClick={addPalette}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#7E5896] hover:text-[#5d3a78] px-2.5 py-1.5 rounded-lg border border-[#C9A0DC] hover:bg-[#F0DFF6] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add palette
        </button>
      )}
    </div>
  )
}
