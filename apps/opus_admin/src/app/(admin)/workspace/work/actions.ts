'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { logDbError } from '@/lib/log-safe'
import { hasPermission } from '@/lib/admin-auth'
import { requireWorkspaceCapability } from '@/lib/workspace/guards'
import { recordSensitiveWorkspaceAction } from '@/lib/workspace/activity'
import { toSafeMessage } from '@/lib/workspace/errors'
import { workErrorToken, workMessage } from '@/lib/work/errors'
import { TASK_STATUSES, type TaskStatus } from '@/lib/work/tasks'

// Work server actions.
//
// THE IDENTITY RULE. None takes an employee id; it comes from
// requireWorkspaceCapability. The database functions then re-check visibility
// AND authority under a row lock — seeing a project's task does not mean you
// may move it.

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

export async function setTaskStatus(
  taskId: string,
  status: TaskStatus,
  note?: string,
): Promise<ActionResult<{ status: string }>> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'work.status' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  if (!TASK_STATUSES.includes(status)) {
    return { ok: false, error: 'That is not a task status.' }
  }

  const isAdmin = await hasPermission('workforce.write')
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc('task_set_status', {
    p_task_id: taskId,
    p_employee_id: employee.id,
    p_status: status,
    p_note: note ?? null,
    p_is_admin: isAdmin,
  })
  if (error) {
    if (!workErrorToken(error)) logDbError('work.set_status', error, { employeeId: employee.id })
    return { ok: false, error: workMessage(error) }
  }

  void recordSensitiveWorkspaceAction({
    employeeId: employee.id,
    eventType: `workspace.task.${status}`,
    summary: `Moved a task to ${status.replace('_', ' ')}`,
    actorEmployeeId: employee.id,
    actorClerkId: employee.clerkUserId,
    targetResource: `tasks:${taskId}`,
    metadata: { taskId, status, asAdmin: isAdmin },
  })

  revalidatePath('/workspace/work')
  return { ok: true, status: typeof data === 'string' ? data : status }
}

/** A progress note. Shows on the task timeline and can feed a tracker entry. */
export async function addProgressNote(
  taskId: string,
  body: string,
): Promise<ActionResult> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'work.note' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  const text = body.trim()
  if (text.length === 0) return { ok: false, error: 'Write something first.' }
  if (text.length > 5000) return { ok: false, error: 'Keep notes under 5000 characters.' }

  const isAdmin = await hasPermission('workforce.write')
  const supabase = createSupabaseAdminClient()

  // Visibility is checked by the database, not assumed from the fact that the
  // client had an id.
  const { data: visible } = await supabase.rpc('task_is_visible_to', {
    p_task_id: taskId,
    p_employee_id: employee.id,
    p_is_admin: isAdmin,
  })
  if (visible !== true) return { ok: false, error: workMessage({ message: 'task.not_found' }) }

  const { error } = await supabase.from('task_comments').insert({
    task_id: taskId,
    author_employee_id: employee.id,
    author_name: employee.name,
    body: text,
    is_progress_note: true,
  })
  if (error) {
    logDbError('work.note', error, { employeeId: employee.id })
    return { ok: false, error: workMessage(error) }
  }

  revalidatePath('/workspace/work')
  return { ok: true }
}

export async function flagBlocker(
  taskId: string,
  reason: string,
): Promise<ActionResult> {
  const trimmed = reason.trim()
  if (trimmed.length === 0) {
    return { ok: false, error: workMessage({ message: 'task.blocker_reason_required' }) }
  }
  const result = await setTaskStatus(taskId, 'blocked', trimmed)
  return result.ok ? { ok: true } : result
}

export async function deleteTask(taskId: string, reason: string): Promise<ActionResult> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'work.delete' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  const trimmed = reason.trim()
  if (trimmed.length === 0) {
    return { ok: false, error: workMessage({ message: 'task.reason_required' }) }
  }

  const isAdmin = await hasPermission('workforce.write')
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.rpc('task_soft_delete', {
    p_task_id: taskId,
    p_employee_id: employee.id,
    p_reason: trimmed,
    p_is_admin: isAdmin,
  })
  if (error) {
    if (!workErrorToken(error)) logDbError('work.delete', error, { employeeId: employee.id })
    return { ok: false, error: workMessage(error) }
  }

  void recordSensitiveWorkspaceAction({
    employeeId: employee.id,
    eventType: 'workspace.task.deleted',
    summary: 'Removed a task from their board',
    actorEmployeeId: employee.id,
    actorClerkId: employee.clerkUserId,
    targetResource: `tasks:${taskId}`,
    // Soft delete: the row and its history stay, which is what makes this
    // auditable rather than destructive.
    metadata: { taskId, softDeleted: true, reason: trimmed },
    severity: 'warn',
  })

  revalidatePath('/workspace/work')
  return { ok: true }
}

