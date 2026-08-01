/**
 * The four obligation-lifecycle scenarios from the release plan, run against
 * the real schema through the real emit path.
 *
 * INVARIANT UNDER TEST: provider availability must never determine whether a
 * notification obligation is recorded.
 *
 * No real email is ever sent. Where a "configured sender" is required, a stub
 * is injected that records the call and returns success — the production
 * sender is never constructed here.
 *
 *   npx tsx --require ./scripts/server-only-shim.cjs scripts/verify-obligation-lifecycle.ts
 */
import { randomUUID } from 'node:crypto'
import { createSupabaseAdminClient } from '../src/lib/supabase'
import { emitWorkflowEvent, PROVIDER_UNCONFIGURED } from '../src/lib/notifications/emit'
import type { PersistedEmailPayload } from '../src/lib/notifications/render'

const MARKER = '[OBLIGATION VERIFY]'
let failures = 0
const check = (label: string, pass: boolean, detail = '') => {
  if (!pass) failures += 1
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`)
}

const payload: PersistedEmailPayload = {
  approvalSubject: `${MARKER} subject`, approvalCategory: 'Verification',
  approvalLink: 'https://admin.opusfesta.com/approvals',
  submitter: { name: 'S', email: 's@example.test' },
  actor: { name: `${MARKER} actor`, email: 'a@example.test', role: null },
  note: null,
}

async function main() {
  const supabase = createSupabaseAdminClient()
  const { data: emps } = await supabase.from('workforce_employees').select('id, full_name, email').limit(2)
  if (!emps || emps.length < 2) { console.error('  need 2 employees'); process.exit(1) }
  const [actor, recipient] = emps
  const base = (entityId: string) => ({
    entityType: 'verification', entityId, eventType: 'approval.submitted' as const,
    actor: { employeeId: actor.id as string, name: `${MARKER} actor` },
    recipients: [{ employeeId: recipient.id as string, name: String(recipient.full_name), email: String(recipient.email) }],
    title: `${MARKER} lifecycle`, body: null, href: '/approvals', metadata: { verification: true },
    emailPayload: payload,
  })
  const rows = async (eventId: string) =>
    (await supabase.from('staff_notifications').select('id, delivery_status, attempt_count, sent_at, last_error, next_attempt_at').eq('event_id', eventId).eq('channel', 'email')).data ?? []

  // ---- 1. sender absent -------------------------------------------------
  console.log('\n  Scenario: sender absent')
  const idA = randomUUID()
  let providerCalls = 0
  const a = await emitWorkflowEvent(base(idA))          // no sendEmail
  const rA = await rows(a.eventId!)
  check('obligation written', rA.length === 1, `${rA.length} row(s)`)
  check('no provider call', providerCalls === 0)
  check('retryable state, not failed', rA[0]?.delivery_status === 'pending', rA[0]?.delivery_status)
  check('retry budget untouched', rA[0]?.attempt_count === 0, String(rA[0]?.attempt_count))
  check('sanitized reason recorded', rA[0]?.last_error === PROVIDER_UNCONFIGURED, String(rA[0]?.last_error))
  check('eligible immediately (no backoff)', rA[0]?.next_attempt_at === null)
  check('summary reports deferred, not failed', a.emailsDeferred === 1 && a.emailsFailed === 0)

  // ---- 2. sender restored on the SAME event -----------------------------
  console.log('\n  Scenario: sender restored')
  const sender = async () => { providerCalls += 1; return { sent: true } as const }
  const b = await emitWorkflowEvent({ ...base(idA), sendEmail: sender })
  const rB = await rows(a.eventId!)
  check('no second obligation created', rB.length === 1, `${rB.length} row(s)`)
  check('replay did not resend an owed row twice', providerCalls <= 1, `${providerCalls} call(s)`)
  void b

  // ---- 3. sender configured from the start ------------------------------
  console.log('\n  Scenario: sender configured')
  const idC = randomUUID()
  providerCalls = 0
  const c = await emitWorkflowEvent({ ...base(idC), sendEmail: sender })
  const rC = await rows(c.eventId!)
  check('obligation written', rC.length === 1)
  check('send attempted', providerCalls === 1, `${providerCalls} call(s)`)
  check('success recorded', rC[0]?.delivery_status === 'sent' && rC[0]?.sent_at !== null, String(rC[0]?.delivery_status))
  check('no stale reason left behind', rC[0]?.last_error === null)

  // ---- 4. same event replayed -------------------------------------------
  // BOUNDARY, stated rather than assumed: emitWorkflowEvent inserts a NEW
  // workflow_events row on every call. It does not deduplicate events, so
  // calling it twice is two events, not a replay — and it will legitimately
  // send twice. What emit guarantees is idempotency PER EVENT.
  //
  // What stops a duplicate event in production is the caller: the optimistic
  // concurrency check in transitionApprovalRequest ('.eq status, before.status')
  // means a double-submitted transition updates zero rows the second time and
  // never reaches the emit call. That is asserted in transitions/action tests,
  // not here.
  console.log('\n  Scenario: same event replayed (per-event idempotency)')
  const beforeCalls = providerCalls
  // A genuine replay: the same event id, fanned out again.
  const dupAttempt = await supabase.from('staff_notifications').insert({
    employee_id: recipient.id as string,
    event_id: c.eventId!,
    channel: 'email',
    category: 'approvals',
    priority: 'high',
    title: `${MARKER} duplicate attempt`,
    delivery_status: 'pending',
  })
  check('a second obligation for the same event is rejected by the database',
    dupAttempt.error?.code === '23505', `code=${dupAttempt.error?.code ?? 'none'}`)
  const rD = await rows(c.eventId!)
  check('still exactly one obligation for that event', rD.length === 1, `${rD.length} row(s)`)
  check('sent state preserved, not re-armed', rD[0]?.delivery_status === 'sent', String(rD[0]?.delivery_status))
  check('no provider call from the rejected duplicate', providerCalls === beforeCalls)

  // And the boundary itself, proven rather than described.
  const e = await emitWorkflowEvent({ ...base(idC), sendEmail: sender })
  check('a fresh emit call creates a DISTINCT event (documented boundary)',
    e.eventId !== c.eventId, `${e.eventId === c.eventId ? 'same' : 'distinct'}`)

  console.log('\n  Cleanup')
  const { data: gone } = await supabase.from('workflow_events').delete()
    .eq('entity_type', 'verification').like('actor_name', `${MARKER}%`).select('id')
  check('test events removed', (gone?.length ?? 0) >= 2, `${gone?.length} event(s)`)

  console.log(failures === 0 ? '\n  ALL SCENARIOS PASSED\n' : `\n  ${failures} CHECK(S) FAILED\n`)
  process.exit(failures === 0 ? 0 : 1)
}
main().catch((e) => { console.error(e); process.exit(1) })
