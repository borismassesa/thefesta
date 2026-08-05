import assert from 'node:assert/strict'
import test from 'node:test'
import type { FontMetrics } from './card-font-metrics'
import { extractArtworkGeometry } from './card-geometry'
import { deriveLayout } from './card-layout'
import { assessCardGeometry, recommendState } from './card-text-compat'

const HALF_EM: FontMetrics = {
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  lineGap: 0,
  advances: Object.fromEntries(Array.from({ length: 95 }, (_, i) => [String(i + 32), 500])),
  fallbackAdvance: 500,
}

function assess(svg: string, bindings: { role: string; layerIds: string[] }[], withMetrics = true) {
  const geometry = extractArtworkGeometry(svg)
  const layout = deriveLayout(geometry, bindings, () => (withMetrics ? HALF_EM : null))
  return assessCardGeometry(layout, geometry.texts)
}

const CLEAN = `<svg viewBox="0 0 300 400">
  <g id="guest_name"><text x="150" y="240" font-family="Nexa" font-size="20" text-anchor="middle">Bi. Fabiola</text></g>
</svg>`

const GUEST = [{ role: 'guest_name', layerIds: ['guest_name'] }]

// ── The narrow path to automatic activation ──

test('a plain, fully measurable card is the only thing activated automatically', () => {
  const assessment = assess(CLEAN, GUEST)
  assert.equal(assessment.mode, 'regeneratable')
  assert.equal(assessment.confidence, 'high')
  assert.equal(assessment.recommendedState, 'active')
})

test('anything less than high-confidence regeneratable goes to a human', () => {
  assert.equal(recommendState('regeneratable', 'medium'), 'review_required')
  assert.equal(recommendState('splice_only', 'high'), 'review_required')
  assert.equal(recommendState('path_text', 'high'), 'review_required')
  assert.equal(recommendState('unsupported', 'high'), 'blocked')
})

// ── Downgrades ──

test('a filtered layer is splice-only, and splice-only is never auto-activated', () => {
  // Falling back to the in-place renderer does not fix overflow: it writes the
  // value and cannot resize it. Activating such a card would be claiming a fix
  // that is not there.
  const svg = CLEAN.replace('<text x="150"', '<text filter="url(#shadow)" x="150"')
  const assessment = assess(svg, GUEST)
  assert.equal(assessment.mode, 'splice_only')
  assert.equal(assessment.recommendedState, 'review_required')
  assert.ok(assessment.reasons.some((reason) => /filter, mask or clip/.test(reason)))
})

test('text on a path is its own mode, not lumped in with the rest', () => {
  const svg = `<svg viewBox="0 0 300 400">
    <g id="guest_name"><text font-family="Nexa" font-size="20" x="0" y="0"><textPath href="#c">Bi. Fabiola</textPath></text></g>
  </svg>`
  assert.equal(assess(svg, GUEST).mode, 'path_text')
})

test('textLength is splice-only, because our fitting would be fighting it', () => {
  const svg = CLEAN.replace('font-size="20"', 'font-size="20" textLength="120"')
  assert.equal(assess(svg, GUEST).mode, 'splice_only')
})

test('per-character rotation and vertical writing are unsupported outright', () => {
  for (const attr of ['rotate="10"', 'writing-mode="tb"']) {
    const svg = CLEAN.replace('font-size="20"', `font-size="20" ${attr}`)
    const assessment = assess(svg, GUEST)
    assert.equal(assessment.mode, 'unsupported', attr)
    assert.equal(assessment.recommendedState, 'blocked', attr)
  }
})

test('a run mixing two typefaces cannot be rebuilt as one element', () => {
  const svg = `<svg viewBox="0 0 300 400">
    <g id="guest_name"><text x="10" y="50" font-family="Nexa" font-size="20"><tspan>Bi. </tspan><tspan font-family="GreatVibes">Fabiola</tspan></text></g>
  </svg>`
  assert.equal(assess(svg, GUEST).mode, 'splice_only')
})

