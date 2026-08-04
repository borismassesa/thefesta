// Task states, dependencies and visibility — pure, no I/O.
//
// Mirrors task_set_status(), task_blocking_dependencies() and
// task_is_visible_to() in the migration. The database is the enforcer; this
// exists so the UI offers only what exists, and so the rules are testable
// without one.

export const TASK_STATUSES = [
  'backlog',
  'planned',
  'in_progress',
  'blocked',
  'in_review',
  'completed',
  'cancelled',
] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  planned: 'Planned',
  in_progress: 'In progress',
  blocked: 'Blocked',
  in_review: 'In review',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

/** Statuses in which the work is over. */
export const CLOSED_STATUSES: readonly TaskStatus[] = ['completed', 'cancelled']

/** Statuses that count as outstanding on a list or a calendar. */
export const OPEN_STATUSES: readonly TaskStatus[] = [
  'backlog',
  'planned',
  'in_progress',
  'blocked',
  'in_review',
]

export const TASK_PRIORITIES = ['urgent', 'high', 'normal', 'low'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

const PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
}

export function isClosed(status: TaskStatus): boolean {
  return CLOSED_STATUSES.includes(status)
}

export function isOpen(status: TaskStatus): boolean {
  return OPEN_STATUSES.includes(status)
}

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

export type TaskVisibilityInput = {
  employeeId: string
  ownerEmployeeId: string | null
  createdByEmployeeId: string | null
  assigneeIds: string[]
  projectVisible: boolean
  isAdmin?: boolean
  deleted?: boolean
}

/**
 * May this employee see this task?
 *
 * A task with no project is visible only to the people directly connected to
 * it. That is what stops a personal task, or one in a private project, leaking
 * to a whole department.
 */
export function canViewTask(input: TaskVisibilityInput): boolean {
  if (input.deleted) return false
  if (input.isAdmin) return true
  if (input.ownerEmployeeId === input.employeeId) return true
  if (input.createdByEmployeeId === input.employeeId) return true
  if (input.assigneeIds.includes(input.employeeId)) return true
  return input.projectVisible
}

export type ProjectVisibilityInput = {
  employeeId: string
  employeeDepartment: string
  visibility: 'members' | 'department' | 'organisation'
  managerId: string | null
  sponsorId: string | null
  memberIds: string[]
  projectDepartment: string | null
  isAdmin?: boolean
  archived?: boolean
}

/**
 * May this employee see this project?
 *
 * 'members' is the default, so a project nobody added you to stays invisible.
 * This is the "do not grant unrestricted access to all company projects" rule.
 */
export function canViewProject(input: ProjectVisibilityInput): boolean {
  if (input.archived) return false
  if (input.isAdmin) return true
  if (input.managerId === input.employeeId) return true
  if (input.sponsorId === input.employeeId) return true
  if (input.memberIds.includes(input.employeeId)) return true
  if (input.visibility === 'organisation') return true
  if (input.visibility === 'department') {
    return Boolean(input.projectDepartment) && input.projectDepartment === input.employeeDepartment
  }
  return false
}

/**
 * May this employee CHANGE the task?
 *
 * Seeing a project's task does not mean you may move it: visibility and
 * authority are different questions, and conflating them lets any project
 * member close anybody's work.
 */
