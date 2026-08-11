'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import {
  CalendarDays,
  Check,
  Inbox,
  Plane,
  Plus,
  Sun,
  Users,
  Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { LEAVE_STATE_LABELS, type LeaveState } from '@/lib/leave/states'
import { PORTION_LABELS, addDays, type LeavePortion } from '@/lib/leave/days'
import type {
  AvailabilityRow,
  HolidayRow,
  LeaveBalanceRow,
  LeaveRequestSummary,
  LeaveTypeSummary,
} from '@/lib/leave/queries'
import type { ActionResult, CreateRequestInput } from './actions'

const GREEN_PILL =
  'inline-flex items-center rounded-full bg-[#9FE870] px-2.5 py-0.5 text-[11px] font-semibold text-gray-900'

const STATE_TONE: Record<LeaveState, string> = {
  draft: 'bg-gray-100 text-gray-700',
  submitted: 'bg-blue-50 text-blue-700',
  under_review: 'bg-blue-50 text-blue-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-rose-50 text-rose-700',
  returned: 'bg-amber-50 text-amber-700',
  cancelled: 'bg-gray-100 text-gray-500',
  withdrawn: 'bg-gray-100 text-gray-500',
}

const AVAILABILITY_TONE: Record<string, string> = {
  available: 'bg-emerald-100',
  on_leave: 'bg-rose-200',
  partial_leave: 'bg-amber-200',
  public_holiday: 'bg-blue-100',
  rest_day: 'bg-gray-100',
  not_employed: 'bg-gray-50',
}

type Actions = {
  createRequest: (input: CreateRequestInput) => Promise<ActionResult<{ requestId: string; totalDays: number }>>
  submitRequest: (id: string) => Promise<ActionResult<{ totalDays: number }>>
  decideRequest: (
    id: string,
    decision: 'approve' | 'reject' | 'return',
    note?: string,
  ) => Promise<ActionResult<{ state: string }>>
  cancelRequest: (id: string, reason: string) => Promise<ActionResult<{ state: string }>>
}

function formatDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function formatDays(days: number): string {
  return days === 1 ? '1 day' : `${days} days`
}

