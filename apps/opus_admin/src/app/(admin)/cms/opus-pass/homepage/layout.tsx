'use client'

import { useEffect, useState, useTransition, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import {
  Eye,
  ExternalLink,
  Heart,
  Images,
  MessageSquareQuote,
  Quote,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSetPageHeading } from '@/components/PageHeading'
import { HeaderActionsSlot, HeaderBadgeSlot } from '@/components/HeaderPortals'
import {
  CmsSecondarySidebar,
  type CmsSection,
  UNSAVED_WARNING,
} from '@/components/cms/CmsSecondarySidebar'
import { EditorActionsProvider, useEditorActions } from './EditorActionsContext'
import { getOpusPassPreviewUrl } from './preview-action'
import { getSectionDraftFlags } from './draft-flags-action'

// Order mirrors the live homepage render order (apps/opus_pass/src/app/page.tsx).
const sections: CmsSection[] = [
  {
    key: 'hero',
    label: 'Hero',
    icon: Sparkles,
    href: '/cms/opus-pass/homepage/hero',
    status: 'live',
    description: 'Centred headline, trust badge, CTAs and the “As featured in” press strip.',
  },
  {
    key: 'showcase',
    label: 'Photo Showcase',
    icon: Images,
    href: '/cms/opus-pass/homepage/showcase',
    status: 'live',
    description: 'Pinterest-style photo masonry — photos, caption card, pill labels and accent colour.',
  },
  {
    key: 'why-opus-pass',
    label: 'Why OpusPass',
    icon: Heart,
    href: '/cms/opus-pass/homepage/why-opus-pass',
    status: 'live',
    description: 'Headline, photo with floating chips, and the "planning that feels effortless" copy + buttons.',
  },
  {
    key: 'features',
    label: 'Features',
    icon: Star,
    href: '/cms/opus-pass/homepage/features',
    status: 'live',
    description: 'Built for every wedding moment — section header plus alternating feature blocks.',
  },
  {
    key: 'testimonials',
    label: 'Testimonials',
    icon: MessageSquareQuote,
    href: '/cms/opus-pass/homepage/testimonials',
    status: 'live',
    description: 'Two-column vertical-scroll wall of couple testimonials with avatars, stars and contrast cards.',
  },
  {
    key: 'manifesto',
    label: 'Manifesto',
    icon: Quote,
    href: '/cms/opus-pass/homepage/manifesto',
    status: 'live',
    description: 'Brand statement sentence — editable text segments plus the inline images.',
  },
  {
    key: 'promises',
    label: 'Quality Promises',
    icon: ShieldCheck,
    href: '/cms/opus-pass/homepage/promises',
    status: 'live',
    description: 'Four-pillar trust strip with icons, titles and short descriptions.',
  },
]

export default function OpusPassHomepageCmsLayout({ children }: { children: ReactNode }) {
  return (
    <EditorActionsProvider>
      <OpusPassHomepageCmsShell>{children}</OpusPassHomepageCmsShell>
    </EditorActionsProvider>
  )
}

function OpusPassHomepageCmsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { bound } = useEditorActions()
  const isDirty = bound?.isDirty ?? false
  const hasDraft = bound?.hasDraft ?? false

  // Warn before the tab closes / hard-navigates away with unsaved edits.
  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = UNSAVED_WARNING
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  // Which sections have an unpublished draft (amber dot in the sidebar).
  // Refetched whenever the active editor's draft state flips (save/publish/discard).
  const [draftSections, setDraftSections] = useState<string[]>([])
  useEffect(() => {
    let cancelled = false
    getSectionDraftFlags().then((keys) => {
      if (!cancelled) setDraftSections(keys)
    })
    return () => {
      cancelled = true
    }
  }, [hasDraft])
  // opus_pass is mounted under basePath '/opuspass' — link straight to it.
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
          href={opusPassUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          View live site
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </HeaderActionsSlot>

      <CmsSecondarySidebar
        title="Homepage"
        sections={sections}
        pathname={pathname}
        draft={{
          isDirty,
          activeSectionKey: activeSection.key,
          hasDraft,
          draftSections,
        }}
      />

      <div className="px-8 pt-2 pb-6">{children}</div>
    </>
  )
}

function EditorStatusBadge() {
  const { bound } = useEditorActions()
  const { hasDraft, isDirty } = bound ?? {}
  // Only an actionable state shows a pill; a fully-published section shows
  // none — the "Published — changes are live." message already says it's live.
  if (!isDirty && !hasDraft) return null
  return (
    <span
      className={cn(
        'inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full',
        isDirty ? 'bg-orange-50 text-orange-700' : 'bg-amber-50 text-amber-700'
      )}
    >
      {isDirty ? 'Unsaved changes' : 'Unpublished draft'}
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
          onClick={() => {
            if (window.confirm('Discard this draft? Unpublished changes will be lost.')) onDiscard()
          }}
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
      const url = await getOpusPassPreviewUrl('/')
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
