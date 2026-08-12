'use client'

import { type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { PanelTop, PanelBottom, LifeBuoy, Receipt, ShoppingCart, MapPin, CheckCircle2, CreditCard, Smartphone, ReceiptText, UserPlus, MailCheck, HandCoins, LayoutDashboard, Package, CalendarDays, Armchair, Megaphone, Save, Send, Trash2, ListFilter, HeartHandshake } from 'lucide-react'
import { useSetPageHeading } from '@/components/PageHeading'
import { HeaderActionsSlot, HeaderBadgeSlot } from '@/components/HeaderPortals'
import { CmsSecondarySidebar, type CmsSection } from '@/components/cms/CmsSecondarySidebar'
import { EditorActionsProvider, useEditorActions } from './EditorActionsContext'

const sections: CmsSection[] = [
  {
    key: 'navbar',
    label: 'Navbar (shared)',
    icon: PanelTop,
    href: '/cms/opus-pass/site-ui/navbar',
    status: 'live',
    description:
      'Shared navbar chrome — auth buttons and mobile menu controls. Each product’s mega-menu is edited in that product’s CMS.',
  },
  {
    key: 'footer',
    label: 'Footer',
    icon: PanelBottom,
    href: '/cms/opus-pass/site-ui/footer',
    status: 'live',
    description: 'Footer column headings, link labels, legal links and copyright — bilingual.',
  },
  {
    key: 'help',
    label: 'Help page',
    icon: LifeBuoy,
    href: '/cms/opus-pass/site-ui/help',
    status: 'live',
    description: 'Help Centre header, topic cards, FAQs and the contact CTA — bilingual.',
  },
  {
    key: 'pricing',
    label: 'Pricing page',
    icon: Receipt,
    href: '/cms/opus-pass/site-ui/pricing',
    status: 'live',
    description:
      'Pricing hero, tier badges, included/upgrade copy, ways to pay, security notes and FAQs — bilingual. Tier prices stay in the Packages CMS.',
  },
  {
    key: 'cart',
    label: 'Cart',
    icon: ShoppingCart,
    href: '/cms/opus-pass/site-ui/cart',
    status: 'live',
    description:
      'Cart heading, line-item labels, coupon box, price details, checkout CTA and cross-sell copy — bilingual. Prices and math are not editable here.',
  },
  {
    key: 'address',
    label: 'Delivery address',
    icon: MapPin,
    href: '/cms/opus-pass/site-ui/address',
    status: 'live',
    description:
      'Delivery address form — mode cards, field labels, validation messages and the "what to expect" checklist — bilingual.',
  },
  {
    key: 'confirmation',
    label: 'Order confirmation',
    icon: CheckCircle2,
    href: '/cms/opus-pass/site-ui/confirmation',
    status: 'live',
    description:
      'Order confirmation — success header, payment status card, order summary, "what happens next" and actions — bilingual.',
  },
  {
    key: 'checkout-form',
    label: 'Checkout — form',
    icon: CreditCard,
    href: '/cms/opus-pass/site-ui/checkout-form',
    status: 'live',
    description:
      'Checkout page heading, contact recap, manual-payment form fields and validation messages — bilingual. Payment logic, amounts and provider IDs are not editable here.',
  },
  {
    key: 'checkout-payment',
    label: 'Checkout — payment',
    icon: Smartphone,
    href: '/cms/opus-pass/site-ui/checkout-payment',
    status: 'live',
    description:
      'Payment method copy, M-Pesa Lipa Namba USSD steps (bilingual), card panel, pay-button states and security lines — bilingual. Network IDs, dial codes and amounts are fixed.',
  },
  {
    key: 'checkout-summary',
    label: 'Checkout — summary',
    icon: ReceiptText,
    href: '/cms/opus-pass/site-ui/checkout-summary',
    status: 'live',
    description:
      'Checkout order summary card, "ready in 48-72 hours" and "one free revision" tiles and the secure-payment note — bilingual. Prices and math are not editable here.',
  },
  {
    key: 'forms-collect',
    label: 'Collect form',
    icon: UserPlus,
    href: '/cms/opus-pass/site-ui/forms-collect',
    status: 'live',
    description:
      'Guest contact collector — field labels, validation, send-button and success copy — bilingual. The headings, intro and button label come from the couple’s page config.',
  },
  {
    key: 'forms-rsvp',
    label: 'RSVP form',
    icon: MailCheck,
    href: '/cms/opus-pass/site-ui/forms-rsvp',
    status: 'live',
    description:
      'Public RSVP form — header, RSVP status options, attending extras, submitted/empty states and the send button — bilingual.',
  },
  {
    key: 'forms-pledge',
    label: 'Pledge form',
    icon: HandCoins,
    href: '/cms/opus-pass/site-ui/forms-pledge',
    status: 'live',
    description:
      'Contribution pledge form — field labels, validation, payment-card heading, send-button and success copy — bilingual. Payment methods/instructions come from the couple’s config.',
  },
  {
    key: 'dashboard-chrome',
    label: 'Dashboard chrome',
    icon: LayoutDashboard,
    href: '/cms/opus-pass/site-ui/dashboard-chrome',
    status: 'live',
    description:
      'Couple dashboard shell — sidebar nav labels, collapse/menu controls and the account menu — bilingual. Routing, icons and the couple’s name/email are not editable here.',
  },
  {
    key: 'dashboard-orders',
    label: 'Dashboard — Orders',
    icon: Package,
    href: '/cms/opus-pass/site-ui/dashboard-orders',
    status: 'live',
    description:
      'Couple dashboard Orders page — header, empty state, stat cards, order-tracker notes, unit labels and the invoice button — bilingual. Order data and stage labels are not editable here.',
  },
  {
    key: 'dashboard-events',
    label: 'Dashboard — Events',
    icon: CalendarDays,
    href: '/cms/opus-pass/site-ui/dashboard-events',
    status: 'live',
    description:
      'Couple dashboard Events page — list, create/edit form, live preview and toasts — bilingual. Event data and event-type names are not editable here.',
  },
  {
    key: 'dashboard-seating',
    label: 'Dashboard — Seating',
    icon: Armchair,
    href: '/cms/opus-pass/site-ui/dashboard-seating',
    status: 'live',
    description:
      'Couple dashboard Seat collection page — header, stat tiles, guest pool, table cards, dialogs, toasts and the exported plan text — bilingual. Guest and table data are not editable here.',
  },
  {
    key: 'dashboard-send',
    label: 'Dashboard — Send invites',
    icon: Megaphone,
    href: '/cms/opus-pass/site-ui/dashboard-send',
    status: 'live',
    description:
      'Couple dashboard Send invites page — heading, card context, send funnel, public-link and personal-invite modes, guest table and all toasts — bilingual.',
  },
  {
    key: 'dashboard-thank-you',
    label: 'Dashboard — Thank you',
    icon: HeartHandshake,
    href: '/cms/opus-pass/site-ui/dashboard-thank-you',
    status: 'live',
    description:
      'Couple dashboard Thank You page — heading, thank-you card picker (with unlock request for Classic/Essential), guest table, confirm dialog, preview/test send and results drawer — bilingual.',
  },
  {
    key: 'dashboard-event-scope',
    label: 'Dashboard — Event chooser',
    icon: ListFilter,
    href: '/cms/opus-pass/site-ui/dashboard-event-scope',
    status: 'live',
    description:
      'Shared "choose an event" screen and header switcher used by the event-scoped dashboard pages (Pledges, Send invites, Guest list, RSVPs, Seat collection) — bilingual.',
  },
]

export default function OpusPassSiteUiCmsLayout({ children }: { children: ReactNode }) {
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
