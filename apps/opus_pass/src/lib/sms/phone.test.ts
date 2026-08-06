import assert from 'node:assert/strict'
import test from 'node:test'
import {
  checkTanzanianPhone,
  isSupportedTanzanianMobilePrefix,
  maskPhone,
  parseTanzanianPhone,
} from './phone'

/**
 * Run with:
 *   npx tsx --test src/lib/sms/phone.test.ts
 *
 * Every number that survives this function costs money and reaches a stranger's
 * handset, so the interesting assertions are the rejections: a normalizer that
 * "repairs" an ambiguous number sends someone else's invitation to a real
 * person who never asked for it.
 */

test('the four accepted input formats all reach the same canonical number', () => {
  for (const input of ['0712345678', '712345678', '+255712345678', '255712345678']) {
    assert.equal(parseTanzanianPhone(input), '255712345678', input)
  }
})

test('separators people actually type are tolerated', () => {
  assert.equal(parseTanzanianPhone('+255 712 345 678'), '255712345678')
  assert.equal(parseTanzanianPhone('0712-345-678'), '255712345678')
  assert.equal(parseTanzanianPhone('(0712) 345.678'), '255712345678')
  assert.equal(parseTanzanianPhone('  255712345678  '), '255712345678')
})

test('6-prefix mobile numbers are accepted alongside 7', () => {
  assert.equal(parseTanzanianPhone('0612345678'), '255612345678')
  assert.equal(parseTanzanianPhone('612345678'), '255612345678')
})

test('a number one digit short or one digit long is rejected, not padded', () => {
  assert.equal(parseTanzanianPhone('071234567'), null) // 9 digits national
  assert.equal(parseTanzanianPhone('07123456789'), null) // 11 digits national
  assert.equal(parseTanzanianPhone('25571234567'), null) // 11 digits total
  assert.equal(parseTanzanianPhone('2557123456789'), null) // 13 digits total
  assert.equal(parseTanzanianPhone('71234567'), null)
  assert.equal(parseTanzanianPhone('7123456789'), null)
})

test('a structurally valid non-mobile number parses but is not sendable', () => {
  // Parsing and policy are separate: 255222110000 IS a well-formed Tanzanian
  // number, it just cannot receive an SMS. Conflating the two produced the
  // misleading error "invalid number" for a number that is perfectly valid.
  assert.equal(parseTanzanianPhone('255222110000'), '255222110000') // Dar landline
  assert.equal(isSupportedTanzanianMobilePrefix('255222110000'), false)

  const check = checkTanzanianPhone('0222110000')
  assert.equal(check.canonical, '255222110000')
  assert.equal(check.sendable, false)
  assert.equal(check.rejection, 'unsupported_prefix')
})

test('the supported-prefix allowlist covers today’s mobile ranges', () => {
  assert.equal(isSupportedTanzanianMobilePrefix('255712345678'), true)
  assert.equal(isSupportedTanzanianMobilePrefix('255612345678'), true)
  assert.equal(isSupportedTanzanianMobilePrefix('255812345678'), false)
  assert.equal(isSupportedTanzanianMobilePrefix('255512345678'), false)
})

test('an unparseable number is reported differently from an unsupported one', () => {
  // The distinction is the point: one is "fix the data", the other is
  // "widen the allowlist".
  assert.equal(checkTanzanianPhone('not a phone').rejection, 'unparseable')
  assert.equal(checkTanzanianPhone('255222110000').rejection, 'unsupported_prefix')
  assert.equal(checkTanzanianPhone('0712345678').rejection, undefined)
  assert.equal(checkTanzanianPhone('0712345678').sendable, true)
})

test('doubled and mixed country-code mistakes are rejected, not unpicked', () => {
  // Every one of these is a plausible copy-paste artefact, and every one has a
  // "obvious" repair we deliberately do not perform.
  for (const bad of ['2550255712345678', '00255712345678', '2550712345678', '255255712345678', '+2550712345678']) {
    assert.equal(parseTanzanianPhone(bad), null, bad)
    assert.equal(checkTanzanianPhone(bad).sendable, false, bad)
  }
})

test('another country’s number is rejected rather than rewritten as Tanzanian', () => {
  // The bare-9-digit rule must not swallow a Kenyan or Ugandan number that
  // happens to arrive without its country code intact.
  assert.equal(parseTanzanianPhone('+254712345678'), null)
  assert.equal(parseTanzanianPhone('+256712345678'), null)
  assert.equal(parseTanzanianPhone('+14155550123'), null)
})

test('an international 00 prefix is rejected as an unsupported format', () => {
  // 00255… is a real way to write the number, but it is not one of the four
  // formats we agreed to accept, and guessing is what this function refuses.
  assert.equal(parseTanzanianPhone('00255712345678'), null)
})

test('letters and stray symbols are rejected, not stripped', () => {
  // Stripping would turn "0712345678 (Mama)" into a valid send. If the stored
  // value is a note rather than a number, we want to see it fail.
  assert.equal(parseTanzanianPhone('0712345678 ext 4'), null)
  assert.equal(parseTanzanianPhone('*255#'), null)
  assert.equal(parseTanzanianPhone('++255712345678'), null)
  assert.equal(parseTanzanianPhone('255712345678a'), null)
})

test('empty and missing input is null, not an exception', () => {
  assert.equal(parseTanzanianPhone(null), null)
  assert.equal(parseTanzanianPhone(undefined), null)
  assert.equal(parseTanzanianPhone(''), null)
  assert.equal(parseTanzanianPhone('   '), null)
  assert.equal(parseTanzanianPhone('-- --'), null)
})

test('normalizing is idempotent', () => {
  const once = parseTanzanianPhone('0712345678')!
  assert.equal(parseTanzanianPhone(once), once)
})

test('a masked number cannot be dialled but still shows the network prefix', () => {
  const masked = maskPhone('255712345678')
  assert.equal(masked, '25571*****78')
  assert.equal(masked.includes('2345'), false)
  assert.equal(masked.length, '255712345678'.length)
})
