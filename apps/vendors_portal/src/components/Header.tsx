'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Bell, ChevronRight, ExternalLink, HelpCircle } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { useOnboardingDraft } from '@/lib/onboarding/draft'
import { getStorefrontSections } from '@/lib/storefront/completion'
import { useVendorVertical } from '@/lib/onboarding/vertical-context'
import { bookings } from '@/lib/mock-data'
import { eventDateLabel, relativeDays } from '@/lib/bookings'
import { usePortalT, type Translator } from '@/components/providers/PortalUIStringsProvider'
import { LocaleToggle } from '@/components/LocaleToggle'

function buildSegmentLabels(t: Translator): Record<string, string> {
  return {
    leads: t('nav_leads'),
    storefront: t('nav_storefront'),
    bookings: t('nav_bookings'),
    reviews: t('nav_reviews'),
    'lead-preferences': t('nav_lead_preferences'),
    plans: t('nav_plans'),
    boost: t('nav_boost_storefront'),
    insights: t('nav_insights'),
    help: t('nav_help_center'),
    feedback: t('nav_feedback'),
    settings: t('nav_settings'),
  }
}

type PageHeading = { title: string; subtitle: string }

type HeaderProps = {
  vendorName: string
  // Slug for the live public storefront link rendered in the right rail
  // of the header when viewing /storefront pages. Null when the vendor
  // hasn't published yet — the link is hidden in that case.
  vendorSlug: string | null
}

function buildPageHeadings(t: Translator): Record<string, PageHeading> {
  return {
    '/leads': { title: t('nav_leads'), subtitle: t('page_leads_subtitle') },
    '/reviews': { title: t('nav_reviews'), subtitle: t('page_reviews_subtitle') },
  }
}

