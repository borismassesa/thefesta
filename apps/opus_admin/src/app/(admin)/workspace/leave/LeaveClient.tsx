'use client'

import { useState, useTransition } from 'react'
import { CalendarDays, Plane, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LeaveType } from './_lib/leave-calculation'
import { daysBetween } from './_lib/leave-calculation'
import type { LeaveStatus } from './_lib/leave-policy'
import type { MyLeaveRequest } from './_lib/queries'
import type { LeaveActionResult } from './actions'

type Actions = {
  create: (raw: unknown) => Promise<LeaveActionResult>
  update: (rawId: unknown, raw: unknown) => Promise<LeaveActionResult>
  withdraw: (rawId: unknown) => Promise<LeaveActionResult>
}

const STATUS_STYLE: Record<LeaveStatus, string> = {
  Pending: 'bg-amber-50 text-amber-700',
  Approved: 'bg-[#9FE870] text-gray-900',
  Rejected: 'bg-rose-50 text-rose-700',
  Cancelled: 'bg-gray-100 text-gray-500',
}

export default function LeaveClient({
  balance,
  requests,
  leaveTypes,
  today,
  canRequest,
  readOnlyNote,
  actions,
}: {
  balance: number
  requests: MyLeaveRequest[]
  leaveTypes: LeaveType[]
  today: string
  canRequest: boolean
  readOnlyNote: string | null
  actions: Actions
  navIncludesLeave?: boolean
}) {
  const [composing, setComposing] = useState(false)
  const [editing, setEditing] = useState<MyLeaveRequest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const pendingCount = requests.filter((r) => r.status === 'Pending').length
  const approvedDays = requests
    .filter((r) => r.status === 'Approved')
    .reduce((sum, r) => sum + r.days, 0)

  const close = () => {
    setComposing(false)
    setEditing(null)
    setError(null)
  }

  const submit = (form: FormData) => {
    // Only the four fields the parser accepts are sent. There is deliberately
    // no employee id in this payload; the server resolves it.
    const payload = {
      type: form.get('type'),
      startDate: form.get('startDate'),
      endDate: form.get('endDate'),
      reason: form.get('reason'),
    }
    startTransition(async () => {
      const result = editing
        ? await actions.update(editing.id, payload)
        : await actions.create(payload)
      // Only the controlled message from the action is shown. Unexpected
      // throws are redacted by the framework and never surfaced raw.
      if (result.ok) close()
      else setError(result.error)
    })
  }

  const withdraw = (id: string) => {
    startTransition(async () => {
      const result = await actions.withdraw(id)
      if (!result.ok) setError(result.error)
    })
  }

  const active = composing || editing !== null

  return (
    <div className="pb-12">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">My Leave</h1>
          <p className="mt-1 text-sm text-gray-500">
            Your balance, requests and their status.
          </p>
        </div>
        {canRequest && !active && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
          >
            <Plus className="h-4 w-4" />
            Request leave
          </button>
        )}
      </header>

      {readOnlyNote && (
        <p className="mb-6 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          {readOnlyNote}
        </p>
      )}

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat icon={Plane} label="Annual leave left" value={`${balance}`} detail="days" />
        <Stat icon={CalendarDays} label="Awaiting approval" value={`${pendingCount}`} detail={pendingCount === 1 ? 'request' : 'requests'} />
        <Stat icon={CalendarDays} label="Approved this record" value={`${approvedDays}`} detail="days" />
      </div>

      {active && (
        <form
          action={submit}
          className="mb-8 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              {editing ? 'Edit request' : 'New leave request'}
            </h2>
            <button type="button" onClick={close} aria-label="Close" className="text-gray-400 hover:text-gray-700">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Leave type">
              <select name="type" defaultValue={editing?.type ?? 'Annual'} className={inputCls}>
                {leaveTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="From">
              <input type="date" name="startDate" min={today} defaultValue={editing?.startDate} required className={inputCls} />
            </Field>
            <Field label="To">
              <input type="date" name="endDate" min={today} defaultValue={editing?.endDate} required className={inputCls} />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Reason">
              <textarea name="reason" rows={2} defaultValue={editing?.reason} required minLength={3} maxLength={500} className={inputCls} />
            </Field>
          </div>

          {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {pending ? 'Saving…' : editing ? 'Save changes' : 'Submit request'}
            </button>
            <button type="button" onClick={close} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      )}

      {!active && error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
        My requests
      </h2>
      {requests.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-400">
          No leave requests yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {requests.map((r) => (
            <li key={r.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{r.type}</span>
                    <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold', STATUS_STYLE[r.status])}>
                      {r.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {r.startDate} to {r.endDate} · {r.days} {r.days === 1 ? 'day' : 'days'}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-gray-400">{r.reason}</p>
                </div>
                {canRequest && r.status === 'Pending' && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setEditing(r); setError(null) }}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => withdraw(r.id)}
                      disabled={pending}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    >
                      Withdraw
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC]'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </span>
      {children}
    </label>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Plane
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#F0DFF6] to-[#FBF5FD] text-[#7E5896]">
        <Icon className="h-5 w-5 stroke-[1.5]" />
      </span>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{value}</p>
      <p className="mt-0.5 text-sm text-gray-500">{detail}</p>
    </div>
  )
}
