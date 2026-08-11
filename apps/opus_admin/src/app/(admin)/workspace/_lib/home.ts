import 'server-only'
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/supabase'
import { escapeLike } from '@/lib/admin-auth'
import { logDbError } from '@/lib/log-safe'
import type { WorkspaceEmployee } from '@/lib/workspace/identity'
import {
  addDays,
  daysBetween,
  localDate,
  reportDueState,
  taskUrgency,
  type ReportCadence,
  type ReportDueState,
  type TaskUrgency,
} from './home-schedule'

// Workspace Home — everything the signed-in employee needs to see about their
// own day, and nothing about anybody else's.
//
// THE RULE: every function here takes a `WorkspaceEmployee` that was resolved
// from the Clerk session by lib/workspace/identity.ts. None of them takes an
// employee id as a plain string, so there is no shape in which a route could
// pass one in from a request. Every query filters on employee.id (or, for
// approval_requests, on the employee's own email, which is that table's owner
// key). Nothing here reads a table that is not scoped that way.
//
// Failure posture: cards are independent. One failing query greys out one card
// rather than blanking Home, and the error is logged by SQLSTATE only — never
// returned to the browser.

const DEFAULT_TIME_ZONE = 'Africa/Dar_es_Salaam'
const AGENDA_HORIZON_DAYS = 14

export type ClockState = {
  isClockedIn: boolean
  onBreak: boolean
  sinceIso: string | null
  lastPunchIso: string | null
}

export type ScheduledShift = {
  type: string
  startTime: string | null
  endTime: string | null
  note: string | null
}

export type HomeTask = {
  id: string
  source: 'assigned' | 'intern'
  title: string
  category: string
  dueDate: string | null
  status: string
  urgency: TaskUrgency
}

export type HomeReport = {
  templateId: string
  name: string
  cadence: ReportCadence
  lastSubmitted: string | null
  state: Exclude<ReportDueState, 'ok'>
}

export type HomeRequest = {
  id: string
  category: string
  subject: string
  status: string
  updatedAt: string
}

export type LeaveBalance = {
  entitlementDays: number
  usedDays: number
  remainingDays: number
  year: string
}

export type UpcomingLeave = {
  id: string
  type: string
  startDate: string
  endDate: string
  days: number
  status: string
  startsInDays: number
}

export type AgendaEvent = {
  date: string
  kind: 'leave' | 'task' | 'report' | 'shift'
  label: string
  detail: string | null
}

export type Announcement = {
  id: string
  title: string
  body: string | null
  href: string | null
  createdAt: string
  priority: string
}

export type AttentionItem = {
  id: string
  label: string
  detail: string
  href: string
  severity: 'critical' | 'warning'
}

export type WorkspaceHome = {
  today: string
  timeZone: string
  profile: {
    name: string
    employeeCode: string
    jobTitle: string
    department: string
    location: string
    managerName: string | null
    status: string
    startDate: string
  }
  clock: ClockState | null
  shift: ScheduledShift | null
  tasksDueToday: HomeTask[]
  openTaskCount: number
  reportsDue: HomeReport[]
  pendingRequests: HomeRequest[]
  leaveBalance: LeaveBalance | null
  upcomingLeave: UpcomingLeave[]
  agenda: AgendaEvent[]
  announcements: Announcement[]
  attention: AttentionItem[]
}

/**
 * Build Workspace Home for one employee.
 *
 * The employee argument is the authorization: callers get it from
 * requireWorkspaceCapability('workspace.read'), which has already checked both
 * identity and access state.
 */
export async function getWorkspaceHome(
  employee: WorkspaceEmployee,
  timeZone: string = DEFAULT_TIME_ZONE,
): Promise<WorkspaceHome> {
  const now = new Date()
  const today = localDate(now, timeZone)

  const profile = {
    name: employee.name,
    employeeCode: employee.employeeCode,
    jobTitle: employee.jobTitle,
    department: employee.department,
    location: employee.location,
    managerName: employee.managerName,
    status: employee.status,
    startDate: employee.startDate,
  }

  if (!hasSupabaseAdminConfig()) {
    return emptyHome(today, timeZone, profile)
  }

  const [clock, shift, tasks, reportsDue, pendingRequests, leave, announcements] =
    await Promise.all([
      fetchClockState(employee.id),
      fetchTodayShift(employee.id, today),
      fetchTasks(employee.id, today),
      fetchReportsDue(employee, today),
      fetchPendingRequests(employee.email),
      fetchLeave(employee, today),
      fetchAnnouncements(employee.id),
    ])

  const tasksDueToday = tasks.filter((t) => t.urgency === 'today' || t.urgency === 'overdue')
  const agenda = buildAgenda({ today, tasks, upcomingLeave: leave.upcoming, shift, reportsDue })
  const attention = buildAttention({ tasks, reportsDue, clock, shift, today })

  return {
    today,
    timeZone,
    profile,
    clock,
    shift,
    tasksDueToday,
    openTaskCount: tasks.length,
    reportsDue,
    pendingRequests,
    leaveBalance: leave.balance,
    upcomingLeave: leave.upcoming,
    agenda,
    announcements,
    attention,
  }
}

