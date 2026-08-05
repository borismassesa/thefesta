// Reading a designer's font file well enough to file it in the library.
//
// Designers deliver a folder of fonts alongside a design. Nobody should have to
// type a font's name to register it: the name is already inside the binary, in
// the OpenType `name` table, and typing it by hand across a thousand cards is
// both slow and a source of mismatches the matcher would then fail to resolve.
//
// Deliberately NOT in @opusfesta/lib. The pure scanner and matcher belong there
// because both apps and the future raster path need them, but fontkit is a
// Node-side binary parser and re-exporting it from the shared package's index
// would drag it into every client bundle that imports anything from @opusfesta/lib.
//
// Two rules this module exists to enforce:
//
//   1. Validate by MAGIC BYTES, never by the browser's declared MIME type.
//      Browsers report .otf and .ttf as 'application/octet-stream', 'font/sfnt'
//      or '' depending on platform, so the declared type tells us nothing.
//
//   2. SANITISE the name table. These strings end up inside a <style> block in
//      an SVG served to the couple. A font whose family name is
//      `X"};</style><script>...` escapes both the rule and the element. This is
//      the only place that check can be made once and relied on everywhere, so
//      a hostile file is rejected here rather than defended against downstream.

import * as fontkit from 'fontkit'
import { normaliseFontKey } from '@opusfesta/lib'

export type FontFormat = 'ttf' | 'otf' | 'woff' | 'woff2'

export type ParsedFont = {
  format: FontFormat
  familyName: string
  subfamilyName: string
  fullName: string
  postscriptName: string
  /** Name IDs 16/17, present on families with more than four faces. */
  typographicFamily: string | null
  typographicSubfamily: string | null
  weightClass: number
  isItalic: boolean
  glyphCount: number
  /** Normalised names this face answers to, for the matcher. */
  matchKeys: string[]
  fsTypeNoEmbedding: boolean
  fsTypeViewOnly: boolean
  fsTypeNoSubsetting: boolean
}

export type ParseFontResult = { ok: true; font: ParsedFont } | { ok: false; reason: string }

/**
 * Characters that would break out of a CSS declaration or the <style> element
 * that contains it. A legitimate font name contains none of these.
 */
const UNSAFE_NAME = /[{}<>;"'\\]|[\u0000-\u001f\u007f]/

/** Longest name we will store. Real font names are far shorter. */
const MAX_NAME_LENGTH = 120

function readFormat(bytes: Uint8Array): FontFormat | 'ttc' | null {
  if (bytes.length < 4) return null
  const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
  if (tag === 'wOFF') return 'woff'
  if (tag === 'wOF2') return 'woff2'
  if (tag === 'OTTO') return 'otf'
  if (tag === 'ttcf') return 'ttc'
  if (tag === 'true' || tag === 'typ1') return 'ttf'
  // The bare version tag 0x00010000.
  if (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0) return 'ttf'
  return null
}

/**
 * Whether a font name can be written into a stylesheet unescaped.
 *
 * Exported so the guarantee is directly testable. These strings end up inside
 * `<style>@font-face{font-family:"..."}` in an SVG that the `<img>` preview
 * path renders with no sanitiser in between, so this predicate is the only
 * thing standing between a designer's binary and a script tag.
 */
export function isSafeFontName(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH && !UNSAFE_NAME.test(trimmed)
}

/**
 * A name we are willing to put in a stylesheet, or null.
 *
 * Returns null rather than escaping, because a font whose name needs escaping
 * is not a font we want in the library: legitimate names never contain these
 * characters, so their presence means the file is either corrupt or hostile.
 */
function safeName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return isSafeFontName(trimmed) ? trimmed : null
}

/**
 * Read a font file's identity, or say why it can't be used.
 *
 * Never throws: a designer dropping a folder in will include a .DS_Store, a
 * licence PDF and a stray .zip, and each of those needs a readable reason next
 * to its filename rather than a failed upload with no explanation.
 */
