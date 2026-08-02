import assert from 'node:assert/strict'
import test from 'node:test'
import { escapeXmlText, renderCardSvg, renderCardsForGuests } from './card-render'
import type { CardFieldBinding } from './card-field-roles'

// Shape of the live Opus Royal Ivory export: named groups wrapping a single
// <text><tspan>, plus a rasterised layer and a multi-layer date intro.
const CARD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1062 1416">
  <g id="Bi._Fabiola_Thomas"><text class="st1" transform="translate(10 20)"><tspan x="0" y="0">Bi. Fabiola Thomas</tspan></text></g>
  <g id="KKKT_Sala_sala_JUU"><text class="st2" transform="translate(10 60)"><tspan x="0" y="0">KKKT Sala sala JUU</tspan></text></g>
  <g id="couple_name_1_Image"><image width="250" height="55" xlink:href="data:image/png;base64,AAAA"/></g>
  <g id="Itakayofanyika"><text><tspan x="0" y="0">Itakayofanyika</tspan></text></g>
  <g id="Jumamosi"><text><tspan x="0" y="0">Jumamosi</tspan></text></g>
  <g id="tarehe"><text><tspan x="0" y="0">tarehe</tspan></text></g>
</svg>`

const BINDINGS: CardFieldBinding[] = [
  { role: 'guest_name', layerIds: ['Bi._Fabiola_Thomas'] },
  { role: 'venue_1_place', layerIds: ['KKKT_Sala_sala_JUU'] },
  { role: 'couple_name_1', layerIds: ['couple_name_1_Image'], rasterised: true },
  { role: 'date_intro', layerIds: ['Itakayofanyika', 'Jumamosi', 'tarehe'] },
]

test('writes a value into its layer', () => {
  const { svg, applied } = renderCardSvg(CARD, BINDINGS, { venue_1_place: 'Mlimani City Hall' })
  assert.ok(applied.includes('venue_1_place'))
  assert.match(svg, /<tspan x="0" y="0">Mlimani City Hall<\/tspan>/)
  assert.doesNotMatch(svg, /KKKT Sala sala JUU/, 'the placeholder must be gone')
})

test('leaves the surrounding artwork untouched', () => {
  const { svg } = renderCardSvg(CARD, BINDINGS, { venue_1_place: 'Mlimani City Hall' })
  // Attributes carry the typesetting — losing them would move the text.
  assert.match(svg, /<text class="st2" transform="translate\(10 60\)">/)
  assert.match(svg, /viewBox="0 0 1062 1416"/)
  // Other layers keep their content.
  assert.match(svg, /Bi\. Fabiola Thomas/)
})

test('escapes XML so a name with an ampersand cannot corrupt the file', () => {
  const { svg } = renderCardSvg(CARD, BINDINGS, { venue_1_place: 'Bi & Bw <Seeta>' })
  assert.match(svg, /Bi &amp; Bw &lt;Seeta&gt;/)
  assert.doesNotMatch(svg, /Bi & Bw/, 'a raw ampersand would make the SVG unparseable')
})

test('escapeXmlText handles the three dangerous characters', () => {
  assert.equal(escapeXmlText('a & b < c > d'), 'a &amp; b &lt; c &gt; d')
})

test('refuses to write into a rasterised layer', () => {
  const { svg, applied, skipped } = renderCardSvg(CARD, BINDINGS, { couple_name_1: 'Moses Seeta' })
  assert.ok(!applied.includes('couple_name_1'))
  assert.deepEqual(
    skipped.find((s) => s.role === 'couple_name_1')?.reason,
    'rasterised',
  )
  assert.doesNotMatch(svg, /Moses Seeta/, 'the name must not be injected into a bitmap layer')
})

test('refuses to split one value across a multi-layer role', () => {
  // 'Itakayofanyika Jumamosi tarehe' is three separately-positioned words; one
  // string cannot be distributed across them without inventing a layout.
  const { applied, skipped } = renderCardSvg(CARD, BINDINGS, { date_intro: 'Itafanyika Jumapili' })
  assert.ok(!applied.includes('date_intro'))
  assert.equal(skipped.find((s) => s.role === 'date_intro')?.reason, 'multi_layer')
})

test('an absent value leaves the design copy alone', () => {
  // Blanking would silently delete artwork text.
  const { svg, skipped } = renderCardSvg(CARD, BINDINGS, {})
  assert.match(svg, /KKKT Sala sala JUU/)
  assert.equal(skipped.find((s) => s.role === 'venue_1_place')?.reason, 'no_value')
})

test('an empty string counts as no value', () => {
  const { svg, skipped } = renderCardSvg(CARD, BINDINGS, { venue_1_place: '   ' })
  assert.match(svg, /KKKT Sala sala JUU/)
  assert.equal(skipped.find((s) => s.role === 'venue_1_place')?.reason, 'no_value')
})

test('reports a binding whose layer is not in the artwork', () => {
  const stale: CardFieldBinding[] = [{ role: 'contact_1', layerIds: ['Removed_By_Reexport'] }]
  const { applied, skipped } = renderCardSvg(CARD, stale, { contact_1: '+255 755 000 850' })
  assert.deepEqual(applied, [])
  assert.equal(skipped[0].reason, 'layer_missing')
})

test('refuses a layer whose text is split across several runs', () => {
  // Each fragment carries its own coordinates; collapsing them into one run
  // would destroy the typesetting.
  const multi = `<svg><g id="Contacts">
    <text><tspan x="0" y="0">Bi. Suzan</tspan></text>
    <text><tspan x="0" y="20">Anita Isaac</tspan></text>
  </g></svg>`
  const { applied, skipped } = renderCardSvg(
    multi,
    [{ role: 'contact_1', layerIds: ['Contacts'] }],
    { contact_1: 'New contact' },
  )
  assert.deepEqual(applied, [])
  assert.equal(skipped[0].reason, 'complex_text')
})

test('writes several fields in one pass without corrupting offsets', () => {
  // Values of very different lengths, applied back-to-front.
  const { svg, applied } = renderCardSvg(CARD, BINDINGS, {
    guest_name: 'Bw. A',
    venue_1_place: 'A very much longer venue name than the original placeholder',
  })
  assert.deepEqual(applied.sort(), ['guest_name', 'venue_1_place'])
  assert.match(svg, /<tspan x="0" y="0">Bw\. A<\/tspan>/)
  assert.match(svg, /A very much longer venue name than the original placeholder/)
  // The multi-layer date intro is still intact.
  assert.match(svg, /Itakayofanyika/)
})

test('the rendered card is still well-formed enough to re-read', () => {
  const { svg } = renderCardSvg(CARD, BINDINGS, { guest_name: 'Bi. Neema & Co' })
  // Tag counts must be unchanged — only character data was replaced.
  const tags = (s: string) => (s.match(/<[a-zA-Z][^>]*>/g) ?? []).length
  assert.equal(tags(svg), tags(CARD))
})

test('one card per guest, differing only in the guest name', () => {
  const cards = renderCardsForGuests(
    CARD,
    BINDINGS,
    { venue_1_place: 'Mlimani City Hall' },
    ['Bi. Fabiola Thomas', 'Bw. Juma Ally', 'Bi. Neema Said'],
  )
  assert.equal(cards.length, 3)
  for (const card of cards) {
    assert.ok(card.result.applied.includes('guest_name'))
    // The shared field is on every copy.
    assert.match(card.result.svg, /Mlimani City Hall/)
    assert.match(card.result.svg, new RegExp(card.guestName.replace('.', '\\.')))
  }
  // Each card carries its own guest and not the others. Compared on the
  // rendered TEXT, not the whole file: the layer id is literally
  // "Bi._Fabiola_Thomas" (the designer named layers after the sample content),
  // and an id is never drawn.
  const rendered = (svg: string) => (svg.match(/<tspan[^>]*>([^<]*)<\/tspan>/g) ?? []).join(' | ')
  assert.match(rendered(cards[1].result.svg), /Bw\. Juma Ally/)
  assert.doesNotMatch(rendered(cards[1].result.svg), /Fabiola/)
})

test('no guests produces no cards rather than one blank card', () => {
  assert.deepEqual(renderCardsForGuests(CARD, BINDINGS, {}, []), [])
})

// ── Colour fields ─────────────────────────────────────────────────────────
// A swatch is a filled shape, so a colour is written as a `fill` attribute
// rather than as text content.

const SWATCH_CARD = `<svg xmlns="http://www.w3.org/2000/svg">
  <g id="palette_swatch_1"><circle cx="20" cy="20" r="20" fill="#CCCCCC"/></g>
  <g id="palette_swatch_2"><rect width="40" height="40"/></g>
  <g id="palette_swatch_3"><image width="43" height="43" xlink:href="data:image/png;base64,AA"/></g>
  <g id="Names"><text><tspan>ROMEO &amp; JULIET</tspan></text></g>