function emptyHome(
  today: string,
  timeZone: string,
  profile: WorkspaceHome['profile'],
): WorkspaceHome {
  return {
    today,
    timeZone,
    profile,
    clock: null,
    shift: null,
    tasksDueToday: [],
    openTaskCount: 0,
    reportsDue: [],
    pendingRequests: [],
    leaveBalance: null,
    upcomingLeave: [],
    agenda: [],
    announcements: [],
    attention: [],
  }
}

// ---------------------------------------------------------------------------
// Card queries. Each returns a safe empty value on failure.
// ---------------------------------------------------------------------------

// Reads the attendance module's session state, not the legacy punch log, so
// Home and /workspace/timeclock can never disagree about whether someone is on
// the clock. There is one source of truth for that, and this is it.
async function fetchClockState(employeeId: string): Promise<ClockState | null> {
  try {
    const supabase = createSupabaseAdminClient()
    const [open, latest] = await Promise.all([
      supabase
        .from('attendance_sessions')
        .select('opened_at, state')
        .eq('employee_id', employeeId)
        .in('state', ['clocked_in', 'on_break'])
        .limit(1)
        .returns<{ opened_at: string; state: string }[]>(),
      supabase
        .from('attendance_sessions')
        .select('closed_at')
        .eq('employee_id', employeeId)
        .not('closed_at', 'is', null)
        .order('closed_at', { ascending: false })
        .limit(1)
        .returns<{ closed_at: string }[]>(),
    ])
    if (open.error) {
      logDbError('workspace.home.clock', open.error, { employeeId })
      return null
    }
    const session = (open.data ?? [])[0]
    const lastClose = (latest.data ?? [])[0]?.closed_at ?? null
    if (!session) {
      return { isClockedIn: false, onBreak: false, sinceIso: null, lastPunchIso: lastClose }
    }
    return {
      isClockedIn: true,
      onBreak: session.state === 'on_break',
      sinceIso: session.opened_at,
      lastPunchIso: session.opened_at,
    }
  } catch (error) {
    logDbError('workspace.home.clock', error, { employeeId })
    return null
  }
}

// Resolved through the attendance module's precedence (weekday assignment ->
// schedule-level -> default schedule), the same path the clock uses. The old
// workforce_shifts roster is still the HR-facing weekly grid; it is not what
// attendance measures against.
async function fetchTodayShift(employeeId: string, today: string): Promise<ScheduledShift | null> {
  try {
    const supabase = createSupabaseAdminClient()
    const { data: resolved, error } = await supabase.rpc('attendance_resolve_schedule', {
      p_employee_id: employeeId,
      p_date: today,
    })
    if (error) {
      logDbError('workspace.home.shift', error, { employeeId })
      return null
    }
    type ResolvedRow = { schedule_id: string; shift_template_id: string | null; work_mode: string }
    const row = (Array.isArray(resolved) ? (resolved as ResolvedRow[]) : [])[0]
    if (!row) return null

    if (!row.shift_template_id) {
      return { type: row.work_mode, startTime: null, endTime: null, note: null }
    }
    const { data: template, error: templateError } = await supabase
      .from('shift_templates')
      .select('name, start_time, end_time, crosses_midnight, location_label')
      .eq('id', row.shift_template_id)
      .maybeSingle<{
        name: string
        start_time: string
        end_time: string
        crosses_midnight: boolean
        location_label: string | null
      }>()
    if (templateError) {
      logDbError('workspace.home.shift_template', templateError, { employeeId })
      return null
    }
    if (!template) return null
    return {
      type: template.name,
      startTime: template.start_time,
      endTime: template.end_time,
      note: template.crosses_midnight
        ? `Overnight${template.location_label ? ` · ${template.location_label}` : ''}`
        : template.location_label,
    }
  } catch (error) {
    logDbError('workspace.home.shift', error, { employeeId })
    return null
  }
}

