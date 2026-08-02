// The sanitizer exists because a Supabase error was proven to carry a row
// value. These tests use that exact captured string, so a future refactor that
// starts logging `message` or `details` again fails here.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dbErrorCode, errorKind, maskEmail } from './log-safe'

// Captured verbatim from the production database on 2026-08-01 by provoking a
// unique violation on a temp table. The recipient's address is inside DETAIL.
const REAL_PG_ERROR = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "leak_probe_email_key"',
  details: 'Key (email)=(victim@example.test) already exists.',
  hint: null,
}

describe('dbErrorCode', () => {
  it('returns only the SQLSTATE, never message or details', () => {
    const out = dbErrorCode(REAL_PG_ERROR)
    assert.equal(out, '23505')
    assert.ok(!out.includes('victim@example.test'))
    assert.ok(!out.includes('leak_probe'))
  })

  it('what gets logged contains no part of the row value', () => {
    // Simulates the whole logged structure, which is what actually matters.
    const logged = JSON.stringify({
      operation: 'approval_request.update',
      code: dbErrorCode(REAL_PG_ERROR),
      requestId: 'req-1',
    })
    for (const leak of ['victim@example.test', 'duplicate key', 'leak_probe', 'Key (email)']) {
      assert.ok(!logged.includes(leak), `logged payload leaked: ${leak}`)
    }
  })

  it('degrades safely on shapes that are not Postgres errors', () => {
    assert.equal(dbErrorCode(null), 'unknown')
    assert.equal(dbErrorCode('boom'), 'unknown')
    assert.equal(dbErrorCode({ code: 'not-a-sqlstate' }), 'unknown')
    // A message masquerading as a code must not slip through.
    assert.equal(dbErrorCode({ code: 'Key (email)=(x@y.z)' }), 'unknown')
  })
})

describe('errorKind', () => {
  it('reduces provider errors to a stable token with no address', () => {
    assert.equal(errorKind({ name: 'rate_limit_exceeded' }), 'rate_limit')
    assert.equal(errorKind('Invalid recipient: victim@example.test'), 'invalid_recipient')
    assert.equal(errorKind({ name: 'unauthorized' }), 'provider_auth')
  })

  it('never echoes an unrecognised string back', () => {
    const nasty = 'failed sending to victim@example.test amount TZS 1,850,000'
    const out = errorKind(nasty)
    assert.equal(out, 'send_failed')
    assert.ok(!out.includes('victim'))
    assert.ok(!out.includes('1,850,000'))
  })
})

describe('maskEmail', () => {
  it('keeps enough to disambiguate, not enough to identify', () => {
    assert.equal(maskEmail('timothymwamoto8@gmail.com'), 't***@g***.com')
    assert.equal(maskEmail('  Udyamo@Gmail.COM  '), 'U***@G***.COM')
  })

  it('does not crash or leak on malformed input', () => {
    assert.equal(maskEmail(''), '***')
    assert.equal(maskEmail('not-an-email'), '***')
    assert.equal(maskEmail('@nolocal.com'), '***')
  })
})
