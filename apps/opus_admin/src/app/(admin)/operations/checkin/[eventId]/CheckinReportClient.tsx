'use client'

import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Download, DoorOpen, Printer, ShieldCheck, UserRoundX, Users } from 'lucide-react'
import {
  bucketArrivals,
  formatReportDateTime,
  formatReportLongDateTime,
  formatReportTime,
  ticketLabel,
  type ReportArrival,
} from '@/lib/checkin-report'
import { PrintLetterhead, PrintLetterheadFooter, type LetterheadMeta } from '@/components/PrintLetterhead'
import type { AttendantAssignment } from '../actions'
import type { CheckinBaseline } from './CheckinEventClient'

export interface CheckinReport {
  /** Every guest who scanned in, newest first. */
  arrivals: ReportArrival[]
  /** RSVP'd attending but never scanned at any door. */
  noShows: { guestName: string; partySize: number }[]
  /** Request time on the server — the figures below are a snapshot as of
   *  this moment, which matters once the report is printed and filed. */
  generatedAt: string
}

/** Brand purple, 5.64:1 on white — clears the 3:1 floor for data marks. */
const ACCENT = '#7E5896'
/** Lighter step of the same ramp: meter track and area wash only, never a
 *  mark that has to be read on its own. */
const ACCENT_TINT = '#F0DFF6'
/** One step off the surface — recessive, hairline, solid. */
const GRID = '#e5e7eb'

function csvCell(value: string | number): string {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// ---------------------------------------------------------------- primitives

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)] print:break-inside-avoid print:border-gray-300 print:p-3 print:shadow-none">
      <div className="text-[12px] font-medium text-gray-500 print:text-[11px]">{label}</div>
      <div className="mt-2 text-[28px] leading-none font-semibold tracking-tight text-gray-900 print:mt-1.5 print:text-[24px]">
        {value}
      </div>
      {hint ? <div className="mt-2 text-[11px] text-gray-400 print:mt-1.5 print:text-[10px]">{hint}</div> : null}
    </div>
  )
}

function Section({
  title,
  icon,
  count,
  children,
}: {
  title: string
  icon: ReactNode
  count?: number
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)] print:break-inside-avoid print:border-gray-300 print:shadow-none">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
          {icon}
          {title}
        </h2>
        {typeof count === 'number' ? (
          <span className="text-xs font-semibold tabular-nums text-gray-400">{count}</span>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-8 text-center text-sm text-gray-400">{children}</p>
}

/** Drawing width of a chart that shares the printed row with one other. */
const PRINT_HALF_WIDTH = 460
/** Drawing width of a chart that owns the full printed row. */
const PRINT_FULL_WIDTH = 960

/**
 * A chart card that survives the trip to paper.
 *
 * On screen the chart is sized by ResponsiveContainer, with the ready-gate
 * the admin dashboard's Charts.tsx uses (Recharts logs "width(-1)
 * height(-1)" if it renders before its parent has been measured).
 *
 * Print gets a second copy at a fixed drawing size instead. A responsive
 * chart measures itself against the browser window and keeps that width
 * when the page reflows to A4 — which is why the printed cards used to
 * hold a chart half their width. The fixed copy carries a viewBox, so the
 * print stylesheet can stretch it to whatever the paper column really is
 * without redrawing anything.
 */
function ChartFrame({
  title,
  hint,
  height = 220,
  printWidth = PRINT_HALF_WIDTH,
  empty,
  chart,
}: {
  title: string
  hint?: string
  height?: number
  printWidth?: number
  /** Shown in place of the chart when there is nothing to plot. */
  empty?: ReactNode
  /** Receives the size props to spread: none on screen, fixed for print. */
  chart: ((size: { width?: number; height?: number }) => ReactElement) | null
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const check = () => {
      if (el.clientWidth > 0 && el.clientHeight > 0) setReady(true)
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)] print:break-inside-avoid print:border-gray-300 print:p-4 print:shadow-none">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {hint ? <p className="mt-0.5 text-xs text-gray-500">{hint}</p> : null}
      {chart ? (
        <>
          <div ref={frameRef} className="mt-4 w-full print:hidden" style={{ height }}>
            {ready ? (
              <ResponsiveContainer width="100%" height="100%">
                {chart({})}
              </ResponsiveContainer>
            ) : null}
          </div>
          <div className="checkin-print-chart mt-4 hidden print:block">
            {chart({ width: printWidth, height })}
          </div>
        </>
      ) : (
        <div className="mt-4 flex w-full items-center justify-center text-center" style={{ height }}>
          {empty}
        </div>
      )}
    </section>
  )
}

