'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ExternalLink,
  Heading1,
  Heart,
  Save,
  Send,
  Sparkles,
  Star,
  Tags,
  Trash2,
  ThumbsUp,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { HeaderActionsSlot } from '@/components/HeaderPortals'
import { useSetPageHeading } from '@/components/PageHeading'
import { EditorActionsProvider, useEditorActions } from './EditorActionsContext'

type Section = {
  key: string
  label: string
  icon: LucideIcon
  href: string
  description?: string
}

const sections: Section[] = [
  {
    key: 'hero',
    label: 'Hero',
    icon: Sparkles,
    href: '/cms/advice-and-ideas/hero',
    description: 'Edit the rotating headline, subheadline, and the Start Reading and Latest Stories CTAs.',
  },
  {
    key: 'topics',
    label: 'Topics & Popular Topics',
    icon: Tags,
    href: '/cms/advice-and-ideas/topics',
    description: 'The shared topic list powering the sticky dark strip at the top of the page and the Popular Topics card grid.',
  },
  {
    key: 'section-headers',
    label: 'Section Headers',
    icon: Heading1,
    href: '/cms/advice-and-ideas/section-headers',
    description: 'Titles, subtitles, and "View all" labels for Editor\u2019s Picks, Loved by Couples, Our Favorites, Latest Stories, and Search results.',
  },
  {
    key: 'front-page',
    label: 'Editor Picks',
    icon: Star,
    href: '/cms/advice-and-ideas/front-page',
    description:
      'Pick which articles land on the public front and in what order. Slot 1 is the Trending hero. Slots 2 to 5 are the Editor Picks row beneath it. Empty slots auto-fill with the most recent published articles.',
  },
  {
    key: 'loved-by-couples',
    label: 'Loved by Couples',
    icon: Heart,
    href: '/cms/advice-and-ideas/loved-by-couples',
    description:
      'Four articles that appear in the "Loved by Couples" grid in the middle of the page. Empty slots auto-fill with the most recent published articles.',
  },
  {
    key: 'our-favorites',
    label: 'Our Favorites',
    icon: ThumbsUp,
    href: '/cms/advice-and-ideas/our-favorites',
    description:
      'Four articles in the "Our Favorites" section. Slot 1 is the hero card. Slots 2 to 4 are the smaller stacked cards. Empty slots auto-fill with the most recent published articles.',
  },
]

export default function AdviceIdeasCmsLayout({ children }: { children: ReactNode }) {
  return (
    <EditorActionsProvider>
      <AdviceIdeasCmsShell>{children}</AdviceIdeasCmsShell>
    </EditorActionsProvider>
  )
}

function AdviceIdeasCmsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL ?? 'http://localhost:3006'
  const activeSection =
    sections.find((s) => pathname.startsWith(s.href)) ?? sections[0]

  // Publish the page title + description to the global admin header
  // (the one with bell / help / avatar), so this CMS section reads
  // visually consistent with every other admin page. The cleanup-pass
  // before this used a local sub-header that duplicated the global
  // chrome and pushed content further down the viewport.
  useSetPageHeading({
    title: activeSection.label,
    subtitle: activeSection.description,
  })

  return (
    <div className="pt-2 pb-6">
      {/* Action buttons portal into the global header's actions slot,
          so Save draft / Publish / View live page sit next to the
          help / bell / avatar icons rather than in a second header bar. */}
      <HeaderActionsSlot>
        <ActionButtons />
        <a
          href={`${websiteUrl}/advice-and-ideas`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          View live page
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </HeaderActionsSlot>

      <div className="flex items-start gap-0">
        <aside className="w-[240px] shrink-0 border-r border-gray-100 self-stretch">
          <div className="sticky top-6 px-3 py-1 space-y-5">
            <SectionGroup label="Page">
              {sections.map((s) => (
                <SectionLink key={s.key} section={s} pathname={pathname} />
              ))}
            </SectionGroup>
          </div>
        </aside>

        <section className="flex-1 min-w-0 px-8">{children}</section>
      </div>
    </div>
  )
}

function SectionGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400 px-2 mb-2">
        {label}
      </p>
      <nav className="space-y-0.5">{children}</nav>
    </div>
  )
}

function SectionLink({ section, pathname }: { section: Section; pathname: string }) {
  const Icon = section.icon
  const isActive = pathname.startsWith(section.href)
  return (
    <Link
      href={section.href}
      className={cn(
        'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors',
        isActive ? 'bg-[#F0DFF6] text-[#7E5896]' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
      )}
    >
      <Icon className={cn('w-4 h-4 stroke-[1.5] shrink-0', isActive ? 'text-[#7E5896]' : 'text-gray-400')} />
      <span className="truncate">{section.label}</span>
    </Link>
  )
}

function ActionButtons() {
  const { bound } = useEditorActions()
  if (!bound) return null
  const { hasDraft, pending, message, onSaveDraft, onPublish, onDiscard } = bound
  return (
    <>
      {hasDraft && (
        <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full mr-1 bg-amber-50 text-amber-700">
          Unpublished draft
        </span>
      )}
      {message && <span className="text-xs text-gray-500 mr-1">{message}</span>}
      {hasDraft && (
        <button data-opus-button="control"
          type="button"
          onClick={onDiscard}
          disabled={pending}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" />
          Discard
        </button>
      )}
      <button data-opus-button="control"
        type="button"
        onClick={onSaveDraft}
        disabled={pending}
        className="flex items-center gap-1.5 text-sm font-medium text-gray-700 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        <Save className="w-4 h-4" />
        Save draft
      </button>
      <button data-opus-button="primary" data-opus-button-size="medium"
        type="button"
        onClick={onPublish}
        disabled={pending}
        className="flex items-center gap-1.5 text-sm font-semibold text-white bg-[#C9A0DC] hover:bg-[#b97fd0] px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
      >
        <Send className="w-4 h-4" />
        Publish
      </button>
    </>
  )
}

