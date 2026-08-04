// Tracker entries carry blockers, decisions and performance signals. A Supabase
// error carries row values in message/details/hint, so these tests prove only an
// exact known token can influence what an employee is shown.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  TRACKER_ERROR_TOKENS,
  messageForToken,
  trackerErrorToken,
  trackerMessage,
} from './errors'

const LEAKY_PG_ERROR = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "uniq_tracker_item_carry_source"',
  details: 'Key (carried_from_item_id)=(3f7c1b2e) already exists.',
  hint: null,
}

describe('trackerErrorToken', () => {
  it('recognises every declared token', () => {
    for (const token of TRACKER_ERROR_TOKENS) {
      assert.equal(trackerErrorToken({ message: token }), token)
    }
  })

  it('refuses a message that merely contains a token', () => {
    assert.equal(
      trackerErrorToken({ message: 'ERROR: tracker.not_owner for entry of victim@x.test' }),
      null,
    )
  })

  it('refuses anything not on the list', () => {
    assert.equal(trackerErrorToken(LEAKY_PG_ERROR), null)
    assert.equal(trackerErrorToken({ message: 'tracker.invented' }), null)
    assert.equal(trackerErrorToken(new Error('boom')), null)
    assert.equal(trackerErrorToken(null), null)
  })
})

describe('trackerMessage', () => {
  it('never lets a database message through', () => {
    const out = trackerMessage(LEAKY_PG_ERROR)
    assert.ok(!out.includes('3f7c1b2e'))
    assert.ok(!out.includes('uniq_tracker_item_carry_source'))
    assert.ok(!out.includes('duplicate key'))
  })

  it('gives every token a sentence, not an identifier', () => {
    for (const token of TRACKER_ERROR_TOKENS) {
      const text = messageForToken(token)
      assert.ok(text.length > 15, `${token} needs a real message`)
      assert.ok(!text.includes('_'), `${token} reads like an identifier`)
      assert.ok(!text.includes('tracker_'), `${token} leaks a table name`)
    }
  })

  it('explains a suppressed day rather than just refusing', () => {
    // Someone told "not required" with no reason will assume it is a bug.
    const text = messageForToken('tracker.not_required')
    assert.match(text, /leave|holiday|rest day|waived/i)
  })
})
