'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  Coffee,
  LogIn,
  LogOut,
  MapPin,
  Play,
  ShieldCheck,
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

const GREEN_PILL =
  'inline-flex items-center rounded-full bg-[#9FE870] px-2.5 py-0.5 text-[11px] font-semibold text-gray-900'

const STATE_TONE: Record<AttendanceState, string> = {
  off_clock: 'bg-gray-100 text-gray-700',
  clocked_in: 'bg-emerald-50 text-emerald-700',
  on_break: 'bg-amber-50 text-amber-700',
  clocked_out: 'bg-gray-100 text-gray-700',
  auto_closed: 'bg-rose-50 text-rose-700',
  pending_correction: 'bg-amber-50 text-amber-700',
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

/** Ask the browser for a position, or resolve undefined. Never rejects: a
 *  denied permission must not stop a punch that the schedule does not require
 *  one for, and when it does require one the server refuses with a message that
 *  explains why. */
function readPosition(timeoutMs = 8000): Promise<ClockPosition | undefined> {
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
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    )
  })
}

export default function TimeclockClient({
  employeeName,
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
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null)
  const [showCorrection, setShowCorrection] = useState(false)

  // The live counter.
  //
  // It starts at the value the SERVER computed (openSessionMinutes), so the
  // first paint is authoritative and matches on both sides of hydration. From
  // there a timer advances it, correcting the browser's clock by the offset
  // against serverNow: a machine running eight minutes fast shows the same
  // elapsed minutes as one that is correct.
  //
  // All of this is display. Nothing derived from it is ever sent back.
  const session = overview.openSession
  const [liveMinutes, setLiveMinutes] = useState(overview.openSessionMinutes)

  // Re-seed from the server whenever a new snapshot arrives (a punch triggers a
  // revalidation, and the component is not remounted). React's documented way to
  // adjust state when a prop changes: do it during render, not in an effect, so
  // there is no frame showing the stale count.
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
        // An open break stops the counter, matching the way a completed one is
        // deducted once it ends.
        const end = b.endedAt ? new Date(b.endedAt).getTime() : serverMs
        breakMs += end - new Date(b.startedAt).getTime()
      }
      setLiveMinutes(Math.max(0, Math.round((grossMs - breakMs) / 60_000)))
    }

    const id = setInterval(recompute, 30_000)
    return () => clearInterval(id)
  }, [session, overview.serverNow])

  const allowed = availableActions(overview.state)

  const run = (fn: () => Promise<ClockResult>) => {
    setMessage(null)
    startTransition(async () => {
      const result = await fn()
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error })
      }
      // On success the server action revalidated; Next re-renders with the new
      // state, so there is nothing to set here. Deliberately no optimistic
      // update: the database decides what state you are in, and showing a guess
      // that it then contradicts is worse than a half-second wait.
    })
  }

  return (
    <div className="space-y-5">
      {/* ---- Clock face ---- */}
      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-3 py-1 text-[12px] font-semibold',
                STATE_TONE[overview.state],
              )}
            >
              {stateLabel(overview.state)}
            </span>
            <p className="mt-3 text-4xl font-semibold tracking-tight text-gray-900">
              {overview.openSession
                ? formatMinutes(liveMinutes)
                : formatMinutes(overview.todayTotals.workedMinutes)}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {overview.openSession
                ? `On the clock since ${formatClock(overview.openSession.openedAt, overview.timezone)}`
                : `Worked today, ${employeeName.split(' ')[0]}`}
            </p>
            {overview.openSession?.workMode && (
              <p className="mt-2 flex items-center gap-1.5 text-[13px] text-gray-500">
                <MapPin className="h-3.5 w-3.5" strokeWidth={1.75} />
                {overview.openSession.workMode}
                {overview.openSession.locationLabel && ` · ${overview.openSession.locationLabel}`}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {allowed.includes('clock_in') && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(async () => actions.clockIn(await readPosition()))}
                className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
              >
                <LogIn className="h-4 w-4" strokeWidth={2} />
                Clock in
              </button>
            )}
            {allowed.includes('start_break') && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => actions.startBreak('rest'))}
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <Coffee className="h-4 w-4" strokeWidth={2} />
                Start break
              </button>
            )}
            {allowed.includes('end_break') && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => actions.endBreak())}
                className="inline-flex items-center gap-2 rounded-full bg-[#9FE870] px-5 py-2.5 text-sm font-semibold text-gray-900 hover:brightness-95 disabled:opacity-50"
              >
                <Play className="h-4 w-4" strokeWidth={2} />
                End break
              </button>
            )}
            {allowed.includes('clock_out') && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(async () => actions.clockOut(await readPosition()))}
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" strokeWidth={2} />
                Clock out
              </button>
            )}
          </div>
        </div>

        {message && (
          <p
            className={cn(
              'mt-4 rounded-xl px-4 py-3 text-sm',
              message.tone === 'error'
                ? 'bg-rose-50 text-rose-800'
                : 'bg-emerald-50 text-emerald-800',
            )}
          >
            {message.text}
          </p>
        )}
      </section>

      {/* ---- Attention ---- */}
      {overview.needsCorrection.length > 0 && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-rose-900">
            <AlertTriangle className="h-4 w-4" strokeWidth={1.75} />
            {overview.needsCorrection.length === 1
              ? 'One session was closed automatically'
              : `${overview.needsCorrection.length} sessions were closed automatically`}
          </h2>
          <p className="mt-1.5 text-sm text-rose-900/90">
            You did not clock out, so the session was closed at its scheduled end. Raise a
            correction if the hours are wrong. Your original punches are kept either way.
          </p>
          <button
            type="button"
            onClick={() => setShowCorrection(true)}
            className="mt-3 rounded-full bg-rose-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-rose-800"
          >
            Request a correction
          </button>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ---- Scheduled shift ---- */}
        <Card title="Scheduled shift" icon={CalendarClock}>
          {overview.shift ? (
            <div className="space-y-2">
              <p className="text-lg font-semibold text-gray-900">
                {overview.shift.startTime && overview.shift.endTime
                  ? `${overview.shift.startTime.slice(0, 5)} to ${overview.shift.endTime.slice(0, 5)}`
                  : 'No fixed hours'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {overview.shift.templateName && (
                  <span className={GREEN_PILL}>{overview.shift.templateName}</span>
                )}
                <span className={GREEN_PILL}>{overview.shift.workMode}</span>
                {overview.shift.crossesMidnight && <span className={GREEN_PILL}>Overnight</span>}
                {!overview.shift.isWorkingDay && (
                  <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                    Rest day
                  </span>
                )}
                {overview.shift.isHoliday && (
                  <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                    {overview.shift.holidayName ?? 'Public holiday'}
                  </span>
                )}
              </div>
              {overview.shift.geolocationMode !== 'off' && (
                <p className="flex items-center gap-1.5 pt-1 text-[13px] text-gray-500">
                  <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Location {overview.shift.geolocationMode === 'required' ? 'required' : 'optional'}
                  {overview.shift.locationLabel && ` at ${overview.shift.locationLabel}`}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No schedule assigned yet.</p>
          )}
        </Card>

        {/* ---- Payable hours ---- */}
        <Card title="This week" icon={CalendarClock}>
          <p className="text-2xl font-semibold tracking-tight text-gray-900">
            {formatMinutes(overview.weekTotals.payableMinutes)}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Payable, {toDecimalHours(overview.weekTotals.payableMinutes)} hours across{' '}
            {overview.weekTotals.daysWorked}{' '}
            {overview.weekTotals.daysWorked === 1 ? 'day' : 'days'}.
          </p>
          <dl className="mt-3 space-y-1 text-[13px] text-gray-500">
            <Row label="Worked" value={formatMinutes(overview.weekTotals.workedMinutes)} />
            <Row label="Breaks" value={formatMinutes(overview.weekTotals.breakMinutes)} />
            <Row
              label="Overtime"
              value={formatMinutes(overview.weekTotals.overtimeMinutes)}
              highlight={overview.weekTotals.overtimeMinutes > 0}
            />
          </dl>
        </Card>

        {/* ---- Timesheet ---- */}
        <Card title="Timesheet" icon={ShieldCheck}>
          {overview.timesheet ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-900">
                {formatDay(overview.timesheet.periodStart)} to{' '}
                {formatDay(overview.timesheet.periodEnd)}
              </p>
              <p className="text-2xl font-semibold tracking-tight text-gray-900">
                {formatMinutes(overview.timesheet.totalPayableMinutes)}
              </p>
              <span className={GREEN_PILL}>{overview.timesheet.status}</span>
              {overview.timesheet.decisionNote && (
                <p className="text-[13px] text-gray-500">{overview.timesheet.decisionNote}</p>
              )}
              {overview.shift?.requiresTimesheetSubmission &&
                (overview.timesheet.status === 'open' ||
                  overview.timesheet.status === 'rejected') && (
                  <button
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
                    className="mt-2 rounded-full bg-gray-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    Submit for approval
                  </button>
                )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No timesheet for this period yet.</p>
          )}
        </Card>
      </div>

      {/* ---- Today ---- */}
      <Card title="Today" icon={CalendarClock}>
        {overview.todaySessions.length > 0 ? (
          <ul className="divide-y divide-gray-100">
            {overview.todaySessions.map((session) => (
              <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {formatClock(session.openedAt, overview.timezone)} to{' '}
                    {session.closedAt
                      ? formatClock(session.closedAt, overview.timezone)
                      : 'now'}
                  </p>
                  <p className="mt-0.5 text-[13px] text-gray-500">
                    {session.workMode}
                    {session.breaks.length > 0 &&
                      ` · ${session.breaks.length} ${session.breaks.length === 1 ? 'break' : 'breaks'} (${formatMinutes(session.breakMinutes)})`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {session.isLate && (
                    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                      {formatMinutes(session.lateMinutes)} late
                    </span>
                  )}
                  {session.isEarlyDeparture && (
                    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                      Left {formatMinutes(session.earlyDepartureMinutes)} early
                    </span>
                  )}
                  {session.missingClockOut && (
                    <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700">
                      No clock out
                    </span>
                  )}
                  <span className={GREEN_PILL}>{formatMinutes(session.payableMinutes)}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">Nothing recorded today yet.</p>
        )}
      </Card>

      {/* ---- Week ---- */}
      <Card title="This week's sessions" icon={CalendarClock}>
        {overview.weekSessions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-[12px] uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="pb-2 font-semibold">Day</th>
                  <th className="pb-2 font-semibold">In</th>
                  <th className="pb-2 font-semibold">Out</th>
                  <th className="pb-2 font-semibold">Breaks</th>
                  <th className="pb-2 font-semibold">Payable</th>
                  <th className="pb-2 font-semibold">Overtime</th>
                  <th className="pb-2 font-semibold">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {overview.weekSessions.map((session) => (
                  <tr key={session.id}>
                    <td className="py-2.5 font-medium text-gray-900">
                      {formatDay(session.businessDate)}
                    </td>
                    <td className="py-2.5 text-gray-600">
                      {formatClock(session.openedAt, overview.timezone)}
                    </td>
                    <td className="py-2.5 text-gray-600">
                      {session.closedAt
                        ? formatClock(session.closedAt, overview.timezone)
                        : 'Open'}
                    </td>
                    <td className="py-2.5 text-gray-600">{formatMinutes(session.breakMinutes)}</td>
                    <td className="py-2.5 font-medium text-gray-900">
                      {formatMinutes(session.payableMinutes)}
                    </td>
                    <td className="py-2.5 text-gray-600">
                      {session.overtimeMinutes > 0 ? formatMinutes(session.overtimeMinutes) : 'None'}
                    </td>
                    <td className="py-2.5">
                      <span className="flex flex-wrap gap-1">
                        {session.isWeekend && <Flag tone="amber">Weekend</Flag>}
                        {session.isHoliday && <Flag tone="amber">Holiday</Flag>}
                        {session.isLate && <Flag tone="amber">Late</Flag>}
                        {session.missingClockOut && <Flag tone="rose">No clock out</Flag>}
                        {session.correctionPending && <Flag tone="amber">Correction</Flag>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400">No sessions this week.</p>
        )}
      </Card>

      {/* ---- Corrections ---- */}
      <Card
        title="Corrections"
        icon={AlertTriangle}
        action={
          <button
            type="button"
            onClick={() => setShowCorrection((v) => !v)}
            className="text-[12px] font-semibold text-gray-500 hover:text-gray-900"
          >
            {showCorrection ? 'Cancel' : 'Request a correction'}
          </button>
        }
      >
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
          <ul className="mt-3 divide-y divide-gray-100">
            {overview.corrections.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {formatDay(c.businessDate)} · {c.kind.replace(/_/g, ' ')}
                  </p>
                  <p className="mt-0.5 text-[13px] text-gray-500">{c.requestReason}</p>
                  {c.decisionNote && (
                    <p className="mt-0.5 text-[13px] text-gray-500">Note: {c.decisionNote}</p>
                  )}
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                    c.status === 'approved'
                      ? 'bg-[#9FE870] text-gray-900'
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
      </Card>

      {/* ---- Punch history ---- */}
      <Card title="Punch history" icon={ShieldCheck}>
        <p className="mb-3 text-[13px] text-gray-500">
          Every punch, exactly as it was recorded. These entries are never edited. An approved
          correction adds a new entry beside the original.
        </p>
        {punches.length > 0 ? (
          <ul className="divide-y divide-gray-100">
            {punches.map((punch) => (
              <li key={punch.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm text-gray-900">
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
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">No punches recorded yet.</p>
        )}
      </Card>
    </div>
  )
}

function Card({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string
  icon: typeof Coffee
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-gray-500">
          <Icon className="h-4 w-4 text-gray-400" strokeWidth={1.75} />
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  )
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <dt>{label}</dt>
      <dd className={cn('font-medium', highlight ? 'text-amber-700' : 'text-gray-900')}>{value}</dd>
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
        your original punches are kept whatever they decide.
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
                  Session starting {new Date(s.openedAt).toLocaleTimeString('en-GB', {
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
        type="submit"
        disabled={pending}
        className="rounded-full bg-gray-900 px-5 py-2 text-[13px] font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
      >
        Send request
      </button>
    </form>
  )
}
