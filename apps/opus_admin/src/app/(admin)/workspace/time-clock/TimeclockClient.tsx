'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  Clock,
  LogIn,
  LogOut,
  PlayCircle,
  Sparkles,
  StopCircle,
  Sunrise,
  Target,
  Timer,
} from 'lucide-react'
import Avatar from '../../workforce/_components/Avatar'
import Kpi, { KpiRow } from '../../workforce/_components/Kpi'
import StatusPill from '../../workforce/_components/StatusPill'
import type { TimeClockStatus, TimeDaySummary, TimePunch } from '../../workforce/_lib/types'
import { clockIn, clockOut } from './actions'

type EmployeeChip = {
  id: string
  name: string
  employeeCode: string
  avatarUrl: string | null
  avatarColor: string
}

type Props = {
  employee: EmployeeChip
  initialStatus: TimeClockStatus
  weekStartIso: string
  weekDays: TimeDaySummary[]
  timeZone: string
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
// Generous 8h shift target — used to scale the week bars + label the
// today/week KPIs. Real per-employee targets would come from a contract
// table; out of scope for v1.
const DAILY_TARGET_MINUTES = 8 * 60
const WEEKLY_TARGET_MINUTES = 5 * DAILY_TARGET_MINUTES

function formatHm(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0h'
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}m`
}

function formatHmShort(totalMinutes: number): string {
  if (totalMinutes <= 0) return '—'
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function formatHmDelta(totalMinutes: number): string {
  const abs = Math.abs(totalMinutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatTimeOfDay(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatHmsLive(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function greetingFor(hour: number): string {
  if (hour < 5) return 'Working late'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  if (hour < 21) return 'Good evening'
  return 'Working late'
}

// Extract HH:MM as minutes-since-midnight in the workforce timezone.
function localMinutesOfDay(iso: string, tz: string): number {
  const [h, m] = formatTimeOfDay(iso, tz).split(':').map(Number)
  return h * 60 + m
}

export default function TimeclockClient({
  employee,
  initialStatus,
  weekStartIso,
  weekDays,
  timeZone,
}: Props) {
  const [status, setStatus] = useState<TimeClockStatus>(initialStatus)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [now, setNow] = useState(() => Date.now())

  // Tick every second always — drives the live elapsed timer when on
  // shift, and the wall-clock display in the hero when off.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const liveSinceMs = useMemo(() => {
    if (!status.isClockedIn || !status.sinceIso) return 0
    return Math.max(0, now - new Date(status.sinceIso).getTime())
  }, [now, status])
  const liveMinutes = Math.floor(liveSinceMs / 60000)

  const todayStr = useMemo(
    () =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(now)),
    [now, timeZone],
  )
  const yesterdayStr = useMemo(() => {
    const d = new Date(now - 86_400_000)
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d)
  }, [now, timeZone])

  const todaySummary = weekDays.find((d) => d.date === todayStr)
  const yesterdaySummary = weekDays.find((d) => d.date === yesterdayStr)
  const todayMinutes =
    (todaySummary?.workedMinutes ?? 0) + (status.isClockedIn ? liveMinutes : 0)
  const weekMinutes =
    weekDays.reduce((sum, d) => sum + d.workedMinutes, 0) +
    (status.isClockedIn ? liveMinutes : 0)

  // Average start time across days that recorded a clock-in this week.
  const startTimes = useMemo(
    () =>
      weekDays
        .map((d) => d.firstInIso)
        .filter((iso): iso is string => Boolean(iso))
        .map((iso) => localMinutesOfDay(iso, timeZone)),
    [weekDays, timeZone],
  )
  const avgStart = useMemo(() => {
    if (startTimes.length === 0) return null
    const avg = Math.round(startTimes.reduce((a, b) => a + b, 0) / startTimes.length)
    return `${String(Math.floor(avg / 60)).padStart(2, '0')}:${String(avg % 60).padStart(2, '0')}`
  }, [startTimes])
  const startConsistency = useMemo(() => {
    // Population stddev of start minutes. <15min = "consistent", <45 = "steady",
    // larger = "varies a lot". Communicates a pattern, not a measurement.
    if (startTimes.length < 2) return null
    const avg = startTimes.reduce((a, b) => a + b, 0) / startTimes.length
    const variance =
      startTimes.reduce((a, b) => a + (b - avg) ** 2, 0) / startTimes.length
    return Math.sqrt(variance)
  }, [startTimes])

  const localHour = useMemo(
    () =>
      Number.parseInt(
        new Intl.DateTimeFormat('en-GB', {
          timeZone,
          hour: '2-digit',
          hour12: false,
        }).format(new Date(now)),
        10,
      ),
    [now, timeZone],
  )

  const longDate = useMemo(
    () =>
      new Date(now).toLocaleDateString('en-GB', {
        timeZone,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    [now, timeZone],
  )

  const wallClock = useMemo(
    () =>
      new Date(now).toLocaleTimeString('en-GB', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    [now, timeZone],
  )

  // Expected end of shift = start + 8h. Honest framing: it's a target,
  // not a clock-out enforcement.
  const expectedEndIso = useMemo(() => {
    if (!status.isClockedIn || !status.sinceIso) return null
    return new Date(
      new Date(status.sinceIso).getTime() + DAILY_TARGET_MINUTES * 60_000,
    ).toISOString()
  }, [status])

  const todayDeltaMin =
    todayMinutes - (yesterdaySummary?.workedMinutes ?? 0)
  const weekPct = Math.min(
    999,
    Math.round((weekMinutes / WEEKLY_TARGET_MINUTES) * 100),
  )
  const weekRemaining = Math.max(0, WEEKLY_TARGET_MINUTES - weekMinutes)

  const clockedIn = status.isClockedIn

  async function handlePunch(action: 'in' | 'out') {
    setError(null)
    startTransition(async () => {
      try {
        const result = action === 'in' ? await clockIn() : await clockOut()
        setStatus({
          employeeId: employee.id,
          isClockedIn: action === 'in',
          sinceIso: action === 'in' ? result.punchAt : null,
          lastPunch: {
            id: 'optimistic',
            employeeId: employee.id,
            punchAt: result.punchAt,
            type: action,
            source: 'web',
            note: null,
            locationLabel: null,
            createdByClerkId: null,
          },
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong.')
      }
    })
  }

  return (
    <div className="space-y-5">
      {/* =================================================================
          HERO — identity / live clock on left, action + shift details on right
          ================================================================= */}
      <section
        className={[
          'relative overflow-hidden rounded-2xl border bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]',
          clockedIn ? 'border-[#E0BEEC]' : 'border-gray-100',
        ].join(' ')}
      >
        <div className="relative grid gap-5 p-5 lg:grid-cols-[1.3fr_1fr] lg:gap-8 lg:p-6">
          {/* LEFT — identity + status + clock */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Avatar
                name={employee.name}
                color={employee.avatarColor}
                src={employee.avatarUrl}
                size="md"
              />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  {employee.employeeCode}
                </div>
                <div className="truncate text-sm font-semibold text-gray-900">
                  {employee.name}
                </div>
              </div>
              <div className="ml-auto">
                {clockedIn ? (
                  <StatusPill tone="green" label="On the clock" />
                ) : (
                  <StatusPill tone="purple" label="Off the clock" />
                )}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500">
                <CalendarDays className="h-3.5 w-3.5" />
                {greetingFor(localHour)} · {longDate}
              </div>
              {clockedIn && status.sinceIso ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <div className="font-mono text-4xl font-semibold tabular-nums leading-none tracking-tight text-gray-900 sm:text-5xl">
                      {formatHmsLive(liveSinceMs)}
                    </div>
                    <span className="text-xs font-medium text-gray-500">elapsed</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <div className="font-mono text-4xl font-semibold tabular-nums leading-none tracking-tight text-gray-900 sm:text-5xl">
                      {wallClock}
                    </div>
                    <span className="text-xs font-medium text-gray-500">now</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* RIGHT — primary action + shift details (when on shift) */}
          <div className="flex flex-col justify-center gap-3">
            <button
              type="button"
              onClick={() => handlePunch(clockedIn ? 'out' : 'in')}
              disabled={pending}
              className={[
                'group inline-flex items-center justify-center gap-2.5 rounded-2xl px-5 py-4 text-base font-semibold shadow-[0_4px_18px_-6px_rgba(0,0,0,0.18)] transition-transform disabled:cursor-not-allowed disabled:opacity-60',
                clockedIn
                  ? 'bg-[#A84F66] text-white hover:bg-[#92435a] active:translate-y-[1px]'
                  : 'bg-[#9FE870] text-gray-900 hover:bg-[#8fd862] active:translate-y-[1px]',
              ].join(' ')}
            >
              {clockedIn ? (
                <>
                  <StopCircle className="h-5 w-5" />
                  {pending ? 'Clocking out…' : 'Clock out'}
                </>
              ) : (
                <>
                  <LogIn className="h-5 w-5" />
                  {pending ? 'Clocking in…' : 'Clock in'}
                </>
              )}
            </button>

            {/* Shift micro-summary or call-to-start */}
            {clockedIn && status.sinceIso ? (
              <div className="rounded-xl border border-gray-100 bg-white/70 backdrop-blur p-3 text-[11px] text-gray-600">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <PlayCircle className="h-3.5 w-3.5 text-[#3F8B5C]" />
                    <span className="text-gray-500">Started</span>
                  </div>
                  <span className="font-mono font-semibold tabular-nums text-gray-900">
                    {formatTimeOfDay(status.sinceIso, timeZone)}
                  </span>
                </div>
                {expectedEndIso && (
                  <div className="mt-1.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5 text-[#7E5896]" />
                      <span className="text-gray-500">Expected end</span>
                    </div>
                    <span className="font-mono font-semibold tabular-nums text-gray-900">
                      {formatTimeOfDay(expectedEndIso, timeZone)}
                    </span>
                  </div>
                )}
                <p className="mt-2 text-center text-[11px] text-gray-500">
                  You're {formatHmDelta(liveMinutes)} into your shift.
                </p>
              </div>
            ) : (
              <p className="text-center text-[11px] text-gray-500">
                {status.lastPunch
                  ? `Last clocked out at ${formatTimeOfDay(status.lastPunch.punchAt, timeZone)} — tap above when you're ready.`
                  : 'Ready when you are — tap Clock in to start your day.'}
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="relative mx-5 mb-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>{error}</div>
          </div>
        )}
      </section>

      {/* =================================================================
          KPI ROW — todo with deltas + contextual hints
          ================================================================= */}
      <KpiRow>
        <Kpi
          icon={<Timer className="h-4 w-4" />}
          label="Today"
          value={formatHm(todayMinutes)}
          delta={
            yesterdaySummary && yesterdaySummary.workedMinutes > 0
              ? `${todayDeltaMin >= 0 ? '↑' : '↓'} ${formatHmDelta(todayDeltaMin)} vs yesterday`
              : undefined
          }
          deltaTone={todayDeltaMin >= 0 ? 'positive' : 'negative'}
          hint={
            todaySummary?.openShift
              ? 'open shift'
              : !yesterdaySummary || yesterdaySummary.workedMinutes === 0
                ? 'no data for yesterday'
                : undefined
          }
        />
        <Kpi
          icon={<CalendarDays className="h-4 w-4" />}
          label="This week"
          value={formatHm(weekMinutes)}
          delta={`${weekPct}% of 40h`}
          deltaTone={weekPct >= 100 ? 'positive' : 'neutral'}
          hint={
            weekRemaining > 0
              ? `${formatHmShort(weekRemaining)} to target`
              : 'target reached'
          }
        />
        <Kpi
          icon={<Sunrise className="h-4 w-4" />}
          label="Avg. start"
          value={avgStart ?? '—'}
          hint={
            startConsistency === null
              ? avgStart
                ? 'first day this week'
                : 'no punches yet'
              : startConsistency < 15
                ? 'consistent this week'
                : startConsistency < 45
                  ? 'fairly steady'
                  : 'varies a lot'
          }
        />
        <Kpi
          icon={<Clock className="h-4 w-4" />}
          label="Last punch"
          value={
            status.lastPunch
              ? formatTimeOfDay(status.lastPunch.punchAt, timeZone)
              : '—'
          }
          hint={
            status.lastPunch
              ? status.lastPunch.type === 'in'
                ? 'clock-in'
                : 'clock-out'
              : undefined
          }
        />
      </KpiRow>

      {/* =================================================================
          WEEK BREAKDOWN — horizontal bars, today highlighted
          ================================================================= */}
      <section className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <header className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#F0DFF6] text-[#5B2D8E]">
              <CalendarDays className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">This week</h2>
              <p className="text-[11px] text-gray-500">Hours by day · East Africa Time</p>
            </div>
          </div>
          <div className="hidden text-[11px] font-medium text-gray-500 sm:block">
            Target {formatHm(DAILY_TARGET_MINUTES)} / day
          </div>
        </header>

        <div className="grid grid-cols-7 gap-px overflow-hidden bg-gray-100">
          {WEEKDAYS.map((label, idx) => {
            const day = dayFromWeekStart(weekStartIso, idx, timeZone)
            const summary = weekDays.find((d) => d.date === day)
            const minsRaw = summary?.workedMinutes ?? 0
            const mins = day === todayStr && clockedIn ? minsRaw + liveMinutes : minsRaw
            const pct = Math.min(100, Math.round((mins / DAILY_TARGET_MINUTES) * 100))
            const isToday = day === todayStr
            const isFuture = day > todayStr
            const isOpen = isToday && clockedIn
            return (
              <div
                key={day}
                className={[
                  'relative flex h-[180px] flex-col items-stretch bg-white px-3 pt-3 pb-3',
                  isToday && 'bg-[#FCF7FF]',
                ].filter(Boolean).join(' ')}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className={[
                      'text-[10px] font-semibold uppercase tracking-wider',
                      isToday ? 'text-[#5B2D8E]' : 'text-gray-400',
                    ].join(' ')}>
                      {label}
                    </div>
                    <div className={[
                      'text-[13px] font-semibold tabular-nums',
                      isFuture ? 'text-gray-300' : isToday ? 'text-[#5B2D8E]' : 'text-gray-900',
                    ].join(' ')}>
                      {new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', {
                        timeZone,
                        day: '2-digit',
                        month: 'short',
                      })}
                    </div>
                  </div>
                  {isOpen && (
                    <span className="relative inline-flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#9FE870] opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-[#3F8B5C]" />
                    </span>
                  )}
                </div>

                {/* Vertical bar */}
                <div className="relative mt-3 flex-1 overflow-hidden rounded-md bg-gray-50">
                  <div
                    className={[
                      'absolute bottom-0 left-0 right-0 transition-[height] duration-500',
                      isOpen
                        ? 'bg-[linear-gradient(180deg,#C9A0DC_0%,#9FE870_100%)]'
                        : pct >= 100
                          ? 'bg-[#9FE870]'
                          : isToday
                            ? 'bg-[#C9A0DC]'
                            : 'bg-[#F0DFF6]',
                    ].join(' ')}
                    style={{ height: `${Math.max(mins > 0 ? 6 : 0, pct)}%` }}
                  />
                </div>

                <div className="mt-2 flex items-baseline justify-between">
                  <div className={[
                    'text-[13px] font-semibold tabular-nums',
                    mins === 0 ? 'text-gray-300' : isToday ? 'text-[#5B2D8E]' : 'text-gray-900',
                  ].join(' ')}>
                    {formatHmShort(mins)}
                  </div>
                  {summary?.firstInIso && summary?.lastOutIso && (
                    <div className="text-[10px] tabular-nums text-gray-400">
                      {formatTimeOfDay(summary.firstInIso, timeZone)}–{formatTimeOfDay(summary.lastOutIso, timeZone)}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer: human-readable progress */}
        <div className="border-t border-gray-100 px-5 py-2.5 text-[11px] text-gray-500">
          {weekPct >= 100 ? (
            <span className="text-[#3F8B5C]">
              You hit your 40h target — great consistency this week.
            </span>
          ) : weekMinutes === 0 ? (
            <span>No hours yet this week. Tap Clock in to get started.</span>
          ) : (
            <span>
              <span className="font-semibold text-gray-700">{formatHmShort(weekRemaining)}</span>{' '}
              to go before you hit 40h this week.
            </span>
          )}
        </div>
      </section>

      {/* =================================================================
          RECENT PUNCHES — vertical timeline with connector
          ================================================================= */}
      <section className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <header className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#F0DFF6] text-[#5B2D8E]">
              <Clock className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Recent activity</h2>
              <p className="text-[11px] text-gray-500">Last 12 punches from this week</p>
            </div>
          </div>
        </header>

        <RecentTimeline weekDays={weekDays} timeZone={timeZone} />
      </section>
    </div>
  )
}

// =============================================================================
// Recent punches — vertical timeline
// =============================================================================

function RecentTimeline({
  weekDays,
  timeZone,
}: {
  weekDays: TimeDaySummary[]
  timeZone: string
}) {
  const allPunches: TimePunch[] = weekDays
    .flatMap((d) => d.punches)
    .sort((a, b) => b.punchAt.localeCompare(a.punchAt))
    .slice(0, 12)

  if (allPunches.length === 0) {
    return (
      <div className="px-5 py-8">
        <div className="mx-auto flex max-w-md flex-col items-center text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F0DFF6] text-[#5B2D8E]">
            <Sparkles className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900">No punches yet</h3>
          <p className="mt-1 text-[12px] text-gray-500">
            Tap <span className="font-semibold text-[#3F8B5C]">Clock in</span> above to start
            your first shift. Your activity will show up here as you work through the week.
          </p>
        </div>
      </div>
    )
  }

  return (
    <ol className="relative px-5 py-3">
      {/* Vertical connector line. Inset to align with the dot center. */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-[33px] top-5 bottom-5 w-px bg-gray-100"
      />
      {allPunches.map((p, idx) => (
        <li key={p.id} className="relative flex items-center gap-3 py-2">
          {/* Marker dot — sage for clock-in, lavender for clock-out */}
          <span
            className={[
              'relative z-10 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ring-4 ring-white',
              p.type === 'in' ? 'bg-[#9FE870]' : 'bg-[#C9A0DC]',
            ].join(' ')}
          >
            {p.type === 'in' ? (
              <LogIn className="h-2.5 w-2.5 text-[#3F8B5C]" />
            ) : (
              <LogOut className="h-2.5 w-2.5 text-[#5B2D8E]" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium text-gray-900">
                {p.type === 'in' ? 'Clock in' : 'Clock out'}
              </span>
              <span className="font-mono text-[12px] tabular-nums text-gray-500">
                {formatTimeOfDay(p.punchAt, timeZone)}
              </span>
              {p.source !== 'web' && (
                <StatusPill
                  tone={p.source === 'admin_manual' ? 'amber' : 'gray'}
                  label={p.source.replace('_', ' ')}
                />
              )}
            </div>
            <div className="text-[11px] text-gray-500">
              {new Date(p.punchAt).toLocaleDateString('en-GB', {
                timeZone,
                weekday: 'short',
                day: '2-digit',
                month: 'short',
              })}
              {p.note && <span className="ml-1">· {p.note}</span>}
            </div>
          </div>

          {/* Inter-punch gap label — only on out punches following an in */}
          {idx < allPunches.length - 1 &&
            p.type === 'out' &&
            allPunches[idx + 1].type === 'in' && (
              <span className="text-[11px] tabular-nums text-gray-400">
                {formatHmDelta(
                  Math.round(
                    (new Date(p.punchAt).getTime() -
                      new Date(allPunches[idx + 1].punchAt).getTime()) /
                      60000,
                  ),
                )}
              </span>
            )}
        </li>
      ))}
    </ol>
  )
}

function dayFromWeekStart(weekStartIso: string, dayIndex: number, tz: string): string {
  const d = new Date(new Date(weekStartIso).getTime() + dayIndex * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}
