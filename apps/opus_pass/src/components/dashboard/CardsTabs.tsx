'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PenLine, Receipt, Sparkles, type LucideIcon } from 'lucide-react'
import { useT } from '@/components/providers/UIStringsProvider'
import { cn } from '@/lib/utils'

/**
 * An order, the details our designers still need for it, and the finished
 * cards it produced are one job, so the sidebar carries a single "My Orders"
 * entry and this bar switches between the three.
 *
 * Labels reuse the existing bilingual nav keys, so the CMS still edits them in
 * one place even though they moved out of the sidebar.
 */
const TABS: { href: string; labelKey: string; icon: LucideIcon }[] = [
  { href: '/my/dashboard/orders', labelKey: 'nav_orders', icon: Receipt },
  { href: '/my/dashboard/cards', labelKey: 'nav_cards', icon: Sparkles },
  { href: '/my/dashboard/card-details', labelKey: 'nav_card_details', icon: PenLine },
]

export default function CardsTabs() {
  const pathname = usePathname()
  const t = useT('dashboard-chrome')
  return (
    <div
      className="no-scrollbar -mx-4 mb-6 flex items-center gap-x-6 overflow-x-auto overflow-y-hidden border-b border-black/[0.06] px-4 [&>*]:whitespace-nowrap sm:mx-0 sm:px-0"
      role="tablist"
      aria-label={t('nav_my_orders')}
    >
      {TABS.map(({ href, labelKey, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`)
        return (
          <Link
            key={href}
            href={href}
            role="tab"
            aria-selected={active}
            className={cn(
              '-mb-px flex shrink-0 items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors',
              active
                ? 'border-[#1A1A1A] text-[#1A1A1A]'
                : 'border-transparent text-[#1A1A1A]/55 hover:text-[#1A1A1A]',
            )}
          >
            <Icon className={cn('h-4 w-4', active ? 'text-[#1A1A1A]' : 'text-[#1A1A1A]/40')} />
            {t(labelKey)}
          </Link>
        )
      })}
    </div>
  )
}

/** Page header, tab bar, then the page itself. The heading lives up here rather
 *  than inside each view, so all three tabs share one header block and the
 *  title never repeats below the tabs.
 *
 *  `back` renders above the title, for the card detail page one level down
 *  from the gallery. */
export function CardsSection({
  title,
  subtitle,
  back,
  children,
}: {
  title: string
  subtitle: string
  back?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <header className="dash-header-safe mb-5">
        {back}
        <h1 className="text-2xl font-bold tracking-tight text-[#1A1A1A] sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-[#1A1A1A]/65 sm:text-base">{subtitle}</p>
      </header>
      <CardsTabs />
      {children}
    </div>
  )
}