</svg>`

const SWATCH_BINDINGS: CardFieldBinding[] = [
  { role: 'palette_1', layerIds: ['palette_swatch_1'], kind: 'colour' },
  { role: 'palette_2', layerIds: ['palette_swatch_2'], kind: 'colour' },
  { role: 'palette_3', layerIds: ['palette_swatch_3'], kind: 'colour', rasterised: true },
]

test('a colour replaces an existing fill', () => {
  const { svg, applied } = renderCardSvg(SWATCH_CARD, SWATCH_BINDINGS, { palette_1: '#7A1F2B' })
  assert.ok(applied.includes('palette_1'))
  assert.match(svg, /<circle cx="20" cy="20" r="20" fill="#7A1F2B"\/>/)
  assert.doesNotMatch(svg, /#CCCCCC/, 'the placeholder colour must be gone')
})

test('a colour is added to a shape that has no fill', () => {
  const { svg, applied } = renderCardSvg(SWATCH_CARD, SWATCH_BINDINGS, { palette_2: '#C8A35C' })
  assert.ok(applied.includes('palette_2'))
  assert.match(svg, /<rect fill="#C8A35C" width="40" height="40"\/>/)
})

test('short hex is accepted', () => {
  const { applied } = renderCardSvg(SWATCH_CARD, SWATCH_BINDINGS, { palette_1: '#abc' })
  assert.ok(applied.includes('palette_1'))
})

test('a non-hex colour is refused rather than injected', () => {
  // 'red; filter:url(#x)' would otherwise become arbitrary CSS in the artwork.
  for (const bad of ['red', 'url(#evil)', 'rgb(1,2,3)', '#12345', 'javascript:x']) {
    const { applied, skipped } = renderCardSvg(SWATCH_CARD, SWATCH_BINDINGS, { palette_1: bad })
    assert.deepEqual(applied, [], `${bad} must not be applied`)
    assert.equal(skipped.find((s) => s.role === 'palette_1')?.reason, 'bad_colour')
  }
})

test('a rasterised swatch is still refused', () => {
  const { svg, skipped } = renderCardSvg(SWATCH_CARD, SWATCH_BINDINGS, { palette_3: '#A6B89A' })
  assert.equal(skipped.find((s) => s.role === 'palette_3')?.reason, 'rasterised')
  assert.doesNotMatch(svg, /#A6B89A/)
})

test('a colour bound to a layer with no shape is reported', () => {
  const textOnly: CardFieldBinding[] = [{ role: 'palette_1', layerIds: ['Names'], kind: 'colour' }]
  const { applied, skipped } = renderCardSvg(SWATCH_CARD, textOnly, { palette_1: '#7A1F2B' })
  assert.deepEqual(applied, [])
  assert.equal(skipped[0].reason, 'no_fillable_shape')
})

test('colours and text apply together without corrupting offsets', () => {
  const { svg, applied } = renderCardSvg(SWATCH_CARD, [...SWATCH_BINDINGS, { role: 'couple_name_1', layerIds: ['Names'] }], {
    palette_1: '#7A1F2B',
    palette_2: '#C8A35C',
    couple_name_1: 'Amani & Zawadi',
  })
  assert.deepEqual(applied.sort(), ['couple_name_1', 'palette_1', 'palette_2'])
  assert.match(svg, /fill="#7A1F2B"/)
  assert.match(svg, /fill="#C8A35C"/)
  assert.match(svg, /Amani &amp; Zawadi/)
})

test('the artwork is still valid after a colour render', () => {
  const { svg } = renderCardSvg(SWATCH_CARD, SWATCH_BINDINGS, { palette_1: '#7A1F2B', palette_2: '#C8A35C' })
  const tags = (s: string) => (s.match(/<[a-zA-Z][^>]*>/g) ?? []).length
  assert.equal(tags(svg), tags(SWATCH_CARD))
})

// ── Writing colour into off-spec exports ──
// The rule these share: whatever we write must actually WIN. A colour that is
// reported as applied but loses to a stylesheet is the worst outcome available,
// because nothing downstream knows the card is wrong.

test('a class-styled swatch is overridden by an inline style, not a losing attribute', () => {
  const svg = `<svg><defs><style>.cls-2{fill:#024231;}</style></defs>` +
    `<g id="palette_swatch_1"><circle class="cls-2" cx="1" cy="1" r="1"/></g></svg>`
  const { svg: out, applied } = renderCardSvg(
    svg,
    [{ role: 'palette_1', layerIds: ['palette_swatch_1'], kind: 'colour' }],
    { palette_1: '#7A1F2B' },
  )
  assert.deepEqual(applied, ['palette_1'])
  // A bare fill attribute here would render as #024231 despite being "applied".
  assert.match(out, /style="fill:#7A1F2B"/)
  assert.doesNotMatch(out, /<circle[^>]*\sfill="#7A1F2B"/)
})

