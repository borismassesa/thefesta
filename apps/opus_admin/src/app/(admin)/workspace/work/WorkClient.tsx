'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  CheckSquare,
  FolderKanban,
  GitBranch,
  ListTodo,
  Plus,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  canEditTask,
  checkStatusChange,
  formatEffort,
  isClosed,
  sortTasks,
  type TaskPriority,
  type TaskStatus,
} from '@/lib/work/tasks'
import { SOURCE_LABELS, addDays, buildDays, localTime, type CalendarEntry } from '@/lib/work/calendar'
import { messageForToken } from '@/lib/work/errors'
import type {
  MeetingRow,
  MilestoneRow,
  ProjectRow,
  TaskDependencyRow,
  TaskRow,
} from '@/lib/work/queries'
import type { ActionResult, CreateTaskInput } from './actions'

// My Work.
//
// Every list on this page is already scoped: the server only sent tasks and
// projects this employee may see. Nothing here filters for permission, because
// nothing here received anything it should not have. What the UI does decide is
// what to OFFER: a task you can see but not own gets no status control, which
// matches what task_set_status() would refuse anyway.

const GREEN_PILL =
  'inline-flex items-center rounded-full bg-[#9FE870] px-2.5 py-0.5 text-[11px] font-semibold text-gray-900'

const STATUS_TONE: Record<TaskStatus, string> = {
  backlog: 'bg-gray-100 text-gray-600',
  planned: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-50 text-blue-700',
  blocked: 'bg-rose-50 text-rose-700',
  in_review: 'bg-violet-50 text-violet-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-gray-100 text-gray-400',
}

const PRIORITY_TONE: Record<TaskPriority, string> = {
  urgent: 'bg-rose-100 text-rose-800',
  high: 'bg-amber-100 text-amber-800',
  normal: 'bg-gray-100 text-gray-600',
  low: 'bg-gray-50 text-gray-500',
}

const HEALTH_TONE: Record<string, string> = {
  on_track: 'bg-emerald-50 text-emerald-700',
  at_risk: 'bg-amber-50 text-amber-800',
  off_track: 'bg-rose-50 text-rose-700',
}

const SOURCE_TONE: Record<string, string> = {
  meeting: 'bg-blue-50 text-blue-700',
  task: 'bg-gray-100 text-gray-700',
  leave: 'bg-rose-50 text-rose-700',
  holiday: 'bg-indigo-50 text-indigo-700',
  shift: 'bg-gray-50 text-gray-500',
  report_due: 'bg-violet-50 text-violet-700',
  tracker_due: 'bg-amber-50 text-amber-800',
  milestone: 'bg-emerald-50 text-emerald-700',
}

type Actions = {
  setTaskStatus: (
    taskId: string,
    status: TaskStatus,
    note?: string,
  ) => Promise<ActionResult<{ status: string }>>
  addProgressNote: (taskId: string, body: string) => Promise<ActionResult>
  flagBlocker: (taskId: string, reason: string) => Promise<ActionResult>
  createTask: (input: CreateTaskInput) => Promise<ActionResult<{ taskId: string }>>
  deleteTask: (taskId: string, reason: string) => Promise<ActionResult>
}

type Tab = 'tasks' | 'projects' | 'calendar' | 'meetings' | 'checklists' | 'dependencies' | 'blockers'

function formatDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

function dueLabel(dueDate: string | null, today: string): { text: string; tone: string } | null {
  if (!dueDate) return null
  if (dueDate < today) return { text: `Overdue, was due ${formatDay(dueDate)}`, tone: 'text-rose-700' }
  if (dueDate === today) return { text: 'Due today', tone: 'text-amber-700' }
  return { text: `Due ${formatDay(dueDate)}`, tone: 'text-gray-500' }
}

