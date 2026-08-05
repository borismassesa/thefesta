'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  CalendarCheck,
  CalendarClock,
  ChevronDown,
  QrCode,
  Radio,
  Search,
  UserCheck,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSetPageHeading } from '@/components/PageHeading'
import { eventLifecycle, LIFECYCLE_TONE, type EventLifecycle } from '@/lib/checkin-event-status'
import CheckinNavTabs from './CheckinNavTabs'

export interface CheckinEventRow {
  id: string
  name: string
  eventType: string
  startsAt: string | null
  endsAt: string | null
  /** "Venue, City" — either half may be missing; null when neither is set. */
  venue: string | null
  coupleName: string
  /** Active (not revoked/expired) admin-assigned attendants. */
  activeAdminAttendants: number
  /** Active attendants from either source (admin + couple self-serve). */
  activeAttendantsTotal: number
  /** Names of active admin-assigned attendants — couple self-serve tokens
   * never persist a name server-side, so this only ever covers the admin
   * side of activeAttendantsTotal. */
  activeAdminNames: string[]
}

// "Live" is a computed state, not a stored one — an event is live when now
// sits inside its (padded) window. It leads the filter row because during an
// event it is the only bucket anyone on the operations floor cares about.
type TimeFilter = 'live' | 'upcoming' | 'past' | 'all'
const TIME_FILTERS: TimeFilter[] = ['live', 'upcoming', 'past', 'all']
type SortMode = 'soonest' | 'latest' | 'name'

const SORT_LABELS: Record<SortMode, string> = {
  soonest: 'Date (soonest first)',
  latest: 'Date (latest first)',
  name: 'Name (A → Z)',
}

// Brand palette, same tokens the Couples and Digital Cards lists use:
// #7E5896 primary purple, #F0DFF6 its tint, #9FE870 brand green.
const EVENT_TYPE_TONE: Record<string, string> = {
  wedding: 'bg-[#F0DFF6] text-[#7E5896]',
  ceremony: 'bg-[#F0DFF6] text-[#7E5896]',
  reception: 'bg-[#FCE9C2] text-[#B07F2C]',
  send_off: 'bg-[#9FE870]/30 text-[#3d6b1f]',
}

function eventTypeTone(type: string) {
  return EVENT_TYPE_TONE[type.toLowerCase().replace(/\s+/g, '_')] ?? 'bg-gray-100 text-gray-600'
}

