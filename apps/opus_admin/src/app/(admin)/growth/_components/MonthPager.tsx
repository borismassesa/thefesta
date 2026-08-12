'use client'

import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GT } from './ui'

function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

function monthLabel(monthKey: string): string {
  return new Date(`${monthKey}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export default function MonthPager({
  month,
  hrefForMonth,
  className,
}: {
  month: string
  hrefForMonth: (monthKey: string) => string
  className?: string
}) {
  const prev = shiftMonth(month, -1)
  const next = shiftMonth(month, 1)

  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <Link
        href={hrefForMonth(prev)}
        className={cn(GT.btnSecondary, 'px-2.5 py-1.5')}
        aria-label="Previous month"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={2} />
      </Link>
      <span className="min-w-38 text-center text-sm font-semibold text-gray-900">
        {monthLabel(month)}
      </span>
      <Link
        href={hrefForMonth(next)}
        className={cn(GT.btnSecondary, 'px-2.5 py-1.5')}
        aria-label="Next month"
      >
        <ChevronRight className="h-4 w-4" strokeWidth={2} />
      </Link>
    </div>
  )
}
