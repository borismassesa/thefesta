import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyMatrix,
  extractArtworkGeometry,
  multiply,
  parseLength,
  parseTransform,
  readViewBox,
} from './card-geometry'

const close = (actual: number, expected: number, tolerance = 1e-6) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  )

// ── Transforms ──

test('parses the transform forms Illustrator emits', () => {
  assert.deepEqual(parseTransform('translate(10 20)'), [1, 0, 0, 1, 10, 20])
  assert.deepEqual(parseTransform('translate(10)'), [1, 0, 0, 1, 10, 0])
  assert.deepEqual(parseTransform('matrix(2 0 0 2 5 5)'), [2, 0, 0, 2, 5, 5])
  assert.deepEqual(parseTransform('scale(3)'), [3, 0, 0, 3, 0, 0])
  assert.deepEqual(parseTransform(undefined), [1, 0, 0, 1, 0, 0])
})

test('composes a transform list left to right, like SVG does', () => {
  // translate then scale: the scale happens in the translated space, so a point
  // at (1,0) lands at 10 + 2 = 12, not at (10+1)*2 = 22.
  const m = parseTransform('translate(10 0) scale(2)')
  const p = applyMatrix(m, { x: 1, y: 0 })
  close(p.x, 12)
  close(p.y, 0)
})

test('rotates about a centre when one is given', () => {
  const m = parseTransform('rotate(90 10 10)')
  const p = applyMatrix(m, { x: 10, y: 0 })
  close(p.x, 20, 1e-9)
  close(p.y, 10, 1e-9)
})

test('skips an unrecognised transform function rather than treating it as identity', () => {
  // The translate must still be honoured; silently dropping it would place a
  // field's box somewhere the text is not.
  const m = parseTransform('nonsense(4) translate(7 0)')
  close(applyMatrix(m, { x: 0, y: 0 }).x, 7)
})

test('multiplies parent by child so the child applies first', () => {
  const composed = multiply(parseTransform('translate(100 0)'), parseTransform('scale(2)'))
  close(applyMatrix(composed, { x: 3, y: 0 }).x, 106)
})

// ── Lengths ──

test('parses CSS lengths, and distinguishes absent from zero', () => {
  assert.equal(parseLength('24.32'), 24.32)
  assert.equal(parseLength('12px'), 12)
  close(parseLength('12pt')!, 16)
  assert.equal(parseLength('0'), 0)
  assert.equal(parseLength(undefined), null)
  assert.equal(parseLength('auto'), null)
})

test('resolves em and percentage against the inherited size', () => {
  assert.equal(parseLength('0.5em', 40), 20)
  assert.equal(parseLength('50%', 40), 20)
  // With nothing to resolve against, an em is unanswerable rather than zero.
  assert.equal(parseLength('0.5em'), null)
})

// ── viewBox ──

test('reads the viewBox, preferring it over width and height', () => {
  const svg = '<svg width="200" height="300" viewBox="0 0 419.53 595.28"></svg>'
  assert.deepEqual(readViewBox(svg), { x: 0, y: 0, width: 419.53, height: 595.28 })
})

test('falls back to width and height when there is no viewBox', () => {
  assert.deepEqual(readViewBox('<svg width="200" height="300"></svg>'), {
    x: 0,
    y: 0,
    width: 200,
    height: 300,
  })
})

// ── Text geometry ──

test('reads position, size and anchor off a plain text layer', () => {
  const svg = `<svg viewBox="0 0 300 400">
    <g id="guest_name">
      <text x="150" y="240" font-family="BookmanOldStyle-Bold, Bookman Old Style"
            font-size="17" font-weight="700" text-anchor="middle">Bi. Fabiola Thomas</text>
    </g>
  </svg>`

  const { texts } = extractArtworkGeometry(svg)
  assert.equal(texts.length, 1)
  const [text] = texts
  assert.equal(text.layerId, 'guest_name')
  assert.equal(text.textKey, 'guest_name#1')
  assert.deepEqual(text.anchorPoint, { x: 150, y: 240 })
  assert.equal(text.anchor, 'middle')
  assert.equal(text.fontSize, 17)
  assert.equal(text.weight, 700)
  assert.deepEqual(text.families, ['BookmanOldStyle-Bold', 'Bookman Old Style'])
  assert.equal(text.sampleText, 'Bi. Fabiola Thomas')
  assert.equal(text.refuseRegeneration, null)
})

test('resolves font properties out of an Internal CSS export', () => {
  // Illustrator's DEFAULT export mode. A reader that only looked at attributes
  // would measure this layer at the 16px CSS default.
  const svg = `<svg viewBox="0 0 300 400">
    <style>.cls-7{font-family:GreatVibes-Regular, Great Vibes;font-size:40px;letter-spacing:.1em;}</style>
    <g id="couple_name_1"><text class="cls-7" x="10" y="50">Moses</text></g>
  </svg>`

  const [text] = extractArtworkGeometry(svg).texts
  assert.equal(text.fontSize, 40)
  assert.deepEqual(text.families, ['GreatVibes-Regular', 'Great Vibes'])
  // .1em of a 40px face is 4 units, resolved against THIS element's size.
  close(text.letterSpacing, 4)
})