test('a face with no metrics lowers confidence rather than blocking', () => {
  // The card still opens in the Studio; its boxes are just guesses until the
  // metrics backfill has run.
  const assessment = assess(CLEAN, GUEST, false)
  assert.equal(assessment.mode, 'regeneratable')
  assert.equal(assessment.confidence, 'medium')
  assert.equal(assessment.recommendedState, 'review_required')
})

test('rotated text is out of scope for the first phase and routes to review', () => {
  const svg = `<svg viewBox="0 0 300 400">
    <g id="guest_name" transform="rotate(15)"><text x="10" y="50" font-family="Nexa" font-size="20">Bi. Fabiola</text></g>
  </svg>`
  const assessment = assess(svg, GUEST)
  assert.equal(assessment.confidence, 'low')
  assert.equal(assessment.recommendedState, 'review_required')
})

test('heavy manual kerning lowers confidence, because regenerating collapses it', () => {
  const svg = `<svg viewBox="0 0 300 400">
    <g id="date_month"><text font-family="Nexa" font-size="16"><tspan x="42" y="88">A</tspan><tspan>G</tspan><tspan>O</tspan><tspan>S</tspan><tspan>T</tspan><tspan>I</tspan></text></g>
  </svg>`
  const assessment = assess(svg, [{ role: 'date_month', layerIds: ['date_month'] }])
  assert.equal(assessment.confidence, 'medium')
  assert.ok(assessment.reasons.some((reason) => /kerned across/.test(reason)))
})

test('an artwork with no viewBox cannot be laid out with confidence', () => {
  const svg = CLEAN.replace(' viewBox="0 0 300 400"', '')
  const assessment = assess(svg, GUEST)
  assert.equal(assessment.confidence, 'low')
  assert.ok(assessment.reasons.some((reason) => /viewBox/.test(reason)))
})

// ── The ambiguity this exists for ──

test('one role over several elements always goes to a human', () => {
  // A guest name on a detachable stub and 'Save the Date' set as three
  // positioned words are indistinguishable from here, and writing the value
  // into each is right for exactly one of them.
  const svg = `<svg viewBox="0 0 300 400">
    <g id="word_1"><text x="10" y="50" font-family="Nexa" font-size="20">Save</text></g>
    <g id="word_2"><text x="80" y="50" font-family="Nexa" font-size="20">the</text></g>
    <g id="word_3"><text x="130" y="50" font-family="Nexa" font-size="20">Date</text></g>
  </svg>`
  const assessment = assess(svg, [{ role: 'event_intro_1', layerIds: ['word_1', 'word_2', 'word_3'] }])

  assert.equal(assessment.confidence, 'low')
  assert.equal(assessment.recommendedState, 'review_required')
  assert.ok(assessment.reasons.some((reason) => /3 separate text elements/.test(reason)))
})

test('a card whose mapped fields resolve to nothing is blocked, not silently empty', () => {
  const assessment = assess(CLEAN, [{ role: 'guest_name', layerIds: ['no_such_layer'] }])
  assert.equal(assessment.recommendedState, 'blocked')
  assert.ok(assessment.reasons.some((reason) => /no mapped field/.test(reason)))
})

test('a card is only as safe as its worst field', () => {
  const svg = `<svg viewBox="0 0 300 400">
    <g id="guest_name"><text x="150" y="240" font-family="Nexa" font-size="20">Bi. Fabiola</text></g>
    <g id="venue_1_place"><text rotate="5" x="20" y="300" font-family="Nexa" font-size="10">KKKT</text></g>
  </svg>`
  const assessment = assess(svg, [
    { role: 'guest_name', layerIds: ['guest_name'] },
    { role: 'venue_1_place', layerIds: ['venue_1_place'] },
  ])
  assert.equal(assessment.mode, 'unsupported')
  assert.equal(assessment.recommendedState, 'blocked')
})
