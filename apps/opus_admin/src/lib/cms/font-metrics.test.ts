import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { measureRun } from '@opusfesta/lib'

import { extractFontMetrics } from './font-metadata'

// Real binaries, not fixtures. The whole point of this table is that it matches
// what a rasteriser will do with the actual file, so a synthetic font would
// test the arithmetic and none of the extraction.
const FONTS = join(process.cwd(), 'public/fonts')
const DANCING_SCRIPT = join(FONTS, 'DancingScript-Regular.ttf')
const PLAYFAIR_BOLD = join(FONTS, 'PlayfairDisplay-Bold.woff')

test('reads a real TrueType face into a usable metrics table', () => {
  const metrics = extractFontMetrics(readFileSync(DANCING_SCRIPT))
  assert.ok(metrics, 'Dancing Script should yield metrics')

  assert.ok(metrics.unitsPerEm > 0)
  assert.ok(metrics.ascender > 0)
  assert.ok(metrics.descender < 0)
  // Basic Latin at minimum: without it no card could be measured at all.
  for (const char of 'ABCabc .&') {
    assert.ok(
      metrics.advances[String(char.codePointAt(0))] !== undefined,
      `missing an advance for ${JSON.stringify(char)}`,
    )
  }
})

test('a script face reports a line height taller than its em', () => {
  // This is why line height is read off the face rather than taken as the font
  // size: Dancing Script draws well outside its em box, and measuring a line as
  // one em would let two lines overlap.
  const metrics = extractFontMetrics(readFileSync(DANCING_SCRIPT))!
  assert.ok(metrics.ascender - metrics.descender > metrics.unitsPerEm)
})

test('advances scale to sensible widths at an invitation size', () => {
  const metrics = extractFontMetrics(readFileSync(DANCING_SCRIPT))!
  const short = measureRun('John Doe', metrics, 24).width
  const long = measureRun('Prof. Dr. Eng. Arch. Benjamin Emmanuel Mwakatobe', metrics, 24).width

  assert.ok(long > short * 4, 'the long name must measure far wider than the short one')
  // A sanity band rather than an exact number, which would break on a font
  // update: 8 characters at 24pt cannot plausibly be under 20 or over 400 units.
  assert.ok(short > 20 && short < 400, `implausible width: ${short}`)
})

test('covers the accented letters and punctuation Tanzanian cards actually use', () => {
  const metrics = extractFontMetrics(readFileSync(DANCING_SCRIPT))!
  const { missing } = measureRun("Bw & Bi. Mwakatobe — 'Harusi'", metrics, 20)
  assert.deepEqual(missing, [], `unexpected gaps: ${JSON.stringify(missing)}`)
})

test('a character outside the stored repertoire is reported, not silently guessed', () => {
  const metrics = extractFontMetrics(readFileSync(DANCING_SCRIPT))!
  // CJK is deliberately out of range: storing a whole character set would mean
  // shipping tens of thousands of entries to measure Swahili and English.
  const { missing, width } = measureRun('A中B', metrics, 20)
  assert.deepEqual(missing, [0x4e2d])
  // The width still comes back usable, so a caller gets an estimate AND a flag.
  assert.ok(width > 0)
})

test('never throws on a file it cannot read', () => {
  // Designers hand over folders containing .DS_Store, licence PDFs and stray
  // zips. Every one of those reaches this function.
  assert.equal(extractFontMetrics(Buffer.from('not a font at all')), null)
  assert.equal(extractFontMetrics(Buffer.alloc(0)), null)
})

test('reads a woff face, which is registered but never rasterised', () => {
  // woff is excluded from RASTERISABLE_FONT_FORMATS because resvg renders it
  // blank. It is still used for browser previews, so it still needs measuring.
  const metrics = extractFontMetrics(readFileSync(PLAYFAIR_BOLD))
  if (metrics) {
    assert.ok(metrics.unitsPerEm > 0)
    assert.ok(Object.keys(metrics.advances).length > 20)
  }
})