function formatDate(iso: string | null) {
  if (!iso) return 'No date set'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Kpi({ label, value, hint, icon }: { label: string; value: string; hint?: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[12px] font-medium text-gray-500">{label}</div>
        <span className="inline-flex h-7 w-7 items-center justify-center text-gray-400">{icon}</span>
      </div>
      <div className="mt-2 text-[28px] leading-none font-semibold tracking-tight text-gray-900">{value}</div>
      {hint ? <div className="mt-2 text-[11px] text-gray-400">{hint}</div> : null}
    </div>
  )
}

export default function EventsListClient({ events }: { events: CheckinEventRow[] }) {
  useSetPageHeading({ title: 'Event Check-in', subtitle: 'Assign scanning attendants and watch live arrivals' })
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [sort, setSort] = useState<SortMode>('soonest')
  const [sortOpen, setSortOpen] = useState(false)

  const eventTypes = useMemo(
    () => Array.from(new Set(events.map((e) => e.eventType))).sort(),
    [events],
  )

  // Used only to bucket events into upcoming/past for this render pass —
  // no SSR/hydration split to desync (this is a client-only list), so a
  // per-render snapshot is fine.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()

  // One lifecycle read per event, shared by the KPI row, the filter and the
  // row badge — three places that must never disagree about what "live" means.
  const lifecycleById = useMemo(() => {
    const map = new Map<string, EventLifecycle>()
    for (const e of events) map.set(e.id, eventLifecycle(e.startsAt, e.endsAt, now))
    return map
  }, [events, now])

  // Open on Live when something is actually running, else Upcoming. Seeded
  // once rather than synced in an effect: landing on an empty Live tab on a
  // quiet Tuesday reads as "the page is broken", but an admin who then clicks
  // to Upcoming must not be yanked back.
  const [timeFilter, setTimeFilter] = useState<TimeFilter>(() =>
    events.some((e) => eventLifecycle(e.startsAt, e.endsAt, now) === 'live') ? 'live' : 'upcoming',
  )

  const counts = useMemo(() => {
    let live = 0
    let upcoming = 0
    for (const e of events) {
      const state = lifecycleById.get(e.id)
      if (state === 'live') live += 1
      if (state === 'upcoming') upcoming += 1
    }
    const withAttendants = events.filter((e) => e.activeAttendantsTotal > 0).length
    const adminAssigned = events.reduce((sum, e) => sum + e.activeAdminAttendants, 0)
    return { total: events.length, live, upcoming, withAttendants, adminAssigned }
  }, [events, lifecycleById])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let rows = events.filter((e) => {
      if (
        q &&
        !(
          e.name.toLowerCase().includes(q) ||
          e.coupleName.toLowerCase().includes(q) ||
          e.eventType.toLowerCase().includes(q) ||
          (e.venue?.toLowerCase().includes(q) ?? false)
        )
      ) {
        return false
      }
      if (typeFilter !== 'all' && e.eventType !== typeFilter) return false
      const state = lifecycleById.get(e.id)
      if (timeFilter === 'live' && state !== 'live') return false
      if (timeFilter === 'upcoming' && state !== 'upcoming') return false
      // Undated events have no past/future to sit in, so they surface only
      // under All rather than being silently filed as "past".
      if (timeFilter === 'past' && state !== 'ended') return false
      return true
    })

    rows = [...rows].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      const aTime = a.startsAt ? new Date(a.startsAt).getTime() : -Infinity
      const bTime = b.startsAt ? new Date(b.startsAt).getTime() : -Infinity
      return sort === 'soonest' ? aTime - bTime : bTime - aTime
    })
    return rows
  }, [events, query, typeFilter, timeFilter, sort, lifecycleById])

  return (
    // Horizontal padding comes from operations/layout.tsx — adding it here too
    // double-inset the content past the page header. The negative top margin
    // trims that layout's lg:py-10 down to the 24px the Digital Cards and
    // Couples lists sit at, so the KPI row tucks under the header the same way.
    // (The admin shell is desktop-only, so only the lg step matters.)
    <div className="space-y-5 lg:-mt-4">
      <CheckinNavTabs />

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Live now"
          value={String(counts.live)}
          hint={counts.live > 0 ? 'doors are open' : 'nothing running right now'}
          icon={<Radio className="h-4 w-4" />}
        />
        <Kpi label="Upcoming" value={String(counts.upcoming)} hint="events not yet held" icon={<CalendarClock className="h-4 w-4" />} />
        <Kpi
          label="Staffed with a scanner"
          value={String(counts.withAttendants)}
          hint="have at least one active attendant"
          icon={<UserCheck className="h-4 w-4" />}
        />
        <Kpi label="All events" value={String(counts.total)} hint="across every couple" icon={<CalendarCheck className="h-4 w-4" />} />
      </div>

      {/* Toolbar */}
      <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by event, couple, venue, or type…"
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pr-3 pl-9 text-sm text-gray-900 outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
            />
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
            {TIME_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setTimeFilter(f)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors',
                  timeFilter === f
                    ? 'bg-[#7E5896] text-white shadow-sm'
                    : 'text-gray-500 hover:text-[#7E5896]',
                )}
              >
                {/* A count only on Live: it is the one bucket where "is there
                    anything in here right now" is the question being asked. */}
                {f === 'live' && counts.live > 0 ? (
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      timeFilter === f ? 'bg-white' : 'animate-pulse bg-[#7ec24a]',
                    )}
                  />
                ) : null}
                {f}
                {f === 'live' && counts.live > 0 ? (
                  <span className="tabular-nums opacity-80">{counts.live}</span>
                ) : null}
              </button>
            ))}
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 capitalize outline-none focus:border-[#7E5896]"
          >
            <option value="all">All event types</option>
            {eventTypes.map((t) => (
              <option key={t} value={t} className="capitalize">
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>

          <div className="relative">
            <button
              onClick={() => setSortOpen((v) => !v)}
              onBlur={() => setTimeout(() => setSortOpen(false), 120)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:border-[#C9A0DC] hover:text-[#7E5896]"
            >
              {SORT_LABELS[sort]}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {sortOpen ? (
              <div className="absolute top-full right-0 z-10 mt-1 w-52 overflow-hidden rounded-lg border border-gray-100 bg-white py-1 shadow-lg">
                {(Object.keys(SORT_LABELS) as SortMode[]).map((s) => (
                  <button
                    key={s}
                    onMouseDown={() => setSort(s)}
                    className={cn(
                      'block w-full px-3 py-2 text-left text-xs',
                      sort === s
                        ? 'bg-[#F0DFF6] font-semibold text-[#5d3a78]'
                        : 'text-gray-600 hover:bg-gray-50',
                    )}
                  >
                    {SORT_LABELS[s]}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
        <div className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_130px_170px_140px] items-center gap-4 border-b border-gray-100 bg-gray-50/70 px-5 py-2.5 text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
          <span>Event</span>
          <span>Couple</span>
          <span>Date</span>
          <span>Scanning staff</span>
          <span></span>
        </div>
        {filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-500">No events match your filters.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((e) => (
              <div
                key={e.id}
                className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_130px_170px_140px] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-gray-50/60"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold uppercase',
                      eventTypeTone(e.eventType),
                    )}
                  >
                    {e.name.slice(0, 1)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-sm font-semibold text-gray-900">{e.name}</p>
                      {lifecycleById.get(e.id) === 'live' ? (
                        <span
                          className={cn(
                            'inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase',
                            LIFECYCLE_TONE.live,
                          )}
                        >
                          <span className="h-1 w-1 animate-pulse rounded-full bg-[#3d6b1f]" />
                          Live
                        </span>
                      ) : null}
                    </div>
                    {/* Venue under the name: it is what an operations caller
                        usually leads with ("the Hyatt one"), and it is now
                        searchable, so it needs to be visible to be trusted. */}
                    <p className="truncate text-xs text-gray-500 capitalize">
                      {e.eventType.replace(/_/g, ' ')}
                      {e.venue ? <span className="normal-case"> · {e.venue}</span> : null}
                    </p>
                  </div>
                </div>
                <p className="truncate text-sm text-gray-700">{e.coupleName}</p>
                <p className="text-sm text-gray-500">{formatDate(e.startsAt)}</p>
                <div className="min-w-0">
                  {e.activeAttendantsTotal > 0 ? (
                    <span
                      title={e.activeAdminNames.length > 0 ? e.activeAdminNames.join(', ') : undefined}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#7ec24a] bg-[#9FE870]/25 px-2.5 py-1 text-xs font-semibold text-[#3d6b1f]"
                    >
                      <Users className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {e.activeAdminNames.length > 0 ? e.activeAdminNames.join(', ') : `${e.activeAttendantsTotal} active`}
                      </span>
                      {/* Active attendants beyond the named ones are couple
                          self-serve tokens — no name is stored for those. */}
                      {e.activeAttendantsTotal > e.activeAdminNames.length ? (
                        <span className="shrink-0 text-[#3d6b1f]/70">
                          +{e.activeAttendantsTotal - e.activeAdminNames.length}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-500">
                      Unstaffed
                    </span>
                  )}
                </div>
                <Link
                  href={`/operations/checkin/${e.id}`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#7E5896] px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#6b4a80]"
                >
                  <QrCode className="h-3.5 w-3.5" /> Manage
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
