import assert from 'node:assert/strict'
import test from 'node:test'
import type { CardFieldBinding } from './card-field-roles'
import type { FontMetrics } from './card-font-metrics'
import { extractArtworkGeometry } from './card-geometry'
import { applyOverrides, deriveLayout, type CardLayout, type FieldLayout } from './card-layout'
import { planIsReleasable, resolveCardLayout } from './card-layout-resolve'
import { renderPlanToSvg } from './card-layout-render'
import { renderCardSvg } from './card-render'

/** Every glyph half an em wide, so widths are arithmetic you can check by eye. */
const HALF_EM: FontMetrics = {
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  lineGap: 0,
  advances: Object.fromEntries(Array.from({ length: 95 }, (_, i) => [String(i + 32), 500])),
  fallbackAdvance: 500,
}

const ARTWORK = `<svg viewBox="0 0 300 400">
  <g id="guest_name">
    <text x="150" y="240" font-family="Nexa" font-size="20" text-anchor="middle" fill="#50315F">Bi. Fabiola</text>
  </g>
  <g id="venue_1_place">
    <text x="20" y="300" font-family="Nexa" font-size="10">KKKT Sala sala</text>
  </g>
</svg>`

const BINDINGS: CardFieldBinding[] = [
  { role: 'guest_name', layerIds: ['guest_name'] },
  { role: 'venue_1_place', layerIds: ['venue_1_place'] },
]

const metricsFor = () => HALF_EM

function layoutFor(svg = ARTWORK, bindings = BINDINGS): CardLayout {
  const layout = deriveLayout(extractArtworkGeometry(svg), bindings, () => HALF_EM)
  // Real cards have slack around the placeholder; the derived box is the
  // placeholder exactly, which the fit margin would otherwise reject. Widened
  // symmetrically, so the centre the designer aligned to does not move.
  for (const field of Object.values(layout.fields)) {
    field.localBox = { ...field.localBox, x: field.localBox.x - 10, w: field.localBox.w + 20 }
  }
  return layout
}

const resolve = (layout: CardLayout, values: Record<string, string>) =>
  resolveCardLayout({ layout, state: 'active', values, metricsFor })

const render = (svg: string, layout: CardLayout, values: Record<string, string>) =>
  renderPlanToSvg(svg, resolve(layout, values), BINDINGS, values)

// ── The plan is the contract ──

test('the plan carries the exact lines, coordinates and size that will be drawn', () => {
  // Everything a consumer needs is in the plan. Nothing downstream re-decides.
  const plan = resolve(layoutFor(), { guest_name: 'John Doe' })
  const field = plan.fields.fld_guest_name_1

  assert.equal(field.fitStatus, 'fits')
  assert.equal(field.font.size, 20)
  assert.deepEqual(field.lines, [{ text: 'John Doe', x: 150, baselineY: 240, width: 80 }])
  assert.equal(field.presence, 'drawn')
})

test('resolving is deterministic, which is what makes the preview honest', () => {
  const once = resolve(layoutFor(), { guest_name: 'Mr. & Mrs. Christopher Alexander Mwakipesile' })
  const twice = resolve(layoutFor(), { guest_name: 'Mr. & Mrs. Christopher Alexander Mwakipesile' })
  assert.deepEqual(once.fields, twice.fields)
})

test('the plan names its renderer and fit versions, so an old one can be reproduced', () => {
  const plan = resolve(layoutFor(), {})
  assert.match(plan.rendererVersion, /^card-layout-render@/)
  assert.match(plan.fitVersion, /^card-fit@/)
})

// ── Deriving is not activating ──

test('a derived-but-not-active layout resolves, and says it is not authoritative', () => {
  // This is what makes it safe to derive across a live catalogue: reading a
  // card produces a proposal, and never changes what production draws.
  const plan = resolveCardLayout({
    layout: layoutFor(),
    state: 'derived',
    values: { guest_name: 'John Doe' },
    metricsFor,
  })
  assert.ok(plan.warnings.some((issue) => issue.code === 'LAYOUT_NOT_ACTIVE'))
})