test('an existing inline fill is overwritten in place', () => {
  const svg = `<svg><g id="palette_swatch_1"><circle style="opacity:1;fill:#024231" cx="1" cy="1" r="1"/></g></svg>`
  const { svg: out, applied } = renderCardSvg(
    svg,
    [{ role: 'palette_1', layerIds: ['palette_swatch_1'], kind: 'colour' }],
    { palette_1: '#7A1F2B' },
  )
  assert.deepEqual(applied, ['palette_1'])
  assert.match(out, /style="opacity:1;fill:#7A1F2B"/)
})

test('a swatch named on the shape itself can still be coloured', () => {
  const svg = `<svg><g id="Wedding_card_Image"><image width="10" height="10" xlink:href="data:image/png;base64,AA"/>` +
    `<circle id="palette_swatch_1" cx="1" cy="1" r="1" fill="#024231"/></g></svg>`
  const { svg: out, applied } = renderCardSvg(
    svg,
    [{ role: 'palette_1', layerIds: ['palette_swatch_1'], kind: 'colour' }],
    { palette_1: '#7A1F2B' },
  )
  assert.deepEqual(applied, ['palette_1'])
  assert.match(out, /fill="#7A1F2B"/)
})

test('a role left pointing at a stale layer and a live one is refused', () => {
  // Guards the regression a re-export causes: the mapper used to keep the old
  // id alongside the new one, and two layers on one colour is not renderable.
  const svg = `<svg><g id="palette_swatch_1"><circle cx="1" cy="1" r="1" fill="#024231"/></g></svg>`
  const { applied, skipped } = renderCardSvg(
    svg,
    [{ role: 'palette_1', layerIds: ['palette_swatch_1_Image', 'palette_swatch_1'], kind: 'colour' }],
    { palette_1: '#7A1F2B' },
  )
  assert.deepEqual(applied, [])
  assert.equal(skipped[0].reason, 'multi_layer')
})

