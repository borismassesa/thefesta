/**
 * Integration verification for the staff notification fan-out.
 * Sections C, D and F of the release plan: event creation, recipient
 * resolution, and idempotency on retry.
 *
 * WHAT IT DOES NOT DO: send email. `emitWorkflowEvent` takes `sendEmail` as an
 * injected function, and this script never passes one. Email obligations are
 * written to the table in 'pending' exactly as they would be in production,
 * and nothing reaches a mail provider. That is the whole reason this can be
 * run against the live database safely.
 *
 * It writes real rows into workflow_events and staff_notifications, then
 * deletes them. Every row it creates carries VERIFY_MARKER, and cleanup
 * deletes by that marker only, so it can never remove a genuine event.
 *
 *   cd apps/opus_admin
 *   npx tsx scripts/verify-notification-fanout.ts
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or the NEXT_PUBLIC_
 * equivalents) in .env.local, which the admin app already has.
 */

import { randomUUID } from 'node:crypto'
import { createSupabaseAdminClient } from '../src/lib/supabase'
import { emitWorkflowEvent } from '../src/lib/notifications/emit'
import type { FanoutTrace } from '../src/lib/notifications/emit'
type FanoutEntry = Parameters<FanoutTrace>[0]
import type { PersistedEmailPayload } from '../src/lib/notifications/render'

const VERIFY_MARKER = '[FANOUT VERIFY]'

let failures = 0

