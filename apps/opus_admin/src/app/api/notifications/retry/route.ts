import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/supabase'
import { isEmailConfigured, sendEmail } from '@/lib/email'
import {
  isWorkflowEventType,
  parseEmailPayload,
  renderNotificationEmail,
} from '@/lib/notifications/render'
import {
  MAX_ATTEMPTS,
  classifyFailure,
  type PermanentFailure,
} from '@/lib/notifications/retry'
import { errorKind, logDbError, maskEmail } from '@/lib/log-safe'

// Drains the staff-notification email queue.
//
// WHY THIS EXISTS
// emit.ts was written around the idea that a notification is an *obligation*:
// when a decision is made, the row is written before the provider is called,
// the render payload is persisted alongside it, and a failed send lands in
// 'failed' with a next_attempt_at rather than being lost. Its comments refer
// throughout to "the retry worker", and claim_notification_emails() was added
// to the schema for it.
//
// The worker was never written. Nothing in the app called that function, so
// every obligation the emitter recorded for later was recorded and then
// ignored: if Resend was down or unconfigured when an approval was decided,
// the approver was simply never told, and the row sat in 'pending' forever.
// This closes that half of the design.
//
// Triggered by pg_cron via pg_net (see the accompanying migration), and
// protected by a shared secret exactly like /api/md-tracker/nudge, so finding
// the URL is not enough to drive it.

export const runtime = 'nodejs'
// Delivery state must be read fresh on every invocation.
export const dynamic = 'force-dynamic'

// Kept modest deliberately. The claim is FOR UPDATE SKIP LOCKED, so two
// overlapping runs take disjoint work rather than racing; a smaller batch that
// finishes inside the request timeout beats a large one that gets killed
// halfway and leaves rows stranded in 'sending'.
const BATCH = 20

type ClaimedRow = {
  id: string
  event_id: string
  employee_id: string | null
  title: string
  attempt_count: number
}

type EventRow = {
  id: string
  event_type: string
  metadata: Record<string, unknown> | null
}

type EmployeeRow = { id: string; full_name: string; email: string }

