// The whitelist is a leak guard, not a convenience. A Supabase error carries
// row values in message/details/hint, so these tests exist to prove that
// nothing but an exact known token can influence what an employee is shown.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ATTENDANCE_ERROR_TOKENS,
  attendanceErrorToken,
  attendanceMessage,
  isTransitionRefusal,
  messageForToken,
} from './errors'

// Shape captured from a real PostgREST failure: the colliding value is inside
// the error. If this ever reaches the browser, the module has failed.
const LEAKY_PG_ERROR = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "uniq_attendance_open_session"',
  details: 'Key (employee_id)=(3f7c…) already exists.',
  hint: null,
}

describe('attendanceErrorToken', () => {
  it('recognises every declared token', () => {
    for (const token of ATTENDANCE_ERROR_TOKENS) {
      assert.equal(attendanceErrorToken({ message: token }), token)
    }
  })

  it('tolerates surrounding whitespace from the driver', () => {
    assert.equal(
      attendanceErrorToken({ message: '  attendance.not_clocked_in\n' }),
      'attendance.not_clocked_in',
    )
  })

  it('refuses a message that merely contains a token', () => {
    // A Postgres DETAIL quoting our text must not be able to steer the message.
    assert.equal(
      attendanceErrorToken({
        message: 'ERROR: attendance.already_clocked_in for employee victim@example.test',
      }),
      null,
    )
  })

  it('refuses anything not on the list', () => {
    assert.equal(attendanceErrorToken(LEAKY_PG_ERROR), null)
    assert.equal(attendanceErrorToken({ message: 'attendance.made_up' }), null)
    assert.equal(attendanceErrorToken(new Error('boom')), null)
    assert.equal(attendanceErrorToken(null), null)
    assert.equal(attendanceErrorToken('attendance.not_clocked_in'), null)
  })
})

describe('attendanceMessage', () => {
  it('renders our text for a known token', () => {
    const out = attendanceMessage({ message: 'attendance.already_clocked_in' })
    assert.equal(out, messageForToken('attendance.already_clocked_in'))
    assert.ok(out.length > 0)
  })

  it('never lets a database message through', () => {
    const out = attendanceMessage(LEAKY_PG_ERROR)
    assert.ok(!out.includes('victim@example.test'))
    assert.ok(!out.includes('uniq_attendance_open_session'))
    assert.ok(!out.includes('duplicate key'))
  })

  it('gives every token a non-empty, jargon-free message', () => {
    for (const token of ATTENDANCE_ERROR_TOKENS) {
      const text = messageForToken(token)
      assert.ok(text.length > 10, `${token} needs a real message`)
      assert.ok(!text.includes('attendance_'), `${token} leaks a table name`)
      assert.ok(!text.includes('_'), `${token} reads like an identifier`)
    }
  })
})

describe('isTransitionRefusal', () => {
  it('separates state-machine refusals from system failures', () => {
    assert.equal(isTransitionRefusal('attendance.already_clocked_in'), true)
    assert.equal(isTransitionRefusal('attendance.not_on_break'), true)
    assert.equal(isTransitionRefusal('attendance.outside_geofence'), false)
    assert.equal(isTransitionRefusal(null), false)
  })
})
