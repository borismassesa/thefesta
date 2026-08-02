'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock4,
  Plus,
  Users,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Avatar from '../_components/Avatar'
import Kpi, { KpiRow } from '../_components/Kpi'
import type { Department, Employee, Shift, ShiftType } from '../_lib/data'
import { clearShift, upsertShift } from './actions'
import { isCurrentEmployee } from '../_lib/types'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const SHIFT_TYPES: ShiftType[] = ['Full day', 'Half day', 'On-call', 'Remote', 'Off']

// Soft-background palette only — dropped the dot indicator we used to render
// in each pill and legend chip. The background tone already carries the
// status; the dot was visual noise.
const SHIFT_STYLES: Record<ShiftType, { bg: string; ring: string; text: string }> = {
  'Full day': { bg: 'bg-[#F0DFF6]', ring: 'ring-[#E0BEEC]', text: 'text-[#5B2D8E]' },
  'Half day': { bg: 'bg-[#FFF3D9]', ring: 'ring-amber-200', text: 'text-amber-800' },
  Remote: { bg: 'bg-[#E5F2FB]', ring: 'ring-sky-200', text: 'text-sky-800' },
  'On-call': { bg: 'bg-[#FCE8F0]', ring: 'ring-rose-200', text: 'text-rose-800' },
  Off: { bg: 'bg-gray-50', ring: 'ring-gray-100', text: 'text-gray-400' },
}

function weekStart(date: Date): Date {
  const d = new Date(date)
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function formatRange(start: Date): string {
  const end = addDays(start, 6)
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' }
  if (start.getMonth() === end.getMonth()) {
    return `${start.toLocaleDateString('en-GB', { day: '2-digit' })}–${end.toLocaleDateString('en-GB', opts)} ${end.getFullYear()}`
  }
  return `${start.toLocaleDateString('en-GB', opts)} – ${end.toLocaleDateString('en-GB', opts)} ${end.getFullYear()}`
}

type SlotTarget = { employee: Employee; weekday: number; existing?: Shift }

export default function ScheduleClient({
  employees,
  shifts,
  departments,
}: {
  employees: Employee[]
  shifts: Shift[]
  departments: Department[]
}) {
  const [department, setDepartment] = useState<Department | 'All'>('All')
  const [offset, setOffset] = useState(0)
  const today = new Date()
  const start = useMemo(() => addDays(weekStart(today), offset * 7), [today, offset])
  const [target, setTarget] = useState<SlotTarget | null>(null)

  const rosterEmployees = useMemo(() => {
    return employees
      .filter((e) => isCurrentEmployee(e.status))
      .filter((e) => department === 'All' || e.department === department)
  }, [employees, department])

  const byEmployee = useMemo(() => {
    const map = new Map<string, Map<number, Shift>>()
    for (const s of shifts) {
      if (!map.has(s.employeeId)) map.set(s.employeeId, new Map())
      map.get(s.employeeId)!.set(s.weekday, s)
    }
    return map
  }, [shifts])

  const totalShifts = shifts.filter((s) => s.type !== 'Off').length
  const remoteShifts = shifts.filter((s) => s.type === 'Remote').length
  const coveragePct = Math.round((totalShifts / (rosterEmployees.length * 7 || 1)) * 100)

  return (
    <div className="space-y-6">
      <KpiRow>
        <Kpi label="People on roster" value={String(rosterEmployees.length)} hint="this week" icon={<Users className="h-4 w-4" />} />
        <Kpi label="Scheduled shifts" value={String(totalShifts)} hint="active across the week" icon={<CalendarDays className="h-4 w-4" />} />
        <Kpi label="Remote days" value={String(remoteShifts)} hint="across the team" icon={<Clock4 className="h-4 w-4" />} />
        <Kpi label="Coverage" value={`${coveragePct}%`} delta={coveragePct >= 70 ? 'Healthy' : 'Watch'} deltaTone={coveragePct >= 70 ? 'positive' : 'neutral'} hint="of weekday slots filled" />
      </KpiRow>

      {/* Single-row toolbar: unified week navigator + chip-style filter +
          colored legend chips. The previous design split the date range out
          of the navigator and used a shouty uppercase "Department" label;
          this version makes the date the primary text inside the navigator
          and matches the Employees-page FilterPill chip vocabulary. */}
      <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white">
            <button
              type="button"
              onClick={() => setOffset((o) => o - 1)}
              className="border-r border-gray-200 p-2 text-gray-500 hover:text-gray-900"
              aria-label="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-4 py-1.5 text-sm font-semibold text-gray-900 tabular-nums">
              {formatRange(start)}
            </span>
            <button
              type="button"
              onClick={() => setOffset((o) => o + 1)}
              className="border-l border-gray-200 p-2 text-gray-500 hover:text-gray-900"
              aria-label="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {offset !== 0 && (
            <button
              type="button"
              onClick={() => setOffset(0)}
              className="rounded-full px-2.5 py-1 text-xs font-semibold text-[#5B2D8E] hover:bg-[#F0DFF6]"
            >
              Jump to this week
            </button>
          )}

          <FilterPill
            label="Department"
            value={department}
            onChange={(v) => setDepartment(v as Department | 'All')}
            options={['All', ...departments]}
          />

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {SHIFT_TYPES.map((t) => (
              <span
                key={t}
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                  SHIFT_STYLES[t].bg,
                  SHIFT_STYLES[t].text,
                )}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto no-scrollbar rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div className="grid min-w-[1080px] grid-cols-[minmax(0,260px)_repeat(7,minmax(0,1fr))] gap-px bg-gray-100">
          <div className="bg-gray-50/60 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">Employee</div>
          {DAY_LABELS.map((d, i) => (
            <div
              key={d}
              className="flex items-baseline justify-between bg-gray-50/60 px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500"
            >
              <span>{d}</span>
              <span className="text-[10px] font-medium text-gray-400">
                {addDays(start, i).toLocaleDateString('en-GB', { day: '2-digit' })}
              </span>
            </div>
          ))}

          {rosterEmployees.length === 0 ? (
            <div className="col-span-8 bg-white px-6 py-14 text-center">
              <p className="text-sm font-semibold text-gray-900">No-one rostered in this department</p>
              <p className="mt-1 text-sm text-gray-500">Try a different filter, or hire someone.</p>
            </div>
          ) : (
            rosterEmployees.map((e) => {
              const days = byEmployee.get(e.id)
              return (
                <RosterRow
                  key={e.id}
                  employee={e}
                  days={days}
                  onSelect={(weekday, existing) =>
                    setTarget({ employee: e, weekday, existing })
                  }
                />
              )
            })
          )}
        </div>
      </div>

      {target && (
        <ShiftEditor
          target={target}
          onClose={() => setTarget(null)}
        />
      )}
    </div>
  )
}

