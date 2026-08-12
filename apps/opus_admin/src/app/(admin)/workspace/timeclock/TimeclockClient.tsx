'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  CalendarClock,
  ClipboardList,
  Coffee,
  FilePenLine,
  History,
  LogIn,
  LogOut,
  MapPin,
  Play,
  ShieldCheck,
  Timer,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMinutes, toDecimalHours } from '@/lib/attendance/hours'
import { availableActions, stateLabel, type AttendanceState } from '@/lib/attendance/state'
import type { AttendanceOverview, AttendancePunch } from '@/lib/attendance/queries'
import type {
  ClockPosition,
  ClockResult,
  CorrectionInput,
  CorrectionResult,
  SubmitTimesheetResult,
} from './actions'
import { WS } from '../_components/ui'
import { humanizeShiftType } from '../_lib/labels'

// The clock face and the day's record.
//
// THE ONE PLACE THE BROWSER CLOCK IS USED. `serverNow` arrives with the page.
// We measure the offset between it and the browser once, then tick the live
// counter against the corrected time. A browser eight minutes fast therefore
// shows the same elapsed minutes as one that is correct, and nothing derived
// from Date.now() is ever sent back to be stored.

type Actions = {
  clockIn: (position?: ClockPosition) => Promise<ClockResult>
  clockOut: (position?: ClockPosition) => Promise<ClockResult>
  startBreak: (breakType?: string) => Promise<ClockResult>
  endBreak: () => Promise<ClockResult>
  requestCorrection: (input: CorrectionInput) => Promise<CorrectionResult>
  submitTimesheet: (periodStart: string) => Promise<SubmitTimesheetResult>
}

const STATE_TONE: Record<AttendanceState, string> = {
  off_clock: 'bg-gray-100 text-gray-700',
  clocked_in: 'bg-emerald-50 text-emerald-700',
  on_break: 'bg-amber-50 text-amber-700',
  clocked_out: 'bg-gray-100 text-gray-700',
  auto_closed: 'bg-rose-50 text-rose-700',
  pending_correction: 'bg-amber-50 text-amber-700',
}

const STATE_ICON: Record<AttendanceState, typeof Timer> = {
  off_clock: LogOut,
  clocked_in: Timer,
  on_break: Coffee,
  clocked_out: LogOut,
  auto_closed: AlertTriangle,
  pending_correction: FilePenLine,
}

function formatClock(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  })
}

function formatDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

/** Ask the browser for a position. Resolves undefined when unavailable.
 *  Callers that require a fix must treat undefined as a hard stop. */
function readPosition(timeoutMs = 12000): Promise<ClockPosition | undefined> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(undefined)
  }
  return new Promise((resolve) => {
    let settled = false
    const done = (value: ClockPosition | undefined) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const timer = setTimeout(() => done(undefined), timeoutMs)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer)
        done({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        })
      },
      () => {
        clearTimeout(timer)
        done(undefined)
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15_000 },
    )
  })
}

function sessionSpanLabel(
  session: { openedAt: string; closedAt: string | null; payableMinutes: number },
  timeZone: string,
): string {
  const start = formatClock(session.openedAt, timeZone)
  const end = session.closedAt ? formatClock(session.closedAt, timeZone) : 'now'
  // Same-minute in/out looks broken as "12:48 to 12:48" — say so plainly.
  if (session.closedAt && start === end && session.payableMinutes < 1) {
    return `Brief punch at ${start}`
  }
  return `${start} – ${end}`
}

function parseHHMM(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + (m || 0)
}

/** How far through the expected shift window "now" is (0–1), in the schedule TZ. */
function dayWindowProgress(
  serverNow: string,
  timeZone: string,
  startHHMM: string,
  endHHMM: string,
): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(serverNow))
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  const nowMins = hour * 60 + minute
  const start = parseHHMM(startHHMM)
  const end = parseHHMM(endHHMM)
  if (end <= start) return 0
  if (nowMins <= start) return 0
  if (nowMins >= end) return 1
  return (nowMins - start) / (end - start)
}

function addCalendarDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S'] as const

function buildWeekBars(input: {
  weekStart: string
  today: string
  sessions: { businessDate: string; payableMinutes: number; closedAt: string | null }[]
  openMinutes: number
}): { date: string; label: string; minutes: number; isWorkingSlot: boolean }[] {
  const byDate = new Map<string, number>()
  for (const s of input.sessions) {
    // Open sessions have provisional totals; live minutes are layered on separately.
    if (s.closedAt === null) continue
    byDate.set(s.businessDate, (byDate.get(s.businessDate) ?? 0) + s.payableMinutes)
  }
  if (input.openMinutes > 0) {
    byDate.set(input.today, (byDate.get(input.today) ?? 0) + input.openMinutes)
  }

  // Mon–Sat company week (Sunday omitted — rest day by default).
  return WEEKDAY_LABELS.map((label, i) => {
    const date = addCalendarDays(input.weekStart, i)
    return {
      date,
      label,
      minutes: byDate.get(date) ?? 0,
      isWorkingSlot: true,
    }
  })
}

export default function TimeclockClient({
  overview,
  punches,
  actions,
}: {
  employeeName: string
  overview: AttendanceOverview
  punches: AttendancePunch[]
  actions: Actions
}) {
  const [pending, startTransition] = useTransition()
  const [locating, setLocating] = useState(false)
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null)
  const [showCorrection, setShowCorrection] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const session = overview.openSession
  const [liveMinutes, setLiveMinutes] = useState(overview.openSessionMinutes)

  const [seenSnapshot, setSeenSnapshot] = useState(overview.serverNow)
  if (seenSnapshot !== overview.serverNow) {
    setSeenSnapshot(overview.serverNow)
    setLiveMinutes(overview.openSessionMinutes)
  }

  useEffect(() => {
    if (!session) return

    const offsetMs = Date.now() - new Date(overview.serverNow).getTime()
    const recompute = () => {
      const serverMs = Date.now() - offsetMs
      const grossMs = serverMs - new Date(session.openedAt).getTime()
      let breakMs = 0
      for (const b of session.breaks) {
        const end = b.endedAt ? new Date(b.endedAt).getTime() : serverMs
        breakMs += end - new Date(b.startedAt).getTime()
      }
      setLiveMinutes(Math.max(0, Math.round((grossMs - breakMs) / 60_000)))
    }

    const id = setInterval(recompute, 30_000)
    return () => clearInterval(id)
  }, [session, overview.serverNow])

  const allowed = availableActions(overview.state)
  const onClock = Boolean(overview.openSession)
  const workedToday = overview.todayTotals.workedMinutes > 0
  const shiftMode = overview.shift?.workMode
    ? humanizeShiftType(overview.shift.workMode)
    : overview.openSession?.workMode
      ? humanizeShiftType(overview.openSession.workMode)
      : null
  const expectedStart = overview.shift?.startTime?.slice(0, 5) ?? null
  const expectedEnd = overview.shift?.endTime?.slice(0, 5) ?? null
  const expectedWindow =
    expectedStart && expectedEnd ? `${expectedStart}–${expectedEnd}` : null
  const expectedDayMinutes = overview.shift?.standardDailyMinutes ?? 480
  const entitledBreakMinutes = overview.shift?.unpaidBreakMinutes ?? 30
  const todayWorkedMinutes = onClock
    ? liveMinutes + overview.todayTotals.workedMinutes
    : overview.todayTotals.workedMinutes
  const dayProgress = Math.min(1, todayWorkedMinutes / Math.max(1, expectedDayMinutes))
  const dayProgressPct = Math.round(dayProgress * 100)
  const shiftProgress =
    expectedStart && expectedEnd
      ? dayWindowProgress(overview.serverNow, overview.timezone, expectedStart, expectedEnd)
      : null
  const weekBars = buildWeekBars({
    weekStart: overview.weekStart,
    today: overview.today,
    sessions: overview.weekSessions,
    openMinutes: onClock && overview.openSession?.businessDate === overview.today ? liveMinutes : 0,
  })
  const weekExpectedMinutes = expectedDayMinutes * 6
  const weekProgress = Math.min(
    1,
    (overview.weekTotals.payableMinutes + (onClock ? liveMinutes : 0)) /
      Math.max(1, weekExpectedMinutes),
  )

  const locationRequired = overview.shift?.geolocationMode === 'required'
  const locationOptional = overview.shift?.geolocationMode === 'optional'
  const locationOff = !overview.shift || overview.shift.geolocationMode === 'off'
  const locationLabel = overview.shift?.locationLabel ?? 'Samaki Wabichi Annex, Mbezi Beach'
  const busy = pending || locating

  const run = (fn: () => Promise<ClockResult>) => {
    setMessage(null)
    startTransition(async () => {
      const result = await fn()
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error })
      }
    })
  }

  const runWithLocation = (fn: (position?: ClockPosition) => Promise<ClockResult>) => {
    setMessage(null)
    startTransition(async () => {
      // Remote (off): skip GPS entirely. Hybrid (optional) / office (required): ask.
      let position: ClockPosition | undefined
      if (!locationOff) {
        setLocating(true)
        position = await readPosition()
        setLocating(false)
      }

      if (locationRequired && !position) {
        setMessage({
          tone: 'error',
          text: `In-office shifts need your location at ${locationLabel}. Allow location access in your browser and try again.`,
        })
        return
      }

      const result = await fn(position)
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error })
      }
    })
  }

  const StatusIcon = STATE_ICON[overview.state]

  return (
    <div className="space-y-4">
      {/* ---- Punch strip: answers "am I on the clock?" ---- */}
      <section className={cn(WS.card, 'overflow-hidden')}>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                STATE_TONE[overview.state],
              )}
            >
              <StatusIcon className="h-3.5 w-3.5" strokeWidth={2} />
              {stateLabel(overview.state)}
            </span>

            {onClock ? (
              <>
                <p className="mt-2 flex items-baseline gap-2 text-3xl font-semibold tracking-tight text-gray-900 tabular-nums">
                  <Timer className="h-6 w-6 shrink-0 text-emerald-600" strokeWidth={2} />
                  {formatMinutes(liveMinutes)}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  On the clock since{' '}
                  {formatClock(overview.openSession!.openedAt, overview.timezone)}
                </p>
              </>
            ) : (
              <p className="mt-2 text-xl font-semibold tracking-tight text-gray-900">
                {workedToday ? "You're off the clock" : 'Ready when you are'}
              </p>
            )}

            {overview.openSession?.locationLabel && (
              <p className="mt-2 flex items-center gap-1.5 text-[13px] text-gray-500">
                <MapPin className="h-3.5 w-3.5" strokeWidth={1.75} />
                {overview.openSession.locationLabel}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {allowed.includes('clock_in') && (
              <button
                data-opus-button="primary"
                data-opus-button-size="medium"
                type="button"
                disabled={busy}
                onClick={() => runWithLocation((pos) => actions.clockIn(pos))}
                className={cn(WS.btnPrimary, 'px-5')}
              >
                <LogIn className="h-4 w-4" strokeWidth={2} />
                {locating ? 'Getting location…' : 'Clock in'}
              </button>
            )}
            {allowed.includes('start_break') && (
              <button
                data-opus-button="control"
                type="button"
                disabled={busy}
                onClick={() => run(() => actions.startBreak('rest'))}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-50 disabled:opacity-50"
              >
                <Coffee className="h-4 w-4" strokeWidth={2} />
                Start break
              </button>
            )}
            {allowed.includes('end_break') && (
              <button
                data-opus-button="primary"
                data-opus-button-size="medium"
                type="button"
                disabled={busy}
                onClick={() => run(() => actions.endBreak())}
                className={cn(WS.btnPrimary, 'px-5')}
              >
                <Play className="h-4 w-4" strokeWidth={2} />
                End break
              </button>
            )}
            {allowed.includes('clock_out') && (
              <button
                data-opus-button="control"
                type="button"
                disabled={busy}
                onClick={() => runWithLocation((pos) => actions.clockOut(pos))}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" strokeWidth={2} />
                {locating ? 'Getting location…' : 'Clock out'}
              </button>
            )}
          </div>
        </div>

        {message && (
          <p
            className={cn(
              'border-t border-gray-100 px-5 py-3 text-sm',
              message.tone === 'error' ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800',
            )}
          >
            {message.text}
          </p>
        )}
      </section>

      {overview.needsCorrection.length > 0 && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-rose-900">
            <AlertTriangle className="h-4 w-4" strokeWidth={1.75} />
            {overview.needsCorrection.length === 1
              ? 'A session was closed automatically'
              : `${overview.needsCorrection.length} sessions were closed automatically`}
          </h2>
          <p className="mt-1 text-sm text-rose-900/90">
            You didn&apos;t clock out, so the system closed the session at its scheduled end.
            Request a correction if the hours are wrong — your original punches stay on file.
          </p>
          <button
            data-opus-button="control"
            type="button"
            onClick={() => setShowCorrection(true)}
            className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-50"
          >
            <FilePenLine className="h-4 w-4" strokeWidth={2} />
            Request a correction
          </button>
        </section>
      )}

      {/* ---- Expected / worked today / week ---- */}
      <section className={cn(WS.card, 'overflow-hidden')}>
        <div className="grid grid-cols-1 divide-y divide-gray-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="px-5 py-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
              <CalendarClock className="h-3.5 w-3.5" strokeWidth={1.75} />
              Expected today
            </p>
            {overview.shift ? (
              <>
                <p className="mt-1 text-sm font-semibold text-gray-900">
                  {expectedWindow
                    ? expectedWindow
                    : overview.shift.isWorkingDay === false
                      ? 'Rest day'
                      : overview.shift.isHoliday
                        ? (overview.shift.holidayName ?? 'Public holiday')
                        : 'No fixed hours'}
                </p>
                <p className="mt-0.5 text-[12px] text-gray-500">
                  {[
                    expectedWindow ? `${formatMinutes(expectedDayMinutes)} day` : null,
                    shiftMode,
                    overview.shift.isHoliday
                      ? (overview.shift.holidayName ?? 'Public holiday')
                      : null,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </p>
                {expectedWindow && shiftProgress !== null && overview.shift.isWorkingDay !== false && (
                  <div className="mt-3">
                    <div className="relative h-2.5 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-[#F0DFF6] transition-[width] duration-500 ease-out"
                        style={{ width: `${Math.round(shiftProgress * 100)}%` }}
                      />
                      <div
                        className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#7E5896] shadow-sm transition-[left] duration-500 ease-out"
                        style={{ left: `${Math.round(shiftProgress * 100)}%` }}
                        title="Now"
                      />
                    </div>
                    <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-gray-400">
                      <span>{expectedStart}</span>
                      <span>Now</span>
                      <span>{expectedEnd}</span>
                    </div>
                  </div>
                )}
                {entitledBreakMinutes > 0 && (
                  <p className="mt-2 flex items-center gap-1.5 text-[12px] text-gray-500">
                    <Coffee className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {formatMinutes(entitledBreakMinutes)} break entitled
                  </p>
                )}
                {overview.shift.locationLabel && (
                  <p className="mt-1.5 flex items-center gap-1 text-[12px] text-gray-400">
                    <MapPin className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {overview.shift.locationLabel}
                  </p>
                )}
                {(locationRequired || locationOptional || shiftMode) && (
                  <p className="mt-1.5 flex items-center gap-1 text-[12px] text-gray-400">
                    <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {locationRequired
                      ? `In-office — must punch at ${locationLabel}`
                      : locationOptional
                        ? `Hybrid — location optional (${overview.shift.geofenceRadiusM}m)`
                        : `${shiftMode ?? 'Remote'} — no location check`}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="mt-1 text-sm font-semibold text-gray-900">09:00–17:00</p>
                <p className="mt-0.5 text-[12px] text-gray-500">8h day</p>
                <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-gray-500">
                  <Coffee className="h-3.5 w-3.5" strokeWidth={1.75} />
                  30m break entitled
                </p>
                <p className="mt-1.5 text-[12px] text-gray-400">
                  Ask People Ops if your rota differs
                </p>
              </>
            )}
          </div>

          <div className="px-5 py-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
              <Timer className="h-3.5 w-3.5" strokeWidth={1.75} />
              Worked today
            </p>
            {overview.todaySessions.length > 0 || onClock ? (
              <>
                <p className="mt-1 text-sm font-semibold tabular-nums text-gray-900">
                  {formatMinutes(todayWorkedMinutes)}
                  <span className="ml-1 text-[12px] font-medium text-gray-400">
                    of {formatMinutes(expectedDayMinutes)}
                  </span>
                </p>
                <div className="mt-2.5">
                  <div className={cn(WS.progressTrack, 'h-2.5')}>
                    <div
                      className={cn(
                        WS.progressFill,
                        'transition-[width] duration-500 ease-out',
                        dayProgress >= 1 ? 'bg-emerald-500' : 'bg-[#7E5896]',
                      )}
                      style={{ width: `${dayProgressPct}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] tabular-nums text-gray-400">
                    {dayProgressPct}% of your day
                    {dayProgress >= 1 ? ' — day complete' : ''}
                  </p>
                </div>
                <ul className="mt-3 space-y-1">
                  {overview.todaySessions
                    .filter((s) => s.closedAt !== null)
                    .slice(0, 3)
                    .map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-2 text-[12px]">
                        <span className="text-gray-600">
                          {sessionSpanLabel(s, overview.timezone)}
                        </span>
                        <span className="tabular-nums text-gray-900">
                          {formatMinutes(s.payableMinutes)}
                        </span>
                      </li>
                    ))}
                  {onClock && overview.openSession && (
                    <li className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="text-emerald-700">
                        Live since {formatClock(overview.openSession.openedAt, overview.timezone)}
                      </span>
                      <span className="tabular-nums font-medium text-emerald-700">
                        {formatMinutes(liveMinutes)}
                      </span>
                    </li>
                  )}
                </ul>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm font-semibold text-gray-900">Nothing yet</p>
                <div className="mt-2.5">
                  <div className={cn(WS.progressTrack, 'h-2.5')}>
                    <div className={cn(WS.progressFill, 'w-0')} />
                  </div>
                  <p className="mt-1.5 text-[11px] text-gray-400">0% of your day</p>
                </div>
                <p className="mt-2 text-[12px] text-gray-500">
                  {expectedWindow
                    ? `Clock in when your ${expectedWindow} day starts`
                    : 'Clock in to start your day'}
                </p>
              </>
            )}
          </div>

          <div className="px-5 py-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
              <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.75} />
              This week
            </p>
            {overview.weekTotals.daysWorked > 0 ||
            overview.weekTotals.payableMinutes > 0 ||
            onClock ? (
              <>
                <p className="mt-1 text-sm font-semibold tabular-nums text-gray-900">
                  {formatMinutes(
                    overview.weekTotals.payableMinutes + (onClock ? liveMinutes : 0),
                  )}
                  <span className="ml-1 text-[12px] font-medium text-gray-400">
                    ({toDecimalHours(overview.weekTotals.payableMinutes + (onClock ? liveMinutes : 0))}h)
                  </span>
                </p>
                <div className="mt-3 flex h-16 items-end gap-1.5" aria-hidden>
                  {weekBars.map((day) => {
                    const heightPct = Math.max(
                      day.minutes > 0 ? 8 : 0,
                      Math.round((day.minutes / Math.max(expectedDayMinutes, 1)) * 100),
                    )
                    const isToday = day.date === overview.today
                    return (
                      <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                        <div className="flex h-12 w-full items-end justify-center">
                          <div
                            title={`${day.label}: ${formatMinutes(day.minutes)}`}
                            className={cn(
                              'w-full max-w-5 rounded-t-md transition-[height] duration-500 ease-out',
                              day.minutes === 0
                                ? 'h-0.5 bg-gray-100'
                                : isToday
                                  ? 'bg-[#7E5896]'
                                  : 'bg-[#C9A0DC]',
                            )}
                            style={day.minutes > 0 ? { height: `${Math.min(100, heightPct)}%` } : undefined}
                          />
                        </div>
                        <span
                          className={cn(
                            'text-[10px] font-medium',
                            isToday ? 'text-[#7E5896]' : 'text-gray-400',
                          )}
                        >
                          {day.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-2.5">
                  <div className={cn(WS.progressTrack, 'h-1.5')}>
                    <div
                      className={cn(WS.progressFill, 'transition-[width] duration-500 ease-out')}
                      style={{ width: `${Math.round(weekProgress * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-gray-400">
                    Across {overview.weekTotals.daysWorked || (onClock ? 1 : 0)}{' '}
                    {(overview.weekTotals.daysWorked || (onClock ? 1 : 0)) === 1 ? 'day' : 'days'}
                    {overview.weekTotals.overtimeMinutes > 0
                      ? `, ${formatMinutes(overview.weekTotals.overtimeMinutes)} overtime`
                      : ''}
                  </p>
                </div>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm font-semibold text-gray-900">No hours yet</p>
                <div className="mt-3 flex h-16 items-end gap-1.5" aria-hidden>
                  {weekBars.map((day) => (
                    <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                      <div className="flex h-12 w-full items-end justify-center">
                        <div className="h-0.5 w-full max-w-5 rounded-full bg-gray-100" />
                      </div>
                      <span className="text-[10px] font-medium text-gray-400">{day.label}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[12px] text-gray-500">Your week totals appear after you clock</p>
              </>
            )}

            {overview.timesheet ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={WS.pillMuted}>{overview.timesheet.status}</span>
                {overview.shift?.requiresTimesheetSubmission &&
                  (overview.timesheet.status === 'open' ||
                    overview.timesheet.status === 'rejected') && (
                    <button
                      data-opus-button="primary"
                      data-opus-button-size="small"
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setMessage(null)
                        startTransition(async () => {
                          const result = await actions.submitTimesheet(
                            overview.timesheet!.periodStart,
                          )
                          setMessage(
                            result.ok
                              ? { tone: 'ok', text: 'Timesheet submitted for approval.' }
                              : { tone: 'error', text: result.error },
                          )
                        })
                      }}
                      className="rounded-lg bg-[#7E5896] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#6c4884] disabled:opacity-50"
                    >
                      Submit timesheet
                    </button>
                  )}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* ---- Week sessions (only when there is something to show) ---- */}
      {(overview.weekSessions.length > 0 || overview.corrections.length > 0 || showCorrection) && (
        <section className={cn(WS.cardPad, 'p-0 overflow-hidden')}>
          {overview.weekSessions.length > 0 && (
            <div className="p-5">
              <h2 className={cn(WS.sectionLabel, 'mb-3 flex items-center gap-1.5')}>
                <ClipboardList className="h-3.5 w-3.5" strokeWidth={1.75} />
                This week&apos;s sessions
              </h2>
              <div className="overflow-x-auto">
                <table className="opus-table w-full min-w-140">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th data-numeric="true">In</th>
                      <th data-numeric="true">Out</th>
                      <th data-numeric="true">Break</th>
                      <th data-numeric="true">Payable</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.weekSessions.map((s) => (
                      <tr key={s.id}>
                        <th scope="row" className="opus-table-cell--leading">
                          {formatDay(s.businessDate)}
                        </th>
                        <td data-numeric="true">
                          {formatClock(s.openedAt, overview.timezone)}
                        </td>
                        <td data-numeric="true">
                          {s.closedAt ? formatClock(s.closedAt, overview.timezone) : 'Open'}
                        </td>
                        <td data-numeric="true">{formatMinutes(s.breakMinutes)}</td>
                        <td data-numeric="true">{formatMinutes(s.payableMinutes)}</td>
                        <td className="opus-table-cell--status">
                          <span className="flex flex-wrap gap-1">
                            {s.overtimeMinutes > 0 && (
                              <Flag tone="amber">+{formatMinutes(s.overtimeMinutes)} OT</Flag>
                            )}
                            {s.isWeekend && <Flag tone="amber">Weekend</Flag>}
                            {s.isHoliday && <Flag tone="amber">Holiday</Flag>}
                            {s.isLate && <Flag tone="amber">Late</Flag>}
                            {s.missingClockOut && <Flag tone="rose">No clock out</Flag>}
                            {s.correctionPending && <Flag tone="amber">Correction</Flag>}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div
            className={cn(
              'border-gray-100 px-5 py-4',
              overview.weekSessions.length > 0 && 'border-t',
            )}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className={cn(WS.sectionLabel, 'flex items-center gap-1.5')}>
                <FilePenLine className="h-3.5 w-3.5" strokeWidth={1.75} />
                Corrections
              </h2>
              <button
                data-opus-button="control"
                type="button"
                onClick={() => setShowCorrection((v) => !v)}
                className={
                  showCorrection
                    ? WS.link
                    : 'inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-[13px] font-semibold text-amber-800 transition-colors hover:bg-amber-50'
                }
              >
                {!showCorrection && <FilePenLine className="h-3.5 w-3.5" strokeWidth={2} />}
                {showCorrection ? 'Cancel' : 'Request a correction'}
              </button>
            </div>
            {showCorrection && (
              <CorrectionForm
                today={overview.today}
                sessions={overview.weekSessions}
                onSubmit={actions.requestCorrection}
                onDone={(result) => {
                  if (result.ok) {
                    setShowCorrection(false)
                    setMessage({
                      tone: 'ok',
                      text: 'Correction requested. Your manager will review it.',
                    })
                  }
                }}
              />
            )}
            {overview.corrections.length > 0 ? (
              <ul className="mt-2 divide-y divide-gray-100">
                {overview.corrections.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {formatDay(c.businessDate)} — {c.kind.replace(/_/g, ' ')}
                      </p>
                      <p className="mt-0.5 text-[13px] text-gray-500">{c.requestReason}</p>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                        c.status === 'approved'
                          ? 'border border-[#C9A0DC] bg-[#F0DFF6] text-[#5d3a78]'
                          : c.status === 'rejected'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-gray-100 text-gray-600',
                      )}
                    >
                      {c.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              !showCorrection && (
                <p className="text-sm text-gray-400">No corrections requested.</p>
              )
            )}
          </div>
        </section>
      )}

      {/* ---- Punch history: collapsed by default ---- */}
      <section className={cn(WS.card, 'overflow-hidden')}>
        <button
          type="button"
          data-opus-button="control"
          onClick={() => setShowHistory((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <span className="flex items-start gap-2.5">
            <History className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" strokeWidth={1.75} />
            <span>
              <span className={cn(WS.sectionLabel, 'block')}>Punch log</span>
              <span className="mt-0.5 block text-[13px] text-gray-500">
                {punches.length === 0
                  ? 'No punches recorded yet'
                  : `${punches.length} recent ${punches.length === 1 ? 'entry' : 'entries'}, never edited`}
              </span>
            </span>
          </span>
          <span className="text-[12px] font-semibold text-[#7E5896]">
            {showHistory ? 'Hide' : 'Show'}
          </span>
        </button>
        {showHistory && punches.length > 0 && (
          <ul className="divide-y divide-gray-100 border-t border-gray-100 px-5">
            {punches.map((punch) => {
              const PunchIcon =
                punch.punchType === 'in'
                  ? LogIn
                  : punch.punchType === 'out'
                    ? LogOut
                    : punch.punchType === 'break_start'
                      ? Coffee
                      : Play
              return (
              <li key={punch.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="inline-flex items-center gap-2 text-sm capitalize text-gray-900">
                  <PunchIcon className="h-3.5 w-3.5 text-gray-400" strokeWidth={1.75} />
                  {punch.punchType.replace('_', ' ')}
                </span>
                <span className="flex items-center gap-2 text-[13px] text-gray-500">
                  {punch.geofenceOk === false && <Flag tone="rose">Outside site</Flag>}
                  {punch.source !== 'web' && <Flag tone="amber">{punch.source}</Flag>}
                  {new Date(punch.punchedAt).toLocaleString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: overview.timezone,
                  })}
                </span>
              </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Empty week: still offer a correction entry without a blank table */}
      {overview.weekSessions.length === 0 &&
        overview.corrections.length === 0 &&
        !showCorrection && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-center text-[13px] text-gray-400">Need to fix a past day?</p>
            <button
              type="button"
              data-opus-button="control"
              onClick={() => setShowCorrection(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-50"
            >
              <FilePenLine className="h-4 w-4" strokeWidth={2} />
              Request a correction
            </button>
          </div>
        )}
    </div>
  )
}

function Flag({ tone, children }: { tone: 'amber' | 'rose'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[11px] font-semibold',
        tone === 'rose' ? 'bg-rose-100 text-rose-700' : 'bg-amber-50 text-amber-700',
      )}
    >
      {children}
    </span>
  )
}

function CorrectionForm({
  today,
  sessions,
  onSubmit,
  onDone,
}: {
  today: string
  sessions: { id: string; businessDate: string; openedAt: string }[]
  onSubmit: (input: CorrectionInput) => Promise<CorrectionResult>
  onDone: (result: CorrectionResult) => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState<CorrectionInput['kind']>('missing_clock_out')
  const [businessDate, setBusinessDate] = useState(today)
  const [sessionId, setSessionId] = useState('')
  const [reason, setReason] = useState('')
  const [clockInAt, setClockInAt] = useState('')
  const [clockOutAt, setClockOutAt] = useState('')

  return (
    <form
      className="space-y-3 rounded-xl bg-gray-50 p-4"
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        startTransition(async () => {
          const result = await onSubmit({
            businessDate,
            sessionId: sessionId || null,
            kind,
            reason,
            clockInAt: clockInAt || null,
            clockOutAt: clockOutAt || null,
          })
          if (!result.ok) setError(result.error)
          onDone(result)
        })
      }}
    >
      <p className="text-[13px] text-gray-600">
        Tell us what should have been recorded. Nothing changes until a manager approves it, and
        your original punches are kept either way.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[13px] font-medium text-gray-700">
          What is wrong
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as CorrectionInput['kind'])}
            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            <option value="missing_clock_in">I forgot to clock in</option>
            <option value="missing_clock_out">I forgot to clock out</option>
            <option value="wrong_clock_in">My clock in time is wrong</option>
            <option value="wrong_clock_out">My clock out time is wrong</option>
            <option value="missing_break">A break is missing</option>
            <option value="whole_day">A whole day is missing</option>
            <option value="other">Something else</option>
          </select>
        </label>
        <label className="text-[13px] font-medium text-gray-700">
          Day
          <input
            type="date"
            value={businessDate}
            max={today}
            onChange={(e) => setBusinessDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="text-[13px] font-medium text-gray-700">
          Session (optional)
          <select
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">A whole missing day</option>
            {sessions
              .filter((s) => s.businessDate === businessDate)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  Session starting{' '}
                  {new Date(s.openedAt).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </option>
              ))}
          </select>
        </label>
        <label className="text-[13px] font-medium text-gray-700">
          Correct start time
          <input
            type="datetime-local"
            value={clockInAt}
            onChange={(e) => setClockInAt(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="text-[13px] font-medium text-gray-700">
          Correct end time
          <input
            type="datetime-local"
            value={clockOutAt}
            onChange={(e) => setClockOutAt(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>
      <label className="block text-[13px] font-medium text-gray-700">
        What happened
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Left the office for a site visit and forgot to clock out."
          className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
        />
      </label>
      {error && <p className="text-sm text-rose-700">{error}</p>}
      <button
        data-opus-button="primary"
        data-opus-button-size="medium"
        type="submit"
        disabled={pending}
        className={cn(WS.btnPrimarySm, 'disabled:opacity-50')}
      >
        Send request
      </button>
    </form>
  )
}
