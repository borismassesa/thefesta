// Leave records carry medical and bereavement context, so the whitelist matters
// more here than almost anywhere: a PostgREST error can echo a row value, and
// that row might be somebody's sick note.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LEAVE_ERROR_TOKENS, leaveErrorToken, leaveMessage, messageForToken } from './errors'

const LEAKY_PG_ERROR = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "leave_request_days_request_id_leave_date_portion_key"',
  details: 'Key (reason)=(chemotherapy appointment) already exists.',
  hint: null,
}

describe('leaveErrorToken', () => {
  it('recognises every declared token', () => {
    for (const token of LEAVE_ERROR_TOKENS) {
      assert.equal(leaveErrorToken({ message: token }), token)
    }
  })

  it('refuses a message that merely contains a token', () => {
    assert.equal(
      leaveErrorToken({ message: 'ERROR: leave.not_owner for request of victim@x.test' }),
      null,
    )
  })

  it('refuses anything not on the list', () => {
    assert.equal(leaveErrorToken(LEAKY_PG_ERROR), null)
    assert.equal(leaveErrorToken({ message: 'leave.invented' }), null)
    assert.equal(leaveErrorToken(null), null)
  })
})

describe('leaveMessage', () => {
  it('never lets a database message through', () => {
    const out = leaveMessage(LEAKY_PG_ERROR)
    assert.ok(!out.includes('chemotherapy'), 'a sick note must never reach the browser')
    assert.ok(!out.includes('leave_request_days'))
    assert.ok(!out.includes('duplicate key'))
  })

  it('gives every token a sentence, not an identifier', () => {
    for (const token of LEAVE_ERROR_TOKENS) {
      const text = messageForToken(token)
      assert.ok(text.length > 15, `${token} needs a real message`)
      assert.ok(!text.includes('_'), `${token} reads like an identifier`)
      assert.ok(!text.includes('leave_'), `${token} leaks a table name`)
    }
  })

  it('explains that pending days count against the balance', () => {
    // Someone told only "not enough days" will argue with the number they can
    // see on screen.
    assert.match(messageForToken('leave.insufficient_balance'), /waiting for a decision/i)
  })

  it('points at the adjustment route rather than just refusing an edit', () => {
    assert.match(messageForToken('leave.ledger_immutable'), /adjustment/i)
  })
})
