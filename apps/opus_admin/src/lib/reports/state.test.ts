// The state machine is what "submitted reports cannot be silently edited" and
// "locked reports are immutable" actually mean. These tests enumerate the whole
// state x action x actor space rather than sampling it, so adding a state
// without deciding its transitions fails here.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  REPORT_ACTIONS,
  REPORT_STATES,
  availableActions,
  canPerform,
  createsVersion,
  isAwaitingReview,
  isContentEditable,
  isImmutable,
  stateLabel,
  transition,
  type ReportAction,
  type ReportActor,
  type ReportState,
} from './state'

const ACTORS: ReportActor[] = ['owner', 'reviewer', 'admin', 'system']

describe('the happy path', () => {
  it('walks draft to locked', () => {
    assert.deepEqual(transition('draft', 'submit', 'owner'), { ok: true, next: 'submitted' })
    assert.deepEqual(transition('submitted', 'start_review', 'reviewer'), {
      ok: true,
      next: 'under_review',
    })
    assert.deepEqual(transition('under_review', 'accept', 'reviewer'), {
      ok: true,
      next: 'accepted',
    })
    assert.deepEqual(transition('accepted', 'lock', 'system'), { ok: true, next: 'locked' })
  })

  it('walks a return and a resubmission', () => {
    assert.deepEqual(transition('under_review', 'return_for_correction', 'reviewer'), {
      ok: true,
      next: 'returned',
    })
    assert.deepEqual(transition('returned', 'resubmit', 'owner'), {
      ok: true,
      next: 'resubmitted',
    })
    assert.deepEqual(transition('resubmitted', 'accept', 'reviewer'), {
      ok: true,
      next: 'accepted',
    })
  })
})

describe('locked reports are immutable', () => {
  it('refuses every action from locked, for every actor', () => {
    for (const action of REPORT_ACTIONS) {
      for (const actor of ACTORS) {
        assert.deepEqual(
          transition('locked', action, actor),
          { ok: false, reason: 'immutable' },
          `${actor} must not ${action} a locked report`,
        )
      }
    }
  })

  it('refuses every action from the other terminal states too', () => {
    for (const state of ['cancelled', 'waived'] as const) {
      for (const action of REPORT_ACTIONS) {
        for (const actor of ACTORS) {
          assert.equal(canPerform(state, action, actor), false, `${actor}/${action} from ${state}`)
        }
      }
    }
  })

  it('reports terminal states as immutable and non-editable', () => {
    for (const state of ['locked', 'cancelled', 'waived'] as const) {
      assert.equal(isImmutable(state), true)
      assert.equal(isContentEditable(state), false)
    }
  })
})

describe('submitted reports cannot be silently edited', () => {
  it('allows content edits only in draft and returned', () => {
    for (const state of REPORT_STATES) {
      const expected = state === 'draft' || state === 'returned'
      assert.equal(isContentEditable(state), expected, `editability of ${state}`)
    }
  })

  it('has no action that moves a submitted report back to draft', () => {
    // The only route to different content is a return, which mints a version
    // and keeps the old one. Nothing may quietly reopen for editing.
    for (const action of REPORT_ACTIONS) {
      for (const actor of ACTORS) {
        const result = transition('submitted', action, actor)
        if (result.ok) assert.notEqual(result.next, 'draft', `${action} by ${actor}`)
      }
    }
  })
})

