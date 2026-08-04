import assert from 'node:assert/strict'
import test from 'node:test'
import { CARD_FIELD_ROLES, renderCardSvg } from '@opusfesta/lib'
import {
  ACTIVE_LAYER_CLASS,
  PREVIEW_MESSAGES,
  PREVIEW_SAMPLE_VALUES,
  classifyPreview,
  layerElementId,
  markActiveLayer,
  sampledRoles,
} from './card-preview-sample'

/** Minimal artwork with the shapes the renderer cares about. */
const ARTWORK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1400">
<g id="couple_name_1"><text x="10" y="20">Moses Seeta</text></g>
<g id="couple_name_2"><text x="10" y="60">Dayness Mwandri</text></g>
<g id="Familia_ya"><text x="10" y="90">Familia ya</text></g>
<g id="palette_swatch_1"><rect width="10" height="10" fill="#b67c24"/></g>
</svg>`

// ── Sample values ──

test('every sampled role is a real role with a curated example', () => {
  for (const [key, value] of Object.entries(PREVIEW_SAMPLE_VALUES)) {
    const role = CARD_FIELD_ROLES.find((r) => r.key === key)
    assert.ok(role, `${key} is not a role`)
    assert.equal(value, role.example)
    assert.ok(value.trim().length > 0, `${key} sample is blank`)
  }
})

test('fixed design copy is never sampled, so the artwork keeps its own words', () => {
  for (const role of CARD_FIELD_ROLES.filter((r) => r.scope === 'template')) {
    assert.equal(PREVIEW_SAMPLE_VALUES[role.key], undefined, role.key)
  }
  assert.equal(PREVIEW_SAMPLE_VALUES.invite_line, undefined)
  assert.equal(PREVIEW_SAMPLE_VALUES.ampersand, undefined)
})

test('colour roles are never sampled, so the card keeps its own palette', () => {
  for (const role of CARD_FIELD_ROLES.filter((r) => r.kind === 'colour')) {
    assert.equal(PREVIEW_SAMPLE_VALUES[role.key], undefined, role.key)
  }
})

test('the personalisable text fields all have a sample', () => {
  const expected = CARD_FIELD_ROLES.filter(
    (r) => r.scope !== 'template' && r.kind !== 'colour',
  ).map((r) => r.key)
  assert.deepEqual(sampledRoles().sort(), expected.sort())
  // Guest name is the field an admin most needs to see land in the right place.
  assert.equal(PREVIEW_SAMPLE_VALUES.guest_name, 'Bi. Fabiola Thomas')
})

test('sample values are frozen, so a preview cannot mutate them for the next one', () => {
  try {
    ;(PREVIEW_SAMPLE_VALUES as Record<string, string>).guest_name = 'someone else'
  } catch {
    // Strict-mode runtimes throw for writes to frozen objects; other runtimes
    // silently ignore them. Both are valid Object.freeze behaviour.
  }
  assert.equal(PREVIEW_SAMPLE_VALUES.guest_name, 'Bi. Fabiola Thomas')
})

test('samples are deterministic across calls', () => {
  assert.deepEqual({ ...PREVIEW_SAMPLE_VALUES }, { ...PREVIEW_SAMPLE_VALUES })
})

// ── Rendering from unsaved, in-memory bindings ──

test('renders from bindings that were never saved', () => {
  // This is the whole point: the admin has just picked a role from a dropdown
  // and nothing has been written to the database.
  const unsaved = [{ role: 'couple_name_1', layerIds: ['couple_name_1'] }]
  const result = renderCardSvg(ARTWORK, unsaved, PREVIEW_SAMPLE_VALUES)
  assert.deepEqual(result.applied, ['couple_name_1'])
  assert.ok(result.svg.includes('Moses Seeta'))
})

test('re-binding a layer changes what the preview draws', () => {
  const before = renderCardSvg(
    ARTWORK,
    [{ role: 'couple_name_1', layerIds: ['couple_name_2'] }],
    PREVIEW_SAMPLE_VALUES,
  )
  const after = renderCardSvg(
    ARTWORK,
    [{ role: 'couple_name_2', layerIds: ['couple_name_2'] }],
    PREVIEW_SAMPLE_VALUES,
  )
  assert.ok(before.svg.includes('Moses Seeta'))
  assert.ok(after.svg.includes('Dayness Mwandri'))
})

test('an unmapped role writes nothing and is reported, not guessed', () => {
  const result = renderCardSvg(ARTWORK, [], PREVIEW_SAMPLE_VALUES)
  assert.deepEqual(result.applied, [])
  assert.equal(result.svg, ARTWORK)
})

test('a role bound to a layer this artwork lacks is skipped, not thrown', () => {
  const result = renderCardSvg(
    ARTWORK,
    [{ role: 'guest_name', layerIds: ['a_layer_from_an_older_export'] }],
    PREVIEW_SAMPLE_VALUES,
  )
  assert.deepEqual(result.applied, [])
  assert.deepEqual(
    result.skipped.map((s) => s.reason),
    ['layer_missing'],
  )
})

test('a fixed-copy binding leaves the designer text alone', () => {
  const result = renderCardSvg(
    ARTWORK,
    [{ role: 'hosts_intro', layerIds: ['Familia_ya'] }],
    PREVIEW_SAMPLE_VALUES,
  )
  assert.deepEqual(result.skipped.map((s) => s.reason), ['no_value'])
  assert.ok(result.svg.includes('Familia ya'))
})

test('a colour binding leaves the artwork fill alone', () => {
  const result = renderCardSvg(
    ARTWORK,
    [{ role: 'palette_1', layerIds: ['palette_swatch_1'], kind: 'colour' }],
    PREVIEW_SAMPLE_VALUES,
  )
  assert.deepEqual(result.skipped.map((s) => s.reason), ['no_value'])
  assert.ok(result.svg.includes('#b67c24'))
})

// ── Active-layer identification ──

test('the text-node suffix comes off to reach the element that carries the id', () => {
  assert.equal(layerElementId('Artboard_1_copy_2#2'), 'Artboard_1_copy_2')
  assert.equal(layerElementId('couple_name_1'), 'couple_name_1')
  assert.equal(layerElementId('Bi._Fabiola_Thomas'), 'Bi._Fabiola_Thomas')
})

test('marking tags the layer and uses more than colour to do it', () => {
  const marked = markActiveLayer(ARTWORK, 'couple_name_1')
  assert.ok(marked.includes(`<g class="${ACTIVE_LAYER_CLASS}" id="couple_name_1">`))
  // Colour channel.
  assert.ok(marked.includes('drop-shadow'))
  // Luminance-over-time channel, for anyone the colour does not reach.
  assert.ok(marked.includes('of-mapper-pulse'))
  assert.ok(marked.includes('prefers-reduced-motion: no-preference'))
})

test('the stylesheet names only the fixed class, never the layer id', () => {
  const marked = markActiveLayer(ARTWORK, 'couple_name_1')
  const style = marked.slice(marked.indexOf('<style>'), marked.indexOf('</style>'))
  assert.ok(style.includes(`.${ACTIVE_LAYER_CLASS}`))
  // The whole point: no position in the CSS an uploaded id can reach.
  assert.ok(!style.includes('couple_name_1'))
  assert.ok(!style.includes('[id='))
})

test('exactly one element is tagged', () => {
  const marked = markActiveLayer(ARTWORK, 'couple_name_1')
  assert.equal(marked.split(ACTIVE_LAYER_CLASS).length - 1, 3) // 1 attribute + 2 CSS rules
})

test('an existing class attribute is extended, not replaced', () => {
  const svg = '<svg viewBox="0 0 100 100"><g class="cls-3" id="x"><text>a</text></g></svg>'
  const marked = markActiveLayer(svg, 'x')
  assert.ok(marked.includes(`class="cls-3 ${ACTIVE_LAYER_CLASS}"`))
})

test('a self-closing element can be tagged', () => {
  const svg = '<svg viewBox="0 0 100 100"><rect id="x" width="4"/></svg>'
  const marked = markActiveLayer(svg, 'x')
  assert.ok(marked.includes(`<rect class="${ACTIVE_LAYER_CLASS}" id="x" width="4"/>`))
})

test('a lookalike attribute is not mistaken for the id', () => {
  // 'data-id="x"' ends with the same characters the search looks for.
  const svg = '<svg viewBox="0 0 100 100"><g data-id="x"><text>a</text></g></svg>'
  assert.equal(markActiveLayer(svg, 'x'), svg)
})

test('an id the artwork does not have leaves it untouched', () => {
  assert.equal(markActiveLayer(ARTWORK, 'a_layer_from_an_older_export'), ARTWORK)
})

// ── Text that looks like markup but is not ──
//
// All four of these were live defects: walking back to the nearest '<' found
// the one inside the inert text and rewrote it, corrupting the file while
// highlighting nothing on the card. Illustrator exports really do carry
// generator comments and <style> blocks, so this is not a hypothetical shape.

test('an element quoted inside a comment is not mistaken for the real one', () => {
  const svg = '<svg viewBox="0 0 10 10"><!-- <g id="x"/> --><g id="real"/></svg>'
  assert.equal(markActiveLayer(svg, 'x'), svg)
})

test('an element quoted inside a script is not mistaken for the real one', () => {
  const svg = `<svg viewBox="0 0 10 10"><script>var s='<g id="x">'</script><g id="real"/></svg>`
  assert.equal(markActiveLayer(svg, 'x'), svg)
})

test('an element quoted inside a stylesheet is not mistaken for the real one', () => {
  const svg = '<svg viewBox="0 0 10 10"><style>/* <g id="x"> */</style><g id="real"/></svg>'
  assert.equal(markActiveLayer(svg, 'x'), svg)
})

test('an element quoted inside CDATA is not mistaken for the real one', () => {
  const svg = '<svg viewBox="0 0 10 10"><![CDATA[ <g id="x"> ]]><g id="real"/></svg>'
  assert.equal(markActiveLayer(svg, 'x'), svg)
})

test('the real element is still found when an inert copy precedes it', () => {
  // The decisive case: skipping inert text must not mean skipping the layer.
  const svg =
    '<svg viewBox="0 0 10 10"><!-- <g id="x"/> --><style>/* <g id="x"> */</style><g id="x"><text>a</text></g></svg>'
  const marked = markActiveLayer(svg, 'x')
  assert.ok(marked.includes(`<g class="${ACTIVE_LAYER_CLASS}" id="x">`))
  // Exactly one element tagged: the comment and the stylesheet are untouched.
  assert.equal(marked.split(`class="${ACTIVE_LAYER_CLASS}"`).length - 1, 1)
  assert.ok(marked.includes('<!-- <g id="x"/> -->'))
  assert.ok(marked.includes('/* <g id="x"> */'))
})

test('a style or script element can itself carry the id being marked', () => {
  // Only the CONTENT is inert. The opening tag is a real element.
  const svg = '<svg viewBox="0 0 10 10"><style id="x">.a{fill:red}</style></svg>'
  assert.ok(markActiveLayer(svg, 'x').includes(`<style class="${ACTIVE_LAYER_CLASS}" id="x">`))
})

test('an unterminated comment does not swallow the rest of the file silently', () => {
  // Malformed artwork must degrade to "no highlight", never to a corrupt file.
  const svg = '<svg viewBox="0 0 10 10"><!-- <g id="x"/> <g id="x"/></svg>'
  assert.equal(markActiveLayer(svg, 'x'), svg)
})

test('marking is idempotent in shape: two passes tag one element each', () => {
  const svg = '<svg viewBox="0 0 10 10"><g id="x"><text>a</text></g></svg>'
  const once = markActiveLayer(svg, 'x')
  // The injected <style> is inert, so a second pass cannot find an id in it.
  const twice = markActiveLayer(once, 'x')
  assert.equal(twice.split(`class="${ACTIVE_LAYER_CLASS} ${ACTIVE_LAYER_CLASS}"`).length - 1, 1)
})

test('the halo scales to the artwork rather than assuming a canvas size', () => {
  const wide = markActiveLayer(
    '<svg viewBox="0 0 4000 4000"><g id="x"/></svg>',
    'x',
  )
  const narrow = markActiveLayer('<svg viewBox="0 0 100 100"><g id="x"/></svg>', 'x')
  assert.ok(wide.includes('20.00px'))
  assert.ok(narrow.includes('0.50px'))
})

test('a multi-text-node row highlights its parent layer', () => {
  const marked = markActiveLayer(ARTWORK, 'couple_name_1#2')
  assert.ok(marked.includes(`<g class="${ACTIVE_LAYER_CLASS}" id="couple_name_1">`))
})

test('nothing to highlight leaves the artwork byte-identical', () => {
  assert.equal(markActiveLayer(ARTWORK, null), ARTWORK)
  assert.equal(markActiveLayer(ARTWORK, ''), ARTWORK)
})

test('an id outside the shape the export pipeline produces is refused', () => {
  // Layer ids come from uploaded artwork, so they are untrusted input. None of
  // these can reach the stylesheet even if the allowlist were removed, because
  // the CSS names a fixed class — but they are refused before that matters.
  for (const evil of [
    'x" ] * { display: none } [id="y',
    'back\\slash',
    'x</style><script>alert(1)</script>',
    'has space',
    '1_leading_digit',
    '',
  ]) {
    assert.equal(markActiveLayer(ARTWORK, evil), ARTWORK, evil)
  }
})

test('the ids the real catalogue uses are all accepted', () => {
  const svg = (id: string) => `<svg viewBox="0 0 100 100"><g id="${id}"><text>a</text></g></svg>`
  for (const id of [
    'Bi._Fabiola_Thomas',
    'invite_line-2',
    'palette_swatch_1',
    'Artboard_1_copy_2',
    '_Kwa_Mama_Seeta_',
    'KKKT_Sala_sala_JUU',
    'Wedding_card_Image',
  ]) {
    assert.ok(markActiveLayer(svg(id), id).includes(ACTIVE_LAYER_CLASS), id)
  }
})

test('artwork with no svg element is passed through untouched', () => {
  assert.equal(markActiveLayer('not an svg at all', 'x'), 'not an svg at all')
})

test('the style block lands inside the svg, after the opening tag', () => {
  const marked = markActiveLayer(ARTWORK, 'couple_name_1')
  const svgOpen = marked.indexOf('<svg')
  const styleAt = marked.indexOf('<style>')
  const svgClose = marked.indexOf('</svg>')
  assert.ok(svgOpen < styleAt && styleAt < svgClose)
})

// ── Which panel the admin sees ──

const state = (over: Partial<Parameters<typeof classifyPreview>[0]> = {}) =>
  classifyPreview({
    artworkAttached: true,
    svg: '<svg/>',
    fetchFailed: false,
    renderFailed: false,
    ...over,
  })

test('a card with no artwork is not a failure, it is a card with no artwork', () => {
  assert.deepEqual(state({ artworkAttached: false }), { kind: 'no_artwork' })
  // Even mid-fetch or mid-failure, the absent artwork is the real story.
  assert.deepEqual(state({ artworkAttached: false, fetchFailed: true }), { kind: 'no_artwork' })
})

test('a download that has not finished is loading', () => {
  assert.deepEqual(state({ svg: null }), { kind: 'loading' })
})

test('a failed download beats loading, so the panel cannot spin forever', () => {
  // A failed fetch never sets svg, so without this precedence the two states
  // are identical from the outside and the spinner never stops.
  const result = state({ svg: null, fetchFailed: true })
  assert.equal(result.kind, 'network_error')
  assert.equal(result.kind === 'network_error' && result.retryable, true)
})

test('a renderer that threw is reported as not worth retrying', () => {
  const result = state({ renderFailed: true })
  assert.equal(result.kind, 'render_error')
  assert.equal(result.kind === 'render_error' && result.retryable, false)
})

test('artwork present and rendered is ready', () => {
  assert.deepEqual(state(), { kind: 'ready' })
})

test('no state leaks a storage, parser or font error to the admin', () => {
  // These carry bucket paths and provider hostnames. The raw text belongs in
  // the log, not on a screen someone may be sharing.
  for (const result of [
    state({ fetchFailed: true }),
    state({ renderFailed: true }),
  ]) {
    const message = 'message' in result ? result.message : ''
    assert.ok(Object.values(PREVIEW_MESSAGES).includes(message as never), message)
  }
})

test('marking composes with rendering without disturbing the applied text', () => {
  const rendered = renderCardSvg(
    ARTWORK,
    [{ role: 'couple_name_1', layerIds: ['couple_name_1'] }],
    PREVIEW_SAMPLE_VALUES,
  )
  const marked = markActiveLayer(rendered.svg, 'couple_name_1')
  assert.ok(marked.includes('Moses Seeta'))
  assert.ok(marked.includes(ACTIVE_LAYER_CLASS))
})
