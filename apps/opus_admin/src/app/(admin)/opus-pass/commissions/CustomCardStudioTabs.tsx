'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The two views of the Custom Card Studio, one level below the Digital Cards
 * section tabs.
 *
 * Analytics used to be its own top-level sidebar entry ("Commission
 * Analytics"), sitting beside the queue it measures. It is a view of this
 * surface, not a peer of it, so it is a tab here.
 *
 * Both tabs are commissions.read — the same gate as the section tab that
 * reveals this whole area — so unlike the section bar above, this one needs no
 * per-caller filtering.
 *
 * Deliberately NOT rendered on /opus-pass/commissions/[orderId]. A task is a
 * detail page: three stacked tab bars over one record is noise, and the same
 * rule already applies to a catalogue card and a design job.
 */
const TABS = [
  { label: 'Work Queue', icon: Layers, href: '/opus-pass/commissions' },
  { label: 'Analytics', icon: BarChart3, href: '/opus-pass/commissions/analytics' },
] as const

export default function CustomCardStudioTabs() {
  const pathname = usePathname()
  return (
    <div className="border-b border-gray-100 bg-white">
      <nav className="flex gap-1 px-8" aria-label="Custom Card Studio views">
        {TABS.map((tab) => {
          const Icon = tab.icon
          // Exact match: the queue's href is a prefix of every other route in
          // the studio, so a prefix test would light it up on Analytics too.
          const active = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors',
                active
                  ? 'border-[#7E5896] text-[#7E5896]'
                  : 'border-transparent text-gray-500 hover:text-gray-900',
              )}
            >
              <Icon className="h-4 w-4 stroke-[1.75]" />
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
