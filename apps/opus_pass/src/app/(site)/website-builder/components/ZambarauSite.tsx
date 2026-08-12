import Image from 'next/image'
import { Heart, Calendar, MapPin, Sparkles, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FONT_STACKS, type BuilderMeta, type Theme } from '@/lib/builder/types'
import type { GiftRegistryItemWithClaims, PublicGiftRegistryPage, PublicGuestbookPage } from '@/lib/dashboard/queries'
import type { GuestbookEntry } from '@/lib/dashboard/types'
import GiftRegistryPublicClient from '@/app/gift-registry/[slug]/GiftRegistryPublicClient'
import GuestbookPublicClient from '@/app/guestbook/[slug]/GuestbookPublicClient'
import { RsvpForm, Gallery } from './SiteRenderer'

// ─────────────────────────────────────────────────────────────────────────────
//  ZambarauSite — the "Zambarau" template's below-hero content, ported
//  section-for-section from apps/wedding_website's actual Home.tsx / Gallery.tsx
//  / Registry.tsx / Schedule.tsx (colors, spacing, and copy structure), rather
//  than composed from the generic eyebrow/heading/text block vocabulary the
//  other 8 templates share. Parameterized by the couple's own meta (names,
//  date, location, photos) in place of the prototype's hardcoded "Amina & Juma".
// ─────────────────────────────────────────────────────────────────────────────

const SECONDARY = '#615C68'
const SURFACE_CONTAINER = '#F9F9F9'
const OUTLINE_VARIANT = '#CEC3D1'

const GALLERY_FALLBACK = [
  '/assets/images/cutesy_couple.jpg',
  '/assets/images/coupleswithpiano.jpg',
  '/assets/images/authentic_couple.jpg',
  '/assets/images/churchcouples.jpg',
  '/assets/images/beautiful_bride.jpg',
  '/assets/images/bridering.jpg',
  '/assets/images/beautyinbride.jpg',
  '/assets/images/bride_umbrella.jpg',
  '/assets/images/mauzo_crew.jpg',
]

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const [, y, mm, dd] = m
  return `${MONTHS[Number(mm) - 1] ?? ''} ${Number(dd)}, ${y}`
}

type ScheduleEvent = { time: string; title: string; location: string; description: string }

function buildSchedule(meta: BuilderMeta): ScheduleEvent[] {
  const venue = meta.location || 'the venue'
  return [
    { time: '10:00 AM', title: 'Ceremony', location: venue, description: 'Join us as we exchange our vows and begin this new chapter together.' },
    { time: '1:00 PM', title: 'Send-off Lunch', location: venue, description: 'A light lunch while family and friends gather to celebrate.' },
    { time: '4:00 PM', title: 'Couple Photoshoot', location: venue, description: 'The wedding party steps away for photos — guests are welcome to head to the reception.' },
    { time: '6:30 PM', title: 'Evening Reception', location: venue, description: 'Dinner, speeches, and our first dance as a married couple.' },
  ]
}

/**
 * apps/wedding_website's Navbar/App.tsx switch which single tab's content
 * shows (not a continuously-scrolling page) — `activeTab` mirrors that
 * `activeTab` state, driven by SiteRenderer's SiteNav tab clicks.
 */
