import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** OpusPass admin tokens for Workspace — purple primary, never lime. */
export const WS = {
  card: 'rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]',
  cardPad: 'rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]',
  pill: 'inline-flex items-center rounded-full border border-[#C9A0DC] bg-[#F0DFF6] px-2.5 py-0.5 text-[11px] font-semibold text-[#5d3a78]',
  pillMuted:
    'inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[11px] font-semibold text-gray-600',
  btnPrimary:
    'inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#7E5896] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#6c4884] disabled:opacity-50',
  btnSecondary:
    'inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50',
  btnGhost:
    'inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50',
  btnDanger:
    'inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-50',
  tabActive: 'border-b-2 border-[#7E5896] text-[#7E5896]',
  tabIdle: 'border-b-2 border-transparent text-gray-500 hover:text-gray-900',
  sectionLabel: 'text-[13px] font-semibold uppercase tracking-wide text-gray-500',
  iconWell: 'grid h-10 w-10 place-items-center rounded-xl bg-[#F0DFF6] text-[#7E5896]',
  progressTrack: 'h-2 overflow-hidden rounded-full bg-gray-100',
  progressFill: 'h-full rounded-full bg-[#7E5896]',
  link: 'text-[12px] font-semibold text-[#7E5896] hover:text-[#6c4884]',
  /** Compact primary used in dense toolbars (same purple, slightly smaller padding). */
  btnPrimarySm:
    'inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#7E5896] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#6c4884] disabled:opacity-50',
  /** Selected chip / filled toggle (was gray-900). */
  chipSelected: 'border-[#7E5896] bg-[#7E5896] text-white',
  chipIdle: 'border-gray-200 bg-white text-gray-700 hover:border-[#C9A0DC] hover:bg-[#F0DFF6]/40',
} as const

export function WsCard({
  children,
  className,
  padded = true,
}: {
  children: ReactNode
  className?: string
  padded?: boolean
}) {
  return <section className={cn(padded ? WS.cardPad : WS.card, className)}>{children}</section>
}

export function WsPill({
  children,
  className,
  muted,
}: {
  children: ReactNode
  className?: string
  muted?: boolean
}) {
  return <span className={cn(muted ? WS.pillMuted : WS.pill, className)}>{children}</span>
}

export function WsEmpty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-gray-400">{children}</p>
}

export function WsSectionLabel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <h2 className={cn(WS.sectionLabel, className)}>{children}</h2>
}
