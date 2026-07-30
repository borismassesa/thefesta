import assert from 'node:assert/strict'
import test from 'node:test'
import { extractCardTextLayers, humaniseLayerName, inspectCardArtwork } from './card-svg-fields'

// Trimmed from apps/opus_pass/public/assets/invitation-svgs/card-template.svg —
// the real Illustrator export, including the decorative three-<text> title and
// the shapes-only Background group.
const ILLUSTRATOR_CARD = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 700">
  <g id="Background">
    <rect width="500" height="700" fill="#fffdf8"/>
    <polygon points="322.34 336.34 330.42 328.26"/>
  </g>
  <g id="Event_Title">
    <text class="st6" transform="translate(121.63 176.51)"><tspan x="0" y="0">Save</tspan></text>
    <text class="st6" transform="translate(117.88 263.25)"><tspan x="0" y="0">Date</tspan></text>
    <text class="st8" transform="translate(206.87 208.56)"><tspan x="0" y="0">the</tspan></text>
  </g>
  <g id="Intro">
    <text class="st7" transform="translate(151.68 359.81)"><tspan x="0" y="0">for the wedding of</tspan></text>
  </g>
  <g id="Names">
    <text class="st11" transform="translate(110.37 389.15)"><tspan x="0" y="0">ROMEO &amp; JULIET</tspan></text>
  </g>
  <g id="Date">
    <text class="st4" transform="translate(181.86 438.76)"><tspan x="0" y="0">18.08.18</tspan></text>
  </g>
</svg>`

// The hand-written treatment SVGs put ids directly on <text> instead.
const HAND_WRITTEN_CARD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
  <rect id="bg-rect" width="300" height="420" fill="#fff"/>
  <text id="names-text" x="150" y="190" text-anchor="middle">Amani &amp; Zawadi</text>
  <line id="accent-line" x1="100" y1="210" x2="200" y2="210"/>
  <text id="date-text" x="150" y="232" text-anchor="middle">14 Machi 2026</text>
</svg>`

test('reads named layers from an Illustrator export', () => {
  const layers = extractCardTextLayers(ILLUSTRATOR_CARD)
  const byId = Object.fromEntries(layers.map((l) => [l.id, l]))

  assert.equal(byId.Names.sampleText, 'ROMEO & JULIET', 'entities must be decoded')
  assert.equal(byId.Names.textNodeCount, 1)
  assert.equal(byId.Date.sampleText, '18.08.18')
  assert.equal(byId.Intro.sampleText, 'for the wedding of')
})

test('keeps document order so the form reads like the card', () => {
  assert.deepEqual(
    extractCardTextLayers(ILLUSTRATOR_CARD).map((l) => l.id),
    ['Event_Title', 'Intro', 'Names', 'Date'],
  )
})

test('drops named groups that hold no text', () => {
  const ids = extractCardTextLayers(ILLUSTRATOR_CARD).map((l) => l.id)
  assert.ok(!ids.includes('Background'), 'Background is shapes only — not a field')
})

test('flags decorative lettering via textNodeCount', () => {
  const title = extractCardTextLayers(ILLUSTRATOR_CARD).find((l) => l.id === 'Event_Title')
  // "Save" / "Date" / "the" are three separately-positioned nodes. The parser
  // surfaces the layer and lets the admin decide; it must not silently drop it.
  assert.equal(title?.textNodeCount, 3)
  assert.equal(title?.sampleText, 'Save Date the')
})

test('reads ids sitting directly on <text>', () => {
  const layers = extractCardTextLayers(HAND_WRITTEN_CARD)
  const ids = layers.map((l) => l.id)
  assert.deepEqual(ids, ['names-text', 'date-text'])
  assert.equal(layers[0].sampleText, 'Amani & Zawadi')
  // Self-closing shapes must not be pushed onto the nesting stack, or every
  // later layer would inherit their id.
  assert.ok(!ids.includes('bg-rect'))
  assert.ok(!ids.includes('accent-line'))
})

test('innermost named group wins over an organisational wrapper', () => {
  const nested = `<svg><g id="Text_Layer"><g id="Venue"><text>KKKT Sala sala</text></g></g></svg>`
  const layers = extractCardTextLayers(nested)
  assert.deepEqual(layers.map((l) => l.id), ['Venue'])
  assert.equal(layers[0].sampleText, 'KKKT Sala sala')
})

