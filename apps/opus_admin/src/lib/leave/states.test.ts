// "Managers cannot approve outside authorized reporting scope" is the
// acceptance criterion, and canApprove is where it is decided.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  LEAVE_ACTIONS,
  LEAVE_STATES,
  LEAVE_STATE_LABELS,
  availableActions,
  canApprove,
  canPerform,
  isClosed,
  isCommitted,
  isFinalStep,
  needsReversal,
  parseApprovalChain,
  transition,
  type LeaveActor,
  type LeaveState,
} from './states'

const ACTORS: LeaveActor[] = ['owner', 'approver', 'hr']

describe('the lifecycle', () => {
  it('walks draft to approved', () => {
    assert.deepEqual(transition('draft', 'submit', 'owner'), { ok: true, next: 'submitted' })
    assert.deepEqual(transition('submitted', 'start_review', 'approver'), {
      ok: true,
      next: 'under_review',
    })
    assert.deepEqual(transition('under_review', 'approve', 'approver'), {
      ok: true,
      next: 'approved',
    })
  })

  it('lets a returned request be resubmitted', () => {
    assert.deepEqual(transition('returned', 'submit', 'owner'), { ok: true, next: 'submitted' })
  })

  it('separates withdrawing from cancelling', () => {
    // Withdraw is before a decision: nothing was taken, so nothing is reversed.
    assert.equal(canPerform('submitted', 'withdraw', 'owner'), true)
    assert.equal(canPerform('submitted', 'cancel', 'owner'), false)
    // Cancel is after approval, and that is the one that reverses the ledger.
    assert.equal(canPerform('approved', 'cancel', 'owner'), true)
    assert.equal(canPerform('approved', 'withdraw', 'owner'), false)
    assert.equal(needsReversal('approved'), true)
    assert.equal(needsReversal('submitted'), false)
  })

  it('closes the closed states to everything', () => {
    for (const state of ['rejected', 'cancelled', 'withdrawn'] as const) {
      for (const action of LEAVE_ACTIONS) {
        for (const actor of ACTORS) {
          assert.deepEqual(
            transition(state, action, actor),
            { ok: false, reason: 'closed' },
            `${actor}/${action} from ${state}`,
          )
        }
      }
      assert.equal(isClosed(state), true)
    }
  })

  it('knows which states reserve the days', () => {
    for (const state of LEAVE_STATES) {
      const expected = state === 'submitted' || state === 'under_review' || state === 'approved'
      assert.equal(isCommitted(state), expected, state)
    }
  })

  it('never lets the owner approve or reject their own request', () => {
    for (const action of ['approve', 'reject', 'return', 'start_review'] as const) {
      assert.deepEqual(
        transition('submitted', action, 'owner'),
        { ok: false, reason: 'not_permitted_for_actor' },
        action,
      )
    }
  })

  it('never lets an approver submit or withdraw on somebody’s behalf', () => {
    assert.equal(canPerform('draft', 'submit', 'approver'), false)
    assert.equal(canPerform('submitted', 'withdraw', 'approver'), false)
  })

  it('offers exactly the expected actions', () => {
    const expected: Record<LeaveState, Record<LeaveActor, string[]>> = {
      draft: { owner: ['submit', 'withdraw'], approver: [], hr: [] },
      submitted: {
        owner: ['withdraw'],
        approver: ['start_review', 'approve', 'reject', 'return'],
        hr: ['start_review', 'approve', 'reject', 'return'],
      },
      under_review: {
        owner: ['withdraw'],
        approver: ['approve', 'reject', 'return'],
        hr: ['approve', 'reject', 'return'],
      },
      approved: { owner: ['cancel'], approver: ['cancel'], hr: ['cancel'] },
      returned: { owner: ['submit', 'withdraw'], approver: [], hr: [] },
      rejected: { owner: [], approver: [], hr: [] },
      cancelled: { owner: [], approver: [], hr: [] },
      withdrawn: { owner: [], approver: [], hr: [] },
    }
    for (const state of LEAVE_STATES) {
      for (const actor of ACTORS) {
        assert.deepEqual(availableActions(state, actor), expected[state][actor], `${actor} on ${state}`)
      }
    }
  })

  it('labels every state', () => {
    for (const state of LEAVE_STATES) assert.ok(LEAVE_STATE_LABELS[state].length > 0)
  })
})