export type CreateTaskInput = {
  title: string
  description?: string
  projectId?: string | null
  dueDate?: string | null
  priority?: 'urgent' | 'high' | 'normal' | 'low'
  estimatedMinutes?: number | null
  linkedTrackerItemId?: string | null
}

export async function createTask(
  input: CreateTaskInput,
): Promise<ActionResult<{ taskId: string }>> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'work.create' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  const title = input.title.trim()
  if (title.length === 0) return { ok: false, error: 'Give the task a title.' }
  if (title.length > 500) return { ok: false, error: 'Keep the title under 500 characters.' }

  const isAdmin = await hasPermission('workforce.write')
  const supabase = createSupabaseAdminClient()

  // A task may only be filed into a project the employee can actually see,
  // otherwise a guessed uuid becomes a way to write into someone else's board.
  if (input.projectId) {
    const { data: ok } = await supabase.rpc('project_is_visible_to', {
      p_project_id: input.projectId,
      p_employee_id: employee.id,
      p_is_admin: isAdmin,
    })
    if (ok !== true) return { ok: false, error: workMessage({ message: 'project.not_visible' }) }
  }

  const { data: created, error } = await supabase
    .from('tasks')
    .insert({
      title,
      description: (input.description ?? '').slice(0, 20000),
      owner_employee_id: employee.id,
      created_by_employee_id: employee.id,
      project_id: input.projectId ?? null,
      due_date: input.dueDate || null,
      priority: input.priority ?? 'normal',
      estimated_minutes: input.estimatedMinutes ?? null,
      linked_tracker_item_id: input.linkedTrackerItemId ?? null,
      status: 'planned',
    })
    .select('id')
    .single<{ id: string }>()
  if (error) {
    logDbError('work.create', error, { employeeId: employee.id })
    return { ok: false, error: workMessage(error) }
  }

  await supabase.from('task_assignments').insert({
    task_id: created.id,
    employee_id: employee.id,
    role: 'assignee',
    assigned_by: employee.id,
  })
  await supabase.from('task_activity_events').insert({
    task_id: created.id,
    event_type: 'task.created',
    to_status: 'planned',
    summary: 'Task created',
    actor_employee_id: employee.id,
  })

  revalidatePath('/workspace/work')
  return { ok: true, taskId: created.id }
}

/**
 * Link a task to something it depends on.
 *
 * The cycle guard is a trigger, so a loop is rejected by the database rather
 * than by whichever caller remembered to check.
 */
export async function addDependency(
  taskId: string,
  dependsOnTaskId: string,
  blocksCompletion = true,
): Promise<ActionResult> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'work.dependency' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }
  if (taskId === dependsOnTaskId) {
    return { ok: false, error: workMessage({ message: 'task.dependency_cycle' }) }
  }

  const isAdmin = await hasPermission('workforce.write')
  const supabase = createSupabaseAdminClient()

  // Both ends must be visible: linking to a task you cannot see would let you
  // discover its existence and gate your own work on it.
  for (const id of [taskId, dependsOnTaskId]) {
    const { data: ok } = await supabase.rpc('task_is_visible_to', {
      p_task_id: id,
      p_employee_id: employee.id,
      p_is_admin: isAdmin,
    })
    if (ok !== true) return { ok: false, error: workMessage({ message: 'task.not_found' }) }
  }

  const { error } = await supabase.from('task_dependencies').insert({
    task_id: taskId,
    depends_on_task_id: dependsOnTaskId,
    blocks_completion: blocksCompletion,
    created_by: employee.id,
  })
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return { ok: false, error: 'Those tasks are already linked.' }
    }
    if (!workErrorToken(error)) logDbError('work.dependency', error, { employeeId: employee.id })
    return { ok: false, error: workMessage(error) }
  }

  revalidatePath('/workspace/work')
  return { ok: true }
}
