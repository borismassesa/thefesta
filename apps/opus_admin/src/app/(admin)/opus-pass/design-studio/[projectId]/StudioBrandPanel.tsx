'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'

import type { TextElement } from '@opusfesta/design-engine'

import { ColorPickerPopover } from './ColorPickerPopover'

type Swatch = { id: string; name: string; hex: string; role?: string | null }
type Font = {
  id: string
  familyName: string | null
  subfamilyName?: string | null
  licenceStatus: string
}

type Props = {
  swatches: Swatch[]
  fonts: Font[]
  selected: {
    type: string
    typography?: TextElement['typography']
    fill?: string | null
  } | null
  canWrite: boolean
  onApplyColor: (hex: string) => void
  onApplyFont: (family: string, fontAssetId: string | null) => void
  onAddSwatch: (hex: string, name?: string) => void
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
      {children}
    </div>
  )
}

export function StudioBrandPanel({
  swatches,
  fonts,
  selected,
  canWrite,
  onApplyColor,
  onApplyFont,
  onAddSwatch,
}: Props) {
  const [addOpen, setAddOpen] = useState(false)
  const [draftHex, setDraftHex] = useState('#8b5e3c')

  const activeFill =
    selected?.type === 'text'
      ? selected.typography?.color
      : selected && 'fill' in selected
        ? selected.fill
        : null
  const activeFont =
    selected?.type === 'text' ? selected.typography?.fontFamily : null

  const canApply =
    selected &&
    (selected.type === 'text' ||
      selected.type === 'shape' ||
      selected.type === 'icon' ||
      selected.type === 'artboard_background' ||
      selected.type === 'svg_graphic' ||
      selected.type === 'group')

  return (
    <div className="space-y-5">
      <div className="relative">
        <SectionLabel>Colours</SectionLabel>
        <div className="grid grid-cols-4 gap-2">
          {swatches.map((s) => {
            const active = activeFill?.toLowerCase() === s.hex.toLowerCase()
            return (
              <button
                key={s.id}
                type="button"
                title={
                  canApply
                    ? `Apply ${s.name} · ${s.hex}`
                    : `Select a layer first · ${s.name}`
                }
                disabled={!canApply}
                onClick={() => onApplyColor(s.hex)}
                className={`group flex flex-col items-center gap-1.5 rounded-xl border p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  active
                    ? 'border-[#0B99FF] bg-[#E8F4FF]'
                    : 'border-gray-200 bg-[#F5F5F5] hover:border-gray-300'
                }`}
              >
                <span
                  className="h-10 w-full rounded-lg border border-black/5 shadow-sm"
                  style={{ background: s.hex }}
                />
                <span className="w-full truncate text-center text-[9px] font-medium text-gray-600">
                  {s.name}
                </span>
              </button>
            )
          })}
          {canWrite ? (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-gray-300 bg-white p-2 text-gray-500 hover:border-gray-400 hover:text-gray-800"
            >
              <Plus className="h-4 w-4" />
              <span className="text-[9px] font-medium">Add</span>
            </button>
          ) : null}
        </div>
        {addOpen ? (
          <ColorPickerPopover
            open
            hex={draftHex}
            opacity={1}
            swatches={swatches}
            onClose={() => setAddOpen(false)}
            onChange={(hex) => setDraftHex(hex)}
          />
        ) : null}
        {addOpen ? (
          <div className="mt-2 flex items-center gap-2">
            <span
              className="h-7 w-7 rounded-md border border-black/10"
              style={{ background: draftHex }}
            />
            <button
              type="button"
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-gray-800"
              onClick={() => {
                onAddSwatch(draftHex, 'Custom')
                setAddOpen(false)
              }}
            >
              Save swatch
            </button>
            <button
              type="button"
              className="rounded-lg px-2 py-1.5 text-[11px] text-gray-500 hover:bg-gray-100"
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </button>
          </div>
        ) : null}
        <p className="mt-2 text-[10px] leading-snug text-gray-400">
          Select a layer or group, then click a colour. Works on text, shapes, and imported SVG
          paths.
        </p>
      </div>

      <div>
        <SectionLabel>Fonts</SectionLabel>
        <div className="space-y-1.5">
          {(fonts.length
            ? fonts
            : [
                {
                  id: 'sys',
                  familyName: 'Cormorant Garamond',
                  subfamilyName: 'Regular',
                  licenceStatus: 'allowed',
                },
                {
                  id: 'sys2',
                  familyName: 'Playfair Display',
                  subfamilyName: 'Regular',
                  licenceStatus: 'allowed',
                },
              ]
          ).map((f) => {
            if (!f.familyName) return null
            const active = activeFont === f.familyName
            const forbidden = f.licenceStatus === 'forbidden'
            return (
              <button
                key={f.id}
                type="button"
                disabled={forbidden}
                onClick={() =>
                  onApplyFont(f.familyName!, f.id === 'sys' || f.id === 'sys2' ? null : f.id)
                }
                className={`w-full rounded-xl border px-3 py-2.5 text-left disabled:opacity-40 ${
                  active
                    ? 'border-[#0B99FF]/40 bg-[#E8F4FF]'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <div
                  className="text-[16px] leading-tight text-gray-900"
                  style={{ fontFamily: f.familyName }}
                >
                  Aa — {f.familyName}
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-gray-400">
                  <span>{f.subfamilyName || 'Regular'}</span>
                  <span className="capitalize">{f.licenceStatus}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
