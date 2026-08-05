import assert from 'node:assert/strict'
import test from 'node:test'
import type { FontMetrics } from './card-font-metrics'
import { fitText, isBlockingFit } from './card-fit'
import { applyMatrix, extractArtworkGeometry, parseTransform } from './card-geometry'
import { deriveLayout, type FieldLayout } from './card-layout'
import { assessCardGeometry } from './card-text-compat'

// A face covering Latin-1 and Latin Extended-A, which is what the catalogue's
// real fonts cover. Everything outside it is genuinely absent, exactly as it
// would be in production.
const LATIN: FontMetrics = {
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  lineGap: 0,
  advances: Object.fromEntries(
    [
      ...range(0x20, 0x7e),
      ...range(0xa0, 0xff),
      ...range(0x100, 0x17f),
      0x2010, 0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2026,
    ].map((code) => [String(code), 500]),
  ),
  fallbackAdvance: 500,
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}

function field(overrides: Partial<FieldLayout> = {}): FieldLayout {
  return {
    id: 'fld_guest_name_1',
    role: 'guest_name',
    sourceLayerIds: ['guest_name'],
    target: 'guest_name',
    localBox: { x: 0, y: 0, w: 400, h: 30 },
    baseline: 24,
    sourceCtm: [1, 0, 0, 1, 0, 0],
    align: 'center',
    vAlign: 'top',
    font: {
      families: ['Nexa'],
      size: 20,
      min: 10,
      max: 20,
      weight: 400,
      italic: false,
      letterSpacing: 0,
      lineHeight: 1,
    },
    fit: {
      strategy: 'shrink-then-wrap',
      maxLines: 3,
      overflow: 'warn',
      heightMode: 'grow',
      minLineHeight: 0.95,
    },
    wrapProfile: 'guest-name',
    onMissing: 'preserve-source',
    onEmpty: 'preserve-source',
    visibleIf: null,
    group: null,
    rawAttrs: '',
    regenerable: true,
    regenerationBlocker: null,
    estimated: false,
    ...overrides,
  }
}

// ── Names the catalogue must handle ──
//
// Every one of these has an explicit, stable expected outcome. "It probably
// works" is not an answer for a value that is printed on someone's invitation.

const SUPPORTED: { label: string; value: string }[] = [
  { label: 'swahili honorifics', value: 'Bw. na Bi. Mwakipesile' },
  { label: 'portuguese', value: 'José António da Conceição' },
  { label: 'french diaeresis + cedilla', value: 'Zoë François' },
  { label: 'en dash and typographic apostrophe', value: 'Amani–Neema M’Mboya' },
  { label: 'german eszett', value: 'Müller & Weiß' },
  { label: 'non-breaking space', value: 'Saa 12:00 Mchana' },
]

for (const { label, value } of SUPPORTED) {
  test(`lays out ${label} without a blocker`, () => {
    const result = fitText(field(), value, LATIN)
    assert.equal(isBlockingFit(result.status), false, `${result.status}: ${JSON.stringify(result)}`)
    assert.deepEqual(result.missingGlyphs, [])
    assert.ok(result.lines.join(' ').length > 0)
  })
}

test('a non-breaking space is never used as a line break', () => {
  // A designer writes it precisely to hold two words together.
  const result = fitText(
    field({ localBox: { x: 0, y: 0, w: 90, h: 30 } }),
    'Saa 12:00 Mchana',
    LATIN,
  )
  assert.ok(!result.lines.some((line) => line.trim() === 'Saa'))
})

test('a precomposed accent and a combining one both resolve, or both report', () => {
  // 'Amélie' spelled two ways. They must not disagree: one silently working and
  // the other silently substituting is the worst of both.
  const precomposed = fitText(field(), 'Amélie', LATIN)
  const combining = fitText(field(), 'Amélie', LATIN)

  assert.equal(isBlockingFit(precomposed.status), false)
  // The combining mark is outside the stored repertoire, so it is REPORTED
  // rather than measured at a fallback width and quietly rendered wrong.
  assert.equal(combining.status, 'unmeasurable')
  assert.deepEqual(combining.missingGlyphs, [0x0301])
})

// ── Scripts the first phase does not support ──

