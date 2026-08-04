'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Pencil,
  Plus,
  Trash2,
  X,
  AlertTriangle,
  CircleDot,
} from 'lucide-react'
import Avatar from '../_components/Avatar'
import { summarizePunchesByDay } from '../_lib/time-summary'
import type {
  CurrentlyClockedEmployee,
  EmployeeStatus,
  Department,
  TimePunch,
} from '../_lib/types'
import {
  adminInsertPunch,
  adminUpdatePunch,
  adminDeletePunch,
  exportTimesheetCsv,
} from './actions'
import { isCurrentEmployee } from '../_lib/types'

type EmployeeRow = {
  id: string
  employeeCode: string
  name: string
  department: Department
  avatarUrl: string | null
  avatarColor: string
  status: EmployeeStatus
}

type Props = {
  employees: EmployeeRow[]
  punches: TimePunch[]
  currentlyClocked: CurrentlyClockedEmployee[]
  weekStartIso: string
  timeZone: string
  // False for roles with workforce.read but not workforce.write (Finance,
  // Viewer). The grid still shows everyone's hours, but cells become
  // non-clickable, the day editor is suppressed, and the CSV export
  // stays available (it's a read action).
  canEdit: boolean
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function dayKey(weekStartIso: string, idx: number, tz: string): string {
  const d = new Date(new Date(weekStartIso).getTime() + idx * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

function shiftWeek(weekStartIso: string, byDays: number): string {
  const d = new Date(new Date(weekStartIso).getTime() + byDays * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Dar_es_Salaam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

function formatHm(minutes: number): string {
  if (minutes <= 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function formatTime(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function durationSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return '<1m'
  const totalMin = Math.floor(ms / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function TimesheetsClient({
  employees,
  punches,
  currentlyClocked,
  weekStartIso,
  timeZone,
  canEdit,
}: Props) {
  const router = useRouter()
  const [editor, setEditor] = useState<{
    employee: EmployeeRow
    day: string
  } | null>(null)
  const [exporting, startExport] = useTransition()
  const [exportError, setExportError] = useState<string | null>(null)

  // Index punches by employee for fast per-row summarization.
  const punchesByEmp = useMemo(() => {
    const map = new Map<string, TimePunch[]>()
    for (const p of punches) {
      const arr = map.get(p.employeeId)
      if (arr) arr.push(p)
      else map.set(p.employeeId, [p])
    }
    return map
  }, [punches])

  const dayKeys = useMemo(
    () => Array.from({ length: 7 }, (_, i) => dayKey(weekStartIso, i, timeZone)),
    [weekStartIso, timeZone],
  )

  const summariesByEmp = useMemo(() => {
    const out = new Map<string, Map<string, number>>()
    for (const e of employees) {
      const days = summarizePunchesByDay(punchesByEmp.get(e.id) ?? [], timeZone)
      out.set(e.id, new Map(days.map((d) => [d.date, d.workedMinutes])))
    }
    return out
  }, [employees, punchesByEmp, timeZone])

  const weekStartDate = new Date(weekStartIso)
  const weekEndDate = new Date(weekStartDate.getTime() + 6 * 86_400_000)
  const weekLabel = `${weekStartDate.toLocaleDateString('en-GB', {
    timeZone,
    day: '2-digit',
    month: 'short',
  })} — ${weekEndDate.toLocaleDateString('en-GB', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })}`

  async function handleExport() {
    setExportError(null)
    startExport(async () => {
      try {
        const weekEndIso = new Date(weekStartDate.getTime() + 7 * 86_400_000).toISOString()
        const { csv, filename } = await exportTimesheetCsv(weekStartIso, weekEndIso)
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      } catch (e) {
        setExportError(e instanceof Error ? e.message : 'Export failed.')
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Currently clocked panel */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <header className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Currently clocked in</h2>
            <p className="text-xs text-gray-500">
              {currentlyClocked.length === 0
                ? 'No one is on the clock right now.'
                : `${currentlyClocked.length} ${currentlyClocked.length === 1 ? 'person' : 'people'} on the clock.`}
            </p>
          </div>
          <CircleDot className="h-5 w-5 text-[#9FE870]" />
        </header>
        {currentlyClocked.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {currentlyClocked.map((c) => (
              <li
                key={c.employeeId}
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 py-1 pl-1 pr-3 text-xs"
              >
                <Avatar
                  name={c.employeeName}
                  color={c.avatarColor}
                  src={c.avatarUrl}
                  size="sm"
                />
                <span className="font-medium text-gray-900">{c.employeeName}</span>
                <span className="text-gray-500 tabular-nums">{durationSince(c.sinceIso)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Week nav + export */}
      <section className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-1">
          <Link
            href={`/workforce/timesheets?week=${shiftWeek(weekStartIso, -7)}`}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div className="px-2 text-sm font-semibold text-gray-900">{weekLabel}</div>
          <Link
            href={`/workforce/timesheets?week=${shiftWeek(weekStartIso, 7)}`}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
          <Link
            href="/workforce/timesheets"
            className="ml-2 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
          >
            This week
          </Link>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          <Download className="h-3.5 w-3.5" />
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </section>
      {exportError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {exportError}
        </div>
      )}

      {/* Grid */}
      <section className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left font-semibold">
                Employee
              </th>
              {WEEKDAYS.map((label, i) => (
                <th key={label} className="px-3 py-3 text-center font-semibold">
                  <div>{label}</div>
                  <div className="text-[10px] font-medium text-gray-400">
                    {new Date(weekStartDate.getTime() + i * 86_400_000).toLocaleDateString('en-GB', {
                      timeZone,
                      day: '2-digit',
                      month: '2-digit',
                    })}
                  </div>
                </th>
              ))}
              <th className="px-4 py-3 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {employees
              .filter((e) => isCurrentEmployee(e.status))
              .map((e) => {
                const summary = summariesByEmp.get(e.id) ?? new Map<string, number>()
                const total = dayKeys.reduce((sum, k) => sum + (summary.get(k) ?? 0), 0)
                return (
                  <tr key={e.id} className="hover:bg-gray-50/50">
                    <td className="sticky left-0 z-10 bg-white px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar
                          name={e.name}
                          color={e.avatarColor}
                          src={e.avatarUrl}
                          size="sm"
                        />
                        <div>
                          <div className="font-medium text-gray-900">{e.name}</div>
                          <div className="text-[11px] text-gray-500">{e.employeeCode}</div>
                        </div>
                      </div>
                    </td>
                    {dayKeys.map((k) => {
                      const mins = summary.get(k) ?? 0
                      const hasPunches = (punchesByEmp.get(e.id) ?? []).some((p) => {
                        return new Intl.DateTimeFormat('en-CA', {
                          timeZone,
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                        }).format(new Date(p.punchAt)) === k
                      })
                      return (
                        <td key={k} className="px-3 py-2.5 text-center">
                          {canEdit ? (
                            <button
                              type="button"
                              onClick={() => setEditor({ employee: e, day: k })}
                              className={
                                mins > 0
                                  ? 'w-full rounded-md bg-[#F0DFF6]/40 px-2 py-1 font-medium text-gray-900 tabular-nums hover:bg-[#F0DFF6]'
                                  : hasPunches
                                    ? 'w-full rounded-md px-2 py-1 text-xs text-amber-700 hover:bg-amber-50'
                                    : 'w-full rounded-md px-2 py-1 text-xs text-gray-300 hover:bg-gray-100 hover:text-gray-600'
                              }
                            >
                              {mins > 0 ? formatHm(mins) : hasPunches ? 'open' : '—'}
                            </button>
                          ) : (
                            <span
                              className={
                                mins > 0
                                  ? 'block w-full px-2 py-1 font-medium text-gray-900 tabular-nums'
                                  : hasPunches
                                    ? 'block w-full px-2 py-1 text-xs text-amber-700'
                                    : 'block w-full px-2 py-1 text-xs text-gray-300'
                              }
                            >
                              {mins > 0 ? formatHm(mins) : hasPunches ? 'open' : '—'}
                            </span>
                          )}
                        </td>
                      )
                    })}
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900 tabular-nums">
                      {formatHm(total)}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </section>

      {editor && canEdit && (
        <DayPunchEditor
          employee={editor.employee}
          day={editor.day}
          punches={(punchesByEmp.get(editor.employee.id) ?? []).filter((p) => {
            return new Intl.DateTimeFormat('en-CA', {
              timeZone,
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            }).format(new Date(p.punchAt)) === editor.day
          })}
          timeZone={timeZone}
          onClose={() => setEditor(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  )
}

// =============================================================================
// Day editor — add / edit / delete punches for one (employee, day)
// =============================================================================

function DayPunchEditor({
  employee,
  day,
  punches,
  timeZone,
  onClose,
  onChanged,
}: {
  employee: EmployeeRow
  day: string
  punches: TimePunch[]
  timeZone: string
  onClose: () => void
  onChanged: () => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  function isoForDayTime(hhmm: string, type: 'in' | 'out'): string {
    void type
    // Build "<day>T<hhmm>:00+03:00" — EAT has no DST so a fixed offset is safe.
    return new Date(`${day}T${hhmm}:00+03:00`).toISOString()
  }

  async function handleAdd(form: HTMLFormElement) {
    const data = new FormData(form)
    const hhmm = String(data.get('time') ?? '')
    const type = String(data.get('type') ?? 'in') as 'in' | 'out'
    const note = (String(data.get('note') ?? '') || null) as string | null
    if (!/^\d{2}:\d{2}$/.test(hhmm)) {
      setError('Pick a time in HH:MM format.')
      return
    }
    setError(null)
    setBusyId('new')
    try {
      await adminInsertPunch({
        employeeId: employee.id,
        punchAtIso: isoForDayTime(hhmm, type),
        type,
        note,
      })
      setAdding(false)
      form.reset()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Insert failed.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleSave(p: TimePunch, hhmm: string, type: 'in' | 'out', note: string) {
    if (!/^\d{2}:\d{2}$/.test(hhmm)) {
      setError('Pick a time in HH:MM format.')
      return
    }
    setError(null)
    setBusyId(p.id)
    try {
      await adminUpdatePunch({
        id: p.id,
        punchAtIso: isoForDayTime(hhmm, type),
        type,
        note: note || null,
      })
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(p: TimePunch) {
    if (!confirm('Delete this punch? This cannot be undone.')) return
    setError(null)
    setBusyId(p.id)
    try {
      await adminDeletePunch(p.id)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{employee.name}</h3>
            <p className="text-xs text-gray-500">
              {new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', {
                timeZone,
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {error && (
          <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>{error}</div>
          </div>
        )}

        <div className="space-y-3 p-5">
          {punches.length === 0 && !adding && (
            <p className="text-sm text-gray-500">No punches for this day yet.</p>
          )}
          {punches.map((p) => (
            <PunchRow
              key={p.id}
              punch={p}
              timeZone={timeZone}
              busy={busyId === p.id}
              onSave={(hhmm, type, note) => handleSave(p, hhmm, type, note)}
              onDelete={() => handleDelete(p)}
            />
          ))}

          {adding ? (
            <form
              className="rounded-xl border border-gray-200 p-3"
              onSubmit={(e) => {
                e.preventDefault()
                handleAdd(e.currentTarget)
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <select
                  name="type"
                  className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                  defaultValue="in"
                >
                  <option value="in">Clock in</option>
                  <option value="out">Clock out</option>
                </select>
                <input
                  name="time"
                  type="time"
                  required
                  className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm tabular-nums"
                />
                <input
                  name="note"
                  type="text"
                  placeholder="Note (optional)"
                  maxLength={200}
                  className="flex-1 min-w-[140px] rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
                />
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyId === 'new'}
                  className="rounded-lg bg-[#7E5896] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#6c4a83] disabled:opacity-60"
                >
                  {busyId === 'new' ? 'Adding…' : 'Add punch'}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:border-gray-400 hover:text-gray-900"
            >
              <Plus className="h-3.5 w-3.5" />
              Add punch
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function PunchRow({
  punch,
  timeZone,
  busy,
  onSave,
  onDelete,
}: {
  punch: TimePunch
  timeZone: string
  busy: boolean
  onSave: (hhmm: string, type: 'in' | 'out', note: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [hhmm, setHhmm] = useState(formatTime(punch.punchAt, timeZone))
  const [type, setType] = useState<'in' | 'out'>(punch.type)
  const [note, setNote] = useState(punch.note ?? '')

  if (!editing) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2 text-sm">
        <div className="flex items-center gap-3">
          <span
            className={
              punch.type === 'in'
                ? 'inline-flex items-center rounded-full bg-[#9FE870]/30 px-2 py-0.5 text-xs font-semibold text-gray-900'
                : 'inline-flex items-center rounded-full bg-[#F0DFF6] px-2 py-0.5 text-xs font-semibold text-[#7E5896]'
            }
          >
            {punch.type === 'in' ? 'Clock in' : 'Clock out'}
          </span>
          <span className="font-mono text-sm tabular-nums text-gray-900">
            {formatTime(punch.punchAt, timeZone)}
          </span>
          {punch.source !== 'web' && (
            <span className="text-[11px] uppercase tracking-wide text-gray-400">
              {punch.source.replace('_', ' ')}
            </span>
          )}
          {punch.note && (
            <span className="truncate text-xs text-gray-500" title={punch.note}>
              “{punch.note}”
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            aria-label="Edit punch"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
            aria-label="Delete punch"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[#7E5896]/40 bg-[#F0DFF6]/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as 'in' | 'out')}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
        >
          <option value="in">Clock in</option>
          <option value="out">Clock out</option>
        </select>
        <input
          type="time"
          value={hhmm}
          onChange={(e) => setHhmm(e.target.value)}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm tabular-nums"
        />
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          maxLength={200}
          className="flex-1 min-w-[140px] rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
        />
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            onSave(hhmm, type, note)
            setEditing(false)
          }}
          disabled={busy}
          className="rounded-lg bg-[#7E5896] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#6c4a83] disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
