'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, ListChecks, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePortalT } from '@/components/providers/PortalUIStringsProvider'

type Tab = { href: string; label: string; icon: typeof ListChecks }

export default function BookingsTabs() {
  const t = usePortalT('bookings')
  const pathname = usePathname()

  const tabs: Tab[] = [
    { href: '/bookings', label: t('view_pipeline'), icon: ListChecks },
    { href: '/bookings/calendar', label: t('view_calendar'), icon: CalendarDays },
  ]

  return (
    <div className="px-8 pt-2 border-b border-gray-100 flex items-center gap-3">
      <nav className="flex items-center gap-1" aria-label="Bookings views">
        {tabs.map((tab) => {
          const active = pathname === tab.href
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold rounded-t-md border-b-2 transition-colors',
                active
                  ? 'text-gray-900 border-gray-900'
                  : 'text-gray-500 hover:text-gray-900 border-transparent',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </Link>
          )
        })}
      </nav>
      <button data-opus-button="primary" data-opus-button-size="medium"
        type="button"
        className="ml-auto mb-2 inline-flex items-center gap-1.5 bg-gray-900 text-white text-sm font-semibold px-4 py-2 rounded-full hover:bg-gray-800 transition-colors"
      >
        <Plus className="w-4 h-4" />
        {t('new_booking')}
      </button>
    </div>
  )
}
