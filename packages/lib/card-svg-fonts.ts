// Which typefaces a card's artwork actually needs.
//
// Illustrator names fonts in the SVG but never ships the font data:
//
//   <text font-family="GreatVibes-Regular, Great Vibes" font-size="40">Moses</text>
//
// If that face isn't installed on the machine doing the rendering, the browser
// silently falls back to a generic serif and the couple receives a card in a
// typeface the designer never chose. Nothing errors. Measured against the live
// Opus Royal Ivory artwork, all four of its faces were falling back.
//
// This module answers "what does this file need?" so the answer can be compared
// against the font library. It deliberately does NOT decide what to do about a
// missing font; that belongs to the matcher.
//
// Reading the font off an element is not as simple as reading an attribute:
//
//   PRECEDENCE   inline style  >  CSS class rule  >  presentation attribute
//   INHERITANCE  font properties inherit, and Illustrator often declares them
//                on an enclosing <g> rather than on the <text> itself.
//
// Both matter. Illustrator's DEFAULT export mode puts the family in a <style>
// block, so a scan that only read `font-family="..."` attributes would report
// "needs no fonts" on a large share of the catalogue. That is the worst possible
// answer, because it reads as a clean bill of health.

import { readClassFonts, type ClassFont } from './card-svg-shapes'

export type RequiredFont = {
  /** The font-family list exactly as the artwork declares it, in order. */
  families: string[]
  /**
   * The first entry, which is Illustrator's PostScript name
   * ('GreatVibes-Regular'). This is the match key: it is what CSS resolves
   * first, so a font face registered under it wins outright.
   */
  primary: string
  /** Resolved numeric weight. 400 unless the artwork says otherwise. */
  weight: number
  italic: boolean
  /** Named layers that render in this face, so a readout can point at them. */
  layerIds: string[]
  /**
   * Code points these layers actually draw, for a glyph-coverage check.
   *
   * A face missing one character does not fall back wholesale: the browser
   * substitutes PER CHARACTER, so a script name acquires one serif letter in
   * the middle. On a wedding invitation that is worse than a wrong font.
   */
  codePoints: number[]
}

/** A single element's declared typeface, before inheritance is applied. */
type FontState = {
  families: string[]
  weight: number
  italic: boolean
}

const DEFAULT_STATE: FontState = { families: [], weight: 400, italic: false }

/**
 * The comparison form of a font name.
 *
 * The same face reaches us spelled several ways: 'Great Vibes' from the family
 * record, 'GreatVibes-Regular' from the PostScript record, 'Great_Vibes' from a
 * filename. Stripping case, quotes, spaces, hyphens and underscores makes them
 * all comparable without inventing fuzzy matching, which on a wedding card
 * would risk silently substituting the wrong typeface.
 */
