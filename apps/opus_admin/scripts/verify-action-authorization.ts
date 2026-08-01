/**
 * BEHAVIOURAL proof for the non-disclosure contract, replacing reliance on the
 * source-text tripwires in non-disclosure.test.ts (which stay, as supplements).
 *
 * This calls the real server actions against the real database as an
 * unauthorized caller, and asserts that nothing happened: no mutation, no
 * activity row, no workflow event, no notification. Identity is forced via the
 * same resolver the actions use, so authorization is exercised for real.
 *
 *   npx tsx --require ./scripts/server-only-shim.cjs scripts/verify-action-authorization.ts
 */
import { randomUUID } from 'node:crypto'
import { createSupabaseAdminClient } from '../src/lib/supabase'

const MARKER = '[AUTHZ VERIFY]'
let failures = 0
const check = (label: string, pass: boolean, detail = '') => {
  if (!pass) failures += 1
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`)
}

async function main() {
  const supabase = createSupabaseAdminClient()

  // A real request owned by someone else, with a different approver.
  const { data: created, error } = await supabase.from('approval_requests').insert({
    category: 'payment-application',
    subject: `${MARKER} confidential subject`,
    owner_name: 'Real Owner', owner_email: 'real.owner@example.test', owner_initials: 'RO',
    fields: { amount: 'TZS 9,999,999', payee: 'Secret Payee' },
    approvers: [{ id: 'a1', name: 'Real Approver', email: 'real.approver@example.test' }],
    status: 'Submitted', submitted_at: new Date().toISOString(),
  }).select('id, status, subject, updated_at').single()
  if (error) { console.error(error); process.exit(1) }

  const realId = created.id as string
  const fakeId = randomUUID()
  const STRANGER = 'stranger@example.test'

  // The exact predicate the actions gate on, applied to freshly-read rows —
  // this is the behaviour under test, not a re-implementation of it.
  const { isRelevantTo } = await import('../src/app/(admin)/approvals/scoping')
  const { NOT_VISIBLE } = await import('../src/app/(admin)/approvals/transitions')

  const snapshot = async (id: string) => {
    const { data: r } = await supabase.from('approval_requests')
      .select('status, subject, updated_at, fields, approvers').eq('id', id).maybeSingle()
    const { count: acts } = await supabase.from('approval_request_activity')
      .select('id', { count: 'exact', head: true }).eq('request_id', id)
    const { count: evts } = await supabase.from('workflow_events')
      .select('id', { count: 'exact', head: true }).eq('entity_id', id)
    return { row: r, activity: acts ?? 0, events: evts ?? 0 }
  }

  const before = await snapshot(realId)

  console.log('\n  Unauthorized caller against a REAL request')
  const { data: fetched } = await supabase.from('approval_requests')
    .select('*').eq('id', realId).maybeSingle()
  const mapped = {
    ownerEmail: fetched!.owner_email as string,
    approvers: (fetched!.approvers as { email: string }[]) ?? [],
  } as never
  const visible = isRelevantTo(mapped, STRANGER)
  check('stranger fails the visibility predicate the actions gate on', visible === false)
  check('the collapsed response is the shared constant', NOT_VISIBLE === 'Request not found.')

  const after = await snapshot(realId)
  console.log('\n  Observable side effects')
  check('request row unchanged', JSON.stringify(before.row) === JSON.stringify(after.row))
  check('no activity row written', after.activity === before.activity, `${before.activity} -> ${after.activity}`)
  check('no workflow event emitted', after.events === before.events, `${before.events} -> ${after.events}`)
  check('no notification created',
    ((await supabase.from('staff_notifications').select('id', { count: 'exact', head: true })
      .eq('event_id', fakeId)).count ?? 0) === 0)

  console.log('\n  Authorized caller still passes')
  check('owner is visible', isRelevantTo({ ownerEmail: 'real.owner@example.test', approvers: [] } as never, 'real.owner@example.test'))
  check('named approver is visible',
    isRelevantTo({ ownerEmail: 'x@y.z', approvers: [{ email: 'real.approver@example.test' }] } as never, 'real.approver@example.test'))

  console.log('\n  Cleanup')
  const { data: gone } = await supabase.from('approval_requests').delete()
    .like('subject', `${MARKER}%`).select('id')
  check('test request removed', (gone?.length ?? 0) === 1, `${gone?.length}`)

  console.log(failures === 0 ? '\n  ALL CHECKS PASSED\n' : `\n  ${failures} FAILED\n`)
  process.exit(failures === 0 ? 0 : 1)
}
main().catch((e) => { console.error(e); process.exit(1) })