/** House tooltip — text in ink tokens, the accent only on the value's dot. */
function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean
  payload?: { value?: number | string }[]
  label?: string | number
  unit: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-[11px] font-medium text-gray-500">{label}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
        <span className="h-2 w-2 rounded-full" style={{ background: ACCENT }} />
        {payload[0].value} {unit}
      </p>
    </div>
  )
}

const AXIS_TICK = { fill: '#9ca3af', fontSize: 11 }

// ---------------------------------------------------------------- report

export default function CheckinReportClient({
  baseline,
  report,
  attendants,
}: {
  baseline: CheckinBaseline
  report: CheckinReport
  attendants: AttendantAssignment[]
}) {
  const { totalAttending, totalCheckedIn, doorCounts } = baseline
  const pct = totalAttending > 0 ? Math.round((totalCheckedIn / totalAttending) * 100) : 0
  const guestsIn = report.arrivals.reduce((sum, a) => sum + a.partySize, 0)

  // First and last scan bound the door's working window — the two timestamps
  // an ops debrief actually asks for. arrivals is newest-first.
  const lastScan = report.arrivals[0]?.checkedInAt ?? null
  const firstScan = report.arrivals[report.arrivals.length - 1]?.checkedInAt ?? null

  const { points, bucketMinutes } = bucketArrivals(report.arrivals)
  const hasFlow = points.length > 1
  const peak = points.reduce((best, p) => (p.count > best ? p.count : best), 0)

  // Letterhead meta block: the lines an ops debrief has to be able to read off
  // a filed sheet. Date first, then who and where, then the snapshot clock.
  const venue = [baseline.event?.venueName, baseline.event?.city].filter(Boolean).join(', ')
  const eventType = baseline.event?.eventType?.replace(/_/g, ' ')
  const letterheadMeta: LetterheadMeta[] = [
    {
      label: 'Date',
      value: baseline.event?.startsAt ? formatReportLongDateTime(baseline.event.startsAt) : 'Not scheduled',
    },
  ]
  if (eventType) {
    letterheadMeta.push({ label: 'Event', value: eventType.charAt(0).toUpperCase() + eventType.slice(1) })
  }
  if (venue) letterheadMeta.push({ label: 'Venue', value: venue })
  if (baseline.event?.coupleName) letterheadMeta.push({ label: 'Client', value: baseline.event.coupleName })
  letterheadMeta.push({ label: 'Generated', value: formatReportLongDateTime(report.generatedAt) })

  function exportCsv() {
    const lines = [
      ['Guest', 'Ticket', 'Door', 'Checked in at'].join(','),
      ...report.arrivals.map((a) =>
        [
          csvCell(a.guestName),
          csvCell(ticketLabel(a.partySize)),
          csvCell(a.doorLabel ?? 'Unrecorded'),
          csvCell(formatReportDateTime(a.checkedInAt)),
        ].join(','),
      ),
      ...report.noShows.map((n) => [csvCell(n.guestName), csvCell(ticketLabel(n.partySize)), '', 'DID NOT ARRIVE'].join(',')),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `checkin-${(baseline.event?.name ?? 'event').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="checkin-report-print-root space-y-5">
      {/* The report owns the paper geometry. Screen breakpoints (including the
          desktop-only notice) must never decide what reaches Print / Save PDF. */}
      <style>{`
        @page { size: A4 landscape; margin: 12mm; }
        @media print {
          html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
          .checkin-report-print-root {
            width: 100% !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          /* The fixed-size print chart drawn by ChartFrame carries a viewBox,
             so releasing its width lets it scale to the real paper column
             instead of keeping the width it was measured at on screen. */
          .checkin-print-chart .recharts-wrapper,
          .checkin-print-chart .recharts-wrapper svg {
            width: 100% !important;
            height: auto !important;
          }
        }
      `}</style>

      {/* Letterhead. On screen the event identity lives in the app header,
          which is chrome a printed report can't rely on — so the print sheet
          carries the company letterhead and its own title block instead. */}
      <div className="hidden print:block">
        <PrintLetterhead title={baseline.event?.name ?? 'Event'} subtitle="Check-in report" meta={letterheadMeta} />
      </div>

      {/* Report meta + actions. Neither prints: the snapshot time is a
          letterhead line above, and the actions are screen chrome. */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-xs text-gray-500">
          Snapshot taken {formatReportDateTime(report.generatedAt)}. Reload for current figures.
        </p>
        <div className="flex items-center gap-2 print:hidden">
          <button data-opus-button="neutral" data-opus-button-size="small"
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:border-[#C9A0DC] hover:text-[#7E5896]"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
          <button data-opus-button="control"
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#7E5896] px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#6b4a80]"
          >
            <Printer className="h-3.5 w-3.5" /> Print report
          </button>
        </div>
      </div>

      {/* Four figures, one line. Print gets the column count stated outright:
          paper never matches a screen breakpoint, and the last printout came
          out as a 2 × 2 block because it was left to `lg:`. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 print:grid-cols-4 print:gap-3">
        <Figure label="Expected" value={String(totalAttending)} hint="RSVP'd attending" />
        <Figure label="Checked in" value={String(totalCheckedIn)} hint={`${guestsIn} on ticket count`} />
        <Figure label="Attendance" value={`${pct}%`} hint="of expected invitations" />
        <Figure label="No-shows" value={String(report.noShows.length)} hint="never scanned at any door" />
      </div>

      {/* Meter, not a two-slice pie: one ratio against a limit. Track is a
          lighter step of the same ramp so the state reads across the bar. */}
      <div className="rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)] print:border-gray-300 print:shadow-none">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold tracking-wide text-gray-500 uppercase">Turnout</span>
          <span className="font-semibold tabular-nums text-gray-700">
            {totalCheckedIn} of {totalAttending} arrived
          </span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full" style={{ background: ACCENT_TINT }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: ACCENT }} />
        </div>
      </div>

      {/* Two time views of the same scans: pace, then progress. Deliberately
          two charts rather than bars + line on one frame — that would need a
          second y-axis, which always misleads. */}
      <div className="grid gap-5 lg:grid-cols-2 print:grid-cols-2 print:gap-4">
        <ChartFrame
          title="Arrival flow"
          hint={hasFlow ? `Guests scanned per ${bucketMinutes} minutes · peak ${peak}` : 'Guests scanned per interval'}
          empty={
            <p className="max-w-[30ch] text-xs text-gray-400">
              The arrival pace appears here once guests start scanning at the door.
            </p>
          }
          chart={
            hasFlow
              ? (size) => (
                  <BarChart {...size} data={points} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                    <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
                    <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
                    <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
                    <Tooltip
                      cursor={{ fill: ACCENT_TINT, fillOpacity: 0.5 }}
                      content={<ChartTooltip unit="arrivals" />}
                    />
                    <Bar dataKey="count" fill={ACCENT} maxBarSize={24} radius={[4, 4, 0, 0]} />
                  </BarChart>
                )
              : null
          }
        />

        <ChartFrame
          title="Cumulative arrivals"
          hint="Running total against the expected guest count"
          empty={
            <p className="max-w-[30ch] text-xs text-gray-400">
              Progress toward the {totalAttending} expected guests will plot here as scans come in.
            </p>
          }
          chart={
            hasFlow
              ? (size) => (
                <AreaChart {...size} data={points} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="arrivalsWash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
                <YAxis
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={40}
                  domain={[0, Math.max(totalAttending, points[points.length - 1]?.cumulative ?? 0)]}
                />
                <Tooltip content={<ChartTooltip unit="checked in" />} />
                {/* Same unit as the series, so this is a reference line on the
                    one axis — never a second scale. */}
                {totalAttending > 0 ? (
                  <ReferenceLine
                    y={totalAttending}
                    stroke="#9ca3af"
                    strokeWidth={1}
                    label={{ value: 'Expected', position: 'insideTopRight', fill: '#6b7280', fontSize: 11 }}
                  />
                ) : null}
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  stroke={ACCENT}
                  strokeWidth={2}
                  fill="url(#arrivalsWash)"
                  dot={false}
                  activeDot={{ r: 4, fill: ACCENT, stroke: '#ffffff', strokeWidth: 2 }}
                />
                </AreaChart>
                )
              : null
          }
        />
      </div>

      {/* Nominal categories — door names carry no order — so every bar takes
          the same hue and length alone does the comparing. */}
      <ChartFrame
        title="Arrivals by door"
        hint="Guests admitted at each entrance"
        height={Math.max(140, doorCounts.length * 44 + 40)}
        printWidth={PRINT_FULL_WIDTH}
        empty={<p className="text-xs text-gray-400">No guests were scanned through any door.</p>}
        chart={
          doorCounts.length > 0
            ? (size) => (
                <BarChart {...size} data={doorCounts} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 8 }}>
                  <CartesianGrid stroke={GRID} strokeWidth={1} horizontal={false} />
                  <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="doorLabel"
                    tick={{ fill: '#374151', fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={130}
                  />
                  <Tooltip cursor={{ fill: ACCENT_TINT, fillOpacity: 0.5 }} content={<ChartTooltip unit="arrivals" />} />
                  <Bar dataKey="count" fill={ACCENT} maxBarSize={24} radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="count" position="right" fill="#374151" fontSize={12} />
                  </Bar>
                </BarChart>
              )
            : null
        }
      />

      <Section title="Door window" icon={<DoorOpen className="h-3.5 w-3.5 text-[#7E5896]" />}>
        <dl className="grid grid-cols-2 gap-px bg-gray-100 sm:grid-cols-3">
          <div className="bg-white px-5 py-4">
            <dt className="text-xs text-gray-400">First arrival</dt>
            <dd className="mt-1 text-sm font-semibold text-gray-900">
              {firstScan ? formatReportDateTime(firstScan) : 'No arrivals'}
            </dd>
          </div>
          <div className="bg-white px-5 py-4">
            <dt className="text-xs text-gray-400">Last arrival</dt>
            <dd className="mt-1 text-sm font-semibold text-gray-900">
              {lastScan ? formatReportDateTime(lastScan) : 'No arrivals'}
            </dd>
          </div>
          <div className="bg-white px-5 py-4">
            <dt className="text-xs text-gray-400">Doors used</dt>
            <dd className="mt-1 text-sm font-semibold text-gray-900">{doorCounts.length || 'None'}</dd>
          </div>
        </dl>
      </Section>

      <Section
        title="Door staff on record"
        icon={<ShieldCheck className="h-3.5 w-3.5 text-[#7E5896]" />}
        count={attendants.length}
      >
        {attendants.length === 0 ? (
          <Empty>No admin-assigned door staff for this event.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="opus-table w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/70 text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
                  <th className="px-5 py-2.5 text-left">Attendant</th>
                  <th className="px-5 py-2.5 text-left">Door</th>
                  <th className="px-5 py-2.5 text-left">Assigned</th>
                  <th className="px-5 py-2.5 text-left">Last scan</th>
                  <th className="px-5 py-2.5 text-left">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {attendants.map((a) => (
                  <tr key={a.id}>
                    <td className="px-5 py-2.5 font-medium text-gray-900">{a.attendantName}</td>
                    <td className="px-5 py-2.5 text-gray-600">{a.doorLabel}</td>
                    <td className="px-5 py-2.5 text-gray-500">{formatReportDateTime(a.createdAt)}</td>
                    <td className="px-5 py-2.5 text-gray-500">
                      {a.lastUsedAt ? formatReportDateTime(a.lastUsedAt) : 'Never used'}
                    </td>
                    <td className="px-5 py-2.5 text-gray-500">
                      {a.revokedAt ? `Revoked ${formatReportDateTime(a.revokedAt)}` : `Expires ${formatReportDateTime(a.expiresAt)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Arrivals" icon={<Users className="h-3.5 w-3.5 text-[#7E5896]" />} count={report.arrivals.length}>
        {report.arrivals.length === 0 ? (
          <Empty>Nobody has checked in yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="opus-table w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/70 text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
                  <th className="px-5 py-2.5 text-left">Guest</th>
                  <th className="px-5 py-2.5 text-left">Ticket</th>
                  <th className="px-5 py-2.5 text-left">Door</th>
                  <th className="px-5 py-2.5 text-left">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.arrivals.map((a, i) => (
                  <tr key={`${a.guestName}-${a.checkedInAt}-${i}`}>
                    <td className="px-5 py-2.5 font-medium text-gray-900">{a.guestName}</td>
                    <td className="px-5 py-2.5 text-gray-600">{ticketLabel(a.partySize)}</td>
                    <td className="px-5 py-2.5 text-gray-600">{a.doorLabel ?? 'Unrecorded'}</td>
                    <td className="px-5 py-2.5 tabular-nums text-gray-500">{formatReportTime(a.checkedInAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="No-shows"
        icon={<UserRoundX className="h-3.5 w-3.5 text-[#7E5896]" />}
        count={report.noShows.length}
      >
        {report.noShows.length === 0 ? (
          <Empty>
            {totalAttending === 0 ? 'No guests have RSVP’d attending yet.' : 'Every expected guest arrived.'}
          </Empty>
        ) : (
          <ul className="grid gap-x-6 gap-y-1 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
            {report.noShows.map((n, i) => (
              <li key={`${n.guestName}-${i}`} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate text-gray-700">{n.guestName}</span>
                <span className="shrink-0 text-xs text-gray-400">{ticketLabel(n.partySize)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="hidden print:block">
        <PrintLetterheadFooter className="mt-6" />
      </div>
    </div>
  )
}
