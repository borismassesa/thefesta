// The rules a card raster has to satisfy, and the reasons it may refuse.
//
// Kept pure and separate from the rasteriser itself for one reason: every way
// this pipeline fails is SILENT at the pixel level. An unresolved font renders in
// whichever face happened to load, a missing font makes text vanish, and a typo
// in the renderer's options reverts to system fonts. None of them throw. So the
// decisions have to be values that a caller is forced to look at, and they have
// to be testable without a rasteriser in the room.
//
// Measured against resvg (see docs/CARD_GUEST_DELIVERY_PLAN.md):
//   ttf   renders
//   otf   renders            (NexaBold on the reference card is otf)
//   woff  renders BLANK
// so formats are an ALLOWLIST. Denying the two known-bad ones would silently
// admit whatever format is added to the column next.

import { normaliseFontKey } from './card-svg-fonts'
import { escapeXmlText } from './card-render'
import type { PinnableFace } from './card-raster-fonts'

export type RasterErrorCode =
  /** A font the artwork asks for has no matching face in the library. */
  | 'FONT_UNRESOLVED'
  /** Matched, but stored in a format resvg cannot read. */
  | 'FONT_FORMAT_UNSUPPORTED'
  /** Matched, but its licence was never cleared for embedding. */
  | 'FONT_NOT_LICENSED'
  | 'FONT_DOWNLOAD_FAILED'
  | 'WASM_INITIALIZATION_FAILED'
  | 'SVG_INVALID'
  /** Rendered, but effectively empty. Usually means text did not draw. */
  | 'OUTPUT_BLANK'
  | 'OUTPUT_LIMIT_EXCEEDED'
  | 'RASTER_FAILED'

export type RasterResult =
  | { ok: true; png: Uint8Array; width: number; height: number; sha256: string }
  | {
      ok: false
      code: RasterErrorCode
      /**
       * Which fonts or limits caused it.
       *
       * An addition to the bare code, because a code alone cannot be acted on: a
       * designer told FONT_UNRESOLVED still has to be told WHICH face, or the
       * card stays broken.
       */
      detail?: string[]
    }

/** Formats resvg is known to read. Verified, not assumed. */
export const RASTERISABLE_FONT_FORMATS: readonly string[] = ['ttf', 'otf']

/**
 * Bounds on a single raster.
 *
 * The reference artwork is ~2 MB with three embedded bitmaps, so the SVG ceiling
 * is generous. The output ceiling is the one that matters operationally, because
 * Meta fetches the PNG: confirm the current media limit in Meta's documentation
 * before raising it.
 */
export const RASTER_LIMITS = {
  maxSvgBytes: 8 * 1024 * 1024,
  maxOutputBytes: 4 * 1024 * 1024,
  maxWidth: 2048,
  maxPixels: 2048 * 2048,
  /**
   * Below this share of non-white bytes the output is treated as blank.
   *
   * Deliberately crude, and deliberately NOT a completeness check. A card
   * rendered entirely in the wrong font has perfectly normal coverage, so this
   * catches "nothing drew" and nothing more. Completeness comes from the font
   * preflight and the golden tests.
   */
  minInkRatio: 0.02,
} as const

/** A library face offered to the raster step, reduced to what the rules need. */
export type RasterFontCandidate = {
  faceId: string
  /** The artwork font name this face answers, i.e. the first font-family entry. */
  requiredPrimary: string
  /** The family the font file itself declares. What resvg matches on. */
  canonicalFamily: string
  weight: number
  italic: boolean
  /** As stored on card_fonts.format. */
  format: string
  /** card_fonts.embeddable, the licence gate. */
  licenceCleared: boolean
}

export type FontResolution =
  | { ok: true; faces: PinnableFace[]; faceIds: string[] }
  | { ok: false; code: RasterErrorCode; detail: string[] }

/**
 * Decide whether every font the artwork needs can actually be supplied.
 *
 * Fails closed on the first category that has any member, checked in a fixed
 * order so the same card always produces the same complaint: unresolved before
 * licence before format. Unresolved comes first because it is the only one that
 * can also be caused by a re-export, and licence before format because a legal
 * block outranks a technical one.
 *
 * Returns EVERY offending font, not just the first. A designer fixing a card
 * wants the whole list.
 */
