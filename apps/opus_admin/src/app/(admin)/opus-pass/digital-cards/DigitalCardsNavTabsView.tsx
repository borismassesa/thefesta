'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, Palette, PenTool, Sparkles, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// Rendering only. Which tabs exist is decided on the server, per caller, in
// DigitalCardsNavTabs.tsx — see the note there.
//
// Icons are named rather than passed as components: the tab list crosses the
// server/client boundary, and a LucideIcon is a function, which is not
// serialisable as a prop.
type TabIcon = 'catalogue' | 'personalisation' | 'studio' | 'designStudio'

const ICONS: Record<TabIcon, LucideIcon> = {
  catalogue: LayoutGrid,
  personalisation: PenTool,
  studio: Palette,
  designStudio: Sparkles,
}

export type SectionTab = {
  label: string
  icon: TabIcon
  href: string
  /** Extra prefixes that also count as active, for tabs whose pages sit outside their href. */
  activePaths?: string[]
}

function isActive(pathname: string, tab: SectionTab): boolean {
  const prefixes = [tab.href, ...(tab.activePaths ?? [])]
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export default function DigitalCardsNavTabsView({ tabs }: { tabs: SectionTab[] }) {
  const pathname = usePathname()
  return (
    <div className="border-b border-gray-100">
      <nav className="flex gap-1 px-8" aria-label="Digital Cards sections">
        {tabs.map((tab) => {
          const Icon = ICONS[tab.icon]
          const active = isActive(pathname, tab)
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
