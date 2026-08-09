import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { candidatePortalTestEmail } from './candidate-portal-test-identity'

describe('candidatePortalTestEmail', () => {
  it('normalizes an explicitly configured non-production identity', () => {
    assert.equal(
      candidatePortalTestEmail('development', '  Recruitment.E2E@Local.Test  '),
      'recruitment.e2e@local.test',
    )
  })

  it('fails closed for missing or invalid identities', () => {
    assert.equal(candidatePortalTestEmail('test', undefined), null)
    assert.equal(candidatePortalTestEmail('test', 'not-an-email'), null)
  })

  it('can never bypass candidate authentication in production', () => {
    assert.equal(
      candidatePortalTestEmail('production', 'recruitment.e2e@local.test'),
      null,
    )
  })
})