export function resolveRasterFonts(
  requiredPrimaries: string[],
  candidates: RasterFontCandidate[],
): FontResolution {
  const byKey = new Map<string, RasterFontCandidate>()
  for (const candidate of candidates) {
    byKey.set(normaliseFontKey(candidate.requiredPrimary), candidate)
  }

  const unresolved: string[] = []
  const unlicensed: string[] = []
  const badFormat: string[] = []
  const matched: RasterFontCandidate[] = []

  // Dedupe: one face serves many layers, and the same complaint repeated per
  // layer is noise.
  for (const primary of [...new Set(requiredPrimaries.filter(Boolean))]) {
    const candidate = byKey.get(normaliseFontKey(primary))
    if (!candidate) {
      unresolved.push(primary)
      continue
    }
    if (!candidate.licenceCleared) {
      unlicensed.push(primary)
      continue
    }
    if (!RASTERISABLE_FONT_FORMATS.includes(candidate.format.toLowerCase())) {
      badFormat.push(`${primary} (${candidate.format})`)
      continue
    }
    matched.push(candidate)
  }

  if (unresolved.length > 0) return { ok: false, code: 'FONT_UNRESOLVED', detail: unresolved }
  if (unlicensed.length > 0) return { ok: false, code: 'FONT_NOT_LICENSED', detail: unlicensed }
  if (badFormat.length > 0) {
    return { ok: false, code: 'FONT_FORMAT_UNSUPPORTED', detail: badFormat }
  }

  return {
    ok: true,
    faces: matched.map((c) => ({
      requiredPrimary: c.requiredPrimary,
      canonicalFamily: c.canonicalFamily,
      weight: c.weight,
      italic: c.italic,
    })),
    faceIds: matched.map((c) => c.faceId),
  }
}

/** Share of bytes that are not pure white. A cheap "did anything draw" probe. */
export function inkRatio(png: Uint8Array): number {
  if (png.length === 0) return 0
  let nonWhite = 0
  for (let i = 0; i < png.length; i++) if (png[i] !== 0xff) nonWhite++
  return nonWhite / png.length
}

/**
 * Whether the output is empty enough to be a failure rather than a card.
 *
 * Only ever catches blankness. It cannot and does not verify that the right
 * typeface was used; a wrong-font card looks entirely normal by this measure.
 */
export function looksBlank(png: Uint8Array): boolean {
  return inkRatio(png) < RASTER_LIMITS.minInkRatio
}

/** The neutral text a frozen release carries in place of a guest's name. */
export const GUEST_PLACEHOLDER_SW = 'Jina la Mgeni'

export type SubstitutionCheck = { ok: true } | { ok: false; reason: string }

/**
 * Confirm a guest's card really became that guest's card.
 *
 * Two ways the substitution silently no-ops: the binding points at a layer the
 * release no longer has, so nothing is written and the placeholder survives; or
 * the renderer reports success while the name never reached the markup. Both
 * would send every guest an identical card addressed to nobody.
 */
export function assertGuestSubstituted(
  svg: string,
  guestName: string,
  appliedRoles: string[],
  placeholder: string = GUEST_PLACEHOLDER_SW,
): SubstitutionCheck {
  if (!appliedRoles.includes('guest_name')) {
    return { ok: false, reason: 'renderer did not apply guest_name' }
  }
  const trimmed = guestName.trim()
  if (!trimmed) return { ok: false, reason: 'guest name is empty' }
  // Search for the ESCAPED name, because that is what the renderer wrote. A
  // guest called "Mr & Mrs Ngando" reaches the markup as "Mr &amp; Mrs Ngando",
  // so looking for the raw string reported a correctly rendered card as an
  // unmapped guest layer. The raw form is still accepted: this function is also
  // handed markup from callers that did no escaping of their own, and for a name
  // without &, < or > the two forms are the same string anyway.
  if (!svg.includes(escapeXmlText(trimmed)) && !svg.includes(trimmed)) {
    return { ok: false, reason: `guest name "${trimmed}" is not present in the rendered card` }
  }
  // The placeholder surviving means a second guest layer was left unwritten.
  if (placeholder && svg.includes(placeholder)) {
    return { ok: false, reason: `placeholder "${placeholder}" survived substitution` }
  }
  return { ok: true }
}
