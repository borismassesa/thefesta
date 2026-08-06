import assert from 'node:assert/strict'
import test from 'node:test'
import {
  analyzeSmsLength,
  describeUnsupportedCharacter,
  describeUnsupportedCharacters,
} from './segments'

/**
 * Run with:
 *   npx tsx --test src/lib/sms/segments.test.ts
 *
 * Segments are the billing unit, and the trap is that a message can look
 * ordinary while costing three times what it appears to. These tests exist to
 * make the expensive cases visible rather than discovered on an invoice.
 */

test('an empty body costs nothing', () => {
  const a = analyzeSmsLength('')
  assert.equal(a.segments, 0)
  assert.equal(a.remainingInSegment, 160)
})

test('160 GSM characters is one segment, 161 is two', () => {
  assert.equal(analyzeSmsLength('a'.repeat(160)).segments, 1)
  assert.equal(analyzeSmsLength('a'.repeat(160)).remainingInSegment, 0)
  // Concatenation costs 7 septets of header per part, so the second segment is
  // 153 characters, not 160.
  assert.equal(analyzeSmsLength('a'.repeat(161)).segments, 2)
  assert.equal(analyzeSmsLength('a'.repeat(306)).segments, 2)
  assert.equal(analyzeSmsLength('a'.repeat(307)).segments, 3)
})

test('a realistic Swahili invitation stays on GSM-7', () => {
  const body =
    'Umealikwa kwenye harusi ya Moses na Dayness tarehe 08/08/2026. ' +
    'Thibitisha mahudhurio: 0712345678. OpusPass'
  const a = analyzeSmsLength(body)
  assert.equal(a.encoding, 'gsm7')
  assert.equal(a.segments, 1)
  assert.deepEqual(a.unsupportedCharacters, [])
})

test('a curly apostrophe alone flips the whole message to Unicode', () => {
  // The headline case: one invisible substitution from a word processor drops
  // the budget from 160 characters to 70 and can triple the bill.
  const plain = analyzeSmsLength("Karibu kwenye harusi ya Moses 'na' Dayness")
  const curly = analyzeSmsLength('Karibu kwenye harusi ya Moses ’na’ Dayness')
  assert.equal(plain.encoding, 'gsm7')
  assert.equal(curly.encoding, 'unicode')
  assert.deepEqual(curly.unsupportedCharacters, ['’'])
})

test('the usual paste artefacts are all caught and named', () => {
  for (const char of ['’', '—', ' ', '•', '“', '😀']) {
    const a = analyzeSmsLength(`Karibu${char}`)
    assert.equal(a.encoding, 'unicode', char)
    assert.deepEqual(a.unsupportedCharacters, [char], char)
  }
})

test('unsupported characters are deduplicated in first-seen order', () => {
  // A composer shows this list to say "remove these"; repeats would be noise.
  const a = analyzeSmsLength('a’b—c’d')
  assert.deepEqual(a.unsupportedCharacters, ['’', '—'])
})

test('Unicode segments are 70 characters, then 67', () => {
  const emoji = '😀'
  assert.equal(analyzeSmsLength(`${'a'.repeat(68)}${emoji}`).segments, 1) // 68 + 2 units
  assert.equal(analyzeSmsLength(`${'a'.repeat(69)}${emoji}`).segments, 2)
})

test('an emoji counts as two billable units even though it reads as one character', () => {
  const a = analyzeSmsLength('😀')
  assert.equal(a.characters, 1)
  assert.equal(a.encoding, 'unicode')
  assert.equal(a.remainingInSegment, 68) // 70 - 2
})

test('GSM extension characters cost two septets each', () => {
  // Still GSM-7 — but a message full of them hits the segment boundary at half
  // the character count, which is exactly the kind of surprise this catches.
  const a = analyzeSmsLength('€'.repeat(80))
  assert.equal(a.encoding, 'gsm7')
  assert.equal(a.segments, 1)
  assert.equal(a.remainingInSegment, 0)
  assert.equal(analyzeSmsLength('€'.repeat(81)).segments, 2)
})

test('a newline is GSM-7, not an unsupported character', () => {
  const a = analyzeSmsLength('line one\nline two')
  assert.equal(a.encoding, 'gsm7')
  assert.deepEqual(a.unsupportedCharacters, [])
})

test('an invisible offender is named by code point, not printed', () => {
  // A zero-width space interpolated raw produces an error that appears to be
  // complaining about nothing at all.
  assert.equal(describeUnsupportedCharacter('\u200B'), 'U+200B')
  assert.equal(describeUnsupportedCharacter('\u00A0'), 'U+00A0')
  assert.equal(describeUnsupportedCharacter('\uFEFF'), 'U+FEFF')
})

test('a control character cannot forge a second log line', () => {
  // A raw CR or ANSI escape inside an error string lands in a log line and can
  // fabricate an entry after it.
  for (const char of ['\r', '\u001B', '\u0085', '\u2028']) {
    const described = describeUnsupportedCharacter(char)
    assert.equal(described.includes(char), false, JSON.stringify(char))
    assert.ok(/^U\+[0-9A-F]{4}$/.test(described), described)
  }
})

test('a visible offender keeps its glyph alongside the code point', () => {
  assert.equal(describeUnsupportedCharacter('\u2019'), '\u2019 (U+2019)')
  assert.equal(describeUnsupportedCharacter('\uD83D\uDE00'), '\uD83D\uDE00 (U+1F600)')
})

test('the rendered set reads as a list a person can act on', () => {
  assert.equal(
    describeUnsupportedCharacters(['\u201C', '\u201D', '\uD83D\uDE00']),
    '\u201C (U+201C), \u201D (U+201D), \uD83D\uDE00 (U+1F600)',
  )
})
