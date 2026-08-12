import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isCronAuthorized } from './cron-auth'

describe('isCronAuthorized', () => {
  it('accepts only the exact configured bearer', () => {
    assert.equal(isCronAuthorized('Bearer correct-secret', 'correct-secret'), true)
    assert.equal(isCronAuthorized('Bearer wrong-secret', 'correct-secret'), false)
    assert.equal(isCronAuthorized('correct-secret', 'correct-secret'), false)
  })

  it('fails closed when the header or environment secret is missing', () => {
    assert.equal(isCronAuthorized(null, 'correct-secret'), false)
    assert.equal(isCronAuthorized('Bearer correct-secret', undefined), false)
    assert.equal(isCronAuthorized(null, undefined), false)
  })

  it('rejects different lengths without asking timingSafeEqual to compare them', () => {
    assert.equal(isCronAuthorized('Bearer short', 'a-much-longer-secret'), false)
  })
})
