import assert from 'node:assert/strict'
import test from 'node:test'
import { isPinComplete, pinCardFonts, type PinnableFace } from './card-raster-fonts'

// The four faces Royal Ivory actually resolves to in production, read off the
// admin Typefaces panel. Two of them are the same family at different weights,
// which is the case that makes pinning necessary at all.
const ROYAL_IVORY_FACES: PinnableFace[] = [
  { requiredPrimary: 'BookmanOldStyle', canonicalFamily: 'Bookman Old Style', weight: 400, italic: false },
  { requiredPrimary: 'BookmanOldStyle-Bold', canonicalFamily: 'Bookman Old Style', weight: 700, italic: false },
  { requiredPrimary: 'GreatVibes-Regular', canonicalFamily: 'Great Vibes', weight: 400, italic: false },
  { requiredPrimary: 'NexaBold', canonicalFamily: 'Nexa Bold', weight: 400, italic: false },
]

test('pins the regular body face to its canonical family and weight', () => {
  const svg = '<text font-family="BookmanOldStyle, Bookman Old Style">Familia ya</text>'

  const { svg: out, pinned, unresolved, elementsRewritten } = pinCardFonts(svg, ROYAL_IVORY_FACES)

  assert.match(out, /font-family="Bookman Old Style"/)
  assert.match(out, /font-weight="400"/)
  assert.match(out, /font-style="normal"/)
  // The PostScript name must be gone: leaving it would let resvg skip it and
  // resolve on whatever came second.
  assert.doesNotMatch(out, /BookmanOldStyle/)
  assert.deepEqual(pinned, ['BookmanOldStyle'])
  assert.deepEqual(unresolved, [])
  assert.equal(elementsRewritten, 1)
})

test('pins the BOLD face of the same family to weight 700', () => {
  // This is Bi._Fabiola_Thomas, the guest-name layer, the one field guest
  // delivery substitutes. Getting it wrong is wrong on every guest card.
  const svg =
    '<text font-family="BookmanOldStyle-Bold, Bookman Old Style" font-weight="700">Bi. Fabiola Thomas</text>'

  const { svg: out } = pinCardFonts(svg, ROYAL_IVORY_FACES)

  assert.match(out, /font-family="Bookman Old Style"/)
  assert.match(out, /font-weight="700"/)
})

test('states the weight even when the artwork omitted it', () => {
  // The measured failure: a bold PostScript name with no font-weight resolves to
  // the REGULAR face in resvg. Pinning has to supply the weight itself.
  const svg = '<text font-family="BookmanOldStyle-Bold, Bookman Old Style">Bi. Fabiola Thomas</text>'

  const { svg: out } = pinCardFonts(svg, ROYAL_IVORY_FACES)

  assert.match(out, /font-weight="700"/)
})

test('never leaves two font-weights on one element', () => {
  const svg = '<text font-weight="400" font-family="BookmanOldStyle-Bold, Bookman Old Style">x</text>'

  const { svg: out } = pinCardFonts(svg, ROYAL_IVORY_FACES)

  assert.equal(out.match(/font-weight=/g)?.length, 1)
  assert.match(out, /font-weight="700"/)
})

test('reports an unmatched font instead of guessing at it', () => {
  const svg = '<text font-family="SomeFontWeDoNotHold, Some Font">Familia ya</text>'

  const { svg: out, unresolved, elementsRewritten } = pinCardFonts(svg, ROYAL_IVORY_FACES)

  assert.deepEqual(unresolved, ['SomeFontWeDoNotHold'])
  assert.equal(elementsRewritten, 0)
  // Left byte-identical: a guess here ships a card in the wrong typeface.
  assert.equal(out, svg)
})

test('an unresolved font makes the card unsafe to rasterise', () => {
  const result = pinCardFonts('<text font-family="Nope, Nope">x</text>', ROYAL_IVORY_FACES)

  assert.equal(isPinComplete(result, true), false)
})

test('a card whose text was all pinned is safe', () => {
  const result = pinCardFonts(
    '<text font-family="GreatVibes-Regular, Great Vibes">Samuel</text>',
    ROYAL_IVORY_FACES,
  )

  assert.equal(isPinComplete(result, true), true)
})

test('text that pinned nothing is unsafe when the artwork has text', () => {
  // Guards the silent case: fonts all matched, yet no element was rewritten,
  // which means the rewrite missed the elements that actually draw the text.
  const empty = pinCardFonts('<rect width="10" height="10"/>', ROYAL_IVORY_FACES)

  assert.equal(empty.elementsRewritten, 0)
  assert.equal(isPinComplete(empty, true), false)
  // A purely decorative card with no text is legitimately fine.
  assert.equal(isPinComplete(empty, false), true)
})

test('pins tspans as well as text, and leaves inheriting elements alone', () => {
  const svg =
    '<text font-family="GreatVibes-Regular, Great Vibes">' +
    '<tspan x="0">Samuel</tspan>' +
    '<tspan x="0" font-family="NexaBold, Nexa Bold">10</tspan>' +
    '</text>'

  const { svg: out, elementsRewritten, pinned } = pinCardFonts(svg, ROYAL_IVORY_FACES)

  // The bare tspan inherits and must not be touched; the other two state a
  // family of their own and get pinned.
  assert.equal(elementsRewritten, 2)
  assert.deepEqual(pinned.sort(), ['GreatVibes-Regular', 'NexaBold'])
  assert.match(out, /<tspan x="0">Samuel<\/tspan>/)
  assert.match(out, /font-family="Nexa Bold"/)
})

test('matches however the artwork spelled the name', () => {
  // normaliseFontKey collapses case, spaces, hyphens and underscores, so the
  // same face is found whether the export wrote the PostScript name or the
  // family. Regular and bold must still stay distinct.
  const spaced = pinCardFonts('<text font-family="bookman old style">x</text>', ROYAL_IVORY_FACES)
  assert.match(spaced.svg, /font-weight="400"/)

  const bold = pinCardFonts('<text font-family="bookmanoldstyle-bold">x</text>', ROYAL_IVORY_FACES)
  assert.match(bold.svg, /font-weight="700"/)
})

test('a quote in a family name cannot break out of the attribute', () => {
  const faces: PinnableFace[] = [
    { requiredPrimary: 'Evil', canonicalFamily: 'Ev"il" onload=x', weight: 400, italic: false },
  ]

  const { svg: out } = pinCardFonts('<text font-family="Evil">x</text>', faces)

  assert.doesNotMatch(out, /onload="/)
  assert.equal(out.match(/"/g)?.length, 6) // family, weight, style: three pairs
})

test('carries italic through as a style, not a family suffix', () => {
  const faces: PinnableFace[] = [
    { requiredPrimary: 'Thing-Italic', canonicalFamily: 'Thing', weight: 400, italic: true },
  ]

  const { svg: out } = pinCardFonts('<text font-family="Thing-Italic, Thing">x</text>', faces)

  assert.match(out, /font-style="italic"/)
  assert.match(out, /font-family="Thing"/)
})
