import assert from 'node:assert/strict'
import test from 'node:test'
import { assessRosterDelivery, resolveSendEligibility } from './guest-delivery'
import { toIdentity, type GuestIdentity } from './guest-duplicates'

function guest(
  name: string,
  phone: string | null,
  id: string,
  shared?: { group: string; confirmed: boolean },
): GuestIdentity {
  return toIdentity({
    id,
    full_name: name,
    phone,
    whatsapp_phone: phone,
    shared_contact_group_id: shared?.group ?? null,
    shared_contact_confirmed: shared?.confirmed ?? false,
  })
}

test('a clean guest is deliverable', () => {
  const status = assessRosterDelivery([guest('Joyce Nkembo', '0784310065', 'g1')]).get('g1')!
  assert.equal(status.deliverable, true)
  assert.equal(status.reason, null)
  assert.deepEqual(status.sharesNumberWith, [])
})

test('a guest with no number cannot be sent to', () => {
  const status = assessRosterDelivery([guest('Joel', null, 'g1')]).get('g1')!
  assert.equal(status.deliverable, false)
  assert.equal(status.reason, 'missing_phone')
  assert.match(status.detail, /Add one before sending/)
})

test('a malformed number cannot be sent to', () => {
  const status = assessRosterDelivery([guest('Bad Number', '12345', 'g1')]).get('g1')!
  assert.equal(status.deliverable, false)
  assert.equal(status.reason, 'invalid_phone')
})

test('the live unresolved pair is NOT deliverable', () => {
  // Mama Meena and Mr & Mrs Msuya both hold 255766241854 under a group parked
  // pending a coordinator decision. Before this gate existed, a bulk send
  // produced two paid messages to that one handset.
  const roster = [
    guest('Mama Meena', '0766241854', 'g1', { group: 'grp-1', confirmed: false }),
    guest('Mr & Mrs Msuya', '0766241854', 'g2', { group: 'grp-1', confirmed: false }),
  ]
  const assessed = assessRosterDelivery(roster)
  for (const id of ['g1', 'g2']) {
    const status = assessed.get(id)!
    assert.equal(status.deliverable, false, `${status.name} must not be deliverable`)
    assert.equal(status.reason, 'unresolved_duplicate')
    assert.match(status.detail, /Confirm or correct before sending/)
  }
  assert.deepEqual(assessed.get('g1')!.sharesNumberWith, ['Mr & Mrs Msuya'])
})

test('an unflagged duplicate is not deliverable either', () => {
  // No group id at all — the pre-index state. Still must not send twice.
  const roster = [guest('Robert Munisi', '0757200767', 'g1'), guest('Mr & Mrs Lameck', '+255757200767', 'g2')]
  const assessed = assessRosterDelivery(roster)
  assert.equal(assessed.get('g1')!.reason, 'unresolved_duplicate')
  assert.equal(assessed.get('g2')!.reason, 'unresolved_duplicate')
})

test('a confirmed shared contact IS deliverable, and says how many messages', () => {
  const roster = [
    guest('Mama Meena', '0766241854', 'g1', { group: 'grp-1', confirmed: true }),
    guest('Mr & Mrs Msuya', '0766241854', 'g2', { group: 'grp-1', confirmed: true }),
  ]
  const status = assessRosterDelivery(roster).get('g1')!
  assert.equal(status.deliverable, true)
  assert.match(status.detail, /receives 2 messages/)
})

test('confirming only one side does not make either deliverable', () => {
  const roster = [
    guest('Mama Meena', '0766241854', 'g1', { group: 'grp-1', confirmed: true }),
    guest('Mr & Mrs Msuya', '0766241854', 'g2', { group: 'grp-1', confirmed: false }),
  ]
  const assessed = assessRosterDelivery(roster)
  assert.equal(assessed.get('g1')!.deliverable, false)
  assert.equal(assessed.get('g2')!.deliverable, false)
})

test('guests without numbers are not duplicates of one another', () => {
  const roster = [guest('Joel', null, 'g1'), guest('Familia Aden', null, 'g2')]
  const assessed = assessRosterDelivery(roster)
  assert.equal(assessed.get('g1')!.reason, 'missing_phone')
  assert.deepEqual(assessed.get('g1')!.sharesNumberWith, [])
})

// ── Eligibility split ─────────────────────────────────────────────────────

test('a send names everyone it holds back', () => {
  const roster = [
    guest('Joyce Nkembo', '0784310065', 'g1'),
    guest('Joel', null, 'g2'),
    guest('Mama Meena', '0766241854', 'g3', { group: 'grp-1', confirmed: false }),
    guest('Mr & Mrs Msuya', '0766241854', 'g4', { group: 'grp-1', confirmed: false }),
  ]
  const result = resolveSendEligibility(['g1', 'g2', 'g3', 'g4'], assessRosterDelivery(roster))

  assert.deepEqual(result.eligible, ['g1'])
  assert.equal(result.skipped.length, 3)
  // Every skip carries a name and a reason — never a bare count.
  for (const s of result.skipped) {
    assert.ok(s.name, 'skipped guest must be named')
    assert.ok(s.detail, 'skipped guest must carry a reason')
  }
  assert.deepEqual(
    result.skipped.map((s) => s.reason).sort(),
    ['missing_phone', 'unresolved_duplicate', 'unresolved_duplicate'],
  )
})

test('a repeated recipient is surfaced with the cost it implies', () => {
  // Confirmed sharing sends twice by design — but the couple is told first.
  const roster = [
    guest('Mama Meena', '0766241854', 'g1', { group: 'grp-1', confirmed: true }),
    guest('Mr & Mrs Msuya', '0766241854', 'g2', { group: 'grp-1', confirmed: true }),
  ]
  const result = resolveSendEligibility(['g1', 'g2'], assessRosterDelivery(roster))
  assert.equal(result.eligible.length, 2)
  assert.equal(result.distinctNumbers, 1, '2 messages, 1 handset')
  assert.equal(result.repeatedRecipients.length, 1)
  assert.deepEqual(result.repeatedRecipients[0].guests, ['Mama Meena', 'Mr & Mrs Msuya'])
})

test('a clean send reports no repeated recipients', () => {
  const roster = [guest('Joyce Nkembo', '0784310065', 'g1'), guest('Mr & Mrs Ngando', '0762269228', 'g2')]
  const result = resolveSendEligibility(['g1', 'g2'], assessRosterDelivery(roster))
  assert.equal(result.eligible.length, 2)
  assert.equal(result.distinctNumbers, 2)
  assert.deepEqual(result.repeatedRecipients, [])
})

test('eligible and skipped account for every requested guest', () => {
  const roster = [guest('A', '0755000111', 'g1'), guest('B', null, 'g2'), guest('C', '0755000222', 'g3')]
  const ids = ['g1', 'g2', 'g3']
  const result = resolveSendEligibility(ids, assessRosterDelivery(roster))
  assert.equal(result.eligible.length + result.skipped.length, ids.length)
})