export default function WorkClient({
  today,
  timeZone,
  employeeId,
  tasks,
  projects,
  dependencies,
  calendar,
  meetings,
  milestones,
  actions,
}: {
  today: string
  timeZone: string
  employeeId: string
  tasks: TaskRow[]
  projects: ProjectRow[]
  dependencies: TaskDependencyRow[]
  calendar: CalendarEntry[]
  meetings: MeetingRow[]
  milestones: MilestoneRow[]
  actions: Actions
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [tab, setTab] = useState<Tab>('tasks')
  const [showForm, setShowForm] = useState(false)
  const [scope, setScope] = useState<'open' | 'mine' | 'all'>('open')

  const run = (fn: () => Promise<ActionResult>, okText?: string) => {
    setMessage(null)
    startTransition(async () => {
      const result = await fn()
      if (result.ok) {
        if (okText) setMessage({ tone: 'ok', text: okText })
        router.refresh()
      } else {
        setMessage({ tone: 'error', text: result.error })
      }
    })
  }

  const blocked = useMemo(
    () => tasks.filter((t) => t.status === 'blocked' || (t.blockingCount > 0 && !isClosed(t.status))),
    [tasks],
  )

  const visible = useMemo(() => {
    const filtered = tasks.filter((t) => {
      if (scope === 'all') return true
      if (scope === 'mine') return t.ownerEmployeeId === employeeId || t.assigneeIds.includes(employeeId)
      return !isClosed(t.status)
    })
    return sortTasks(filtered, today)
  }, [tasks, scope, employeeId, today])

  const TABS: { id: Tab; label: string; icon: typeof ListTodo; count?: number }[] = [
    { id: 'tasks', label: 'My Tasks', icon: ListTodo, count: tasks.filter((t) => !isClosed(t.status)).length },
    { id: 'projects', label: 'My Projects', icon: FolderKanban, count: projects.length },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays },
    { id: 'meetings', label: 'Meetings', icon: Users, count: meetings.length },
    { id: 'checklists', label: 'Checklists', icon: CheckSquare },
    { id: 'dependencies', label: 'Dependencies', icon: GitBranch, count: dependencies.length },
    { id: 'blockers', label: 'Blockers', icon: AlertTriangle, count: blocked.length },
  ]

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
                {t.count ? (
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
          {showForm ? 'Close' : 'New task'}
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
        <TaskForm
          today={today}
          projects={projects}
          pending={pending}
          onCreate={async (input) => {
            const result = await actions.createTask(input)
            if (result.ok) {
              setShowForm(false)
              setMessage({ tone: 'ok', text: 'Task added to your board.' })
              router.refresh()
            }
            return result
          }}
        />
      )}

      {tab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'open' as const, label: 'Open' },
                { id: 'mine' as const, label: 'Assigned to me' },
                { id: 'all' as const, label: 'Everything I can see' },
              ]
            ).map((s) => (
              <button data-opus-button="primary" data-opus-button-size="small"
                key={s.id}
                type="button"
                onClick={() => setScope(s.id)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
                  scope === s.id
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <Empty>
              {scope === 'open'
                ? 'Nothing open. Anything you are assigned will land here.'
                : 'No tasks to show.'}
            </Empty>
          ) : (
            <ul className="space-y-3">
              {visible.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  today={today}
                  employeeId={employeeId}
                  pending={pending}
                  actions={actions}
                  onRun={run}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'projects' && <Projects projects={projects} milestones={milestones} today={today} />}

      {tab === 'calendar' && <Calendar entries={calendar} today={today} timeZone={timeZone} />}

      {tab === 'meetings' && <Meetings meetings={meetings} timeZone={timeZone} />}

      {tab === 'checklists' && <Checklists tasks={tasks} />}

      {tab === 'dependencies' && <Dependencies dependencies={dependencies} />}

      {tab === 'blockers' && (
        <Blockers
          blocked={blocked}
          dependencies={dependencies}
          today={today}
          employeeId={employeeId}
          pending={pending}
          actions={actions}
          onRun={run}
        />
      )}
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

function StatusPill({ status }: { status: TaskStatus }) {
  return (
    <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold', STATUS_TONE[status])}>
      {TASK_STATUS_LABELS[status]}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

function TaskCard({
  task,
  today,
  employeeId,
  pending,
  actions,
  onRun,
  footer,
}: {
  task: TaskRow
  today: string
  employeeId: string
  pending: boolean
  actions: Actions
  onRun: (fn: () => Promise<ActionResult>, okText?: string) => void
  footer?: React.ReactNode
}) {
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  // The same question the database asks: seeing a project's task does not mean
  // you may move it. createdBy is not in the list payload, so a task somebody
  // else filed for you shows controls only once you are owner or assignee,
  // which is the conservative side of the same rule.
  const editable = canEditTask({
    employeeId,
    ownerEmployeeId: task.ownerEmployeeId,
    createdByEmployeeId: null,
    assigneeIds: task.assigneeIds,
    projectVisible: true,
  })

  const due = dueLabel(task.dueDate, today)

  const change = (status: TaskStatus, text?: string) => {
    setLocalError(null)
    const check = checkStatusChange({
      from: task.status,
      to: status,
      note: text ?? null,
      blockingCount: task.blockingCount,
    })
    if (!check.ok) {
      // Caught here only to save a round trip. task_set_status() applies the
      // same three rules under a row lock, and it is the one that decides.
      setLocalError(
        messageForToken(
          check.reason === 'already_closed'
            ? 'task.already_closed'
            : check.reason === 'blocker_reason_required'
              ? 'task.blocker_reason_required'
              : 'task.blocked_by_dependency',
        ),
      )
      return
    }
    onRun(() => actions.setTaskStatus(task.id, status, text))
  }

  return (
    <li className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{task.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-gray-500">
            {task.reference && <span className="font-mono text-[12px]">{task.reference}</span>}
            {task.projectName && <span className={GREEN_PILL}>{task.projectName}</span>}
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', PRIORITY_TONE[task.priority])}>
              {task.priority}
            </span>
            <span>{formatEffort(task.estimatedMinutes)}</span>
            {due && <span className={due.tone}>{due.text}</span>}
          </p>
        </div>
        <StatusPill status={task.status} />
      </div>

      {task.description && (
        <p className="mt-2 line-clamp-3 text-sm text-gray-700">{task.description}</p>
      )}

      {task.status === 'blocked' && task.blockerReason && (
        <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-800">
          Blocked: {task.blockerReason}
        </p>
      )}

      {task.blockingCount > 0 && !isClosed(task.status) && (
        <p className="mt-2 text-[13px] text-amber-700">
          Waiting on {task.blockingCount} {task.blockingCount === 1 ? 'task' : 'tasks'} before this can be
          completed.
        </p>
      )}

      {(task.commentCount > 0 || task.attachmentCount > 0 || task.tags.length > 0) && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-gray-400">
          {task.tags.map((t) => (
            <span key={t} className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
              {t}
            </span>
          ))}
          {task.commentCount > 0 && <span>{task.commentCount} notes</span>}
          {task.attachmentCount > 0 && <span>{task.attachmentCount} attachments</span>}
        </p>
      )}

      {localError && <p className="mt-2 text-[13px] text-rose-700">{localError}</p>}

      {editable ? (
        <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">
              Move to
            </label>
            <select
              value={task.status}
              disabled={pending}
              onChange={(e) => {
                const next = e.target.value as TaskStatus
                if (next === task.status) return
                change(next, next === 'blocked' ? reason : note || undefined)
              }}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-[13px]"
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            {!isClosed(task.status) && (
              <button data-opus-button="control"
                type="button"
                disabled={pending || task.blockingCount > 0}
                onClick={() => change('completed')}
                title={task.blockingCount > 0 ? 'Something this depends on is still open.' : undefined}
                className="rounded-full bg-[#9FE870] px-4 py-1.5 text-[13px] font-semibold text-gray-900 hover:brightness-95 disabled:opacity-40"
              >
                Mark done
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Progress note, or the reason it is blocked"
              className="min-w-[240px] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <button data-opus-button="control"
              type="button"
              disabled={pending || !note.trim()}
              onClick={() =>
                onRun(async () => {
                  const result = await actions.addProgressNote(task.id, note)
                  if (result.ok) setNote('')
                  return result
                }, 'Note saved.')
              }
              className="rounded-full border border-gray-200 px-4 py-2 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Add note
            </button>
            {task.status !== 'blocked' && (
              <button data-opus-button="danger" data-opus-button-size="medium"
                type="button"
                disabled={pending || !note.trim()}
                onClick={() => {
                  setReason(note)
                  onRun(() => actions.flagBlocker(task.id, note))
                }}
                className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-[13px] font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-40"
              >
                Flag as blocked
              </button>
            )}
          </div>

          {confirmDelete ? (
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why are you removing it?"
                className="min-w-[240px] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <button data-opus-button="danger" data-opus-button-size="medium"
                type="button"
                disabled={pending || !reason.trim()}
                onClick={() => onRun(() => actions.deleteTask(task.id, reason), 'Task removed from your board.')}
                className="rounded-full border border-rose-200 px-4 py-2 text-[13px] font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-40"
              >
                Remove it
              </button>
              <button data-opus-button="control"
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-full px-3 py-2 text-[13px] text-gray-500 hover:text-gray-800"
              >
                Keep it
              </button>
              <p className="w-full text-[12px] text-gray-400">
                The task and its history stay on the record. Removing it takes it off the boards, it
                does not erase it.
              </p>
            </div>
          ) : (
            <button data-opus-button="control"
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-[12px] font-medium text-gray-400 hover:text-rose-700"
            >
              Remove this task
            </button>
          )}
        </div>
      ) : (
        <p className="mt-3 border-t border-gray-100 pt-3 text-[12px] text-gray-400">
          You can follow this task. {task.ownerName ? `${task.ownerName} owns it` : 'Its owner'} and the
          people assigned to it can move it.
        </p>
      )}
      {footer}
    </li>
  )
}

function TaskForm({
  today,
  projects,
  pending,
  onCreate,
}: {
  today: string
  projects: ProjectRow[]
  pending: boolean
  onCreate: (input: CreateTaskInput) => Promise<ActionResult>
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState('')
  const [dueDate, setDueDate] = useState(today)
  const [priority, setPriority] = useState<TaskPriority>('normal')
  const [hours, setHours] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <form
      className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"
      onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        setBusy(true)
        const result = await onCreate({
          title,
          description,
          projectId: projectId || null,
          dueDate: dueDate || null,
          priority,
          estimatedMinutes: hours ? Math.round(Number(hours) * 60) : null,
        })
        setBusy(false)
        if (result.ok) {
          setTitle('')
          setDescription('')
          setHours('')
        } else {
          setError(result.error)
        }
      }}
    >
      <label className="block text-[13px] font-semibold text-gray-700">
        What needs doing
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={500}
          placeholder="Confirm the venue walkthrough date"
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-[13px] font-semibold text-gray-700">
          Project
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal"
          >
            <option value="">Just mine, no project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-[13px] font-semibold text-gray-700">
          Due
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal"
          />
        </label>

        <label className="text-[13px] font-semibold text-gray-700">
          Priority
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal"
          >
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </label>

        <label className="text-[13px] font-semibold text-gray-700">
          Estimate, hours
          <input
            type="number"
            min={0}
            step={0.5}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="Optional"
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal"
          />
        </label>
      </div>

      <label className="block text-[13px] font-semibold text-gray-700">
        Detail
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal"
        />
      </label>

      <p className="text-[12px] text-gray-400">
        You can only file into a project you are on. The list above is already limited to those.
      </p>
      {error && <p className="text-sm text-rose-700">{error}</p>}

      <button data-opus-button="primary" data-opus-button-size="medium"
        type="submit"
        disabled={pending || busy || !title.trim()}
        className="rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
      >
        Add task
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

function Projects({
  projects,
  milestones,
  today,
}: {
  projects: ProjectRow[]
  milestones: MilestoneRow[]
  today: string
}) {
  if (projects.length === 0) {
    return (
      <Empty>
        You are not on any projects yet. Projects appear once somebody adds you, or when one is
        opened to your department.
      </Empty>
    )
  }

  const byProject = new Map<string, MilestoneRow[]>()
  for (const m of milestones) {
    const list = byProject.get(m.projectId) ?? []
    list.push(m)
    byProject.set(m.projectId, list)
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((p) => {
        const next = (byProject.get(p.id) ?? []).find((m) => m.status !== 'completed')
        return (
          <section
            key={p.id}
            className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-gray-900">{p.name}</h2>
                <p className="mt-0.5 font-mono text-[12px] text-gray-400">{p.code}</p>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                  HEALTH_TONE[p.health] ?? 'bg-gray-100 text-gray-600',
                )}
              >
                {p.health.replace(/_/g, ' ')}
              </span>
            </div>

            {p.description && <p className="mt-2 line-clamp-2 text-[13px] text-gray-600">{p.description}</p>}

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-gray-500">
              <span className={GREEN_PILL}>{p.openTaskCount} open</span>
              <span>
                {p.memberCount} {p.memberCount === 1 ? 'person' : 'people'}
              </span>
              {p.managerName && <span>Led by {p.managerName}</span>}
            </div>

            {next && (
              <p
                className={cn(
                  'mt-3 border-t border-gray-100 pt-3 text-[13px]',
                  next.dueDate < today ? 'text-rose-700' : 'text-gray-600',
                )}
              >
                Next milestone: {next.name}, {formatDay(next.dueDate)}
              </p>
            )}

            {p.department && (
              <p className="mt-2 text-[12px] text-gray-400">
                {p.department}
                {p.visibility === 'members' ? ', members only' : `, visible to ${p.visibility}`}
              </p>
            )}
          </section>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

function Calendar({
  entries,
  today,
  timeZone,
}: {
  entries: CalendarEntry[]
  today: string
  timeZone: string
}) {
  const [showPast, setShowPast] = useState(false)
  const from = showPast ? addDays(today, -3) : today
  const days = useMemo(() => buildDays(entries, from, addDays(today, 24)), [entries, from, today])
  const busy = days.filter((d) => d.entries.length > 0).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-gray-500">
          {busy} of the next {days.length} days have something on them. Times are {timeZone.replace('_', ' ')}.
        </p>
        <button data-opus-button="control"
          type="button"
          onClick={() => setShowPast((v) => !v)}
          className="rounded-full border border-gray-200 px-3 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-gray-50"
        >
          {showPast ? 'Hide the last few days' : 'Show the last few days'}
        </button>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
        <ul className="divide-y divide-gray-100">
          {days.map((day) => (
            <li
              key={day.date}
              className={cn(
                'flex flex-wrap gap-x-4 gap-y-2 px-5 py-3',
                day.date === today && 'bg-[#9FE870]/10',
                (day.isHoliday || day.isOnLeave) && 'bg-gray-50',
              )}
            >
              <div className="w-32 shrink-0">
                <p
                  className={cn(
                    'text-[13px] font-semibold',
                    day.date === today ? 'text-gray-900' : 'text-gray-600',
                  )}
                >
                  {day.date === today ? 'Today' : formatDay(day.date)}
                </p>
                {(day.isHoliday || day.isOnLeave) && (
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    {day.isHoliday ? 'Holiday' : 'On leave'}
                  </p>
                )}
              </div>

              <div className="min-w-0 flex-1">
                {day.entries.length === 0 ? (
                  <p className="text-[13px] text-gray-300">Nothing scheduled</p>
                ) : (
                  <ul className="space-y-1.5">
                    {day.entries.map((e, i) => (
                      <li key={`${e.source}-${e.refId ?? i}`} className="flex flex-wrap items-baseline gap-2">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                            SOURCE_TONE[e.source] ?? 'bg-gray-100 text-gray-600',
                          )}
                        >
                          {SOURCE_LABELS[e.source]}
                        </span>
                        {!e.allDay && e.startsAt && (
                          <span className="font-mono text-[12px] text-gray-500">
                            {localTime(e.startsAt, timeZone)}
                          </span>
                        )}
                        <span className="text-[13px] text-gray-900">{e.title}</span>
                        {e.detail && <span className="text-[12px] text-gray-400">{e.detail}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-[12px] text-gray-400">
        Nothing on this calendar is stored twice. Leave, holidays, shifts, report deadlines and
        tracker items are read from the modules that own them, so it cannot drift out of step with
        them.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

function Meetings({ meetings, timeZone }: { meetings: MeetingRow[]; timeZone: string }) {
  if (meetings.length === 0) {
    return <Empty>No meeting notes yet. Meetings you attend or record show up here.</Empty>
  }

  return (
    <ul className="space-y-3">
      {meetings.map((m) => (
        <li
          key={m.id}
          className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">{m.title}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-gray-500">
                <span>
                  {new Date(m.heldAt).toLocaleDateString('en-GB', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    timeZone,
                  })}{' '}
                  at {localTime(m.heldAt, timeZone)}
                </span>
                {m.projectName && <span className={GREEN_PILL}>{m.projectName}</span>}
                <span>
                  {m.attendeeCount} {m.attendeeCount === 1 ? 'attendee' : 'attendees'}
                </span>
              </p>
            </div>
          </div>

          {m.decisions && (
            <p className="mt-2 rounded-lg bg-[#9FE870]/20 px-3 py-2 text-[13px] text-gray-800">
              Decided: {m.decisions}
            </p>
          )}

          {(m.agenda || m.notes) && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[13px] font-medium text-gray-600 hover:text-gray-900">
                Agenda and notes
              </summary>
              {m.agenda && <p className="mt-2 whitespace-pre-line text-[13px] text-gray-700">{m.agenda}</p>}
              {m.notes && <p className="mt-2 whitespace-pre-line text-[13px] text-gray-700">{m.notes}</p>}
            </details>
          )}
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Checklists
// ---------------------------------------------------------------------------

/**
 * Checklists.
 *
 * Honest note: there is no separate checklist table. A checklist here is a set
 * of tasks sharing a tag, with its completion counted. That is how the existing
 * data actually arrives (the intern onboarding tasks carry an `onboarding` tag),
 * and a parallel checklist store would have been a second place for the same
 * work to live and go stale.
 */
function Checklists({ tasks }: { tasks: TaskRow[] }) {
  const groups = useMemo(() => {
    const byTag = new Map<string, TaskRow[]>()
    for (const task of tasks) {
      for (const tag of task.tags) {
        const list = byTag.get(tag) ?? []
        list.push(task)
        byTag.set(tag, list)
      }
    }
    return [...byTag.entries()]
      .filter(([, list]) => list.length > 1)
      .map(([tag, list]) => ({
        tag,
        tasks: list,
        done: list.filter((t) => t.status === 'completed').length,
      }))
      .sort((a, b) => a.done / a.tasks.length - b.done / b.tasks.length || a.tag.localeCompare(b.tag))
  }, [tasks])

  if (groups.length === 0) {
    return (
      <Empty>
        No checklists yet. Tag two or more tasks with the same label, such as onboarding, and they
        group into one here with its progress.
      </Empty>
    )
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const percent = Math.round((group.done / group.tasks.length) * 100)
        return (
          <section
            key={group.tag}
            className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold capitalize text-gray-900">
                {group.tag.replace(/[-_]/g, ' ')}
              </h2>
              <span className={GREEN_PILL}>
                {group.done} of {group.tasks.length} done
              </span>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-[#9FE870]" style={{ width: `${percent}%` }} />
            </div>

            <ul className="mt-3 divide-y divide-gray-100">
              {group.tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                  <span
                    className={cn(
                      'text-[13px]',
                      t.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-900',
                    )}
                  >
                    {t.title}
                  </span>
                  <StatusPill status={t.status} />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

function Dependencies({ dependencies }: { dependencies: TaskDependencyRow[] }) {
  if (dependencies.length === 0) {
    return <Empty>Nothing you can see depends on anything else.</Empty>
  }

  const byTask = new Map<string, TaskDependencyRow[]>()
  for (const d of dependencies) {
    const list = byTask.get(d.taskId) ?? []
    list.push(d)
    byTask.set(d.taskId, list)
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {[...byTask.entries()].map(([taskId, deps]) => (
          <li
            key={taskId}
            className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"
          >
            <p className="text-sm font-semibold text-gray-900">{deps[0].taskTitle}</p>
            <p className="mt-0.5 text-[12px] uppercase tracking-wide text-gray-400">Waits for</p>
            <ul className="mt-2 divide-y divide-gray-100">
              {deps.map((d) => {
                const settled = d.dependsOnStatus === 'completed' || d.dependsOnStatus === 'cancelled'
                return (
                  <li
                    key={`${d.taskId}-${d.dependsOnTaskId}`}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <span className={cn('text-[13px]', settled ? 'text-gray-400' : 'text-gray-900')}>
                      {d.dependsOnTitle}
                    </span>
                    <span className="flex items-center gap-2">
                      {!d.blocksCompletion && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                          Does not block
                        </span>
                      )}
                      <StatusPill status={d.dependsOnStatus} />
                    </span>
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ul>

      <p className="text-[12px] text-gray-400">
        A cancelled prerequisite stops blocking, so abandoned work does not strand everything behind
        it. Loops are rejected when the link is made, not when somebody tries to finish.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Blockers
// ---------------------------------------------------------------------------

function Blockers({
  blocked,
  dependencies,
  today,
  employeeId,
  pending,
  actions,
  onRun,
}: {
  blocked: TaskRow[]
  dependencies: TaskDependencyRow[]
  today: string
  employeeId: string
  pending: boolean
  actions: Actions
  onRun: (fn: () => Promise<ActionResult>, okText?: string) => void
}) {
  if (blocked.length === 0) {
    return <Empty>Nothing is blocked. Anything stuck, or waiting on another task, appears here.</Empty>
  }

  const openBlockers = (taskId: string) =>
    dependencies.filter(
      (d) =>
        d.taskId === taskId &&
        d.blocksCompletion &&
        d.dependsOnStatus !== 'completed' &&
        d.dependsOnStatus !== 'cancelled',
    )

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {sortTasks(blocked, today).map((task) => {
          const waiting = openBlockers(task.id)
          return (
            <TaskCard
              key={task.id}
              task={task}
              today={today}
              employeeId={employeeId}
              pending={pending}
              actions={actions}
              onRun={onRun}
              footer={
                waiting.length > 0 ? (
                  <p className="mt-2 text-[12px] text-gray-500">
                    Waiting on: {waiting.map((d) => d.dependsOnTitle).join(', ')}
                  </p>
                ) : null
              }
            />
          )
        })}
      </ul>

      <p className="text-[12px] text-gray-400">
        A blocked task always carries its reason. That is enforced when it is set, so nothing lands
        here that nobody can act on.
      </p>
    </div>
  )
}
