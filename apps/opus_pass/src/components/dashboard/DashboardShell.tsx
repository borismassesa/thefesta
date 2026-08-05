'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useClerk } from '@clerk/nextjs'
import {
  LayoutDashboard,
  HandCoins,
  Users,
  CalendarHeart,
  Send,
  Globe,
  Armchair,
  Package,
  Settings,
  Menu,
  ExternalLink,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  Store,
  ChevronUp,
  BookHeart,
  Gift,
  type LucideIcon,
} from 'lucide-react'
import Logo from '@/components/ui/Logo'
import { useT } from '@/components/providers/UIStringsProvider'
import { cn } from '@/lib/utils'
import DashboardSearch from './DashboardSearch'
import DashboardTopIcons from './DashboardTopIcons'
import { useIsDesktop } from '@/hooks/useMediaQuery'

// opus_website (the marketplace + couple planning dashboard) lives at a different
// origin than this app. In production both share the opusfesta.com apex (and the
// same Clerk session), so jumping across keeps the user signed in. Absolute URL
// works in both the proxied (/opuspass) and standalone (opuspass.opusfesta.com)
// deployments; falls back to the website's local dev port.
const MARKETPLACE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3006'

// Events comes first after Overview: pledges, guests, invites and RSVPs all
// depend on at least one event existing, so it's the natural starting point.
// `labelKey` resolves to an editable, bilingual label via useT('dashboard-chrome');
// hrefs + icons stay hardcoded (routing/visuals are not content).
type NavItem = {
  href: string
  icon: LucideIcon
  // Internal items resolve a bilingual label via useT('dashboard-chrome');
  // external items carry a plain `label` (they leave this app for the
  // marketplace, so they aren't part of the dashboard CMS string set).
  labelKey?: string
  label?: string
  external?: boolean
  /** Extra routes this entry owns — sub-pages that live behind its tab bar
   *  rather than in the sidebar, so the entry stays lit while you're on them. */
  alsoActiveOn?: string[]
}

// Pages reachable through a tab bar rather than the sidebar. They still belong
// in the search dropdown, so a couple can jump straight to one by name.
const TAB_PAGES: { href: string; labelKey: string }[] = [
  { href: '/my/dashboard/orders', labelKey: 'nav_orders' },
  { href: '/my/dashboard/cards', labelKey: 'nav_cards' },
  { href: '/my/dashboard/card-details', labelKey: 'nav_card_details' },
]

const NAV: NavItem[] = [
  { href: '/my/dashboard', labelKey: 'nav_overview', icon: LayoutDashboard },
  { href: '/my/dashboard/events', labelKey: 'nav_events', icon: CalendarHeart },
  { href: '/my/dashboard/pledges', labelKey: 'nav_pledges', icon: HandCoins },
  { href: '/my/dashboard/guests', labelKey: 'nav_guests', icon: Users },
  { href: '/my/dashboard/invitations', labelKey: 'nav_invitations', icon: Send },
  // An order, the details our designers still need for it, and the finished
  // cards it produced are one job, so they share a single entry. The tab bar
  // inside (CardsTabs) switches between the three.
  {
    href: '/my/dashboard/orders',
    labelKey: 'nav_my_orders',
    icon: Package,
    alsoActiveOn: ['/my/dashboard/cards', '/my/dashboard/card-details'],
  },
  { href: '/my/dashboard/guestbook', labelKey: 'nav_guestbook', icon: BookHeart },
  { href: '/my/dashboard/gift-registry', label: 'Gift registry', icon: Gift },
  { href: '/my/dashboard/seating', labelKey: 'nav_seating', icon: Armchair },
  { href: '/my/dashboard/website', labelKey: 'nav_website', icon: Globe },
]

function NavLinks({
  onNavigate,
  collapsed,
}: {
  onNavigate?: () => void
  collapsed?: boolean
}) {
  const pathname = usePathname()
  const t = useT('dashboard-chrome')
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const { href, icon: Icon, external } = item
        const label = item.label ?? t(item.labelKey as string)
        const owned = [href, ...(item.alsoActiveOn ?? [])]
        const active =
          !external &&
          (href === '/my/dashboard'
            ? pathname === href
            : owned.some((p) => pathname.startsWith(p)))
        const className = cn(
          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
          collapsed && 'justify-center px-0',
          active
            ? 'bg-(--accent) text-(--on-accent)'
            : 'text-[#1A1A1A]/60 hover:bg-black/4 hover:text-[#1A1A1A]',
        )
        const inner = (
          <>
            <Icon
              className={cn(
                'h-[18px] w-[18px] shrink-0',
                active ? 'text-(--on-accent)' : 'text-[#1A1A1A]/40',
              )}
            />
            {collapsed ? null : <span className="flex-1">{label}</span>}
            {external && !collapsed ? (
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#1A1A1A]/30" />
            ) : null}
          </>
        )
        const shared = {
          onClick: onNavigate,
          title: collapsed ? label : undefined,
          'aria-label': collapsed ? label : undefined,
          className,
        }
        return external ? (
          <a key={href} href={href} {...shared}>
            {inner}
          </a>
        ) : (
          <Link key={href} href={href} {...shared}>
            {inner}
          </Link>
        )
      })}
    </nav>
  )
}

