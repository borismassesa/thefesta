// Presentational primitives mirrored from the live OpusPass couple dashboard so
// the admin CMS preview renders pixel-faithfully to what couples actually see.
//
// Source of truth on the OpusPass side:
//   apps/opus_pass/src/components/dashboard/primitives.tsx
//   apps/opus_pass/src/components/dashboard/controls.tsx  (Button)
//   apps/opus_pass/src/components/dashboard/DashboardHero.tsx
//
// Keep these in visual sync with that file. They are intentionally non-interactive
// (no links, no handlers) — this is a static snapshot for content editors.

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type PreviewRsvpStatus = 'attending' | 'declined' | 'maybe' | 'pending'

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function PreviewButton({
  children,
  variant = 'primary',
  className,
}: {
  children: ReactNode
  variant?: 'primary' | 'secondary'
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold',
        variant === 'primary'
          ? 'bg-[#C9A0DC] text-[#1A1A1A]'
          : 'bg-white text-[#1A1A1A] ring-1 ring-inset ring-black/[0.12]',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-black/[0.05] px-3.5 py-2 text-xs font-semibold text-[#1A1A1A]">
      {children}
    </span>
  )
}

export function AccentChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-[#C9A0DC] px-3.5 py-2 text-xs font-semibold text-[#1A1A1A]">
      {children}
    </span>
  )
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  accent,
}: {
  label: string
  value: string | number
  hint?: string
  icon?: ReactNode
  accent?: boolean
}) {
  return (
    <Card className={cn('p-5', accent && 'border-[#1A1A1A]/15')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[#1A1A1A]/50">{label}</p>
          <p className="mt-1.5 text-3xl font-bold tracking-tight text-[#1A1A1A]">{value}</p>
          {hint ? <p className="mt-1 text-xs text-[#1A1A1A]/50">{hint}</p> : null}
        </div>
        {icon ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/[0.05] text-[#1A1A1A]/70">
            {icon}
          </span>
        ) : null}
      </div>
    </Card>
  )
}

export function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-[#1A1A1A]">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-sm text-[#1A1A1A]/55">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  )
}

const STATUS_STYLES: Record<PreviewRsvpStatus, string> = {
  attending: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  declined: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  maybe: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  pending: 'bg-neutral-100 text-neutral-600 ring-neutral-500/20',
}

const STATUS_TEXT: Record<PreviewRsvpStatus, string> = {
  attending: 'Attending',
  declined: 'Declined',
  maybe: 'Maybe',
  pending: 'Awaiting',
}

export function StatusPill({ status }: { status: PreviewRsvpStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        STATUS_STYLES[status],
      )}
    >
      {STATUS_TEXT[status]}
    </span>
  )
}

export function ProgressBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-black/[0.06]">
      <div className="h-full rounded-full bg-[#1A1A1A]" style={{ width: `${clamped}%` }} />
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <Card className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon ? (
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-black/[0.05] text-[#1A1A1A]/70">
          {icon}
        </span>
      ) : null}
      <h3 className="text-base font-semibold text-[#1A1A1A]">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-[#1A1A1A]/55">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </Card>
  )
}

// Plain page header — mirrors DashboardHero on the live site (title + subtitle +
// underline, with the page's primary actions on the right). No media, no eyebrow.
export function PreviewHero({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-black/[0.06] pb-6">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-[#1A1A1A] sm:text-3xl">
          {title || 'Untitled'}
        </h1>
        {subtitle ? <p className="mt-2 text-sm text-[#1A1A1A]/65 sm:text-base">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

// Underlined sub-navigation tab bar — mirrors GuestSubNav / PledgeSubNav.
export function SubNav({
  tabs,
}: {
  tabs: { label: string; active?: boolean; icon?: ReactNode; badge?: number }[]
}) {
  return (
    <nav className="-mx-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-black/[0.06] px-4 pb-2 sm:mx-0 sm:px-0">
      {tabs.map((t, i) => (
        <span
          key={i}
          className={cn(
            '-mb-[9px] inline-flex items-center gap-2 border-b-2 pb-2.5 text-sm',
            t.active
              ? 'border-[#1A1A1A] font-semibold text-[#1A1A1A]'
              : 'border-transparent font-medium text-[#1A1A1A]/55',
          )}
        >
          {t.icon}
          {t.label}
          {t.badge ? (
            <span
              className={cn(
                'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums',
                t.active ? 'bg-[#1A1A1A] text-white' : 'bg-black/[0.06] text-[#1A1A1A]/65',
              )}
            >
              {t.badge}
            </span>
          ) : null}
        </span>
      ))}
    </nav>
  )
}

// A divided stat strip cell (Guests / Adults / Children, Pledged / Received…).
export function DividedStat({
  value,
  label,
}: {
  value: string | number
  label: string
}) {
  return (
    <div className="px-2">
      <p className="text-2xl font-bold tracking-tight text-[#1A1A1A]">{value}</p>
      <p className="mt-0.5 text-xs text-[#1A1A1A]/55">{label}</p>
    </div>
  )
}

// A faux search input used in the preview toolbars.
export function PreviewSearch({ placeholder }: { placeholder: string }) {
  return (
    <div className="relative flex-1 min-w-0">
      <input
        type="search"
        readOnly
        tabIndex={-1}
        aria-label={placeholder}
        placeholder={placeholder}
        className="w-full"
      />
    </div>
  )
}