test('an active layout raises no such warning', () => {
  const plan = resolve(layoutFor(), { guest_name: 'John Doe' })
  assert.ok(!plan.warnings.some((issue) => issue.code === 'LAYOUT_NOT_ACTIVE'))
})

// ── Diagnostics ──

test('an overflow blocks, and names the field, the value and the overrun', () => {
  const layout = layoutFor()
  layout.fields.fld_guest_name_1.fit = {
    ...layout.fields.fld_guest_name_1.fit,
    strategy: 'shrink',
    maxLines: 1,
  }
  const plan = resolve(layout, { guest_name: 'Prof. Dr. Eng. Arch. Benjamin Emmanuel Mwakatobe' })

  const blocker = plan.blockers.find((issue) => issue.code === 'TEXT_OVERFLOW')
  assert.ok(blocker)
  assert.equal(blocker.fieldId, 'fld_guest_name_1')
  assert.equal(blocker.role, 'guest_name')
  assert.equal(blocker.details?.value, 'Prof. Dr. Eng. Arch. Benjamin Emmanuel Mwakatobe')
  assert.ok((blocker.details?.overshoot as number) > 0)
  assert.equal(planIsReleasable(plan), false)
})

test('a missing glyph blocks as GLYPH_UNSUPPORTED, not as missing metrics', () => {
  const sparse: FontMetrics = { ...HALF_EM, advances: { '32': 500, '65': 500 } }
  const plan = resolveCardLayout({
    layout: layoutFor(),
    state: 'active',
    values: { guest_name: 'A中' },
    metricsFor: () => sparse,
  })
  assert.ok(plan.blockers.some((issue) => issue.code === 'GLYPH_UNSUPPORTED'))
})

test('a face with no metrics blocks as FONT_METRICS_MISSING', () => {
  const plan = resolveCardLayout({
    layout: layoutFor(),
    state: 'active',
    values: { guest_name: 'John Doe' },
    metricsFor: () => null,
  })
  assert.ok(plan.blockers.some((issue) => issue.code === 'FONT_METRICS_MISSING'))
})

test('a diagnostic carries the guest it is about, when there is one', () => {
  const plan = resolveCardLayout({
    layout: layoutFor(),
    state: 'active',
    values: { guest_name: 'John Doe' },
    metricsFor: () => null,
    guestId: 'guest-123',
  })
  assert.equal(plan.blockers[0].guestId, 'guest-123')
})

test('a deep shrink warns rather than blocks', () => {
  const layout = layoutFor()
  // One line only, and allowed to go small: the case where a value fits but the
  // design intent is gone, and somebody should widen the box.
  layout.fields.fld_guest_name_1.fit = {
    ...layout.fields.fld_guest_name_1.fit,
    strategy: 'shrink',
    maxLines: 1,
  }
  layout.fields.fld_guest_name_1.font = { ...layout.fields.fld_guest_name_1.font, min: 5 }

  const plan = resolve(layout, { guest_name: 'Jonathan Doe Mwakatobe Mwaki' })
  assert.equal(plan.fields.fld_guest_name_1.fitStatus, 'shrunk')
  assert.ok(plan.warnings.some((issue) => issue.code === 'TEXT_SHRUNK_HARD'))
  assert.equal(planIsReleasable(plan), true)
})

// ── Falling back is not fixing ──

test('a field that cannot be rebuilt is deferred, and says so rather than looking handled', () => {
  // The in-place renderer writes the value and cannot resize it, so a long name
  // here still overflows exactly as it does today. Reporting it as fine would
  // be the most dangerous thing this engine could do.
  const filtered = ARTWORK.replace('<text x="150"', '<text filter="url(#shadow)" x="150"')
  const plan = resolveCardLayout({
    layout: layoutFor(filtered),
    state: 'active',
    values: { guest_name: 'John Doe' },
    metricsFor,
  })

  assert.deepEqual(plan.deferredRoles, ['guest_name'])
  assert.equal(plan.fields.fld_guest_name_1.regenerable, false)
  assert.ok(plan.warnings.some((issue) => issue.code === 'UNSUPPORTED_TEXT_EFFECT'))
})

