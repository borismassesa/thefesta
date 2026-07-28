'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import Logo from '@/components/ui/Logo'
import CartMenu from '@/components/CartMenu'
import NotificationsBell from '@/components/NotificationsBell'
import { LocaleToggle } from '@/components/LocaleToggle'
import { useT } from '@/components/providers/UIStringsProvider'
import { UserButton, useUser } from '@clerk/nextjs'
import {
  Menu,
  X,
  ChevronDown,
  Heart,
  Users,
  MapPin,
  MessageCircle,
  ArrowRight,
  CheckCircle2,
  Link as LinkIcon,
  Globe,
  BookOpen,
  PenLine,
  Monitor,
  Image as ImageIcon,
  Share2,
} from 'lucide-react'

type NavLink = { label: string; href?: string; Icon?: LucideIcon; subLinks?: string[] }
type PhotoGridItem = { label: string; image: string; href?: string }

export default function Navbar() {
  const router = useRouter()
  const t = useT('navbar')
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null)
  const { isSignedIn, isLoaded } = useUser()
  // Clerk can resolve `isLoaded` synchronously on some client reloads (cached
  // session), before hydration reconciles — the auth block would then render
  // differently on the client's first pass than the server's (always
  // `isLoaded: false`) pass, throwing a hydration mismatch. Gating on `mounted`
  // (flipped in an effect, so it's always `false` on the first client render)
  // guarantees that first pass always matches the server: nothing rendered.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const authReady = mounted && isLoaded

  // Built from CMS-resolved strings (labels) + hardcoded hrefs/icons/images.
  // Defined inside the component so labels can call t(). The `label` of each item
  // doubles as its stable key for active-menu / mobile-expand state.
  const navItems: Array<{
    label: string
    card: { image: string; title: string; description: string; linkText: string; href?: string }
    columns: Array<{ title: string; links: NavLink[] }>
    photoGridTitle?: string
    photoGrid?: PhotoGridItem[]
  }> = [
    {
      label: t('nav_invitations'),
      card: {
        image: t('mega_inv_image'),
        title: t('mega_inv_title'),
        description: t('mega_inv_desc'),
        linkText: t('mega_inv_cta'),
        href: '/digital-cards',
      },
      columns: [
        {
          title: t('inv_col_browse'),
          links: [
            { Icon: Users, label: t('inv_link_all_designs'), href: '/digital-cards/catalog' },
            { Icon: CheckCircle2, label: t('inv_link_save_the_dates'), href: '/digital-cards/save-the-date' },
            { Icon: MessageCircle, label: t('inv_link_wedding'), href: '/digital-cards/wedding' },
            { Icon: MapPin, label: t('inv_link_send_off'), href: '/digital-cards/send-off' },
            { Icon: Heart, label: t('inv_link_kadi'), href: '/digital-cards/kadi-za-michango' },
          ],
        },
        {
          title: t('inv_col_resources'),
          links: [
            { Icon: BookOpen, label: t('inv_link_wording'), href: '/digital-cards' },
            { Icon: PenLine, label: t('inv_link_rsvp_wording'), href: '/digital-cards' },
          ],
        },
      ],
      photoGridTitle: t('inv_grid_title'),
      photoGrid: [
        { label: t('inv_grid_guest_list'), image: t('inv_grid_guest_list_image'), href: '/digital-cards' },
        { label: t('inv_grid_rsvp_tracking'), image: t('inv_grid_rsvp_tracking_image'), href: '/digital-cards' },
        { label: t('inv_grid_invitations'), image: t('inv_grid_invitations_image'), href: '/digital-cards' },
        { label: t('inv_grid_seating_plan'), image: t('inv_grid_seating_plan_image'), href: '/digital-cards' },
      ],
    },
    {
      label: t('nav_guests'),
      card: {
        image: t('mega_guests_image'),
        title: t('mega_guests_title'),
        description: t('mega_guests_desc'),
        linkText: t('mega_guests_cta'),
        href: '/guests-and-rsvp',
      },
      columns: [
        {
          title: t('guests_col_manage'),
          links: [
            { Icon: Users, label: t('guests_link_list_manager'), href: '/guests-and-rsvp' },
            { Icon: CheckCircle2, label: t('guests_link_rsvp_tracking'), href: '/guests-and-rsvp' },
            { Icon: Share2, label: t('guests_link_whatsapp_sms'), href: '/guests-and-rsvp' },
            { Icon: MapPin, label: t('guests_link_seating'), href: '/guests-and-rsvp' },
          ],
        },
        {
          title: t('guests_col_resources'),
          links: [
            { Icon: BookOpen, label: t('guests_link_rsvp_wording'), href: '/guests-and-rsvp' },
            { Icon: PenLine, label: t('guests_link_etiquette'), href: '/guests-and-rsvp' },
          ],
        },
      ],
      photoGridTitle: t('guests_grid_title'),
      photoGrid: [
        { label: t('guests_grid_guest_list'), image: t('guests_grid_guest_list_image'), href: '/guests-and-rsvp' },
        { label: t('guests_grid_rsvp_tracking'), image: t('guests_grid_rsvp_tracking_image'), href: '/guests-and-rsvp' },
        { label: t('guests_grid_invitations'), image: t('guests_grid_invitations_image'), href: '/digital-cards' },
        { label: t('guests_grid_seating_plan'), image: t('guests_grid_seating_plan_image'), href: '/guests-and-rsvp' },
      ],
    },
    {
      label: t('nav_website'),
      card: {
        image: t('mega_website_image'),
        title: t('mega_website_title'),
        description: t('mega_website_desc'),
        linkText: t('mega_website_cta'),
        href: '/websites',
      },
      columns: [
        {
          title: t('website_col_features'),
          links: [
            { Icon: Globe, label: t('website_link_free_site'), href: '/websites' },
            { Icon: LinkIcon, label: t('website_link_custom_link'), href: '/websites' },
            { Icon: Heart, label: t('website_link_templates'), href: '/websites' },
            { Icon: CheckCircle2, label: t('website_link_rsvp_collection'), href: '/websites' },
            { Icon: MapPin, label: t('website_link_venue_travel'), href: '/websites' },
          ],
        },
        {
          title: t('website_col_resources'),
          links: [
            { Icon: Monitor, label: t('website_link_examples'), href: '/websites' },
            { Icon: ImageIcon, label: t('website_link_gallery_tips'), href: '/websites' },
            { Icon: Share2, label: t('website_link_sharing'), href: '/websites' },
          ],
        },
      ],
      photoGridTitle: t('website_grid_title'),
      photoGrid: [
        { label: t('website_grid_templates'), image: t('website_grid_templates_image'), href: '/websites' },
        { label: t('website_grid_photo_gallery'), image: t('website_grid_photo_gallery_image'), href: '/websites' },
        { label: t('website_grid_rsvps'), image: t('website_grid_rsvps_image'), href: '/websites' },
        { label: t('website_grid_travel_info'), image: t('website_grid_travel_info_image'), href: '/websites' },
      ],
    },
  ]

  const activeItem = activeMenu ? navItems.find((i) => i.label === activeMenu) ?? null : null

  const hamburgerRef = useRef<HTMLButtonElement>(null)
  const mobileCloseRef = useRef<HTMLButtonElement>(null)

  // Body lock + focus management for mobile nav
  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    mobileCloseRef.current?.focus()
    return () => {
      document.body.style.overflow = prev
      hamburgerRef.current?.focus()
    }
  }, [mobileOpen])

  const closeMobile = () => {
    setMobileOpen(false)
    setMobileExpanded(null)
  }

  const getNavHref = (href?: string) => href ?? '#'

  return (
    <div
      className="relative border-b border-gray-100 bg-white"
      onMouseLeave={() => setActiveMenu(null)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setActiveMenu(null)
          closeMobile()
        }
      }}
    >
      {/* ── Top bar ── */}
      <nav className="relative z-50 mx-auto flex max-w-344 items-center justify-between bg-white px-3 py-3.5 sm:px-4 sm:py-4 lg:px-3 xl:px-2">
        {/* Left: logo + desktop nav */}
        <div className="flex min-w-0 items-center gap-3 sm:gap-6 lg:gap-5">
          <Link href="/" aria-label="OpusPass home" className="shrink-0">
            <Logo />
          </Link>

          <div className="hidden lg:flex gap-1 font-semibold text-[15px]">
            {navItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onMouseEnter={() => setActiveMenu(item.label)}
                onFocus={() => setActiveMenu(item.label)}
                onClick={() => {
                  setActiveMenu(null)
                  router.push(getNavHref(item.card.href))
                }}
                aria-expanded={activeMenu === item.label}
                aria-haspopup="true"
                className={`relative rounded-md px-4 py-2.5 transition-colors whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 ${
                  activeMenu === item.label ? 'text-gray-900' : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                {item.label}
                <span
                  className={`absolute inset-x-4 bottom-1 h-0.5 rounded-full bg-gray-900 transition-opacity ${
                    activeMenu === item.label ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Right: cart + auth + hamburger */}
        <div className="flex shrink-0 items-center gap-1 font-semibold text-sm sm:gap-2 lg:text-[15px]">
          {/* Language toggle — English / Kiswahili. Sets the opuspass_locale
              cookie and refreshes so CMS content re-renders in the chosen language. */}
          <LocaleToggle className="hidden sm:inline-flex" />

          {/* Cart — available signed in or out so guests can build an order pre-signup */}
          <CartMenu />

          {/* Auth — Log in / Sign up when signed out, Dashboard + account when signed in */}
          {authReady && !isSignedIn ? (
            <>
              <Link
                href="/sign-in"
                className="hidden shrink-0 rounded-full px-3.5 py-2 text-xs font-bold whitespace-nowrap text-gray-700 transition-colors hover:bg-gray-100 sm:inline-flex sm:px-5 sm:text-sm lg:px-5.5 lg:py-2.5 lg:text-[15px]"
              >
                {t('auth_login')}
              </Link>
              <Link
                href="/sign-up"
                className="shrink-0 rounded-full bg-(--accent) px-3.5 py-2 text-xs font-bold whitespace-nowrap text-(--on-accent) transition-colors hover:bg-(--accent-hover) sm:px-5 sm:text-sm lg:px-5.5 lg:py-2.5 lg:text-[15px]"
              >
                {t('auth_signup')}
              </Link>
            </>
          ) : authReady ? (
            <>
              <Link
                href="/my/dashboard"
                className="shrink-0 rounded-full bg-(--accent) px-3.5 py-2 text-xs font-bold whitespace-nowrap text-(--on-accent) transition-colors hover:bg-(--accent-hover) sm:px-5 sm:text-sm lg:px-5.5 lg:py-2.5 lg:text-[15px]"
              >
                {t('auth_dashboard')}
              </Link>
              <NotificationsBell />
              <UserButton appearance={{ elements: { avatarBox: 'h-8 w-8' } }} />
            </>
          ) : null}
          <button
            ref={hamburgerRef}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-gray-100 lg:hidden sm:h-10 sm:w-10 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            aria-label={mobileOpen ? t('mobile_close') : t('mobile_open')}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* ── Desktop mega-menu dropdown ── */}
      {activeItem && (
        <div className="hidden lg:block absolute top-full left-0 w-full bg-white border-b border-gray-200 shadow-lg z-40">
          <div className="max-w-6xl mx-auto px-6 py-8 flex gap-10">

            {/* Featured card */}
            <div className="w-[260px] shrink-0 rounded-2xl overflow-hidden flex flex-col border border-gray-200 shadow-md bg-white">
              <div className="relative h-36 overflow-hidden">
                <Image
                  src={activeItem.card.image}
                  alt=""
                  fill
                  sizes="260px"
                  className="object-cover"
                />
              </div>
              <div className="p-5 flex flex-col flex-1">
                <h3 className="text-base font-bold mb-1.5 text-[#1A1A1A] leading-tight">
                  {activeItem.card.title}
                </h3>
                <p className="text-gray-500 text-xs font-medium mb-5 leading-relaxed">
                  {activeItem.card.description}
                </p>
                <Link
                  href={getNavHref(activeItem.card.href)}
                  className="mt-auto inline-flex items-center gap-2 text-[#1A1A1A] font-bold text-sm hover:gap-3 transition-all group"
                >
                  {activeItem.card.linkText}
                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </Link>

              </div>
            </div>

            {/* Link columns */}
            <div className="flex-1 flex gap-10 pt-1">
              {activeItem.columns.map((col, idx) => (
                <div key={idx} className="flex-1 min-w-[180px]">
                  <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400 mb-4 pb-3 border-b border-gray-200">
                    {col.title}
                  </h4>
                  <ul className="space-y-0.5">
                    {col.links.map((link, lIdx) => (
                      <li key={lIdx}>
                        <Link
                          href={getNavHref(link.href)}
                          className="flex items-center gap-3 px-3 py-2 rounded-xl group hover:bg-white transition-colors"
                        >
                          {link.Icon && (
                            <div className="w-7 h-7 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center group-hover:bg-(--accent) group-hover:text-(--on-accent) transition-colors shrink-0">
                              <link.Icon size={13} />
                            </div>
                          )}
                          <span className="font-semibold text-sm text-[#1A1A1A] leading-tight whitespace-nowrap group-hover:text-[#1A1A1A]">
                            {link.label}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Visual support grid */}
            {activeItem.photoGrid ? (
              <div className="shrink-0 w-[240px] pt-1">
                <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400 mb-4 pb-3 border-b border-gray-200">
                  {activeItem.photoGridTitle ?? 'Get Inspired'}
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {activeItem.photoGrid.map((item) => (
                    <Link key={item.label} href={getNavHref(item.href)} className="group flex flex-col gap-1.5">
                      <div className="relative rounded-xl overflow-hidden h-[88px] border border-gray-200">
                        <Image
                          src={item.image}
                          alt=""
                          fill
                          sizes="120px"
                          className="object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                      <span className="font-semibold text-xs text-[#1A1A1A] leading-tight px-0.5">
                        {item.label}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

        </div>
      )}

      {/* ── Mobile: full-screen menu ──
          `invisible` must accompany the off-screen translate: Tailwind v4 compiles
          translate utilities to the standalone `translate` property, which old
          Android WebViews (< Chromium 104, e.g. WhatsApp in-app browsers) ignore —
          without visibility the closed menu covers the page and blocks every tap. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={`lg:hidden fixed inset-0 bg-white z-50 flex flex-col transition-[transform,translate,visibility] duration-300 ease-in-out ${
          mobileOpen ? 'visible translate-y-0' : 'invisible -translate-y-full'
        }`}
      >
        {/* Header — changes based on which panel is active */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          {mobileExpanded ? (
            <button
              onClick={() => setMobileExpanded(null)}
              className="flex items-center gap-2 text-sm font-semibold text-gray-700"
              aria-label={t('mobile_back')}
            >
              <ChevronDown size={18} className="rotate-90" />
              {t('mobile_back')}
            </button>
          ) : (
            <Link href="/" aria-label="OpusPass home" onClick={closeMobile}>
              <Logo />
            </Link>
          )}
          <button
            ref={mobileCloseRef}
            onClick={closeMobile}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            aria-label={t('mobile_close')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Sliding panels container */}
        <div className="flex-1 overflow-hidden relative">
          {/* Panel 1 — main nav list */}
          <div
            className={`absolute inset-0 flex flex-col transition-[transform,translate,visibility] duration-300 ease-in-out ${
              mobileExpanded ? 'invisible -translate-x-full' : 'visible translate-x-0'
            }`}
          >
            <div className="flex-1 overflow-y-auto py-3 px-3">
              {navItems.map((item) => (
                <button
                  key={item.label}
                  className="w-full flex items-center justify-between px-4 py-4 rounded-xl font-semibold text-sm text-gray-800 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                  onClick={() => setMobileExpanded(item.label)}
                >
                  <span>{item.label}</span>
                  <ChevronDown size={16} className="-rotate-90 text-gray-400 shrink-0" />
                </button>
              ))}
            </div>

            {/* Footer CTA — language + auth */}
            <div className="shrink-0 px-4 py-5 border-t border-gray-100 flex flex-col gap-2.5">
              {/* Language toggle — the top-bar one is hidden below sm, so it
                  lives here for mobile/tablet visitors. */}
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-semibold text-gray-500">Language · Lugha</span>
                <LocaleToggle />
              </div>
              {authReady && !isSignedIn ? (
                <>
                  <Link
                    href="/sign-up"
                    onClick={closeMobile}
                    className="w-full text-center bg-(--accent) hover:bg-(--accent-hover) text-(--on-accent) py-3 rounded-full font-bold text-sm transition-colors"
                  >
                    {t('auth_signup')}
                  </Link>
                  <Link
                    href="/sign-in"
                    onClick={closeMobile}
                    className="w-full text-center border border-gray-300 hover:bg-gray-50 text-gray-800 py-3 rounded-full font-bold text-sm transition-colors"
                  >
                    {t('auth_login')}
                  </Link>
                </>
              ) : authReady ? (
                <Link
                  href="/my/dashboard"
                  onClick={closeMobile}
                  className="w-full text-center bg-(--accent) hover:bg-(--accent-hover) text-(--on-accent) py-3 rounded-full font-bold text-sm transition-colors"
                >
                  {t('auth_dashboard')}
                </Link>
              ) : null}
            </div>
          </div>

          {/* Panel 2 — sub-items for the selected section */}
          <div
            className={`absolute inset-0 flex flex-col transition-[transform,translate,visibility] duration-300 ease-in-out ${
              mobileExpanded ? 'visible translate-x-0' : 'invisible translate-x-full'
            }`}
          >
            {(() => {
              const item = navItems.find((i) => i.label === mobileExpanded)
              if (!item) return null
              return (
                <>
                  {/* Section title */}
                  <div className="px-5 pt-3 pb-2 shrink-0">
                    <h2 className="text-xl font-bold text-[#1A1A1A]">
                      {item.label}
                    </h2>
                  </div>

                  <div className="flex-1 overflow-y-auto px-4 pb-6">
                    {/* Featured image banner */}
                    <div className="relative rounded-2xl overflow-hidden h-36 mb-5">
                      <Image
                        src={item.card.image}
                        alt=""
                        fill
                        sizes="100vw"
                        className="object-cover"
                      />
                      <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 px-4 py-4">
                        <p className="text-white text-xs font-medium leading-snug mb-2 opacity-90">
                          {item.card.description}
                        </p>
                        <Link
                          href={getNavHref(item.card.href)}
                          onClick={closeMobile}
                          className="inline-flex items-center gap-1.5 bg-white text-[#1A1A1A] text-xs font-bold px-3 py-1.5 rounded-full"
                        >
                          {item.card.linkText}
                          <ArrowRight size={11} />
                        </Link>
                      </div>
                    </div>

                    {/* Link columns */}
                    {item.columns.map((col, idx) => (
                      <div key={idx} className="mb-5">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-400 mb-2 px-1">
                          {col.title}
                        </p>
                        <ul className="flex flex-col gap-0.5">
                          {col.links.map((link, lIdx) => (
                            <li key={lIdx}>
                              <Link
                                href={getNavHref(link.href)}
                                onClick={closeMobile}
                                className="flex items-center gap-3 px-3 py-3 rounded-xl bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors"
                              >
                                {link.Icon && (
                                  <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-gray-500 shrink-0 shadow-sm">
                                    <link.Icon size={15} />
                                  </div>
                                )}
                                <span className="text-sm font-semibold text-[#1A1A1A] flex-1">{link.label}</span>
                                <ChevronDown size={14} className="-rotate-90 text-gray-300 shrink-0" />
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}

                  </div>
                </>
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
