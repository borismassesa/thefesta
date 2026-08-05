// How wide a piece of text is, in the one place both sides can agree on it.
//
// The Studio has to show an admin whether a name fits. The server has to decide
// whether a release is safe to freeze. If those two answer differently, the
// preview lies, and an admin signs off a card that goes out clipped.
//
// The obvious implementations both fail that test. Canvas `measureText` in the
// browser measures whatever face the browser resolved, which is not necessarily
// the face resvg will pick. fontkit on the server can't run in the browser at
// all. So neither side measures a FONT: both read the same table of numbers,
// extracted once when the font was uploaded and stored on the card_fonts row,
// and run the identical arithmetic over it.
//
// What this deliberately does NOT model:
//
//   KERNING and LIGATURES  resvg applies them; we do not. On Latin text at
//                          invitation sizes the difference is a fraction of a
//                          percent, and modelling it would mean shipping the
//                          GPOS/GSUB tables to the browser. It is absorbed by
//                          the fit margin in card-fit.ts instead, and only ever
//                          in the safe direction.
//   SHAPING                no bidi, no Indic reordering. The catalogue is
//                          Swahili and English. A script needing shaping would
//                          need a different measurement path, and reporting an
//                          honest 'unmeasurable' is the correct answer until
//                          then.

/**
 * A font's advance widths, in font design units.
 *
 * Design units rather than pixels because the table is size-independent: one
 * extraction serves every size the face is ever set at. Divide by `unitsPerEm`
 * and multiply by the font size to get user units.
 */
export type FontMetrics = {
  /** Design units per em. 1000 for most CFF fonts, 2048 for most TrueType. */
  unitsPerEm: number
  ascender: number
  descender: number
  /** The face's own preferred line spacing, when it declares one. */
  lineGap: number
  /** Code point → advance width, keyed as a decimal string so it survives JSON. */
  advances: Record<string, number>
  /** Advance used for a code point the face has no glyph for. */
  fallbackAdvance: number
}

/** How a run measured, and whether the answer can be trusted. */
export type Measurement = {
  /** Width in user units at the requested size, tracking included. */
  width: number
  /** Code points the face has no glyph for. */
  missing: number[]
}

export const isFontMetrics = (value: unknown): value is FontMetrics => {
  if (typeof value !== 'object' || value === null) return false
  const m = value as Partial<FontMetrics>
  return (
    typeof m.unitsPerEm === 'number' &&
    m.unitsPerEm > 0 &&
    typeof m.advances === 'object' &&
    m.advances !== null
  )
}

/**
 * A face in the library, reduced to what measuring needs.
 *
 * `primary` is the name the ARTWORK asks for, not the font's own family, which
 * is the same key buildFontFaceCss registers the @font-face under — so the face
 * the browser resolves and the table we measure with are the same one by
 * construction, rather than by two lookups that could disagree.
 */
export type MeasurableFace = {
  primary: string
  weight: number
  italic: boolean
  metrics: FontMetrics | null
}

export type MetricsIndex = Map<string, FontMetrics>

/** The comparison form of a font name. Mirrors normaliseFontKey. */
function normalise(name: string): string {
  return name.toLowerCase().replace(/['"]/g, '').replace(/[\s_-]+/g, '')
}

function faceKey(primary: string, weight: number, italic: boolean): string {
  return `${normalise(primary)}|${weight}|${italic}`
}

export function buildMetricsIndex(faces: MeasurableFace[]): MetricsIndex {
  const index: MetricsIndex = new Map()
  for (const face of faces) {
    if (face.metrics) index.set(faceKey(face.primary, face.weight, face.italic), face.metrics)
  }
  return index
}

/**
 * The metrics for a run, or null.
 *
 * Families are tried in the order the artwork lists them, which for an
 * Illustrator export means the PostScript name first — the same order CSS
 * resolves in, so we measure whatever the renderer will actually draw.
 *
 * A face at the wrong weight is NOT accepted as a substitute. Measuring Bold
 * with Regular advances understates every width, which would let a name through
 * that then ships clipped — the precise failure this table exists to prevent.
 * Reporting null is the honest answer, and it blocks.
 */
export function lookupMetrics(
  index: MetricsIndex,
  families: string[],
  weight: number,
  italic: boolean,
): FontMetrics | null {
  for (const family of families) {
    const found = index.get(faceKey(family, weight, italic))
    if (found) return found
  }
  return null
}

/**
 * The width of a single line.
 *
 * Tracking is applied BETWEEN characters, not after the last one, which is what
 * SVG and CSS both do. Adding it after every character overstates a short run
 * by a whole letter-space and makes the fitter shrink text that already fitted.
 */
export function measureRun(
  text: string,
  metrics: FontMetrics,
  fontSize: number,
  letterSpacing = 0,
): Measurement {
  const chars = [...text]
  if (chars.length === 0) return { width: 0, missing: [] }

  const scale = fontSize / metrics.unitsPerEm
  const missing: number[] = []
  let units = 0

  for (const char of chars) {
    const code = char.codePointAt(0)!
    const advance = metrics.advances[String(code)]
    if (advance === undefined) {
      // Whitespace has no glyph in some faces but always has an advance, so a
      // missing space is a table gap rather than a coverage problem.
      if (code > 32) missing.push(code)
      units += metrics.fallbackAdvance
    } else {
      units += advance
    }
  }

  return { width: units * scale + letterSpacing * (chars.length - 1), missing }
}

/**
 * The height of one line at a given size.
 *
 * Uses the face's own ascent/descent rather than the font size, because a
 * script face routinely draws well outside its em box — measuring a Great Vibes
 * line as one em tall would let two lines overlap by a third of their height.
 */
export function lineHeightFor(metrics: FontMetrics, fontSize: number, multiplier = 1): number {
  const perEm = (metrics.ascender - metrics.descender + metrics.lineGap) / metrics.unitsPerEm
  // A face with a broken or absent vertical table would collapse every line on
  // top of the last, so fall back to the size itself rather than to zero.
  return (perEm > 0 ? perEm : 1) * fontSize * multiplier
}

/**
 * Break a run into lines that each fit `maxWidth`.
 *
 * Breaks on spaces only. A word longer than the box is left ON ITS OWN LINE and
 * left too wide rather than broken mid-word: hyphenating 'Mwakipesile' into
 * 'Mwakipe-sile' on a wedding invitation is a worse outcome than a name the
 * fitter then shrinks to make fit. The caller sees the overlong line in the
 * returned widths and can act on it.
 */
export function wrapRun(
  text: string,
  metrics: FontMetrics,
  fontSize: number,
  letterSpacing: number,
  maxWidth: number,
): { lines: string[]; widths: number[] } {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return { lines: [], widths: [] }

  const lines: string[] = []
  const widths: number[] = []
  let current = ''

  const widthOf = (value: string) => measureRun(value, metrics, fontSize, letterSpacing).width

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (!current || widthOf(candidate) <= maxWidth) {
      current = candidate
      continue
    }
    lines.push(current)
    widths.push(widthOf(current))
    current = word
  }
  lines.push(current)
  widths.push(widthOf(current))

  return { lines, widths }
}