export default function DashboardShell({
  coupleName,
  userEmail,
  userInitial,
  defaultCollapsed = false,
  staffSession = false,
  children,
}: {
  coupleName: string
  userEmail: string
  userInitial: string
  defaultCollapsed?: boolean
  /** True when an OpusFesta admin is acting for this couple. Swaps Clerk sign-out
   *  for leaving the staff session — the admin has no Clerk session here, so
   *  signing out would strand them inside the couple's dashboard. */
  staffSession?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  // The icon cluster (bell + cart) polls, so mounting both the mobile and
  // desktop copies would double every poll. CSS only hides one; this makes
  // exactly one actually mount for the current breakpoint.
  const isDesktop = useIsDesktop()
  const t = useT('dashboard-chrome')

  // Resolved nav labels feed the search dropdown's "Pages" group. Tabbed
  // sub-pages join them so they stay findable by name after leaving the sidebar.
  const navPages = [
    ...NAV.map((item) => ({ label: item.label ?? t(item.labelKey as string), href: item.href })),
    ...TAB_PAGES.filter((item) => !NAV.some((n) => n.href === item.href)).map((item) => ({
      label: t(item.labelKey),
      href: item.href,
    })),
  ]

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      // Persist so the choice survives reloads (read back in the server layout).
      document.cookie = `sidebar_collapsed=${next ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`
      return next
    })
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Sidebar — desktop */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-black/6 bg-white py-6 transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[76px] px-3' : 'w-64 px-4',
        )}
      >
        <div
          className={cn(
            'flex items-center',
            collapsed ? 'justify-center' : 'justify-between px-2',
          )}
        >
          {collapsed ? null : (
            <Link href="/">
              <Logo className="text-2xl" />
            </Link>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? t('collapse_expand') : t('collapse_collapse')}
            title={collapsed ? t('collapse_expand') : t('collapse_collapse')}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#1A1A1A]/45 transition-colors hover:bg-black/5 hover:text-[#1A1A1A]"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-[18px] w-[18px]" />
            ) : (
              <PanelLeftClose className="h-[18px] w-[18px]" />
            )}
          </button>
        </div>
        {!collapsed && coupleName && coupleName !== 'The Couple' ? (
          <p className="mt-1 px-2 text-xs text-[#1A1A1A]/45">{coupleName}</p>
        ) : null}
        {!collapsed ? <div className="mt-5 px-1"><DashboardSearch navItems={navPages} /></div> : null}
        <div className={cn('flex-1', collapsed ? 'mt-8' : 'mt-4')}>
          <NavLinks collapsed={collapsed} />
        </div>
        <div className="space-y-2 border-t border-black/6 pt-4">
          <AccountFooter email={userEmail} initial={userInitial} collapsed={collapsed} staffSession={staffSession} />
        </div>
      </aside>

      {/* Top bar — mobile */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-black/6 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('menu_open')}
          className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-black/5"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Logo className="text-xl" />
        <div className="flex items-center gap-0.5">
          {!isDesktop && <DashboardTopIcons />}
          <AccountFooter email={userEmail} initial={userInitial} layout="header" staffSession={staffSession} />
        </div>
      </header>

      {/* Drawer — mobile */}
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white px-4 py-6 shadow-xl">
            <div className="flex items-center justify-between">
              <Logo className="text-xl" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('menu_close')}
                title={t('menu_close')}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[#1A1A1A]/45 transition-colors hover:bg-black/5 hover:text-[#1A1A1A]"
              >
                <PanelLeftClose className="h-[18px] w-[18px]" />
              </button>
            </div>
            {coupleName && coupleName !== 'The Couple' ? (
              <p className="mt-1 text-xs text-[#1A1A1A]/45">{coupleName}</p>
            ) : null}
            <div className="mt-4"><DashboardSearch navItems={navPages} onNavigate={() => setOpen(false)} /></div>
            {/* Nav grows to fill, pushing the account block to the bottom */}
            <div className="mt-4 flex-1 overflow-y-auto">
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
            <div className="mt-6 border-t border-black/6 pt-4">
              <AccountFooter
                email={userEmail}
                initial={userInitial}
                onNavigate={() => setOpen(false)}
                staffSession={staffSession}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Content */}
      <main className={cn('transition-[padding] duration-200', collapsed ? 'lg:pl-[76px]' : 'lg:pl-64')}>
        <div className="relative mx-auto max-w-[1600px] px-3 pt-4 pb-6 sm:px-4 lg:px-6 lg:pt-5 lg:pb-8">
          {/* Account cluster — desktop. Overlaid in the top-right corner so it
              sits on the same line as each page's title (which now starts at
              the top of the content) instead of pushing every title onto a
              second row. Absolute, so it takes no vertical space. Every page
              title header reserves room on its right (the `dash-header-safe`
              utility, ~w-56 of clearance) so right-aligned page controls clear
              the icons and wrap below when tight. Mobile uses the top bar. */}
          <div className="absolute right-3 top-4 z-20 hidden items-center gap-1 sm:right-4 lg:right-6 lg:flex">
            {isDesktop && <DashboardTopIcons />}
            <div className="mx-1.5 h-6 w-px bg-black/10" />
            <AccountFooter email={userEmail} initial={userInitial} layout="header" staffSession={staffSession} />
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}

