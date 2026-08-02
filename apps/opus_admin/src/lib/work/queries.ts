import 'server-only'
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/supabase'
import { logDbError } from '@/lib/log-safe'
import type { WorkspaceEmployee } from '@/lib/workspace/identity'
import type { TaskPriority, TaskStatus } from './tasks'
import type { CalendarEntry, CalendarSource } from './calendar'

// Work reads, scoped to one employee.
//
// EVERY task query starts from task_visible_ids(), and every project query from
// project_is_visible_to(). Not "filters afterwards" — starts from. A task that
// is not visible is never fetched, so there is no shape in which one could be
// returned by an oversight in a later filter.

export type TaskRow = {
  id: string
  reference: string | null
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  ownerEmployeeId: string | null
  ownerName: string | null
  projectId: string | null
  projectName: string | null
  startDate: string | null
  dueDate: string | null
  estimatedMinutes: number | null
  actualMinutes: number
  blockerReason: string | null
  blockedSince: string | null
  tags: string[]
  linkedGoalId: string | null
  linkedTrackerItemId: string | null
  assigneeIds: string[]
  blockingCount: number
  commentCount: number
  attachmentCount: number
}

export type ProjectRow = {
  id: string
  code: string
  name: string
  description: string | null
  department: string | null
  status: string
  health: string
  visibility: string
  managerName: string | null
  memberCount: number
  openTaskCount: number
  startsOn: string | null
  endsOn: string | null
}

export type MilestoneRow = {
  id: string
  projectId: string
  projectName: string
  name: string
  dueDate: string
  status: string
}

export type MeetingRow = {
  id: string
  title: string
  heldAt: string
  agenda: string
  notes: string
  decisions: string
  attendeeCount: number
  projectName: string | null
}

const TASK_COLUMNS =
  'id, reference, title, description, status, priority, owner_employee_id, project_id, start_date, due_date, estimated_minutes, actual_minutes, blocker_reason, blocked_since, tags, linked_goal_id, linked_tracker_item_id, projects(name), workforce_employees!owner_employee_id(full_name)'

type RawTask = {
  id: string
  reference: string | null
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  owner_employee_id: string | null
  project_id: string | null
  start_date: string | null
  due_date: string | null
  estimated_minutes: number | null
  actual_minutes: number
  blocker_reason: string | null
  blocked_since: string | null
  tags: string[]
  linked_goal_id: string | null
  linked_tracker_item_id: string | null
  projects: { name: string } | null
  workforce_employees: { full_name: string } | null
}

/** The ids this employee may see at all. Everything else intersects with it. */
async function visibleTaskIds(
  employee: WorkspaceEmployee,
  isAdmin: boolean,
): Promise<string[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc('task_visible_ids', {
    p_employee_id: employee.id,
    p_is_admin: isAdmin,
  })
  if (error) {
    logDbError('work.visible_ids', error, { employeeId: employee.id })
    return []
  }
  return Array.isArray(data) ? (data as { task_id: string }[]).map((r) => r.task_id) : []
}

export async function getMyTasks(
  employee: WorkspaceEmployee,
  options: { isAdmin?: boolean; assignedOnly?: boolean } = {},
): Promise<TaskRow[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const ids = await visibleTaskIds(employee, Boolean(options.isAdmin))
    if (ids.length === 0) return []

    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('tasks')
      .select(TASK_COLUMNS)
      .in('id', ids)
      .is('deleted_at', null)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(500)
      .returns<RawTask[]>()
    if (error) {
      logDbError('work.tasks', error, { employeeId: employee.id })
      return []
    }

    const rows = data ?? []
    const [assignees, blocking, counts] = await Promise.all([
      assigneesFor(rows.map((r) => r.id)),
      blockingCounts(rows.map((r) => r.id)),
      commentAndAttachmentCounts(rows.map((r) => r.id)),
    ])

    const mapped = rows.map((r) => ({
      id: r.id,
      reference: r.reference,
      title: r.title,
      description: r.description,
      status: r.status,
      priority: r.priority,
      ownerEmployeeId: r.owner_employee_id,
      ownerName: r.workforce_employees?.full_name ?? null,
      projectId: r.project_id,
      projectName: r.projects?.name ?? null,
      startDate: r.start_date,
      dueDate: r.due_date,
      estimatedMinutes: r.estimated_minutes,
      actualMinutes: r.actual_minutes,
      blockerReason: r.blocker_reason,
      blockedSince: r.blocked_since,
      tags: r.tags ?? [],
      linkedGoalId: r.linked_goal_id,
      linkedTrackerItemId: r.linked_tracker_item_id,
      assigneeIds: assignees.get(r.id) ?? [],
      blockingCount: blocking.get(r.id) ?? 0,
      commentCount: counts.comments.get(r.id) ?? 0,
      attachmentCount: counts.attachments.get(r.id) ?? 0,
    }))

    return options.assignedOnly
      ? mapped.filter((t) => t.assigneeIds.includes(employee.id) || t.ownerEmployeeId === employee.id)
      : mapped
  } catch (error) {
    logDbError('work.tasks', error, { employeeId: employee.id })
    return []
  }
}

