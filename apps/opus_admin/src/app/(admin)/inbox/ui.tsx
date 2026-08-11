'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PRIORITY_LABEL, STATUS_LABEL, slaTargetLabel, type SlaView } from './lib'
import type { CasePriority, CaseStatus } from './types'

// Colour on this page means one thing: exceptions. Red is breached or
// critical, amber is at risk or high, green is done, everything else is
// neutral. Category and channel are identified by label and a small dot, never
// by a full-colour badge, so a busy row still reads at a glance.

const NEUTRAL = { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' }
const RED = { bg: 'bg-[#FCDDDD]', text: 'text-[#921E1E]', dot: 'bg-[#E15656]' }
const AMBER = { bg: 'bg-[#FEF3DB]', text: 'text-[#8A5A09]', dot: 'bg-[#F5A623]' }
const GREEN = { bg: 'bg-[#EDFBDD]', text: 'text-[#356B14]', dot: 'bg-[#9FE870]' }
const PLUM = { bg: 'bg-[#F0DFF6]', text: 'text-[#7E5896]', dot: 'bg-[#C9A0DC]' }

const STATUS_TONE: Record<CaseStatus, typeof NEUTRAL> = {
  new: PLUM,
  open: PLUM,
  in_progress: PLUM,
  waiting_on_customer: NEUTRAL,
  waiting_internal: NEUTRAL,
  snoozed: NEUTRAL,
  resolved: GREEN,
  closed: NEUTRAL,
  spam: NEUTRAL,
}

export function StatusPill({ status, className }: { status: CaseStatus; className?: string }) {
  const tone = STATUS_TONE[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap',
        tone.bg,
        tone.text,
        className,
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', tone.dot)} />
      {STATUS_LABEL[status]}
    </span>
  )
}

// Normal and low priority render nothing. A priority flag on this page means
// "this one is different", so showing it on every row would say nothing.
export function PriorityFlag({ priority }: { priority: CasePriority }) {
  if (priority === 'normal' || priority === 'low') return null
  const tone = priority === 'high' ? AMBER : RED
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap',
        tone.text,
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', tone.dot)} />
      {PRIORITY_LABEL[priority]}
    </span>
  )
}

export function SlaBadge({ sla, withTarget }: { sla: SlaView; withTarget?: boolean }) {
  const tone =
    sla.state === 'breached'
      ? RED
      : sla.state === 'at_risk'
        ? AMBER
        : sla.state === 'done'
          ? GREEN
          : NEUTRAL

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[10.5px] font-semibold whitespace-nowrap',
        tone.text,
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', tone.dot)} />
      {withTarget && sla.target !== 'none' && (
        <span className="font-bold uppercase tracking-wide">{slaTargetLabel(sla)}:</span>
      )}
      {sla.label}
    </span>
  )
}

export function MetaChip({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-50 text-gray-600 border border-gray-100 whitespace-nowrap"
    >
      {children}
    </span>
  )
}

export function Dot({ color }: { color: string }) {
  return <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
}

/* -------------------------------------------------------------- menus ---- */

export type MenuOption = {
  key: string
  label: string
  detail?: string
  danger?: boolean
  disabled?: boolean
}

// Labelled dropdown for the case actions. Every destructive-ish or
// state-changing control on this page carries its name, because an icon-only
// row does not tell an operator what the workflow is.
export function MenuButton({
  label,
  icon,
  options,
  onSelect,
  align = 'left',
  tone = 'default',
  disabled,
}: {
  label: string
  icon?: ReactNode
  options: MenuOption[]
  onSelect: (key: string) => void
  align?: 'left' | 'right'
  tone?: 'default' | 'primary'
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button data-opus-button="control"
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 rounded-lg border transition-colors',
          disabled && 'opacity-40 cursor-not-allowed',
          tone === 'primary'
            ? 'bg-[#C9A0DC] border-[#C9A0DC] text-white hover:bg-[#b97fd0]'
            : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-gray-900',
        )}
      >
        {icon}
        {label}
        <ChevronDown className="w-3.5 h-3.5 opacity-60" />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-30 mt-1.5 min-w-[220px] rounded-xl border border-gray-100 bg-white shadow-[0_12px_32px_-12px_rgba(0,0,0,0.25)] py-1.5',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {options.map((opt) => (
            <button data-opus-button="control"
              key={opt.key}
              type="button"
              role="menuitem"
              disabled={opt.disabled}
              onClick={() => {
                setOpen(false)
                onSelect(opt.key)
              }}
              className={cn(
                'w-full text-left px-3.5 py-2 transition-colors',
                opt.disabled
                  ? 'opacity-40 cursor-not-allowed'
                  : opt.danger
                    ? 'hover:bg-[#FCDDDD]'
                    : 'hover:bg-gray-50',
              )}
            >
              <span
                className={cn(
                  'block text-[13px] font-semibold',
                  opt.danger ? 'text-[#921E1E]' : 'text-gray-800',
                )}
              >
                {opt.label}
              </span>
              {opt.detail && (
                <span className="block text-[11px] text-gray-400 mt-0.5">{opt.detail}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ActionButton({
  label,
  icon,
  onClick,
  tone = 'default',
}: {
  label: string
  icon?: ReactNode
  onClick?: () => void
  tone?: 'default' | 'primary' | 'positive'
}) {
  return (
    <button data-opus-button="neutral" data-opus-button-size="small"
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 rounded-lg border transition-colors',
        tone === 'primary' && 'bg-[#C9A0DC] border-[#C9A0DC] text-white hover:bg-[#b97fd0]',
        tone === 'positive' &&
          'bg-[#EDFBDD] border-[#CDEFA8] text-[#356B14] hover:bg-[#E2F7CB]',
        tone === 'default' &&
          'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-gray-900',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