function AccountFooter({
  email,
  initial,
  onNavigate,
  collapsed,
  layout = 'sidebar',
  staffSession = false,
}: {
  email: string
  initial: string
  onNavigate?: () => void
  collapsed?: boolean
  // 'sidebar' — full-width trigger, dropdown opens upward (sidebar footer).
  // 'header' — avatar-only trigger, dropdown opens downward, right-aligned.
  layout?: 'sidebar' | 'header'
  staffSession?: boolean
}) {
  const pathname = usePathname()
  const { signOut } = useClerk()
  const [open, setOpen] = useState(false)
  const t = useT('dashboard-chrome')
  const active = pathname.startsWith('/my/dashboard/settings')
  const header = layout === 'header'

  const close = () => setOpen(false)

  return (
    <div className="relative">
      {/* Click-away backdrop */}
      {open ? (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          className="fixed inset-0 z-40 cursor-default"
          onClick={close}
        />
      ) : null}

      {/* Dropdown — sidebar footer opens upward; header avatar opens downward. */}
      {open ? (
        <div
          role="menu"
          className={cn(
            'absolute z-50 overflow-hidden rounded-xl border border-black/8 bg-white py-1 shadow-lg',
            header
              ? 'right-0 top-full mt-2 w-56'
              : collapsed
                ? 'bottom-full left-0 mb-2 w-56'
                : 'bottom-full left-0 right-0 mb-2',
          )}
        >
          <Link
            href="/my/dashboard/settings"
            role="menuitem"
            onClick={() => {
              close()
              onNavigate?.()
            }}
            className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-[#1A1A1A] hover:bg-black/4"
          >
            <Settings className="h-4 w-4 shrink-0 text-[#1A1A1A]/45" />
            {t('account_settings')}
          </Link>
          <a
            href={MARKETPLACE_URL}
            role="menuitem"
            onClick={() => {
              close()
              onNavigate?.()
            }}
            className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-[#1A1A1A] hover:bg-black/4"
          >
            <Store className="h-4 w-4 shrink-0 text-[#1A1A1A]/45" />
            <span className="min-w-0 flex-1">
              {t('account_marketplace')}
              <span className="block text-xs font-normal text-[#1A1A1A]/45">{t('account_marketplace_sub')}</span>
            </span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#1A1A1A]/30" />
          </a>
          <div className="my-1 border-t border-black/6" />
          {staffSession ? (
            // A staff session has no Clerk session to sign out of, so Clerk's
            // signOut would leave the admin sitting in the couple's dashboard.
            // Dropping the staff cookie is the only exit that works.
            <form action="/api/staff-access/exit" method="post">
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-3 px-3 py-2.5 text-sm font-medium text-amber-800 hover:bg-black/4"
              >
                <LogOut className="h-4 w-4 shrink-0 text-amber-700/70" />
                Leave this account
              </button>
            </form>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close()
                // basePath ('/opuspass') is NOT prepended by Clerk's signOut, so
                // use the full path — matches AlreadySignedIn and keeps the user
                // in the OpusPass zone instead of the marketplace apex.
                void signOut({ redirectUrl: '/sign-in' })
              }}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-sm font-medium text-[#1A1A1A] hover:bg-black/4"
            >
              <LogOut className="h-4 w-4 shrink-0 text-[#1A1A1A]/45" />
              {t('account_sign_out')}
            </button>
          )}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('account_title')}
        aria-label={t('account_title')}
        className={cn(
          'flex items-center gap-3 rounded-xl transition-colors',
          header
            ? 'p-0.5'
            : cn('w-full px-3 py-2', collapsed && 'justify-center px-0'),
          open || active ? 'bg-[#C9A0DC]/15' : 'hover:bg-black/4',
        )}
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#C9A0DC]/25 text-xs font-bold text-[#8e57b3]"
          aria-hidden="true"
        >
          {initial}
        </span>
        {header || collapsed ? null : (
          <>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-sm font-medium text-[#1A1A1A]">{t('account_label')}</span>
              <span className="block truncate text-xs text-[#1A1A1A]/55" title={email}>
                {email}
              </span>
            </span>
            <ChevronUp
              className={cn(
                'h-4 w-4 shrink-0 text-[#1A1A1A]/40 transition-transform',
                open ? '' : 'rotate-180',
              )}
            />
          </>
        )}
      </button>
    </div>
  )
}
