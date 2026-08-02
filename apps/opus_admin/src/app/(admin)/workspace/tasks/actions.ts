'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { recordAuditEvent } from '@/lib/audit-log'
import { logDbError } from '@/lib/log-safe'
import { WorkspaceError } from '@/lib/workspace/errors'
import { requireWorkspaceCapability } from '@/lib/workspace/guards'
import { recordWorkspaceActivity } from '@/lib/workspace/activity'

// Server actions for the "My tasks" page. Each is scoped to the caller's
// own employee row — admin-side editing of other people's tasks happens
// in /workforce/tasks, not here.
//
// Tasks come from two tables: `intern_tasks` (onboarding checklist) and
// `workforce_tasks` (instances generated from admin assignments). The
// `source` discriminator routes each status change to the right table.
//
// Authz: the employee is resolved from the Clerk session by the Workspace
// identity resolver, which also enforces the access state ('tools.use' is
// granted by full access only). The caller supplies a task id, never an
// employee id, and the UPDATE is filtered on the resolved employee_id — so a
// non-owner update matches zero rows even if the ownership check above it were
// somehow bypassed. Enforced server-side because the admin app uses the service
// role key and bypasses RLS.

export type TaskSource = 'intern' | 'assigned'
type TaskStatus = 'Todo' | 'In Progress' | 'Done'

const TABLE: Record<TaskSource, 'intern_tasks' | 'workforce_tasks'> = {
  intern: 'intern_tasks',
  assigned: 'workforce_tasks',
}

async function setTaskStatus(
  taskId: string,
  source: TaskSource,
  target: TaskStatus,
): Promise<void> {
  const { employee } = await requireWorkspaceCapability('tools.use', {
    action: `tasks.${target.toLowerCase().replace(' ', '_')}`,
  })

  const table = TABLE[source]
  const supabase = createSupabaseAdminClient()
  // Confirm ownership before mutating. The .eq chain on the UPDATE is the
  // actual enforcement (a non-owner update affects zero rows); the SELECT
  // first is for a clearer error + audit trail.
  const { data: task, error: lookupError } = await supabase
    .from(table)
    .select('id, employee_id')
    .eq('id', taskId)
    .maybeSingle<{ id: string; employee_id: string }>()
  if (lookupError) {
    logDbError(`workspace.tasks.lookup`, lookupError, { employeeId: employee.id })
    throw new WorkspaceError('unavailable')
  }
  if (!task) throw new Error('Task not found.')
  if (task.employee_id !== employee.id) {
    void recordAuditEvent({
      eventType: `${table}.unauthorized_update`,
      severity: 'critical',
      message: 'Attempt to update someone else’s task',
      targetResource: `${table}:${taskId}`,
      metadata: { targetOwner: task.employee_id, attemptedBy: employee.id },
    })
    throw new Error('You can only update your own tasks.')
  }

  const patch: Record<string, unknown> = { status: target }
  patch.completed_at = target === 'Done' ? new Date().toISOString() : null

  const { error } = await supabase
    .from(table)
    .update(patch)
    .eq('id', taskId)
    .eq('employee_id', employee.id)
  if (error) {
    logDbError('workspace.tasks.update', error, { employeeId: employee.id })
    throw new WorkspaceError('unavailable')
  }

  void recordWorkspaceActivity({
    employeeId: employee.id,
    eventType: 'workspace.task.status_changed',
    summary: `Moved a task to ${target}`,
    actorEmployeeId: employee.id,
    actorClerkId: employee.clerkUserId,
    targetResource: `${table}:${taskId}`,
    metadata: { source, status: target },
  })

  revalidatePath('/workspace')
  revalidatePath('/workforce/my-tasks')
  revalidatePath('/workforce/tasks')
  revalidatePath('/')
}

export async function startTask(taskId: string, source: TaskSource): Promise<void> {
  await setTaskStatus(taskId, source, 'In Progress')
}
export async function completeTask(taskId: string, source: TaskSource): Promise<void> {
  await setTaskStatus(taskId, source, 'Done')
}
export async function reopenTask(taskId: string, source: TaskSource): Promise<void> {
  await setTaskStatus(taskId, source, 'Todo')
}
