'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Mail, PenTool, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// The Digital Cards product surface, split by what you are actually doing:
//
//   Cards         the catalogue. One card, one page, with its artwork, its
//                 layer mapping and its typefaces all on it.
//   Card Designer the per-order work of personalising a card someone bought.
//
// There was a third tab, "Templates", which listed the same cards again and
// held the layer mapping. Two tabs over one table meant setting a card up was a
// round trip, so it now lives under the card. Tabs without an href render
// disabled until that surface ships.
type Tab = { label: string; icon: LucideIcon; href?: string }

const TABS: Tab[] = [
  { label: 'Cards', icon: Mail, href: '/opus-pass/digital-cards/cards' },
  { label: 'Card Designer', icon: PenTool, href: '/opus-pass/digital-cards/designer' },
]

export default function DigitalCardsNavTabs() {
  const pathname = usePathname()
  return (
    <div className="border-b border-gray-100">
      <nav className="flex gap-1 px-8" aria-label="Digital Cards sections">
        {TABS.map((tab) => {
          const Icon = tab.icon

          if (!tab.href) {
            return (
              <span
                key={tab.label}
                title="Coming soon"
                aria-disabled="true"
                className="inline-flex cursor-not-allowed select-none items-center gap-2 border-b-2 border-transparent px-3 py-2.5 text-sm font-semibold text-gray-300"
              >
                <Icon className="h-4 w-4 stroke-[1.75]" />
                {tab.label}
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                  Soon
                </span>
              </span>
            )
          }

          const active = pathname === tab.href || pathname.startsWith(tab.href + '/')
          return (
            <Link
              key={tab.label}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors',
                active
                  ? 'border-[#7E5896] text-[#7E5896]'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
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
