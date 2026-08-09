// Shared presentation for the Recruitment module.
//
// This is a deliberate port of the Approvals module's ui.tsx so the two read as
// one product: same card shell and shadow, same uppercase column headers, same
// status tones, same dashed empty state, same stat tiles. Approvals owns the
// canonical values — when it changes, change them here too.
//
// Server-safe on purpose (no 'use client'): every Recruitment list page is a
// server component, and none of these primitives need state.

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/** The Approvals card shell: soft border, white, very low-contrast lift. */
export const PANEL =
  'overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]'

/** Column-header strip that sits directly under a panel's top edge. */
export const TABLE_HEADER =
  'border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500'

/** A clickable list row inside a panel. */
export const ROW =
  'w-full border-b border-gray-100 px-5 py-3 text-left transition-colors last:border-b-0 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7E5896]'

// Recruitment statuses are free-form strings drawn from a dozen tables
// (requisition, application, interview, offer, agency…), so a per-value map
// would be wrong the moment a table gains a state. These match on lifecycle
// meaning instead, and land on the four Approvals tones.
const TONE = {
  neutral: 'bg-gray-100 text-gray-700',
  waiting: 'bg-amber-50 text-amber-700',
  good: 'bg-emerald-50 text-emerald-700',
  bad: 'bg-rose-50 text-rose-700',
} as const

// Matched as substrings, not whole values, because real statuses are phrases:
// 'pending_department_approval', 'changes_requested', 'offer_accepted'. Order
// is load-bearing — terminal outcomes win over the words around them, so
// 'interview_completed' reads as good while 'interviewing' reads as waiting.
// Note 'approved' deliberately does not match 'approval', which keeps
// 'pending department approval' in the waiting tone where it belongs.
const BAD = ['reject', 'refus', 'declin', 'cancel', 'expire', 'withdraw', 'fail', 'archiv', 'closed', 'inactive', 'laps', 'disqualif', 'duplicate']
const GOOD = ['approved', 'hired', 'accepted', 'signed', 'passed', 'completed', 'filled', 'placed', 'published', 'live', 'active', 'open']
const WAITING = ['pending', 'submitted', 'review', 'scheduled', 'sent', 'await', 'hold', 'shortlist', 'interview', 'progress', 'requested']

export function statusTone(status: string): string {
  const key = status.trim().toLowerCase()
  if (BAD.some((w) => key.includes(w))) return TONE.bad
  if (GOOD.some((w) => key.includes(w))) return TONE.good
  if (WAITING.some((w) => key.includes(w))) return TONE.waiting
  return TONE.neutral
}

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        // nowrap + truncate: recruitment statuses run long, and a pill that
        // wraps to two lines breaks the row rhythm the Approvals list sets.
        'inline-flex w-fit max-w-full items-center truncate whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize',
        statusTone(status),
      )}
      title={status.replaceAll('_', ' ')}
    >
      {status.replaceAll('_', ' ')}
    </span>
  )
}

/** Neutral metadata chip — the recruitment equivalent of a CategoryChip. */
export function Chip({ label }: { label: string }) {
  return (
    <span className="inline-flex w-fit items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-gray-700">
      {label.replaceAll('_', ' ')}
    </span>
  )
}

export function OwnerCell({ name, initials }: { name: string; initials: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F0DFF6] text-[10px] font-bold text-[#5B2D8E]">
        {initials}
      </span>
      <span className="truncate text-sm text-gray-700">{name}</span>
    </div>
  )
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  )
}

export function Panel({
  title,
  action,
  children,
}: {
  title: string
  action?: { label: string; href: string }
  children: React.ReactNode
}) {
  return (
    <section className={PANEL}>
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">{title}</h2>
        {action && (
          <Link
            href={action.href}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[#5B2D8E] hover:bg-[#F8EDFF]"
          >
            {action.label}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

/**
 * The Approvals stat tile: tinted gradient, accent-coloured label, and an arrow
 * that says the number is a filter you can open. Recruitment navigates by URL
 * rather than tab state, so this is a Link where Approvals uses a button.
 */
export function StatTile({
  label,
  value,
  hint,
  accent,
  tint,
  href,
  emphasis,
}: {
  label: string
  value: number | string
  hint?: string
  accent: string
  tint: string
  href: string
  emphasis?: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group rounded-2xl border px-4 py-3 text-left transition hover:shadow-[0_6px_20px_-8px_rgba(0,0,0,0.15)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7E5896]',
        emphasis ? 'border-transparent' : 'border-gray-100',
      )}
      style={{
        background: `linear-gradient(150deg, ${tint} 0%, #FFFFFF 70%)`,
        ...(emphasis ? { boxShadow: `inset 0 0 0 2px ${accent}33` } : {}),
      }}
    >
      <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: accent }}>
        {label}
      </span>
      <span className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-gray-900">{value}</span>
        <ArrowRight className="h-3.5 w-3.5 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-gray-500" />
      </span>
      {hint && <span className="mt-0.5 block truncate text-[11px] text-gray-500">{hint}</span>}
    </Link>
  )
}

/** The tint/accent pairs Approvals uses for its four overview tiles. */
export const TILE_TONES = {
  amber: { accent: '#8A5A09', tint: '#FEF3DB' },
  blue: { accent: '#1F5D8C', tint: '#E5F2FB' },
  green: { accent: '#166534', tint: '#E6F1E6' },
  rose: { accent: '#9B1D4C', tint: '#FCE4EC' },
  violet: { accent: '#5B2D8E', tint: '#F7EAFB' },
} as const

export function formatDate(iso: string | null): string {
  if (!iso) return 'Not set'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Not set'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
