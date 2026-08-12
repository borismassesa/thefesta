'use client'

import { useTransition, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import {
  Eye,
  ExternalLink,
  HelpCircle,
  LayoutPanelTop,
  MessageSquareQuote,
  PanelTop,
  Save,
  Send,
  Sparkles,
  Star,
  Trash2,
  Wand2,
} from 'lucide-react'
import { useSetPageHeading } from '@/components/PageHeading'
import { HeaderActionsSlot, HeaderBadgeSlot } from '@/components/HeaderPortals'
import { CmsSecondarySidebar, type CmsSection } from '@/components/cms/CmsSecondarySidebar'
import { EditorActionsProvider, useEditorActions } from './EditorActionsContext'
import { getOpusPassWebsitesPreviewUrl } from './preview-action'

const sections: CmsSection[] = [
  {
    key: 'hero',
    label: 'Hero',
    icon: Sparkles,
    href: '/cms/opus-pass/wedding-website/hero',
    status: 'live',
    description: 'Top banner — headline, description, CTAs, trust badge (rating, avatars) and the "as featured in" press strip.',
  },
  {
    key: 'designs',
    label: 'Designs',
    icon: Wand2,
    href: '/cms/opus-pass/wedding-website/designs',
    status: 'live',
    description: '"Pick your wedding website design" — tabs + template cards (name, treatment, tags, photo).',
  },
  {
    key: 'selling-points',
    label: 'Selling Points',
    icon: LayoutPanelTop,
    href: '/cms/opus-pass/wedding-website/selling-points',
    status: 'live',
    description: '"Built to fit your wedding" — magazine grid blocks (heading, body, CTA, image).',
  },
  {
    key: 'features',
    label: 'Features',
    icon: Star,
    href: '/cms/opus-pass/wedding-website/features',
    status: 'live',
    description: '"Create your free website" — peach card row (icon, title, body, CTA, visual).',
  },
  {
    key: 'testimonials',
    label: 'Testimonials',
    icon: MessageSquareQuote,
    href: '/cms/opus-pass/wedding-website/testimonials',
    status: 'live',
    description: 'Two scrolling columns of couple testimonial cards (headline, description, CTA, quote, name, location, avatar).',
  },
  {
    key: 'faqs',
    label: 'FAQs',
    icon: HelpCircle,
    href: '/cms/opus-pass/wedding-website/faqs',
    status: 'live',
    description: 'Frequently asked questions — section heading plus add/remove Q&A pairs.',
  },
  {
    key: 'navbar',
    label: 'Navbar',
    icon: PanelTop,
    href: '/cms/opus-pass/wedding-website/navbar',
    status: 'live',
    description: 'Mega-menu labels & links shown in the top navigation.',
  },
]

export default function OpusPassWeddingWebsiteCmsLayout({ children }: { children: ReactNode }) {
  return (
    <EditorActionsProvider>
      <OpusPassWeddingWebsiteCmsShell>{children}</OpusPassWeddingWebsiteCmsShell>
    </EditorActionsProvider>
  )
}

function OpusPassWeddingWebsiteCmsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  // opus_pass is mounted under basePath '/opuspass'.
  const opusPassUrl = `${process.env.NEXT_PUBLIC_OPUS_PASS_URL ?? 'http://localhost:3008'}`
  const activeSection = sections.find((s) => s.href && pathname.startsWith(s.href)) ?? sections[0]

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
        <PreviewDraftButton />
        <a
          href={`${opusPassUrl}/websites`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          View live site
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </HeaderActionsSlot>

      <CmsSecondarySidebar title="Wedding website" sections={sections} pathname={pathname} />

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

function PreviewDraftButton() {
  const [pending, startTransition] = useTransition()
  const openPreview = () =>
    startTransition(async () => {
      const url = await getOpusPassWebsitesPreviewUrl('/websites')
      if (!url) {
        console.warn('OPUS_PASS_PREVIEW_TOKEN env var missing — preview disabled.')
        window.alert('Preview unavailable: OPUS_PASS_PREVIEW_TOKEN is not configured on this environment.')
        return
      }
      window.open(url, '_blank', 'noopener,noreferrer')
    })
  return (
    <button data-opus-button="control"
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
