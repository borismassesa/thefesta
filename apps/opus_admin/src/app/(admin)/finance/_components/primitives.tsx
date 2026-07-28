import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A KPI tile. With `href` it doubles as the filter control for the list below,
 * which is why `active` paints the purple ring — the tile and the matching
 * filter pill are the same selection.
 */
export function Kpi({
  label,
  value,
  icon,
  href,
  active,
}: {
  label: string
  value: string
  icon?: ReactNode
  href?: string
  active?: boolean
}) {
  const className = cn(
    'block rounded-2xl border bg-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)] transition-colors',
    active ? 'border-[#C9A0DC] ring-1 ring-[#C9A0DC]' : 'border-gray-100',
    href && 'hover:border-[#C9A0DC]',
  )
  const inner = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
        {icon && <span className="text-[#7E5896]">{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">{value}</p>
    </>
  )
  return href ? (
    <Link href={href} className={className}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  )
}

/** A labelled fact tile inside an expanded order/payment row. */
export function Detail({
  icon,
  label,
  value,
  meta,
}: {
  icon: ReactNode
  label: string
  value: string
  meta?: string
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        <span className="text-[#7E5896]">{icon}</span>
        {label}
      </div>
      <p className="mt-2 break-words text-sm font-semibold text-gray-900">{value}</p>
      {meta && <p className="mt-1 break-words text-xs text-gray-500">{meta}</p>}
    </div>
  )
}
