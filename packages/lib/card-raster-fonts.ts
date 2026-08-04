// Pinning a card's text to the exact font face it is supposed to use.
//
// This exists because of one measured fact about resvg: it resolves fonts by
// FAMILY NAME plus weight and style, and ignores the PostScript name entirely.
// Illustrator writes the PostScript name FIRST:
//
//   font-family="BookmanOldStyle-Bold, Bookman Old Style"
//
// A browser resolves that list left to right, so the @font-face rule we key on
// the first entry wins and the card renders correctly. resvg skips the first
// entry, falls through to the family, and then picks a weight. Two ways that
// goes wrong, both silent:
//
//   - the bold PostScript name carries no font-weight attribute, so resvg picks
//     the REGULAR face of that family
//   - the list names no real family at all, so nothing matches and resvg draws
//     the text in whichever face happens to be loaded first
//
// Neither raises an error. On the reference card the single bold layer is the
// GUEST NAME, the one field guest delivery substitutes, so a wrong weight there
// would be wrong on every card of a two hundred guest send.
//
// So we stop trusting the artwork's naming. Every text element gets rewritten to
// the canonical family of the face we actually matched, with weight and style
// stated outright. Pure string work, no rendering, no I/O, so it is testable
// without a rasteriser.

import { normaliseFontKey, parseFontFamilyList } from './card-svg-fonts'

/** The face a required font resolved to, reduced to what pinning needs. */
export type PinnableFace = {
  /** The name the artwork asks for, i.e. the first font-family entry. */
  requiredPrimary: string
  /** The family name the font file actually declares. What resvg matches on. */
  canonicalFamily: string
  /** CSS weight of the matched face, e.g. 400 or 700. */
  weight: number
  italic: boolean
}

export type FontPinResult = {
  svg: string
  /** Artwork font names that were pinned, deduped. */
  pinned: string[]
  /**
   * Artwork font names with no matched face.
   *
   * Never empty-and-ignored: the caller MUST refuse to rasterise when this has
   * entries, because the alternative is a card in the wrong typeface that looks
   * finished.
   */
  unresolved: string[]
  /** Text elements rewritten. Zero on a card with no text is suspicious. */
  elementsRewritten: number
}

/** Start tags that can carry font presentation attributes. */
const FONT_BEARING_TAG = /<(text|tspan)\b([^>]*)>/gi

const FAMILY_ATTR = /\sfont-family\s*=\s*"([^"]*)"/i
const WEIGHT_ATTR = /\sfont-weight\s*=\s*"([^"]*)"/i
const STYLE_ATTR = /\sfont-style\s*=\s*"([^"]*)"/i

/** Quote-safe: a family name reaching an attribute must not break the tag. */
function attrSafe(value: string): string {
  return value.replace(/["&<>]/g, '')
}

/**
 * Rewrite every text element's font to the matched face.
 *
 * Matching is on the artwork's FIRST font-family entry, normalised the same way
 * the font library normalises its match keys, so 'BookmanOldStyle-Bold' and
 * 'bookmanoldstyle-bold' are the same request.
 *
 * A tag whose family cannot be resolved is left exactly as it was and reported.
 * Rewriting it to a guess is the one thing this must never do.
 */
export function pinCardFonts(svg: string, faces: PinnableFace[]): FontPinResult {
  const byKey = new Map<string, PinnableFace>()
  for (const face of faces) byKey.set(normaliseFontKey(face.requiredPrimary), face)

  const pinned = new Set<string>()
  const unresolved = new Set<string>()
  let elementsRewritten = 0

  const out = svg.replace(FONT_BEARING_TAG, (whole, tag: string, attrs: string) => {
    const familyMatch = FAMILY_ATTR.exec(attrs)
    // Inheriting from an ancestor is normal: only elements that state a family
    // of their own are pinned, and the ancestor gets pinned on its own tag.
    if (!familyMatch) return whole

    const requested = parseFontFamilyList(familyMatch[1])[0] ?? ''
    if (!requested) return whole

    const face = byKey.get(normaliseFontKey(requested))
    if (!face) {
      unresolved.add(requested)
      return whole
    }

    // Strip what we are about to restate, so the tag cannot end up with two
    // font-weights and a resolution that depends on attribute order.
    let rest = attrs.replace(FAMILY_ATTR, '').replace(WEIGHT_ATTR, '').replace(STYLE_ATTR, '')
    rest = rest.replace(/\s+$/, '')

    const pinnedAttrs =
      ` font-family="${attrSafe(face.canonicalFamily)}"` +
      ` font-weight="${face.weight}"` +
      ` font-style="${face.italic ? 'italic' : 'normal'}"`

    pinned.add(requested)
    elementsRewritten += 1
    return `<${tag}${rest}${pinnedAttrs}>`
  })

  return {
    svg: out,
    pinned: [...pinned],
    unresolved: [...unresolved],
    elementsRewritten,
  }
}

/**
 * Whether a pinned card is safe to rasterise.
 *
 * Separate from pinCardFonts so the decision is a value the caller has to look
 * at, rather than something buried in a render call. `elementsRewritten === 0`
 * counts as unsafe only when the artwork asked for fonts at all: a card of pure
 * vector decoration legitimately has no text.
 */
export function isPinComplete(result: FontPinResult, artworkHasText: boolean): boolean {
  if (result.unresolved.length > 0) return false
  if (artworkHasText && result.elementsRewritten === 0) return false
  return true
}