test('merges a layer split across several text nodes', () => {
  const split = `<svg><g id="Contacts">
    <text><tspan>Bi. Suzan +255 755 000 850</tspan></text>
    <text><tspan>Anita +255 756 089 282</tspan></text>
  </g></svg>`
  const [contacts] = extractCardTextLayers(split)
  assert.equal(contacts.textNodeCount, 2)
  assert.equal(contacts.sampleText, 'Bi. Suzan +255 755 000 850 Anita +255 756 089 282')
})

test('survives artwork with no text at all', () => {
  assert.deepEqual(extractCardTextLayers('<svg><rect id="bg" width="10" height="10"/></svg>'), [])
})

test('a stray close tag does not corrupt later layers', () => {
  const messy = `<svg></span><g id="Names"><text>Amani</text></g></svg>`
  assert.deepEqual(extractCardTextLayers(messy).map((l) => l.id), ['Names'])
})

test('humanises designer layer names', () => {
  assert.equal(humaniseLayerName('Event_Title'), 'Event title')
  assert.equal(humaniseLayerName('dress-code'), 'Dress code')
  assert.equal(humaniseLayerName('eventTitle'), 'Event title')
  assert.equal(humaniseLayerName('Rsvp'), 'Rsvp')
  assert.equal(humaniseLayerName('Names'), 'Names')
  // Never return empty — the id is the fallback label.
  assert.equal(humaniseLayerName('__'), '__')
})

test('reports rasterised layers that can never be personalised', () => {
  // Shape of the live Opus Royal Ivory date block: a named group wrapping an
  // embedded PNG, with no <text> anywhere inside.
  const rasterDate = `<svg>
    <g id="date_day_Image" data-name="date_day Image"><image id="date_day_Image-2" width="71" height="44" xlink:href="data:image/png;base64,AAAA"/></g>
    <g id="Names"><text>Amani &amp; Zawadi</text></g>
  </svg>`
  const { textLayers, rasterLayers } = inspectCardArtwork(rasterDate)

  assert.deepEqual(textLayers.map((l) => l.id), ['Names'], 'only Names is fillable')

  const date = rasterLayers.find((l) => l.id === 'date_day_Image')
  assert.ok(date, 'the rasterised date must be reported, not silently ignored')
  assert.equal(date.width, '71')
  assert.equal(date.height, '44')
})

test('artwork with no bitmaps reports no raster layers', () => {
  assert.deepEqual(inspectCardArtwork(ILLUSTRATOR_CARD).rasterLayers, [])
})

test('a self-closing image does not swallow the layers after it', () => {
  const svg = `<svg><image id="bg" width="500" height="700" xlink:href="data:image/png;base64,AA"/><g id="Venue"><text>KKKT</text></g></svg>`
  const { textLayers } = inspectCardArtwork(svg)
  assert.deepEqual(textLayers.map((l) => l.id), ['Venue'])
})

test('detects vector shape layers so colour fields can be mapped', () => {
  // What a swatch looks like once exported properly. Without this it is
  // invisible to the mapper, and the colour fields have nothing to bind to.
  const svg = `<svg>
    <g id="palette_swatch_1"><circle cx="20" cy="20" r="20" fill="#7A1F2B"/></g>
    <g id="palette_swatch_2"><rect width="40" height="40"/></g>
    <g id="Names"><text><tspan>ROMEO</tspan></text></g>
  </svg>`
  const { shapeLayers, textLayers } = inspectCardArtwork(svg)

  assert.deepEqual(shapeLayers.map((l) => l.id), ['palette_swatch_1', 'palette_swatch_2'])
  assert.equal(shapeLayers[0].currentFill, '#7A1F2B', 'the current colour helps the admin recognise it')
  assert.equal(shapeLayers[1].currentFill, null, 'a shape with no fill is still mappable')
  assert.deepEqual(textLayers.map((l) => l.id), ['Names'])
})

test('a layer with text is not also reported as a shape layer', () => {
  // Decorative rules and underlines live inside text layers; reporting them as
  // colour candidates would fill the mapper with noise.
  const svg = `<svg><g id="Names"><rect width="10" height="1" fill="#000"/><text>ROMEO</text></g></svg>`
  const { shapeLayers, textLayers } = inspectCardArtwork(svg)
  assert.deepEqual(shapeLayers, [])
  assert.deepEqual(textLayers.map((l) => l.id), ['Names'])
})

test('a bitmap layer is not reported as a shape layer', () => {
  const svg = `<svg><g id="bg_Image"><image width="10" height="10" xlink:href="data:image/png;base64,AA"/></g></svg>`
  const { shapeLayers, rasterLayers } = inspectCardArtwork(svg)
  assert.deepEqual(shapeLayers, [])
  assert.deepEqual(rasterLayers.map((l) => l.id), ['bg_Image'])
})