export function canEditTask(input: TaskVisibilityInput): boolean {
  if (!canViewTask(input)) return false
  if (input.isAdmin) return true
  if (input.ownerEmployeeId === input.employeeId) return true
  return input.assigneeIds.includes(input.employeeId)
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export type TaskDependency = {
  taskId: string
  dependsOnTaskId: string
  blocksCompletion: boolean
}

export type DependencyTarget = { id: string; status: TaskStatus; deleted?: boolean }

/**
 * Dependencies that still stand in the way of completing a task.
 *
 * A CANCELLED blocker does not block: the work is not going to happen, and
 * leaving it as a gate would strand everything behind it forever. Only
 * dependencies flagged blocksCompletion count, because gating on every link
 * makes people delete links rather than record them.
 */
export function blockingDependencies(
  taskId: string,
  dependencies: TaskDependency[],
  tasksById: Map<string, DependencyTarget>,
): DependencyTarget[] {
  return dependencies
    .filter((d) => d.taskId === taskId && d.blocksCompletion)
    .map((d) => tasksById.get(d.dependsOnTaskId))
    .filter((t): t is DependencyTarget => Boolean(t))
    .filter((t) => !t.deleted && t.status !== 'completed' && t.status !== 'cancelled')
}

export type CompletionCheck =
  | { ok: true }
  | { ok: false; reason: 'blocked_by_dependency'; blockers: DependencyTarget[] }

export function canComplete(
  taskId: string,
  dependencies: TaskDependency[],
  tasksById: Map<string, DependencyTarget>,
): CompletionCheck {
  const blockers = blockingDependencies(taskId, dependencies, tasksById)
  return blockers.length === 0 ? { ok: true } : { ok: false, reason: 'blocked_by_dependency', blockers }
}

/**
 * Would adding this dependency create a cycle?
 *
 * A cycle makes completion impossible for every task in the loop, and hangs any
 * naive traversal. Checked before the write, with a depth cap so an already
 * corrupt graph cannot hang the check itself.
 */
export function wouldCreateCycle(
  taskId: string,
  dependsOnTaskId: string,
  existing: TaskDependency[],
  maxDepth = 50,
): boolean {
  if (taskId === dependsOnTaskId) return true

  // Follow the DEPENDS-ON chain out of the proposed blocker: does it already
  // (transitively) depend on the task we are about to put in front of it? If so,
  // adding the edge closes the loop.
  //
  // Direction matters and is easy to get backwards. With a -> b -> c meaning
  // "a depends on b depends on c", adding "c depends on a" is a cycle, and it
  // is only visible by walking a's dependencies, not a's dependents.
  const seen = new Set<string>()
  let frontier = [dependsOnTaskId]

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth += 1) {
    const next: string[] = []
    for (const current of frontier) {
      if (current === taskId) return true
      if (seen.has(current)) continue
      seen.add(current)
      for (const dep of existing) {
        if (dep.taskId === current) next.push(dep.dependsOnTaskId)
      }
    }
    frontier = next
  }

  return false
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

export type StatusChangeInput = {
  from: TaskStatus
  to: TaskStatus
  note?: string | null
  blockingCount: number
}

export type StatusChangeResult =
  | { ok: true }
  | { ok: false; reason: 'already_closed' | 'blocker_reason_required' | 'blocked_by_dependency' }

/**
 * Is this status change allowed?
 *
 * Reopening a closed task is permitted, but only to an active status: a
 * completed task can go back to in_progress, not sideways to cancelled.
 */
export function checkStatusChange(input: StatusChangeInput): StatusChangeResult {
  if (isClosed(input.from) && input.to !== 'in_progress' && input.to !== 'planned') {
    return { ok: false, reason: 'already_closed' }
  }
  if (input.to === 'blocked' && !input.note?.trim()) {
    // A blocked task with no reason is a task nobody can unblock.
    return { ok: false, reason: 'blocker_reason_required' }
  }
  if (input.to === 'completed' && input.blockingCount > 0) {
    return { ok: false, reason: 'blocked_by_dependency' }
  }
  return { ok: true }
}

/** Sort for a task list: overdue first, then priority, then due date. */
export function sortTasks<T extends { dueDate: string | null; priority: TaskPriority; status: TaskStatus }>(
  tasks: T[],
  today: string,
): T[] {
  const rank = (t: T) => {
    if (isClosed(t.status)) return 3
    if (t.dueDate && t.dueDate < today) return 0
    if (t.dueDate === today) return 1
    return 2
  }
  return [...tasks].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31'),
  )
}

export function formatEffort(minutes: number | null): string {
  if (minutes === null || minutes <= 0) return 'Not estimated'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