export function parseFontFile(input: Buffer | Uint8Array): ParseFontResult {
  const bytes = input instanceof Buffer ? input : Buffer.from(input)

  const format = readFormat(bytes)
  if (!format) {
    return { ok: false, reason: 'Not a font file (no recognisable OpenType signature).' }
  }
  if (format === 'ttc') {
    // A collection holds several faces. Storing it as one row would make the
    // family/weight columns meaningless and the matcher unable to pick a face.
    return {
      ok: false,
      reason: 'This is a font collection (.ttc). Please supply each face as its own file.',
    }
  }

  let font: Record<string, unknown>
  try {
    font = fontkit.create(bytes) as unknown as Record<string, unknown>
  } catch (error) {
    return {
      ok: false,
      reason: `Could not read the font: ${error instanceof Error ? error.message : 'unknown error'}`,
    }
  }

  // A collection can also arrive without the ttcf signature we checked above.
  if (Array.isArray((font as { fonts?: unknown }).fonts)) {
    return {
      ok: false,
      reason: 'This is a font collection. Please supply each face as its own file.',
    }
  }

  const familyName = safeName(font.familyName)
  const postscriptName = safeName(font.postscriptName)
  if (!familyName || !postscriptName) {
    // Deliberately blunt: a name we cannot safely quote is a name we will not
    // store, because everything downstream assumes these are safe.
    return {
      ok: false,
      reason:
        'The font\u2019s embedded name is missing or contains characters that are not allowed in a stylesheet.',
    }
  }

  const subfamilyName = safeName(font.subfamilyName) ?? 'Regular'
  const fullName = safeName(font.fullName) ?? `${familyName} ${subfamilyName}`
  const getName = font.getName as ((key: string) => string | null) | undefined
  const typographicFamily = safeName(getName?.call(font, 'preferredFamily'))
  const typographicSubfamily = safeName(getName?.call(font, 'preferredSubfamily'))

  const os2 = (font['OS/2'] ?? {}) as {
    usWeightClass?: number
    fsSelection?: { italic?: boolean; oblique?: boolean }
    fsType?: { noEmbedding?: boolean; viewOnly?: boolean; noSubsetting?: boolean }
  }
  const fsType = os2.fsType ?? {}

  // Every spelling of this face the artwork might use. The PostScript name is
  // what Illustrator writes first, so it is the one that usually resolves.
  const matchKeys = [
    ...new Set(
      [postscriptName, fullName, familyName, typographicFamily]
        .filter((name): name is string => Boolean(name))
        .map(normaliseFontKey),
    ),
  ]

  return {
    ok: true,
    font: {
      format,
      familyName,
      subfamilyName,
      fullName,
      postscriptName,
      typographicFamily,
      typographicSubfamily,
      weightClass: typeof os2.usWeightClass === 'number' ? os2.usWeightClass : 400,
      isItalic: Boolean(os2.fsSelection?.italic || os2.fsSelection?.oblique),
      glyphCount: typeof font.numGlyphs === 'number' ? font.numGlyphs : 0,
      matchKeys,
      fsTypeNoEmbedding: Boolean(fsType.noEmbedding),
      fsTypeViewOnly: Boolean(fsType.viewOnly),
      fsTypeNoSubsetting: Boolean(fsType.noSubsetting),
    },
  }
}

/**
 * The code points a card's metrics table covers.
 *
 * Not the face's whole character set: a CJK font would produce a table of tens
 * of thousands of entries, shipped to the browser on every Studio load, to
 * measure text that is always Swahili or English. These ranges cover Latin,
 * the accented letters those two languages and the names in them use, and the
 * punctuation and currency marks that appear on invitations.
 *
 * A character outside them measures at `fallbackAdvance` and is reported as a
 * gap, so the answer degrades to "we cannot promise this fits" rather than to a
 * confident wrong number.
 */