async function assigneesFor(taskIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  if (taskIds.length === 0) return map
  const supabase = createSupabaseAdminClient()
  const { data } = await supabase
    .from('task_assignments')
    .select('task_id, employee_id')
    .in('task_id', taskIds)
    .is('unassigned_at', null)
    .returns<{ task_id: string; employee_id: string }[]>()
  for (const row of data ?? []) {
    const list = map.get(row.task_id) ?? []
    list.push(row.employee_id)
    map.set(row.task_id, list)
  }
  return map
}

/** How many blocking dependencies each task still has. */
async function blockingCounts(taskIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (taskIds.length === 0) return map
  const supabase = createSupabaseAdminClient()
  const { data } = await supabase
    .from('task_dependencies')
    .select('task_id, blocks_completion, tasks!depends_on_task_id(status, deleted_at)')
    .in('task_id', taskIds)
    .eq('blocks_completion', true)
    .returns<
      { task_id: string; blocks_completion: boolean; tasks: { status: string; deleted_at: string | null } | null }[]
    >()
  for (const row of data ?? []) {
    const blocker = row.tasks
    // A completed, cancelled or deleted blocker does not block. Mirrors
    // task_blocking_dependencies() so the badge matches what the server will do.
    if (!blocker || blocker.deleted_at) continue
    if (blocker.status === 'completed' || blocker.status === 'cancelled') continue
    map.set(row.task_id, (map.get(row.task_id) ?? 0) + 1)
  }
  return map
}

async function commentAndAttachmentCounts(taskIds: string[]) {
  const comments = new Map<string, number>()
  const attachments = new Map<string, number>()
  if (taskIds.length === 0) return { comments, attachments }
  const supabase = createSupabaseAdminClient()
  const [c, a] = await Promise.all([
    supabase.from('task_comments').select('task_id').in('task_id', taskIds).returns<{ task_id: string }[]>(),
    supabase.from('task_attachments').select('task_id').in('task_id', taskIds).returns<{ task_id: string }[]>(),
  ])
  for (const row of c.data ?? []) comments.set(row.task_id, (comments.get(row.task_id) ?? 0) + 1)
  for (const row of a.data ?? []) attachments.set(row.task_id, (attachments.get(row.task_id) ?? 0) + 1)
  return { comments, attachments }
}

export type TaskDependencyRow = {
  taskId: string
  taskTitle: string
  dependsOnTaskId: string
  dependsOnTitle: string
  dependsOnStatus: TaskStatus
  blocksCompletion: boolean
}

/** Dependencies among the tasks this employee can see. */
export async function getDependencies(
  employee: WorkspaceEmployee,
  isAdmin = false,
): Promise<TaskDependencyRow[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const ids = await visibleTaskIds(employee, isAdmin)
    if (ids.length === 0) return []
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('task_dependencies')
      .select(
        'task_id, depends_on_task_id, blocks_completion, task:tasks!task_id(title), blocker:tasks!depends_on_task_id(title, status, deleted_at)',
      )
      .in('task_id', ids)
      .returns<
        {
          task_id: string
          depends_on_task_id: string
          blocks_completion: boolean
          task: { title: string } | null
          blocker: { title: string; status: TaskStatus; deleted_at: string | null } | null
        }[]
      >()
    if (error) {
      logDbError('work.dependencies', error, { employeeId: employee.id })
      return []
    }
    return (data ?? [])
      .filter((d) => d.blocker && !d.blocker.deleted_at)
      .map((d) => ({
        taskId: d.task_id,
        taskTitle: d.task?.title ?? 'Task',
        dependsOnTaskId: d.depends_on_task_id,
        // The blocker's title is shown even when it lives in a project the
        // viewer cannot open. A dependency you cannot name is a dead end, and
        // a title is far less than access to the task.
        dependsOnTitle: d.blocker?.title ?? 'Task',
        dependsOnStatus: d.blocker?.status ?? 'planned',
        blocksCompletion: d.blocks_completion,
      }))
  } catch (error) {
    logDbError('work.dependencies', error, { employeeId: employee.id })
    return []
  }
}

