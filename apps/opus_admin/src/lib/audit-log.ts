import 'server-only'
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from './supabase'
import { getCallerEmail } from './admin-auth'
import { logDbError } from '@/lib/log-safe'

// Append-only writer for the audit_log table. The Technology dashboard
// lane and /insights/audit both read this stream.
//
// Best-effort by design — a failed insert MUST NOT cascade into the
// caller's flow. We catch and console.warn so a logging hiccup never
// breaks the underlying action (e.g. payroll approval).
//
// Schema lives in 20260515000002_audit_log.sql. Writes use the service
// role client and bypass RLS.

export type AuditSeverity = 'info' | 'warn' | 'error' | 'critical'

export type AuditEvent = {
  eventType: string                 // 'auth.permission_denied'
  severity?: AuditSeverity          // default 'info'
  message: string                   // human-readable summary
  // Optional actor. If omitted and `resolveActor` is true (default), we
  // try to pull the caller's email from Clerk via getCallerEmail.
  actorEmail?: string | null
  actorClerkId?: string | null
  targetResource?: string           // 'workforce_employees:abc-123'
  metadata?: Record<string, unknown>
  // Skip the Clerk lookup when we already know nobody is signed in
  // (e.g. a Supabase webhook or scheduled job).
  resolveActor?: boolean
}

export async function recordAuditEvent(event: AuditEvent): Promise<void> {
  if (!hasSupabaseAdminConfig()) {
    console.warn('[audit-log] skipped — Supabase admin config missing:', event.eventType)
    return
  }

  let actorEmail = event.actorEmail ?? null
  if (!actorEmail && event.resolveActor !== false) {
    try {
      actorEmail = await getCallerEmail()
    } catch (error) {
      // Silently absorb — if the caller isn't a Clerk session we just
      // log the event without an actor. The metadata can still help.
      logDbError('audit_log.resolve_actor', error)
    }
  }

  try {
    const supabase = createSupabaseAdminClient()
    const { error } = await supabase.from('audit_log').insert({
      event_type: event.eventType,
      severity: event.severity ?? 'info',
      message: event.message,
      actor_email: actorEmail,
      actor_clerk_id: event.actorClerkId ?? null,
      target_resource: event.targetResource ?? null,
      metadata: event.metadata ?? {},
    })
    if (error) {
      logDbError('audit_log.insert', error, { eventType: event.eventType })
    }
  } catch (error) {
    // Logging must never throw — swallow and warn so caller flow
    // proceeds unaffected.
    logDbError('audit_log.insert', error, { eventType: event.eventType })
  }
}

// Convenience wrappers for the most common shapes — keeps call sites
// terse and consistent so the dashboard can filter by event_type.

export function auditPermissionDenied(
  permission: string,
  actorEmail: string | null,
  reason: string,
): Promise<void> {
  return recordAuditEvent({
    eventType: 'auth.permission_denied',
    severity: 'critical',
    message: `Denied: ${permission}`,
    actorEmail,
    metadata: { permission, reason },
  })
}

export function auditInviteFailed(
  email: string,
  reason: string,
): Promise<void> {
  return recordAuditEvent({
    eventType: 'workforce.invite_failed',
    severity: 'error',
    message: `Invite to ${email} failed`,
    targetResource: `workforce_invitations:email=${email}`,
    metadata: { email, reason },
  })
}

export function auditWhitelistChange(
  email: string,
  action: 'enabled' | 'disabled' | 'role_changed',
  detail: Record<string, unknown> = {},
): Promise<void> {
  return recordAuditEvent({
    eventType: `auth.whitelist_${action}`,
    severity: action === 'disabled' ? 'warn' : 'info',
    message: `Whitelist ${action.replace('_', ' ')}: ${email}`,
    targetResource: `admin_whitelist:email=${email}`,
    metadata: { email, ...detail },
  })
}
