'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CalendarDays,
  CalendarOff,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Minus,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import {
  useOnboardingDraft,
  type AvailabilityDate,
} from '@/lib/onboarding/draft'
import type { CalendarBooking } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import { usePortalT, type Translator } from '@/components/providers/PortalUIStringsProvider'
import { loadAvailability, saveAvailability } from '../../../storefront/sections/actions'

// English-only, used for internal grid math and off-day note generation
// (stored data, not translated UI text — same scoping as bookings.ts's
// deriveAttention title/detail strings). Display text uses buildWeekdayLabels
// / buildMonthLabels below instead.
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

function buildWeekdayLabels(t: Translator): string[] {
  return [
    t('weekday_mon'), t('weekday_tue'), t('weekday_wed'), t('weekday_thu'),
    t('weekday_fri'), t('weekday_sat'), t('weekday_sun'),
  ]
}

function buildMonthLabels(t: Translator): string[] {
  return [
    t('month_january'), t('month_february'), t('month_march'), t('month_april'),
    t('month_may'), t('month_june'), t('month_july'), t('month_august'),
    t('month_september'), t('month_october'), t('month_november'), t('month_december'),
  ]
}

type CalendarView = 'month' | 'week' | 'day'

function buildBookingStatusMeta(t: Translator) {
  return {
    pending: {
      label: t('booking_status_pending'),
      pillClass: 'bg-amber-50 text-amber-700 border-amber-200',
      dotClass: 'bg-amber-500',
    },
    confirmed: {
      label: t('booking_status_confirmed'),
      pillClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      dotClass: 'bg-emerald-500',
    },
    completed: {
      label: t('booking_status_completed'),
      pillClass: 'bg-gray-100 text-gray-700 border-gray-200',
      dotClass: 'bg-gray-400',
    },
  } as const
}

// Availability palette — kept identical to the storefront availability page so
// the two calendars read as one colour system. Absence of an entry = Open;
// an explicit unavailable/limited entry overrides the weekly-closed backdrop.
type DayAvailability = 'open' | 'limited' | 'unavailable' | 'closed'

const AVAILABILITY_CELL_CLASS: Record<DayAvailability, string> = {
  open: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  limited: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
  unavailable: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
  closed: 'border-gray-200 bg-gray-50 text-gray-400 hover:bg-gray-100',
}

// Subtle diagonal hatch marking weekly-closed days on the calendar.
const CLOSED_HATCH = {
  backgroundImage:
    'repeating-linear-gradient(45deg, rgba(17,24,39,0.06) 0, rgba(17,24,39,0.06) 2px, transparent 2px, transparent 6px)',
} as const

// Denser, higher-contrast hatch for the small legend swatch so it reads clearly.
const CLOSED_HATCH_STRONG = {
  backgroundImage:
    'repeating-linear-gradient(45deg, rgba(17,24,39,0.45) 0, rgba(17,24,39,0.45) 1.5px, transparent 1.5px, transparent 4px)',
} as const

// JS getDay() order (0=Sun … 6=Sat) for mapping a date to its weekly-hours flag.
const WEEKDAY_KEY_ORDER = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

// Precedence: explicit unavailable > explicit limited > weekly closed > open.
const dayAvailability = (
  entry: AvailabilityDate | undefined,
  closedWeekday: boolean[],
  date: Date,
): DayAvailability => {
  if (entry?.status === 'unavailable') return 'unavailable'
  if (entry?.status === 'limited') return 'limited'
  if (closedWeekday[date.getDay()]) return 'closed'
  return 'open'
}

