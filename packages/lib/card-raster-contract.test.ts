import assert from 'node:assert/strict'
import test from 'node:test'
import {
  GUEST_PLACEHOLDER_SW,
  RASTERISABLE_FONT_FORMATS,
  assertGuestSubstituted,
  inkRatio,
  looksBlank,
  resolveRasterFonts,
  type RasterFontCandidate,
} from './card-raster-contract'

/** The four faces Royal Ivory resolves to in production, all cleared, all readable. */
const LIBRARY: RasterFontCandidate[] = [
  { faceId: 'f1', requiredPrimary: 'BookmanOldStyle', canonicalFamily: 'Bookman Old Style', weight: 400, italic: false, format: 'ttf', licenceCleared: true },
  { faceId: 'f2', requiredPrimary: 'BookmanOldStyle-Bold', canonicalFamily: 'Bookman Old Style', weight: 700, italic: false, format: 'ttf', licenceCleared: true },
  { faceId: 'f3', requiredPrimary: 'GreatVibes-Regular', canonicalFamily: 'Great Vibes', weight: 400, italic: false, format: 'ttf', licenceCleared: true },
  { faceId: 'f4', requiredPrimary: 'NexaBold', canonicalFamily: 'Nexa Bold', weight: 400, italic: false, format: 'otf', licenceCleared: true },
]

const ROYAL_IVORY_FONTS = ['BookmanOldStyle', 'BookmanOldStyle-Bold', 'GreatVibes-Regular', 'NexaBold']

test('resolves the reference card, including its otf face', () => {
  const result = resolveRasterFonts(ROYAL_IVORY_FONTS, LIBRARY)

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.faces.length, 4)
  assert.deepEqual(result.faceIds, ['f1', 'f2', 'f3', 'f4'])
  // otf must survive: NexaBold is otf on the live card, and resvg reads it.
  assert.ok(RASTERISABLE_FONT_FORMATS.includes('otf'))
})

test('keeps the two weights of one family apart', () => {
  const result = resolveRasterFonts(['BookmanOldStyle', 'BookmanOldStyle-Bold'], LIBRARY)

  assert.equal(result.ok, true)
  if (!result.ok) return
  const weights = result.faces.map((f) => f.weight).sort()
  // Collapsing these would put the guest name in the wrong weight.
  assert.deepEqual(weights, [400, 700])
  assert.deepEqual([...new Set(result.faces.map((f) => f.canonicalFamily))], ['Bookman Old Style'])
})

test('refuses a font the library does not hold', () => {
  const result = resolveRasterFonts([...ROYAL_IVORY_FONTS, 'MissingScript'], LIBRARY)

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, 'FONT_UNRESOLVED')
  assert.deepEqual(result.detail, ['MissingScript'])
})

test('refuses a woff face rather than rendering it blank', () => {
  const woffLibrary = LIBRARY.map((f) =>
    f.faceId === 'f3' ? { ...f, format: 'woff' } : f,
  )

  const result = resolveRasterFonts(ROYAL_IVORY_FONTS, woffLibrary)

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, 'FONT_FORMAT_UNSUPPORTED')
  assert.deepEqual(result.detail, ['GreatVibes-Regular (woff)'])
})

test('refuses an uncleared licence', () => {
  const unlicensed = LIBRARY.map((f) =>
    f.faceId === 'f4' ? { ...f, licenceCleared: false } : f,
  )

  const result = resolveRasterFonts(ROYAL_IVORY_FONTS, unlicensed)

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, 'FONT_NOT_LICENSED')
  assert.deepEqual(result.detail, ['NexaBold'])
})

test('reports every offender, not just the first', () => {
  const result = resolveRasterFonts(['NopeOne', 'NopeTwo', 'BookmanOldStyle'], LIBRARY)

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.deepEqual(result.detail, ['NopeOne', 'NopeTwo'])
})

