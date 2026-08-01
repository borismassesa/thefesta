import assert from 'node:assert/strict'
import test from 'node:test'
import { parseFontFamilyList, readClassFonts, readRequiredFonts } from '@opusfesta/lib'

// The three ways Illustrator can declare a typeface. All three appear in real
// exports, and a scanner that handles only the first reports a false clean bill
// of health on the other two.

test('reads a font declared as a presentation attribute', () => {
  const svg = `<svg><g id="couple_name_1"><text font-family="GreatVibes-Regular, Great Vibes" font-size="40"><tspan>Moses</tspan></text></g></svg>`
  const fonts = readRequiredFonts(svg)
  assert.equal(fonts.length, 1)
  assert.equal(fonts[0].primary, 'GreatVibes-Regular')
  assert.deepEqual(fonts[0].families, ['GreatVibes-Regular', 'Great Vibes'])
  assert.equal(fonts[0].weight, 400)
  assert.deepEqual(fonts[0].layerIds, ['couple_name_1'])
})

test('reads a font declared by an Internal CSS class', () => {
  // Illustrator's DEFAULT export mode. Missing this reports "needs no fonts".
  const svg =
    `<svg><defs><style>.cls-7{font-family:BookmanOldStyle, Bookman Old Style;}</style></defs>` +
    `<g id="hosts_names"><text class="cls-7"><tspan>Bw &amp; Bi Seeta</tspan></text></g></svg>`
  const fonts = readRequiredFonts(svg)
  assert.equal(fonts.length, 1, 'an Internal CSS export must not report zero fonts')
  assert.equal(fonts[0].primary, 'BookmanOldStyle')
})

test('inherits a font declared on an enclosing group', () => {
  const svg =
    `<svg><g font-family="Nexa Bold"><g id="date_month"><text><tspan>AGOSTI</tspan></text></g></g></svg>`
  const fonts = readRequiredFonts(svg)
  assert.equal(fonts[0].primary, 'Nexa Bold')
  assert.deepEqual(fonts[0].layerIds, ['date_month'])
})

test('an inline style outranks both a class and an attribute', () => {
  const svg =
    `<svg><defs><style>.cls-1{font-family:FromClass;}</style></defs>` +
    `<g id="x"><text class="cls-1" font-family="FromAttribute" style="font-family:FromInline"><tspan>A</tspan></text></g></svg>`
  assert.equal(readRequiredFonts(svg)[0].primary, 'FromInline')
})

test('a class outranks a presentation attribute', () => {
  const svg =
    `<svg><defs><style>.cls-1{font-family:FromClass;}</style></defs>` +
    `<g id="x"><text class="cls-1" font-family="FromAttribute"><tspan>A</tspan></text></g></svg>`
  assert.equal(readRequiredFonts(svg)[0].primary, 'FromClass')
})

test('font-style="italic" is not mistaken for an inline style attribute', () => {
  // `\b` in an attribute regex matches the `style` inside `font-style`, which
  // would read "italic" as the element's inline style.
  const svg = `<svg><g id="x"><text font-family="Some Face" font-style="italic"><tspan>A</tspan></text></g></svg>`
  const fonts = readRequiredFonts(svg)
  assert.equal(fonts[0].primary, 'Some Face')
  assert.equal(fonts[0].italic, true)
})

test('regular and bold are reported as the two separate faces they are', () => {
  const svg =
    `<svg><g id="a"><text font-family="BookmanOldStyle, Bookman Old Style"><tspan>A</tspan></text></g>` +
    `<g id="b"><text font-family="BookmanOldStyle-Bold, Bookman Old Style" font-weight="700"><tspan>B</tspan></text></g></svg>`
  const fonts = readRequiredFonts(svg)
  assert.equal(fonts.length, 2, 'they need two uploads and two @font-face rules')
  assert.deepEqual(fonts.map((f) => f.weight).sort(), [400, 700])
})

test('collects the code points each face has to draw', () => {
  const svg = `<svg><g id="ampersand"><text font-family="Great Vibes"><tspan>&amp;</tspan></text></g></svg>`
  const [font] = readRequiredFonts(svg)
  // Entities must be decoded, or the coverage check tests 'a','m','p' not '&'.
  assert.deepEqual(font.codePoints, ['&'.codePointAt(0)])
})

