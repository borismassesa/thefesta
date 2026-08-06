import assert from 'node:assert/strict'
import test from 'node:test'
import { redactPhoneNumbers, redactProviderResponse, redactSecrets } from './redact'

/**
 * Run with:
 *   npx tsx --test src/lib/sms/redact.test.ts
 *
 * We log the gateway's whole response on purpose — capturing its real field
 * names and error shape is the point of this release. That makes the redactor
 * the only thing standing between a gateway that echoes credentials or
 * recipients and a permanent record of them in stdout.
 */

test('a secret is removed wherever it appears', () => {
  const out = redactSecrets('auth failed for ak_123:sk_456 (ak_123)', ['ak_123', 'sk_456'])
  assert.equal(out.includes('ak_123'), false)
  assert.equal(out.includes('sk_456'), false)
  assert.equal(out, 'auth failed for <redacted>:<redacted> (<redacted>)')
})

test('missing or trivially short secrets are skipped rather than blanking the text', () => {
  // An unset secret must not turn every empty string in the body into a marker.
  assert.equal(redactSecrets('hello', [undefined, '', 'ab']), 'hello')
})

test('recipient numbers in a response body are masked', () => {
  const out = redactPhoneNumbers('{"recipients":[{"dest_addr":"255712345678"}]}')
  assert.equal(out.includes('255712345678'), false)
  assert.ok(out.includes('25571*****78'))
})

test('local-format numbers are masked too', () => {
  assert.equal(redactPhoneNumbers('to 0712345678 ok'), 'to 07123***78 ok')
})

test('request and message identifiers survive masking', () => {
  // Masking every long digit run would destroy the identifiers we are logging
  // the response to collect in the first place.
  const body = '{"request_id":98765432,"code":100,"successful":true}'
  assert.equal(redactPhoneNumbers(body), body)
})

test('the combined redactor handles a response carrying both', () => {
  const raw = '{"message":"bad key ak_LIVE_1","recipients":[{"dest_addr":"255712345678"}],"request_id":42}'
  const out = redactProviderResponse(raw, ['ak_LIVE_1'])
  assert.equal(out.includes('ak_LIVE_1'), false)
  assert.equal(out.includes('255712345678'), false)
  assert.ok(out.includes('"request_id":42'))
})