/** Open tasks from both sources — assigned instances and onboarding checklist. */
async function fetchTasks(employeeId: string, today: string): Promise<HomeTask[]> {
  const supabase = createSupabaseAdminClient()
  const OPEN = ['Todo', 'In Progress']

  const [assigned, intern] = await Promise.all([
    supabase
      .from('workforce_tasks')
      .select('id, title, category, due_date, status')
      .eq('employee_id', employeeId)
      .in('status', OPEN)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(50)
      .returns<{ id: string; title: string; category: string; due_date: string | null; status: string }[]>(),
    supabase
      .from('intern_tasks')
      .select('id, title, category, due_date, status')
      .eq('employee_id', employeeId)
      .in('status', OPEN)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(50)
      .returns<{ id: string; title: string; category: string; due_date: string | null; status: string }[]>(),
  ])

  if (assigned.error) logDbError('workspace.home.tasks_assigned', assigned.error, { employeeId })
  if (intern.error) logDbError('workspace.home.tasks_intern', intern.error, { employeeId })

  const map = (
    rows: { id: string; title: string; category: string; due_date: string | null; status: string }[],
    source: HomeTask['source'],
  ): HomeTask[] =>
    rows.map((row) => ({
      id: row.id,
      source,
      title: row.title,
      category: row.category,
      dueDate: row.due_date,
      status: row.status,
      urgency: taskUrgency(row.due_date, today),
    }))

  return [...map(assigned.data ?? [], 'assigned'), ...map(intern.data ?? [], 'intern')].sort(
    (a, b) => (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31'),
  )
}

/**
 * Recurring reports this employee owes.
 *
 * Templates are scoped to the employee's department (or unrestricted), matching
 * the gate in me/reports/actions.ts — Home must not advertise a report the
 * employee would then be refused permission to file.
 */
async function fetchReportsDue(
  employee: WorkspaceEmployee,
  today: string,
): Promise<HomeReport[]> {
  try {
    const supabase = createSupabaseAdminClient()
    const { data: templates, error: templateError } = await supabase
      .from('report_templates')
      .select('id, name, cadence, departments')
      .eq('is_active', true)
      .returns<{ id: string; name: string; cadence: ReportCadence; departments: string[] | null }[]>()
    if (templateError) {
      logDbError('workspace.home.report_templates', templateError, { employeeId: employee.id })
      return []
    }

    const mine = (templates ?? []).filter((t) => {
      const departments = t.departments ?? []
      return departments.length === 0 || departments.includes(employee.department)
    })
    if (mine.length === 0) return []

    const { data: submitted, error: submittedError } = await supabase
      .from('workforce_reports')
      .select('template_id, report_date')
      .eq('employee_id', employee.id)
      .eq('status', 'submitted')
      .order('report_date', { ascending: false })
      .limit(200)
      .returns<{ template_id: string | null; report_date: string }[]>()
    if (submittedError) {
      logDbError('workspace.home.reports', submittedError, { employeeId: employee.id })
      return []
    }

    const latest = new Map<string, string>()
    for (const row of submitted ?? []) {
      if (!row.template_id) continue
      const current = latest.get(row.template_id)
      if (!current || row.report_date > current) latest.set(row.template_id, row.report_date)
    }

    const due: HomeReport[] = []
    for (const template of mine) {
      const lastSubmitted = latest.get(template.id) ?? null
      const state = reportDueState(template.cadence, lastSubmitted, today, employee.startDate)
      if (state === 'ok') continue
      due.push({
        templateId: template.id,
        name: template.name,
        cadence: template.cadence,
        lastSubmitted,
        state,
      })
    }
    // Overdue first, then by name so the order is stable between renders.
    return due.sort(
      (a, b) =>
        Number(b.state === 'overdue') - Number(a.state === 'overdue') ||
        a.name.localeCompare(b.name),
    )
  } catch (error) {
    logDbError('workspace.home.reports', error, { employeeId: employee.id })
    return []
  }
}

/**
 * The employee's own approval requests that are not finished.
 *
 * approval_requests keys ownership by owner_email, so this filters on the
 * employee's directory address — not on anything the browser supplied.
 */
async function fetchPendingRequests(email: string): Promise<HomeRequest[]> {
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('approval_requests')
      .select('id, category, subject, status, updated_at')
      .ilike('owner_email', escapeLike(email))
      .in('status', ['To Submit', 'Submitted'])
      .order('updated_at', { ascending: false })
      .limit(10)
      .returns<
        { id: string; category: string; subject: string; status: string; updated_at: string }[]
      >()
    if (error) {
      logDbError('workspace.home.requests', error)
      return []
    }
    return (data ?? []).map((row) => ({
      id: row.id,
      category: row.category,
      subject: row.subject,
      status: row.status,
      updatedAt: row.updated_at,
    }))
  } catch (error) {
    logDbError('workspace.home.requests', error)
    return []
  }
}

