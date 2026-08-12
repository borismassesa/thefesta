import Link from 'next/link'
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  Send,
  CalendarHeart,
  Utensils,
  ArrowRight,
} from 'lucide-react'
import {
  getStats,
  getEvents,
  getGuestsWithInvitations,
  getCoupleProfile,
  coupleFirstNames,
  getGuestsAwaitingReview,
} from '@/lib/dashboard/queries'
import { Card, StatCard, SectionTitle, StatusPill, EmptyState } from '@/components/dashboard/primitives'
import { AttendanceDonut } from '@/components/dashboard/AttendanceDonut'
import { Button } from '@/components/dashboard/controls'
import { loadDashboardHero } from '@/lib/cms/dashboard-hero'
import { loadDashboardCopy } from '@/lib/cms/dashboard-copy'
import { getLocale } from '@/lib/cms/locale'
import { eventTypeLabel } from '@/lib/dashboard/types'

export const dynamic = 'force-dynamic'

function formatDate(value: string | null): string {
  if (!value) return 'Date TBC'
  return new Date(value).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default async function DashboardOverviewPage() {
  const locale = await getLocale()
  const [stats, events, guests, profile, hero, copy, awaitingReview] = await Promise.all([
    getStats(),
    getEvents(),
    getGuestsWithInvitations(),
    getCoupleProfile(),
    loadDashboardHero('home', locale),
    loadDashboardCopy('home', locale),
    getGuestsAwaitingReview(),
  ])
  const reviewCount = awaitingReview.length

  const upcoming = events
    .filter((e) => e.starts_at && new Date(e.starts_at) >= new Date(new Date().toDateString()))
    .slice(0, 3)

  const recent = guests
    .flatMap((g) => g.invitations.map((inv) => ({ guest: g, inv })))
    .filter((x) => x.inv.responded_at)
    .sort((a, b) => new Date(b.inv.responded_at!).getTime() - new Date(a.inv.responded_at!).getTime())
    .slice(0, 6)

  const empty = stats.totalGuests === 0 && events.length === 0

  const coupleFirstName = coupleFirstNames(profile)

  return (
    <div className="space-y-8">
      <header className="dash-header-safe border-b border-black/[0.06] pb-6">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold tracking-tight text-[#1A1A1A] sm:text-3xl">
            {coupleFirstName === 'The Couple' ? hero.title : `Welcome back, ${coupleFirstName}`}
          </h1>
          {hero.subtitle ? (
            <p className="mt-2 text-sm text-[#1A1A1A]/65 sm:text-base">{hero.subtitle}</p>
          ) : null}
        </div>
      </header>

      {reviewCount > 0 ? (
        <Link
          href="/my/dashboard/guests?review=1"
          className="flex items-center justify-between gap-4 rounded-2xl border border-[#9FE870]/60 bg-[#9FE870]/15 px-5 py-4 transition hover:bg-[#9FE870]/25"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#14342B] text-sm font-bold text-white">
              {reviewCount}
            </span>
            <div>
              <p className="text-sm font-semibold text-[#14342B]">
                {reviewCount === 1 ? '1 guest needs review' : `${reviewCount} guests need review`}
              </p>
              <p className="text-xs text-[#1A1A1A]/60">RSVP’d via your shared link — approve or dismiss them.</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-[#14342B]" />
        </Link>
      ) : null}

      {empty ? (
        <EmptyState
          icon={<CalendarHeart className="h-7 w-7" />}
          title={copy.empty_title}
          description={copy.empty_description}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/my/dashboard/events">
                <Button>
                  <CalendarHeart className="h-4 w-4" /> {copy.empty_event_cta}
                </Button>
              </Link>
              <Link href="/my/dashboard/guests">
                <Button variant="secondary">
                  <Users className="h-4 w-4" /> {copy.empty_guests_cta}
                </Button>
              </Link>
            </div>
          }
        />
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label={copy.stat_guests} value={stats.totalGuests} icon={<Users className="h-5 w-5" />} accent />
            <StatCard
              label={copy.stat_attending}
              value={stats.attending}
              hint={copy.stat_attending_hint.replace('{n}', String(stats.expectedHeadcount))}
              icon={<UserCheck className="h-5 w-5" />}
            />
            <StatCard label={copy.stat_declined} value={stats.declined} icon={<UserX className="h-5 w-5" />} />
            <StatCard label={copy.stat_pending} value={stats.pending} icon={<Clock className="h-5 w-5" />} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Response rate + funnel */}
            <Card className="p-6 lg:col-span-2">
              <SectionTitle title={copy.response_title} subtitle={copy.response_subtitle.replace('{rate}', String(stats.responseRate))} />
              <div className="mt-4">
                <AttendanceDonut
                  segments={[
                    { label: 'Attending', value: stats.attending, color: '#10b981' },
                    { label: 'Maybe', value: stats.maybe, color: '#f59e0b' },
                    { label: 'Declined', value: stats.declined, color: '#f43f5e' },
                    { label: 'Awaiting', value: stats.pending, color: '#cfc6d8' },
                  ]}
                  centerValue={`${stats.responseRate}%`}
                  centerLabel="answered"
                />
              </div>
            </Card>

            {/* Meal breakdown */}
            <Card className="p-6">
              <SectionTitle title={copy.meal_title} />
              {stats.mealBreakdown.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-[#1A1A1A]/45">
                  <Utensils className="h-4 w-4" /> {copy.meal_empty}
                </p>
              ) : (
                <ul className="space-y-3">
                  {stats.mealBreakdown.map((m) => (
                    <li key={m.choice} className="flex items-center justify-between text-sm">
                      <span className="text-[#1A1A1A]/70">{m.choice}</span>
                      <span className="font-semibold text-[#1A1A1A]">{m.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Upcoming events */}
            <div>
              <SectionTitle
                title={copy.upcoming_title}
                action={
                  <Link href="/my/dashboard/events" className="text-sm font-medium text-[#1A1A1A]/70 hover:text-[#1A1A1A] hover:underline">
                    {copy.upcoming_view_all}
                  </Link>
                }
              />
              {upcoming.length === 0 ? (
                <EmptyState
                  icon={<CalendarHeart className="h-6 w-6" />}
                  title={copy.upcoming_empty_title}
                  action={
                    <Link href="/my/dashboard/events">
                      <Button variant="secondary">{copy.upcoming_empty_cta}</Button>
                    </Link>
                  }
                />
              ) : (
                <div className="space-y-3">
                  {upcoming.map((e) => (
                    <Card key={e.id} className="flex items-center gap-4 p-4">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-black/[0.05] text-[#1A1A1A]/70">
                        <CalendarHeart className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-[#1A1A1A]">{e.name}</p>
                        <p className="text-xs text-[#1A1A1A]/55">
                          {eventTypeLabel(e.event_type)} · {formatDate(e.starts_at)}
                          {e.venue_name ? ` · ${e.venue_name}` : ''}
                        </p>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Recent responses */}
            <div>
              <SectionTitle
                title={copy.recent_title}
                action={
                  <Link href="/my/dashboard/rsvps" className="text-sm font-medium text-[#1A1A1A]/70 hover:text-[#1A1A1A] hover:underline">
                    {copy.recent_view_all}
                  </Link>
                }
              />
              {recent.length === 0 ? (
                <EmptyState
                  icon={<Send className="h-6 w-6" />}
                  title={copy.recent_empty_title}
                  description={copy.recent_empty_description}
                  action={
                    <Link href="/my/dashboard/invitations">
                      <Button variant="secondary">
                        <Send className="h-4 w-4" /> {copy.recent_empty_cta}
                      </Button>
                    </Link>
                  }
                />
              ) : (
                <Card className="divide-y divide-black/[0.05]">
                  {recent.map(({ guest, inv }) => (
                    <div key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[#1A1A1A]">{guest.full_name}</p>
                        {guest.group_tag ? (
                          <p className="truncate text-xs text-[#1A1A1A]/50">{guest.group_tag}</p>
                        ) : null}
                      </div>
                      <StatusPill status={inv.rsvp_status} />
                    </div>
                  ))}
                </Card>
              )}
            </div>
          </div>

          <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div>
              <h3 className="font-semibold text-[#1A1A1A]">{copy.cta_title}</h3>
              <p className="text-sm text-[#1A1A1A]/55">{copy.cta_description}</p>
            </div>
            <Link href="/my/dashboard/invitations">
              <Button>
                {copy.cta_button} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </Card>
        </>
      )}
    </div>
  )
}
