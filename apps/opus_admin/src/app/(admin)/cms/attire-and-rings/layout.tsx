'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BookOpen,
  ExternalLink,
  Gem,
  Grid2x2,
  Heart,
  Image,
  LayoutGrid,
  Percent,
  Save,
  Send,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSetPageHeading } from '@/components/PageHeading'
import { HeaderActionsSlot, HeaderBadgeSlot } from '@/components/HeaderPortals'
import { EditorActionsProvider, useEditorActions } from './EditorActionsContext'

type Section = {
  key: string
  label: string
  icon: LucideIcon
  href: string
  status: 'live' | 'soon'
  description?: string
}

const sections: Section[] = [
  {
    key: 'hero',
    label: 'Hero',
    icon: Sparkles,
    href: '/cms/attire-and-rings/hero',
    status: 'live',
    description: 'Main hero banner. Headline, description, CTA button, and two images.',
  },
  {
    key: 'categories',
    label: 'Trending Categories',
    icon: LayoutGrid,
    href: '/cms/attire-and-rings/categories',
    status: 'live',
    description: 'Section title and the 6 trending category cards shown at the top of the page.',
  },
  {
    key: 'gift-section',
    label: 'Featured Collection',
    icon: Gem,
    href: '/cms/attire-and-rings/gift-section',
    status: 'live',
    description: 'OpusFesta-special collection block. Heading, CTA, and three featured items.',
  },
  {
    key: 'accessories',
    label: 'Accessories',
    icon: Grid2x2,
    href: '/cms/attire-and-rings/accessories',
    status: 'live',
    description: 'Pill-style accessory category row. Heading and list of accessory items.',
  },
  {
    key: 'loved-categories',
    label: 'Loved Categories',
    icon: Heart,
    href: '/cms/attire-and-rings/loved-categories',
    status: 'live',
    description: 'Most-loved category grid. Title and the 6 category cards.',
  },
  {
    key: 'deals',
    label: 'Deals',
    icon: Percent,
    href: '/cms/attire-and-rings/deals',
    status: 'live',
    description: "Today's big deals carousel. Heading and deal cards with prices and discounts.",
  },
  {
    key: 'editors-picks',
    label: "Editors' Picks",
    icon: Star,
    href: '/cms/attire-and-rings/editors-picks',
    status: 'live',
    description: 'Curated photo grid. Eyebrow, heading, CTA, and two rows of pick images.',
  },
  {
    key: 'standout-styles',
    label: 'Standout Styles',
    icon: ShoppingBag,
    href: '/cms/attire-and-rings/standout-styles',
    status: 'live',
    description: 'Sale styles strip. Section heading and up to 5 items with discount text.',
  },
  {
    key: 'local-shops',
    label: 'Local Shops',
    icon: Store,
    href: '/cms/attire-and-rings/local-shops',
    status: 'live',
    description: 'Local shop discovery section. Eyebrow, heading, CTA, and shop cards.',
  },
  {
    key: 'blog',
    label: 'Blog',
    icon: BookOpen,
    href: '/cms/attire-and-rings/blog',
    status: 'live',
    description: 'Featured blog articles. Section heading and up to 3 article cards.',
  },
]

export default function AttireAndRingsCmsLayout({ children }: { children: ReactNode }) {
  return (
    <EditorActionsProvider>
      <AttireAndRingsCmsShell>{children}</AttireAndRingsCmsShell>
    </EditorActionsProvider>
  )
}

function AttireAndRingsCmsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL ?? 'http://localhost:3007'
  const activeSection = sections.find((s) => pathname.startsWith(s.href)) ?? sections[0]

  const liveSections = sections.filter((s) => s.status === 'live')
  const soonSections = sections.filter((s) => s.status === 'soon')

  useSetPageHeading({
    title: activeSection.label,
    subtitle: activeSection.description ?? undefined,
  })

  return (
    <div className="pt-2 pb-6">
      <HeaderBadgeSlot>
        <EditorStatusBadge />
      </HeaderBadgeSlot>
      <HeaderActionsSlot>
        <EditorActionButtons />
        <a
          href={`${websiteUrl}/attire-and-rings`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          View live page
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </HeaderActionsSlot>

      <div className="flex items-start gap-0">
        <aside className="w-[240px] shrink-0 border-r border-gray-100 self-stretch">
          <div className="sticky top-6 px-3 py-1 space-y-5">
            <SectionGroup label="Sections">
              {liveSections.map((s) => (
                <SectionLink key={s.key} section={s} pathname={pathname} />
              ))}
            </SectionGroup>

            {soonSections.length > 0 && (
              <SectionGroup label="Coming soon">
                {soonSections.map((s) => (
                  <SectionItemSoon key={s.key} section={s} />
                ))}
              </SectionGroup>
            )}
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
        isActive
          ? 'bg-[#F0DFF6] text-[#7E5896]'
          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
      )}
    >
      <Icon className={cn('w-4 h-4 stroke-[1.5] shrink-0', isActive ? 'text-[#7E5896]' : 'text-gray-400')} />
      <span className="truncate">{section.label}</span>
    </Link>
  )
}

function SectionItemSoon({ section }: { section: Section }) {
  const Icon = section.icon
  return (
    <div
      className="flex items-center gap-2.5 px-2.5 py-2 text-sm text-gray-400 cursor-not-allowed select-none"
      title="Coming soon"
    >
      <Icon className="w-4 h-4 stroke-[1.5] shrink-0 text-gray-300" />
      <span className="truncate">{section.label}</span>
    </div>
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