export async function POST(request: NextRequest) {
  const secret = process.env.NOTIFICATION_RETRY_CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!hasSupabaseAdminConfig()) {
    return NextResponse.json({ error: 'Supabase admin env missing' }, { status: 503 })
  }
  if (!isEmailConfigured()) {
    // Nothing is claimed, so every row stays exactly as retryable as it was.
    // Claiming first would burn an attempt on a provider that cannot be called.
    return NextResponse.json({ ok: true, skipped: 'email provider unconfigured', claimed: 0 })
  }

  const supabase = createSupabaseAdminClient()

  // Atomically flips pending/failed -> sending and hands back the rows, so a
  // second worker (or an overlapping cron tick) cannot pick up the same
  // message. Anything that fails after this point must be written back to a
  // terminal or retryable state below, or it stays stuck in 'sending'.
  const { data: claimed, error: claimError } = await supabase
    .rpc('claim_notification_emails', { p_limit: BATCH, p_max_attempts: MAX_ATTEMPTS })
  if (claimError) {
    logDbError('notification_retry.claim', claimError)
    return NextResponse.json({ error: 'claim failed' }, { status: 500 })
  }
  // The generated types model this RPC as returning a single row; it is
  // declared RETURNS SETOF staff_notifications and always yields a set.
  const rows = (claimed ?? []) as unknown as ClaimedRow[]
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, claimed: 0, sent: 0, failed: 0, abandoned: 0 })
  }

  // One read for the batch rather than per row.
  const eventIds = [...new Set(rows.map((r) => r.event_id))]
  const { data: events } = await supabase
    .from('workflow_events')
    .select('id, event_type, metadata')
    .in('id', eventIds)
    .returns<EventRow[]>()
  const eventById = new Map((events ?? []).map((e) => [e.id, e]))

  const employeeIds = [...new Set(rows.map((r) => r.employee_id).filter(Boolean))] as string[]
  const { data: employees } = employeeIds.length
    ? await supabase
        .from('workforce_employees')
        .select('id, full_name, email')
        .in('id', employeeIds)
        .returns<EmployeeRow[]>()
    : { data: [] as EmployeeRow[] }
  const employeeById = new Map((employees ?? []).map((e) => [e.id, e]))

  let sent = 0
  let failed = 0
  let abandoned = 0

  for (const row of rows) {
    // 'abandoned' is terminal: the row is no longer claimable, so a
    // permanently unrenderable message stops consuming the queue forever.
    // Distinct from 'failed', which is a provider problem and stays retryable.
    const abandon = async (reason: PermanentFailure) => {
      abandoned += 1
      await supabase
        .from('staff_notifications')
        .update({ delivery_status: 'abandoned', last_error: reason, next_attempt_at: null })
        .eq('id', row.id)
    }

    const event = eventById.get(row.event_id)
    if (!event || !isWorkflowEventType(event.event_type)) {
      await abandon('EVENT_MISSING_OR_UNKNOWN_TYPE')
      continue
    }
    const payload = parseEmailPayload(event.metadata?.email_payload)
    if (!payload) {
      // Recorded before emit.ts always persisted the payload, or written by a
      // version whose shape no longer parses. Nothing can render it, so no
      // number of retries will help.
      await abandon('PAYLOAD_UNRENDERABLE')
      continue
    }

    const employee = row.employee_id ? employeeById.get(row.employee_id) : null
    if (!employee?.email) {
      await abandon('RECIPIENT_UNRESOLVED')
      continue
    }

    // Same registry the inline send uses, so a retried message is
    // byte-identical to the one that would have gone out originally. An event
    // type with no email template can never be sent, so retrying it forever
    // would be a queue that never drains — abandon it once, explicitly.
    const email = renderNotificationEmail(event.event_type, payload, {
      name: employee.full_name,
      email: employee.email,
    })
    if (!email) {
      await abandon('NO_EMAIL_TEMPLATE')
      continue
    }

    try {
      const result = await sendEmail({
        to: employee.email,
        subject: email.subject,
        text: email.text,
        html: email.html,
      })

      if (result.sent) {
        sent += 1
        await supabase
          .from('staff_notifications')
          .update({
            delivery_status: 'sent',
            sent_at: new Date().toISOString(),
            last_error: null,
            next_attempt_at: null,
          })
          .eq('id', row.id)
      } else {
        const reason = errorKind(result.error ?? result.reason)
        const outcome = classifyFailure(row.attempt_count, Date.now())
        // Counted by what actually happened. A row at the attempt ceiling is
        // retired, not merely failed, and a metric that called it 'failed'
        // would make a permanently dropped notification look transient.
        if (outcome.status === 'abandoned') abandoned += 1
        else failed += 1
        await supabase
          .from('staff_notifications')
          .update({
            delivery_status: outcome.status,
            last_error: reason,
            next_attempt_at: outcome.nextAttemptAt,
          })
          .eq('id', row.id)
        console.warn('[notifications] retry failed', {
          id: row.id,
          to: maskEmail(employee.email),
          attempt: row.attempt_count,
          reason,
        })
      }
    } catch (err) {
      // A throw here would abandon the rest of the batch in 'sending'. Catch
      // per row so one bad message cannot stall the queue.
      const reason = errorKind(err)
      const outcome = classifyFailure(row.attempt_count, Date.now())
      if (outcome.status === 'abandoned') abandoned += 1
      else failed += 1
      await supabase
        .from('staff_notifications')
        .update({
          delivery_status: outcome.status,
          last_error: reason,
          next_attempt_at: outcome.nextAttemptAt,
        })
        .eq('id', row.id)
      console.warn('[notifications] retry threw', { id: row.id, reason })
    }
  }

  // Counts only. No addresses, no subjects: this response is a cron result,
  // and the queue's contents are participant-scoped.
  return NextResponse.json({ ok: true, claimed: rows.length, sent, failed, abandoned })
}
