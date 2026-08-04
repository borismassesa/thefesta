'use client'

import { useTransition, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import {
  Eye,
  ExternalLink,
  Grid3X3,
  HelpCircle,
  Heart,
  Mail,
  Megaphone,
  PanelTop,
  Save,
  Send,
  Sparkles,
  Ticket,
  Trash2,
  Wallet,
  ListChecks,
} from 'lucide-react'
import { useSetPageHeading } from '@/components/PageHeading'
import { HeaderActionsSlot, HeaderBadgeSlot } from '@/components/HeaderPortals'
import { CmsSecondarySidebar, type CmsSection } from '@/components/cms/CmsSecondarySidebar'
import { EditorActionsProvider, useEditorActions } from './EditorActionsContext'
import { getOpusPassDigitalCardsPreviewUrl } from './preview-action'

// Product data and storefront copy share this section navigation so editors
// can move between card inventory, ticket designs, and marketing content.
const sections: CmsSection[] = [
  {
    key: 'products',
    label: 'Cards',
    icon: Mail,
    href: '/cms/opus-pass/digital-cards/products',
    status: 'live',
    description: 'Digital card catalog — designs, prices, designer and details per card.',
  },
  {
    key: 'ticket',
    label: 'Ticket',
    icon: Ticket,
    // Sibling surface outside /digital-cards — it reuses this layout via
    // cms/opus-pass/ticket/layout.tsx, so it needs an entry here to get its
    // own heading (and to be reachable from this sidebar at all).
    href: '/cms/opus-pass/ticket',
    status: 'live',
    description: 'Entrance-pass ticket designs: the QR and barcode ticket SVGs, palettes and designer.',
  },
  {
    key: 'packages',
    label: 'Packages',
    icon: Wallet,
    href: '/cms/opus-pass/digital-cards/packages',
    status: 'live',
    description: 'Per-guest tiers, prices and the "package includes" matrix on the card detail page.',
  },
  {
    key: 'addons-faq',
    label: 'Add-ons & FAQ',
    icon: ListChecks,
    href: '/cms/opus-pass/digital-cards/addons-faq',
    status: 'live',
    description: 'Optional add-ons cards and FAQ accordion on the card detail page.',
  },
  {
    key: 'categories',
    label: 'Categories',
    icon: Grid3X3,
    href: '/cms/opus-pass/digital-cards/categories',
    status: 'live',
    description: '"Digital Cards for Every Moment" section header above the Shop-By-Category grid.',
  },
  {
    key: 'editors-picks',
    label: "Editor's Picks",
    icon: Heart,
    href: '/cms/opus-pass/digital-cards/editors-picks',
    status: 'live',
    description: 'Editorial product grid — row titles and alignment direction.',
  },
  {
    key: 'features',
    label: 'Feature Row',
    icon: Sparkles,
    href: '/cms/opus-pass/digital-cards/features',
    status: 'live',
    description: 'Benefit cards below the picks grid: section heading, subheading and each card.',
  },
  {
    key: 'promo-banner',
    label: 'Promo Banner',
    icon: Megaphone,
    href: '/cms/opus-pass/digital-cards/promo-banner',
    status: 'live',
    description: 'Sitewide catalog promo strip — discount text + promo code.',
  },
  {
    key: 'faqs',
    label: 'FAQs',
    icon: HelpCircle,
    href: '/cms/opus-pass/digital-cards/faqs',
    status: 'live',
    description: 'Frequently asked questions — section heading plus add/remove Q&A pairs.',
  },
  {
    key: 'navbar',
    label: 'Navbar',
    icon: PanelTop,
    href: '/cms/opus-pass/digital-cards/navbar',
    status: 'live',
    description: 'Mega-menu labels & links shown in the top navigation.',
  },
]

// Public page each section edits, used by "View live site" and "Preview
// draft". Most sections live on the /digital-cards landing page; only the
// exceptions are listed here. `null` means the section has no public page,
// so both buttons are hidden: the ticket editor's products (p23/p24) do not
// exist until someone saves them, so any link would land on a 404.
const DEFAULT_PUBLIC_PATH = '/digital-cards'
const SECTION_PUBLIC_PATH: Record<string, string | null> = {
  ticket: null,
}

export default function OpusPassDigitalCardsCmsLayout({ children }: { children: ReactNode }) {
  return (
    <EditorActionsProvider>
      <OpusPassDigitalCardsCmsShell>{children}</OpusPassDigitalCardsCmsShell>
    </EditorActionsProvider>
  )
}

function OpusPassDigitalCardsCmsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  // opus_pass is mounted under basePath '/opuspass'.
  const opusPassUrl = `${process.env.NEXT_PUBLIC_OPUS_PASS_URL ?? 'http://localhost:3008'}`
  const activeSection = sections.find((s) => s.href && pathname.startsWith(s.href)) ?? sections[0]
  // `??` would swallow an explicit null, so check for the key instead.
  const publicPath =
    activeSection.key in SECTION_PUBLIC_PATH
      ? SECTION_PUBLIC_PATH[activeSection.key]
      : DEFAULT_PUBLIC_PATH

  useSetPageHeading({
    title: activeSection.label,
    subtitle: activeSection.description ?? undefined,
  })

  return (
    <>
      <HeaderBadgeSlot>
        <EditorStatusBadge />
      </HeaderBadgeSlot>
      <HeaderActionsSlot>
        <EditorActionButtons />
        {publicPath && (
          <>
            <PreviewDraftButton path={publicPath} />
            <a
              href={`${opusPassUrl}${publicPath}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              View live site
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </>
        )}
      </HeaderActionsSlot>

      <CmsSecondarySidebar title="Digital Cards" sections={sections} pathname={pathname} />

      <div className="px-8 pt-2 pb-6">{children}</div>
    </>
  )
}

function EditorStatusBadge() {
  const { bound } = useEditorActions()
  // Only an actionable state shows a pill; a fully-published section shows
  // none — the "Published — changes are live." message already says it's live.
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
        <button
          type="button"
          onClick={onDiscard}
          disabled={pending}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" />
          Discard
        </button>
      )}
      <button
        type="button"
        onClick={onSaveDraft}
        disabled={pending}
        className="flex items-center gap-1.5 text-sm font-medium text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        <Save className="w-4 h-4" />
        Save draft
      </button>
      <button
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

function PreviewDraftButton({ path }: { path: string }) {
  const [pending, startTransition] = useTransition()
  const openPreview = () =>
    startTransition(async () => {
      const url = await getOpusPassDigitalCardsPreviewUrl(path)
      if (!url) {
        console.warn('OPUS_PASS_PREVIEW_TOKEN env var missing — preview disabled.')
        window.alert('Preview unavailable: OPUS_PASS_PREVIEW_TOKEN is not configured on this environment.')
        return
      }
      window.open(url, '_blank', 'noopener,noreferrer')
    })
  return (
    <button
      type="button"
      onClick={openPreview}
      disabled={pending}
      className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
    >
      <Eye className="w-3.5 h-3.5" />
      Preview draft
    </button>
  )
}
