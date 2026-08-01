// Matching the typefaces an artwork asks for against the fonts we hold.
//
// The artwork says `font-family="GreatVibes-Regular, Great Vibes"`. The library
// holds a face whose PostScript name is 'GreatVibes-Regular' and whose family
// is 'Great Vibes'. Those are the same font, spelled two ways, and something
// has to say so.
//
// Matching is deliberately EXACT after normalising case, spaces, hyphens and
// underscores. No fuzzy matching, no nearest-neighbour: quietly substituting a
// typeface that merely looks similar on a wedding invitation is worse than
// reporting the font as missing, because nobody would ever find out.
//
// The one intentional escape from that strictness is the alias table, where a
// human states "when the artwork asks for Bookman, ship this instead". That is
// a decision someone made and can be reviewed, not a guess this code made.

import { normaliseFontKey, type RequiredFont } from './card-svg-fonts'

/** The library columns matching needs. A subset of the card_fonts row. */
export type CardFontFace = {
  id: string
  familyName: string
  subfamilyName: string
  postscriptName: string
  weightClass: number
  isItalic: boolean
  /** Normalised names this face answers to. */
  matchKeys: string[]
  /** Whether the licence gate lets this font actually ship. */
  embeddable: boolean
  /**
   * fsType Restricted License: the foundry forbids embedding outright.
   *
   * Kept separate from `embeddable` so the UI can say WHICH gate is closed. A
   * font held back by its own permission bits cannot be released by attesting
   * a licence, and offering that control anyway sends someone round a loop
   * that can never succeed.
   */
  restricted: boolean
}

export type FontMatch = {
  required: RequiredFont
  /** The face we hold, or null when nothing in the library answers to it. */
  face: CardFontFace | null
  /** True when the match came from the alias table rather than the name. */
  viaAlias: boolean
}

export type FontMatchStatus = 'ships' | 'font_restricted' | 'licence_not_cleared' | 'missing'

/**
 * What to tell the admin about one required face.
 *
 * `font_restricted` is separated from `licence_not_cleared` because they have
 * different remedies. A licence can be attested; a foundry's refusal to permit
 * embedding cannot, and the only ways forward are a different cut of the font
 * or an alias to something we may use.
 */
export function fontMatchStatus(match: FontMatch): FontMatchStatus {
  if (!match.face) return 'missing'
  if (match.face.embeddable) return 'ships'
  return match.face.restricted ? 'font_restricted' : 'licence_not_cleared'
}

/**
 * Resolve each required face against the library.
 *
 * Candidate order matters. The artwork lists names most-specific first, which
 * for an Illustrator export means the PostScript name, so trying them in the
 * order the artwork gives them naturally prefers the exact face over the
 * family. Falling back to the family alone would otherwise let Bookman Regular
 * answer a request for Bookman Bold.
 */
export function matchCardFonts(
  required: RequiredFont[],
  faces: CardFontFace[],
  aliases: Map<string, string> = new Map(),
): FontMatch[] {
  // One key can be claimed by several faces (a family name is shared by its
  // regular and its bold), so keep every candidate and choose on weight.
  const byKey = new Map<string, CardFontFace[]>()
  for (const face of faces) {
    for (const key of face.matchKeys) {
      const list = byKey.get(key) ?? []
      list.push(face)
      byKey.set(key, list)
    }
  }
  const byId = new Map(faces.map((face) => [face.id, face]))

  return required.map((font) => {
    for (const name of font.families) {
      const key = normaliseFontKey(name)
      const candidates = byKey.get(key)
      if (!candidates || candidates.length === 0) continue

      // Prefer the face whose weight and slant the artwork actually asked for.
      // Only reached when the matched key is a shared family name; a PostScript
      // name resolves to exactly one face and this is a no-op.
      const exact = candidates.find(
        (face) => face.weightClass === font.weight && face.isItalic === font.italic,
      )
      const nearest = [...candidates].sort(
        (a, b) =>
          Number(a.isItalic !== font.italic) - Number(b.isItalic !== font.italic) ||
          Math.abs(a.weightClass - font.weight) - Math.abs(b.weightClass - font.weight),
      )[0]
      return { required: font, face: exact ?? nearest, viaAlias: false }
    }

    // Nothing answers to the name. A human may have said what to use instead.
    for (const name of font.families) {
      const aliased = aliases.get(normaliseFontKey(name))
      const face = aliased ? byId.get(aliased) : undefined
      if (face) return { required: font, face, viaAlias: true }
    }

    return { required: font, face: null, viaAlias: false }
  })
}

/** Data URI MIME and CSS format() keyword for each file type we accept. */
const FONT_MEDIA: Record<string, { mime: string; format: string }> = {
  ttf: { mime: 'font/ttf', format: 'truetype' },
  otf: { mime: 'font/otf', format: 'opentype' },
  woff: { mime: 'font/woff', format: 'woff' },
  woff2: { mime: 'font/woff2', format: 'woff2' },
}

export type EmbeddableFont = {
  /** The name the artwork asks for. This is what the rule is keyed on. */
  familyName: string
  italic: boolean
  format: string
  /** The font file, base64 encoded. */
  base64: string
}

/**
 * A <style> block that makes an SVG carry its own typefaces.
 *
 * Required because the admin preview renders the card as `<img src="blob:">`,
 * and an SVG inside an <img> is an isolated document: it cannot reach page CSS
 * or fetch an external font file. A `data:` URI inside the SVG is the only
 * mechanism that works there.
 *
 * Two details are load-bearing:
 *
 *   KEYED ON THE NAME THE ARTWORK USES. Illustrator writes
 *   `font-family="BookmanOldStyle-Bold, Bookman Old Style"`, and CSS resolves
 *   the list left to right, so a rule keyed on the first entry wins outright.
 *
 *   `font-weight: 100 900`. Illustrator frequently omits font-weight, so the
 *   <text> implicitly asks for 400. A rule declaring weight 700 would not be
 *   selected, the browser would fall back and then SYNTHESISE a fake bold, and
 *   the card would render in a typeface the designer never chose. Accepting
 *   every weight removes that whole class of failure.
 */
export function buildFontFaceCss(fonts: EmbeddableFont[]): string {
  const rules = fonts
    .map((font) => {
      const media = FONT_MEDIA[font.format]
      if (!media || !font.base64) return ''
      // The family name is sanitised at registration, so it cannot contain a
      // quote or a brace that would escape this rule.
      return (
        `@font-face{font-family:"${font.familyName}";` +
        `src:url(data:${media.mime};base64,${font.base64}) format("${media.format}");` +
        `font-weight:100 900;font-style:${font.italic ? 'italic' : 'normal'};font-display:block}`
      )
    })
    .filter(Boolean)
  return rules.length > 0 ? `<style>${rules.join('')}</style>` : ''
}

/**
 * Put the font block inside the SVG root.
 *
 * A FUNCTION replacement, not a `$1` template: the replacement carries base64
 * and font names, and `String.replace` would interpret a literal `$&` or `$1`
 * appearing in either.
 */
export function injectFontCss(svg: string, css: string): string {
  if (!css) return svg
  return svg.replace(/<svg\b[^>]*>/, (openTag) => openTag + css)
}
