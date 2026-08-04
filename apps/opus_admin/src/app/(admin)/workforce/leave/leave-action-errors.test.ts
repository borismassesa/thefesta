import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { throwLeaveDatabaseError } from './leave-action-errors'

describe('throwLeaveDatabaseError', () => {
  it('turns a check-constraint failure into a readable compatibility message', () => {
    assert.throws(
      () => throwLeaveDatabaseError({ code: '23514' }, 'Could not update the request.'),
      { message: 'That leave type or status is not available yet. Refresh the page and choose another option.' },
    )
  })

  it('does not expose provider details for other database failures', () => {
    assert.throws(
      () => throwLeaveDatabaseError({ code: '42501' }, 'Could not update the request.'),
      { message: 'Could not update the request.' },
    )
  })
})
