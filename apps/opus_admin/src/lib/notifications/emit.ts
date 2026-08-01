import 'server-only'

import { createSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/supabase'
import { resolvePreference, type PreferenceRow } from './preferences'
import { renderNotificationEmail, type PersistedEmailPayload, type RenderedEmail } from './render'
import { EVENT_PRESENTATION, type WorkflowEventType } from './types'
import { dbErrorCode, errorKind, logDbError, maskEmail } from '@/lib/log-safe'

// The fan-out. A module records what happened and hands over a recipient
// list; this decides who hears about it and through which channel.
//
// Two rules the callers depend on:
//
//  1. EMITTING NEVER THROWS INTO THE CALLER. A notification failure must not
//     roll back or fail an approval that has already been decided. Errors are
//     logged and returned in the summary; the caller carries on.
//  2. The row is written before the email is attempted, and is claimed
//     ('sending') by this request so a retry worker cannot race it. If the
//     provider is down the row lands in 'failed' with next_attempt_at set,
//     so the message is *owed* rather than lost. See
//     claim_notification_emails() in the migration for the worker side.

export type NotificationRecipient = {
  // workforce_employees.id. Null for a recipient we can only reach by email
  // (an approver on the static roster who has no employee row yet) — they
  // get email only, since the bell has nowhere to render.
  employeeId: string | null
  name: string
  email: string
}

export type EmitInput = {
  entityType: string
  entityId: string
  eventType: WorkflowEventType
  actor: { employeeId: string | null; name: string }
  recipients: NotificationRecipient[]
  title: string
  body?: string | null
  href?: string | null
  metadata?: Record<string, unknown>
  // Everything needed to render this event's email, for any recipient, at any
  // later time. Persisted into the event's metadata so the retry worker can
  // reproduce the exact message — see render.ts. Omit to record the event and
  // the bell entries without sending anything.
  emailPayload?: PersistedEmailPayload
  sendEmail?: (to: string, email: RenderedEmail) => Promise<
    { sent: true } | { sent: false; error: string }
  >
  // Optional observability hook. Never used in the request path.
  trace?: FanoutTrace
}

// Stable reason codes for each decision point in the fan-out. Purely
// observational: the trace hook changes no behaviour, and carries no approval
// content and no recipient PII — only a channel, an opaque employee id and a
// code. Consumed by scripts/verify-notification-fanout.ts so every expected
// obligation can be shown to reach exactly one terminal outcome.
export type FanoutReason =
  | 'candidate_created'
  | 'recipient_excluded'
  | 'channel_disabled'
  | 'template_missing'
  | 'payload_invalid'
  | 'deduplicated'
  | 'obligation_written'
  | 'provider_skipped'
  | 'provider_failed'

export type FanoutTrace = (entry: {
  reason: FanoutReason
  channel: 'bell' | 'email' | null
  employeeId: string | null
}) => void

export type EmitSummary = {
  eventId: string | null
  bellCreated: number
  emailsSent: number
  emailsFailed: number
  // Obligations recorded but not attempted because no provider was configured.
  // Distinct from failed: nothing was tried, and the row stays retryable.
  emailsDeferred: number
  errors: string[]
}

// Sanitized, stable marker for "the obligation exists but there was no
// provider to attempt it". Not an error from anywhere — a state of ours.
export const PROVIDER_UNCONFIGURED = 'EMAIL_PROVIDER_UNCONFIGURED'

const EMPTY: EmitSummary = {
  eventId: null,
  bellCreated: 0,
  emailsSent: 0,
  emailsFailed: 0,
  emailsDeferred: 0,
  errors: [],
}

export async function emitWorkflowEvent(input: EmitInput): Promise<EmitSummary> {
  if (!hasSupabaseAdminConfig()) {
    console.warn('[notifications] skipped: Supabase admin env is missing')
    return EMPTY
  }

  const summary: EmitSummary = { ...EMPTY, errors: [] }
  const supabase = createSupabaseAdminClient()
  const { category, priority } = EVENT_PRESENTATION[input.eventType]

  // ---- 1. Record the event -------------------------------------------------
  const { data: event, error: eventError } = await supabase
    .from('workflow_events')
    .insert({
      entity_type: input.entityType,
      entity_id: input.entityId,
      event_type: input.eventType,
      actor_employee_id: input.actor.employeeId,
      actor_name: input.actor.name || 'System',
      // The render payload rides in metadata so a worker picking this up in an
      // hour can rebuild the same email. Without it, a claimed row is a row
      // nobody can send.
      metadata: {
        ...(input.metadata ?? {}),
        ...(input.emailPayload ? { email_payload: input.emailPayload } : {}),
      },
    })
    .select('id')
    .single<{ id: string }>()

  if (eventError || !event) {
    // Without an event row there is nothing to hang notifications off, so
    // this is the one place we stop early. Still no throw.
    logDbError('workflow_event.insert', eventError, { entityType: input.entityType })
    summary.errors.push(`event: ${dbErrorCode(eventError)}`)
    return summary
  }
  summary.eventId = event.id
  const trace: FanoutTrace = input.trace ?? (() => {})
  trace({ reason: 'candidate_created', channel: null, employeeId: null })

  // ---- 2. Resolve preferences ---------------------------------------------
  const employeeIds = input.recipients
    .map((r) => r.employeeId)
    .filter((id): id is string => Boolean(id))

  let preferences: PreferenceRow[] = []
  if (employeeIds.length > 0) {
    const { data, error } = await supabase
      .from('staff_notification_preferences')
      .select('*')
      .in('employee_id', employeeIds)
      .returns<PreferenceRow[]>()
    if (error) {
      // Fail open. A preference lookup that errors must not silence an
      // approval request — the whole point of this table is to stop
      // notifications going missing.
      logDbError('notification_preferences.lookup', error)
      summary.errors.push(`preferences: ${dbErrorCode(error)}`)
    } else {
      preferences = data ?? []
    }
  }

  // ---- 3. Bell rows --------------------------------------------------------
  for (const r of input.recipients.filter((r) => !r.employeeId)) {
    // No employee row means nowhere to render a bell entry.
    trace({ reason: 'recipient_excluded', channel: 'bell', employeeId: null })
    void r
  }
  const bellRows = input.recipients
    .filter((r) => r.employeeId)
    .map((r) => ({
      recipient: r,
      decision: resolvePreference(preferences, r.employeeId!, input.eventType, 'bell', priority),
    }))
    .filter(({ recipient, decision }) => {
      if (!decision.deliver) {
        trace({ reason: 'channel_disabled', channel: 'bell', employeeId: recipient.employeeId })
      }
      return decision.deliver
    })
    .map(({ recipient, decision }) => ({
      employee_id: recipient.employeeId!,
      event_id: event.id,
      channel: 'bell' as const,
      category,
      priority,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
      preference_bypassed: decision.bypassed,
      bypass_reason: decision.bypassReason,
      // Nothing to deliver for a bell entry — it exists the moment it is
      // written, which the CHECK constraint on the table also requires.
      delivery_status: 'sent' as const,
      sent_at: new Date().toISOString(),
    }))

  if (bellRows.length > 0) {
    // Idempotent on (event_id, employee_id, channel) so a retried server
    // action cannot double-notify.
    const { error, count } = await supabase
      .from('staff_notifications')
      .upsert(bellRows, { onConflict: 'event_id,employee_id,channel', ignoreDuplicates: true, count: 'exact' })
    if (error) {
      logDbError('staff_notification.insert_bell', error, { eventId: event.id })
      summary.errors.push(`bell: ${dbErrorCode(error)}`)
    } else {
      summary.bellCreated = count ?? bellRows.length
    }
  }

  // ---- 4. Email ------------------------------------------------------------
  const payload = input.emailPayload
  if (!payload) {
    // No render payload: a row nobody could ever send.
    for (const r of input.recipients) {
      trace({ reason: 'template_missing', channel: 'email', employeeId: r.employeeId })
    }
    return summary
  }

  const emailRecipients = input.recipients.filter(
    (r) =>
      // A recipient with no employee row has no preferences to consult.
      !r.employeeId ||
      resolvePreference(preferences, r.employeeId, input.eventType, 'email', priority).deliver,
  )

  // INVARIANT: provider availability must never determine whether an
  // obligation is recorded. The obligation is the business fact "this person
  // must be told"; whether Resend happens to be configured right now is an
  // operational detail. The previous code returned here when no sender was
  // injected, so an unconfigured provider produced approvals that notified
  // nobody with no record that anything was owed — the exact silent loss this
  // subsystem exists to prevent.
  const hasSender = typeof input.sendEmail === 'function'

  for (const recipient of emailRecipients) {
    // Insert-only. On replay the existing row is left completely untouched:
    // an upsert that overwrote delivery_status would re-arm an already-sent
    // obligation and cause a duplicate send.
    const base = {
      employee_id: recipient.employeeId,
      event_id: event.id,
      channel: 'email' as const,
      category,
      priority,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
    }
    const { data: inserted, error: rowError } = await supabase
      .from('staff_notifications')
      .upsert(
        hasSender
          ? {
              ...base,
              // Claimed by this request: the send is attempted inline, so a
              // worker must not pick it up concurrently.
              delivery_status: 'sending',
              attempt_count: 1,
              last_attempt_at: new Date().toISOString(),
            }
          : {
              ...base,
              // Retryable, never permanently failed. attempt_count stays 0 so
              // no retry budget is consumed by a provider that was simply
              // absent, and next_attempt_at stays null so the row is eligible
              // the moment a worker runs with a provider configured.
              delivery_status: 'pending',
              attempt_count: 0,
              last_attempt_at: null,
              next_attempt_at: null,
              last_error: PROVIDER_UNCONFIGURED,
            },
        { onConflict: 'event_id,employee_id,channel', ignoreDuplicates: true },
      )
      .select('id, delivery_status')
      .maybeSingle<{ id: string; delivery_status: string }>()

    if (rowError) {
      // employee_id is NOT NULL, so a roster-only recipient cannot have a
      // tracking row at all. Logged with the event id only.
      logDbError('staff_notification.delivery_row_missing', rowError, { eventId: event.id })
    }

    let row = inserted
    if (!row && recipient.employeeId) {
      // ignoreDuplicates returns nothing when the row already existed. This is
      // a replay: adopt the existing obligation without altering its state.
      const { data: existing } = await supabase
        .from('staff_notifications')
        .select('id, delivery_status')
        .eq('event_id', event.id)
        .eq('employee_id', recipient.employeeId)
        .eq('channel', 'email')
        .maybeSingle<{ id: string; delivery_status: string }>()
      row = existing
      trace({ reason: 'deduplicated', channel: 'email', employeeId: recipient.employeeId })
      // Already delivered, or in flight elsewhere — sending again here is the
      // duplicate-send this whole design is built to avoid.
      if (existing && (existing.delivery_status === 'sent' || existing.delivery_status === 'sending')) {
        continue
      }
    } else if (row) {
      trace({ reason: 'obligation_written', channel: 'email', employeeId: recipient.employeeId })
    }

    if (!hasSender) {
      // Obligation recorded, delivery deferred. Nothing is called.
      trace({ reason: 'provider_skipped', channel: 'email', employeeId: recipient.employeeId })
      summary.emailsDeferred += 1
      continue
    }

    try {
      // Rendered through the same registry the retry worker uses, so an
      // inline send and a retried send produce byte-identical email.
      const result = await input.sendEmail!(
        recipient.email,
        renderNotificationEmail(input.eventType, payload, recipient),
      )
      if (result.sent) {
        summary.emailsSent += 1
        if (row) {
          await supabase
            .from('staff_notifications')
            .update({
              delivery_status: 'sent',
              sent_at: new Date().toISOString(),
              last_error: null,
              next_attempt_at: null,
            })
            .eq('id', row.id)
        }
      } else {
        summary.emailsFailed += 1
        summary.errors.push(`${maskEmail(recipient.email)}: ${errorKind(result.error)}`)
        if (row) {
          // 'failed', not abandoned — the row stays claimable so a worker can
          // retry it. Backing off a minute avoids hammering a provider that
          // is briefly down.
          await supabase
            .from('staff_notifications')
            .update({
              delivery_status: 'failed',
              last_error: errorKind(result.error),
              next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
            })
            .eq('id', row.id)
        }
      }
    } catch (err) {
      summary.emailsFailed += 1
      summary.errors.push(`${maskEmail(recipient.email)}: ${errorKind(err)}`)
      if (row) {
        await supabase
          .from('staff_notifications')
          .update({
            delivery_status: 'failed',
            last_error: errorKind(err),
            next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
          })
          .eq('id', row.id)
      }
    }
  }

  return summary
}
