import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { NOT_VISIBLE, validateTransition } from './transitions'
import type { ApprovalRequest, ApprovalStatus } from './types'

// These are authorization rules, not UX rules. Every case here was reachable
// by calling the server action directly before validateTransition existed.

const OWNER = 'alice@opusfesta.com'
const APPROVER = 'bob@opusfesta.com'
const STRANGER = 'carol@opusfesta.com'

function req(over: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: 'r1',
    category: 'business-trip',
    subject: 'Mwanza vendor visit',
    owner: 'Alice',
    ownerEmail: OWNER,
    ownerInitials: 'AL',
    fields: {},
    approvers: [{ id: 'app_bob', name: 'Bob', email: APPROVER }],
    status: 'Submitted' as ApprovalStatus,
    updatedAt: '2026-08-01T09:00:00Z',
    createdAt: '2026-07-31T09:00:00Z',
    submittedAt: '2026-07-31T10:00:00Z',
    activity: [],
    attachments: [],
    ...over,
  }
}

describe('validateTransition — self-approval', () => {
  it('blocks the owner approving their own request', () => {
    const r = req({ approvers: [{ id: 'app_alice', name: 'Alice', email: OWNER }] })
    const check = validateTransition(r, 'Approved', OWNER, { kind: 'approve' })
    assert.equal(check.ok, false)
    assert.match(check.ok === false ? check.reason : '', /raised yourself/)
  })

  it('blocks the owner refusing their own request', () => {
    const r = req({ approvers: [{ id: 'app_alice', name: 'Alice', email: OWNER }] })
    assert.equal(validateTransition(r, 'Refused', OWNER, { kind: 'refuse' }).ok, false)
  })

  it('blocks the owner requesting information from themselves', () => {
    const r = req({ approvers: [{ id: 'app_alice', name: 'Alice', email: OWNER }] })
    assert.equal(validateTransition(r, 'To Submit', OWNER, { kind: 'info' }).ok, false)
  })

  it('still blocks the owner when they are one approver among several', () => {
    const r = req({
      approvers: [
        { id: 'app_alice', name: 'Alice', email: OWNER },
        { id: 'app_bob', name: 'Bob', email: APPROVER },
      ],
    })
    assert.equal(validateTransition(r, 'Approved', OWNER, { kind: 'approve' }).ok, false)
    assert.equal(validateTransition(r, 'Approved', APPROVER, { kind: 'approve' }).ok, true)
  })
})

describe('validateTransition — approver membership', () => {
  it('allows a named approver to decide', () => {
    assert.equal(validateTransition(req(), 'Approved', APPROVER, { kind: 'approve' }).ok, true)
    assert.equal(validateTransition(req(), 'Refused', APPROVER, { kind: 'refuse' }).ok, true)
  })

  it('blocks someone who is not named on the request, without confirming it exists', () => {
    // Reachable before this existed by anyone holding finance.read.
    const check = validateTransition(req(), 'Approved', STRANGER, { kind: 'approve' })
    assert.equal(check.ok, false)
    // This used to assert /not an approver/. That reason is accurate but it
    // confirms the request is real and is sitting in Submitted, which is a
    // disclosure to someone with no business knowing the request exists.
    // Non-participants now get the same string as a made-up id.
    assert.equal(check.ok === false ? check.reason : '', NOT_VISIBLE)
  })

  it('blocks an unresolvable (empty) actor identity', () => {
    assert.equal(validateTransition(req(), 'Approved', '', { kind: 'approve' }).ok, false)
  })
})

describe('validateTransition — stale and already-decided requests', () => {
  it('refuses to re-decide an approved request', () => {
    const r = req({ status: 'Approved' })
    const check = validateTransition(r, 'Refused', APPROVER, { kind: 'refuse' })
    assert.equal(check.ok, false)
    assert.match(check.ok === false ? check.reason : '', /already approved/)
  })

  it('refuses to re-decide a refused request', () => {
    const r = req({ status: 'Refused' })
    assert.equal(validateTransition(r, 'Approved', APPROVER, { kind: 'approve' }).ok, false)
  })

  it('refuses a no-op transition to the current state', () => {
    for (const status of ['To Submit', 'Submitted', 'Approved', 'Refused'] as ApprovalStatus[]) {
      const check = validateTransition(req({ status }), status, APPROVER)
      assert.equal(check.ok, false, status)
    }
  })

  it('refuses to approve a request still sitting in drafts', () => {
    const r = req({ status: 'To Submit', submittedAt: null })
    const check = validateTransition(r, 'Approved', APPROVER, { kind: 'approve' })
    assert.equal(check.ok, false)
    assert.match(check.ok === false ? check.reason : '', /not been submitted/)
  })
})

describe('validateTransition — submission', () => {
  it('lets the owner submit their own draft', () => {
    const r = req({ status: 'To Submit' })
    assert.equal(validateTransition(r, 'Submitted', OWNER).ok, true)
  })

  it('blocks anyone else submitting it', () => {
    const r = req({ status: 'To Submit' })
    assert.equal(validateTransition(r, 'Submitted', APPROVER).ok, false)
  })

  it('blocks submission with no approvers, which would route to nobody', () => {
    const r = req({ status: 'To Submit', approvers: [] })
    const check = validateTransition(r, 'Submitted', OWNER)
    assert.equal(check.ok, false)
    assert.match(check.ok === false ? check.reason : '', /at least one approver/)
  })

  it('blocks resubmitting an already-submitted request', () => {
    assert.equal(validateTransition(req(), 'Submitted', OWNER).ok, false)
  })
})

describe('validateTransition — reopen', () => {
  it('lets the owner reopen a decided request', () => {
    for (const status of ['Approved', 'Refused'] as ApprovalStatus[]) {
      assert.equal(validateTransition(req({ status }), 'To Submit', OWNER).ok, true, status)
    }
  })

  it('lets an approver reopen a decided request', () => {
    assert.equal(validateTransition(req({ status: 'Approved' }), 'To Submit', APPROVER).ok, true)
  })

  it('blocks an uninvolved person reopening', () => {
    assert.equal(validateTransition(req({ status: 'Approved' }), 'To Submit', STRANGER).ok, false)
  })

  it('blocks reopening something that was never decided', () => {
    assert.equal(validateTransition(req({ status: 'Submitted' }), 'To Submit', OWNER).ok, false)
  })
})

describe('validateTransition — request more information', () => {
  it('lets an approver send a submitted request back', () => {
    assert.equal(validateTransition(req(), 'To Submit', APPROVER, { kind: 'info' }).ok, true)
  })

  it('blocks a stranger sending it back', () => {
    assert.equal(validateTransition(req(), 'To Submit', STRANGER, { kind: 'info' }).ok, false)
  })

  it('blocks sending back something not currently submitted', () => {
    const r = req({ status: 'Approved' })
    assert.equal(validateTransition(r, 'To Submit', APPROVER, { kind: 'info' }).ok, false)
  })
})