test('unresolved outranks licence, licence outranks format', () => {
  // One card with all three problems must complain in a stable order, so the
  // same broken card never produces a different error on a retry.
  const messy: RasterFontCandidate[] = [
    { ...LIBRARY[0], licenceCleared: false },
    { ...LIBRARY[1], format: 'woff2' },
  ]

  const all = resolveRasterFonts(['BookmanOldStyle', 'BookmanOldStyle-Bold', 'Ghost'], messy)
  assert.equal(all.ok, false)
  if (!all.ok) assert.equal(all.code, 'FONT_UNRESOLVED')

  const noGhost = resolveRasterFonts(['BookmanOldStyle', 'BookmanOldStyle-Bold'], messy)
  assert.equal(noGhost.ok, false)
  if (!noGhost.ok) assert.equal(noGhost.code, 'FONT_NOT_LICENSED')

  const formatOnly = resolveRasterFonts(['BookmanOldStyle-Bold'], messy)
  assert.equal(formatOnly.ok, false)
  if (!formatOnly.ok) assert.equal(formatOnly.code, 'FONT_FORMAT_UNSUPPORTED')
})

test('one face serving many layers is reported once', () => {
  const result = resolveRasterFonts(
    ['Ghost', 'Ghost', 'Ghost', 'BookmanOldStyle'],
    LIBRARY,
  )

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.deepEqual(result.detail, ['Ghost'])
})

test('an empty required list resolves to nothing to supply', () => {
  const result = resolveRasterFonts([], LIBRARY)

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.faceIds, [])
})

// ── Output checks ──────────────────────────────────────────────────────────

test('ink ratio separates an all-white buffer from a drawn one', () => {
  const white = new Uint8Array(1000).fill(0xff)
  const drawn = new Uint8Array(1000).fill(0x10)

  assert.equal(inkRatio(white), 0)
  assert.equal(inkRatio(drawn), 1)
  assert.equal(looksBlank(white), true)
  assert.equal(looksBlank(drawn), false)
})

test('looksBlank catches nothing-drew but says nothing about correctness', () => {
  // A wrong-font card has entirely normal coverage. This is the documented
  // limit of the check, pinned so nobody later mistakes it for a completeness
  // guarantee.
  const normalCoverage = new Uint8Array(1000)
  normalCoverage.fill(0xff)
  for (let i = 0; i < 300; i++) normalCoverage[i] = 0x00

  assert.equal(looksBlank(normalCoverage), false)
})

test('an empty buffer is blank rather than a divide by zero', () => {
  assert.equal(inkRatio(new Uint8Array(0)), 0)
  assert.equal(looksBlank(new Uint8Array(0)), true)
})

// ── Guest substitution ─────────────────────────────────────────────────────

test('accepts a card that really carries this guest', () => {
  const svg = '<text>Bw. Juma Ally</text><text>Samuel &amp; Jennifer</text>'

  assert.deepEqual(assertGuestSubstituted(svg, 'Bw. Juma Ally', ['guest_name']), { ok: true })
})

test('accepts a guest whose name the renderer had to XML-escape', () => {
  // "Mr & Mrs Ngando" is written into the markup as "Mr &amp; Mrs Ngando".
  // Searching for the raw form failed every guest with an ampersand in the
  // name, and reported it as an unmapped guest layer.
  const svg = '<text>Mr &amp; Mrs Ngando</text>'

  assert.deepEqual(assertGuestSubstituted(svg, 'Mr & Mrs Ngando', ['guest_name']), { ok: true })
})

test('still rejects an escaping guest name the card does not carry', () => {
  const result = assertGuestSubstituted('<text>Mr &amp; Mrs Other</text>', 'Mr & Mrs Ngando', [
    'guest_name',
  ])

  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.reason, /not present/)
})

test('rejects a card where the renderer never applied the role', () => {
  const result = assertGuestSubstituted('<text>Bw. Juma Ally</text>', 'Bw. Juma Ally', [])

  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.reason, /did not apply guest_name/)
})

test('rejects a card whose markup does not contain the name', () => {
  const result = assertGuestSubstituted('<text>somebody else</text>', 'Bw. Juma Ally', ['guest_name'])

  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.reason, /not present/)
})

test('rejects a surviving placeholder', () => {
  // A second guest layer left unwritten: the card names the guest once and the
  // placeholder once, which is worse than either alone.
  const svg = `<text>Bw. Juma Ally</text><text>${GUEST_PLACEHOLDER_SW}</text>`

  const result = assertGuestSubstituted(svg, 'Bw. Juma Ally', ['guest_name'])

  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.reason, /placeholder/)
})

test('rejects an empty guest name before it reaches a card', () => {
  const result = assertGuestSubstituted('<text>x</text>', '   ', ['guest_name'])

  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.reason, /empty/)
})