function RosterRow({
  employee,
  days,
  onSelect,
}: {
  employee: Employee
  days: Map<number, Shift> | undefined
  onSelect: (weekday: number, existing?: Shift) => void
}) {
  return (
    <>
      <div className="flex items-center gap-3 bg-white px-4 py-3">
        <Avatar name={employee.name} color={employee.avatarColor} src={employee.avatarUrl} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{employee.name}</p>
          <p className="truncate text-xs text-gray-500">{employee.jobTitle}</p>
        </div>
      </div>
      {[1, 2, 3, 4, 5, 6, 7].map((wd) => {
        const shift = days?.get(wd)
        if (!shift) {
          return (
            <button
              key={wd}
              type="button"
              onClick={() => onSelect(wd, undefined)}
              className="group flex items-center justify-center bg-white px-2 py-3 text-gray-300 transition-colors hover:bg-gray-50 hover:text-[#7E5896]"
              aria-label={`Add shift for day ${wd}`}
            >
              <Plus className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )
        }
        const style = SHIFT_STYLES[shift.type]
        return (
          <button
            key={wd}
            type="button"
            onClick={() => onSelect(wd, shift)}
            className="bg-white px-2 py-2 text-left transition-opacity hover:opacity-90"
          >
            <div className={cn('rounded-xl ring-1 px-2.5 py-2', style.bg, style.ring)}>
              <div className="flex items-center justify-between">
                <span className={cn('text-[10px] font-bold uppercase tracking-wider', style.text)}>
                  {shift.type}
                </span>
              </div>
              {shift.start && (
                <p className={cn('mt-1 text-xs font-semibold tabular-nums', style.text)}>
                  {shift.start}–{shift.end}
                </p>
              )}
              {shift.note && (
                <p className="mt-1 truncate text-[11px] text-gray-500">{shift.note}</p>
              )}
            </div>
          </button>
        )
      })}
    </>
  )
}

function ShiftEditor({
  target,
  onClose,
}: {
  target: SlotTarget
  onClose: () => void
}) {
  const [type, setType] = useState<ShiftType>(target.existing?.type ?? 'Full day')
  const [start, setStart] = useState(target.existing?.start ?? '09:00')
  const [end, setEnd] = useState(target.existing?.end ?? '17:00')
  const [note, setNote] = useState(target.existing?.note ?? '')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const requiresTimes = type !== 'Off' && type !== 'On-call'

  function submit() {
    setError(null)
    startTransition(async () => {
      try {
        await upsertShift({
          employeeId: target.employee.id,
          weekday: target.weekday,
          type,
          start: requiresTimes ? start : undefined,
          end: requiresTimes ? end : undefined,
          note: note || undefined,
        })
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save shift.')
      }
    })
  }

  function remove() {
    setError(null)
    startTransition(async () => {
      try {
        await clearShift(target.employee.id, target.weekday)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not clear shift.')
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
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {target.existing ? 'Edit shift' : 'Add shift'}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {target.employee.name} · {DAY_LABELS[target.weekday - 1]}
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
              Shift type
            </span>
            <div className="grid grid-cols-5 gap-1.5">
              {SHIFT_TYPES.map((t) => {
                const active = type === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={cn(
                      'rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors',
                      active
                        ? `${SHIFT_STYLES[t].bg} ring-1 ${SHIFT_STYLES[t].ring} ${SHIFT_STYLES[t].text}`
                        : 'border border-gray-200 text-gray-500 hover:bg-gray-50',
                    )}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
          </label>

          {requiresTimes && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Start
                </span>
                <input
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  End
                </span>
                <input
                  type="time"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
                />
              </label>
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
              Note (optional)
            </span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Vendor escalations rota"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
            />
          </label>
        </div>

        {error && <p className="mt-3 text-sm font-medium text-rose-700">{error}</p>}

        <div className="mt-5 flex items-center justify-between gap-2">
          {target.existing ? (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            >
              Clear shift
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
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
              disabled={pending}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FilterPill({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: readonly string[]
}) {
  const active = value !== 'All'
  return (
    <label
      className={cn(
        'relative inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
        active
          ? 'border-[#E0BEEC] bg-[#F0DFF6] text-[#5B2D8E]'
          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
      )}
    >
      <span className="text-gray-400">{label}:</span>
      <span className={active ? 'text-[#5B2D8E]' : 'text-gray-900'}>{value}</span>
      <ChevronDown className="h-3 w-3 text-gray-400" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  )
}
