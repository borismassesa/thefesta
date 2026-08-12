'use client'

import { useState } from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  CaseSensitive,
  Copy,
  Italic,
  Link2,
  Lock,
  Trash2,
  Underline,
  Unlink,
  Unlock,
} from 'lucide-react'

import type { TextAlign, TextElement } from '@opusfesta/design-engine'

import { ColorPickerPopover } from './ColorPickerPopover'

const FALLBACK_FONTS = [
  'Cormorant Garamond',
  'Playfair Display',
  'Great Vibes',
  'Montserrat',
  'Georgia',
]

type FontOpt = { id: string; familyName: string | null }

type Props = {
  element: TextElement
  fonts?: FontOpt[]
  swatches?: Array<{ id: string; name: string; hex: string }>
  /** Live preview string shown on the canvas (sample / guest data). */
  previewText?: string
  onChange: (patch: Partial<TextElement> & Record<string, unknown>) => void
  onDuplicate: () => void
  onDelete: () => void
  onUnbind?: () => void
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-gray-200" aria-hidden />
}

function ToolBtn({
  title,
  active,
  danger,
  onClick,
  children,
}: {
  title: string
  active?: boolean
  danger?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
        active
          ? 'bg-gray-900 text-white'
          : danger
            ? 'text-gray-500 hover:bg-red-50 hover:text-red-600'
            : 'text-gray-700 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  )
}

function shortFont(name: string) {
  if (name.length <= 14) return name
  return `${name.slice(0, 12)}…`
}

/** Canva-like floating format strip for a selected text layer. */
export function StudioTextFormatBar({
  element,
  fonts = [],
  swatches,
  previewText,
  onChange,
  onDuplicate,
  onDelete,
  onUnbind,
}: Props) {
  const [colorOpen, setColorOpen] = useState(false)
  const ty = element.typography
  const brandFonts = fonts
    .map((f) => f.familyName)
    .filter((n): n is string => Boolean(n))
  const fontOptions = Array.from(new Set([...brandFonts, ...FALLBACK_FONTS, ty.fontFamily]))
  const bound =
    element.binding?.type === 'variable'
      ? element.binding.role ||
        element.binding.path?.split('.').pop() ||
        element.binding.path
      : null
  const preview =
    previewText && previewText !== element.content && !previewText.startsWith('{{')
      ? previewText
      : null

  const setTy = (patch: Partial<TextElement['typography']>) => {
    onChange({ typography: { ...ty, ...patch } })
  }

  const cycleAlign = () => {
    const order: TextAlign[] = ['left', 'center', 'right']
    const i = order.indexOf(ty.textAlign)
    setTy({ textAlign: order[(i + 1) % order.length] })
  }

  const AlignIcon =
    ty.textAlign === 'left' ? AlignLeft : ty.textAlign === 'right' ? AlignRight : AlignCenter

  return (
    <div
      data-studio-chrome="format-bar"
      className="flex flex-col items-center gap-1.5"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {bound ? (
        <div
          className="pointer-events-auto flex max-w-[min(360px,70vw)] items-center gap-1.5 rounded-full border border-[#B8D9F5] bg-[#F3F9FF] px-2.5 py-1 shadow-sm"
          title="Bound field — canvas shows the live sample, not the token"
        >
          <Link2 className="h-3 w-3 shrink-0 text-[#0B6FBD]" />
          <span className="truncate font-mono text-[10px] font-semibold text-[#0B6FBD]">
            {bound}
          </span>
          {preview ? (
            <>
              <span className="text-[10px] text-[#7AA8CC]">·</span>
              <span className="truncate text-[10px] font-medium text-gray-700">{preview}</span>
            </>
          ) : null}
          {onUnbind ? (
            <button
              type="button"
              title="Unbind field"
              onClick={onUnbind}
              className="ml-0.5 rounded-full p-0.5 text-[#7AA8CC] hover:bg-white hover:text-gray-700"
            >
              <Unlink className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-gray-200/90 bg-white/95 px-1.5 py-1 shadow-[0_8px_28px_rgba(15,23,42,0.14)] backdrop-blur-sm">
        <label className="relative flex h-7 max-w-32 items-center">
          <span
            className="pointer-events-none truncate px-2 text-[12px] font-medium text-gray-800"
            style={{ fontFamily: ty.fontFamily }}
          >
            {shortFont(ty.fontFamily)}
          </span>
          <select
            value={ty.fontFamily}
            title="Font"
            onChange={(e) => setTy({ fontFamily: e.target.value })}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {fontOptions.map((f) => (
              <option key={f} value={f} style={{ fontFamily: f }}>
                {f}
              </option>
            ))}
          </select>
        </label>

        <Divider />

        <div className="flex items-center">
          <ToolBtn
            title="Decrease size"
            onClick={() => setTy({ fontSize: Math.max(8, Math.round(ty.fontSize) - 2) })}
          >
            <span className="text-[13px] font-semibold leading-none">−</span>
          </ToolBtn>
          <input
            type="number"
            title="Font size"
            value={Math.round(ty.fontSize)}
            min={8}
            max={400}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (!Number.isFinite(n)) return
              setTy({ fontSize: Math.min(400, Math.max(8, n)) })
            }}
            className="h-7 w-9 rounded-md bg-transparent text-center text-[12px] font-semibold tabular-nums text-gray-800 outline-none hover:bg-gray-50"
          />
          <ToolBtn
            title="Increase size"
            onClick={() => setTy({ fontSize: Math.min(400, Math.round(ty.fontSize) + 2) })}
          >
            <span className="text-[13px] font-semibold leading-none">+</span>
          </ToolBtn>
        </div>

        <Divider />

        <div className="relative">
          <button
            type="button"
            title="Colour"
            onClick={(e) => {
              e.stopPropagation()
              setColorOpen((o) => !o)
            }}
            className={`flex h-7 w-7 items-center justify-center rounded-md ${
              colorOpen ? 'bg-gray-900 text-white' : 'hover:bg-gray-100'
            }`}
          >
            <span className="flex flex-col items-center gap-0.5">
              <span
                className={`text-[11px] font-bold leading-none ${
                  colorOpen ? 'text-white' : 'text-gray-800'
                }`}
              >
                A
              </span>
              <span
                className="h-1 w-3.5 rounded-sm"
                style={{ background: ty.color }}
              />
            </span>
          </button>
          {colorOpen ? (
            <ColorPickerPopover
              open
              hex={ty.color}
              opacity={ty.opacity}
              swatches={swatches}
              onClose={() => setColorOpen(false)}
              onChange={(hex, opacity) => setTy({ color: hex, opacity })}
            />
          ) : null}
        </div>

        <Divider />

        <ToolBtn
          title="Bold"
          active={ty.fontWeight >= 600}
          onClick={() => setTy({ fontWeight: ty.fontWeight >= 600 ? 400 : 700 })}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn title="Italic" active={ty.italic} onClick={() => setTy({ italic: !ty.italic })}>
          <Italic className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          title="Underline"
          active={ty.underline}
          onClick={() => setTy({ underline: !ty.underline })}
        >
          <Underline className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          title="Uppercase"
          active={ty.uppercase}
          onClick={() => setTy({ uppercase: !ty.uppercase })}
        >
          <CaseSensitive className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn title={`Align ${ty.textAlign}`} onClick={cycleAlign}>
          <AlignIcon className="h-3.5 w-3.5" />
        </ToolBtn>

        <Divider />

        <ToolBtn
          title={element.locked ? 'Unlock' : 'Lock'}
          active={element.locked}
          onClick={() => onChange({ locked: !element.locked })}
        >
          {element.locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
        </ToolBtn>
        <ToolBtn title="Duplicate" onClick={onDuplicate}>
          <Copy className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn title="Delete" danger onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </ToolBtn>
      </div>
    </div>
  )
}
