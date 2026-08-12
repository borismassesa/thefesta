'use client'

import { useEffect, useMemo, useState } from 'react'
import { Pipette, X } from 'lucide-react'

import { DEFAULT_SWATCHES } from '@opusfesta/design-engine'

import {
  StudioPopover,
  StudioPopoverBody,
  StudioPopoverItem,
  StudioPopoverSection,
} from './StudioPopover'

type Props = {
  open: boolean
  hex: string
  opacity: number
  swatches?: Array<{ id: string; name: string; hex: string }>
  onClose: () => void
  onChange: (hex: string, opacity: number) => void
  anchorLabel?: string
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const n = hex.replace('#', '')
  const full =
    n.length === 3
      ? n
          .split('')
          .map((c) => c + c)
          .join('')
      : n.padEnd(6, '0').slice(0, 6)
  const r = parseInt(full.slice(0, 2), 16) / 255
  const g = parseInt(full.slice(2, 4), 16) / 255
  const b = parseInt(full.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : d / max
  return { h, s, v: max }
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const to = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

function normalizeCompare(a: string, b: string) {
  return a.replace('#', '').toUpperCase() === b.replace('#', '').toUpperCase()
}

export function ColorPickerPopover({
  open,
  hex,
  opacity,
  swatches = DEFAULT_SWATCHES,
  onClose,
  onChange,
}: Props) {
  const hsv0 = useMemo(() => hexToHsv(hex || '#FFFFFF'), [hex])
  const [h, setH] = useState(hsv0.h)
  const [s, setS] = useState(hsv0.s)
  const [v, setV] = useState(hsv0.v)
  const [hexInput, setHexInput] = useState((hex || '#FFFFFF').replace('#', '').toUpperCase())
  const [tab, setTab] = useState<'custom' | 'libraries'>('custom')

  useEffect(() => {
    const next = hexToHsv(hex || '#FFFFFF')
    setH(next.h)
    setS(next.s)
    setV(next.v)
    setHexInput((hex || '#FFFFFF').replace('#', '').toUpperCase())
  }, [hex, open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const currentHex = hsvToHex(h, s, v)
  const hueColor = hsvToHex(h, 1, 1)

  const commitHsv = (nh: number, ns: number, nv: number) => {
    setH(nh)
    setS(ns)
    setV(nv)
    const next = hsvToHex(nh, ns, nv)
    setHexInput(next.replace('#', '').toUpperCase())
    onChange(next, opacity)
  }

  return (
    <StudioPopover widthClass="w-70" align="center" side="bottom" onClose={onClose}>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 bg-[#FAFAFA] px-4 py-3">
        <div className="flex gap-1 rounded-xl bg-gray-100/80 p-1">
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
              tab === 'custom' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
            }`}
            onClick={() => setTab('custom')}
          >
            Custom
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
              tab === 'libraries'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
            onClick={() => setTab('libraries')}
          >
            Libraries
          </button>
        </div>
        <button
          type="button"
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white hover:text-gray-700"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {tab === 'libraries' ? (
        <StudioPopoverBody>
          <StudioPopoverSection label="Brand / Accents">
            {swatches.map((sw) => (
              <StudioPopoverItem
                key={sw.id}
                label={sw.name}
                meta={sw.hex.replace('#', '').toUpperCase()}
                active={normalizeCompare(sw.hex, currentHex)}
                leading={
                  <span
                    className="block h-5 w-5 rounded-md border border-black/10 shadow-sm"
                    style={{ background: sw.hex }}
                  />
                }
                onClick={() => {
                  onChange(sw.hex, opacity)
                  onClose()
                }}
              />
            ))}
          </StudioPopoverSection>
        </StudioPopoverBody>
      ) : (
        <div className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div
            className="relative h-40 w-full cursor-crosshair overflow-hidden rounded-xl ring-1 ring-black/5"
            style={{
              background: `
                linear-gradient(to top, #000, transparent),
                linear-gradient(to right, #fff, ${hueColor})
              `,
            }}
            onPointerDown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const move = (ev: PointerEvent) => {
                const ns = clamp((ev.clientX - rect.left) / rect.width, 0, 1)
                const nv = clamp(1 - (ev.clientY - rect.top) / rect.height, 0, 1)
                commitHsv(h, ns, nv)
              }
              move(e.nativeEvent)
              const up = () => {
                window.removeEventListener('pointermove', move)
                window.removeEventListener('pointerup', up)
              }
              window.addEventListener('pointermove', move)
              window.addEventListener('pointerup', up)
            }}
          >
            <span
              className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md"
              style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              title="Sample from screen"
              className="rounded-xl border border-gray-200 bg-white p-2.5 text-gray-600 shadow-sm hover:bg-gray-50"
              onClick={async () => {
                const EyeDropperCtor = (
                  window as unknown as {
                    EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> }
                  }
                ).EyeDropper
                if (!EyeDropperCtor) return
                try {
                  const result = await new EyeDropperCtor().open()
                  onChange(result.sRGBHex, opacity)
                } catch {
                  /* cancelled */
                }
              }}
            >
              <Pipette className="h-4 w-4" />
            </button>
            <div className="flex-1 space-y-2.5">
              <input
                type="range"
                min={0}
                max={360}
                value={h}
                onChange={(e) => commitHsv(Number(e.target.value), s, v)}
                className="h-2.5 w-full cursor-pointer appearance-none rounded-full"
                style={{
                  background:
                    'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
                }}
              />
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(opacity * 100)}
                onChange={(e) => onChange(currentHex, clamp(Number(e.target.value), 0, 100) / 100)}
                className="h-2.5 w-full cursor-pointer appearance-none rounded-full bg-[linear-gradient(to_right,#0000,#000),linear-gradient(45deg,#ccc_25%,transparent_25%,transparent_75%,#ccc_75%),linear-gradient(45deg,#ccc_25%,transparent_25%,transparent_75%,#ccc_75%)] bg-size-[100%_100%,8px_8px,8px_8px] bg-position-[0_0,0_0,4px_4px]"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-gray-100 px-2.5 py-2 text-[11px] font-medium text-gray-500">
              Hex
            </span>
            <input
              value={hexInput}
              onChange={(e) => {
                const raw = e.target.value.replace('#', '').toUpperCase()
                setHexInput(raw)
                if (raw.length === 6) onChange(`#${raw}`, opacity)
              }}
              className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 font-mono text-[13px] uppercase outline-none focus:border-[#0B99FF]"
            />
            <input
              type="number"
              value={Math.round(opacity * 100)}
              onChange={(e) => onChange(currentHex, clamp(Number(e.target.value), 0, 100) / 100)}
              className="w-16 rounded-xl border border-gray-200 bg-white px-2 py-2 text-[13px] outline-none focus:border-[#0B99FF]"
            />
            <span className="text-[11px] text-gray-400">%</span>
          </div>
        </div>
      )}
    </StudioPopover>
  )
}