test('whitespace is not counted as a glyph', () => {
  const svg = `<svg><g id="x"><text font-family="F"><tspan>A B</tspan></text></g></svg>`
  const [font] = readRequiredFonts(svg)
  assert.deepEqual(font.codePoints, ['A'.codePointAt(0), 'B'.codePointAt(0)])
})

test('CSS inside a style block is never sampled as drawn text', () => {
  const svg =
    `<svg><defs><style>.cls-1{font-family:Bookman;}</style></defs>` +
    `<g id="x"><text class="cls-1"><tspan>Hi</tspan></text></g></svg>`
  const [font] = readRequiredFonts(svg)
  assert.deepEqual(font.codePoints, ['H'.codePointAt(0), 'i'.codePointAt(0)])
})

test('artwork with no text needs no fonts', () => {
  assert.deepEqual(readRequiredFonts('<svg><circle fill="#000" r="1"/></svg>'), [])
})

test('bold and normal keywords resolve to numeric weights', () => {
  const svg = `<svg><g id="x"><text font-family="F" font-weight="bold"><tspan>A</tspan></text></g></svg>`
  assert.equal(readRequiredFonts(svg)[0].weight, 700)
})

test('a class can contribute family and weight from separate rules', () => {
  // Illustrator routinely splits these: one rule sets the family for several
  // classes, another adds a weight to one of them.
  const svg =
    `<svg><defs><style>.cls-7,.cls-8{font-family:Bookman;}.cls-8{font-weight:700;}</style></defs>` +
    `<g id="x"><text class="cls-8"><tspan>A</tspan></text></g></svg>`
  const [font] = readRequiredFonts(svg)
  assert.equal(font.primary, 'Bookman')
  assert.equal(font.weight, 700)
})

test('readClassFonts merges properties across rules', () => {
  const fonts = readClassFonts(
    `<style>.cls-7,.cls-9{font-family:Bookman;}.cls-9{font-style:italic;}</style>`,
  )
  assert.equal(fonts.get('cls-7')?.family, 'Bookman')
  assert.equal(fonts.get('cls-9')?.family, 'Bookman')
  assert.equal(fonts.get('cls-9')?.style, 'italic')
  assert.equal(fonts.get('cls-7')?.style, undefined)
})

test('the real Opus Royal Ivory style block resolves to the right faces', () => {
  // Verbatim from the live Internal CSS export, which is the shape that would
  // otherwise report zero. Verified against the full 2 MB file: it yields
  // BookmanOldStyle w400 and BookmanOldStyle-Bold w700.
  const svg =
    `<svg viewBox="0 0 1062 1416"><defs><style>.cls-1{isolation:isolate;}.cls-2{fill:#024231;}` +
    `.cls-7{font-size:20.83px;}.cls-7,.cls-9{font-family:BookmanOldStyle, Bookman Old Style;}` +
    `.cls-8{font-size:29.17px;font-family:BookmanOldStyle-Bold, Bookman Old Style;font-weight:700;}` +
    `.cls-9{font-size:25px;}</style></defs>` +
    `<g id="Artboard_1_copy_2" class="cls-1">` +
    `<g id="Familia_ya"><text class="cls-7"><tspan>Familia ya</tspan></text></g>` +
    `<g id="Bi._Fabiola_Thomas"><text class="cls-8"><tspan>Bi. Fabiola Thomas</tspan></text></g>` +
    `<g id="RANGI"><text class="cls-9"><tspan>RANGI</tspan></text></g>` +
    `</g></svg>`
  const fonts = readRequiredFonts(svg)
  assert.deepEqual(
    fonts.map((f) => `${f.primary}/${f.weight}`),
    ['BookmanOldStyle/400', 'BookmanOldStyle-Bold/700'],
  )
  // cls-9 takes its family from the shared rule, so RANGI joins the regular face.
  const regular = fonts.find((f) => f.weight === 400)
  assert.ok(regular?.layerIds.includes('RANGI'))
  assert.ok(regular?.layerIds.includes('Familia_ya'))
  // The bold face is a separate upload, not a synthesised bold.
  assert.deepEqual(fonts.find((f) => f.weight === 700)?.layerIds, ['Bi._Fabiola_Thomas'])
})

test('parseFontFamilyList strips quotes and whitespace', () => {
  assert.deepEqual(parseFontFamilyList(`'Great Vibes' , "GreatVibes-Regular"`), [
    'Great Vibes',
    'GreatVibes-Regular',
  ])
})
