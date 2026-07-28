'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  CalendarCheck,
  HelpCircle,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Rocket,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Star,
  Store,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePortalT, type Translator } from '@/components/providers/PortalUIStringsProvider'
import { sellsProducts } from '@/lib/onboarding/verticals'
import { useVendorVertical } from '@/lib/onboarding/vertical-context'
import Logo from './ui/Logo'

type NavItem = { icon: LucideIcon; label: string; href: string; badge?: string }

// The nav is built per vertical. A gift shop or an attire seller sells goods,
// not booked time: nobody sends them an enquiry, they have no calendar, and
// there are no lead preferences to tune. Showing those tabs anyway would hand
// them four screens that can only ever be empty. What they get instead is
// Products (under Storefront) and Payments, which service vendors don't have.

function buildTopItems(t: Translator, sells: boolean): NavItem[] {
  return [
    { icon: LayoutDashboard, label: t('nav_dashboard'), href: '/dashboard' },
    // Leads come from the wedding vendor directory, which product vendors
    // aren't listed in.
    ...(sells ? [] : [{ icon: Inbox, label: t('nav_leads'), href: '/leads' }]),
  ]
}

function buildMainItems(t: Translator, sells: boolean): NavItem[] {
  return [
    { icon: Store, label: t('nav_storefront'), href: '/storefront' },
    ...(sells
      ? [
          // Their equivalent of a calendar: the stock they've listed and its
          // moderation state. Lives under Storefront, surfaced here too because
          // it's the tab a seller opens every day.
          { icon: Package, label: 'Products', href: '/storefront/products' },
          { icon: Wallet, label: 'Payments', href: '/payments' },
        ]
      : [{ icon: CalendarCheck, label: t('nav_bookings'), href: '/bookings' }]),
    { icon: Star, label: t('nav_reviews'), href: '/reviews' },
  ]
}

function buildGrowthItems(t: Translator, sells: boolean): NavItem[] {
  return [
    ...(sells
      ? []
      : [
          {
            icon: SlidersHorizontal,
            label: t('nav_lead_preferences'),
            href: '/lead-preferences',
          },
        ]),
    { icon: Sparkles, label: t('nav_plans'), href: '/plans' },
    { icon: Rocket, label: t('nav_boost_storefront'), href: '/boost', badge: t('badge_new') },
    { icon: BarChart3, label: t('nav_insights'), href: '/insights' },
  ]
}

function buildBottomNavItems(t: Translator): NavItem[] {
  return [
    { icon: HelpCircle, label: t('nav_help_center'), href: '/help' },
    { icon: MessageSquare, label: t('nav_feedback'), href: '/feedback' },
    { icon: Settings, label: t('nav_settings'), href: '/settings' },
  ]
}

const COLLAPSED_KEY = 'opusfesta:vendors-sidebar-collapsed'

function isItemActive(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard'
  return pathname === href || pathname.startsWith(href + '/')
}

function SidebarLink({
  item,
  collapsed,
  pathname,
}: {
  item: NavItem
  collapsed: boolean
  pathname: string
}) {
  const Icon = item.icon
  const isActive = isItemActive(pathname, item.href)
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={cn(
        'relative flex items-center rounded-xl text-sm font-semibold transition-colors',
        collapsed ? 'justify-center w-12 h-12 mx-auto' : 'w-full justify-between px-3 py-2.5',
        isActive
          ? 'bg-[#F0DFF6] text-[#7E5896]'
          : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50',
      )}
    >
      {collapsed ? (
        <>
          <Icon className="w-5 h-5 stroke-[1.5]" />
          {item.badge && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#C9A0DC] ring-2 ring-white" />
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Icon className="w-5 h-5 stroke-[1.5]" />
            {item.label}
          </div>
          {item.badge && (
            <span className="bg-[#C9A0DC] text-white text-[10px] font-bold min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center tabular-nums">
              {item.badge}
            </span>
          )}
        </>
      )}
    </Link>
  )
}

