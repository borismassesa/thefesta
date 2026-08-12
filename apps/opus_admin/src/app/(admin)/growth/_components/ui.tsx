import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Shared Growth Tracker tokens — OpusPass purple, compact admin tables via `.opus-table`. */
export const GT = {
  card: 'rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]',
  cardPad: 'rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]',
  sectionBar:
    'flex items-center justify-between gap-3 border-b border-gray-100 bg-[#F0DFF6]/40 px-4 py-3',
  sectionTitle: 'text-[12px] font-semibold uppercase tracking-wide text-[#5d3a78]',
  link: 'text-[12px] font-semibold text-[#7E5896] hover:text-[#6c4884]',
  btnPrimary:
    'inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#7E5896] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#6c4884] disabled:opacity-50',
  btnSecondary:
    'inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50',
  tabActive: 'border-b-2 border-[#7E5896] text-[#7E5896]',
  tabIdle: 'border-b-2 border-transparent text-gray-500 hover:text-gray-900',
  tableShell: 'overflow-x-auto',
  table: 'opus-table w-full min-w-[640px]',
} as const

export function GtCard({
  children,
  className,
  padded = false,
}: {
  children: ReactNode
  className?: string
  padded?: boolean
}) {
  return <section className={cn(padded ? GT.cardPad : GT.card, 'overflow-hidden', className)}>{children}</section>
}

export function GtSectionHeader({
  title,
  action,
}: {
  title: ReactNode
  action?: ReactNode
}) {
  return (
    <div className={GT.sectionBar}>
      <div className={GT.sectionTitle}>{title}</div>
      {action}
    </div>
  )
}
