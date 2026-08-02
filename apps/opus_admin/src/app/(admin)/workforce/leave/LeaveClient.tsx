'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  CalendarOff,
  CheckCircle2,
  ChevronDown,
  Clock4,
  ListFilter,
  LogIn,
  LogOut,
  Plane,
  Plus,
  Search,
  X,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Avatar from '../_components/Avatar'
import StatusPill from '../_components/StatusPill'
import Kpi, { KpiRow } from '../_components/Kpi'
import { formatDate } from '../_lib/format'
import type {
  AttendancePoint,
  EmployeeLeaveView,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
} from '../_lib/data'
import { cancelLeaveRequest, decideLeaveRequest, submitLeaveRequest, upsertAttendance } from './actions'

const LEAVE_TYPES: LeaveType[] = ['Annual', 'Sick', 'Maternity', 'Paternity', 'Compassionate', 'Unpaid']

type Tab = 'requests' | 'attendance' | 'balances'

const STATUS_TONE: Record<LeaveStatus, 'amber' | 'green' | 'rose' | 'gray'> = {
  Pending: 'amber',
  Approved: 'green',
  Rejected: 'rose',
  Cancelled: 'gray',
}

const TYPE_TONE: Record<LeaveType, 'purple' | 'blue' | 'green' | 'amber' | 'rose' | 'gray'> = {
  Annual: 'purple',
  Sick: 'rose',
  Maternity: 'blue',
  Paternity: 'blue',
  Compassionate: 'amber',
  Unpaid: 'gray',
}

const ATTENDANCE_TONE: Record<AttendancePoint['status'], 'green' | 'amber' | 'rose' | 'blue' | 'gray'> = {
  Present: 'green',
  Late: 'amber',
  Absent: 'rose',
  Remote: 'blue',
  Leave: 'gray',
}

const STATUS_FILTERS = ['All', 'Pending', 'Approved', 'Rejected', 'Cancelled'] as const

export default function LeaveClient({
  employees,
  requests,
  attendance,
}: {
  employees: EmployeeLeaveView[]
  requests: LeaveRequest[]
  attendance: AttendancePoint[]
  isOrgScope?: boolean
  isEmptyTeam?: boolean
}) {
  const [tab, setTab] = useState<Tab>('requests')

  const byId = useMemo(() => new Map(employees.map((e) => [e.id, e] as const)), [employees])

  const onLeaveToday = attendance.filter((a) => a.status === 'Leave').length
  const present = attendance.filter((a) => a.status === 'Present' || a.status === 'Remote').length
  const late = attendance.filter((a) => a.status === 'Late').length
  const pending = requests.filter((r) => r.status === 'Pending').length

  return (
    <div className="space-y-6">
      <KpiRow>
        <Kpi label="On leave today" value={String(onLeaveToday)} hint="across the team" icon={<Plane className="h-4 w-4" />} />
        <Kpi label="Pending approvals" value={String(pending)} deltaTone={pending > 0 ? 'neutral' : 'positive'} delta={pending > 0 ? 'Needs review' : 'All clear'} icon={<CalendarOff className="h-4 w-4" />} />
        <Kpi label="Present / remote" value={String(present)} hint="clocked in" icon={<LogIn className="h-4 w-4" />} />
        <Kpi label="Late arrivals" value={String(late)} deltaTone={late > 0 ? 'negative' : 'positive'} delta={late > 0 ? `${late} today` : '0 today'} icon={<Clock4 className="h-4 w-4" />} />
      </KpiRow>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-white p-1.5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <TabButton current={tab} value="requests" onSelect={setTab} count={requests.length}>
          Requests
        </TabButton>
        <TabButton current={tab} value="attendance" onSelect={setTab} count={attendance.length}>
          Attendance today
        </TabButton>
        <TabButton current={tab} value="balances" onSelect={setTab} count={employees.filter((e) => e.status !== 'Resigned').length}>
          Balances
        </TabButton>
      </div>

      {tab === 'requests' && (
        <RequestsTable
          requests={requests}
          byId={byId}
          employees={employees.filter((e) => e.status !== 'Resigned')}
        />
      )}
      {tab === 'attendance' && <AttendanceTable attendance={attendance} byId={byId} />}
      {tab === 'balances' && (
        <BalancesTable
          employees={employees.filter((e) => e.status !== 'Resigned')}
          requests={requests}
        />
      )}
    </div>
  )
}

