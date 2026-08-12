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
  Share2,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useSetPageHeading } from '@/components/PageHeading'
import { HeaderActionsSlot, HeaderBadgeSlot } from '@/components/HeaderPortals'
import { CmsSecondarySidebar, type CmsSection } from '@/components/cms/CmsSecondarySidebar'
import { EditorActionsProvider, useEditorActions } from './EditorActionsContext'
import { getOpusPassGuestsPreviewUrl } from './preview-action'

const sections: CmsSection[] = [
  {
    key: 'hero',
    label: 'Hero',
    icon: Sparkles,
    href: '/cms/opus-pass/guests-rsvps/hero',
    status: 'live',
    description: 'Top banner — headline, description, CTAs, trust cluster and the photo collage.',
  },
  {
    key: 'features',
    label: 'Feature Grid',
    icon: LayoutPanelTop,
    href: '/cms/opus-pass/guests-rsvps/features',
    status: 'live',
    description: 'Bento feature grid header plus the RSVPs / Events / Pledges card copy.',
  },
  {
    key: 'spread-the-joy',
    label: 'Spread the Joy',
    icon: Share2,
    href: '/cms/opus-pass/guests-rsvps/spread-the-joy',
    status: 'live',
    description: 'Ways to share an invitation — icon, title and copy per share method.',
  },
  {
    key: 'testimonials',
    label: 'Testimonials',
    icon: MessageSquareQuote,
    href: '/cms/opus-pass/guests-rsvps/testimonials',
    status: 'live',
    description: 'Testimonial wall — section header, CTA and the two scrolling columns of couple quotes.',
  },
  {
    key: 'faqs',
    label: 'FAQs',
    icon: HelpCircle,
    href: '/cms/opus-pass/guests-rsvps/faqs',
    status: 'live',
    description: 'Guests & RSVPs FAQs — section heading plus add/remove Q&A pairs.',
  },
  {
    key: 'navbar',
    label: 'Navbar',
    icon: PanelTop,
    href: '/cms/opus-pass/guests-rsvps/navbar',
    status: 'live',
    description: 'Mega-menu labels & links shown in the top navigation.',
  },
]

export default function OpusPassGuestsRsvpsCmsLayout({ children }: { children: ReactNode }) {
  return (
    <EditorActionsProvider>
      <OpusPassGuestsRsvpsCmsShell>{children}</OpusPassGuestsRsvpsCmsShell>
    </EditorActionsProvider>
  )
}

function OpusPassGuestsRsvpsCmsShell({ children }: { children: ReactNode }) {
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
          href={`${opusPassUrl}/guests-and-rsvp`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          View live site
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </HeaderActionsSlot>

      <CmsSecondarySidebar title="Guests & RSVPs" sections={sections} pathname={pathname} />

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
      const url = await getOpusPassGuestsPreviewUrl('/guests-and-rsvp')
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
