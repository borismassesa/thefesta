import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  OWNER_WIDTH_PX,
  PREVIEW_WIDTH_PX,
  hasTraceWatermark,
  readTraceWatermark,
  traceCode,
  traceDotOverlaySvg,
  traceWatermarkSvg,
} from './card-protection'

const DIGEST = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
const CARD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1512"><rect/></svg>'

test('traceCode is stable for the same digest', () => {
  assert.equal(traceCode(DIGEST), traceCode(DIGEST))
})

test('traceCode separates different digests', () => {
  const other = '0000000011111111222222223333333344444444555555556666666677777777'
  assert.notEqual(traceCode(DIGEST), traceCode(other))
})

test('traceCode uses only the vowel-free alphabet', () => {
  // A code that can spell a word gets read as a word, and a card stamped with
  // an unfortunate one reaches a guest before anybody notices.
  assert.match(traceCode(DIGEST, 16), /^[0-9BCDFGHJKLMNPQRSTVWXZ]+$/)
})

test('traceCode honours the requested length', () => {
  assert.equal(traceCode(DIGEST, 8).length, 8)
  assert.equal(traceCode(DIGEST, 12).length, 12)
})

test('traceCode refuses a digest too short to be a keyed hash', () => {
  assert.throws(() => traceCode('abc'), /at least 8 hex/)
})

test('the stamp round-trips through the SVG', () => {
  const code = traceCode(DIGEST)
  const stamped = traceWatermarkSvg(CARD, code)
  assert.equal(readTraceWatermark(stamped), code)
  assert.ok(hasTraceWatermark(stamped))
})

test('an unstamped card reads as unstamped', () => {
  assert.equal(readTraceWatermark(CARD), null)
  assert.equal(hasTraceWatermark(CARD), false)
})

test('the stamp goes inside the svg, not after it', () => {
  const stamped = traceWatermarkSvg(CARD, 'ABCD1234')
  assert.ok(stamped.endsWith('</svg>'))
  assert.ok(stamped.indexOf('data-op-trace') < stamped.lastIndexOf('</svg>'))
})

test('the stamp covers the declared viewBox, not a guess', () => {
  const wide = '<svg viewBox="10 20 300 400"></svg>'
  const stamped = traceWatermarkSvg(wide, 'ABCD1234')
  assert.match(stamped, /<rect x="10" y="20" width="300" height="400"/)
})

test('a card with no viewBox still gets covered', () => {
  const stamped = traceWatermarkSvg('<svg></svg>', 'ABCD1234')
  assert.match(stamped, /<rect x="0" y="0" width="1080" height="1512"/)
})

test('two cards on one page do not share a pattern id', () => {
  // Same <pattern id> twice in a document means the second card renders the
  // FIRST card's code, which would frame the wrong viewer.
  const a = traceWatermarkSvg(CARD, 'AAAA1111')
  const b = traceWatermarkSvg(CARD, 'BBBB2222')
  const idA = a.match(/<pattern id="([^"]+)"/)?.[1]
  const idB = b.match(/<pattern id="([^"]+)"/)?.[1]
  assert.ok(idA && idB)
  assert.notEqual(idA, idB)
})

test('the code is escaped rather than injected', () => {
  const stamped = traceWatermarkSvg(CARD, '<script>x</script>')
  assert.ok(!stamped.includes('<script>'))
  assert.ok(stamped.includes('&lt;script&gt;'))
})

test('a malformed svg comes back untouched', () => {
  assert.equal(traceWatermarkSvg('not an svg', 'ABCD1234'), 'not an svg')
})

test('the stamp stays faint enough to be unnoticed', () => {
  // If this ever creeps up, the card looks dirty and somebody will "fix" it by
  // removing the stamp entirely. Pin it.
  const stamped = traceWatermarkSvg(CARD, 'ABCD1234')
  for (const opacity of stamped.match(/fill-opacity="([\d.]+)"/g) ?? []) {
    const value = Number(opacity.match(/[\d.]+/)![0])
    assert.ok(value <= 0.05, `stamp opacity ${value} is visible`)
  }
})

test('preview width cannot reach print resolution', () => {
  // A 5x7in card at 300 DPI is 1500px. The preview must stay far below it, or
  // the whole protection is decorative.
  assert.ok(PREVIEW_WIDTH_PX < 1500 / 2)
  assert.ok(OWNER_WIDTH_PX >= 1500)
})

test('the dot overlay is deterministic for a code', () => {
  assert.equal(traceDotOverlaySvg('ABCD1234', 640, 896), traceDotOverlaySvg('ABCD1234', 640, 896))
})

test('the dot overlay differs between codes', () => {
  assert.notEqual(traceDotOverlaySvg('ABCD1234', 640, 896), traceDotOverlaySvg('BBCD1234', 640, 896))
})

test('the dot overlay uses no text, so a fontless host still stamps', () => {
  // The whole reason this exists next to traceWatermarkSvg. A <text> element on
  // a serverless box with no fontconfig draws nothing, silently.
  const svg = traceDotOverlaySvg(traceCode(DIGEST), 640, 896)
  assert.ok(!svg.includes('<text'))
  assert.ok(!svg.includes('font-family'))
  assert.match(svg, /<rect /)
})

test('the dot overlay stays faint in both passes', () => {
  const svg = traceDotOverlaySvg('ABCD1234', 640, 896)
  const opacities = (svg.match(/fill-opacity="([\d.]+)"/g) ?? []).map((m) =>
    Number(m.match(/[\d.]+/)![0]),
  )
  assert.ok(opacities.length >= 2, 'expected a dark pass and a light pass')
  for (const o of opacities) assert.ok(o <= 0.06, `overlay opacity ${o} is visible`)
})

test('the dot overlay carries a full-column marker for orientation', () => {
  // Five dots at x="0" per pass — no character index is 31, so a full column
  // cannot be mistaken for data. Ten in total because the block is drawn twice,
  // once dark and once light, so the mark lands on pale and dark artwork alike.
  const svg = traceDotOverlaySvg('ABCD1234', 640, 896)
  const markers = (svg.match(/<rect x="0" y="\d+"/g) ?? []).length
  assert.equal(markers, 10)
})

test('the dot overlay survives a small preview without sub-pixel dots', () => {
  const svg = traceDotOverlaySvg('ABCD1234', 120, 168)
  for (const m of svg.match(/width="([\d.]+)" height="([\d.]+)"\/>/g) ?? []) {
    assert.ok(Number(m.match(/[\d.]+/)![0]) >= 1, 'dot collapsed below one pixel')
  }
})
