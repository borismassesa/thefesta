// Identity resolution is the security boundary of the whole Workspace module:
// get it wrong and one employee opens another employee's Workspace. These tests
// exercise the decision directly, without a database, so the rules can't drift
// behind a mock.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  normalizeEmail,
  resolveIdentity,
  resolutionErrorCode,
  type EmployeeIdentityCandidate,
} from './identity-core'

const CLERK_ID = 'user_2abcDEF'
const OTHER_CLERK_ID = 'user_9zzzZZZ'

function candidate(
  over: Partial<EmployeeIdentityCandidate> & Pick<EmployeeIdentityCandidate, 'id'>,
): EmployeeIdentityCandidate {
  return { clerkUserId: null, email: 'amina@opusfesta.com', ...over }
}

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    assert.equal(normalizeEmail('  Amina@OpusFesta.com \n'), 'amina@opusfesta.com')
  })

  it('rejects anything that is not a single plausible address', () => {
    for (const bad of [null, undefined, '', '   ', 'nope', '@opusfesta.com', 'amina@', 'a@b@c']) {
      assert.equal(normalizeEmail(bad as string | null), null, `expected null for ${String(bad)}`)
    }
  })
})

describe('resolveIdentity — step 1, the explicit clerk link', () => {
  it('matches clerk_user_id first and does not re-persist the link', () => {
    const result = resolveIdentity({
      clerkUserId: CLERK_ID,
      email: 'amina@opusfesta.com',
      byClerkId: [candidate({ id: 'emp-1', clerkUserId: CLERK_ID })],
      byEmail: [candidate({ id: 'emp-2' })],
    })
    assert.deepEqual(result, {
      outcome: 'resolved',
      employeeId: 'emp-1',
      matchedBy: 'clerk_user_id',
      shouldPersistClerkId: false,
    })
  })

  it('wins over a different email match — the link is stronger than the address', () => {
    const result = resolveIdentity({
      clerkUserId: CLERK_ID,
      email: 'shared@opusfesta.com',
      byClerkId: [candidate({ id: 'emp-linked', clerkUserId: CLERK_ID })],
      byEmail: [candidate({ id: 'emp-other' }), candidate({ id: 'emp-third' })],
    })
    assert.equal(result.outcome, 'resolved')
    assert.equal(result.outcome === 'resolved' && result.employeeId, 'emp-linked')
  })

  it('fails closed if the UNIQUE constraint on clerk_user_id is ever lost', () => {
    const result = resolveIdentity({
      clerkUserId: CLERK_ID,
      email: null,
      byClerkId: [
        candidate({ id: 'emp-1', clerkUserId: CLERK_ID }),
        candidate({ id: 'emp-2', clerkUserId: CLERK_ID }),
      ],
      byEmail: [],
    })
    assert.deepEqual(result, { outcome: 'ambiguous', candidateCount: 2 })
  })
})

describe('resolveIdentity — step 2, the normalized email', () => {
  it('resolves a single unlinked row and asks for the link to be persisted', () => {
    const result = resolveIdentity({
      clerkUserId: CLERK_ID,
      email: 'amina@opusfesta.com',
      byClerkId: [],
      byEmail: [candidate({ id: 'emp-1', clerkUserId: null })],
    })
    assert.deepEqual(result, {
      outcome: 'resolved',
      employeeId: 'emp-1',
      matchedBy: 'email',
      shouldPersistClerkId: true,
    })
  })

  it('does not ask to re-persist a row already linked to this same account', () => {
    const result = resolveIdentity({
      clerkUserId: CLERK_ID,
      email: 'amina@opusfesta.com',
      byClerkId: [],
      byEmail: [candidate({ id: 'emp-1', clerkUserId: CLERK_ID })],
    })
    assert.equal(result.outcome === 'resolved' && result.shouldPersistClerkId, false)
  })

  it('returns no_match when the session has no usable email', () => {
    const result = resolveIdentity({
      clerkUserId: CLERK_ID,
      email: null,
      byClerkId: [],
      byEmail: [candidate({ id: 'emp-1' })],
    })
    assert.deepEqual(result, { outcome: 'no_match' })
  })

  it('returns no_match when nothing matches', () => {
    const result = resolveIdentity({
      clerkUserId: CLERK_ID,
      email: 'ghost@opusfesta.com',
      byClerkId: [],
      byEmail: [],
    })
    assert.deepEqual(result, { outcome: 'no_match' })
  })
})

describe('resolveIdentity — step 3, exactly one eligible match', () => {
  it('refuses to guess between two unlinked rows sharing an address', () => {
    const result = resolveIdentity({
      clerkUserId: CLERK_ID,
      email: 'ops@opusfesta.com',
      byClerkId: [],
      byEmail: [
        candidate({ id: 'emp-1', email: 'ops@opusfesta.com' }),
        candidate({ id: 'emp-2', email: 'OPS@opusfesta.com' }),
      ],
    })
    assert.deepEqual(result, { outcome: 'ambiguous', candidateCount: 2 })
  })

  it('will not claim a row already linked to someone else', () => {
    const result = resolveIdentity({
      clerkUserId: CLERK_ID,
      email: 'shared@opusfesta.com',
      byClerkId: [],
      byEmail: [candidate({ id: 'emp-1', clerkUserId: OTHER_CLERK_ID })],
    })
    assert.deepEqual(result, { outcome: 'conflict' })
  })

  it('picks the unlinked row when a shared address also has someone else linked', () => {
    // Two people, one shared inbox. Only the free row is eligible, so this
    // resolves — but it must resolve to the free row, never the claimed one.
    const result = resolveIdentity({
      clerkUserId: CLERK_ID,
      email: 'shared@opusfesta.com',
      byClerkId: [],
      byEmail: [
        candidate({ id: 'emp-taken', clerkUserId: OTHER_CLERK_ID }),
        candidate({ id: 'emp-free', clerkUserId: null }),
      ],
    })
    assert.deepEqual(result, {
      outcome: 'resolved',
      employeeId: 'emp-free',
      matchedBy: 'email',
      shouldPersistClerkId: true,
    })
  })

  it('never resolves to a row belonging to another account, in any ordering', () => {
    const taken = candidate({ id: 'emp-taken', clerkUserId: OTHER_CLERK_ID })
    const free = candidate({ id: 'emp-free', clerkUserId: null })
    for (const byEmail of [[taken, free], [free, taken]]) {
      const result = resolveIdentity({
        clerkUserId: CLERK_ID,
        email: 'shared@opusfesta.com',
        byClerkId: [],
        byEmail,
      })
      assert.notEqual(result.outcome === 'resolved' && result.employeeId, 'emp-taken')
    }
  })
})

describe('resolutionErrorCode', () => {
  it('maps every non-resolving outcome to a distinct employee-facing code', () => {
    assert.equal(resolutionErrorCode({ outcome: 'no_match' }), 'no_employee_record')
    assert.equal(
      resolutionErrorCode({ outcome: 'ambiguous', candidateCount: 2 }),
      'ambiguous_identity',
    )
    assert.equal(resolutionErrorCode({ outcome: 'conflict' }), 'identity_conflict')
  })
})
