import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canonicalJson,
  compareManifest,
  manifestPermits,
  type CardRenderManifest,
} from './card-render-manifest'

const FROZEN: CardRenderManifest = {
  schemaVersion: 1,
  rendererVersion: 'card-layout-render@1',
  fitVersion: 'card-fit@1',
  artworkSha256: 'artwork-a',
  layoutSha256: 'layout-a',
  bindingSha256: 'binding-a',
  fonts: [
    { primary: 'BookmanOldStyle', weight: 400, italic: false, fontSha256: 'font-a', metricsSha256: 'metrics-a' },
  ],
}

const severityOf = (mismatches: { field: string; severity: string }[], field: string) =>
  mismatches.find((mismatch) => mismatch.field === field)?.severity

test('an unchanged dependency set reports nothing', () => {
  assert.deepEqual(compareManifest(FROZEN, FROZEN, 'regenerate'), [])
  assert.equal(manifestPermits([]), true)
})

// ── Regenerating an old release ──

test('a changed product layout is informational, because the snapshot wins', () => {
  // The rebuild reads layout_snapshot, so the product row moving on cannot
  // affect the output — but it IS worth seeing when diagnosing a difference.
  const mismatches = compareManifest(FROZEN, { ...FROZEN, layoutSha256: 'layout-b' }, 'regenerate')
  assert.equal(severityOf(mismatches, 'layout'), 'informational')
  assert.equal(manifestPermits(mismatches), true)
})

test('changed source artwork is informational, because the frozen file is rendered', () => {
  const mismatches = compareManifest(FROZEN, { ...FROZEN, artworkSha256: 'artwork-b' }, 'regenerate')
  assert.equal(severityOf(mismatches, 'artwork'), 'informational')
  assert.equal(manifestPermits(mismatches), true)
})

test('re-extracted font metrics BLOCK a rebuild', () => {
  // The quiet one: same font file, different table, different line break, and
  // nothing in the picture to explain why this guest's card differs from the
  // one their neighbour already received.
  const mismatches = compareManifest(
    FROZEN,
    { ...FROZEN, fonts: [{ ...FROZEN.fonts[0], metricsSha256: 'metrics-b' }] },
    'regenerate',
  )
  assert.equal(severityOf(mismatches, 'metrics'), 'blocker')
  assert.equal(manifestPermits(mismatches), false)
})

test('changed font bytes block a rebuild', () => {
  const mismatches = compareManifest(
    FROZEN,
    { ...FROZEN, fonts: [{ ...FROZEN.fonts[0], fontSha256: 'font-b' }] },
    'regenerate',
  )
  assert.equal(severityOf(mismatches, 'font'), 'blocker')
})

test('a font that no longer resolves blocks a rebuild', () => {
  const mismatches = compareManifest(FROZEN, { ...FROZEN, fonts: [] }, 'regenerate')
  assert.equal(severityOf(mismatches, 'font'), 'blocker')
  assert.match(mismatches[0].detail, /no longer resolved/)
})

test('a changed renderer or fitter blocks a rebuild', () => {
  assert.equal(
    severityOf(compareManifest(FROZEN, { ...FROZEN, rendererVersion: 'card-layout-render@2' }, 'regenerate'), 'renderer'),
    'blocker',
  )
  assert.equal(
    severityOf(compareManifest(FROZEN, { ...FROZEN, fitVersion: 'card-fit@2' }, 'regenerate'), 'fit'),
    'blocker',
  )
})

test('font metadata that is not the bytes or the metrics is not reported at all', () => {
  // A rename or a licence note changes the row without changing a single glyph.
  const renamed = { ...FROZEN.fonts[0], primary: 'BookmanOldStyle' }
  assert.deepEqual(compareManifest(FROZEN, { ...FROZEN, fonts: [renamed] }, 'regenerate'), [])
})

// ── Freezing something new ──

test('at freeze time every drift is expected, and none of it blocks', () => {
  // The layout changed because somebody changed it. That is the release.
  const mismatches = compareManifest(
    FROZEN,
    {
      ...FROZEN,
      layoutSha256: 'layout-b',
      artworkSha256: 'artwork-b',
      rendererVersion: 'card-layout-render@2',
      fonts: [{ ...FROZEN.fonts[0], metricsSha256: 'metrics-b' }],
    },
    'freeze',
  )
  assert.equal(manifestPermits(mismatches), true)
  assert.ok(!mismatches.some((mismatch) => mismatch.severity === 'blocker'))
})

test('the same drift means opposite things in the two contexts', () => {
  const drifted = { ...FROZEN, fonts: [{ ...FROZEN.fonts[0], metricsSha256: 'metrics-b' }] }
  assert.equal(manifestPermits(compareManifest(FROZEN, drifted, 'freeze')), true)
  assert.equal(manifestPermits(compareManifest(FROZEN, drifted, 'regenerate')), false)
})

// ── Fingerprinting ──

test('key order does not change a fingerprint', () => {
  // Without this, merely re-deriving a layout would look like a change, and a
  // mismatch that fires on nothing is a mismatch everybody learns to ignore.
  assert.equal(canonicalJson({ a: 1, b: 2 }), canonicalJson({ b: 2, a: 1 }))
  assert.equal(
    canonicalJson({ outer: { z: 1, a: [{ y: 2, x: 3 }] } }),
    canonicalJson({ outer: { a: [{ x: 3, y: 2 }], z: 1 } }),
  )
})

test('array order DOES change a fingerprint', () => {
  // Order is meaningful in a layout: it is document order, which is reading
  // order on the card.
  assert.notEqual(canonicalJson([1, 2]), canonicalJson([2, 1]))
})

test('undefined properties are dropped rather than fingerprinted as present', () => {
  assert.equal(canonicalJson({ a: 1, b: undefined }), canonicalJson({ a: 1 }))
})

test('null, zero and empty string stay distinguishable', () => {
  const fingerprints = [null, 0, '', false].map(canonicalJson)
  assert.equal(new Set(fingerprints).size, 4)
})