function TabButton({
  current,
  value,
  onSelect,
  count,
  children,
}: {
  current: Tab
  value: Tab
  onSelect: (v: Tab) => void
  count: number
  children: React.ReactNode
}) {
  const active = current === value
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={cn(
        'flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
        active ? 'bg-[#F0DFF6] text-[#5B2D8E]' : 'text-gray-500 hover:bg-gray-50',
      )}
    >
      {children}
      <span
        className={cn(
          'inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold',
          active ? 'bg-[#7E5896] text-white' : 'bg-gray-100 text-gray-500',
        )}
      >
        {count}
      </span>
    </button>
  )
}

function RequestsTable({
  requests,
  byId,
  employees,
}: {
  requests: LeaveRequest[]
  byId: Map<string, EmployeeLeaveView>
  employees: EmployeeLeaveView[]
}) {
  const [filter, setFilter] = useState<LeaveStatus | 'All'>('All')

  // Counts shown in the dropdown labels. Derived from the SCOPED requests the
  // server sent, so a manager sees counts for their own team rather than the
  // whole company.
  const statusCounts = useMemo(() => {
    const counts: Record<LeaveStatus | 'All', number> = {
      All: requests.length,
      Pending: 0,
      Approved: 0,
      Rejected: 0,
      Cancelled: 0,
    }
    for (const r of requests) counts[r.status] += 1
    return counts
  }, [requests])
  const [search, setSearch] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [viewing, setViewing] = useState<LeaveRequest | null>(null)

  function decide(id: string, decision: 'Approved' | 'Rejected') {
    setError(null)
    setBusyId(id)
    startTransition(async () => {
      try {
        // The action returns expected failures instead of throwing, because
        // Next redacts thrown Server Action messages in production. Only the
        // controlled message is shown; an unexpected throw falls to the catch
        // and renders a generic string.
        const result = await decideLeaveRequest(id, decision)
        if (!result.ok) setError(result.error)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not update the request.')
      } finally {
        setBusyId(null)
      }
    })
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return requests.filter((r) => {
      if (filter !== 'All' && r.status !== filter) return false
      if (!q) return true
      const emp = byId.get(r.employeeId)
      return (
        (emp?.name.toLowerCase().includes(q) ?? false) ||
        r.type.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q)
      )
    })
  }, [requests, filter, search, byId])

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search by employee, type or reason…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
          />
        </div>
        {/* Status filter. A native select rather than a custom menu so it
            keeps keyboard and screen-reader behaviour for free and uses the
            platform picker on mobile. Counts sit in the labels so you can see
            there are pending requests without opening it. */}
        <div className="relative">
          <ListFilter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <select
            aria-label="Filter by status"
            value={filter}
            onChange={(e) => setFilter(e.target.value as LeaveStatus | 'All')}
            className={cn(
              'appearance-none rounded-lg border py-2 pl-9 pr-9 text-sm font-medium outline-none transition-colors',
              'focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]',
              // Tinted while a filter is active, so it is obvious the list is
              // not showing everything.
              filter === 'All'
                ? 'border-gray-200 bg-white text-gray-700'
                : 'border-[#C9A0DC] bg-[#F0DFF6] text-[#5B2D8E]',
            )}
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s === 'All' ? 'All statuses' : s}
                {statusCounts[s] > 0 ? ` (${statusCounts[s]})` : ''}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        </div>

        <button
          type="button"
          onClick={() => setSubmitting(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" />
          New request
        </button>
      </div>

      <div className="overflow-x-auto no-scrollbar rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div
          role="row"
          className="grid min-w-[960px] grid-cols-[minmax(0,1.6fr)_120px_minmax(0,1fr)_90px_minmax(0,1.4fr)_120px_140px] items-center gap-3 border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500"
        >
          <span>Employee</span>
          <span>Type</span>
          <span>Dates</span>
          <span>Days</span>
          <span>Reason</span>
          <span>Status</span>
          <span className="text-right">Action</span>
        </div>
        {visible.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">No leave requests match.</div>
        ) : (
          visible.map((r) => {
            const emp = byId.get(r.employeeId)
            if (!emp) return null
            return (
              <div
                key={r.id}
                role="row"
                className="grid min-w-[960px] grid-cols-[minmax(0,1.6fr)_120px_minmax(0,1fr)_90px_minmax(0,1.4fr)_120px_140px] items-center gap-3 border-b border-gray-100 px-5 py-3 last:border-b-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={emp.name} color={emp.avatarColor} src={emp.avatarUrl} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">{emp.name}</p>
                    <p className="truncate text-xs text-gray-500">{emp.jobTitle}</p>
                  </div>
                </div>
                <div>
                  <StatusPill tone={TYPE_TONE[r.type]} label={r.type} />
                </div>
                <div className="text-xs text-gray-600">
                  <p className="font-semibold text-gray-900">{formatDate(r.startDate)}</p>
                  <p>to {formatDate(r.endDate)}</p>
                </div>
                <div className="text-sm font-semibold tabular-nums text-gray-900">{r.days}</div>
                <div className="text-xs text-gray-600">
                  <p className="line-clamp-2">{r.reason}</p>
                  <p className="mt-0.5 text-gray-400">submitted {formatDate(r.submittedAt)}</p>
                </div>
                <div>
                  <StatusPill tone={STATUS_TONE[r.status]} label={r.status} />
                </div>
                <div className="flex justify-end gap-1.5">
                  {r.status === 'Pending' ? (
                    <>
                      <button
                        type="button"
                        title="Approve"
                        disabled={pending && busyId === r.id}
                        onClick={() => decide(r.id, 'Approved')}
                        className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="Reject"
                        disabled={pending && busyId === r.id}
                        onClick={() => decide(r.id, 'Rejected')}
                        className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setViewing(r)}
                      className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      View
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {submitting && (
        <SubmitLeaveDialog
          employees={employees}
          onClose={() => setSubmitting(false)}
        />
      )}
      {viewing && (
        <LeaveRequestDialog
          request={viewing}
          employee={byId.get(viewing.employeeId)}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  )
}

function LeaveRequestDialog({
  request,
  employee,
  onClose,
}: {
  request: LeaveRequest
  employee: EmployeeLeaveView | undefined
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function cancel() {
    setError(null)
    startTransition(async () => {
      try {
        await cancelLeaveRequest(request.id)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not cancel the request.')
      }
    })
  }

  const canCancel = request.status === 'Approved' || request.status === 'Pending'

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900">Leave request</h2>
            <p className="mt-1 text-sm text-gray-500">
              Submitted {formatDate(request.submittedAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {employee && (
            <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
              <Avatar name={employee.name} color={employee.avatarColor} src={employee.avatarUrl} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{employee.name}</p>
                <p className="truncate text-xs text-gray-500">{employee.jobTitle} · {employee.department}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <DetailRow label="Type">
              <StatusPill tone={TYPE_TONE[request.type]} label={request.type} />
            </DetailRow>
            <DetailRow label="Status">
              <StatusPill tone={STATUS_TONE[request.status]} label={request.status} />
            </DetailRow>
            <DetailRow label="Start">{formatDate(request.startDate)}</DetailRow>
            <DetailRow label="End">{formatDate(request.endDate)}</DetailRow>
            <DetailRow label="Days">
              <span className="text-sm font-semibold tabular-nums text-gray-900">{request.days}</span>
            </DetailRow>
          </div>

          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-400">Reason</p>
            <p className="rounded-xl border border-gray-100 bg-gray-50/50 px-3 py-2.5 text-sm text-gray-800">
              {request.reason}
            </p>
          </div>
        </div>

        {error && <p className="mt-3 text-sm font-medium text-rose-700">{error}</p>}

        <div className="mt-5 flex items-center justify-between gap-2">
          {canCancel ? (
            <button
              type="button"
              onClick={cancel}
              disabled={pending}
              className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            >
              {pending ? 'Cancelling…' : 'Cancel request'}
            </button>
          ) : (
            <span className="text-xs text-gray-400">
              This request is in its final state.
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  )
}

function SubmitLeaveDialog({
  employees,
  onClose,
}: {
  employees: EmployeeLeaveView[]
  onClose: () => void
}) {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? '')
  const [type, setType] = useState<LeaveType>('Annual')
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function submit() {
    setError(null)
    startTransition(async () => {
      try {
        await submitLeaveRequest({
          employeeId,
          type,
          startDate,
          endDate,
          reason,
        })
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not submit the request.')
      }
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">New leave request</h2>
            <p className="mt-1 text-sm text-gray-500">
              The request is created in Pending state — approve it from the list when you&apos;re ready.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
              Employee
            </span>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {e.department}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Type
              </span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as LeaveType)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
              >
                {LEAVE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Start
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                End
              </span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
              Reason
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Short context — visible to reviewers."
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
            />
          </label>
        </div>

        {error && <p className="mt-3 text-sm font-medium text-rose-700">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !employeeId || !reason}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {pending ? 'Submitting…' : 'Submit request'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AttendanceTable({
  attendance,
  byId,
}: {
  attendance: AttendancePoint[]
  byId: Map<string, EmployeeLeaveView>
}) {
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function clockOut(a: AttendancePoint) {
    if (!a.clockIn) return
    setBusyId(a.id)
    setError(null)
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    // Hours worked = end - start (rough; tracks only one block per day).
    const [sh, sm] = a.clockIn.split(':').map(Number)
    const startMins = sh * 60 + sm
    const endMins = now.getHours() * 60 + now.getMinutes()
    const worked = Math.max(0, (endMins - startMins) / 60)
    startTransition(async () => {
      try {
        await upsertAttendance({
          employeeId: a.employeeId,
          date: a.date,
          clockIn: a.clockIn,
          clockOut: time,
          status: a.status,
          workedHours: Math.round(worked * 10) / 10,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not clock out.')
      } finally {
        setBusyId(null)
      }
    })
  }

  return (
    <div className="overflow-x-auto no-scrollbar rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <div className="border-b border-gray-100 px-5 py-4">
        <h3 className="text-sm font-semibold text-gray-900">Today · 12 May 2026</h3>
        <p className="text-xs text-gray-500">Real-time clock-in / clock-out — pulled from the office Wi-Fi gateway and the remote check-in app.</p>
      </div>
      <div
        role="row"
        className="grid min-w-[820px] grid-cols-[minmax(0,1.6fr)_120px_120px_120px_120px_minmax(0,140px)] items-center gap-3 border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500"
      >
        <span>Employee</span>
        <span>Status</span>
        <span>Clock in</span>
        <span>Clock out</span>
        <span className="text-right">Hours</span>
        <span className="text-right">Action</span>
      </div>
      {attendance.map((a) => {
        const emp = byId.get(a.employeeId)
        if (!emp) return null
        return (
          <div
            key={a.employeeId}
            role="row"
            className="grid min-w-[820px] grid-cols-[minmax(0,1.6fr)_120px_120px_120px_120px_minmax(0,140px)] items-center gap-3 border-b border-gray-100 px-5 py-3 last:border-b-0"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={emp.name} color={emp.avatarColor} src={emp.avatarUrl} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{emp.name}</p>
                <p className="truncate text-xs text-gray-500">{emp.department}</p>
              </div>
            </div>
            <div>
              <StatusPill tone={ATTENDANCE_TONE[a.status]} label={a.status} />
            </div>
            <div className="text-sm tabular-nums text-gray-900">{a.clockIn ?? '—'}</div>
            <div className="text-sm tabular-nums text-gray-900">{a.clockOut ?? '—'}</div>
            <div className="text-right text-sm font-semibold tabular-nums text-gray-900">{a.workedHours.toFixed(1)}h</div>
            <div className="flex justify-end gap-1.5">
              {a.clockIn && !a.clockOut && (
                <button
                  type="button"
                  onClick={() => clockOut(a)}
                  disabled={pending && busyId === a.id}
                  className="rounded-md p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50"
                  title="Manual clock-out"
                  aria-label={`Clock out ${emp.name}`}
                >
                  <LogOut className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )
      })}
      {error && (
        <p className="border-t border-gray-100 px-5 py-2 text-sm font-medium text-rose-700">{error}</p>
      )}
    </div>
  )
}

function BalancesTable({
  employees,
  requests,
}: {
  employees: EmployeeLeaveView[]
  requests: LeaveRequest[]
}) {
  // Days actually taken, MEASURED from approved requests rather than inferred.
  //
  // The previous version hardcoded a 28-day entitlement and computed
  // "used = 28 - balance". That was wrong in both directions. Someone whose
  // balance was never allocated read as "0 / 28, 100% used" in alarming red
  // despite never taking a day, and someone with months of approved Sick or
  // Compassionate leave read as "0% used", because only Annual draws down the
  // balance. The column reported the opposite of the truth in both cases.
  //
  // There is no entitlement column in the schema, so the honest figures are:
  // the balance (a fact), and days approved (measurable). Annual entitlement
  // is derived as balance + annual days already deducted, which follows from
  // the deduction rule rather than from a guessed constant.
  const taken = useMemo(() => {
    const map = new Map<string, { annual: number; other: number }>()
    for (const r of requests) {
      if (r.status !== 'Approved') continue
      const entry = map.get(r.employeeId) ?? { annual: 0, other: 0 }
      if (r.type === 'Annual') entry.annual += r.days
      else entry.other += r.days
      map.set(r.employeeId, entry)
    }
    return map
  }, [requests])

  return (
    <div className="overflow-x-auto no-scrollbar rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <div
        role="row"
        className="grid min-w-[720px] grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_150px_minmax(0,190px)] items-center gap-3 border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500"
      >
        <span>Employee</span>
        <span>Department</span>
        <span>Annual left</span>
        <span>Approved leave taken</span>
      </div>
      {employees.map((e) => {
        const t = taken.get(e.id) ?? { annual: 0, other: 0 }
        // Entitlement follows from the deduction rule: whatever is left plus
        // whatever Annual has already been deducted. Zero only when the
        // employee has no balance AND has taken no annual leave, which means
        // no entitlement is recorded — not that it is all used up.
        const entitlement = e.leaveBalanceDays + t.annual
        const pct = entitlement > 0 ? Math.round((t.annual / entitlement) * 100) : null
        const totalTaken = t.annual + t.other
        return (
          <div
            key={e.id}
            role="row"
            className="grid min-w-[720px] grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_150px_minmax(0,190px)] items-center gap-3 border-b border-gray-100 px-5 py-3 last:border-b-0"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={e.name} color={e.avatarColor} src={e.avatarUrl} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{e.name}</p>
                <p className="truncate text-xs text-gray-500">{e.jobTitle}</p>
              </div>
            </div>
            <div className="text-sm text-gray-600">{e.department}</div>
            <div className="text-sm tabular-nums text-gray-900">
              {entitlement > 0 ? (
                <>
                  <span className="font-semibold">{e.leaveBalanceDays}</span>
                  <span className="text-gray-400"> / {entitlement} days</span>
                </>
              ) : (
                <span className="text-gray-400">Not set</span>
              )}
            </div>
            <div>
              {totalTaken === 0 ? (
                <p className="text-sm text-gray-400">None</p>
              ) : (
                <>
                  <p className="text-sm tabular-nums text-gray-900">
                    <span className="font-semibold">{totalTaken}</span>
                    <span className="text-gray-400"> {totalTaken === 1 ? 'day' : 'days'}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    {t.annual > 0 && `${t.annual} annual`}
                    {t.annual > 0 && t.other > 0 && ' · '}
                    {t.other > 0 && `${t.other} other`}
                    {pct !== null && t.annual > 0 && ` · ${pct}% of entitlement`}
                  </p>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