export default function LeaveClient({
  today,
  types,
  balances,
  requests,
  upcoming,
  holidays,
  availability,
  approvalQueue,
  isHr,
  actions,
}: {
  today: string
  types: LeaveTypeSummary[]
  balances: LeaveBalanceRow[]
  requests: LeaveRequestSummary[]
  upcoming: LeaveRequestSummary[]
  holidays: HolidayRow[]
  availability: AvailabilityRow[]
  approvalQueue: LeaveRequestSummary[]
  isHr: boolean
  actions: Actions
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [tab, setTab] = useState<'balances' | 'requests' | 'team' | 'holidays' | 'queue'>('balances')
  const [showForm, setShowForm] = useState(false)

  const run = (fn: () => Promise<ActionResult>) => {
    setMessage(null)
    startTransition(async () => {
      const result = await fn()
      if (result.ok) router.refresh()
      else setMessage({ tone: 'error', text: result.error })
    })
  }

  const TABS = [
    { id: 'balances' as const, label: 'Balances', icon: Wallet },
    { id: 'requests' as const, label: 'My requests', icon: Plane, count: requests.length },
    { id: 'team' as const, label: 'Team', icon: Users },
    { id: 'holidays' as const, label: 'Holidays', icon: Sun },
    { id: 'queue' as const, label: 'To approve', icon: Inbox, count: approvalQueue.length },
  ].filter((t) => t.id !== 'queue' || approvalQueue.length > 0 || isHr)

  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => {
            const Icon = t.icon
            return (
              <button data-opus-button="control"
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors',
                  tab === t.id
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
                {t.label}
                {'count' in t && t.count ? (
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-[11px] font-semibold',
                      tab === t.id ? 'bg-white/20' : 'bg-gray-200 text-gray-700',
                    )}
                  >
                    {t.count}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
        <button data-opus-button="primary" data-opus-button-size="medium"
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-gray-800"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          {showForm ? 'Close' : 'Request leave'}
        </button>
      </nav>

      {message && (
        <p
          className={cn(
            'rounded-xl px-4 py-3 text-sm',
            message.tone === 'error' ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800',
          )}
        >
          {message.text}
        </p>
      )}

      {showForm && (
        <RequestForm
          today={today}
          types={types}
          balances={balances}
          pending={pending}
          onCreate={async (input) => {
            const created = await actions.createRequest(input)
            if (!created.ok) return created
            const submitted = await actions.submitRequest(created.requestId)
            if (submitted.ok) {
              setShowForm(false)
              setMessage({
                tone: 'ok',
                text: `Requested ${formatDays(created.totalDays)}. It is with your manager now.`,
              })
              router.refresh()
            }
            return submitted
          }}
        />
      )}

      {tab === 'balances' && (
        <div className="space-y-5">
          {balances.length === 0 ? (
            <Empty>No leave balances yet. People Ops sets these up with your policy.</Empty>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {balances.map((b) => (
                <section
                  key={b.leaveTypeId}
                  className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"
                >
                  <h2 className="text-sm font-semibold text-gray-900">{b.leaveTypeName}</h2>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">
                    {b.availableDays}
                    <span className="ml-1 text-base font-medium text-gray-400">days left</span>
                  </p>
                  {b.pendingDays > 0 && (
                    <p className="mt-1 text-[13px] text-amber-700">
                      {formatDays(b.pendingDays)} awaiting a decision, already counted.
                    </p>
                  )}
                  <dl className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-[13px] text-gray-500">
                    <Row label="Entitlement" value={b.accruedDays} />
                    {b.carryoverDays > 0 && <Row label="Carried over" value={b.carryoverDays} />}
                    {b.openingDays > 0 && <Row label="Opening" value={b.openingDays} />}
                    <Row label="Taken" value={b.usedDays} />
                    {b.adjustedDays !== 0 && <Row label="Adjustments" value={b.adjustedDays} />}
                    {b.expiredDays > 0 && <Row label="Expired" value={b.expiredDays} />}
                  </dl>
                  <p className="mt-3 text-[12px] text-gray-400">
                    Every figure here is the sum of your leave ledger, not a number anyone edits.
                  </p>
                </section>
              ))}
            </div>
          )}

          {upcoming.length > 0 && (
            <section className="rounded-2xl border border-gray-100 bg-white p-5">
              <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-gray-500">
                <CalendarDays className="h-4 w-4 text-gray-400" strokeWidth={1.75} />
                Upcoming approved leave
              </h2>
              <ul className="mt-3 space-y-2">
                {upcoming.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      <span className="font-medium text-gray-900">{r.leaveTypeName}</span>
                      <span className="ml-2 text-gray-500">
                        {formatDay(r.startDate)} to {formatDay(r.endDate)}
                      </span>
                    </span>
                    <span className={GREEN_PILL}>{formatDays(r.totalDays)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {tab === 'requests' && (
        <RequestList
          requests={requests}
          emptyText="You have not requested any leave yet."
          pending={pending}
          onCancel={(id, reason) => run(() => actions.cancelRequest(id, reason))}
        />
      )}

      {tab === 'queue' && (
        <RequestList
          requests={approvalQueue}
          emptyText="Nothing is waiting on you."
          showEmployee
          pending={pending}
          onDecide={(id, decision, note) => run(() => actions.decideRequest(id, decision, note))}
        />
      )}

      {tab === 'team' && <TeamCalendar availability={availability} today={today} />}

      {tab === 'holidays' && (
        <section className="rounded-2xl border border-gray-100 bg-white p-5">
          {holidays.length === 0 ? (
            <Empty>No public holidays are on the calendar for this year yet.</Empty>
          ) : (
            <ul className="divide-y divide-gray-100">
              {holidays.map((h) => (
                <li key={`${h.date}-${h.name}`} className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-gray-900">{h.name}</span>
                  <span className="flex items-center gap-2 text-[13px] text-gray-500">
                    {!h.isPaid && <span className={GREEN_PILL}>Unpaid</span>}
                    {formatDay(h.date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[12px] text-gray-400">
            Leave requests skip these dates automatically, so a holiday inside your booking does
            not cost you a day.
          </p>
        </section>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <dt>{label}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
      {children}
    </div>
  )
}

function RequestForm({
  today,
  types,
  balances,
  pending,
  onCreate,
}: {
  today: string
  types: LeaveTypeSummary[]
  balances: LeaveBalanceRow[]
  pending: boolean
  onCreate: (input: CreateRequestInput) => Promise<ActionResult>
}) {
  const [leaveTypeId, setLeaveTypeId] = useState(types[0]?.id ?? '')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [portion, setPortion] = useState<LeavePortion>('full')
  const [hours, setHours] = useState(2)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const type = types.find((t) => t.id === leaveTypeId)
  const balance = balances.find((b) => b.leaveTypeId === leaveTypeId)

  // A multi-day range with a half-day portion would mean half of every day,
  // which is almost never what someone means, so partial portions pin the end
  // date to the start.
  const isPartial = portion !== 'full'

  return (
    <form
      className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"
      onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        setBusy(true)
        const result = await onCreate({
          leaveTypeId,
          startDate,
          endDate: isPartial ? startDate : endDate,
          portion,
          hours: portion === 'hours' ? hours : null,
          reason,
        })
        setBusy(false)
        if (!result.ok) setError(result.error)
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-[13px] font-semibold text-gray-700">
          Leave type
          <select
            value={leaveTypeId}
            onChange={(e) => {
              setLeaveTypeId(e.target.value)
              setPortion('full')
            }}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal"
          >
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-[13px] font-semibold text-gray-700">
          How much
          <select
            value={portion}
            onChange={(e) => setPortion(e.target.value as LeavePortion)}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal"
          >
            <option value="full">{PORTION_LABELS.full}</option>
            {type?.allowsPartialDay && (
              <>
                <option value="half_am">{PORTION_LABELS.half_am}</option>
                <option value="half_pm">{PORTION_LABELS.half_pm}</option>
              </>
            )}
            {type?.allowsHourly && <option value="hours">{PORTION_LABELS.hours}</option>}
          </select>
        </label>

        <label className="text-[13px] font-semibold text-gray-700">
          {isPartial ? 'Date' : 'From'}
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value)
              if (e.target.value > endDate) setEndDate(e.target.value)
            }}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal"
          />
        </label>

        {!isPartial ? (
          <label className="text-[13px] font-semibold text-gray-700">
            To
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal"
            />
          </label>
        ) : portion === 'hours' ? (
          <label className="text-[13px] font-semibold text-gray-700">
            Hours
            <input
              type="number"
              min={0.5}
              max={12}
              step={0.5}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal"
            />
          </label>
        ) : (
          <div />
        )}
      </div>

      <label className="block text-[13px] font-semibold text-gray-700">
        Reason
        <textarea
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Family visit upcountry."
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal"
        />
      </label>

      {balance && (
        <p className="text-[13px] text-gray-500">
          {balance.availableDays} days available
          {balance.pendingDays > 0 && `, ${balance.pendingDays} already awaiting a decision`}.
        </p>
      )}
      {type?.requiresDocument && (
        <p className="text-[13px] text-amber-700">
          This leave type needs a supporting document. You can attach one after creating the
          request.
        </p>
      )}
      {error && <p className="text-sm text-rose-700">{error}</p>}

      <button data-opus-button="primary" data-opus-button-size="medium"
        type="submit"
        disabled={pending || busy}
        className="rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
      >
        Submit request
      </button>
    </form>
  )
}

function RequestList({
  requests,
  emptyText,
  showEmployee,
  pending,
  onDecide,
  onCancel,
}: {
  requests: LeaveRequestSummary[]
  emptyText: string
  showEmployee?: boolean
  pending: boolean
  onDecide?: (id: string, decision: 'approve' | 'reject' | 'return', note?: string) => void
  onCancel?: (id: string, reason: string) => void
}) {
  const [notes, setNotes] = useState<Record<string, string>>({})

  if (requests.length === 0) return <Empty>{emptyText}</Empty>

  return (
    <ul className="space-y-3">
      {requests.map((r) => (
        <li
          key={r.id}
          className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                {r.leaveTypeName}
                {showEmployee && r.employeeName && (
                  <span className="ml-2 font-normal text-gray-500">{r.employeeName}</span>
                )}
              </p>
              <p className="mt-0.5 text-[13px] text-gray-500">
                {formatDay(r.startDate)} to {formatDay(r.endDate)} · {formatDays(r.totalDays)}
                {r.documentCount > 0 &&
                  ` · ${r.documentCount} ${r.documentCount === 1 ? 'document' : 'documents'}`}
              </p>
              {r.reason && <p className="mt-1.5 text-sm text-gray-700">{r.reason}</p>}
              {r.decisionNote && (
                <p className="mt-1 text-[13px] text-gray-500">Note: {r.decisionNote}</p>
              )}
            </div>
            <span
              className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold', STATE_TONE[r.state])}
            >
              {LEAVE_STATE_LABELS[r.state]}
            </span>
          </div>

          {onDecide && (r.state === 'submitted' || r.state === 'under_review') && (
            <>
              <input
                type="text"
                value={notes[r.id] ?? ''}
                onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                placeholder="Reason, if you are rejecting or returning it"
                className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button data-opus-button="danger" data-opus-button-size="medium"
                  type="button"
                  disabled={pending}
                  onClick={() => onDecide(r.id, 'reject', notes[r.id])}
                  className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-[13px] font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                >
                  Reject
                </button>
                <button data-opus-button="warning" data-opus-button-size="medium"
                  type="button"
                  disabled={pending}
                  onClick={() => onDecide(r.id, 'return', notes[r.id])}
                  className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                >
                  Return
                </button>
                <button data-opus-button="control"
                  type="button"
                  disabled={pending}
                  onClick={() => onDecide(r.id, 'approve', notes[r.id])}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#9FE870] px-4 py-2 text-[13px] font-semibold text-gray-900 hover:brightness-95 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" strokeWidth={2} />
                  Approve
                </button>
              </div>
            </>
          )}

          {onCancel && (r.state === 'approved' || r.state === 'submitted' || r.state === 'draft') && (
            <>
              <input
                type="text"
                value={notes[r.id] ?? ''}
                onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                placeholder="Why are you cancelling?"
                className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <button data-opus-button="control"
                type="button"
                disabled={pending || !(notes[r.id] ?? '').trim()}
                onClick={() => onCancel(r.id, notes[r.id] ?? '')}
                className="mt-3 rounded-full border border-gray-200 px-4 py-2 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {r.state === 'approved' ? 'Cancel this leave' : 'Withdraw'}
              </button>
              {r.state === 'approved' && (
                <p className="mt-1.5 text-[12px] text-gray-400">
                  Cancelling returns the days to your balance and records the change. Your leave
                  history keeps both.
                </p>
              )}
            </>
          )}
        </li>
      ))}
    </ul>
  )
}

function TeamCalendar({
  availability,
  today,
}: {
  availability: AvailabilityRow[]
  today: string
}) {
  const { people, dates } = useMemo(() => {
    const byPerson = new Map<string, { name: string; days: Map<string, AvailabilityRow> }>()
    const dateSet = new Set<string>()
    for (const row of availability) {
      dateSet.add(row.date)
      const entry = byPerson.get(row.employeeId) ?? { name: row.employeeName, days: new Map() }
      entry.days.set(row.date, row)
      byPerson.set(row.employeeId, entry)
    }
    return {
      people: [...byPerson.values()].sort((a, b) => a.name.localeCompare(b.name)),
      dates: [...dateSet].sort(),
    }
  }, [availability])

  if (people.length === 0) {
    return <Empty>No availability has been computed for your team yet.</Empty>
  }

  // Fall back to a fortnight of dates so the grid still renders before the
  // availability job has run over the whole window.
  const columns = dates.length > 0 ? dates : Array.from({ length: 14 }, (_, i) => addDays(today, i))

  return (
    <section className="overflow-x-auto rounded-2xl border border-gray-100 bg-white p-5">
      <table className="opus-table w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr>
            <th className="pb-2 text-[12px] font-semibold uppercase tracking-wide text-gray-400">
              Who
            </th>
            {columns.map((d) => (
              <th key={d} className="pb-2 text-center text-[11px] font-medium text-gray-400">
                {d.slice(8)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.map((person) => (
            <tr key={person.name}>
              <td className="py-1.5 pr-3 text-[13px] font-medium text-gray-900">{person.name}</td>
              {columns.map((d) => {
                const cell = person.days.get(d)
                return (
                  <td key={d} className="px-0.5 py-1.5">
                    <span
                      title={cell ? cell.status.replace(/_/g, ' ') : 'unknown'}
                      className={cn(
                        'block h-6 rounded',
                        AVAILABILITY_TONE[cell?.status ?? 'available'] ?? 'bg-gray-50',
                      )}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[12px] text-gray-400">
        Shows who is in, not why they are out. The reason for an absence is between the employee
        and People Ops.
      </p>
    </section>
  )
}
