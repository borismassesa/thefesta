import assert from 'node:assert/strict'
import test from 'node:test'
import type { FontMetrics } from './card-font-metrics'
import { DEFAULT_PROTECTED_PHRASES, tokenise, wrapText, WRAP_PROFILES } from './card-wrap'

/** Every glyph half an em wide: at size 20 each character is exactly 10 units. */
const HALF_EM: FontMetrics = {
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  lineGap: 0,
  advances: Object.fromEntries(Array.from({ length: 95 }, (_, i) => [String(i + 32), 500])),
  fallbackAdvance: 500,
}

function wrap(text: string, maxWidth: number, overrides: Partial<Parameters<typeof wrapText>[0]> = {}) {
  return wrapText({
    text,
    metrics: HALF_EM,
    fontSize: 20,
    letterSpacing: 0,
    maxWidth,
    maxLines: 3,
    ...WRAP_PROFILES['guest-name'],
    ...overrides,
  })
}

// ── Tokenisation ──

test('collapses a run of whitespace into one break opportunity', () => {
  // Kerned runs arrive from the artwork with newlines and indentation between
  // the fragments.
  assert.deepEqual(
    tokenise('one   \n  two', []).map((token) => token.text),
    ['one', 'two'],
  )
})

test('keeps a protected phrase whole, matching the longest first', () => {
  const tokens = tokenise('Mr. & Mrs. Christopher', DEFAULT_PROTECTED_PHRASES)
  assert.deepEqual(tokens.map((token) => token.text), ['Mr. & Mrs.', 'Christopher'])
})

test('a non-breaking space is not a break opportunity', () => {
  // It is what a designer uses to hold two words together.
  assert.deepEqual(
    tokenise('Saa 12:00', []).map((token) => token.text),
    ['Saa 12:00'],
  )
})

// ── Line breaking ──

test('breaks between words to keep each line inside the width', () => {
  const { lines, widths } = wrap('one two three', 65, { balance: false })
  assert.deepEqual(lines, ['one', 'two', 'three'])
  assert.ok(widths.every((width) => width <= 65))
})

test('honours an explicit newline whatever else would fit', () => {
  const { lines } = wrap('Bw & Bi\nMassesa', 1000, { protectedPhrases: [] })
  assert.deepEqual(lines, ['Bw & Bi', 'Massesa'])
})

test('never strands an honorific pair at the end of a line', () => {
  // 'Mr. &' alone on a line is a worse card than an uneven break.
  const { lines } = wrap('Mr. & Mrs. Christopher Alexander Mwakipesile', 240)
  assert.ok(lines[0].startsWith('Mr. & Mrs.'), `got ${JSON.stringify(lines)}`)
  assert.ok(!lines.some((line) => line.trim().endsWith('&')))
})

test('balancing evens the lines instead of greedily filling the first', () => {
  const greedy = wrap('one two three four five', 120, { balance: false })
  const balanced = wrap('one two three four five', 120, { balance: true })

  assert.equal(greedy.lines.length, balanced.lines.length)
  const spread = (widths: number[]) => Math.max(...widths) - Math.min(...widths)
  assert.ok(
    spread(balanced.widths) <= spread(greedy.widths),
    `balanced ${JSON.stringify(balanced.lines)} should be no less even than ${JSON.stringify(greedy.lines)}`,
  )
})

// ── Overlong words ──

test('breaks after a hyphen rather than inventing one', () => {
  const { lines } = wrap('Doe-Mwakatobe', 90)
  assert.deepEqual(lines, ['Doe-', 'Mwakatobe'])
})

test('never inserts a space between two pieces of one hyphenated word', () => {
  // Two pieces of a three-piece name can share a line even though the whole
  // word could not, and the joiner in `greedy` would put a space between them.
  // On an invitation that cannot be recalled, 'Jean- Baptiste-' is a misspelt
  // guest, so the pieces carry a marker that suppresses it.
  // 160 is inside the window that shows it: wide enough for 'Jean-Baptiste-'
  // (150 at this size) to share a line, too narrow for the whole word (230).
  const { lines } = wrap('Jean-Baptiste-Alexandre', 160)
  assert.deepEqual(lines, ['Jean-Baptiste-', 'Alexandre'])
})

test('breaks an unbreakable word by grapheme, never mid-surrogate', () => {
  const { lines } = wrap('Mwakipesilembeya', 60, { breakMode: 'word-then-grapheme' })
  assert.ok(lines.length > 1)
  assert.equal(lines.join(''), 'Mwakipesilembeya')
})

test("with 'word' breaking, an overlong word is reported rather than split", () => {
  // Hyphenating a surname on a wedding invitation is worse than a line the
  // fitter then shrinks, so the venue profile leaves it whole and says so.
  const { lines, overfull } = wrap('Mwakipesilembeya', 60, { ...WRAP_PROFILES.venue })
  assert.deepEqual(lines, ['Mwakipesilembeya'])
  assert.equal(overfull, true)
})

// ── Budgets ──

test('reports truncation rather than silently dropping lines', () => {
  const { lines, truncated } = wrap('one two three four five six', 30, { maxLines: 2, balance: false })
  assert.equal(lines.length, 2)
  assert.equal(truncated, true)
})

test('wraps nothing to nothing', () => {
  assert.deepEqual(wrap('   ', 100).lines, [])
})

// ── Determinism ──

test('the same input always produces the same lines', () => {
  // The Studio preview and the render server both run this. If it were not
  // deterministic, the preview would be a guess.
  const runs = Array.from({ length: 5 }, () =>
    wrap('Mr. & Mrs. Christopher Alexander Mwakipesile', 240).lines.join('|'),
  )
  assert.equal(new Set(runs).size, 1)
})
