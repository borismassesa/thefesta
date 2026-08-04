import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyTypedIdentifier,
  ENTRY_CODE_PATTERN,
  IDENTIFIER_ALPHABET,
  normaliseTypedIdentifier,
  PASS_ID_PATTERN,
} from './identifiers'

// Sample Pass IDs taken from the real generator's dry-run output.
const REAL_PASS_IDS = ['9KYSZTNF', 'SM2ABJEX', 'AVZ0H673', 'GFP9JQ2W']

test('a Pass ID read aloud with separators still matches', () => {
  // How a guest actually reads one out at a door.
  for (const spaced of ['9KYS ZTNF', '9kys-ztnf', ' 9KYS.ZTNF ', '9 K Y S Z T N F']) {
    assert.equal(normaliseTypedIdentifier(spaced), '9KYSZTNF', `failed for ${spaced}`)
  }
})

test('look-alike characters fold onto the alphabet', () => {
  // A guest reading "0" as "oh" and "1" as "ell".
  assert.equal(normaliseTypedIdentifier('AVZOH673'), 'AVZ0H673')
  assert.equal(normaliseTypedIdentifier('avziH673'.replace('i', 'I')), 'AVZ1H673')
  assert.equal(normaliseTypedIdentifier('ABCLEFGH'), 'ABC1EFGH')
})

test('folding can never turn one valid identifier into a different one', () => {
  // The safety property behind the folding: since the alphabet excludes O, I
  // and L, no stored identifier contains them, so folding only ever rescues a
  // mistyped value — it cannot collide two real ones.
  for (const c of ['O', 'I', 'L']) {
    assert.ok(!IDENTIFIER_ALPHABET.includes(c), `${c} must not be in the alphabet`)
  }
  for (const id of REAL_PASS_IDS) {
    assert.equal(normaliseTypedIdentifier(id), id, `${id} must be unchanged by folding`)
  }
})

test('U is not folded, and simply fails to match', () => {
  // Crockford excludes U, so it never appears in a generated value and there
  // is nothing it is plausibly mistaken for.
  assert.ok(!IDENTIFIER_ALPHABET.includes('U'))
  assert.equal(normaliseTypedIdentifier('9KYSZTNU'), '9KYSZTNU')
  assert.equal(classifyTypedIdentifier('9KYSZTNU'), null)
})

test('every real generated Pass ID matches the pattern', () => {
  for (const id of REAL_PASS_IDS) {
    assert.ok(PASS_ID_PATTERN.test(id), `${id} should match`)
    assert.equal(classifyTypedIdentifier(id), 'pass_id')
  }
})

test('the pattern matches the database CHECK constraint exactly', () => {
  // 20260805000000 enforces ^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$. If these drift,
  // the app rejects values the database accepts, or worse the reverse.
  for (const c of IDENTIFIER_ALPHABET) {
    assert.ok(PASS_ID_PATTERN.test(c.repeat(8)), `${c} should be allowed in a Pass ID`)
  }
  for (const bad of ['I', 'L', 'O', 'U']) {
    assert.ok(!PASS_ID_PATTERN.test(bad.repeat(8)), `${bad} must not be allowed`)
  }
})

test('length decides which identifier a typed value is', () => {
  assert.equal(classifyTypedIdentifier('9KYSZTNF'), 'pass_id') // 8
  assert.equal(classifyTypedIdentifier('ABC123'), 'legacy_entry_code') // 6
  assert.equal(classifyTypedIdentifier('ABC12'), null) // 5
  assert.equal(classifyTypedIdentifier('9KYSZTNFX'), null) // 9
  assert.equal(classifyTypedIdentifier(''), null)
})

test('a pasted QR token is rejected on shape, not sent to the database', () => {
  // The realistic accident: an attendant pastes the whole scanned string.
  const qr = 'eyJhbGciOiJIUzI1NiJ9.eyJpbnZpdGF0aW9uSWQiOiJhYmMifQ.signature'
  assert.equal(classifyTypedIdentifier(qr), null)
  assert.ok(!PASS_ID_PATTERN.test(normaliseTypedIdentifier(qr)))
})

test('entry codes keep their own shape', () => {
  assert.ok(ENTRY_CODE_PATTERN.test('ABC123'))
  assert.ok(!ENTRY_CODE_PATTERN.test('ABC1234'))
  assert.equal(normaliseTypedIdentifier('abc-123'), 'ABC123')
})

test('lookup and admission fold identically', () => {
  // The regression this module exists to prevent: two copies of the folding
  // rule disagreeing, so a code that works on lookup fails on admission.
  // Both call sites use this one function; this asserts the contract they
  // both depend on rather than the copies.
  const typed = '9kys ztnf'
  assert.equal(normaliseTypedIdentifier(typed), normaliseTypedIdentifier(typed.toUpperCase()))
  assert.equal(normaliseTypedIdentifier(typed), '9KYSZTNF')
})
