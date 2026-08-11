'use client'

// Live, faithful snapshot of the real OpusPass couple dashboard, rendered inside
// the admin CMS so editors see exactly what their hero + page-copy edits produce.
//
// It mirrors the live pages under apps/opus_pass/src/app/my/dashboard/* using the
// same visual primitives (see ./preview-ui) plus representative sample data for the
// guest/RSVP/pledge numbers a couple would see. Both the hero editor and the copy
// editor render this with their own draft bound live, so typing updates it instantly.

import { useState } from 'react'
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  Send,
  CalendarHeart,
  ArrowRight,
  Globe,
  Palette,
  ClipboardCheck,
  ClipboardSignature,
  Plus,
  Download,
  HandCoins,
  Banknote,
  ListChecks,
  BarChart3,
  MessageCircle,
  Copy,
  Mail,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  LOCALES,
  LOCALE_LABELS,
  resolveLocalized,
  type Locale,
  type MaybeLocalized,
} from '@/lib/cms/localized'
import type { DashboardHeroContent, DashboardHeroSlug } from '@/lib/cms/opus-pass-dashboard-hero'
import type { DashboardCopyContent } from '@/lib/cms/opus-pass-dashboard-copy'
import { DASHBOARD_HERO_PUBLIC_PATH } from '@/lib/cms/opus-pass-dashboard-hero'
import {
  AccentChip,
  Card,
  Chip,
  DividedStat,
  EmptyState,
  PreviewButton,
  PreviewHero,
  PreviewSearch,
  ProgressBar,
  SectionTitle,
  StatCard,
  StatusPill,
  SubNav,
  type PreviewRsvpStatus,
} from './preview-ui'

type Props = {
  slug: DashboardHeroSlug
  hero: DashboardHeroContent
  copy: DashboardCopyContent
}

type ViewState = 'data' | 'empty'

// Pages where an "empty" first-run state is worth previewing too.
const HAS_EMPTY_STATE: Record<DashboardHeroSlug, boolean> = {
  home: true,
  invitations: false,
  guests: true,
  rsvps: true,
  website: false,
  pledges: true,
}

