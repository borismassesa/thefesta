// The whitelist is a leak guard. A Supabase error carries row values in
// message/details/hint, and report content is confidential, so these tests
// exist to prove nothing but an exact known token reaches an employee.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  REPORT_ERROR_TOKENS,
  isRecoverableConflict,
  messageForToken,
  reportErrorToken,
  reportMessage,
} from './errors'

const LEAKY_PG_ERROR = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "uniq_report_submission_obligation"',
  details: 'Key (obligation_id)=(3f7c1b2e) already exists.',
  hint: null,
}

describe('reportErrorToken', () => {
  it('recognises every declared token', () => {
    for (const token of REPORT_ERROR_TOKENS) {
      assert.equal(reportErrorToken({ message: token }), token)
    }
  })

  it('refuses a message that merely contains a token', () => {
    assert.equal(
      reportErrorToken({ message: 'ERROR: report.not_owner for salary review of victim@x.test' }),
      null,
    )
  })

  it('refuses anything not on the list', () => {
    assert.equal(reportErrorToken(LEAKY_PG_ERROR), null)
    assert.equal(reportErrorToken({ message: 'report.made_up' }), null)
    assert.equal(reportErrorToken(new Error('boom')), null)
    assert.equal(reportErrorToken(null), null)
  })
})

describe('reportMessage', () => {
  it('never lets a database message through', () => {
    const out = reportMessage(LEAKY_PG_ERROR)
    assert.ok(!out.includes('3f7c1b2e'))
    assert.ok(!out.includes('uniq_report_submission_obligation'))
    assert.ok(!out.includes('duplicate key'))
  })

  it('gives every token a message that reads like a sentence, not an identifier', () => {
    for (const token of REPORT_ERROR_TOKENS) {
      const text = messageForToken(token)
      assert.ok(text.length > 15, `${token} needs a real message`)
      assert.ok(!text.includes('_'), `${token} reads like an identifier`)
      assert.ok(!text.includes('report_'), `${token} leaks a table name`)
    }
  })

  it('tells a conflicted author what actually happened to their work', () => {
    // The worst version of this message is "save failed". The author needs to
    // know their text was NOT applied and that a newer copy exists.
    const text = messageForToken('report.draft_conflict')
    assert.match(text, /not applied|reload/i)
  })
})

describe('isRecoverableConflict', () => {
  it('singles out the conflict the form can recover from', () => {
    assert.equal(isRecoverableConflict('report.draft_conflict'), true)
    assert.equal(isRecoverableConflict('report.not_editable'), false)
    assert.equal(isRecoverableConflict(null), false)
  })
})
