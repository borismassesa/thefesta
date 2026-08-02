import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pinCardFonts, type PinnableFace } from '@opusfesta/lib'
import { mapWithConcurrency, rasteriseCard } from './raster'

// Golden coverage for the raster step.
//
// Deliberately NOT the live Royal Ivory export or its licensed typefaces: a
// customer's card and a commercial font binary do not belong in the repository.
// The fixture is a synthetic card in the same shape as a real one (named layer
// groups, a text run per field, Illustrator's "PostScriptName, Real Family"
// font list) and the font is Dancing Script, already committed under the SIL
// Open Font Licence for the entrance-pass ticket.
//
// The live export stays an out-of-repo integration fixture.

const FONT_PATH = path.join(process.cwd(), 'public/fonts/DancingScript-Regular.ttf')
const FONT_BYTES = new Uint8Array(readFileSync(FONT_PATH))

const FACE: PinnableFace = {
  requiredPrimary: 'DancingScript-Regular',
  canonicalFamily: 'Dancing Script',
  weight: 400,
  italic: false,
}

/** A card in the shape the real exports take, with a guest layer to substitute. */
function fixture(guestName: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400">
  <rect width="600" height="400" fill="#ffffff"/>
  <g id="Familia_ya"><text x="40" y="80" font-size="28" font-family="DancingScript-Regular, Dancing Script">Familia ya</text></g>
  <g id="guest_layer"><text x="40" y="160" font-size="36" font-family="DancingScript-Regular, Dancing Script">${guestName}</text></g>
  <g id="couple_name_1"><text x="40" y="260" font-size="44" font-family="DancingScript-Regular, Dancing Script">Samuel Hawassi</text></g>
</svg>`
}

function pinned(guestName: string): string {
  const result = pinCardFonts(fixture(guestName), [FACE])
  assert.deepEqual(result.unresolved, [], 'fixture must resolve its own font')
  assert.equal(result.elementsRewritten, 3)
  return result.svg
}

test('rasterises a pinned card to a non-blank png of the expected size', async () => {
  const result = await rasteriseCard({ svg: pinned('Bw. Juma Ally'), fonts: [{ face: FACE, bytes: FONT_BYTES }], widthPx: 600 })

  assert.equal(result.ok, true, result.ok ? '' : `failed: ${result.code} ${result.detail?.join('; ')}`)
  if (!result.ok) return
  assert.equal(result.width, 600)
  // 600x400 viewBox rendered at width 600 keeps its aspect ratio.
  assert.equal(result.height, 400)
  assert.equal(result.sha256.length, 64)
  assert.ok(result.png.length > 2000, `expected real ink, got ${result.png.length} bytes`)
})

test('two guests differ in the png and nowhere else', async () => {
  // The whole point of the delivery path. If these two ever come out identical,
  // every guest received a card addressed to somebody else.
  const first = await rasteriseCard({ svg: pinned('Bw. Juma Ally'), fonts: [{ face: FACE, bytes: FONT_BYTES }], widthPx: 600 })
  const second = await rasteriseCard({ svg: pinned('Bi. Neema Said'), fonts: [{ face: FACE, bytes: FONT_BYTES }], widthPx: 600 })

  assert.equal(first.ok && second.ok, true)
  if (!first.ok || !second.ok) return
  assert.notEqual(first.sha256, second.sha256)
  assert.equal(first.width, second.width)
  assert.equal(first.height, second.height)
})

test('the same guest twice is byte-identical, so retries are idempotent', async () => {
  const a = await rasteriseCard({ svg: pinned('Bw. Juma Ally'), fonts: [{ face: FACE, bytes: FONT_BYTES }], widthPx: 600 })
  const b = await rasteriseCard({ svg: pinned('Bw. Juma Ally'), fonts: [{ face: FACE, bytes: FONT_BYTES }], widthPx: 600 })

  assert.equal(a.ok && b.ok, true)
  if (!a.ok || !b.ok) return
  // A stable hash is what lets a delivery asset be reused instead of re-minted.
  assert.equal(a.sha256, b.sha256)
})

test('refuses text with no fonts instead of rendering a card with no names', async () => {
  const result = await rasteriseCard({ svg: pinned('Bw. Juma Ally'), fonts: [], widthPx: 600 })

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, 'FONT_UNRESOLVED')
})

test('an unpinned family is refused, because resvg would silently substitute', async () => {
  // Measured behaviour, and the reason this guard exists at all: an unresolvable
  // family does NOT render blank while any font is loaded. resvg falls back to a
  // supplied face, and on this single-font fixture the bytes come out IDENTICAL
  // to a correctly pinned render. On a card with four faces that is the silent
  // wrong-typeface failure, invisible to any output measurement.
  const unpinned = fixture('Bw. Juma Ally').replace(/Dancing Script/g, 'Nonexistent Family')

  const result = await rasteriseCard({ svg: unpinned, fonts: [{ face: FACE, bytes: FONT_BYTES }], widthPx: 600 })

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, 'FONT_UNRESOLVED')
  // The offending name is the FIRST family entry, which is what resolution uses.
  assert.deepEqual(result.detail, ['DancingScript-Regular'])
})

// The companion claim, that ink coverage cannot distinguish a wrong-font card
// from a right one, is pinned in packages/lib/card-raster-contract.test.ts. It
// cannot be demonstrated here: proving it needs two visually distinct typefaces
// and the repository holds exactly one rasterisable OFL font.

test('rejects an empty svg', async () => {
  const result = await rasteriseCard({ svg: '   ', fonts: [], widthPx: 600 })

  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'SVG_INVALID')
})

test('reports malformed markup rather than throwing', async () => {
  // No <text>, so this reaches the parser instead of the fonts guard.
  const result = await rasteriseCard({ svg: '<svg><rect width=', fonts: [], widthPx: 600 })

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.ok(['SVG_INVALID', 'RASTER_FAILED'].includes(result.code), `got ${result.code}`)
})

test('clamps an absurd width instead of allocating for it', async () => {
  const result = await rasteriseCard({ svg: pinned('Bw. Juma Ally'), fonts: [{ face: FACE, bytes: FONT_BYTES }], widthPx: 99_999 })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.width, 2048)
})

test('bounded concurrency keeps order and never exceeds its limit', async () => {
  const items = Array.from({ length: 12 }, (_, i) => i)
  let inFlight = 0
  let peak = 0

  const out = await mapWithConcurrency(items, 3, async (item) => {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    await new Promise((r) => setTimeout(r, item % 3 === 0 ? 8 : 1))
    inFlight -= 1
    return item * 2
  })

  assert.deepEqual(out, items.map((i) => i * 2))
  assert.ok(peak <= 3, `peak concurrency was ${peak}`)
  assert.ok(peak > 1, 'should actually run in parallel')
})
