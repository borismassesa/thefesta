// A PostgREST message can carry a row value, and the row values on this module
// are somebody's rating, their manager's private note, and the text of a
// calibration discussion. The whitelist is the leak guard.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PERFORMANCE_ERROR_TOKENS,
  messageForToken,
  performanceErrorToken,
  performanceMessage,
} from './errors'

const LEAKY_PG_ERROR = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "uniq_review_rating_live_competency"',
  details:
    'Key (review_id, competency_id)=(…) already exists. Ranked below two peers in the levelling discussion.',
  hint: null,
}

describe('performanceErrorToken', () => {
  it('recognises every declared token', () => {
    for (const token of PERFORMANCE_ERROR_TOKENS) {
      assert.equal(performanceErrorToken({ message: token }), token)
    }
  })

  it('refuses a message that merely contains a token', () => {
    assert.equal(
      performanceErrorToken({ message: 'ERROR: performance.review_closed for Jane Mushi' }),
      null,
    )
  })

  it('refuses anything not on the list', () => {
    assert.equal(performanceErrorToken(LEAKY_PG_ERROR), null)
    assert.equal(performanceErrorToken({ message: 'performance.invented' }), null)
    assert.equal(performanceErrorToken(null), null)
  })
})

describe('performanceMessage', () => {
  it('never lets a database message through', () => {
    const out = performanceMessage(LEAKY_PG_ERROR)
    assert.ok(!out.includes('levelling'), 'calibration text must never reach the browser')
    assert.ok(!out.includes('uniq_review_rating_live_competency'))
    assert.ok(!out.includes('competency_id'))
  })

  it('gives every token a sentence, not an identifier', () => {
    for (const token of PERFORMANCE_ERROR_TOKENS) {
      const text = messageForToken(token)
      assert.ok(text.length > 15, `${token} needs a real message`)
      assert.ok(!text.includes('_'), `${token} reads like an identifier`)
    }
  })

  it('does NOT confirm a review exists to somebody who may not open it', () => {
    // "You lack permission" tells an outsider the review is real and who it is
    // about. The message must be indistinguishable from one for a review that
    // does not exist.
    assert.equal(messageForToken('performance.review_not_found'), 'That review is not available to you.')
    assert.ok(!messageForToken('performance.review_not_found').match(/permission|denied/i))
  })

  it('uses the same wording for a hidden goal as for a missing one', () => {
    assert.equal(messageForToken('goal.not_found'), 'That goal is not available to you.')
  })

  it('points at the correction workflow when a review is closed', () => {
    // A dead end here means somebody emails People Ops asking what to do. The
    // message should say it.
    assert.match(messageForToken('performance.review_closed'), /People Ops.*correction/i)
  })

  it('explains why a rating cannot be edited rather than just refusing', () => {
    assert.match(messageForToken('performance.rating_immutable'), /keeps both on the record/i)
  })

  it('tells somebody what to do about their weights, not just that they are wrong', () => {
    assert.match(messageForToken('goal.weights_under'), /add up/i)
    assert.match(messageForToken('goal.self_approval'), /approval step/i)
  })
})
