import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isOwnedBy,
  isRelevantTo,
  isWaitingOn,
  notificationPartiesFor,
} from './scoping'
import type { ApprovalRequest, ApprovalStatus } from './types'

const ALICE = 'alice@opusfesta.com'
const BOB = 'bob@opusfesta.com'
const CAROL = 'carol@opusfesta.com'

function req(over: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: 'r1',
    category: 'business-trip',
    subject: 'Mwanza vendor visit',
    owner: 'Alice',
    ownerEmail: ALICE,
    ownerInitials: 'AL',
    fields: {},
    approvers: [{ id: 'app_bob', name: 'Bob', email: BOB }],
    status: 'Submitted' as ApprovalStatus,
    updatedAt: '2026-08-01T09:00:00Z',
    createdAt: '2026-07-31T09:00:00Z',
    submittedAt: '2026-07-31T10:00:00Z',
    activity: [],
    attachments: [],
    ...over,
  }
}

describe('isWaitingOn — self-approval guard', () => {
  it('is true for a named approver on a submitted request', () => {
    assert.equal(isWaitingOn(req(), BOB), true)
  })

  it('is false for the owner even when they are also an approver', () => {
    // The case that matters: nothing in the picker stops someone adding
    // themselves, so the queue has to refuse it.
    const r = req({ approvers: [{ id: 'app_alice', name: 'Alice', email: ALICE }] })
    assert.equal(isApproverOnAlice(r), true)
    assert.equal(isWaitingOn(r, ALICE), false)
  })

  it('is false for the owner when they are one of several approvers', () => {
    const r = req({
      approvers: [
        { id: 'app_alice', name: 'Alice', email: ALICE },
        { id: 'app_bob', name: 'Bob', email: BOB },
      ],
    })
    assert.equal(isWaitingOn(r, ALICE), false)
    assert.equal(isWaitingOn(r, BOB), true)
  })

  it('is false for anyone not named as an approver', () => {
    assert.equal(isWaitingOn(req(), CAROL), false)
  })

  it('is false unless the request is Submitted', () => {
    for (const status of ['To Submit', 'Approved', 'Refused'] as ApprovalStatus[]) {
      assert.equal(isWaitingOn(req({ status }), BOB), false, status)
    }
  })

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    assert.equal(isWaitingOn(req(), '  BOB@OpusFesta.com '), true)
  })

  it('never matches an empty email', () => {
    // A signed-in account with no resolvable email must not inherit
    // every request whose approver email is also blank.
    const r = req({ ownerEmail: '', approvers: [{ id: 'x', name: 'X', email: '' }] })
    assert.equal(isWaitingOn(r, ''), false)
    assert.equal(isOwnedBy(r, ''), false)
  })
})

function isApproverOnAlice(r: ApprovalRequest): boolean {
  return r.approvers.some((a) => a.email === ALICE)
}

describe('isRelevantTo', () => {
  it('includes requests I raised and requests routed to me', () => {
    assert.equal(isRelevantTo(req(), ALICE), true)
    assert.equal(isRelevantTo(req(), BOB), true)
  })

  it('excludes requests that are neither mine nor routed to me', () => {
    assert.equal(isRelevantTo(req(), CAROL), false)
  })
})

describe('notificationPartiesFor', () => {
  it('routes a submission to the approvers', () => {
    const parties = notificationPartiesFor(req(), 'approval.submitted', ALICE)
    assert.deepEqual(parties.map((p) => p.email), [BOB])
  })

  it('routes every outcome back to the submitter', () => {
    for (const event of [
      'approval.approved',
      'approval.refused',
      'approval.info_requested',
    ] as const) {
      const parties = notificationPartiesFor(req(), event, BOB)
      assert.deepEqual(parties.map((p) => p.email), [ALICE], event)
    }
  })

  it('never notifies the actor about their own action', () => {
    // Self-approval: Alice owns it, Alice approved it. She should get nothing.
    const r = req({ approvers: [{ id: 'app_alice', name: 'Alice', email: ALICE }] })
    assert.deepEqual(notificationPartiesFor(r, 'approval.approved', ALICE), [])
    assert.deepEqual(notificationPartiesFor(r, 'approval.submitted', ALICE), [])
  })

  it('deduplicates a recipient listed twice', () => {
    const r = req({
      approvers: [
        { id: 'app_bob', name: 'Bob', email: BOB },
        { id: 'app_bob_dup', name: 'Bob (dup)', email: '  BOB@opusfesta.com' },
      ],
    })
    assert.equal(notificationPartiesFor(r, 'approval.submitted', ALICE).length, 1)
  })

  it('drops recipients with no email rather than attempting a blank send', () => {
    const r = req({ approvers: [{ id: 'x', name: 'No Email', email: '' }] })
    assert.deepEqual(notificationPartiesFor(r, 'approval.submitted', ALICE), [])
  })
})
