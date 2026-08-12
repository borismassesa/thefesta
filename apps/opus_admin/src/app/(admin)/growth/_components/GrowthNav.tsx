'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  Building2,
  CalendarCheck,
  LayoutDashboard,
  Lightbulb,
  Star,
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { GT } from './ui'

// Mirrors the Excel workbook tabs so MDs find the same surfaces in Admin.

const TABS = [
  { href: '/growth', label: 'Monthly Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/growth/vendor-outreach', label: 'Vendor Outreach', icon: Building2 },
  { href: '/growth/marketing', label: 'Sales & Marketing', icon: TrendingUp },
  { href: '/growth/social', label: 'Social Media', icon: Star },
  { href: '/growth/studio', label: 'Studio Performance', icon: CalendarCheck },
  { href: '/growth/content-ideas', label: 'Content Ideas', icon: Lightbulb },
  { href: '/growth/kpis', label: 'Goals & KPIs', icon: BarChart3 },
] as const

export default function GrowthNav() {
  const pathname = usePathname()

  return (
    <div className="mb-6 border-b border-gray-100">
      <nav className="flex flex-wrap items-center gap-1" aria-label="Growth Tracker sections">
        {TABS.map((tab) => {
          const exact = 'exact' in tab && tab.exact
          const active = exact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`)
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-2 px-3 py-2.5 text-sm font-semibold transition-colors',
                active ? GT.tabActive : GT.tabIdle,
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
