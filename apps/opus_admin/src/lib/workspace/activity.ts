import 'server-only'
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/supabase'
import { logDbError } from '@/lib/log-safe'
import { recordAuditEvent, type AuditSeverity } from '@/lib/audit-log'

// Shared activity + audit infrastructure for Workspace.
//
// Three streams exist and they are not interchangeable. Writing to the wrong
// one is how an audit trail quietly stops being one:
//
//   workspace_activity_events (here)  "this happened in MY Workspace"
//     Read back to the employee as their own feed. Employee-scoped, append-only.
//
//   audit_log (lib/audit-log.ts)      "someone was allowed or denied something"
//     Read by /insights/audit. Security events, never rendered to the subject.
//
//   workflow_events (notifications)   "this happened to a record"
//     Published for fan-out to other people's notifications.
//
// A sensitive Workspace action writes BOTH an activity event (so the employee
// can see what was done in their name) and an audit event (so the platform can
// answer for it). recordSensitiveWorkspaceAction does the pair in one call.
//
// Every writer here is best-effort and non-throwing: a logging failure must
// never take down the action that was being logged.

export type WorkspaceActivityInput = {
  /** Whose Workspace this belongs to. Always a server-resolved id. */
  employeeId: string
  /** Dot-namespaced, e.g. 'workspace.timeclock.punched'. */
  eventType: string
  /** One line, rendered to the employee. */
  summary: string
  targetResource?: string | null
  actorEmployeeId?: string | null
  actorClerkId?: string | null
  /** Ids and enums only — this is read back to the employee. */
  metadata?: Record<string, unknown>
}

export async function recordWorkspaceActivity(input: WorkspaceActivityInput): Promise<void> {
  if (!hasSupabaseAdminConfig()) {
    console.warn('[workspace-activity] skipped — Supabase admin config missing:', input.eventType)
    return
  }
  try {
    const supabase = createSupabaseAdminClient()
    const { error } = await supabase.from('workspace_activity_events').insert({
      employee_id: input.employeeId,
      event_type: input.eventType,
      summary: input.summary,
      target_resource: input.targetResource ?? null,
      actor_employee_id: input.actorEmployeeId ?? input.employeeId,
      actor_clerk_id: input.actorClerkId ?? null,
      metadata: input.metadata ?? {},
    })
    if (error) {
      logDbError('workspace_activity_events.insert', error, { eventType: input.eventType })
    }
  } catch (error) {
    logDbError('workspace_activity_events.insert', error, { eventType: input.eventType })
  }
}

export type WorkspaceActivityEvent = {
  id: string
  eventType: string
  summary: string
  targetResource: string | null
  createdAt: string
}

/**
 * The employee's own recent activity. `employeeId` is always server-resolved —
 * there is no caller that can pass someone else's id, because nothing exports a
 * route or action that takes one.
 */
export async function getWorkspaceActivity(
  employeeId: string,
  limit = 20,
): Promise<WorkspaceActivityEvent[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('workspace_activity_events')
      .select('id, event_type, summary, target_resource, created_at')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 100))
      .returns<
        {
          id: string
          event_type: string
          summary: string
          target_resource: string | null
          created_at: string
        }[]
      >()
    if (error) {
      logDbError('workspace_activity_events.select', error, { employeeId })
      return []
    }
    return (data ?? []).map((row) => ({
      id: row.id,
      eventType: row.event_type,
      summary: row.summary,
      targetResource: row.target_resource,
      createdAt: row.created_at,
    }))
  } catch (error) {
    logDbError('workspace_activity_events.select', error, { employeeId })
    return []
  }
}

export type SensitiveActionInput = WorkspaceActivityInput & {
  /** Defaults to 'info'. Denials and identity changes should raise it. */
  severity?: AuditSeverity
  /** Audit-side message. Defaults to `summary`. */
  auditMessage?: string
}

/**
 * Record a sensitive Workspace action in both streams.
 *
 * Use for anything that changes a record, moves money, touches employment
 * state, or exposes a document: clocking in or out, submitting a report,
 * raising or cancelling a request, downloading a payslip.
 */
export async function recordSensitiveWorkspaceAction(
  input: SensitiveActionInput,
): Promise<void> {
  const { severity, auditMessage, ...activity } = input
  await Promise.all([
    recordWorkspaceActivity(activity),
    recordAuditEvent({
      eventType: activity.eventType,
      severity: severity ?? 'info',
      message: auditMessage ?? activity.summary,
      actorClerkId: activity.actorClerkId ?? null,
      targetResource: activity.targetResource ?? undefined,
      metadata: { employeeId: activity.employeeId, ...(activity.metadata ?? {}) },
    }),
  ])
}
