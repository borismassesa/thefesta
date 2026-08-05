import assert from 'node:assert/strict'
import test from 'node:test'
import { extractArtworkGeometry } from './card-geometry'
import type { FontMetrics } from './card-font-metrics'
import { DEFAULT_FIT_TOLERANCE, fitText, isBlockingFit } from './card-fit'
import {
  applyOverrides,
  deriveLayout,
  fieldId,
  isVisible,
  stackGroup,
  type FieldLayout,
  type LayoutGroup,
} from './card-layout'

/** Every glyph half an em wide, so widths are arithmetic you can check by eye. */
const HALF_EM: FontMetrics = {
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  lineGap: 0,
  advances: Object.fromEntries(Array.from({ length: 95 }, (_, i) => [String(i + 32), 500])),
  fallbackAdvance: 500,
}

const MARGIN = DEFAULT_FIT_TOLERANCE.widthSafetyRatio

/** A field 100 units wide set at size 20: room for 9 characters after the margin. */
function field(overrides: Partial<FieldLayout> = {}): FieldLayout {
  return {
    id: 'fld_guest_name_1',
    role: 'guest_name',
    sourceLayerIds: ['guest_name'],
    target: 'guest_name',
    localBox: { x: 0, y: 0, w: 100, h: 20 },
    baseline: 16,
    sourceCtm: [1, 0, 0, 1, 0, 0],
    align: 'center',
    vAlign: 'top',
    font: {
      families: ['Nexa'],
      size: 20,
      min: 12,
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
    rawAttrs: ' x="0" y="0"',
    regenerable: true,
    regenerationBlocker: null,
    estimated: false,
    ...overrides,
  }
}

// ── The ladder ──

test('leaves a value that already fits exactly as the designer set it', () => {
  const result = fitText(field(), 'John Doe', HALF_EM)
  assert.equal(result.status, 'fits')
  assert.deepEqual(result.lines, ['John Doe'])
  assert.equal(result.fontSize, 20)
  assert.equal(result.overshoot, 0)
})

test('fits against slightly less than the box, so kerning drift cannot ship a clipped name', () => {
  // 10 characters at size 20 is exactly 100, the full box width.
  const result = fitText(field(), 'ABCDEFGHIJ', HALF_EM)
  assert.notEqual(result.status, 'fits')
  assert.ok(MARGIN < 1)
})

test('finds the LARGEST size that fits, not the first one a loop lands on', () => {
  // 12 characters at half an em each is 6x the size, so the largest size that
  // fits 98 units is 98/6 ≈ 16.33. A half-point walk down from 20 would stop at
  // 16.0 and set the name smaller than it needed to be.
  const result = fitText(
    field({ font: { ...field().font, min: 4 }, fit: { ...field().fit, strategy: 'shrink', maxLines: 1 } }),
    'Jonathan Doe',
    HALF_EM,
  )
  assert.equal(result.status, 'shrunk')
  assert.ok(result.fontSize > 16.3 && result.fontSize <= 16.34, `got ${result.fontSize}`)
  assert.ok(result.widths[0] <= 100 * MARGIN)
})

test('the search is reproducible: the same inputs give the same size every time', () => {
  // Integer bisection rather than accumulated floating-point steps is what
  // makes the Studio preview and the server agree.
  const sizes = Array.from({ length: 5 }, () => fitText(field(), 'Jonathan Doe', HALF_EM).fontSize)
  assert.equal(new Set(sizes).size, 1)
})

test('prefers wrapping at full size over shrinking', () => {
  // Keeping the typography the designer chose beats keeping the line count.
  const result = fitText(field({ localBox: { x: 0, y: 0, w: 140, h: 20 } }), 'Jonathan Doe Mwakatobe', HALF_EM)
  assert.equal(result.status, 'wrapped')
  assert.equal(result.fontSize, 20)
  assert.ok(result.lines.length > 1)
})

test('never shrinks below the field floor', () => {
  const result = fitText(field({ font: { ...field().font, min: 16 } }), 'Jonathan Doe', HALF_EM)
  assert.ok(result.fontSize >= 16)
})

test("'shrink' refuses to add a line, however long the value", () => {
  const result = fitText(
    field({ fit: { ...field().fit, strategy: 'shrink', maxLines: 1 } }),
    'Prof. Dr. Eng. Arch. Benjamin Emmanuel Mwakatobe',
    HALF_EM,
  )
  assert.equal(result.lines.length, 1)
  assert.equal(result.status, 'overflow')
})

test("'none' writes the value at the designer's size and reports the overflow", () => {
  const result = fitText(
    field({ fit: { ...field().fit, strategy: 'none', maxLines: 1 } }),
    'Jonathan Doe',
    HALF_EM,
  )
  assert.equal(result.status, 'overflow')
  assert.equal(result.fontSize, 20)
  assert.ok(result.overshoot > 0)
})

test('reports the whole value when it overflows, not a truncated version', () => {
  const long = 'Prof. Dr. Eng. Arch. Benjamin Emmanuel Mwakatobe'
  const result = fitText(
    field({ fit: { ...field().fit, strategy: 'shrink', maxLines: 1 } }),
    long,
    HALF_EM,
  )
  assert.equal(result.lines[0], long)
})

test('truncates with an ellipsis only when the policy explicitly says so', () => {
  const result = fitText(
    field({ fit: { ...field().fit, strategy: 'shrink', maxLines: 1, overflow: 'ellipsis' } }),
    'Prof. Dr. Eng. Arch. Benjamin Emmanuel Mwakatobe',
    HALF_EM,
  )
  assert.equal(result.status, 'clipped')
  assert.ok(result.lines[0].endsWith('…'))
  assert.ok(result.widths[0] <= 100 * MARGIN)
})

// ── Height ──

test("a 'grow' field is bounded by its line budget, not by its box height", () => {
  // The derived box is one line tall. Treating that as a constraint would mean
  // a derived field could never wrap at all.
  const result = fitText(field({ localBox: { x: 0, y: 0, w: 140, h: 20 } }), 'Jonathan Doe Mwakatobe', HALF_EM)
  assert.ok(result.height > 20)
  assert.equal(result.heightOvershoot, 0)
  assert.equal(result.status, 'wrapped')
})

test("a 'bound' field must fit its height too, and shrinks until it does", () => {
  const bounded = field({
    localBox: { x: 0, y: 0, w: 140, h: 26 },
    fit: { ...field().fit, heightMode: 'bound' },
  })
  const result = fitText(bounded, 'Jonathan Doe Mwakatobe', HALF_EM)
  assert.ok(result.height <= 26 * DEFAULT_FIT_TOLERANCE.heightSafetyRatio)
  assert.equal(result.heightOvershoot, 0)
})

// ── Refusals ──

test('an empty value is not an error, it is simply not drawn', () => {
  const result = fitText(field(), '   ', HALF_EM)
  assert.equal(result.status, 'empty')
  assert.deepEqual(result.lines, [])
  assert.equal(isBlockingFit(result.status), false)
})

test('a face with no metrics is unmeasurable, and that blocks', () => {
  const result = fitText(field(), 'John Doe', null)
  assert.equal(result.status, 'unmeasurable')
  assert.deepEqual(result.lines, ['John Doe'])
  assert.equal(isBlockingFit('unmeasurable'), true)
  assert.equal(isBlockingFit('overflow'), true)
  assert.equal(isBlockingFit('shrunk'), false)
  assert.equal(isBlockingFit('clipped'), false)
})

test('a missing glyph blocks rather than being measured at a fallback width', () => {
  // Substitution is per character, so the face draws a name we cannot predict.
  // A confident width for an unpredictable rendering is worse than no answer.
  const sparse: FontMetrics = { ...HALF_EM, advances: { '65': 500, '66': 500, '32': 500 } }
  const result = fitText(field(), 'AB中', sparse)
  assert.equal(result.status, 'unmeasurable')
  assert.deepEqual(result.missingGlyphs, [0x4e2d])
  assert.equal(isBlockingFit(result.status), true)
})

// ── The stress corpus from the brief ──

test('the three names that motivated the engine all resolve', () => {
  const names = [
    'John Doe',
    'Prof. Dr. Eng. Arch. Benjamin Emmanuel Mwakatobe',
    'Mr. & Mrs. Christopher Alexander Mwakipesile',
  ]
  const guestName = field({
    localBox: { x: 0, y: 0, w: 300, h: 30 },
    font: { ...field().font, size: 24, min: 14, max: 24 },
  })

  const results = names.map((name) => fitText(guestName, name, HALF_EM))

  assert.equal(results[0].status, 'fits')
  for (const result of results) {
    assert.equal(isBlockingFit(result.status), false, result.status)
    assert.ok(result.lines.length <= 3)
    assert.ok(
      result.widths.every((width) => width <= 300 * MARGIN),
      `line too wide: ${JSON.stringify(result.widths)}`,
    )
  }
})

test('an honorific pair is never left stranded at the end of a line', () => {
  const result = fitText(
    field({ localBox: { x: 0, y: 0, w: 220, h: 30 } }),
    'Mr. & Mrs. Christopher Alexander Mwakipesile',
    HALF_EM,
  )
  assert.ok(result.lines.length > 1)
  assert.ok(
    !result.lines.some((line) => /(&|Mr\.)$/.test(line.trim())),
    `honorific split across lines: ${JSON.stringify(result.lines)}`,
  )
})

// ── Derivation ──

const ARTWORK = `<svg viewBox="0 0 300 400">
  <g id="guest_name">
    <text x="150" y="240" font-family="Nexa" font-size="20" text-anchor="middle">Bi. Fabiola</text>
  </g>
  <g id="venue_1_place">
    <text x="20" y="300" font-family="Nexa" font-size="10">KKKT Sala sala</text>
  </g>
</svg>`

const BINDINGS = [
  { role: 'guest_name', layerIds: ['guest_name'] },
  { role: 'venue_1_place', layerIds: ['venue_1_place'] },
]

test('derives a box that reproduces what the designer drew', () => {
  const layout = deriveLayout(extractArtworkGeometry(ARTWORK), BINDINGS, () => HALF_EM)
  const guest = layout.fields[fieldId('guest_name', 1)]

  // 'Bi. Fabiola' is 11 characters at size 20, i.e. 110 units, centred on x=150.
  assert.equal(guest.localBox.w, 110)
  assert.equal(guest.localBox.x, 95)
  // The anchor point is the BASELINE, so the box is raised by the ascent.
  assert.equal(guest.localBox.y, 240 - 16)
  assert.equal(guest.baseline, 240)
  assert.equal(guest.align, 'center')
  assert.equal(guest.regenerable, true)
  assert.equal(guest.estimated, false)
})

test('a field carries its own identity and the role it serves', () => {
  // Keying layout by role would collapse a guest name that legitimately appears
  // twice — on the face of the card and again on a detachable stub.
  const layout = deriveLayout(extractArtworkGeometry(ARTWORK), BINDINGS, () => HALF_EM)
  const guest = layout.fields[fieldId('guest_name', 1)]
  assert.equal(guest.id, 'fld_guest_name_1')
  assert.equal(guest.role, 'guest_name')
  assert.deepEqual(guest.sourceLayerIds, ['guest_name'])
})

test('one role over several text elements becomes several fields', () => {
  const svg = `<svg viewBox="0 0 300 400">
    <g id="name_front"><text x="10" y="50" font-family="Nexa" font-size="10">Guest</text></g>
    <g id="name_stub"><text x="10" y="350" font-family="Nexa" font-size="8">Guest</text></g>
  </svg>`
  const layout = deriveLayout(
    extractArtworkGeometry(svg),
    [{ role: 'guest_name', layerIds: ['name_front', 'name_stub'] }],
    () => HALF_EM,
  )
  assert.deepEqual(Object.keys(layout.fields).sort(), ['fld_guest_name_1', 'fld_guest_name_2'])
})

test('flags a box as estimated when the face has no metrics yet', () => {
  const layout = deriveLayout(extractArtworkGeometry(ARTWORK), BINDINGS)
  assert.equal(layout.fields[fieldId('guest_name', 1)].estimated, true)
  assert.ok(layout.fields[fieldId('guest_name', 1)].localBox.w > 0)
})

test('never invents a field the mapper has not already established', () => {
  const layout = deriveLayout(extractArtworkGeometry(ARTWORK), [BINDINGS[0]], () => HALF_EM)
  assert.deepEqual(Object.keys(layout.fields), ['fld_guest_name_1'])
})

test('gives names the full ladder and short labels shrink-only', () => {
  const layout = deriveLayout(extractArtworkGeometry(ARTWORK), BINDINGS, () => HALF_EM)
  assert.equal(layout.fields[fieldId('guest_name', 1)].fit.strategy, 'shrink-then-wrap')
  assert.equal(layout.fields[fieldId('guest_name', 1)].wrapProfile, 'guest-name')
  assert.equal(layout.fields[fieldId('venue_1_place', 1)].wrapProfile, 'venue')
})

// ── Overrides ──

test("an admin's saved box wins, and unsaved fields keep derived defaults", () => {
  const derived = deriveLayout(extractArtworkGeometry(ARTWORK), BINDINGS, () => HALF_EM)
  const merged = applyOverrides(derived, {
    fields: { fld_guest_name_1: { localBox: { x: 0, y: 0, w: 280, h: 30 } } },
  })
  assert.equal(merged.fields.fld_guest_name_1.localBox.w, 280)
  assert.equal(merged.fields.fld_guest_name_1.font.size, 20)
  assert.ok(merged.fields.fld_venue_1_place_1)
})

test('drops a saved field whose layer the artwork no longer has', () => {
  // The artwork was re-exported. A box pinned to a layer that is gone would
  // position text against nothing.
  const derived = deriveLayout(extractArtworkGeometry(ARTWORK), BINDINGS, () => HALF_EM)
  const merged = applyOverrides(derived, {
    fields: { fld_table_number_1: { localBox: { x: 0, y: 0, w: 50, h: 10 } } },
  })
  assert.equal(merged.fields.fld_table_number_1, undefined)
})

test('never lets a stored layout claim a refused layer is regenerable', () => {
  const derived = deriveLayout(extractArtworkGeometry(ARTWORK), BINDINGS, () => HALF_EM)
  derived.fields.fld_guest_name_1.regenerable = false
  derived.fields.fld_guest_name_1.regenerationBlocker = 'filtered'
  const merged = applyOverrides(derived, {
    fields: { fld_guest_name_1: { regenerable: true, regenerationBlocker: null } },
  })
  assert.equal(merged.fields.fld_guest_name_1.regenerable, false)
  assert.equal(merged.fields.fld_guest_name_1.regenerationBlocker, 'filtered')
})

// ── Visibility and groups ──

test('hides a field whose governing value is absent', () => {
  const table = field({ visibleIf: { role: 'table_number', op: 'present' } })
  assert.equal(isVisible(table, { table_number: '12' }), true)
  assert.equal(isVisible(table, { table_number: '  ' }), false)
  assert.equal(isVisible(field(), {}), true)
})

const group = (overrides: Partial<LayoutGroup> = {}): LayoutGroup => ({
  id: 'g1',
  members: ['a', 'b', 'c'],
  direction: 'vertical',
  gap: 10,
  anchor: 'start',
  bounds: null,
  overflow: 'block',
  collapseHidden: true,
  ...overrides,
})

const stackFields = (): Record<string, FieldLayout> => ({
  a: field({ id: 'a', localBox: { x: 0, y: 0, w: 100, h: 10 } }),
  b: field({ id: 'b', localBox: { x: 0, y: 20, w: 100, h: 10 } }),
  c: field({ id: 'c', localBox: { x: 0, y: 40, w: 100, h: 10 } }),
})

test('re-stacks a group so a grown member pushes the ones below it down', () => {
  const stacked = stackGroup(group(), stackFields(), { a: 10, b: 20, c: 10 })
  assert.deepEqual(stacked.tops, { a: 0, b: 20, c: 50 })
  assert.equal(stacked.overflowedBy, 0)
})

test('a hidden member closes the gap it left rather than leaving a hole', () => {
  const stacked = stackGroup(group(), stackFields(), { a: 10, c: 10 })
  assert.deepEqual(stacked.tops, { a: 0, c: 20 })
})

test('a group that keeps its holes leaves the space where a hidden member was', () => {
  const stacked = stackGroup(group({ collapseHidden: false }), stackFields(), { a: 10, c: 10 })
  assert.deepEqual(Object.keys(stacked.tops).sort(), ['a', 'b', 'c'])
})

test('an end-anchored group grows upward', () => {
  // a and b together spanned 0..30. Grown to 50 tall (20 + 10 gap + 20), the
  // group's BOTTOM edge stays at 30 and the top moves up to -20.
  const stacked = stackGroup(group({ members: ['a', 'b'], anchor: 'end' }), stackFields(), {
    a: 20,
    b: 20,
  })
  assert.deepEqual(stacked.tops, { a: -20, b: 10 })
})

test('a bounded group reports how far it overruns instead of silently spilling', () => {
  const stacked = stackGroup(
    group({ members: ['a', 'b'], bounds: { x: 0, y: 0, w: 100, h: 30 } }),
    stackFields(),
    { a: 20, b: 20 },
  )
  assert.ok(stacked.overflowedBy > 0)
})

test("'compress-gap' closes the spacing before reporting, but never past zero", () => {
  const stacked = stackGroup(
    group({ members: ['a', 'b'], bounds: { x: 0, y: 0, w: 100, h: 45 }, overflow: 'compress-gap' }),
    stackFields(),
    { a: 20, b: 20 },
  )
  assert.equal(stacked.gap, 5)
  assert.equal(stacked.overflowedBy, 0)

  const impossible = stackGroup(
    group({ members: ['a', 'b'], bounds: { x: 0, y: 0, w: 100, h: 30 }, overflow: 'compress-gap' }),
    stackFields(),
    { a: 20, b: 20 },
  )
  assert.equal(impossible.gap, 0)
  assert.ok(impossible.overflowedBy > 0)
})