export async function getMyProjects(
  employee: WorkspaceEmployee,
  isAdmin = false,
): Promise<ProjectRow[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('projects')
      .select(
        'id, code, name, description, department, status, health, visibility, starts_on, ends_on, manager_id, workforce_employees!manager_id(full_name)',
      )
      .is('archived_at', null)
      .order('name')
      .returns<
        {
          id: string
          code: string
          name: string
          description: string | null
          department: string | null
          status: string
          health: string
          visibility: string
          starts_on: string | null
          ends_on: string | null
          manager_id: string | null
          workforce_employees: { full_name: string } | null
        }[]
      >()
    if (error) {
      logDbError('work.projects', error, { employeeId: employee.id })
      return []
    }

    // Visibility is decided by the database, per project, rather than
    // reimplemented here. Slightly chattier; impossible to drift.
    const visible: typeof data = []
    for (const project of data ?? []) {
      const { data: ok } = await supabase.rpc('project_is_visible_to', {
        p_project_id: project.id,
        p_employee_id: employee.id,
        p_is_admin: isAdmin,
      })
      if (ok === true) visible.push(project)
    }
    if (visible.length === 0) return []

    const [members, tasks] = await Promise.all([
      supabase
        .from('project_members')
        .select('project_id')
        .in('project_id', visible.map((p) => p.id))
        .returns<{ project_id: string }[]>(),
      supabase
        .from('tasks')
        .select('project_id, status')
        .in('project_id', visible.map((p) => p.id))
        .is('deleted_at', null)
        .returns<{ project_id: string; status: TaskStatus }[]>(),
    ])

    const memberCounts = new Map<string, number>()
    for (const m of members.data ?? []) {
      memberCounts.set(m.project_id, (memberCounts.get(m.project_id) ?? 0) + 1)
    }
    const openCounts = new Map<string, number>()
    for (const t of tasks.data ?? []) {
      if (t.status === 'completed' || t.status === 'cancelled') continue
      openCounts.set(t.project_id, (openCounts.get(t.project_id) ?? 0) + 1)
    }

    return visible.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      department: p.department,
      status: p.status,
      health: p.health,
      visibility: p.visibility,
      managerName: p.workforce_employees?.full_name ?? null,
      memberCount: memberCounts.get(p.id) ?? 0,
      openTaskCount: openCounts.get(p.id) ?? 0,
      startsOn: p.starts_on,
      endsOn: p.ends_on,
    }))
  } catch (error) {
    logDbError('work.projects', error, { employeeId: employee.id })
    return []
  }
}

/** The merged calendar. Timezone and visibility are both the database's job. */
export async function getCalendar(
  employee: WorkspaceEmployee,
  from: string,
  to: string,
  timeZone = 'Africa/Dar_es_Salaam',
  isAdmin = false,
): Promise<CalendarEntry[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase.rpc('work_calendar', {
      p_employee_id: employee.id,
      p_from: from,
      p_to: to,
      p_timezone: timeZone,
      p_is_admin: isAdmin,
    })
    if (error) {
      logDbError('work.calendar', error, { employeeId: employee.id })
      return []
    }
    if (!Array.isArray(data)) return []
    return (
      data as {
        source: CalendarSource
        entry_date: string
        starts_at: string | null
        ends_at: string | null
        all_day: boolean
        title: string
        detail: string | null
        ref_id: string | null
      }[]
    ).map((row) => ({
      source: row.source,
      date: row.entry_date,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      allDay: row.all_day,
      title: row.title,
      detail: row.detail,
      refId: row.ref_id,
    }))
  } catch (error) {
    logDbError('work.calendar', error, { employeeId: employee.id })
    return []
  }
}

export async function getMeetings(
  employee: WorkspaceEmployee,
  limit = 20,
): Promise<MeetingRow[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const supabase = createSupabaseAdminClient()
    // Only meetings the employee actually attended or recorded. Minutes carry
    // decisions, and a meeting somebody was not in is not theirs to read.
    const { data, error } = await supabase
      .from('meeting_records')
      .select('id, title, held_at, agenda, notes, decisions, attendee_employee_ids, projects(name)')
      .or(`attendee_employee_ids.cs.{${employee.id}},recorded_by_employee_id.eq.${employee.id}`)
      .order('held_at', { ascending: false })
      .limit(limit)
      .returns<
        {
          id: string
          title: string
          held_at: string
          agenda: string
          notes: string
          decisions: string
          attendee_employee_ids: string[]
          projects: { name: string } | null
        }[]
      >()
    if (error) {
      logDbError('work.meetings', error, { employeeId: employee.id })
      return []
    }
    return (data ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      heldAt: m.held_at,
      agenda: m.agenda,
      notes: m.notes,
      decisions: m.decisions,
      attendeeCount: (m.attendee_employee_ids ?? []).length,
      projectName: m.projects?.name ?? null,
    }))
  } catch (error) {
    logDbError('work.meetings', error, { employeeId: employee.id })
    return []
  }
}

export async function getMilestones(
  employee: WorkspaceEmployee,
  isAdmin = false,
): Promise<MilestoneRow[]> {
  const projects = await getMyProjects(employee, isAdmin)
  if (projects.length === 0) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('project_milestones')
      .select('id, project_id, name, due_date, status, projects(name)')
      .in('project_id', projects.map((p) => p.id))
      .order('due_date')
      .returns<
        {
          id: string
          project_id: string
          name: string
          due_date: string
          status: string
          projects: { name: string } | null
        }[]
      >()
    if (error) {
      logDbError('work.milestones', error, { employeeId: employee.id })
      return []
    }
    return (data ?? []).map((m) => ({
      id: m.id,
      projectId: m.project_id,
      projectName: m.projects?.name ?? 'Project',
      name: m.name,
      dueDate: m.due_date,
      status: m.status,
    }))
  } catch (error) {
    logDbError('work.milestones', error, { employeeId: employee.id })
    return []
  }
}