export function normaliseFontKey(name: string): string {
  return name.toLowerCase().replace(/['"]/g, '').replace(/[\s_-]+/g, '')
}

/**
 * Split a CSS font-family list into its names.
 *
 * 'GreatVibes-Regular, Great Vibes' → ['GreatVibes-Regular', 'Great Vibes']
 */
export function parseFontFamilyList(value: string): string[] {
  return value
    .split(',')
    .map((name) => name.trim().replace(/^['"]|['"]$/g, '').trim())
    .filter(Boolean)
}

/** CSS font-weight to a number. Illustrator emits both '700' and 'bold'. */
export function parseWeight(value: string | undefined, inherited: number): number {
  if (!value) return inherited
  const word = value.trim().toLowerCase()
  if (word === 'normal') return 400
  if (word === 'bold') return 700
  // 'bolder'/'lighter' are relative; approximating them would invent a face
  // that may not exist, so inherit instead.
  if (word === 'bolder' || word === 'lighter') return inherited
  const numeric = Number.parseInt(word, 10)
  return Number.isFinite(numeric) ? numeric : inherited
}

export function parseItalic(value: string | undefined, inherited: boolean): boolean {
  if (!value) return inherited
  const word = value.trim().toLowerCase()
  if (word === 'normal') return false
  return word === 'italic' || word.startsWith('oblique')
}

const XML_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
}

/** Entities must be decoded before counting glyphs: '&amp;' needs '&', not 'a'. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    return XML_ENTITIES[body.toLowerCase()] ?? whole
  })
}

/**
 * Read an attribute by name.
 *
 * The leading `(?:^|[^\w-])` is not decoration: `\b` would let a lookup for
 * `style` match the `style` inside `font-style="italic"`, because a hyphen is a
 * non-word character. That single character is the difference between reading
 * an element's inline style and reading its italic flag.
 */
export function attribute(attrs: string, name: string): string | undefined {
  return (
    new RegExp(`(?:^|[^\\w-])${name}\\s*=\\s*"([^"]*)"`, 'i').exec(attrs)?.[1]?.trim() || undefined
  )
}

/** One property, resolved across the three declaration sites in priority order. */
export function resolveProperty(
  attrs: string,
  cssProperty: string,
  fromClass: string | undefined,
): string | undefined {
  const inlineStyle = attribute(attrs, 'style')
  if (inlineStyle) {
    const declared = new RegExp(`(?:^|;)\\s*${cssProperty}\\s*:\\s*([^;]+)`, 'i')
      .exec(inlineStyle)?.[1]
      ?.trim()
    if (declared) return declared
  }
  return fromClass ?? attribute(attrs, cssProperty)
}

/**
 * Every typeface the artwork asks for, grouped by face.
 *
 * Faces are keyed on primary name + weight + italic, so Bookman Regular and
 * Bookman Bold are reported as the two separate files they are. That split is
 * load-bearing: they need two separate uploads and two @font-face rules.
 */
export function readRequiredFonts(svg: string): RequiredFont[] {
  const classFonts = readClassFonts(svg)

  type Accumulator = {
    families: string[]
    primary: string
    weight: number
    italic: boolean
    layerIds: Set<string>
    codePoints: Set<number>
  }
  const found = new Map<string, Accumulator>()

  // Open elements, innermost last. Each carries its RESOLVED state so a child
  // inherits without re-walking the stack.
  const stack: { tag: string; id: string | null; font: FontState }[] = []
  const tagPattern = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g

  let cursor = 0
  let match: RegExpExecArray | null

  const currentFont = (): FontState =>
    stack.length > 0 ? stack[stack.length - 1].font : DEFAULT_STATE
  const currentLayerId = (): string | null => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].id) return stack[i].id
    return null
  }
  const insideText = (): boolean => stack.some((el) => el.tag === 'text')

  /** Resolve an element's own declarations on top of what it inherits. */
  const resolve = (attrs: string, inherited: FontState): FontState => {
    const classNames = attribute(attrs, 'class')?.split(/\s+/) ?? []
    // Equal-specificity class selectors resolve by stylesheet order.
    const classFont = classNames
      .map((name) => classFonts.get(name))
      .filter((entry): entry is ClassFont => entry !== undefined)
      .sort((a, b) => a.order - b.order)
      .at(-1)

    const family = resolveProperty(attrs, 'font-family', classFont?.family)
    const weight = resolveProperty(attrs, 'font-weight', classFont?.weight)
    const style = resolveProperty(attrs, 'font-style', classFont?.style)

    return {
      families: family ? parseFontFamilyList(family) : inherited.families,
      weight: parseWeight(weight, inherited.weight),
      italic: parseItalic(style, inherited.italic),
    }
  }

  const record = (font: FontState, layerId: string | null, text: string) => {
    if (font.families.length === 0) return
    const primary = font.families[0]
    const key = `${primary.toLowerCase()}|${font.weight}|${font.italic}`
    const entry = found.get(key) ?? {
      families: font.families,
      primary,
      weight: font.weight,
      italic: font.italic,
      layerIds: new Set<string>(),
      codePoints: new Set<number>(),
    }
    if (layerId) entry.layerIds.add(layerId)
    for (const char of decodeEntities(text)) {
      const code = char.codePointAt(0)
      // Whitespace needs no glyph and would flag every face as incomplete.
      if (code !== undefined && code > 32) entry.codePoints.add(code)
    }
    found.set(key, entry)
  }

  while ((match = tagPattern.exec(svg)) !== null) {
    const [whole, closing, rawTag, attrs, selfClosing] = match

    // Character data between the previous tag and this one is only drawn when
    // it sits inside a <text>.
    if (match.index > cursor && insideText()) {
      const text = svg.slice(cursor, match.index)
      if (text.trim()) record(currentFont(), currentLayerId(), text)
    }
    cursor = match.index + whole.length

    const tag = rawTag.toLowerCase()

    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i
          break
        }
      }
      continue
    }

    // <style> content is CSS, not drawn text, and must never be sampled.
    if (tag === 'style') {
      if (!selfClosing) stack.push({ tag, id: null, font: currentFont() })
      continue
    }

    if (selfClosing) continue

    const id = attribute(attrs, 'id') ?? null
    stack.push({ tag, id, font: resolve(attrs, currentFont()) })
  }

  return [...found.values()]
    .map((entry) => ({
      families: entry.families,
      primary: entry.primary,
      weight: entry.weight,
      italic: entry.italic,
      layerIds: [...entry.layerIds],
      codePoints: [...entry.codePoints].sort((a, b) => a - b),
    }))
    // Stable output so a readout doesn't reshuffle between loads.
    .sort((a, b) => a.primary.localeCompare(b.primary) || a.weight - b.weight)
}