function humanize(seg: string): string {
  return seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

type Crumb = { label: string; href: string }

function buildCrumbs(pathname: string, segmentLabels: Record<string, string>): Crumb[] {
  if (pathname === '/') return []
  const segs = pathname.split('/').filter(Boolean)
  return segs.map((seg, i) => ({
    label: segmentLabels[seg] ?? humanize(seg),
    href: '/' + segs.slice(0, i + 1).join('/'),
  }))
}

function useStorefrontHeading(pathname: string, t: Translator): PageHeading | null {
  const { draft, hydrated } = useOnboardingDraft()
  const vertical = useVendorVertical()
  if (!pathname.startsWith('/storefront')) return null
  // Products is a moderation-driven tab, not part of the completeness-tracked
  // onboarding sections, so it isn't in getStorefrontSections — give it a
  // heading here.
  if (pathname.startsWith('/storefront/products')) {
    return { title: 'Products', subtitle: 'The goods couples and guests can buy from your shop.' }
  }
  const fallback = { title: t('storefront_fallback_title'), subtitle: t('storefront_fallback_subtitle') }
  if (!hydrated) return fallback
  const section = getStorefrontSections(draft, vertical).find(
    (s) => pathname === s.href || pathname.startsWith(s.href + '/'),
  )
  if (!section) return fallback
  return { title: section.pageTitle, subtitle: section.pageDescription }
}

function useBookingsHeading(pathname: string, t: Translator): PageHeading | null {
  if (!pathname.startsWith('/bookings')) return null

  if (pathname === '/bookings') {
    return {
      title: t('nav_bookings'),
      subtitle: t('page_bookings_subtitle'),
    }
  }
  if (pathname === '/bookings/calendar') {
    return {
      title: t('page_bookings_calendar_title'),
      subtitle: t('page_bookings_calendar_subtitle'),
    }
  }

  // /bookings/[id]
  const id = pathname.split('/')[2]
  const b = bookings.find((x) => x.id === id)
  if (!b) {
    return { title: t('booking_detail_fallback_title'), subtitle: t('booking_detail_fallback_subtitle') }
  }
  return {
    title: b.couple,
    subtitle: `${eventDateLabel(b.date)} · ${relativeDays(b.date).toLowerCase()} · ${b.packageName}`,
  }
}

export function Header({ vendorName, vendorSlug }: HeaderProps) {
  const pathname = usePathname()
  const t = usePortalT('portal-chrome')
  const crumbs = buildCrumbs(pathname, buildSegmentLabels(t))
  const storefrontHeading = useStorefrontHeading(pathname, t)
  const bookingsHeading = useBookingsHeading(pathname, t)
  const pageHeadings = buildPageHeadings(t)
  const rootHeading =
    pathname === '/' || pathname === '/dashboard'
      ? {
          title: t('greeting_title', { vendorName: vendorName || 'OpusFesta Photography' }),
          subtitle: t('greeting_subtitle'),
        }
      : null
  const heading = rootHeading ?? pageHeadings[pathname] ?? storefrontHeading ?? bookingsHeading
  const isStorefront = pathname.startsWith('/storefront')
  const { user, isLoaded } = useUser()
  const initials = user?.fullName
    ? user.fullName.split(/\s+/).filter(Boolean).map((p: string) => p[0]).join('').slice(0, 2).toUpperCase()
    : (user?.primaryEmailAddress?.emailAddress?.[0] ?? '?').toUpperCase()

  return (
    <header className="flex items-center justify-between py-6 px-8 bg-gray-50/50 relative z-10 w-full shrink-0">
      {heading ? (
        <div className="min-w-0">
          <h1 className="text-2xl lg:text-3xl font-semibold text-gray-900 tracking-tight truncate">
            {heading.title}
          </h1>
          <p className="text-sm text-gray-500 mt-1 truncate">{heading.subtitle}</p>
        </div>
      ) : (
        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex items-center gap-1.5 text-sm text-gray-500 truncate">
            {crumbs.map((c, i) => {
              const isLast = i === crumbs.length - 1
              return (
                <li key={c.href} className="flex items-center gap-1.5 min-w-0">
                  {i > 0 && (
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" aria-hidden />
                  )}
                  {isLast ? (
                    <span className="font-semibold text-gray-900 truncate">{c.label}</span>
                  ) : (
                    <Link
                      href={c.href}
                      className="hover:text-gray-900 transition-colors truncate"
                    >
                      {c.label}
                    </Link>
                  )}
                </li>
              )
            })}
          </ol>
        </nav>
      )}

      <div className="flex items-center gap-4 shrink-0">
        {isStorefront && vendorSlug ? (
          <a
            href={`${(process.env.NEXT_PUBLIC_WEBSITE_URL ?? '').replace(/\/$/, '')}/vendors/${encodeURIComponent(vendorSlug)}`}
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 border border-gray-200 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-white transition-colors"
          >
            {t('view_public_storefront')}
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        ) : null}

        <LocaleToggle />

        <button data-opus-button="control"
          type="button"
          aria-label={t('aria_help')}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <HelpCircle className="w-5 h-5" />
        </button>

        <button data-opus-button="control"
          type="button"
          aria-label={t('aria_notifications')}
          className="relative text-gray-400 hover:text-gray-600 transition-colors"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-0 right-0.5 w-2 h-2 bg-red-500 border-2 border-gray-50 rounded-full" />
        </button>

        {isLoaded && (
          <Link
            href="/settings"
            aria-label={t('aria_profile_settings')}
            className="shrink-0"
          >
            {user?.imageUrl ? (
              <Image
                src={user.imageUrl}
                alt={user.fullName ?? 'Profile'}
                width={40}
                height={40}
                className="w-10 h-10 rounded-full object-cover ring-2 ring-white shadow-sm hover:ring-[#C9A0DC] transition-all"
              />
            ) : (
              <div className="w-10 h-10 rounded-full ring-2 ring-white shadow-sm bg-[#F0DFF6] text-[#7E5896] font-bold flex items-center justify-center text-sm hover:ring-[#C9A0DC] transition-all">
                {initials}
              </div>
            )}
          </Link>
        )}
      </div>
    </header>
  )
}
