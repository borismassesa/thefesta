'use client'

import { useState, useTransition } from 'react'
import { CalendarClock, Plus, Trash2, Users, User } from 'lucide-react'
import {
  TASK_CADENCES,
  TASK_CATEGORIES,
  type Department,
  type TaskAssignment,
  type TaskCadence,
  type TaskCategory,
  type TaskTargetType,
} from '../_lib/types'
import type {
  CreateAssignmentInput,
  CreateAssignmentResult,
  MutateResult,
} from './actions'

type EmployeeOption = { id: string; name: string; department: string }

type Actions = {
  create: (input: CreateAssignmentInput) => Promise<CreateAssignmentResult>
  setActive: (id: string, isActive: boolean) => Promise<MutateResult>
  remove: (id: string) => Promise<MutateResult>
}

const CADENCE_LABEL: Record<TaskCadence, string> = {
  once: 'One-off',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
}

const CADENCE_TONE: Record<TaskCadence, string> = {
  once: 'bg-gray-100 text-gray-700',
  daily: 'bg-emerald-50 text-emerald-700',
  weekly: 'bg-sky-50 text-sky-700',
  monthly: 'bg-purple-50 text-purple-700',
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function TasksClient({
  assignments,
  employees,
  departments,
  canAssign,
  today,
  actions,
}: {
  assignments: TaskAssignment[]
  employees: EmployeeOption[]
  departments: Department[]
  canAssign: boolean
  today: string
  actions: Actions
}) {
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="space-y-6">
      {canAssign && (
        <div>
          {showForm ? (
            <AssignmentForm
              employees={employees}
              departments={departments}
              today={today}
              create={actions.create}
              onClose={() => setShowForm(false)}
            />
          ) : (
            <button data-opus-button="primary" data-opus-button-size="medium"
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
            >
              <Plus className="h-4 w-4" /> New assignment
            </button>
          )}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
          Assignments <span className="ml-2 font-normal text-gray-400">{assignments.length}</span>
        </h2>
        {assignments.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            <p className="text-sm font-semibold text-gray-900">No tasks assigned yet</p>
            <p className="mt-1 text-xs text-gray-500">
              {canAssign ? 'Create one above to get started.' : 'Nothing has been assigned yet.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {assignments.map((a) => (
              <AssignmentCard key={a.id} assignment={a} canAssign={canAssign} actions={actions} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function AssignmentForm({
  employees,
  departments,
  today,
  create,
  onClose,
}: {
  employees: EmployeeOption[]
  departments: Department[]
  today: string
  create: Actions['create']
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<TaskCategory>('General')
  const [targetType, setTargetType] = useState<TaskTargetType>('employee')
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? '')
  const [department, setDepartment] = useState<Department | ''>(departments[0] ?? '')
  const [cadence, setCadence] = useState<TaskCadence>('once')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function submit() {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await create({
        title,
        description: description.trim() || null,
        category,
        targetType,
        targetEmployeeId: targetType === 'employee' ? employeeId : null,
        targetDepartment: targetType === 'department' ? (department || null) : null,
        cadence,
        startDate,
        endDate: endDate || null,
      })
      if (result.ok) {
        // On a clean create, close. If generation didn't complete, keep the
        // modal open and show the warning so it isn't silently swallowed —
        // the row already appears in the list underneath via revalidation.
        if (result.warning) setNotice(result.warning)
        else onClose()
      } else {
        setError(result.error)
      }
    })
  }

  const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-gray-500'
  const inputCls =
    'mt-1.5 w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none'

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] sm:p-6">
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Task</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Submit end-of-day report"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Details <span className="font-normal normal-case text-gray-400">(optional)</span></label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What needs doing…"
            className={`${inputCls} resize-y`}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Assign to</label>
            <div className="mt-1.5 flex gap-2">
              <TargetToggle active={targetType === 'employee'} onClick={() => setTargetType('employee')} icon={<User className="h-3.5 w-3.5" />} label="Employee" />
              <TargetToggle active={targetType === 'department'} onClick={() => setTargetType('department')} icon={<Users className="h-3.5 w-3.5" />} label="Department" />
            </div>
          </div>
          <div>
            {targetType === 'employee' ? (
              <>
                <label className={labelCls}>Employee</label>
                <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputCls}>
                  {employees.length === 0 && <option value="">No employees available</option>}
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} · {e.department}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <label className={labelCls}>Department</label>
                <select value={department} onChange={(e) => setDepartment(e.target.value as Department)} className={inputCls}>
                  {departments.length === 0 && <option value="">No departments available</option>}
                  {departments.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={labelCls}>Frequency</label>
            <select value={cadence} onChange={(e) => setCadence(e.target.value as TaskCadence)} className={inputCls}>
              {TASK_CADENCES.map((c) => (
                <option key={c} value={c}>{CADENCE_LABEL[c]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as TaskCategory)} className={inputCls}>
              {TASK_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{cadence === 'once' ? 'Date' : 'Starts'}</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
          </div>
          {cadence !== 'once' && (
            <div>
              <label className={labelCls}>Ends <span className="font-normal normal-case text-gray-400">(optional)</span></label>
              <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
            </div>
          )}
        </div>

        {error && <p role="alert" className="text-xs font-medium text-rose-600">{error}</p>}
        {notice && <p role="status" className="text-xs font-medium text-amber-600">{notice}</p>}

        <div className="flex items-center gap-3">
          <button data-opus-button="primary" data-opus-button-size="medium"
            type="button"
            disabled={pending || title.trim().length === 0 || notice !== null}
            onClick={submit}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            Assign task
          </button>
          <button data-opus-button="control"
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            {notice ? 'Done' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TargetToggle({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button data-opus-button="neutral" data-opus-button-size="small"
      type="button"
      onClick={onClick}
      className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold ${
        active
          ? 'border-gray-900 bg-gray-900 text-white'
          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
      }`}
    >
      {icon} {label}
    </button>
  )
}

function AssignmentCard({
  assignment,
  canAssign,
  actions,
}: {
  assignment: TaskAssignment
  canAssign: boolean
  actions: Actions
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const a = assignment
  const pct = a.totalTasks > 0 ? Math.round((a.doneTasks / a.totalTasks) * 100) : 0

  function run(fn: () => Promise<MutateResult>) {
    setError(null)
    startTransition(async () => {
      const r = await fn()
      if (!r.ok) setError(r.error)
    })
  }

  return (
    <article className={`rounded-2xl border bg-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] ${a.isActive ? 'border-gray-100' : 'border-gray-100 opacity-70'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{a.title}</h3>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${CADENCE_TONE[a.cadence]}`}>
              {CADENCE_LABEL[a.cadence]}
            </span>
            {!a.isActive && (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Paused
              </span>
            )}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
            {a.targetType === 'department' ? <Users className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
            {a.targetType === 'department' ? a.targetDepartment : a.targetEmployeeName ?? 'Unknown'}
            <span className="text-gray-300">·</span>
            {a.category}
          </p>
        </div>
      </div>

      {a.description && <p className="mt-2 text-xs text-gray-600">{a.description}</p>}

      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-gray-500">
        <CalendarClock className="h-3.5 w-3.5" />
        {a.cadence === 'once' ? formatDate(a.startDate) : `From ${formatDate(a.startDate)}`}
        {a.endDate && ` → ${formatDate(a.endDate)}`}
      </p>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] font-medium text-gray-500">
          <span>{a.doneTasks}/{a.totalTasks} done</span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {error && <p role="alert" className="mt-2 text-xs text-rose-600">{error}</p>}

      {canAssign && (
        <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
          <button data-opus-button="control"
            type="button"
            disabled={pending}
            onClick={() => run(() => actions.setActive(a.id, !a.isActive))}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {a.isActive ? 'Pause' : 'Resume'}
          </button>
          <button data-opus-button="danger" data-opus-button-size="small"
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm('Delete this assignment and all its generated tasks?')) {
                run(() => actions.remove(a.id))
              }
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        </div>
      )}
    </article>
  )
}