const formatISODate = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const parseISODate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const monthGrid = (year: number, month: number): Date[] => {
  const firstOfMonth = new Date(year, month, 1)
  const lead = (firstOfMonth.getDay() + 6) % 7
  const start = new Date(year, month, 1 - lead)
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

const weekGrid = (anchor: Date): Date[] => {
  const lead = (anchor.getDay() + 6) % 7
  const start = new Date(anchor)
  start.setDate(anchor.getDate() - lead)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

export default function BookingsCalendarClient({
  initialCalendarBookings,
}: {
  initialCalendarBookings: CalendarBooking[]
}) {
  const t = usePortalT('bookings')
  const monthLabels = buildMonthLabels(t)
  const { draft, update, hydrated } = useOnboardingDraft()

  const todayKey = formatISODate(new Date())
  const [view, setView] = useState<CalendarView>('month')
  const [anchor, setAnchor] = useState<Date>(() => new Date())
  const [selected, setSelected] = useState<string | null>(null)

  // Hydrate availability from the DB (source of truth) when the local draft is
  // empty — a fresh device / cleared storage would otherwise show no blocked
  // dates. Seed once, only when empty, so we never clobber unsaved edits.
  const seeded = useRef(false)
  useEffect(() => {
    if (!hydrated || seeded.current) return
    seeded.current = true
    if (draft.availability.length === 0) {
      void loadAvailability().then((res) => {
        if (res.ok && res.entries.length > 0) update({ availability: res.entries })
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

  // Business hours: this calendar only READS them (to grey weekly-closed days),
  // so it reads draft.hours directly rather than seeding from the DB. Seeding
  // here would clobber unsaved hours edits made on the shared availability page,
  // which writes the same draft store but has no way to signal "touched" across
  // routes. The availability editor owns loading/persisting hours.
  if (!hydrated) return <div className="p-8" aria-hidden />

  const offByDate = new Map(draft.availability.map((a) => [a.date, a]))

  // Weekly-closed weekdays, indexed by JS getDay() (0=Sun … 6=Sat).
  const closedWeekday = WEEKDAY_KEY_ORDER.map((k) => !draft.hours[k].open)

  const bookingsByDate = new Map<string, CalendarBooking[]>()
  for (const b of initialCalendarBookings) {
    const arr = bookingsByDate.get(b.date) ?? []
    arr.push(b)
    bookingsByDate.set(b.date, arr)
  }

  const capacity = draft.parallelBookingCapacity || 1

  // Persist an availability change back to the vendor record (source of truth),
  // optimistically updating the shared draft first. On failure we roll the draft
  // back to its previous state so the calendar never drifts from the DB. The
  // storefront Availability editor reads the same column, so edits made here show
  // up there too.
  const persistAvailability = (next: AvailabilityDate[]) => {
    const prev = draft.availability
    update({ availability: next })
    void saveAvailability(next).then((res) => {
      if (!res.ok) {
        update({ availability: prev })
        toast.error('Could not save your availability change. Please try again.')
      }
    })
  }

  const setOffDay = (date: string, note?: string) => {
    const without = draft.availability.filter((a) => a.date !== date)
    persistAvailability([...without, { date, status: 'unavailable', note }])
  }

  const clearOffDay = (date: string) => {
    persistAvailability(draft.availability.filter((a) => a.date !== date))
  }

  const setCapacity = (n: number) => {
    update({ parallelBookingCapacity: Math.max(1, Math.min(20, Math.round(n))) })
  }

  const stepBy = (deltaUnits: number) => {
    setAnchor((prev) => {
      const next = new Date(prev)
      if (view === 'month') next.setMonth(prev.getMonth() + deltaUnits)
      else if (view === 'week') next.setDate(prev.getDate() + deltaUnits * 7)
      else next.setDate(prev.getDate() + deltaUnits)
      return next
    })
  }

  const goToToday = () => {
    const now = new Date()
    setAnchor(now)
    setSelected(formatISODate(now))
  }

  const blockNonWorkingDay = (weekdayIndex: number) => {
    const grid = monthGrid(anchor.getFullYear(), anchor.getMonth())
    const targets = grid.filter(
      (d) => d.getMonth() === anchor.getMonth() && ((d.getDay() + 6) % 7) === weekdayIndex,
    )
    const without = draft.availability.filter(
      (a) => !targets.some((t) => formatISODate(t) === a.date),
    )
    const additions: AvailabilityDate[] = targets.map((t) => ({
      date: formatISODate(t),
      status: 'unavailable',
      note: `${WEEKDAY_LABELS[weekdayIndex]} closed`,
    }))
    persistAvailability([...without, ...additions])
  }

  const headerLabel = (() => {
    if (view === 'month') {
      return `${monthLabels[anchor.getMonth()]} ${anchor.getFullYear()}`
    }
    if (view === 'week') {
      const week = weekGrid(anchor)
      const start = week[0]
      const end = week[6]
      const sameMonth = start.getMonth() === end.getMonth()
      return sameMonth
        ? `${start.getDate()} – ${end.getDate()} ${monthLabels[start.getMonth()]} ${start.getFullYear()}`
        : `${start.getDate()} ${monthLabels[start.getMonth()].slice(0, 3)} – ${end.getDate()} ${monthLabels[end.getMonth()].slice(0, 3)} ${end.getFullYear()}`
    }
    return anchor.toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
  })()

  const selectedEntry = selected ? offByDate.get(selected) : undefined
  const selectedBookings = selected ? (bookingsByDate.get(selected) ?? []) : []
  const offDays = draft.availability.length
  const upcomingBookings = initialCalendarBookings.filter((b) => b.date >= todayKey).length
  const overcapacityDays = Array.from(bookingsByDate.entries()).filter(
    ([, list]) => list.length > capacity,
  ).length

  return (
    <div className="px-8 pt-5 pb-10">
      <div className="space-y-4">
        <CapacityCard
          capacity={capacity}
          onChange={setCapacity}
          upcomingBookings={upcomingBookings}
          overcapacityDays={overcapacityDays}
        />

        <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
          <div className="space-y-4">
            <section className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-5 lg:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-1">
                  <button data-opus-button="control"
                    type="button"
                    onClick={() => stepBy(-1)}
                    className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                    aria-label={t('calendar_previous')}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <h2 className="text-base font-semibold text-gray-900 tracking-tight tabular-nums px-2">
                    {headerLabel}
                  </h2>
                  <button data-opus-button="control"
                    type="button"
                    onClick={() => stepBy(1)}
                    className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                    aria-label={t('calendar_next')}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button data-opus-button="control"
                    type="button"
                    onClick={goToToday}
                    className="text-xs font-semibold text-gray-700 hover:text-gray-900 px-2.5 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
                  >
                    {t('calendar_today')}
                  </button>
                  <ViewToggle view={view} onChange={setView} />
                </div>
              </div>

              {view === 'month' ? (
                <MonthView
                  anchor={anchor}
                  todayKey={todayKey}
                  selected={selected}
                  offByDate={offByDate}
                  bookingsByDate={bookingsByDate}
                  capacity={capacity}
                  closedWeekday={closedWeekday}
                  onSelect={setSelected}
                  onWeekdayClick={blockNonWorkingDay}
                />
              ) : view === 'week' ? (
                <WeekView
                  anchor={anchor}
                  todayKey={todayKey}
                  selected={selected}
                  offByDate={offByDate}
                  bookingsByDate={bookingsByDate}
                  capacity={capacity}
                  closedWeekday={closedWeekday}
                  onSelect={setSelected}
                />
              ) : (
                <DayView
                  anchor={anchor}
                  todayKey={todayKey}
                  offByDate={offByDate}
                  bookings={bookingsByDate.get(formatISODate(anchor)) ?? []}
                  capacity={capacity}
                  closedWeekday={closedWeekday}
                  onSelect={setSelected}
                />
              )}

              <div className="mt-5 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-gray-700">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded bg-emerald-300 border border-emerald-500" /> {t('availability_open')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded bg-amber-300 border border-amber-500" /> {t('availability_limited')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded bg-rose-300 border border-rose-500" /> {t('availability_unavailable')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="w-3.5 h-3.5 rounded bg-gray-200 border border-gray-400"
                    style={CLOSED_HATCH_STRONG}
                  />{' '}
                  {t('availability_closed')}
                </span>
                <span className="inline-flex items-center gap-1.5 text-gray-600">
                  <span className="w-3.5 h-3.5 rounded border border-emerald-200 bg-emerald-50 flex items-center justify-center">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </span>
                  {t('availability_booking')}
                </span>
                <span className="inline-flex items-center gap-1.5 text-rose-600 font-semibold">
                  <AlertTriangle className="w-3 h-3" />
                  {t('availability_over_capacity')}
                </span>
              </div>
            </section>

            <section className="grid grid-cols-3 gap-3">
              <StatTile
                icon={<CalendarRange className="w-4 h-4 text-emerald-600" />}
                label={t('stat_upcoming_bookings')}
                count={upcomingBookings}
                hint={t('stat_upcoming_hint')}
              />
              <StatTile
                icon={<CalendarOff className="w-4 h-4 text-gray-500" />}
                label={t('stat_off_days')}
                count={offDays}
                hint={t('stat_off_days_hint')}
              />
              <StatTile
                icon={<AlertTriangle className="w-4 h-4 text-rose-600" />}
                label={t('stat_over_capacity')}
                count={overcapacityDays}
                hint={t('stat_over_capacity_hint', { capacity })}
              />
            </section>
          </div>

          <aside className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-5 lg:p-6 h-fit lg:sticky lg:top-4">
            {selected ? (
              <SelectedDatePanel
                iso={selected}
                entry={selectedEntry}
                bookings={selectedBookings}
                capacity={capacity}
                onMarkOff={(note) => setOffDay(selected, note)}
                onClear={() => clearOffDay(selected)}
                onClose={() => setSelected(null)}
              />
            ) : (
              <EmptyPanel />
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}

/* ---------- Capacity card ---------- */

function CapacityCard({
  capacity, onChange, upcomingBookings, overcapacityDays,
}: {
  capacity: number
  onChange: (n: number) => void
  upcomingBookings: number
  overcapacityDays: number
}) {
  const t = usePortalT('bookings')
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-5 lg:p-6 flex flex-wrap items-center gap-5">
      <span className="w-10 h-10 rounded-xl bg-gray-100 text-gray-700 flex items-center justify-center shrink-0">
        <Users className="w-5 h-5" />
      </span>
      <div className="flex-1 min-w-[260px]">
        <h3 className="text-sm font-semibold text-gray-900">{t('capacity_title')}</h3>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{t('capacity_desc')}</p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button data-opus-button="control"
          type="button"
          onClick={() => onChange(capacity - 1)}
          disabled={capacity <= 1}
          className="w-9 h-9 rounded-lg border border-gray-200 text-gray-700 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
          aria-label={t('capacity_decrease')}
        >
          <Minus className="w-4 h-4" />
        </button>
        <input
          type="number"
          min={1}
          max={20}
          value={capacity}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-14 text-center text-xl font-semibold text-gray-900 tabular-nums bg-white border border-gray-200 rounded-lg py-1.5 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none"
        />
        <button data-opus-button="control"
          type="button"
          onClick={() => onChange(capacity + 1)}
          disabled={capacity >= 20}
          className="w-9 h-9 rounded-lg border border-gray-200 text-gray-700 hover:border-gray-400 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
          aria-label={t('capacity_increase')}
        >
          <Plus className="w-4 h-4" />
        </button>
        <span className="text-xs text-gray-500 ml-1">{t('capacity_per_day')}</span>
      </div>

      <div className="basis-full sm:basis-auto sm:ml-auto flex items-center gap-2">
        {overcapacityDays > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
            <AlertTriangle className="w-3 h-3" />
            {overcapacityDays} {overcapacityDays === 1 ? t('capacity_over_capacity_singular') : t('capacity_over_capacity_plural')}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700">
          {upcomingBookings} {t('capacity_upcoming_bookings_suffix')}
        </span>
      </div>
    </section>
  )
}

/* ---------- View toggle ---------- */

function ViewToggle({ view, onChange }: { view: CalendarView; onChange: (v: CalendarView) => void }) {
  const t = usePortalT('bookings')
  const options: { id: CalendarView; label: string }[] = [
    { id: 'month', label: t('view_month') },
    { id: 'week', label: t('view_week') },
    { id: 'day', label: t('view_day') },
  ]
  return (
    <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
      {options.map((o) => (
        <button data-opus-button="control"
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            'text-xs font-semibold px-3 py-1.5 rounded-md transition-colors',
            view === o.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900',
          )}
          aria-pressed={view === o.id}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- Month view ---------- */

function MonthView({
  anchor, todayKey, selected, offByDate, bookingsByDate, capacity, closedWeekday, onSelect, onWeekdayClick,
}: {
  anchor: Date
  todayKey: string
  selected: string | null
  offByDate: Map<string, AvailabilityDate>
  bookingsByDate: Map<string, CalendarBooking[]>
  capacity: number
  closedWeekday: boolean[]
  onSelect: (iso: string) => void
  onWeekdayClick: (idx: number) => void
}) {
  const t = usePortalT('bookings')
  const weekdayLabels = buildWeekdayLabels(t)
  const grid = monthGrid(anchor.getFullYear(), anchor.getMonth())
  return (
    <>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_LABELS.map((w, i) => (
          <div key={w} className="text-[10px] font-bold uppercase tracking-wider text-gray-400 text-center py-1.5">
            <button data-opus-button="control"
              type="button"
              onClick={() => onWeekdayClick(i)}
              className="hover:text-gray-700 transition-colors"
              title={t('block_weekday_tooltip', { weekday: weekdayLabels[i] })}
            >
              {weekdayLabels[i]}
            </button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {grid.map((d) => {
          const iso = formatISODate(d)
          const inMonth = d.getMonth() === anchor.getMonth()
          const isToday = iso === todayKey
          const isSelected = iso === selected
          const isPast = iso < todayKey
          const off = offByDate.get(iso)
          const avail = dayAvailability(off, closedWeekday, d)
          const isClosed = avail === 'closed'
          const bookings = bookingsByDate.get(iso) ?? []
          const over = bookings.length > capacity
          return (
            <button data-opus-button="neutral" data-opus-button-size="medium"
              key={iso}
              type="button"
              onClick={() => onSelect(iso)}
              style={isClosed ? CLOSED_HATCH : undefined}
              className={cn(
                'relative aspect-square rounded-lg border text-left transition-colors p-1.5 flex flex-col gap-0.5 overflow-hidden',
                isPast ? 'bg-white border-gray-100 text-gray-300 hover:bg-gray-50' : AVAILABILITY_CELL_CLASS[avail],
                !inMonth && 'opacity-40',
                isToday && !isSelected && 'ring-2 ring-gray-900/30 ring-offset-1',
                over && 'ring-1 ring-rose-400',
                isSelected && 'ring-2 ring-gray-900 ring-offset-1',
              )}
            >
              <span className="text-xs font-semibold tabular-nums">
                {d.getDate()}
              </span>
              {off?.note ? (
                <span className="text-[9px] leading-tight font-bold uppercase tracking-wider mt-auto truncate">
                  {off.note}
                </span>
              ) : bookings.length > 0 ? (
                <span className="text-[9px] leading-tight font-medium mt-auto truncate text-gray-700">
                  {bookings[0].couple}
                  {bookings.length > 1 ? ` +${bookings.length - 1}` : ''}
                </span>
              ) : null}
              {bookings.length > 0 ? (
                <span className="absolute top-1 right-1.5 text-[9px] font-bold tabular-nums text-gray-500">
                  {bookings.length}
                </span>
              ) : null}
              {over ? (
                <span className="absolute bottom-1 right-1 text-rose-600">
                  <AlertTriangle className="w-3 h-3" />
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </>
  )
}

/* ---------- Week view ---------- */

function WeekView({
  anchor, todayKey, selected, offByDate, bookingsByDate, capacity, closedWeekday, onSelect,
}: {
  anchor: Date
  todayKey: string
  selected: string | null
  offByDate: Map<string, AvailabilityDate>
  bookingsByDate: Map<string, CalendarBooking[]>
  capacity: number
  closedWeekday: boolean[]
  onSelect: (iso: string) => void
}) {
  const t = usePortalT('bookings')
  const weekdayLabels = buildWeekdayLabels(t)
  const week = weekGrid(anchor)
  return (
    <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
      {week.map((d) => {
        const iso = formatISODate(d)
        const isToday = iso === todayKey
        const isSelected = iso === selected
        const isPast = iso < todayKey
        const off = offByDate.get(iso)
        const avail = dayAvailability(off, closedWeekday, d)
        const isClosed = avail === 'closed'
        const availLabel =
          avail === 'unavailable' ? t('availability_unavailable') : avail === 'limited' ? t('availability_limited') : avail === 'closed' ? t('availability_closed') : null
        const bookings = bookingsByDate.get(iso) ?? []
        const over = bookings.length > capacity
        return (
          <button data-opus-button="neutral" data-opus-button-size="medium"
            key={iso}
            type="button"
            onClick={() => onSelect(iso)}
            style={isClosed ? CLOSED_HATCH : undefined}
            className={cn(
              'min-h-[180px] rounded-lg border p-2 flex flex-col text-left transition-colors',
              isPast ? 'bg-white border-gray-100 text-gray-300 hover:bg-gray-50' : AVAILABILITY_CELL_CLASS[avail],
              isToday && !isSelected && 'ring-2 ring-gray-900/30 ring-offset-1',
              over && 'ring-1 ring-rose-400',
              isSelected && 'ring-2 ring-gray-900 ring-offset-1',
            )}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">
                {weekdayLabels[(d.getDay() + 6) % 7]}
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {d.getDate()}
              </span>
            </div>
            {availLabel || off?.note ? (
              <span className="text-[10px] leading-tight font-bold uppercase tracking-wider">
                {off?.note ?? availLabel}
              </span>
            ) : null}
            <div className="space-y-1 mt-1 flex-1">
              {bookings.map((b) => <BookingChip key={b.id} booking={b} dense />)}
            </div>
            <span className="mt-1 text-[10px] text-gray-500 tabular-nums">
              {bookings.length}/{capacity}
              {over ? <span className="ml-1 text-rose-600 font-semibold">{t('week_view_over')}</span> : ''}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ---------- Day view ---------- */

function DayView({
  anchor, todayKey, offByDate, bookings, capacity, closedWeekday, onSelect,
}: {
  anchor: Date
  todayKey: string
  offByDate: Map<string, AvailabilityDate>
  bookings: CalendarBooking[]
  capacity: number
  closedWeekday: boolean[]
  onSelect: (iso: string) => void
}) {
  const t = usePortalT('bookings')
  const iso = formatISODate(anchor)
  const off = offByDate.get(iso)
  const avail = dayAvailability(off, closedWeekday, anchor)
  const isClosed = avail === 'closed'
  const isToday = iso === todayKey
  const over = bookings.length > capacity
  const sorted = [...bookings].sort((a, b) => a.startTime.localeCompare(b.startTime))

  const parseHour = (t: string) => { const h = parseInt(t.slice(0, 2), 10); return Number.isFinite(h) ? h : 0 }
  const earliest = sorted.length ? Math.min(...sorted.map((b) => parseHour(b.startTime))) : 9
  const latest = sorted.length ? Math.max(...sorted.map((b) => parseHour(b.endTime))) : 21
  const startHour = Math.max(0, Math.min(earliest, 9))
  const endHour = Math.min(24, Math.max(latest, 21))
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i)

  useEffect(() => {
    onSelect(iso)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso])

  const availLabel =
    avail === 'unavailable' ? t('availability_unavailable') : avail === 'limited' ? t('availability_limited') : avail === 'closed' ? t('availability_closed') : t('availability_open')
  const availPillClass =
    avail === 'unavailable'
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : avail === 'limited'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : avail === 'closed'
          ? 'bg-gray-50 text-gray-500 border-gray-200'
          : 'bg-emerald-50 text-emerald-700 border-emerald-200'

  return (
    <div
      style={isClosed ? CLOSED_HATCH : undefined}
      className={cn('rounded-xl border p-4', AVAILABILITY_CELL_CLASS[avail], isToday && 'ring-1 ring-gray-900')}
    >
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">
          {anchor.toLocaleDateString('en-GB', { weekday: 'long' })}
        </span>
        <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border', availPillClass)}>
          {availLabel}
        </span>
        {off?.note ? (
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/70 text-gray-700 border border-gray-200">
            {off.note}
          </span>
        ) : null}
        {over ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
            <AlertTriangle className="w-3 h-3" />
            {t('day_view_over_capacity', { bookings: bookings.length, capacity })}
          </span>
        ) : (
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-gray-50 text-gray-600 border border-gray-200 tabular-nums">
            {t('day_view_booked', { bookings: bookings.length, capacity })}
          </span>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-4 py-10 text-center">
          <p className="text-sm text-gray-500">
            {off ? t('day_view_no_bookings_off') : t('day_view_no_bookings')}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 -mx-2">
          {hours.map((h) => {
            const slot = `${String(h).padStart(2, '0')}:00`
            const overlapping = sorted.filter((b) => {
              const start = parseHour(b.startTime)
              const end = parseHour(b.endTime)
              return h >= start && h < end
            })
            const startsHere = sorted.filter((b) => parseHour(b.startTime) === h)
            return (
              <li key={h} className="flex items-stretch gap-3 px-2 py-2 min-h-[44px]">
                <span className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-gray-400 tabular-nums pt-1">
                  {slot}
                </span>
                <div className="flex-1 min-w-0 flex flex-wrap gap-1.5">
                  {startsHere.length > 0
                    ? startsHere.map((b) => <BookingChip key={b.id} booking={b} />)
                    : overlapping.length > 0
                      ? overlapping.map((b) => (
                          <span key={`${b.id}-cont`} className="text-[10px] text-gray-400 italic">
                            {t('day_view_continues', { couple: b.couple })}
                          </span>
                        ))
                      : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/* ---------- Booking chip ---------- */

function BookingChip({ booking, dense }: { booking: CalendarBooking; dense?: boolean }) {
  const t = usePortalT('bookings')
  const meta = buildBookingStatusMeta(t)[booking.status]
  return (
    <Link
      href={`/bookings/${booking.id}`}
      onClick={(e) => e.stopPropagation()}
      className={cn('group block rounded-md border px-2 py-1 transition-colors', meta.pillClass, 'hover:brightness-95')}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-[10px] font-semibold truncate">
          {booking.startTime} {booking.couple}
        </span>
      </div>
      {!dense ? (
        <p className="text-[10px] opacity-80 mt-0.5 truncate">
          {booking.packageName} · {booking.location}
        </p>
      ) : null}
    </Link>
  )
}

/* ---------- Side panel ---------- */

function SelectedDatePanel({
  iso, entry, bookings, capacity, onMarkOff, onClear, onClose,
}: {
  iso: string
  entry: AvailabilityDate | undefined
  bookings: CalendarBooking[]
  capacity: number
  onMarkOff: (note?: string) => void
  onClear: () => void
  onClose: () => void
}) {
  const t = usePortalT('bookings')
  const [note, setNote] = useState(entry?.note ?? '')

  useEffect(() => {
    setNote(entry?.note ?? '')
  }, [iso, entry?.note])

  const date = parseISODate(iso)
  const headline = date.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const isOff = Boolean(entry)
  const over = bookings.length > capacity

  return (
    <div>
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{t('panel_selected_date')}</p>
        <button data-opus-button="control"
          type="button"
          onClick={onClose}
          className="p-1 -mr-1 -mt-0.5 text-gray-400 hover:text-gray-700 rounded-md transition-colors"
          aria-label={t('panel_close')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <h3 className="text-sm font-semibold text-gray-900 leading-snug">{headline}</h3>

      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {isOff ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border bg-gray-100 text-gray-700 border-gray-200">
            <CalendarOff className="w-3 h-3" />
            {t('panel_off')}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200">
            <CalendarDays className="w-3 h-3" />
            {t('panel_operating')}
          </span>
        )}
        <span
          className={cn(
            'inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border tabular-nums',
            over ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-gray-50 text-gray-600 border-gray-200',
          )}
        >
          {over ? <AlertTriangle className="w-3 h-3" /> : null}
          {t('panel_booked', { bookings: bookings.length, capacity })}
        </span>
      </div>

      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-5 mb-2">{t('panel_status_label')}</p>
      <div className="grid grid-cols-2 gap-1.5">
        <button data-opus-button="neutral" data-opus-button-size="small"
          type="button"
          onClick={onClear}
          className={cn(
            'text-xs font-semibold py-2 rounded-md border transition-colors',
            !isOff ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400',
          )}
        >
          {t('panel_button_operating')}
        </button>
        <button data-opus-button="neutral" data-opus-button-size="small"
          type="button"
          onClick={() => onMarkOff(note.trim() || undefined)}
          className={cn(
            'text-xs font-semibold py-2 rounded-md border transition-colors',
            isOff ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400',
          )}
        >
          {t('panel_button_mark_off')}
        </button>
      </div>

      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-5 mb-2">{t('panel_off_day_note_label')}</p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => { onMarkOff(note.trim() || undefined) }}
        placeholder={t('panel_off_day_placeholder')}
        rows={3}
        className="w-full text-xs bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none resize-none"
      />
      <p className="text-[10px] text-gray-400 mt-1">{t('panel_off_day_hint')}</p>

      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-6 mb-2">
        {t('panel_bookings_header', { bookings: bookings.length })}
      </p>
      {bookings.length === 0 ? (
        <p className="text-xs text-gray-500 italic">{t('panel_no_bookings')}</p>
      ) : (
        <ul className="space-y-2">
          {bookings.map((b) => (
            <li key={b.id}>
              <Link
                href={`/bookings/${b.id}`}
                className={cn('block rounded-md border px-3 py-2 hover:bg-gray-50 transition-colors', buildBookingStatusMeta(t)[b.status].pillClass)}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold truncate">
                    {b.startTime}–{b.endTime} · {b.couple}
                  </span>
                  <ExternalLink className="w-3 h-3 ml-auto opacity-60" />
                </div>
                <p className="text-[10px] opacity-80 mt-0.5 truncate">{b.packageName} · {b.location}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {isOff ? (
        <button data-opus-button="control"
          type="button"
          onClick={onClear}
          className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t('panel_clear_off_day')}
        </button>
      ) : null}
    </div>
  )
}

function EmptyPanel() {
  const t = usePortalT('bookings')
  return (
    <div className="text-center py-6">
      <span className="mx-auto w-10 h-10 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center">
        <CalendarDays className="w-5 h-5" />
      </span>
      <p className="text-sm font-semibold text-gray-900 mt-3">{t('empty_panel_title')}</p>
      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{t('empty_panel_desc')}</p>
    </div>
  )
}

function StatTile({ icon, label, count, hint }: { icon: React.ReactNode; label: string; count: number; hint?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3">
      <span className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
        <p className="text-lg font-semibold text-gray-900 tabular-nums leading-none mt-0.5">{count}</p>
        {hint ? <p className="text-[10px] text-gray-400 mt-0.5 truncate">{hint}</p> : null}
      </div>
    </div>
  )
}
