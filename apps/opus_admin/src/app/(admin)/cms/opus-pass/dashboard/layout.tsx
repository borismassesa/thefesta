'use client'

import { type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ClipboardCheck,
  ExternalLink,
  Globe2,
  HandCoins,
  LayoutDashboard,
  Save,
  Send,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSetPageHeading } from '@/components/PageHeading'
import { HeaderActionsSlot, HeaderBadgeSlot, SecondarySidebarSlot } from '@/components/HeaderPortals'
import {
  DASHBOARD_HERO_LABEL,
  DASHBOARD_HERO_PUBLIC_PATH,
  DASHBOARD_HERO_SLUGS,
  type DashboardHeroSlug,
} from '@/lib/cms/opus-pass-dashboard-hero'
import { EditorActionsProvider, useEditorActions } from './EditorActionsContext'

const ICONS: Record<DashboardHeroSlug, LucideIcon> = {
  home: LayoutDashboard,
  invitations: Send,
  guests: Users,
  rsvps: ClipboardCheck,
  website: Globe2,
  pledges: HandCoins,
}

type SectionKey = 'hero' | 'copy'

const SECTION_LABEL: Record<SectionKey, string> = {
  hero: 'Hero banner',
  copy: 'Page copy',
}

const SECTIONS: readonly SectionKey[] = ['hero', 'copy'] as const

const HERO_DESCRIPTIONS: Record<DashboardHeroSlug, string> = {
  home: 'Top banner on the dashboard overview (/my/dashboard) — eyebrow, title, subtitle and cover media.',
  invitations:
    'Top banner on the Send invitations page (/my/dashboard/invitations) — eyebrow, title, subtitle and cover media.',
  guests:
    'Top banner on the Guest list page (/my/dashboard/guests) — eyebrow, title, subtitle and cover media.',
  rsvps: 'Top banner on the RSVPs page (/my/dashboard/rsvps) — eyebrow, title, subtitle and cover media.',
  website:
    'Top banner on the Wedding website page (/my/dashboard/website) — eyebrow, title, subtitle and cover media.',
  pledges:
    'Top banner on the Pledges page (/my/dashboard/pledges) — eyebrow, title, subtitle and cover media.',
}

const COPY_DESCRIPTION =
  'Page text beyond the hero — empty states, buttons, section headings and callouts.'

function parsePath(pathname: string): { slug: DashboardHeroSlug; section: SectionKey } {
  for (const slug of DASHBOARD_HERO_SLUGS) {
    if (pathname.startsWith(`/cms/opus-pass/dashboard/${slug}`)) {
      const section: SectionKey = pathname.includes(`/${slug}/copy`) ? 'copy' : 'hero'
      return { slug, section }
    }
  }
  return { slug: 'home', section: 'hero' }
}

export default function OpusPassDashboardCmsLayout({ children }: { children: ReactNode }) {
  return (
    <EditorActionsProvider>
      <Shell>{children}</Shell>
    </EditorActionsProvider>
  )
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  // opus_pass is mounted under basePath '/opuspass'.
  const opusPassUrl = `${process.env.NEXT_PUBLIC_OPUS_PASS_URL ?? 'http://localhost:3008'}`
  const { slug: activeSlug, section: activeSection } = parsePath(pathname)

  useSetPageHeading({
    title: `${DASHBOARD_HERO_LABEL[activeSlug]} — ${SECTION_LABEL[activeSection]}`,
    subtitle: activeSection === 'copy' ? COPY_DESCRIPTION : HERO_DESCRIPTIONS[activeSlug],
  })

  return (
    <>
      <HeaderBadgeSlot>
        <EditorStatusBadge />
      </HeaderBadgeSlot>
      <HeaderActionsSlot>
        <EditorActionButtons />
        <a
          href={`${opusPassUrl}${DASHBOARD_HERO_PUBLIC_PATH[activeSlug]}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          View live page
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </HeaderActionsSlot>

      <SecondarySidebarSlot>
        <aside className="flex h-full w-[240px] flex-col gap-4 overflow-y-auto border-r border-gray-100 px-3 py-6">
            <h2 className="px-2 text-base font-bold tracking-tight text-gray-900">Dashboard</h2>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400 px-2 mb-2">
              Dashboard pages
            </p>
            <nav className="space-y-3">
              {DASHBOARD_HERO_SLUGS.map((slug) => {
                const Icon = ICONS[slug]
                const pageActive = pathname.startsWith(`/cms/opus-pass/dashboard/${slug}`)
                return (
                  <div key={slug}>
                    <div className="flex items-center gap-2.5 px-2.5 py-1.5">
                      <Icon
                        className={cn(
                          'w-4 h-4 stroke-[1.5] shrink-0',
                          pageActive ? 'text-[#7E5896]' : 'text-gray-400',
                        )}
                      />
                      <span
                        className={cn(
                          'text-sm font-semibold',
                          pageActive ? 'text-[#7E5896]' : 'text-gray-700',
                        )}
                      >
                        {DASHBOARD_HERO_LABEL[slug]}
                      </span>
                    </div>
                    <div className="ml-[1.45rem] border-l border-gray-100 pl-2 space-y-0.5">
                      {SECTIONS.map((section) => {
                        const href = `/cms/opus-pass/dashboard/${slug}/${section}`
                        const isActive =
                          pageActive &&
                          (section === 'copy'
                            ? pathname.includes(`/${slug}/copy`)
                            : !pathname.includes(`/${slug}/copy`))
                        return (
                          <Link
                            key={section}
                            href={href}
                            className={cn(
                              'block px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors',
                              isActive
                                ? 'bg-[#F0DFF6] text-[#7E5896]'
                                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50',
                            )}
                          >
                            {SECTION_LABEL[section]}
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </nav>
        </aside>
      </SecondarySidebarSlot>

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
        <span
          className="text-xs text-red-600 font-medium mr-1 max-w-[420px] truncate"
          title={error}
        >
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