// ── Serialisation ──

test('a value that fits keeps the size and the baseline the designer chose', () => {
  const result = render(ARTWORK, layoutFor(), { guest_name: 'John Doe' })
  assert.match(result.svg, /font-size:20px/)
  assert.match(result.svg, /<tspan x="150" y="240">John Doe<\/tspan>/)
})

test('shrinking changes the size and nothing else', () => {
  // A shorter ascent would otherwise lift the line off the designer's baseline.
  const result = render(ARTWORK, layoutFor(), { guest_name: 'Jonathan Doe-Mwakatobe' })
  assert.match(result.svg, /<tspan x="150" y="240">/)
})

test('a wrapped value grows downward from the designer’s first baseline', () => {
  const layout = layoutFor()
  layout.fields.fld_guest_name_1.localBox = { x: 105, y: 224, w: 90, h: 20 }
  const result = render(ARTWORK, layout, {
    guest_name: 'Mr and Mrs Christopher Mwakipesile',
  })

  const baselines = [...result.svg.matchAll(/<tspan x="150" y="([\d.]+)">/g)].map((m) => Number(m[1]))
  assert.ok(baselines.length > 1, 'expected more than one line')
  assert.equal(baselines[0], 240)
  assert.ok(baselines[1] > baselines[0])
})

test('an empty value leaves the designer’s placeholder alone', () => {
  // Blanking it would silently delete design copy. Note this is NOT the same as
  // a hidden field, which IS removed — only an explicit rule may do that.
  const result = render(ARTWORK, layoutFor(), { guest_name: '' })
  assert.match(result.svg, />Bi\. Fabiola</)
  assert.match(result.svg, />KKKT Sala sala</)
})

test('the designer’s paint survives regeneration', () => {
  const result = render(ARTWORK, layoutFor(), { guest_name: 'John Doe' })
  assert.match(result.svg, /fill="#50315F"/)
  assert.match(result.svg, /font-family="Nexa"/)
})

test('an explicit visibility rule removes the element, and only it can', () => {
  const layout = layoutFor()
  layout.fields.fld_venue_1_place_1.visibleIf = { role: 'venue_1_place', op: 'present' }

  const hidden = render(ARTWORK, layout, { venue_1_place: '' })
  assert.doesNotMatch(hidden.svg, /KKKT Sala sala/)

  const shown = render(ARTWORK, layout, { venue_1_place: 'Azimio Hall' })
  assert.match(shown.svg, />Azimio Hall</)
})