test('a stale binding reports the mapping problem, not the old rasterised flag', () => {
  // The flag describes the export the card was mapped against. Reporting it
  // after a re-export tells the designer to redo work they have already done.
  const svg = `<svg><g id="palette_swatch_1"><circle cx="1" cy="1" r="1" fill="#024231"/></g></svg>`
  const { skipped } = renderCardSvg(
    svg,
    [{ role: 'palette_1', layerIds: ['palette_swatch_1_Image'], kind: 'colour', rasterised: true }],
    { palette_1: '#7A1F2B' },
  )
  assert.equal(skipped[0].reason, 'layer_missing')
})

test('a layer the artwork really does bake in is still reported as rasterised', () => {
  const { skipped } = renderCardSvg(CARD, BINDINGS, { couple_name_1: 'Moses Seeta' })
  const couple = skipped.find((s) => s.role === 'couple_name_1')
  assert.equal(couple?.reason, 'rasterised')
})

// ── Kerned text and unnamed groups ──
// Illustrator emits one tspan per kerning adjustment, and does not always wrap
// the first character. Both shapes appear on the reference card's date.

test('a kerned run collapses to one tspan and stays balanced', () => {
  // 'AGOSTI' as Illustrator exports it: four fragments of one run.
  const svg =
    `<svg><g id="date_month"><text transform="translate(573 720)" font-size="23">` +
    `<tspan letter-spacing="-0.02em">A</tspan><tspan x="16.74" y="0">G</tspan>` +
    `<tspan x="33.51" y="0">O</tspan><tspan x="52.02" y="0">STI</tspan></text></g></svg>`
  const { svg: out, applied } = renderCardSvg(
    svg,
    [{ role: 'date_month', layerIds: ['date_month'] }],
    { date_month: 'DESEMBA' },
  )
  assert.deepEqual(applied, ['date_month'])
  assert.match(out, /<tspan letter-spacing="-0\.02em">DESEMBA<\/tspan>/)
  assert.doesNotMatch(out, /AGOSTI|STI/)
  // The <text>'s own typesetting must survive.
  assert.match(out, /transform="translate\(573 720\)" font-size="23"/)
  assert.equal((out.match(/<tspan\b/g) ?? []).length, (out.match(/<\/tspan>/g) ?? []).length)
})