describe('canApprove — reporting scope', () => {
  // amina -> boaz -> chidi -> (nobody). dalia is in another branch entirely.
  const chain = {
    managerOf: new Map<string, string | null>([
      ['amina', 'boaz'],
      ['boaz', 'chidi'],
      ['chidi', null],
      ['dalia', 'esi'],
      ['esi', null],
    ]),
  }

  it('lets the direct manager approve', () => {
    assert.equal(canApprove({ approverId: 'boaz', employeeId: 'amina', chain }), true)
  })

  it('lets somebody further up the chain approve', () => {
    assert.equal(canApprove({ approverId: 'chidi', employeeId: 'amina', chain }), true)
  })

  it('REFUSES a manager from another branch', () => {
    // The acceptance criterion. Esi manages Dalia, not Amina.
    assert.equal(canApprove({ approverId: 'esi', employeeId: 'amina', chain }), false)
    assert.equal(canApprove({ approverId: 'dalia', employeeId: 'amina', chain }), false)
  })

  it('refuses a report approving their own manager', () => {
    assert.equal(canApprove({ approverId: 'amina', employeeId: 'boaz', chain }), false)
  })

  it('NEVER lets anybody approve their own leave, HR included', () => {
    assert.equal(canApprove({ approverId: 'boaz', employeeId: 'boaz', chain }), false)
    assert.equal(canApprove({ approverId: 'boaz', employeeId: 'boaz', chain, isHr: true }), false)
  })

  it('lets HR approve across the org', () => {
    assert.equal(canApprove({ approverId: 'esi', employeeId: 'amina', chain, isHr: true }), true)
  })

  it('refuses when the employee has no manager set', () => {
    assert.equal(canApprove({ approverId: 'boaz', employeeId: 'chidi', chain }), false)
  })

  it('survives a cycle in the org chart instead of hanging', () => {
    const cyclic = {
      managerOf: new Map<string, string | null>([['a', 'b'], ['b', 'a']]),
    }
    assert.equal(canApprove({ approverId: 'zzz', employeeId: 'a', chain: cyclic }), false)
    assert.equal(canApprove({ approverId: 'b', employeeId: 'a', chain: cyclic }), true)
  })

  it('stops at the depth cap on a very deep chain', () => {
    const deep = new Map<string, string | null>()
    for (let i = 0; i < 30; i += 1) deep.set(`e${i}`, `e${i + 1}`)
    assert.equal(
      canApprove({ approverId: 'e25', employeeId: 'e0', chain: { managerOf: deep } }),
      false,
      'beyond the cap it refuses rather than walking forever',
    )
    assert.equal(
      canApprove({ approverId: 'e3', employeeId: 'e0', chain: { managerOf: deep } }),
      true,
    )
  })
})

describe('approval chains', () => {
  it('finishes a single-step chain on the first approval', () => {
    assert.equal(isFinalStep([{ step: 1, approver: 'direct_manager' }], 1), true)
  })

  it('needs both signatures on a two-step chain', () => {
    const chain = [
      { step: 1, approver: 'direct_manager' },
      { step: 2, approver: 'department_lead' },
    ]
    assert.equal(isFinalStep(chain, 1), false)
    assert.equal(isFinalStep(chain, 2), true)
  })

  it('falls back to the direct manager rather than approving itself', () => {
    // A policy with a malformed chain must never mean "no approval needed".
    assert.deepEqual(parseApprovalChain(null), [{ step: 1, approver: 'direct_manager' }])
    assert.deepEqual(parseApprovalChain([]), [{ step: 1, approver: 'direct_manager' }])
    assert.deepEqual(parseApprovalChain(['nope']), [{ step: 1, approver: 'direct_manager' }])
  })

  it('sorts steps and drops malformed ones', () => {
    const chain = parseApprovalChain([
      { step: 2, approver: 'hr' },
      { nonsense: true },
      { step: 1, approver: 'direct_manager' },
    ])
    assert.deepEqual(chain.map((s) => s.approver), ['direct_manager', 'hr'])
  })
})
