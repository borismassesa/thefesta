import assert from 'node:assert/strict'
import test from 'node:test'
import { lineHeightFor, measureRun, wrapRun, type FontMetrics } from './card-font-metrics'

/**
 * A face where every glyph is half an em wide.
 *
 * Deliberately uniform so a width is arithmetic anyone can check by eye: at
 * size 20, each character is exactly 10 units.
 */
const HALF_EM: FontMetrics = {
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  lineGap: 0,
  advances: Object.fromEntries(
    Array.from({ length: 95 }, (_, i) => [String(i + 32), 500]),
  ),
  fallbackAdvance: 500,
}

test('measures a run as advances times scale', () => {
  // 5 characters at 500/1000 of a 20-unit em.
  assert.equal(measureRun('Hello', HALF_EM, 20).width, 50)
})

test('applies tracking between characters, not after the last one', () => {
  // 5 glyphs is 4 gaps. Applying it 5 times would overstate the run by a whole
  // letter-space and shrink text that already fitted.
  assert.equal(measureRun('Hello', HALF_EM, 20, 2).width, 50 + 8)
})

test('measures an empty run as nothing', () => {
  assert.deepEqual(measureRun('', HALF_EM, 20), { width: 0, missing: [] })
})

test('reports code points the face has no glyph for', () => {
  const sparse: FontMetrics = { ...HALF_EM, advances: { '65': 600 } }
  const { missing, width } = measureRun('AB', sparse, 10)
  // 'B' is missing; its advance falls back so the width stays usable.
  assert.deepEqual(missing, [66])
  assert.equal(width, 6 + 5)
})

test('does not report missing whitespace as a coverage problem', () => {
  // A face legitimately has no glyph for a space, but always has an advance.
  // Flagging it would mark every face on the card as incomplete.
  const noSpace: FontMetrics = { ...HALF_EM, advances: { '65': 500 } }
  assert.deepEqual(measureRun('A A', noSpace, 10).missing, [])
})

test('takes line height from the face, not from the font size', () => {
  // A script face draws well outside its em box. Measuring a line as one em
  // would let two lines overlap.
  assert.equal(lineHeightFor(HALF_EM, 20), 20)
  const tall: FontMetrics = { ...HALF_EM, ascender: 1200, descender: -400 }
  assert.equal(lineHeightFor(tall, 20), 32)
  assert.equal(lineHeightFor(tall, 20, 0.95), 30.4)
})

test('falls back to the font size when a face declares no vertical metrics', () => {
  const broken: FontMetrics = { ...HALF_EM, ascender: 0, descender: 0, lineGap: 0 }
  // Zero would collapse every line onto the one above it.
  assert.equal(lineHeightFor(broken, 20), 20)
})

test('wraps on spaces, keeping each line inside the width', () => {
  // At size 20 each character is 10 units, so 65 units holds 6 characters.
  const { lines, widths } = wrapRun('one two three', HALF_EM, 20, 0, 65)
  assert.deepEqual(lines, ['one', 'two', 'three'])
  assert.ok(widths.every((width) => width <= 65))
})

test('leaves an unbreakable word on its own line rather than hyphenating it', () => {
  // 'Mwakipesile' cannot fit, and breaking it mid-word on a wedding invitation
  // is worse than a line the fitter then shrinks.
  const { lines, widths } = wrapRun('Bi Mwakipesile', HALF_EM, 20, 0, 40)
  assert.deepEqual(lines, ['Bi', 'Mwakipesile'])
  assert.ok(widths[1] > 40)
})

test('wraps nothing to nothing', () => {
  assert.deepEqual(wrapRun('   ', HALF_EM, 20, 0, 100), { lines: [], widths: [] })
})