test('a run starting outside a tspan does not leave a stray closer', () => {
  // The year: '2' sits directly in the <text>, the rest in tspans. Replacing
  // naively removes the openers and leaves '</tspan>' behind, which is invalid
  // XML and renders as a broken card with no error raised anywhere.
  const svg =
    `<svg><g id="date_year"><text>2<tspan x="15" y="0">0</tspan><tspan x="30" y="0">26</tspan></text></g></svg>`
  const { svg: out, applied } = renderCardSvg(
    svg,
    [{ role: 'date_year', layerIds: ['date_year'] }],
    { date_year: '2027' },
  )
  assert.deepEqual(applied, ['date_year'])
  assert.match(out, /<text>2027<\/text>/)
  assert.equal((out.match(/<tspan\b/g) ?? []).length, (out.match(/<\/tspan>/g) ?? []).length)
})

test('a run ending outside a tspan is closed rather than left open', () => {
  const svg = `<svg><g id="x"><text><tspan>A</tspan>B</text></g></svg>`
  const { svg: out } = renderCardSvg(svg, [{ role: 'venue_1_place', layerIds: ['x'] }], {
    venue_1_place: 'Mlimani',
  })
  assert.equal((out.match(/<tspan\b/g) ?? []).length, (out.match(/<\/tspan>/g) ?? []).length)
  assert.match(out, /Mlimani/)
})

test('two text nodes in one unnamed group become two mappable fields', () => {
  // The reference card leaves the month and the year loose in the artboard
  // group, so the layer as a whole reads 'AGOSTI 2026' and maps to neither.
  const svg =
    `<svg><g id="Artboard_1"><text><tspan>AGOSTI</tspan></text><text><tspan>2026</tspan></text></g></svg>`
  const { applied, skipped } = renderCardSvg(
    svg,
    [
      { role: 'date_month', layerIds: ['Artboard_1#1'] },
      { role: 'date_year', layerIds: ['Artboard_1#2'] },
    ],
    { date_month: 'DESEMBA', date_year: '2027' },
  )
  assert.deepEqual(applied.sort(), ['date_month', 'date_year'])
  assert.deepEqual(skipped, [])
})

test('the whole group is still refused, since it holds two different fields', () => {
  const svg =
    `<svg><g id="Artboard_1"><text><tspan>AGOSTI</tspan></text><text><tspan>2026</tspan></text></g></svg>`
  const { applied, skipped } = renderCardSvg(
    svg,
    [{ role: 'date_month', layerIds: ['Artboard_1'] }],
    { date_month: 'DESEMBA' },
  )
  assert.deepEqual(applied, [])
  assert.equal(skipped[0].reason, 'complex_text')
})