async function fetchLeave(
  employee: WorkspaceEmployee,
  today: string,
): Promise<{ balance: LeaveBalance | null; upcoming: UpcomingLeave[] }> {
  try {
    const supabase = createSupabaseAdminClient()
    const yearStart = `${today.slice(0, 4)}-01-01`

    const [requests, balances] = await Promise.all([
      supabase
        .from('leave_requests')
        .select('id, start_date, end_date, total_days, state, leave_types(name)')
        .eq('employee_id', employee.id)
        .in('state', ['submitted', 'under_review', 'approved'])
        .order('start_date', { ascending: true })
        .limit(100)
        .returns<
          {
            id: string
            start_date: string
            end_date: string
            total_days: number
            state: string
            leave_types: { name: string } | null
          }[]
        >(),
      supabase
        .from('leave_balances')
        .select('used_days, balance_days, pending_days')
        .eq('employee_id', employee.id)
        .eq('leave_year_start', yearStart)
        .returns<
          {
            used_days: number
            balance_days: number
            pending_days: number
          }[]
        >(),
    ])

    if (requests.error) {
      logDbError('workspace.home.leave', requests.error, { employeeId: employee.id })
      return { balance: null, upcoming: [] }
    }
    if (balances.error) {
      logDbError('workspace.home.leave_balance', balances.error, { employeeId: employee.id })
      return { balance: null, upcoming: [] }
    }

    const rows = requests.data ?? []
    const balanceRows = balances.data ?? []
    const usedDays = balanceRows.reduce((sum, row) => sum + Number(row.used_days), 0)
    const remainingDays = balanceRows.reduce(
      (sum, row) => sum + Number(row.balance_days) - Number(row.pending_days),
      0,
    )
    const entitlementDays = usedDays + balanceRows.reduce(
      (sum, row) => sum + Number(row.balance_days),
      0,
    )

    const upcoming: UpcomingLeave[] = rows
      .filter((row) => row.end_date >= today)
      .slice(0, 5)
      .map((row) => ({
        id: row.id,
        type: row.leave_types?.name ?? 'Leave',
        startDate: row.start_date,
        endDate: row.end_date,
        days: Number(row.total_days),
        status: row.state,
        startsInDays: daysBetween(today, row.start_date),
      }))

    return {
      balance: balanceRows.length > 0 ? {
        entitlementDays,
        usedDays,
        remainingDays,
        year: today.slice(0, 4),
      } : null,
      upcoming,
    }
  } catch (error) {
    logDbError('workspace.home.leave', error, { employeeId: employee.id })
    return { balance: null, upcoming: [] }
  }
}

/**
 * Org announcements.
 *
 * There is no announcements table yet; the platform's system-wide messages are
 * delivered as staff_notifications with category 'system', already fanned out
 * per recipient. Reading them here keeps Home honest (it shows what was
 * actually sent to this person) instead of inventing a second channel.
 */
async function fetchAnnouncements(employeeId: string): Promise<Announcement[]> {
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('staff_notifications')
      .select('id, title, body, href, priority, created_at')
      .eq('employee_id', employeeId)
      .eq('channel', 'bell')
      .eq('category', 'system')
      .in('status', ['unread', 'read'])
      .order('created_at', { ascending: false })
      .limit(5)
      .returns<
        {
          id: string
          title: string
          body: string | null
          href: string | null
          priority: string
          created_at: string
        }[]
      >()
    if (error) {
      logDbError('workspace.home.announcements', error, { employeeId })
      return []
    }
    return (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      href: row.href,
      priority: row.priority,
      createdAt: row.created_at,
    }))
  } catch (error) {
    logDbError('workspace.home.announcements', error, { employeeId })
    return []
  }
}

