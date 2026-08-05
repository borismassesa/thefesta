'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarRange, Radio } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Section nav for Event Check-in, same shape as the Digital Cards tabs.
 *
 * Only the section's own surfaces belong here. A single event is a drill-down
 * with its own tabs (Door staff / Report), so /operations/checkin/[eventId]
 * deliberately does not render this — showing both rows at once would read as
 * two competing navigations.
 */
const TABS = [
  { label: 'Events', href: '/operations/checkin', Icon: CalendarRange },
  { label: 'Live Monitor', href: '/operations/checkin/live', Icon: Radio },
]

export default function CheckinNavTabs() {
  const pathname = usePathname()
  return (
    <div className="border-b border-gray-200">
      <nav className="flex gap-6" aria-label="Event Check-in sections">
        {TABS.map(({ label, href, Icon }) => {
          // Exact match only: /operations/checkin is the Events tab's own page,
          // and every event detail route sits beneath it — a prefix match would
          // light Events up while the user is two levels down inside an event.
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 border-b-2 pb-2.5 text-sm font-semibold transition-colors',
                active
                  ? 'border-[#7E5896] text-[#7E5896]'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800',
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