export function Sidebar({ newLeadCount = 0 }: { newLeadCount?: number }) {
  const pathname = usePathname()
  const vertical = useVendorVertical()
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const t = usePortalT('portal-chrome')

  const sells = sellsProducts(vertical)
  const topItems = buildTopItems(t, sells)
  const mainItems = buildMainItems(t, sells)
  const growthItems = buildGrowthItems(t, sells)
  const bottomNavItems = buildBottomNavItems(t)

  // Live "new leads" count badge. Capped display at 99+ to keep the pill tidy.
  const leadsBadge =
    newLeadCount > 0 ? (newLeadCount > 99 ? '99+' : String(newLeadCount)) : undefined
  const topItemsWithBadges: NavItem[] = topItems.map((item) =>
    item.href === '/leads' ? { ...item, badge: leadsBadge } : item,
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.localStorage.getItem(COLLAPSED_KEY) === '1') setCollapsed(true)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  const toggle = () => setCollapsed((c) => !c)
  const expand = () => setCollapsed(false)

  return (
    <aside
      className={cn(
        'bg-white border-r border-gray-100 flex flex-col h-screen sticky top-0 py-6 transition-[width] duration-200 ease-out',
        collapsed ? 'w-[72px] px-2' : 'w-64 px-4',
      )}
    >
      <div
        className={cn(
          'flex items-center mb-6',
          collapsed ? 'justify-center' : 'justify-between px-3',
        )}
      >
        {!collapsed && (
          <Link href="/" className="flex items-center" aria-label="Home">
            <Logo className="h-7 w-auto" />
          </Link>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? t('aria_expand_sidebar') : t('aria_collapse_sidebar')}
          className="text-gray-400 hover:text-gray-700 hover:bg-gray-50 p-1.5 rounded-lg transition-colors"
        >
          {collapsed ? (
            <PanelLeftOpen className="w-5 h-5" />
          ) : (
            <PanelLeftClose className="w-5 h-5" />
          )}
        </button>
      </div>

      {collapsed ? (
        <button
          type="button"
          onClick={expand}
          aria-label={t('aria_search')}
          className="self-center text-gray-400 hover:text-gray-900 hover:bg-gray-50 p-2 rounded-lg transition-colors mb-4"
        >
          <Search className="w-5 h-5" />
        </button>
      ) : (
        <div className="px-1 mb-4">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-gray-400 absolute left-3" />
            <input
              type="text"
              placeholder={t('search_placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-2 bg-gray-50 border border-gray-100 rounded-lg w-full text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] focus:border-transparent transition-all"
            />
          </div>
        </div>
      )}

      <div className={cn('flex-1 overflow-y-auto overflow-x-hidden space-y-4')}>
        <nav className="space-y-1">
          {topItemsWithBadges.map((item) => (
            <SidebarLink
              key={item.href}
              item={item}
              collapsed={collapsed}
              pathname={pathname}
            />
          ))}
        </nav>

        {!collapsed && (
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            {t('section_your_business')}
          </p>
        )}
        <nav className="space-y-1">
          {mainItems.map((item) => (
            <SidebarLink
              key={item.href}
              item={item}
              collapsed={collapsed}
              pathname={pathname}
            />
          ))}
        </nav>

        {!collapsed && (
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            {t('section_grow')}
          </p>
        )}
        <nav className="space-y-1">
          {growthItems.map((item) => (
            <SidebarLink
              key={item.href}
              item={item}
              collapsed={collapsed}
              pathname={pathname}
            />
          ))}
        </nav>
      </div>

      <div className={cn('mt-auto border-t border-gray-100 pt-4 space-y-1')}>
        {bottomNavItems.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center rounded-xl text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors',
                collapsed ? 'justify-center w-12 h-12 mx-auto' : 'gap-3 px-3 py-2',
              )}
            >
              <Icon className="w-5 h-5 stroke-[1.5]" />
              {!collapsed && item.label}
            </Link>
          )
        })}
      </div>
    </aside>
  )
}