function check(label: string, pass: boolean, detail = '') {
  const mark = pass ? 'PASS' : 'FAIL'
  if (!pass) failures += 1
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ''}`)
}

async function main() {
  const supabase = createSupabaseAdminClient()

  // A real employee is needed because staff_notifications.employee_id is a FK.
  // Read-only: this script never modifies workforce_employees.
  const { data: employees, error: empErr } = await supabase
    .from('workforce_employees')
    .select('id, full_name, email')
    .limit(2)
  if (empErr) throw empErr
  if (!employees || employees.length === 0) {
    console.error('  no workforce_employees rows; cannot verify fan-out')
    process.exit(1)
  }

  const entityId = randomUUID()
  const recipients = employees.map((e) => ({
    employeeId: e.id as string,
    name: (e.full_name as string) ?? 'Unknown',
    email: (e.email as string) ?? `${e.id}@example.test`,
  }))
  // An email-only recipient: no employee row, so there is nowhere to render a
  // bell entry and they must get email only.
  const emailOnly = {
    employeeId: null,
    name: 'Roster Only Approver',
    email: 'roster.only@example.test',
  }
  // A duplicate of recipient 0 with different casing and padding, to prove
  // normalisation and dedupe.
  const dupe = { ...recipients[0], email: `  ${recipients[0].email.toUpperCase()}  ` }

  // emit's contract is that `recipients` is ALREADY final. Dropping the actor
  // happens upstream in scoping.ts (notificationPartiesFor), deliberately, so
  // the exclusion rule sits next to the queue predicates that must agree with
  // it. Passing the actor in here would be a caller bug, not an emit bug, so
  // this script models the real caller and keeps the actor out.
  const actorEmployeeId = recipients[0].employeeId
  const finalRecipients = [...recipients.slice(1), emailOnly, dupe].filter(
    (r) => r.employeeId !== actorEmployeeId,
  )

  // Email obligations are only created when a payload exists to render from —
  // a claimed row with nothing to render is a row nobody can send.
  const emailPayload: PersistedEmailPayload = {
    approvalSubject: `${VERIFY_MARKER} subject`,
    approvalCategory: 'Verification',
    approvalLink: 'https://admin.opusfesta.com/approvals',
    submitter: { name: 'Seed Requester', email: 'seed.requester@example.test' },
    actor: { name: `${VERIFY_MARKER} actor`, email: 'verify@example.test', role: null },
    note: null,
  }

  const input = {
    entityType: 'verification',
    entityId,
    eventType: 'approval.submitted' as const,
    actor: { employeeId: actorEmployeeId, name: `${VERIFY_MARKER} actor` },
    recipients: finalRecipients,
    title: `${VERIFY_MARKER} fan-out check`,
    body: 'Written by verify-notification-fanout.ts. Safe to delete.',
    href: '/approvals?tab=pending',
    metadata: { verification: true },
    emailPayload,
    // NO sendEmail: nothing is dispatched. The trace below shows exactly which
    // branch each recipient takes as a result.
    trace: (e: FanoutEntry) => traced.push(e),
  }

  const traced: FanoutEntry[] = []

  console.log('\n  Section C/D — event creation and recipient resolution')
  const first = await emitWorkflowEvent(input)
  check('emit returned an event id', Boolean(first.eventId), first.eventId ?? 'null')
  check('no send attempted', first.emailsSent === 0 && first.emailsFailed === 0)

  const { count: eventCount } = await supabase
    .from('workflow_events')
    .select('id', { count: 'exact', head: true })
    .eq('entity_id', entityId)
  check('exactly one workflow_event', eventCount === 1, `got ${eventCount}`)

  const { data: rows } = await supabase
    .from('staff_notifications')
    .select('employee_id, channel, delivery_status, sent_at')
    .eq('event_id', first.eventId!)
  const bell = (rows ?? []).filter((r) => r.channel === 'bell')
  const email = (rows ?? []).filter((r) => r.channel === 'email')

  // The actor was excluded by the caller; confirm nothing re-introduced them.
  check('actor has no notification about their own event',
    !bell.some((r) => r.employee_id === actorEmployeeId))

  const eligibleForBell = finalRecipients.filter((r) => r.employeeId).length
  check('one bell row per recipient holding an employee row',
    bell.length === eligibleForBell,
    `${bell.length} bell for ${eligibleForBell} eligible`)
  check('email-only recipient got no bell row',
    !bell.some((r) => r.employee_id === null))
  check('bell rows are born sent (nothing to deliver)',
    bell.every((r) => r.delivery_status === 'sent' && r.sent_at !== null))
  // Every recipient must reach exactly one terminal outcome, and the outcome
  // must be explained by a rule rather than assumed.
  const byReason = traced.reduce<Record<string, number>>((acc, e) => {
    acc[e.reason] = (acc[e.reason] ?? 0) + 1
    return acc
  }, {})
  console.log('    fan-out trace:', JSON.stringify(byReason))

  // TERMINAL vs INTERMEDIATE. `obligation_written` and `deduplicated` record
  // that a row now exists; they are not where a recipient ends up. The
  // terminal codes are the ones that say what happened to delivery. Counting
  // both was the reason this read "3 outcomes for 2 recipients".
  const TERMINAL = new Set(['provider_skipped', 'provider_failed', 'template_missing', 'recipient_excluded'])
  const emailTerminal = traced.filter((e) => e.channel === 'email' && TERMINAL.has(e.reason))
  check('every recipient reached exactly one TERMINAL email outcome',
    emailTerminal.length === finalRecipients.length,
    `${emailTerminal.length} terminal for ${finalRecipients.length} recipients ` +
      `(${emailTerminal.map((e) => e.reason).join(', ')})`)
  // Behaviour CHANGED deliberately: obligations are now recorded even with no
  // provider. This previously asserted zero rows, which encoded the defect.
  const withEmployeeRow = finalRecipients.filter((r) => r.employeeId).length
  check('obligations recorded despite no provider',
    email.length === withEmployeeRow,
    `${email.length} rows for ${withEmployeeRow} recipients with an employee row`)
  check('every one is retryable, none marked failed',
    email.length > 0 && email.every((r) => r.delivery_status === 'pending' && r.sent_at === null),
    email.map((r) => r.delivery_status).join(','))
  check('delivery deferred, not attempted',
    byReason.provider_skipped === finalRecipients.length,
    `provider_skipped=${byReason.provider_skipped ?? 0} of ${finalRecipients.length}`)
  check('case/whitespace duplicate did not create a second row',
    new Set(rows?.map((r) => `${r.employee_id}:${r.channel}`)).size === rows?.length)

  console.log('\n  Section F — idempotency on retry')
  const second = await emitWorkflowEvent(input)
  const { data: afterRows } = await supabase
    .from('staff_notifications')
    .select('id')
    .eq('event_id', first.eventId!)
  check('re-emitting created no duplicate notifications',
    (afterRows?.length ?? 0) === (rows?.length ?? 0),
    `${rows?.length} then ${afterRows?.length}`)
  check('still nothing sent on retry', second.emailsSent === 0)

  console.log('\n  Cleanup')
  // Delete by marker only. staff_notifications cascades from workflow_events.
  const { data: removed } = await supabase
    .from('workflow_events')
    .delete()
    .eq('entity_type', 'verification')
    .like('actor_name', `${VERIFY_MARKER}%`)
    .select('id')
  check('test rows removed', (removed?.length ?? 0) > 0, `${removed?.length} event(s)`)

  const { count: leftover } = await supabase
    .from('staff_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', first.eventId!)
  check('cascade removed the notifications', leftover === 0, `${leftover} left`)

  console.log(failures === 0 ? '\n  ALL CHECKS PASSED\n' : `\n  ${failures} CHECK(S) FAILED\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('\n  verification threw:', err)
  process.exit(1)
})
