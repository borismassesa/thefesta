'use client'

import { type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import {
  PanelTop,
  LayoutDashboard,
  ShieldCheck,
  Settings,
  Star,
  Inbox,
  CalendarCheck,
  LogIn,
  Building2,
  Package,
  Wrench,
  HelpCircle,
  Images,
  CalendarDays,
  Save,
  Send,
  Trash2,
  ListChecks,
} from 'lucide-react'
import { useSetPageHeading } from '@/components/PageHeading'
import { HeaderActionsSlot, HeaderBadgeSlot } from '@/components/HeaderPortals'
import { CmsSecondarySidebar, type CmsSection } from '@/components/cms/CmsSecondarySidebar'
import { EditorActionsProvider, useEditorActions } from './EditorActionsContext'

const sections: CmsSection[] = [
  {
    key: 'portal-chrome',
    label: 'Portal chrome',
    icon: PanelTop,
    href: '/cms/vendors-portal/site-ui/portal-chrome',
    status: 'live',
    description: 'Sidebar nav labels, section dividers, header greeting and page headings — bilingual.',
  },
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    href: '/cms/vendors-portal/site-ui/dashboard',
    status: 'live',
    description: 'Vendor dashboard status banners, section headers, stat labels and empty-state chart copy — bilingual. Vendor data (actual counts/amounts) is not editable here.',
  },
  {
    key: 'verify',
    label: 'Verification (/verify)',
    icon: ShieldCheck,
    href: '/cms/vendors-portal/site-ui/verify',
    status: 'live',
    description: 'The full vendor verification journey — timeline steps, document upload, agreement signing and identity capture — bilingual. The legal agreement text itself is not editable here.',
  },
  {
    key: 'settings',
    label: 'Settings',
    icon: Settings,
    href: '/cms/vendors-portal/site-ui/settings',
    status: 'live',
    description: 'Account and business section labels, phone-field copy and status pills — bilingual. The vendor’s own name/email/category are not editable here.',
  },
  {
    key: 'reviews',
    label: 'Reviews',
    icon: Star,
    href: '/cms/vendors-portal/site-ui/reviews',
    status: 'live',
    description: 'Review status banners, stats card, invite card, sort/filter bar, empty states and reply UI — bilingual. The couples’ actual review text is not editable here.',
  },
  {
    key: 'leads',
    label: 'Leads',
    icon: Inbox,
    href: '/cms/vendors-portal/site-ui/leads',
    status: 'live',
    description: 'Lead pipeline tabs, filters, reply/proposal/decline UI, toasts and empty states — bilingual. The couples’ own messages/data are not editable here.',
  },
  {
    key: 'bookings',
    label: 'Bookings',
    icon: CalendarCheck,
    href: '/cms/vendors-portal/site-ui/bookings',
    status: 'live',
    description: 'Booking pipeline table, calendar (month/week/day views), and detail page chrome — bilingual. The couples’ own data and amounts are not editable here.',
  },
  {
    key: 'auth',
    label: 'Sign in / Sign up',
    icon: LogIn,
    href: '/cms/vendors-portal/site-ui/auth',
    status: 'live',
    description: 'Sign-in and sign-up screen copy — bilingual.',
  },
  {
    key: 'storefront-chrome',
    label: 'Storefront — Publish bar',
    icon: Send,
    href: '/cms/vendors-portal/site-ui/storefront-chrome',
    status: 'live',
    description: 'Sticky unpublished-changes banner shown across every storefront editor tab — bilingual.',
  },
  {
    key: 'storefront-about',
    label: 'Storefront — About',
    icon: Building2,
    href: '/cms/vendors-portal/site-ui/storefront-about',
    status: 'live',
    description: 'Storefront editor "About" tab chrome — bilingual.',
  },
  {
    key: 'storefront-packages',
    label: 'Storefront — Packages',
    icon: Package,
    href: '/cms/vendors-portal/site-ui/storefront-packages',
    status: 'live',
    description: 'Storefront editor "Packages" tab chrome — bilingual.',
  },
  {
    key: 'storefront-services',
    label: 'Storefront — Services',
    icon: Wrench,
    href: '/cms/vendors-portal/site-ui/storefront-services',
    status: 'live',
    description: 'Storefront editor "Services" tab chrome — bilingual.',
  },
  {
    key: 'storefront-faq',
    label: 'Storefront — FAQ',
    icon: HelpCircle,
    href: '/cms/vendors-portal/site-ui/storefront-faq',
    status: 'live',
    description: 'Storefront editor "FAQ" tab chrome — bilingual.',
  },
  {
    key: 'storefront-photos-team',
    label: 'Storefront — Photos & team',
    icon: Images,
    href: '/cms/vendors-portal/site-ui/storefront-photos-team',
    status: 'live',
    description: 'Storefront editor "Photos", "Team" and "Recognition" tabs chrome — bilingual.',
  },
  {
    key: 'storefront-availability',
    label: 'Storefront — Availability',
    icon: CalendarDays,
    href: '/cms/vendors-portal/site-ui/storefront-availability',
    status: 'live',
    description: 'Storefront editor "Availability" and booking-config tab chrome — bilingual.',
  },
  {
    key: 'onboarding',
    label: 'Onboarding wizard',
    icon: ListChecks,
    href: '/cms/vendors-portal/site-ui/onboarding',
    status: 'live',
    description: 'Every screen in the vendor application wizard — category, vows, profile, pricing, and review — bilingual. Migrated from a static dictionary; the existing Swahili translations were seeded in, not lost.',
  },
]

