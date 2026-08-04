import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CYCLE_STAGES,
  CYCLE_STAGE_ASKS,
  CYCLE_STAGE_LABELS,
  REVIEW_STATES,
  canWriteReview,
  checkStageChange,
  isReviewLocked,
  isReviewSettled,
  stageRank,
} from './cycle'

describe('the eleven stages', () => {
  it('has all eleven, in the order the goal names them', () => {
    assert.equal(CYCLE_STAGES.length, 11)
    assert.equal(CYCLE_STAGES[0], 'goal_setting')
    assert.equal(CYCLE_STAGES[10], 'closed')
    assert.ok(stageRank('self_review') < stageRank('manager_review'))
    assert.ok(stageRank('manager_review') < stageRank('calibration'))
    assert.ok(stageRank('calibration') < stageRank('final_review'))
  })

  it('gives every stage a label and an ask, in plain words', () => {
    for (const stage of CYCLE_STAGES) {
      assert.ok(CYCLE_STAGE_LABELS[stage].length > 2)
      const ask = CYCLE_STAGE_ASKS[stage]
      assert.ok(ask.length > 15, `${stage} needs to say what is expected`)
      assert.ok(!ask.includes('_'), `${stage} reads like an identifier`)
    }
  })
})

describe('checkStageChange', () => {
  it('moves forward one stage at a time', () => {
    assert.deepEqual(checkStageChange('goal_setting', 'manager_approval', true), { ok: true })
  })

  it('REFUSES a skipped stage', () => {
    // Jumping to calibration means calibrating on reviews nobody has written.
    assert.deepEqual(checkStageChange('goal_setting', 'calibration', true), {
      ok: false,
      reason: 'stage_skipped',
    })
  })

  it('REFUSES anybody but HR', () => {
    assert.deepEqual(checkStageChange('goal_setting', 'manager_approval', false), {
      ok: false,
      reason: 'not_permitted',
    })
  })

  it('allows going back before calibration', () => {
    assert.deepEqual(checkStageChange('manager_approval', 'goal_setting', true), { ok: true })
  })

  it('LOCKS the cycle once calibration has run', () => {
    // Reopening goal setting after managers have compared people against each
    // other changes the basis they were compared on.
    assert.deepEqual(checkStageChange('calibration', 'goal_setting', true), {
      ok: false,
      reason: 'stage_locked',
    })
    assert.deepEqual(checkStageChange('final_review', 'self_review', true), {
      ok: false,
      reason: 'stage_locked',
    })
  })

  it('REFUSES anything at all once closed', () => {
    assert.deepEqual(checkStageChange('closed', 'final_review', true), {
      ok: false,
      reason: 'cycle_closed',
    })
  })

  it('walks the whole cycle end to end', () => {
    for (let i = 0; i < CYCLE_STAGES.length - 1; i += 1) {
      assert.deepEqual(
        checkStageChange(CYCLE_STAGES[i], CYCLE_STAGES[i + 1], true),
        { ok: true },
        `${CYCLE_STAGES[i]} should reach ${CYCLE_STAGES[i + 1]}`,
      )
    }
  })
})

describe('review write rules', () => {
  it('locks a closed review against everybody, HR included', () => {
    assert.equal(isReviewLocked('closed'), true)
    assert.equal(canWriteReview('closed', true), false)
    assert.equal(canWriteReview('closed', false), false)
  })

  it('lets HR, and only HR, write a finalised or acknowledged review', () => {
    for (const state of ['finalised', 'acknowledged'] as const) {
      assert.equal(isReviewSettled(state), true)
      assert.equal(canWriteReview(state, true), true)
      assert.equal(canWriteReview(state, false), false)
    }
  })

  it('OPENS a review under correction, which is the authorized door', () => {
    // review_open_correction() needs HR and records a reason. Once it has run,
    // the review is writable again: that is the workflow, not a hole in it.
    assert.equal(isReviewLocked('correction_open'), false)
    assert.equal(canWriteReview('correction_open', false), true)
  })

  it('lets work in progress be written by its author', () => {
    assert.equal(canWriteReview('in_progress', false), true)
    assert.equal(canWriteReview('not_started', false), true)
  })

  it('covers every declared state', () => {
    for (const state of REVIEW_STATES) {
      assert.equal(typeof canWriteReview(state, false), 'boolean')
    }
  })
})
