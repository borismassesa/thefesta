'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getSelfIdentity } from '@/lib/workforce/identity'
import { recordAuditEvent } from '@/lib/audit-log'

// Server actions for the "My tasks" page. Each is scoped to the caller's
// own employee row — admin-side editing of other people's tasks happens
// in /workforce/tasks, not here.
//
// Tasks come from two tables: `intern_tasks` (onboarding checklist) and
// `workforce_tasks` (instances generated from admin assignments). The
// `source` discriminator routes each status change to the right table.
//
// Authz: we resolve the caller's workforce_employees row by email and
// only permit mutations where the task's employee_id matches. Enforced
// server-side because the admin app uses the service role key (bypasses
// RLS); the email-match check is the gate.

export type TaskSource = 'intern' | 'assigned'
type TaskStatus = 'Todo' | 'In Progress' | 'Done'

const TABLE: Record<TaskSource, 'intern_tasks' | 'workforce_tasks'> = {
  intern: 'intern_tasks',
  assigned: 'workforce_tasks',
}

// Identity comes from the shared resolver, which keys on clerk_user_id and
// escapes the email fallback. The previous implementation here did an
// UNESCAPED .ilike('email', email), so an address like `john_doe@x.com`
// matched any character at the underscore and could resolve to a different
// employee — meaning "complete my task" could complete someone else's.
async function resolveCallerEmployee(): Promise<{ id: string } | null> {
  const identity = await getSelfIdentity()
  return identity.ok ? { id: identity.employee.id } : null
}

async function setTaskStatus(
  taskId: string,
  source: TaskSource,
  target: TaskStatus,
): Promise<void> {
  const employee = await resolveCallerEmployee()
  if (!employee) throw new Error('No workforce profile — ask an admin to add you.')

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
  if (lookupError) throw lookupError
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
  if (error) throw error
  revalidatePath('/workspace/tasks')
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