describe('who may act', () => {
  it('does not let a reviewer resubmit on the author’s behalf', () => {
    assert.deepEqual(transition('returned', 'resubmit', 'reviewer'), {
      ok: false,
      reason: 'not_permitted_for_actor',
    })
    assert.deepEqual(transition('returned', 'resubmit', 'admin'), {
      ok: false,
      reason: 'not_permitted_for_actor',
    })
    assert.equal(canPerform('returned', 'resubmit', 'owner'), true)
  })

  it('does not let an owner accept or return their own report', () => {
    assert.equal(canPerform('submitted', 'accept', 'owner'), false)
    assert.equal(canPerform('submitted', 'return_for_correction', 'owner'), false)
  })

  it('does not let an owner waive their own obligation', () => {
    for (const state of ['draft', 'submitted', 'returned'] as const) {
      assert.equal(canPerform(state, 'waive', 'owner'), false)
      assert.equal(canPerform(state, 'waive', 'reviewer'), false)
      assert.equal(canPerform(state, 'waive', 'admin'), true)
    }
  })

  it('lets the owner cancel before acceptance but not after', () => {
    assert.equal(canPerform('draft', 'cancel', 'owner'), true)
    assert.equal(canPerform('submitted', 'cancel', 'owner'), true)
    assert.equal(canPerform('accepted', 'cancel', 'owner'), false)
  })

  it('only lets an admin reopen an accepted report, and never a locked one', () => {
    assert.equal(canPerform('accepted', 'reopen', 'admin'), true)
    assert.equal(canPerform('accepted', 'reopen', 'reviewer'), false)
    assert.equal(canPerform('accepted', 'reopen', 'owner'), false)
    assert.equal(canPerform('locked', 'reopen', 'admin'), false)
  })
})

describe('the full grid', () => {
  const EXPECTED: Record<ReportState, Record<ReportActor, ReportAction[]>> = {
    draft: {
      owner: ['submit', 'cancel'],
      reviewer: [],
      admin: ['submit', 'cancel', 'waive'],
      system: [],
    },
    submitted: {
      owner: ['cancel'],
      reviewer: ['start_review', 'return_for_correction', 'accept'],
      admin: ['start_review', 'return_for_correction', 'accept', 'cancel', 'waive'],
      system: [],
    },
    under_review: {
      owner: ['cancel'],
      reviewer: ['return_for_correction', 'accept'],
      admin: ['return_for_correction', 'accept', 'cancel', 'waive'],
      system: [],
    },
    returned: {
      owner: ['resubmit', 'cancel'],
      reviewer: [],
      admin: ['cancel', 'waive'],
      system: [],
    },
    resubmitted: {
      owner: ['cancel'],
      reviewer: ['start_review', 'return_for_correction', 'accept'],
      admin: ['start_review', 'return_for_correction', 'accept', 'cancel', 'waive'],
      system: [],
    },
    accepted: {
      owner: [],
      reviewer: [],
      admin: ['lock', 'reopen'],
      system: ['lock'],
    },
    locked: { owner: [], reviewer: [], admin: [], system: [] },
    cancelled: { owner: [], reviewer: [], admin: [], system: [] },
    waived: { owner: [], reviewer: [], admin: [], system: [] },
  }

  it('offers exactly the expected actions everywhere', () => {
    for (const state of REPORT_STATES) {
      for (const actor of ACTORS) {
        assert.deepEqual(
          availableActions(state, actor),
          EXPECTED[state][actor],
          `${actor} on ${state}`,
        )
      }
    }
  })

  it('never returns ok without a valid next state', () => {
    for (const state of REPORT_STATES) {
      for (const action of REPORT_ACTIONS) {
        for (const actor of ACTORS) {
          const result = transition(state, action, actor)
          if (result.ok) assert.ok(REPORT_STATES.includes(result.next))
          else assert.ok(result.reason.length > 0)
        }
      }
    }
  })

  it('labels every state', () => {
    for (const state of REPORT_STATES) assert.ok(stateLabel(state).length > 0)
  })
})

describe('versioning', () => {
  it('cuts a version only when the employee files content', () => {
    assert.equal(createsVersion('submit'), true)
    assert.equal(createsVersion('resubmit'), true)
    // A return does not change what was written, so recording a version for it
    // would make the history claim an edit that never happened.
    for (const action of ['start_review', 'return_for_correction', 'accept', 'lock', 'cancel', 'waive', 'reopen'] as const) {
      assert.equal(createsVersion(action), false, action)
    }
  })
})

describe('isAwaitingReview', () => {
  it('is true exactly while the report sits with a reviewer', () => {
    for (const state of REPORT_STATES) {
      const expected =
        state === 'submitted' || state === 'under_review' || state === 'resubmitted'
      assert.equal(isAwaitingReview(state), expected, state)
    }
  })
})