test('colour fields go to the in-place path without being reported as a gap', () => {
  // A swatch is a filled shape, not a run of text. It has no geometry and never
  // will, so this is the other renderer doing the thing it is for.
  const svg = `<svg viewBox="0 0 300 400">
    <g id="palette_1"><rect x="0" y="0" width="10" height="10" fill="#000000"/></g>
    <g id="guest_name"><text x="150" y="240" font-family="Nexa" font-size="20" text-anchor="middle">Bi. Fabiola</text></g>
  </svg>`
  const bindings: CardFieldBinding[] = [
    { role: 'palette_1', layerIds: ['palette_1'], kind: 'colour' },
    { role: 'guest_name', layerIds: ['guest_name'] },
  ]
  const values = { palette_1: '#9FE870', guest_name: 'John Doe' }

  const plan = resolveCardLayout({
    layout: layoutFor(svg, bindings),
    state: 'active',
    values,
    metricsFor,
  })
  const result = renderPlanToSvg(svg, plan, bindings, values)

  assert.match(result.svg, /#9FE870/)
  assert.deepEqual(plan.deferredRoles, [])
  assert.ok(result.applied.includes('palette_1'))
})

test('a field whose layer vanished between resolve and render is handed back, not dropped', () => {
  const plan = resolve(layoutFor(), { guest_name: 'John Doe' })
  const reExported = ARTWORK.replace('id="guest_name"', 'id="guest_name_v2"')
  const result = renderPlanToSvg(reExported, plan, BINDINGS, { guest_name: 'John Doe' })

  assert.ok(result.deferred.includes('guest_name'))
  assert.ok(result.skipped.some((skip) => skip.reason === 'layer_missing'))
})

// ── The regression contract ──

test('a card with no layout fields renders byte-identically to the in-place path', () => {
  // Contract A: until a card is activated for layout, production output is
  // unchanged, byte for byte. That is what makes the rollout safe.
  const values = { guest_name: 'Bi. Fabiola', venue_1_place: 'KKKT Sala sala' }
  const empty: CardLayout = {
    version: 1,
    canvas: null,
    fields: {},
    elements: [],
    groups: [],
    safeZones: [],
    provenance: null,
  }
  const plan = resolveCardLayout({ layout: empty, state: 'none', values, metricsFor })

  assert.equal(
    renderPlanToSvg(ARTWORK, plan, BINDINGS, values).svg,
    renderCardSvg(ARTWORK, BINDINGS, values).svg,
  )
})

// ── Groups ──

test('a wrapped member pushes the ones below it down instead of overlapping them', () => {
  const svg = `<svg viewBox="0 0 300 400">
    <g id="venue_1_place"><text x="20" y="100" font-family="Nexa" font-size="10">Venue</text></g>
    <g id="contact_1"><text x="20" y="130" font-family="Nexa" font-size="10">0712 000 000</text></g>
  </svg>`
  const bindings: CardFieldBinding[] = [
    { role: 'venue_1_place', layerIds: ['venue_1_place'] },
    { role: 'contact_1', layerIds: ['contact_1'] },
  ]

  const layout = deriveLayout(extractArtworkGeometry(svg), bindings, () => HALF_EM)
  const venue = layout.fields.fld_venue_1_place_1
  const contact = layout.fields.fld_contact_1_1
  venue.localBox = { ...venue.localBox, w: 60 }
  venue.fit = { ...venue.fit, strategy: 'wrap', maxLines: 3 }
  venue.group = 'g1'
  contact.localBox = { ...contact.localBox, w: 120 }
  contact.group = 'g1'
  layout.groups = [
    {
      id: 'g1',
      members: [venue.id, contact.id],
      direction: 'vertical',
      gap: 5,
      anchor: 'start',
      bounds: null,
      overflow: 'block',
      collapseHidden: true,
    },
  ]

  const values = { venue_1_place: 'KKKT Sala sala JUU', contact_1: '0712 000 000' }
  const plan = resolveCardLayout({ layout, state: 'active', values, metricsFor })

  const venueBaselines = plan.fields[venue.id].lines.map((line) => line.baselineY)
  const contactBaseline = plan.fields[contact.id].lines[0].baselineY

  assert.ok(venueBaselines.length > 1, 'the venue should have wrapped')
  assert.ok(
    contactBaseline > Math.max(...venueBaselines),
    `contact at ${contactBaseline} must sit below the venue's last line at ${Math.max(...venueBaselines)}`,
  )
})

// ── Overrides applied through the whole pipeline ──

test("an admin's widened box is what the plan actually fits against", () => {
  const derived = deriveLayout(extractArtworkGeometry(ARTWORK), BINDINGS, () => HALF_EM)
  const widened = applyOverrides(derived, {
    fields: { fld_guest_name_1: { localBox: { x: 20, y: 224, w: 260, h: 20 } } },
  })
  const plan = resolveCardLayout({
    layout: widened,
    state: 'active',
    values: { guest_name: 'Jonathan Doe-Mwakatobe' },
    metricsFor,
  })

  const field: FieldLayout = widened.fields.fld_guest_name_1
  assert.equal(field.localBox.w, 260)
  assert.equal(plan.fields.fld_guest_name_1.fitStatus, 'fits')
})