test('an inline style outranks a class, which outranks a presentation attribute', () => {
  const svg = `<svg viewBox="0 0 300 400">
    <style>.cls-1{font-size:20px;}</style>
    <g id="date_day"><text class="cls-1" font-size="10" style="font-size:30px" x="0" y="0">15</text></g>
  </svg>`
  assert.equal(extractArtworkGeometry(svg).texts[0].fontSize, 30)
})

test('inherits font and transform from an enclosing group', () => {
  const svg = `<svg viewBox="0 0 300 400">
    <g id="venue_1_place" transform="translate(100 200)" font-family="Nexa, sans-serif" font-size="9">
      <text transform="translate(5 5)" x="0" y="0">KKKT Sala sala JUU</text>
    </g>
  </svg>`

  const [text] = extractArtworkGeometry(svg).texts
  assert.equal(text.fontSize, 9)
  assert.deepEqual(text.families, ['Nexa', 'sans-serif'])
  // The CTM carries BOTH transforms, so the local origin lands at (105, 205).
  const origin = applyMatrix(text.ctm, text.anchorPoint)
  close(origin.x, 105)
  close(origin.y, 205)
})

test('takes the anchor point off the first tspan when the text has none', () => {
  // A kerned run: Illustrator emits one tspan per tracking adjustment and puts
  // the position on the first of them.
  const svg = `<svg viewBox="0 0 300 400">
    <g id="date_month"><text font-family="Nexa" font-size="16"><tspan x="42" y="88">A</tspan><tspan>G</tspan><tspan>OSTI</tspan></text></g>
  </svg>`

  const [text] = extractArtworkGeometry(svg).texts
  assert.deepEqual(text.anchorPoint, { x: 42, y: 88 })
  assert.equal(text.tspans, 3)
  // Whitespace between the fragments must not survive into the sample copy.
  assert.equal(text.sampleText, 'AGOSTI')
})

test('addresses each text node in a layer separately', () => {
  const svg = `<svg viewBox="0 0 300 400">
    <g id="date">
      <text font-family="Nexa" font-size="10" x="0" y="0">AGOSTI</text>
      <text font-family="Nexa" font-size="10" x="0" y="20">2026</text>
    </g>
  </svg>`

  const keys = extractArtworkGeometry(svg).texts.map((text) => text.textKey)
  assert.deepEqual(keys, ['date#1', 'date#2'])
})

test('decodes entities in the sample copy', () => {
  const svg = `<svg viewBox="0 0 300 400">
    <g id="hosts_names"><text font-family="Nexa" font-size="10" x="0" y="0">Bw &amp; Bi Massesa</text></g>
  </svg>`
  assert.equal(extractArtworkGeometry(svg).texts[0].sampleText, 'Bw & Bi Massesa')
})

test('never samples the contents of a style block as drawn text', () => {
  const svg = `<svg viewBox="0 0 300 400">
    <style>.cls-1{fill:#024231;}</style>
    <g id="guest_name"><text class="cls-1" font-family="Nexa" font-size="10" x="0" y="0">Guest</text></g>
  </svg>`
  assert.equal(extractArtworkGeometry(svg).texts[0].sampleText, 'Guest')
})

// ── Refusals ──

test('refuses to regenerate text laid along a path', () => {
  const svg = `<svg viewBox="0 0 300 400">
    <g id="arch"><text font-family="Nexa" font-size="10" x="0" y="0"><textPath href="#curve">Harusi</textPath></text></g>
  </svg>`
  assert.equal(extractArtworkGeometry(svg).texts[0].refuseRegeneration, 'text_path')
})

test('refuses to regenerate a filtered, masked or clipped element', () => {
  for (const attr of ['filter="url(#shadow)"', 'mask="url(#m)"', 'clip-path="url(#c)"']) {
    const svg = `<svg viewBox="0 0 300 400"><g id="x"><text ${attr} font-family="Nexa" font-size="10" x="0" y="0">Hi</text></g></svg>`
    assert.equal(extractArtworkGeometry(svg).texts[0].refuseRegeneration, 'filtered', attr)
  }
})

test('refuses a layer with no resolvable font, because nothing can be measured', () => {
  const svg = '<svg viewBox="0 0 300 400"><g id="x"><text x="0" y="0">Hi</text></g></svg>'
  assert.equal(extractArtworkGeometry(svg).texts[0].refuseRegeneration, 'no_font')
})

test('refuses a run positioned only by dx/dy, rather than anchoring it to the origin', () => {
  const svg = `<svg viewBox="0 0 300 400">
    <g id="x"><text font-family="Nexa" font-size="10"><tspan dx="5" dy="5">Hi</tspan></text></g>
  </svg>`
  assert.equal(extractArtworkGeometry(svg).texts[0].refuseRegeneration, 'no_position')
})