// ---------------------------------------------------------------------------
// Derived cards
// ---------------------------------------------------------------------------

/**
 * A 14-day agenda assembled from the records Workspace already holds: booked
 * leave, task and report deadlines, and today's rostered shift.
 *
 * OpusFesta has no calendar table. Rather than render an empty card or stub one
 * against a source that does not exist, Home shows the dated commitments it can
 * actually prove. When a real calendar arrives, its events merge into this list.
 */
function buildAgenda(input: {
  today: string
  tasks: HomeTask[]
  upcomingLeave: UpcomingLeave[]
  shift: ScheduledShift | null
  reportsDue: HomeReport[]
}): AgendaEvent[] {
  const horizon = addDays(input.today, AGENDA_HORIZON_DAYS)
  const events: AgendaEvent[] = []

  if (input.shift && input.shift.type !== 'Off') {
    events.push({
      date: input.today,
      kind: 'shift',
      label: input.shift.type,
      detail:
        input.shift.startTime && input.shift.endTime
          ? `${input.shift.startTime.slice(0, 5)} – ${input.shift.endTime.slice(0, 5)}`
          : input.shift.note,
    })
  }

  for (const leave of input.upcomingLeave) {
    if (leave.startDate > horizon) continue
    events.push({
      date: leave.startDate,
      kind: 'leave',
      label: `${leave.type} leave`,
      detail:
        leave.startDate === leave.endDate
          ? `${leave.status} · 1 day`
          : `${leave.status} · until ${leave.endDate}`,
    })
  }

  for (const task of input.tasks) {
    if (!task.dueDate || task.dueDate > horizon) continue
    events.push({
      date: task.dueDate,
      kind: 'task',
      label: task.title,
      detail: task.category,
    })
  }

  for (const report of input.reportsDue) {
    events.push({
      date: input.today,
      kind: 'report',
      label: report.name,
      detail: report.state === 'overdue' ? 'Overdue' : 'Due',
    })
  }

  return events.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12)
}

/** The short list of things that are actually wrong right now. */
function buildAttention(input: {
  tasks: HomeTask[]
  reportsDue: HomeReport[]
  clock: ClockState | null
  shift: ScheduledShift | null
  today: string
}): AttentionItem[] {
  const items: AttentionItem[] = []

  const overdueTasks = input.tasks.filter((t) => t.urgency === 'overdue')
  if (overdueTasks.length > 0) {
    items.push({
      id: 'tasks-overdue',
      label: `${overdueTasks.length} overdue ${overdueTasks.length === 1 ? 'task' : 'tasks'}`,
      detail: overdueTasks
        .slice(0, 3)
        .map((t) => t.title)
        .join(', '),
      href: '/workspace/work',
      severity: 'critical',
    })
  }

  const overdueReports = input.reportsDue.filter((r) => r.state === 'overdue')
  if (overdueReports.length > 0) {
    items.push({
      id: 'reports-overdue',
      label: `${overdueReports.length} overdue ${overdueReports.length === 1 ? 'report' : 'reports'}`,
      detail: overdueReports.map((r) => r.name).join(', '),
      href: '/workspace/reports',
      severity: 'critical',
    })
  }

  // Still clocked in from a previous day. Almost always a forgotten clock-out,
  // and it quietly corrupts the timesheet until someone notices.
  if (input.clock?.isClockedIn && input.clock.sinceIso) {
    const sinceDate = input.clock.sinceIso.slice(0, 10)
    if (sinceDate < input.today) {
      items.push({
        id: 'clock-open',
        label: 'You are still clocked in from a previous day',
        detail: `Open since ${sinceDate}. Clock out to correct your timesheet.`,
        href: '/workspace/timeclock',
        severity: 'warning',
      })
    }
  }

  // Rostered today and not clocked in yet.
  if (input.shift && input.shift.type !== 'Off' && input.clock && !input.clock.isClockedIn) {
    const lastDate = input.clock.lastPunchIso?.slice(0, 10) ?? null
    if (lastDate !== input.today) {
      items.push({
        id: 'clock-in',
        label: "You haven't clocked in today",
        detail: `Rostered ${input.shift.type.toLowerCase()} today.`,
        href: '/workspace/timeclock',
        severity: 'warning',
      })
    }
  }

  return items
}
