'use client'

import { useMemo, useState } from 'react'
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
import { DoorOpen, Search, ShieldCheck, UserRoundX, Users } from 'lucide-react'
import { formatReportDateTime, formatReportTime, formatRatePercent } from '@/lib/checkin/report-format'
import { reportStrings, type ReportLocale } from '@/lib/checkin/report-strings'
import { ticketLabelFor, type CheckinReportModel } from '@/lib/checkin/report-model-core'

/**
 * The couple's live door view.
 *
 * Reads the same canonical model the PDF renders from, so the screen and the
 * export can never disagree about what "attendance" means. Deliberately plain:
 * this is an operational surface, and the storytelling belongs in the Client
 * report the couple receives after the event is finalized.
 */

/** Brand purple, 5.64:1 on white — clears the 3:1 floor for data marks. */
const ACCENT = '#7E5896'
/** Lighter step of the same ramp: meter track and area wash only. */
const ACCENT_TINT = '#F0DFF6'
const GRID = '#e5e7eb'
const AXIS_TICK = { fill: '#9ca3af', fontSize: 11 }

function Figure({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
      <div className="text-[12px] font-medium text-gray-500">{label}</div>
      <div className="mt-2 text-[28px] leading-none font-semibold tracking-tight text-gray-900">{value}</div>
      {hint ? <div className="mt-2 text-[11px] text-gray-400">{hint}</div> : null}
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
  icon: React.ReactNode
  count?: number
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
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

const STATUS_CLASS: Record<string, string> = {
  admitted: 'bg-emerald-50 text-emerald-700',
  partial: 'bg-amber-50 text-amber-700',
  not_arrived: 'bg-gray-100 text-gray-600',
}

export default function OperationsReportClient({
  model,
  locale,
}: {
  model: CheckinReportModel
  locale: ReportLocale
}) {
  const t = reportStrings(locale)
  const [query, setQuery] = useState('')

  const { counts, rates, arrivals, doors, integrity, guests, staff, finalization } = model

  const seatPct = formatRatePercent(rates.seatAttendance)

  const points = useMemo(
    () =>
      arrivals.buckets.map((b) => ({
        label: formatReportTime(b.startsAt, locale),
        seats: b.seats,
        cumulative: b.cumulativeSeats,
      })),
    [arrivals.buckets, locale],
  )
  const hasFlow = points.length > 1

  // Newest first: during an event the question is always "who just came in?".
  const recentArrivals = useMemo(
    () =>
      guests
        .filter((g) => g.admittedSeats > 0 && g.firstAdmittedAt)
        .sort((a, b) => (b.firstAdmittedAt ?? '').localeCompare(a.firstAdmittedAt ?? ''))
        .slice(0, 25),
    [guests],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return guests
    return guests.filter(
      (g) => g.name.toLowerCase().includes(q) || (g.passId ?? '').toLowerCase().includes(q),
    )
  }, [guests, query])

  const statusLabel = (status: string, admitted: number, allowance: number) =>
    status === 'admitted'
      ? t.statusAdmitted
      : status === 'partial'
        ? `${t.statusPartial} ${admitted}/${allowance}`
        : t.statusNotArrived

  return (
    <div className="space-y-5">
      {/* The lifecycle is stated up front. During an event the figures move,
          and a couple reading a number needs to know whether it is settled. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white px-5 py-3">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${
              finalization.status === 'final'
                ? 'bg-emerald-50 text-emerald-700'
                : finalization.status === 'closed'
                  ? 'bg-gray-100 text-gray-600'
                  : 'bg-amber-50 text-amber-700'
            }`}
          >
            {finalization.status === 'final'
              ? t.statusFinal
              : finalization.status === 'closed'
                ? t.statusClosed
                : t.statusLive}
          </span>
          <span className="text-xs text-gray-500">
            {finalization.status === 'final'
              ? `${t.metaFinalized} ${formatReportDateTime(finalization.finalizedAt, locale)}`
              : finalization.status === 'closed'
                ? 'Entry has ended. Figures can still be corrected.'
                : 'Figures update as guests arrive.'}
          </span>
        </div>
        <p className="text-xs text-gray-400">
          {t.metaGenerated} {formatReportDateTime(model.generatedAt, locale)}
        </p>
      </div>

      {/* Invitations and seats are separate figures: a Double Entry card is one
          invitation and two people, and one "guests" number would hide that. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Figure
          label={t.confirmedInvitations}
          value={String(counts.confirmedInvitations)}
          hint={`${counts.singleInvitations} ${t.singleEntry} · ${counts.doubleInvitations} ${t.doubleEntry}`}
        />
        <Figure label={t.confirmedSeats} value={String(counts.confirmedSeats)} />
        <Figure
          label={t.guestsAdmitted}
          value={String(counts.admittedSeats)}
          hint={t.ofSeats(counts.confirmedSeats)}
        />
        <Figure
          label={t.attendanceRate}
          value={seatPct ?? '—'}
          hint={seatPct ? `${counts.admittedSeats} / ${counts.confirmedSeats}` : t.notYetMeasured}
        />
      </div>

      {rates.seatAttendance ? (
        <div className="rounded-2xl border border-gray-100 bg-white px-5 py-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold tracking-wide text-gray-500 uppercase">
              {t.attendanceRate}
            </span>
            <span className="font-semibold tabular-nums text-gray-700">
              {counts.admittedSeats} / {counts.confirmedSeats}
            </span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full" style={{ background: ACCENT_TINT }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min((rates.seatAttendance.numerator / rates.seatAttendance.denominator) * 100, 100)}%`,
                background: ACCENT,
              }}
            />
          </div>
        </div>
      ) : null}

      {/* Two time views of the same admissions: pace, then progress.
          Deliberately two frames rather than bars + line on one, which would
          need a second y-axis and always misleads. */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900">{t.arrivalHeading}</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            {arrivals.bucketMinutes > 0 ? t.arrivalSubtitle(arrivals.bucketMinutes) : ''}
          </p>
          <div className="mt-4 h-[220px] w-full">
            {hasFlow ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
                  <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
                  <Tooltip cursor={{ fill: ACCENT_TINT, fillOpacity: 0.5 }} content={<ChartTooltip unit="seats" />} />
                  <Bar dataKey="seats" fill={ACCENT} maxBarSize={24} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-center">
                <p className="max-w-[30ch] text-xs text-gray-400">{t.arrivalEmpty}</p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900">Progress against expected</h3>
          <p className="mt-0.5 text-xs text-gray-500">Running total of seats admitted</p>
          <div className="mt-4 h-[220px] w-full">
            {hasFlow ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <defs>
                    <linearGradient id="opsWash" x1="0" y1="0" x2="0" y2="1">
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
                    domain={[0, Math.max(counts.confirmedSeats, counts.admittedSeats)]}
                  />
                  <Tooltip content={<ChartTooltip unit="seats in" />} />
                  {/* Same unit as the series, so this is a reference line on the
                      one axis — never a second scale. */}
                  {counts.confirmedSeats > 0 ? (
                    <ReferenceLine
                      y={counts.confirmedSeats}
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
                    fill="url(#opsWash)"
                    dot={false}
                    activeDot={{ r: 4, fill: ACCENT, stroke: '#ffffff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-center">
                <p className="max-w-[30ch] text-xs text-gray-400">{t.arrivalEmpty}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Door names carry no order, so every bar takes the same hue and length
          alone does the comparing. */}
      {doors.length > 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900">{t.doorsHeading}</h3>
          <div className="mt-4 w-full" style={{ height: Math.max(140, doors.length * 44 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={doors} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 8 }}>
                <CartesianGrid stroke={GRID} strokeWidth={1} horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fill: '#374151', fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={130}
                />
                <Tooltip cursor={{ fill: ACCENT_TINT, fillOpacity: 0.5 }} content={<ChartTooltip unit="seats" />} />
                <Bar dataKey="admittedSeats" fill={ACCENT} maxBarSize={24} radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="admittedSeats" position="right" fill="#374151" fontSize={12} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Figure label={t.entryPointsUsed} value={String(doors.length)} />
        <Figure label={t.teamMembers} value={String(staff.length)} />
        <Figure
          label={t.attemptsBlocked}
          value={String(integrity.exhaustedAttempts)}
          hint="Beyond the valid ticket allowance"
        />
        <Figure
          label={t.manualAdmissions}
          // Null means the structured columns are not there yet, which is a
          // different claim from "none happened".
          value={integrity.manualAdmissions === null ? '—' : String(integrity.manualAdmissions)}
          hint={integrity.manualAdmissions === null ? t.notRecorded : null}
        />
      </div>

      <Section title="Last 25 arrivals" icon={<Users className="h-3.5 w-3.5 text-[#7E5896]" />} count={recentArrivals.length}>
        {recentArrivals.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">{t.arrivalEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/70 text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
                  <th className="px-5 py-2.5 text-left">{t.colGuest}</th>
                  <th className="px-5 py-2.5 text-left">{t.colTicket}</th>
                  <th className="px-5 py-2.5 text-left">{t.colDoor}</th>
                  <th className="px-5 py-2.5 text-left">{t.colArrived}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentArrivals.map((g) => (
                  <tr key={g.invitationId}>
                    <td className="px-5 py-2.5 font-medium text-gray-900">{g.name}</td>
                    <td className="px-5 py-2.5 text-gray-600">{ticketLabelFor(g.entryAllowance)}</td>
                    <td className="px-5 py-2.5 text-gray-600">{g.door ?? '—'}</td>
                    <td className="px-5 py-2.5 tabular-nums text-gray-500">
                      {formatReportTime(g.firstAdmittedAt, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title={t.appendixHeading}
        icon={<Search className="h-3.5 w-3.5 text-[#7E5896]" />}
        count={filtered.length}
      >
        <div className="border-b border-gray-100 px-5 py-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or Pass ID"
            aria-label="Search guests by name or Pass ID"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#C9A0DC]"
          />
        </div>
        {filtered.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">
            {guests.length === 0 ? t.appendixEmpty : 'No guest matches that search.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/70 text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
                  <th className="px-5 py-2.5 text-left">{t.colGuest}</th>
                  <th className="px-5 py-2.5 text-left">{t.colPass}</th>
                  <th className="px-5 py-2.5 text-left">{t.colTicket}</th>
                  <th className="px-5 py-2.5 text-left">{t.colStatus}</th>
                  <th className="px-5 py-2.5 text-left">{t.colArrived}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((g) => (
                  <tr key={g.invitationId}>
                    <td className="px-5 py-2.5 font-medium text-gray-900">{g.name}</td>
                    <td className="px-5 py-2.5 font-mono text-xs text-gray-500">{g.passId ?? ''}</td>
                    <td className="px-5 py-2.5 text-gray-600">{ticketLabelFor(g.entryAllowance)}</td>
                    <td className="px-5 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[g.status]}`}
                      >
                        {statusLabel(g.status, g.admittedSeats, g.entryAllowance)}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 tabular-nums text-gray-500">
                      {g.firstAdmittedAt
                        ? formatReportTime(g.firstAdmittedAt, locale)
                        : g.status === 'not_arrived'
                          ? ''
                          : t.timeNotRecorded}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Door window" icon={<DoorOpen className="h-3.5 w-3.5 text-[#7E5896]" />}>
          <dl className="grid grid-cols-2 gap-px bg-gray-100">
            <div className="bg-white px-5 py-4">
              <dt className="text-xs text-gray-400">{t.firstGuestArrived}</dt>
              <dd className="mt-1 text-sm font-semibold text-gray-900">
                {arrivals.firstAdmittedAt ? formatReportDateTime(arrivals.firstAdmittedAt, locale) : '—'}
              </dd>
            </div>
            <div className="bg-white px-5 py-4">
              <dt className="text-xs text-gray-400">{t.lastGuestArrived}</dt>
              <dd className="mt-1 text-sm font-semibold text-gray-900">
                {arrivals.lastAdmittedAt ? formatReportDateTime(arrivals.lastAdmittedAt, locale) : '—'}
              </dd>
            </div>
          </dl>
        </Section>

        <Section
          title="Door team"
          icon={<ShieldCheck className="h-3.5 w-3.5 text-[#7E5896]" />}
          count={staff.length}
        >
          {staff.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400">
              No attendant has admitted a guest yet.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {staff.map((p) => (
                <li key={p.name} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span className="text-gray-700">{p.name}</span>
                  <span className="text-xs text-gray-400">
                    {p.doors.join(', ')} · {p.admittedSeats}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {counts.noShowInvitations > 0 ? (
        <Section
          title="Not yet arrived"
          icon={<UserRoundX className="h-3.5 w-3.5 text-[#7E5896]" />}
          count={counts.noShowInvitations}
        >
          <ul className="grid gap-x-6 gap-y-1 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
            {guests
              .filter((g) => g.admittedSeats === 0)
              .map((g) => (
                <li key={g.invitationId} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate text-gray-700">{g.name}</span>
                  <span className="shrink-0 text-xs text-gray-400">{ticketLabelFor(g.entryAllowance)}</span>
                </li>
              ))}
          </ul>
        </Section>
      ) : null}
    </div>
  )
}