const UNSUPPORTED: { label: string; value: string; codePoint: number }[] = [
  { label: 'emoji', value: 'Neema 🎉 Mboya', codePoint: 0x1f389 },
  { label: 'arabic', value: 'أحمد بن سعيد', codePoint: 0x0623 },
  { label: 'chinese', value: '陈 大文', codePoint: 0x9648 },
]

for (const { label, value, codePoint } of UNSUPPORTED) {
  test(`refuses ${label} explicitly rather than guessing a width`, () => {
    // The support contract: Latin without mandatory contextual shaping.
    // Anything else is 'unmeasurable', which BLOCKS — the alternative is a
    // confident number for a rendering nobody can predict.
    const result = fitText(field(), value, LATIN)
    assert.equal(result.status, 'unmeasurable')
    assert.equal(isBlockingFit(result.status), true)
    assert.ok(result.missingGlyphs.includes(codePoint), JSON.stringify(result.missingGlyphs))
  })
}

test('a surrogate pair is reported as one code point, not two halves', () => {
  const result = fitText(field(), '🎉', LATIN)
  assert.deepEqual(result.missingGlyphs, [0x1f389])
})

// ── Transforms ──
//
// Supported shapes must derive consistently; unsupported ones must CLASSIFY,
// never throw a parser error at whoever opens the card.

const artworkWith = (transform: string) => `<svg viewBox="0 0 300 400">
  <g id="wrap" transform="${transform}">
    <g id="guest_name"><text x="10" y="50" font-family="Nexa" font-size="20">Bi. Fabiola</text></g>
  </g>
</svg>`

const GUEST = [{ role: 'guest_name', layerIds: ['guest_name'] }]

const assessOf = (transform: string) => {
  const geometry = extractArtworkGeometry(artworkWith(transform))
  const layout = deriveLayout(geometry, GUEST, () => LATIN)
  return { layout, assessment: assessCardGeometry(layout, geometry.texts) }
}

test('nested translation and scaling derive with high confidence', () => {
  for (const transform of ['translate(20 30)', 'scale(2)', 'translate(20 30) scale(2)']) {
    const { assessment } = assessOf(transform)
    assert.equal(assessment.confidence, 'high', transform)
    assert.equal(assessment.mode, 'regeneratable', transform)
  }
})

test('non-uniform and negative scaling are still axis-aligned, and still derive', () => {
  for (const transform of ['scale(2 0.5)', 'scale(-1 1)']) {
    const { assessment } = assessOf(transform)
    assert.equal(assessment.mode, 'regeneratable', transform)
    assert.equal(assessment.confidence, 'high', transform)
  }
})

test('rotation and skew classify as review rather than deriving confidently', () => {
  for (const transform of ['rotate(15)', 'skewX(10)', 'matrix(1 0.2 0 1 0 0)']) {
    const { assessment } = assessOf(transform)
    assert.equal(assessment.confidence, 'low', transform)
    assert.equal(assessment.recommendedState, 'review_required', transform)
  }
})

test('a malformed transform classifies rather than throwing', () => {
  // Whatever a designer's export contains, opening the card must not crash.
  for (const transform of ['translate(', 'nonsense(4)', 'matrix(1 0 0)', '']) {
    assert.doesNotThrow(() => assessOf(transform), transform)
  }
})

test('an unparseable transform function does not swallow the parts around it', () => {
  const m = parseTransform('nonsense(4) translate(7 3) alsononsense(9)')
  assert.deepEqual(applyMatrix(m, { x: 0, y: 0 }), { x: 7, y: 3 })
})

test('tiny floating-point values in a matrix are treated as axis-aligned', () => {
  // Illustrator emits 1e-16 rather than 0 constantly. Reading that as a rotation
  // would send most of the catalogue to manual review for nothing.
  const { assessment } = assessOf('matrix(1 0.0000000001 0.0000000001 1 0 0)')
  assert.equal(assessment.confidence, 'high')
})

test('an inherited transform composes with a local one', () => {
  const svg = `<svg viewBox="0 0 300 400">
    <g transform="translate(100 0)">
      <g id="guest_name" transform="translate(0 50)">
        <text x="10" y="5" font-family="Nexa" font-size="20">Bi. Fabiola</text>
      </g>
    </g>
  </svg>`
  const geometry = extractArtworkGeometry(svg)
  const [text] = geometry.texts
  const placed = applyMatrix(text.ctm, text.anchorPoint)
  assert.equal(placed.x, 110)
  assert.equal(placed.y, 55)
})