export default function VendorsPortalSiteUiCmsLayout({ children }: { children: ReactNode }) {
  return (
    <EditorActionsProvider>
      <Shell>{children}</Shell>
    </EditorActionsProvider>
  )
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const activeSection = sections.find((s) => s.href && pathname.startsWith(s.href)) ?? sections[0]

  useSetPageHeading({
    title: `Site UI — ${activeSection.label}`,
    subtitle: activeSection.description ?? undefined,
  })

  return (
    <>
      <HeaderBadgeSlot>
        <EditorStatusBadge />
      </HeaderBadgeSlot>
      <HeaderActionsSlot>
        <EditorActionButtons />
      </HeaderActionsSlot>

      <CmsSecondarySidebar title="Site UI" sections={sections} pathname={pathname} />

      <div className="px-8 pt-2 pb-6">{children}</div>
    </>
  )
}

function EditorStatusBadge() {
  const { bound } = useEditorActions()
  if (!bound || !bound.hasDraft) return null
  return (
    <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">
      Unpublished draft
    </span>
  )
}

function EditorActionButtons() {
  const { bound } = useEditorActions()
  if (!bound) return null
  const { hasDraft, pending, message, error, onSaveDraft, onPublish, onDiscard } = bound
  return (
    <>
      {error ? (
        <span className="text-xs text-red-600 font-medium mr-1 max-w-[420px] truncate" title={error}>
          {error}
        </span>
      ) : (
        message && <span className="text-xs text-gray-500 mr-1">{message}</span>
      )}
      {hasDraft && (
        <button data-opus-button="control"
          type="button"
          onClick={onDiscard}
          disabled={pending}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" />
          Discard
        </button>
      )}
      <button data-opus-button="control"
        type="button"
        onClick={onSaveDraft}
        disabled={pending}
        className="flex items-center gap-1.5 text-sm font-medium text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        <Save className="w-4 h-4" />
        Save draft
      </button>
      <button data-opus-button="primary" data-opus-button-size="small"
        type="button"
        onClick={onPublish}
        disabled={pending}
        className="flex items-center gap-1.5 text-sm font-semibold text-white bg-[#C9A0DC] hover:bg-[#b97fd0] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
      >
        <Send className="w-4 h-4" />
        Publish
      </button>
    </>
  )
}
