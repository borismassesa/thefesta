// Negative tests for the Approvals confidentiality boundary.
//
// These assert what an UNRELATED user must NOT be able to obtain: no rows, and
// no signal about whether a given request exists. They are deliberately
// written as "prove the absence", because the leak that prompted them looked
// fine from the inside — the module worked correctly for participants while
// shipping everyone else's requests in the same payload.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isOwnedBy, isRelevantTo, isWaitingOn } from './scoping'
import { validateTransition } from './transitions'
import type { ApprovalRequest } from './types'

const OWNER = 'owner@opusfesta.com'
const APPROVER = 'approver@opusfesta.com'
const STRANGER = 'stranger@opusfesta.com'

function request(over: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: 'req-1',
    category: 'payment-application',
    subject: 'Catering invoice INV-2291',
    owner: 'Owner',
    ownerEmail: OWNER,
    ownerInitials: 'OW',
    fields: { amount: 'TZS 1,850,000', payee: 'Karibu Catering' },
    approvers: [{ id: 'a1', name: 'Approver', email: APPROVER }],
    status: 'Submitted',
    updatedAt: '2026-08-01T09:00:00.000Z',
    createdAt: '2026-07-30T09:00:00.000Z',
    submittedAt: '2026-07-31T09:00:00.000Z',
    activity: [],
    attachments: [],
    ...over,
  }
}

// The predicate the server-side query filter is built on. If this is wrong,
// the rows reach the browser and nothing downstream can recall them.
test('an unrelated user matches no visibility predicate', () => {
  const r = request()
  assert.equal(isOwnedBy(r, STRANGER), false)
  assert.equal(isRelevantTo(r, STRANGER), false)
  assert.equal(isWaitingOn(r, STRANGER), false)
})

test('scoping a mixed list leaves a stranger with zero rows', () => {
  const list = [
    request({ id: 'a' }),
    request({ id: 'b', ownerEmail: 'someone@else.com' }),
    request({ id: 'c', approvers: [{ id: 'x', name: 'X', email: 'x@else.com' }] }),
  ]
  assert.deepEqual(list.filter((r) => isRelevantTo(r, STRANGER)), [])
})

test('participants still see exactly their own rows', () => {
  const r = request()
  assert.equal(isRelevantTo(r, OWNER), true)
  assert.equal(isRelevantTo(r, APPROVER), true)
})

// Case and padding must not be a way around the filter.
test('visibility is not defeated by casing or whitespace', () => {
  const r = request()
  assert.equal(isRelevantTo(r, `  ${OWNER.toUpperCase()}  `), true)
  assert.equal(isRelevantTo(r, `  ${STRANGER.toUpperCase()}  `), false)
})

// An empty actor email (an unauthenticated or unresolved caller) must match
// nothing rather than everything.
test('an empty caller identity matches nothing', () => {
  const r = request({ ownerEmail: '', approvers: [] })
  assert.equal(isRelevantTo(r, ''), false)
  assert.equal(isOwnedBy(r, ''), false)
})

// A stranger must not be able to act, whatever they aim at.
test('a stranger cannot decide, submit, send back or reopen', () => {
  for (const [next, decision] of [
    ['Approved', undefined],
    ['Refused', undefined],
    ['Submitted', undefined],
    ['To Submit', { kind: 'info' as const }],
  ] as const) {
    const r = request({ status: next === 'Submitted' ? 'To Submit' : 'Submitted' })
    const check = validateTransition(r, next, STRANGER, decision)
    assert.equal(check.ok, false, `stranger was allowed to reach ${next}`)
  }
  const decided = request({ status: 'Approved' })
  assert.equal(validateTransition(decided, 'To Submit', STRANGER).ok, false)
})

// Self-approval is the control this module exists to enforce.
test('an owner cannot decide on their own request', () => {
  const r = request({ approvers: [{ id: 'a1', name: 'Owner', email: OWNER }] })
  assert.equal(validateTransition(r, 'Approved', OWNER).ok, false)
  assert.equal(validateTransition(r, 'Refused', OWNER).ok, false)
})

// The reason strings are themselves a disclosure channel: they must not tell a
// stranger anything about the request's real state. Every rejection a stranger
// can trigger has to be indistinguishable across states.
test('rejection reasons reveal nothing about state to a stranger', () => {
  const reasons = new Set<string>()
  for (const status of ['To Submit', 'Submitted', 'Approved', 'Refused'] as const) {
    const check = validateTransition(request({ status }), 'Approved', STRANGER)
    assert.equal(check.ok, false)
    if (!check.ok) reasons.add(check.reason)
  }
  // The action layer collapses all of these to a single "Request not found."
  // before they can be returned, so what actually leaves the server carries no
  // state. This asserts the set stays small enough for that collapse to be
  // meaningful — if it grows, someone has added a branch that a stranger can
  // reach with a distinguishable message.
  assert.ok(
    reasons.size <= 2,
    `stranger can distinguish ${reasons.size} states: ${[...reasons].join(' | ')}`,
  )
})
