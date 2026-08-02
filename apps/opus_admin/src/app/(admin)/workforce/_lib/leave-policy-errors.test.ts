import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isMissingLeavePolicyTable } from './leave-policy-errors'

describe('isMissingLeavePolicyTable', () => {
  it('recognizes a table missing from the PostgREST schema cache', () => {
    assert.equal(isMissingLeavePolicyTable({ code: 'PGRST205' }), true)
  })

  it('recognizes a missing table reported directly by Postgres', () => {
    assert.equal(isMissingLeavePolicyTable({ code: '42P01' }), true)
  })

  it('does not hide unrelated database failures', () => {
    assert.equal(isMissingLeavePolicyTable({ code: '42501' }), false)
  })
})