export function ZambarauSite({
  meta,
  theme,
  activeTab,
  registryItems,
  guestbookEntries,
}: {
  meta: BuilderMeta
  theme: Theme
  activeTab: string
  registryItems?: GiftRegistryItemWithClaims[]
  guestbookEntries?: GuestbookEntry[]
}) {
  const heading = FONT_STACKS[theme.headingFont]
  const body = FONT_STACKS[theme.bodyFont]
  const pageVisible = (key: string) => meta.pages.find((p) => p.key === key)?.visible !== false

  const photos = (meta.photos ?? []).filter(Boolean)
  const galleryPhotos = (photos.length >= 6 ? photos : [...photos, ...GALLERY_FALLBACK]).slice(0, 9)

  if (activeTab === 'home') {
    return (
      <div>
        {/* Welcome — Home.tsx's "Join Us for Our Special Day" section */}
        <section className="px-6 py-24 md:py-32" style={{ backgroundColor: theme.palette.surface }}>
          <div className="mx-auto max-w-2xl text-center">
            <Heart size={32} strokeWidth={1} className="mx-auto mb-10" style={{ color: theme.palette.accent, opacity: 0.6 }} />
            <h2 className="text-[34px] leading-tight md:text-[44px]" style={{ fontFamily: heading, color: theme.palette.ink }}>
              Join Us for Our Special Day
            </h2>
            <p className="mx-auto mt-8 max-w-xl text-[16px] font-light leading-loose md:text-[17px]" style={{ fontFamily: body, color: SECONDARY }}>
              We are so incredibly excited to celebrate our love story with our closest family and friends. Your
              presence means the world to us, and we can&apos;t wait to share these unforgettable moments as we begin
              this beautiful new chapter of our lives together.
            </p>
          </div>
        </section>

        {/* Details — the exact Calendar / MapPin / Sparkles 3-card grid */}
        <section
          className="border-y px-6 py-20"
          style={{ backgroundColor: `${SURFACE_CONTAINER}80`, borderColor: `${OUTLINE_VARIANT}33` }}
        >
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 md:grid-cols-3 md:gap-12">
            <DetailCard theme={theme}>
              <Calendar size={32} strokeWidth={1.5} className="mb-6" style={{ color: theme.palette.accent }} />
              <p className="mb-4 text-[26px]" style={{ fontFamily: heading, color: theme.palette.ink }}>
                The When
              </p>
              <span className="mb-8 h-px w-12" style={{ backgroundColor: theme.palette.accent, opacity: 0.2 }} />
              <p className="text-[16px] font-light leading-relaxed" style={{ color: SECONDARY }}>
                {formatDate(meta.date)}
                <br />
                Ceremony begins in the afternoon
                <br />
                Reception to follow
              </p>
            </DetailCard>
            <DetailCard theme={theme}>
              <MapPin size={32} strokeWidth={1.5} className="mb-6" style={{ color: theme.palette.accent }} />
              <p className="mb-4 text-[26px]" style={{ fontFamily: heading, color: theme.palette.ink }}>
                The Where
              </p>
              <span className="mb-8 h-px w-12" style={{ backgroundColor: theme.palette.accent, opacity: 0.2 }} />
              <p className="text-[16px] font-light leading-relaxed" style={{ color: SECONDARY }}>
                {meta.location || 'To be announced'}
              </p>
            </DetailCard>
            <DetailCard theme={theme}>
              <Sparkles size={32} strokeWidth={1.5} className="mb-6" style={{ color: theme.palette.accent }} />
              <p className="mb-4 text-[26px]" style={{ fontFamily: heading, color: theme.palette.ink }}>
                Dress Code
              </p>
              <span className="mb-8 h-px w-12" style={{ backgroundColor: theme.palette.accent, opacity: 0.2 }} />
              <div className="mb-8 flex justify-center gap-4">
                {[
                  { hex: '#1E293B', label: 'Navy' },
                  { hex: '#94A3B8', label: 'Slate' },
                  { hex: '#FDE047', label: 'Gold' },
                  { hex: '#FDFBF9', label: 'Ivory' },
                ].map((s) => (
                  <div key={s.label} className="flex flex-col items-center gap-2">
                    <span className="h-8 w-8 rounded-full shadow-inner ring-1 ring-black/10" style={{ backgroundColor: s.hex }} />
                    <span className="text-[10px] uppercase tracking-wider" style={{ color: `${SECONDARY}99` }}>
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[16px] font-light leading-relaxed" style={{ color: SECONDARY }}>
                Formal / Black-Tie Optional
                <br />
                We&apos;d love to see our family and friends get dressed up for our big day!
              </p>
            </DetailCard>
          </div>
        </section>
      </div>
    )
  }

  if (activeTab === 'schedule') {
    return (
      <section className="px-6 py-24" style={{ backgroundColor: theme.palette.surface }}>
        <div className="mx-auto mb-16 max-w-xl text-center">
          <h2 className="text-[32px] md:text-[40px]" style={{ fontFamily: heading, color: theme.palette.ink }}>
            Wedding Schedule
          </h2>
          <p className="mt-4 text-[15px] italic" style={{ fontFamily: heading, color: SECONDARY }}>
            We can&apos;t wait to celebrate with you. Here is what to expect on our special day.
          </p>
        </div>
        <div className="relative mx-auto max-w-3xl">
          <div className="absolute bottom-0 left-4 top-0 w-px md:left-1/2" style={{ backgroundColor: `${OUTLINE_VARIANT}4d` }} />
          <div className="space-y-10">
            {buildSchedule(meta).map((ev, i) => {
              const isLeft = i % 2 === 0
              return (
                <div key={i} className="relative flex flex-col items-center md:grid md:grid-cols-2 md:gap-14">
                  <span
                    className="absolute left-4 top-1/2 z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ring-white md:left-1/2"
                    style={{ backgroundColor: theme.palette.accent }}
                  />
                  {/* Mobile: short dashed connector from the left timeline to the card */}
                  <svg className="pointer-events-none absolute left-4 top-1/2 h-[2px] w-8 -translate-y-1/2 md:hidden" style={{ color: theme.palette.accent }} aria-hidden>
                    <line x1="0" y1="1" x2="100%" y2="1" stroke="currentColor" strokeWidth="2" strokeDasharray="6 6" strokeOpacity={0.45} className="wb-dash" />
                  </svg>
                  <div className={cn('w-full pl-12 md:pl-0', isLeft ? 'md:col-start-1 md:pr-8 md:text-right' : 'md:col-start-2 md:pl-8')}>
                    <div
                      className="relative rounded-2xl border p-6 text-left shadow-sm md:p-7"
                      style={{ backgroundColor: theme.palette.surface, borderColor: `${OUTLINE_VARIANT}33` }}
                    >
                      {/* Desktop: dashed connector from the card's true edge (past the
                          column's own pr-8/pl-8 padding) to the center dot */}
                      <svg
                        className={cn('pointer-events-none absolute top-1/2 hidden h-[2px] w-[3.75rem] -translate-y-1/2 md:block', isLeft ? 'left-full' : 'right-full')}
                        style={{ color: theme.palette.accent }}
                        aria-hidden
                      >
                        <line x1="0" y1="1" x2="100%" y2="1" stroke="currentColor" strokeWidth="2" strokeDasharray="6 6" strokeOpacity={0.45} className="wb-dash" />
                      </svg>
                      <div
                        className="mb-3 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-widest"
                        style={{ backgroundColor: `${theme.palette.accent}0d`, color: theme.palette.ink }}
                      >
                        <Clock size={12} /> {ev.time}
                      </div>
                      <p className="mb-2 text-[22px]" style={{ fontFamily: heading, color: theme.palette.ink }}>
                        {ev.title}
                      </p>
                      <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest" style={{ color: `${SECONDARY}cc` }}>
                        <MapPin size={13} style={{ color: theme.palette.accent }} />
                        {ev.location}
                      </div>
                      <p className="text-[13.5px] font-light leading-relaxed" style={{ color: SECONDARY }}>
                        {ev.description}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    )
  }

  if (activeTab === 'gallery') {
    return (
      <section className="px-6 py-24" style={{ backgroundColor: theme.palette.surface }}>
        <div className="mx-auto mb-14 max-w-xl text-center">
          <h2 className="text-[32px] md:text-[40px]" style={{ fontFamily: heading, color: theme.palette.ink }}>
            Captured Moments
          </h2>
          <p className="mt-4 text-[15px] italic" style={{ fontFamily: heading, color: SECONDARY }}>
            A glimpse into our favorite moments together.
          </p>
        </div>
        <Gallery images={galleryPhotos} theme={theme} />
      </section>
    )
  }

  if (activeTab === 'registry') {
    // The couple's actual, already-built Gift Registry page — same component
    // and design as /gift-registry/<slug>, not a Zambarau-styled recreation.
    // It's a full page in its own right (own nav, hero, footer), so it's
    // dropped in as-is rather than wrapped in a Zambarau section shell.
    const registryPageData: PublicGiftRegistryPage = {
      slug: meta.slug || '',
      coupleName: `${meta.partnerA} & ${meta.partnerB}`.trim(),
      registryHeader: null,
      weddingDate: meta.date,
      registryBannerImageUrl: null,
      registryCoverImageUrl: null,
      registryWelcomeMessage: null,
      items: registryItems ?? [],
    }
    return <GiftRegistryPublicClient data={registryPageData} hideNav />
  }

  if (activeTab === 'rsvp' && pageVisible('rsvp')) {
    return (
      <section className="px-6 py-24" style={{ backgroundColor: theme.palette.surface }}>
        <div className="mx-auto mb-10 max-w-xl text-center">
          <h2 className="text-[32px] md:text-[40px]" style={{ fontFamily: heading, color: theme.palette.ink }}>
            Will You Celebrate With Us?
          </h2>
        </div>
        <RsvpForm theme={theme} interactive title="Will you celebrate with us?" note="Kindly respond before the big day." />
      </section>
    )
  }

  if (activeTab === 'guestbook') {
    // The couple's actual, already-built Guest Book page — same component and
    // design as /guestbook/<slug>, dropped in as-is (own nav/hero/footer),
    // the closest OpusPass equivalent to the source app's "Wishes" tab.
    const guestbookPageData: PublicGuestbookPage = {
      slug: meta.slug || '',
      coupleName: `${meta.partnerA} & ${meta.partnerB}`.trim(),
      coverImageUrl: null,
      city: meta.location || null,
      entries: guestbookEntries ?? [],
    }
    return <GuestbookPublicClient data={guestbookPageData} hideNav />
  }

  return null
}

function DetailCard({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col items-center rounded-3xl border p-8 text-center shadow-sm md:p-10"
      style={{ backgroundColor: theme.palette.surface, borderColor: `${OUTLINE_VARIANT}4d` }}
    >
      {children}
    </div>
  )
}