const METRIC_RANGES: readonly (readonly [number, number])[] = [
  [0x20, 0x7e], // Basic Latin
  [0xa0, 0xff], // Latin-1 Supplement
  [0x100, 0x17f], // Latin Extended-A
  [0x2010, 0x201f], // dashes and the quotes Illustrator smartens
  [0x2020, 0x2022], // dagger, double dagger, bullet
  [0x2026, 0x2026], // ellipsis, which the overflow policy writes
  [0x20a0, 0x20bf], // currency, for cards that price a contribution
]

/**
 * Advance widths for a face, in font design units.
 *
 * This is what makes a Studio preview honest. Both the browser and the server
 * measure text by reading this table and doing arithmetic, rather than each
 * asking a different renderer how wide a run is — see card-font-metrics.ts in
 * @opusfesta/lib for why that matters and what it deliberately does not model.
 *
 * Design units rather than pixels, so one extraction serves every size the face
 * is ever set at.
 */
export function extractFontMetrics(input: Buffer | Uint8Array): FontMetricsTable | null {
  let font: FontkitFace
  try {
    font = fontkit.create(input instanceof Buffer ? input : Buffer.from(input)) as FontkitFace
  } catch {
    return null
  }

  const unitsPerEm = typeof font.unitsPerEm === 'number' ? font.unitsPerEm : 0
  // Without an em size every advance is meaningless, and a guessed one would
  // scale the whole card's measurements by an arbitrary factor.
  if (!Number.isFinite(unitsPerEm) || unitsPerEm <= 0) return null
  if (typeof font.glyphForCodePoint !== 'function') return null

  const advanceFor = (codePoint: number): number | null => {
    try {
      const advance = font.glyphForCodePoint!(codePoint)?.advanceWidth
      return typeof advance === 'number' && Number.isFinite(advance) ? advance : null
    } catch {
      return null
    }
  }

  const advances: Record<string, number> = {}
  for (const [from, to] of METRIC_RANGES) {
    for (let code = from; code <= to; code++) {
      if (font.hasGlyphForCodePoint?.(code) === false) continue
      const advance = advanceFor(code)
      if (advance !== null) advances[String(code)] = advance
    }
  }

  return {
    unitsPerEm,
    ascender: numberOr(font.ascent, unitsPerEm * 0.8),
    descender: numberOr(font.descent, -unitsPerEm * 0.2),
    lineGap: numberOr(font.lineGap, 0),
    advances,
    // The space's advance is the least wrong stand-in for an unknown glyph: it
    // is the width of the character a fallback face is most likely to draw.
    fallbackAdvance: advances['32'] ?? unitsPerEm * 0.5,
  }
}

/** The metrics shape stored on card_fonts.metrics, mirroring @opusfesta/lib. */
export type FontMetricsTable = {
  unitsPerEm: number
  ascender: number
  descender: number
  lineGap: number
  advances: Record<string, number>
  fallbackAdvance: number
}

/** The slice of fontkit's face this module uses, since it ships no types we can narrow to. */
type FontkitFace = {
  unitsPerEm?: number
  ascent?: number
  descent?: number
  lineGap?: number
  glyphForCodePoint?: (codePoint: number) => { advanceWidth?: number } | null
  hasGlyphForCodePoint?: (codePoint: number) => boolean
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * Which of these code points the face cannot draw.
 *
 * Worth checking at registration rather than at render, because a missing glyph
 * does not fall back wholesale: the browser substitutes PER CHARACTER, so a
 * script name acquires one serif letter in the middle of it.
 */
export function missingGlyphs(input: Buffer | Uint8Array, codePoints: number[]): number[] {
  try {
    const font = fontkit.create(
      input instanceof Buffer ? input : Buffer.from(input),
    ) as unknown as { hasGlyphForCodePoint?: (cp: number) => boolean }
    if (typeof font.hasGlyphForCodePoint !== 'function') return []
    return codePoints.filter((cp) => !font.hasGlyphForCodePoint!(cp))
  } catch {
    // A font we cannot re-open is a font that never registered, so treat an
    // unreadable file as "cannot confirm" rather than "everything is missing".
    return []
  }
}