export default function DashboardPreview({ slug, hero, copy }: Props) {
  const [locale, setLocale] = useState<Locale>('en')
  const [view, setView] = useState<ViewState>('data')

  const t = (v: MaybeLocalized) => resolveLocalized(v, locale)
  const c = (key: string) => resolveLocalized(copy[key], locale)
  const hasEmpty = HAS_EMPTY_STATE[slug]
  const empty = hasEmpty && view === 'empty'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Live preview</p>
        <div className="flex items-center gap-2">
          {hasEmpty ? (
            <div className="inline-flex items-center rounded-full border border-gray-200 p-0.5 text-[11px] font-semibold">
              {(['data', 'empty'] as ViewState[]).map((v) => (
                <button data-opus-button="control"
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  className={cn(
                    'rounded-full px-2.5 py-0.5 transition-colors',
                    view === v ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900',
                  )}
                >
                  {v === 'data' ? 'With data' : 'First run'}
                </button>
              ))}
            </div>
          ) : null}
          <div className="inline-flex items-center rounded-full border border-gray-200 p-0.5 text-[11px] font-semibold">
            {LOCALES.map((l) => (
              <button data-opus-button="control"
                key={l}
                type="button"
                onClick={() => setLocale(l)}
                aria-pressed={locale === l}
                className={cn(
                  'rounded-full px-2.5 py-0.5 transition-colors',
                  locale === l ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900',
                )}
              >
                {LOCALE_LABELS[l]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Browser chrome */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 shadow-[0_2px_12px_rgba(26,26,26,0.06)]">
        <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
          <span className="ml-2 truncate rounded-md bg-white px-2.5 py-1 text-[11px] text-gray-400 ring-1 ring-gray-200">
            opuspass.opusfesta.com{DASHBOARD_HERO_PUBLIC_PATH[slug]}
          </span>
        </div>
        {/* Dashboard canvas — soft warm background like the live shell */}
        <div className="bg-[#FBFAF8] p-5 sm:p-6">
          <PageBody slug={slug} t={t} c={c} hero={hero} empty={empty} />
        </div>
      </div>

      <p className="px-1 text-[11px] text-gray-400">
        Representative numbers and names are sample data — only the highlighted text comes from your
        edits.
      </p>
    </div>
  )
}

type BodyProps = {
  slug: DashboardHeroSlug
  hero: DashboardHeroContent
  t: (v: MaybeLocalized) => string
  c: (key: string) => string
  empty: boolean
}

function PageBody({ slug, hero, t, c, empty }: BodyProps) {
  const title = t(hero.title)
  const subtitle = t(hero.subtitle)

  switch (slug) {
    case 'home':
      return <HomeBody title={title} subtitle={subtitle} c={c} empty={empty} />
    case 'website':
      return <WebsiteBody title={title} subtitle={subtitle} c={c} />
    case 'guests':
      return <GuestsBody title={title} subtitle={subtitle} c={c} empty={empty} />
    case 'rsvps':
      return <RsvpsBody title={title} subtitle={subtitle} c={c} empty={empty} />
    case 'pledges':
      return <PledgesBody title={title} subtitle={subtitle} c={c} empty={empty} />
    case 'invitations':
      return <InvitationsBody c={c} />
    default: {
      // Exhaustiveness guard — adding a slug to DashboardHeroSlug without a body
      // here becomes a compile error instead of a silently blank preview.
      const _exhaustive: never = slug
      return _exhaustive
    }
  }
}

// ─────────────────────────────── Home ───────────────────────────────

function HomeBody({
  title,
  subtitle,
  c,
  empty,
}: {
  title: string
  subtitle: string
  c: (k: string) => string
  empty: boolean
}) {
  return (
    <div className="space-y-8">
      <PreviewHero
        title={title}
        subtitle={subtitle}
        actions={
          <PreviewButton>
            <Users className="h-4 w-4" /> {c('manage_guests_cta')}
          </PreviewButton>
        }
      />

      {empty ? (
        <EmptyState
          icon={<CalendarHeart className="h-7 w-7" />}
          title={c('empty_title')}
          description={c('empty_description')}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <PreviewButton>
                <CalendarHeart className="h-4 w-4" /> {c('empty_event_cta')}
              </PreviewButton>
              <PreviewButton variant="secondary">
                <Users className="h-4 w-4" /> {c('empty_guests_cta')}
              </PreviewButton>
            </div>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label={c('stat_guests')} value={84} icon={<Users className="h-5 w-5" />} accent />
            <StatCard
              label={c('stat_attending')}
              value={52}
              hint={c('stat_attending_hint').replace('{n}', '96')}
              icon={<UserCheck className="h-5 w-5" />}
            />
            <StatCard label={c('stat_declined')} value={9} icon={<UserX className="h-5 w-5" />} />
            <StatCard label={c('stat_pending')} value={23} icon={<Clock className="h-5 w-5" />} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="p-6 lg:col-span-2">
              <SectionTitle
                title={c('response_title')}
                subtitle={c('response_subtitle').replace('{rate}', '73')}
              />
              <ProgressBar value={73} />
              <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { label: 'Attending', value: 52, dot: 'bg-emerald-500' },
                  { label: 'Maybe', value: 6, dot: 'bg-amber-500' },
                  { label: 'Declined', value: 9, dot: 'bg-rose-500' },
                  { label: 'Awaiting', value: 23, dot: 'bg-neutral-400' },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
                      <span className="text-xs text-[#1A1A1A]/55">{s.label}</span>
                    </div>
                    <p className="mt-1 text-xl font-bold text-[#1A1A1A]">{s.value}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <SectionTitle title={c('meal_title')} />
              <ul className="space-y-3">
                {[
                  { choice: 'Chicken', count: 28 },
                  { choice: 'Vegetarian', count: 14 },
                  { choice: 'Fish', count: 10 },
                ].map((m) => (
                  <li key={m.choice} className="flex items-center justify-between text-sm">
                    <span className="text-[#1A1A1A]/70">{m.choice}</span>
                    <span className="font-semibold text-[#1A1A1A]">{m.count}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <SectionTitle
                title={c('upcoming_title')}
                action={<span className="text-sm font-medium text-[#1A1A1A]/70">{c('upcoming_view_all')}</span>}
              />
              <div className="space-y-3">
                {[
                  { name: 'Wedding ceremony', meta: 'Wedding · Sat, 14 Feb 2026 · Mlimani City' },
                  { name: 'Send-off party', meta: 'Send-off · Fri, 13 Feb 2026 · Coral Beach' },
                ].map((e) => (
                  <Card key={e.name} className="flex items-center gap-4 p-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-black/[0.05] text-[#1A1A1A]/70">
                      <CalendarHeart className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-[#1A1A1A]">{e.name}</p>
                      <p className="text-xs text-[#1A1A1A]/55">{e.meta}</p>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            <div>
              <SectionTitle
                title={c('recent_title')}
                action={<span className="text-sm font-medium text-[#1A1A1A]/70">{c('recent_view_all')}</span>}
              />
              <Card className="divide-y divide-black/[0.05]">
                {[
                  { name: 'Amani & Zawadi', group: "Bride's family", status: 'attending' as PreviewRsvpStatus },
                  { name: 'John Mushi', group: 'University friends', status: 'declined' as PreviewRsvpStatus },
                  { name: 'Neema Kessy', group: 'Work', status: 'maybe' as PreviewRsvpStatus },
                ].map((g) => (
                  <div key={g.name} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#1A1A1A]">{g.name}</p>
                      <p className="truncate text-xs text-[#1A1A1A]/50">{g.group}</p>
                    </div>
                    <StatusPill status={g.status} />
                  </div>
                ))}
              </Card>
            </div>
          </div>

          <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div>
              <h3 className="font-semibold text-[#1A1A1A]">{c('cta_title')}</h3>
              <p className="text-sm text-[#1A1A1A]/55">{c('cta_description')}</p>
            </div>
            <PreviewButton>
              {c('cta_button')} <ArrowRight className="h-4 w-4" />
            </PreviewButton>
          </Card>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────── Website ───────────────────────────────

function WebsiteBody({
  title,
  subtitle,
  c,
}: {
  title: string
  subtitle: string
  c: (k: string) => string
}) {
  const benefits = c('benefits_items')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  return (
    <div className="space-y-6">
      <PreviewHero
        title={title}
        subtitle={subtitle}
        actions={
          <Chip>
            <Palette className="h-3.5 w-3.5" /> {c('browse_chip')}
          </Chip>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold tracking-tight text-[#1A1A1A]">{c('build_title')}</h2>
          <p className="mt-1 text-sm text-[#1A1A1A]/60">{c('build_description')}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <PreviewButton>
              <Palette className="h-4 w-4" /> {c('build_primary_cta')} <ArrowRight className="h-4 w-4" />
            </PreviewButton>
            <PreviewButton variant="secondary">{c('build_secondary_cta')}</PreviewButton>
          </div>
        </Card>
        <Card className="p-6">
          <h2 className="text-base font-semibold tracking-tight text-[#1A1A1A]">{c('benefits_title')}</h2>
          <ul className="mt-3 space-y-2 text-sm text-[#1A1A1A]/70">
            {benefits.map((item, i) => (
              <li key={i}>· {item}</li>
            ))}
          </ul>
        </Card>
      </div>
      <EmptyState
        icon={<Globe className="h-7 w-7" />}
        title={c('coming_soon_title')}
        description={c('coming_soon_description')}
      />
    </div>
  )
}

// ─────────────────────────────── Guests ───────────────────────────────

function GuestsBody({
  title,
  subtitle,
  c,
  empty,
}: {
  title: string
  subtitle: string
  c: (k: string) => string
  empty: boolean
}) {
  return (
    <div className="space-y-6">
      <PreviewHero
        title={title}
        subtitle={subtitle}
        actions={
          <AccentChip>
            <Plus className="h-3.5 w-3.5" /> {c('add_guests_cta')}
          </AccentChip>
        }
      />

      <SubNav
        tabs={[
          { label: c('nav_manage'), active: true },
          { label: c('nav_collector'), icon: <ClipboardSignature className="h-3.5 w-3.5" /> },
          { label: c('nav_pledges') },
          { label: c('nav_rsvps') },
        ]}
      />

      {empty ? (
        <EmptyState
          icon={<Users className="h-7 w-7" />}
          title={c('empty_title')}
          description={c('empty_description')}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <PreviewButton>
                <Plus className="h-4 w-4" /> {c('empty_add_cta')}
              </PreviewButton>
              <PreviewButton variant="secondary">{c('empty_upload_cta')}</PreviewButton>
              <PreviewButton variant="secondary">{c('empty_collect_cta')}</PreviewButton>
            </div>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            <Card className="px-5 py-4">
              <div className="grid grid-cols-3 divide-x divide-black/[0.12] text-center">
                <DividedStat value={84} label={c('stat_guests_label')} />
                <DividedStat value={71} label={c('stat_adults_label')} />
                <DividedStat value={13} label={c('stat_children_label')} />
              </div>
            </Card>
            <Card className="px-5 py-4">
              <div className="flex items-center gap-2 text-xs text-[#1A1A1A]/65">
                <span>{c('collector_heading')}</span>
                <span className="font-semibold text-[#7E5896]">{c('collector_edit')}</span>
              </div>
              <div className="mt-1 truncate rounded-lg border border-black/[0.12] bg-white px-3 py-2 text-xs text-[#1A1A1A]/80">
                opuspass.opusfesta.com/c/amani-and-zawadi
              </div>
              <div className="mt-3 flex gap-2">
                <AccentChip>
                  <Palette className="h-3.5 w-3.5" /> {c('collector_customize')}
                </AccentChip>
                <Chip>
                  <Copy className="h-3.5 w-3.5" /> {c('collector_copy')}
                </Chip>
              </div>
            </Card>
          </div>

          <div className="flex flex-nowrap items-center gap-3">
            <Chip>{c('filter_label')}</Chip>
            <PreviewSearch placeholder={c('search_placeholder')} />
            <Chip>{c('upload_spreadsheet_cta')}</Chip>
          </div>

          <Card className="divide-y divide-black/[0.05]">
            {[
              { name: 'Amani Mushi', group: "Bride's family", status: 'attending' as PreviewRsvpStatus },
              { name: 'Zawadi Kileo', group: 'Work', status: 'pending' as PreviewRsvpStatus },
              { name: 'Neema Kessy', group: 'University friends', status: 'maybe' as PreviewRsvpStatus },
            ].map((g) => (
              <div key={g.name} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#1A1A1A]">{g.name}</p>
                  <p className="truncate text-xs text-[#1A1A1A]/50">{g.group}</p>
                </div>
                <StatusPill status={g.status} />
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────── RSVPs ───────────────────────────────

function RsvpsBody({
  title,
  subtitle,
  c,
  empty,
}: {
  title: string
  subtitle: string
  c: (k: string) => string
  empty: boolean
}) {
  return (
    <div className="space-y-6">
      <PreviewHero
        title={title}
        subtitle={subtitle}
        actions={
          <Chip>
            <Download className="h-3.5 w-3.5" /> {c('export_cta')}
          </Chip>
        }
      />

      {empty ? (
        <EmptyState
          icon={<ClipboardCheck className="h-7 w-7" />}
          title={c('empty_title')}
          description={c('empty_description')}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-[#1A1A1A]/60">Event</span>
            <span className="rounded-xl border border-black/[0.12] bg-white px-3.5 py-2.5 text-sm text-[#1A1A1A]">
              {c('filter_all_events')}
            </span>
          </div>

          <Card className="overflow-hidden">
            <div className="grid grid-cols-5 gap-2 border-b border-black/[0.06] bg-black/[0.02] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#1A1A1A]/50">
              <span>{c('th_guest')}</span>
              <span>{c('th_event')}</span>
              <span>{c('th_status')}</span>
              <span>{c('th_party')}</span>
              <span>{c('th_meal')}</span>
            </div>
            {[
              { name: 'Amani Mushi', event: 'Ceremony', status: 'attending' as PreviewRsvpStatus, party: '2', meal: 'Chicken' },
              { name: 'John Mushi', event: 'Ceremony', status: 'declined' as PreviewRsvpStatus, party: '—', meal: '—' },
              { name: 'Neema Kessy', event: 'Reception', status: 'maybe' as PreviewRsvpStatus, party: '1', meal: 'Vegetarian' },
            ].map((r) => (
              <div
                key={r.name}
                className="grid grid-cols-5 items-center gap-2 border-b border-black/[0.05] px-4 py-3 text-sm text-[#1A1A1A]/70 last:border-0"
              >
                <span className="truncate font-medium text-[#1A1A1A]">{r.name}</span>
                <span className="truncate">{r.event}</span>
                <span>
                  <StatusPill status={r.status} />
                </span>
                <span>{r.party}</span>
                <span className="truncate">{r.meal}</span>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────── Pledges ───────────────────────────────

function PledgesBody({
  title,
  subtitle,
  c,
  empty,
}: {
  title: string
  subtitle: string
  c: (k: string) => string
  empty: boolean
}) {
  return (
    <div className="space-y-6">
      <PreviewHero
        title={title}
        subtitle={subtitle}
        actions={
          <AccentChip>
            <Plus className="h-3.5 w-3.5" /> {c('add_pledge_cta')}
          </AccentChip>
        }
      />

      <SubNav
        tabs={[
          { label: c('nav_manage'), icon: <HandCoins className="h-3.5 w-3.5" />, active: true },
          { label: c('nav_invite'), icon: <Send className="h-3.5 w-3.5" /> },
          { label: c('nav_collection'), icon: <Banknote className="h-3.5 w-3.5" /> },
          { label: c('nav_followups'), icon: <ListChecks className="h-3.5 w-3.5" />, badge: 3 },
          { label: c('nav_reports'), icon: <BarChart3 className="h-3.5 w-3.5" /> },
        ]}
      />

      {empty ? (
        <EmptyState
          icon={<HandCoins className="h-7 w-7" />}
          title={c('empty_title')}
          description={c('empty_description')}
          action={
            <PreviewButton>
              <Plus className="h-4 w-4" /> {c('empty_cta')}
            </PreviewButton>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            <Card className="px-5 py-4">
              <div className="grid grid-cols-3 divide-x divide-black/[0.12] text-center">
                <DividedStat value="TZS 4.2M" label="Pledged" />
                <DividedStat value="TZS 2.8M" label="Received" />
                <DividedStat value="TZS 1.4M" label="Outstanding" />
              </div>
            </Card>
            <Card className="px-5 py-4">
              <div className="grid grid-cols-3 divide-x divide-black/[0.12] text-center">
                <DividedStat value={18} label="Paid" />
                <DividedStat value={24} label="Coming" />
                <DividedStat value={6} label="Cards to prepare" />
              </div>
            </Card>
          </div>

          <div className="flex flex-nowrap items-center gap-3">
            <Chip>{c('view_all')}</Chip>
            <PreviewSearch placeholder="Search contributors…" />
          </div>

          <Card className="divide-y divide-black/[0.05]">
            {[
              { name: 'Uncle Hassan', detail: 'TZS 500,000 · paid' },
              { name: 'Mama Neema', detail: 'TZS 300,000 · partly paid' },
              { name: 'The Kileo family', detail: 'TZS 1,000,000 · awaiting' },
            ].map((p) => (
              <div key={p.name} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="font-medium text-[#1A1A1A]">{p.name}</span>
                <span className="text-[#1A1A1A]/55">{p.detail}</span>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────── Invitations ───────────────────────────────
// The live Send-invites page is not yet wired to this CMS section — it renders a
// fixed funnel UI. We show a faithful snapshot and flag that the copy below is
// staged for a future rebuild so editors aren't misled.

function InvitationsBody({ c }: { c: (k: string) => string }) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        Heads up — the live Send invitations page doesn&apos;t read this CMS section yet. The copy
        below is staged for when that page is rebuilt; edits here won&apos;t change the live page for
        now.
      </div>

      <header className="border-b border-black/[0.06] pb-6">
        <h1 className="text-2xl font-bold tracking-tight text-[#1A1A1A] sm:text-3xl">Send invites</h1>
        <p className="mt-2 text-sm text-[#1A1A1A]/65">
          Share each guest&apos;s personal RSVP link — no app needed on their end.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { n: 84, l: 'Invited' },
          { n: 78, l: 'Delivered' },
          { n: 61, l: 'Viewed' },
          { n: 43, l: "RSVP'd" },
        ].map((f) => (
          <Card key={f.l} className="p-4 text-center">
            <p className="text-2xl font-bold text-[#1A1A1A]">{f.n}</p>
            <p className="mt-0.5 text-xs text-[#1A1A1A]/55">{f.l}</p>
          </Card>
        ))}
      </div>

      <Card className="divide-y divide-black/[0.05]">
        {[
          { name: 'Amani Mushi', sent: true },
          { name: 'Zawadi Kileo', sent: false },
          { name: 'Neema Kessy', sent: true },
        ].map((g) => (
          <div key={g.name} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[#1A1A1A]">{g.name}</p>
              <p className="truncate text-xs text-[#1A1A1A]/50">
                {g.sent ? c('sent_label') : c('not_sent')}
              </p>
            </div>
            <div className="flex items-center gap-2 text-[#1A1A1A]/55">
              <MessageCircle className="h-4 w-4" />
              <Mail className="h-4 w-4" />
              <Copy className="h-4 w-4" />
            </div>
          </div>
        ))}
      </Card>
    </div>
  )
}
