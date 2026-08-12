'use client'

import { useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">{children}</p>
}

export function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <SectionLabel>{title}</SectionLabel>
      <div className="mt-3 space-y-4">{children}</div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[12.5px] font-medium text-gray-600">{label}</label>
      {children}
    </div>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-black/12 bg-white px-3 py-2.5 text-[14px] outline-none transition-colors focus:border-[#C9A0DC] focus:ring-2 focus:ring-[#C9A0DC]/30"
    />
  )
}

export function TextArea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <textarea
      value={value}
      rows={4}
      onChange={(e) => onChange(e.target.value)}
      className="w-full resize-none rounded-lg border border-black/12 bg-white px-3 py-2.5 text-[14px] leading-relaxed outline-none transition-colors focus:border-[#C9A0DC] focus:ring-2 focus:ring-[#C9A0DC]/30"
    />
  )
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  suffix?: string
}) {
  return (
    <div className="flex items-center rounded-lg border border-black/12 bg-white px-3 py-2.5 focus-within:border-[#C9A0DC] focus-within:ring-2 focus-within:ring-[#C9A0DC]/30">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (!Number.isNaN(n)) onChange(Math.max(min, Math.min(max, n)))
        }}
        className="w-full bg-transparent text-[14px] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      {suffix && <span className="ml-1 text-[12px] text-gray-400">{suffix}</span>}
    </div>
  )
}

export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max,
  suffix = 'px',
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max: number
  suffix?: string
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12.5px] font-medium text-gray-600">{label}</span>
        <span className="text-[12.5px] font-semibold tabular-nums text-gray-800">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#C9A0DC] [&::-webkit-slider-thumb]:shadow"
        style={{
          background: `linear-gradient(to right, #C9A0DC ${pct}%, rgba(0,0,0,0.10) ${pct}%)`,
        }}
      />
    </div>
  )
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button data-opus-button="control"
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn('relative h-6 w-11 rounded-full transition-colors', on ? 'bg-[#C9A0DC]' : 'bg-black/15')}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
          on ? 'left-0.5 translate-x-5' : 'left-0.5',
        )}
      />
    </button>
  )
}

export function ColorRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-black/12 bg-white px-3 py-2">
      <label className="relative h-6 w-6 shrink-0 overflow-hidden rounded-md ring-1 ring-black/10">
        <span className="block h-full w-full" style={{ backgroundColor: value }} />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Color"
        />
      </label>
      <input
        value={value.toUpperCase()}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent text-[14px] uppercase outline-none"
      />
    </div>
  )
}

export function Dropdown({
  value,
  options,
  onChange,
  renderOption,
}: {
  value: string
  options: string[]
  onChange: (v: string) => void
  renderOption?: (v: string) => React.CSSProperties
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button data-opus-button="neutral" data-opus-button-size="medium"
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-black/12 bg-white px-3 py-2.5 text-[14px] transition-colors hover:border-black/25"
      >
        <span style={renderOption?.(value)}>{value}</span>
        <ChevronDown size={16} className={cn('text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul className="absolute z-30 mt-1.5 max-h-64 w-full overflow-auto rounded-lg border border-black/10 bg-white py-1 shadow-lg">
          {options.map((o) => (
            <li key={o}>
              <button data-opus-button="control"
                type="button"
                onClick={() => {
                  onChange(o)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between px-3 py-2 text-left text-[14px] hover:bg-[#F3EAFA]',
                  o === value && 'bg-[#FBF7FE]',
                )}
                style={renderOption?.(o)}
              >
                {o}
                {o === value && <Check size={14} className="text-[#7A3FB8]" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function SegmentedAlign<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { key: T; icon: React.ReactNode; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-black/12 bg-[#F7F6F2] p-1">
      {options.map((o) => (
        <button data-opus-button="control"
          key={o.key}
          type="button"
          aria-label={o.label}
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            'flex flex-1 items-center justify-center rounded-md py-2 transition-colors',
            value === o.key ? 'bg-[#C9A0DC] text-[#1A1A1A] shadow-sm' : 'text-gray-500 hover:bg-white hover:text-gray-800',
          )}
        >
          {o.icon}
        </button>
      ))}
    </div>
  )
}
