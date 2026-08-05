// Where a card's text actually sits, and how big it is.
//
// The rest of the card pipeline treats artwork as a bag of named layers whose
// character data can be swapped. That is enough to write a couple's names in,
// and not nearly enough to decide whether those names FIT. Fitting needs
// geometry: the box a run occupies, the size it is set at, the point it is
// anchored to, and the transform stack that puts it on the page.
//
// All of that is already in the SVG. Nobody has ever read it out.
//
// This module is deliberately the geometric twin of card-svg-fonts.ts and walks
// the file the same way, for the same reasons:
//
//   PRECEDENCE   inline style  >  CSS class rule  >  presentation attribute
//   INHERITANCE  font and text properties inherit, and Illustrator routinely
//                declares them on an enclosing <g> rather than on the <text>.
//
// It shares that module's resolvers rather than reimplementing them, because
// two readers that disagree about which font-size applies would produce a
// preview that lays out differently from the render, which is the single
// failure this whole layout effort exists to prevent.
//
// Coordinate spaces, since getting these confused silently moves text:
//
//   LOCAL   the space the <text> element's own x/y are expressed in, i.e. after
//           every ancestor transform has been applied. Boxes and font sizes in
//           the layout model live HERE, so a box can be edited without ever
//           inverting a matrix.
//   VIEWBOX the artwork's coordinate system, what the Studio draws in. Reached
//           by applying `ctm` to a local point.

import {
  attribute,
  decodeEntities,
  parseFontFamilyList,
  parseItalic,
  parseWeight,
  resolveProperty,
} from './card-svg-fonts'
import { readClassFonts, type ClassFont } from './card-svg-shapes'

/** An SVG transform, as [a, b, c, d, e, f]. */
export type Matrix = readonly [number, number, number, number, number, number]

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

export type TextAnchor = 'start' | 'middle' | 'end'

export type Point = { x: number; y: number }

export type Rect = { x: number; y: number; w: number; h: number }

/** The artwork's own coordinate system. */
export type ViewBox = { x: number; y: number; width: number; height: number }

/**
 * One <text> element, measured.
 *
 * Addressed by `textKey` rather than by layer, because a layer holding two
 * <text> nodes (a month and a year sharing an unnamed group) is two independent
 * pieces of geometry. That is the same `layer#n` addressing card-render.ts
 * already uses, so a binding saved against one resolves here.
 */
export type TextGeometry = {
  /** Innermost named ancestor — the designer's layer name. */
  layerId: string | null
  /** 'layer#1' for the first <text> in the layer, '#2' for the second. */
  textKey: string | null
  /** Local → viewBox. Includes the element's own transform. */
  ctm: Matrix
  /** Anchor point in LOCAL space, from the <text> or its first <tspan>. */
  anchorPoint: Point
  anchor: TextAnchor
  /**
   * Byte offsets of the whole <text>…</text> element.
   *
   * The renderer needs the ELEMENT, not the character data card-render.ts
   * addresses: fitting a value can change its size and its number of lines, and
   * neither can be expressed by editing the text between the tags.
   */
  elementStart: number
  elementEnd: number
  /** In LOCAL units. */
  fontSize: number
  /** Resolved to local units; an em value is already multiplied out. */
  letterSpacing: number
  families: string[]
  weight: number
  italic: boolean
  /** The copy sitting in the artwork, entities decoded, whitespace collapsed. */
  sampleText: string
  /** Separate <tspan> elements, i.e. how badly the run is kerned. */
  tspans: number
  /**
   * The element's attribute string exactly as it appears.
   *
   * Kept whole rather than parsed into fields so a regenerated <text> can carry
   * the designer's fill, gradient reference, opacity and stroke through
   * untouched. Only the handful of attributes the layout engine owns are
   * stripped at render time.
   */
  rawAttrs: string
  /**
   * Why this element must not be regenerated, if it must not be.
   *
   * A regenerated <text> is rebuilt from our own tspans. That is safe for a
   * plain run and destructive for anything whose rendering depends on the
   * element's internal structure or on a reference we would have to re-point.
   */
  refuseRegeneration: RegenerationRefusal | null
}

export type RegenerationRefusal =
  /** Glyphs are laid along a path; our per-line tspans have no meaning there. */
  | 'text_path'
  /** A filter/mask/clip is tied to the element's rendered bounds. */
  | 'filtered'
  /**
   * textLength/lengthAdjust: the designer has told the renderer to stretch the
   * run to an exact width. Our fitting would be fighting it, and whichever won
   * the result would not be what anyone asked for.
   */
  | 'text_length'
  /** Per-character rotation, which our per-line tspans cannot express. */
  | 'per_char_rotate'
  /** Vertical or bidi-overridden text, which needs a different layout model. */
  | 'writing_mode'
  /** Different faces inside one run; a regenerated element can only carry one. */
  | 'mixed_fonts'
  /** No font-family resolved, so nothing can be measured. */
  | 'no_font'
  /** No position resolved, so there is nothing to anchor a box to. */
  | 'no_position'

export type ArtworkGeometry = {
  viewBox: ViewBox | null
  texts: TextGeometry[]
}

// ── Matrices ──

/** Compose parent × child, so a point is transformed by the child first. */
export function multiply(parent: Matrix, child: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = parent
  const [a2, b2, c2, d2, e2, f2] = child
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ]
}

export function applyMatrix(m: Matrix, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] }
}

/**
 * The scale a matrix applies, as one number.
 *
 * Used to convert a local font size into viewBox units for display. The
 * geometric mean of the two axis scales, so a non-uniform transform degrades to
 * something sensible rather than picking an axis arbitrarily. Layout itself
 * never uses this — it works entirely in local units precisely so that a
 * non-uniform or rotated transform cannot distort a fit decision.
 */
export function matrixScale(m: Matrix): number {
  const sx = Math.hypot(m[0], m[1])
  const sy = Math.hypot(m[2], m[3])
  return Math.sqrt(sx * sy) || 1
}

const NUMBERS = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g

/**
 * Parse an SVG `transform` list into a single matrix.
 *
 * Handles every form Illustrator and Figma emit. An unrecognised function is
 * SKIPPED rather than treated as identity-and-continue, because silently
 * dropping a transform would place a box somewhere the text is not.
 */
export function parseTransform(value: string | undefined): Matrix {
  if (!value) return IDENTITY
  let out: Matrix = IDENTITY
  for (const [, name, args] of value.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
    const n = (args.match(NUMBERS) ?? []).map(Number)
    const rad = (deg: number) => (deg * Math.PI) / 180
    let step: Matrix | null = null
    switch (name.toLowerCase()) {
      case 'matrix':
        if (n.length >= 6) step = [n[0], n[1], n[2], n[3], n[4], n[5]]
        break
      case 'translate':
        if (n.length >= 1) step = [1, 0, 0, 1, n[0], n[1] ?? 0]
        break
      case 'scale':
        if (n.length >= 1) step = [n[0], 0, 0, n[1] ?? n[0], 0, 0]
        break
      case 'rotate':
        if (n.length >= 1) {
          const [c, s] = [Math.cos(rad(n[0])), Math.sin(rad(n[0]))]
          const spin: Matrix = [c, s, -s, c, 0, 0]
          // rotate(a cx cy) is translate(cx cy) rotate(a) translate(-cx -cy).
          step =
            n.length >= 3
              ? multiply(multiply([1, 0, 0, 1, n[1], n[2]], spin), [1, 0, 0, 1, -n[1], -n[2]])
              : spin
        }
        break
      case 'skewx':
        if (n.length >= 1) step = [1, 0, Math.tan(rad(n[0])), 1, 0, 0]
        break
      case 'skewy':
        if (n.length >= 1) step = [1, Math.tan(rad(n[0])), 0, 1, 0, 0]
        break
    }
    if (step) out = multiply(out, step)
  }
  return out
}

// ── Lengths ──

/** CSS absolute units, relative to the user unit SVG treats as a pixel. */
const UNIT_SCALE: Record<string, number> = {
  px: 1, pt: 96 / 72, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, q: 96 / 101.6,
}

/**
 * A CSS length in user units.
 *
 * `relativeTo` is the font size an em/percentage resolves against. Returns null
 * rather than a default, so a caller can tell "not declared" from "declared as
 * zero" — the difference between inheriting a size and setting one.
 */
export function parseLength(
  value: string | undefined,
  relativeTo: number | null = null,
): number | null {
  if (!value) return null
  const match = /^\s*(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*([a-z%]*)\s*$/i.exec(value)
  if (!match) return null
  const n = Number(match[1])
  if (!Number.isFinite(n)) return null
  const unit = match[2].toLowerCase()
  if (!unit) return n
  if (unit === 'em' || unit === 'rem') return relativeTo === null ? null : n * relativeTo
  if (unit === '%') return relativeTo === null ? null : (n / 100) * relativeTo
  const scale = UNIT_SCALE[unit]
  return scale === undefined ? null : n * scale
}

/** The artwork's coordinate system, preferring viewBox over width/height. */
export function readViewBox(svg: string): ViewBox | null {
  const open = /<svg\b([^>]*)>/i.exec(svg)
  if (!open) return null
  const attrs = open[1]

  const box = attribute(attrs, 'viewBox')
  if (box) {
    const n = (box.match(NUMBERS) ?? []).map(Number)
    if (n.length >= 4 && n.every(Number.isFinite) && n[2] > 0 && n[3] > 0) {
      return { x: n[0], y: n[1], width: n[2], height: n[3] }
    }
  }

  // No viewBox is unusual but legal; width/height then define the space.
  const width = parseLength(attribute(attrs, 'width'))
  const height = parseLength(attribute(attrs, 'height'))
  return width && height && width > 0 && height > 0 ? { x: 0, y: 0, width, height } : null
}

// ── The walk ──

/** Everything that inherits down the tree. */
type InheritedState = {
  ctm: Matrix
  fontSize: number
  letterSpacing: number
  families: string[]
  weight: number
  italic: boolean
  anchor: TextAnchor
}

/**
 * SVG's initial font-size.
 *
 * 16 is the CSS default and what every renderer in this pipeline falls back to,
 * including resvg. Choosing anything else here would make our measurements
 * disagree with the raster on any layer that never declares a size.
 */
const ROOT_FONT_SIZE = 16

const ROOT_STATE: InheritedState = {
  ctm: IDENTITY,
  fontSize: ROOT_FONT_SIZE,
  letterSpacing: 0,
  families: [],
  weight: 400,
  italic: false,
  anchor: 'start',
}

function parseAnchor(value: string | undefined, inherited: TextAnchor): TextAnchor {
  const word = value?.trim().toLowerCase()
  if (word === 'start' || word === 'middle' || word === 'end') return word
  return inherited
}

/** `normal` is the CSS initial value and means no extra tracking. */
function parseLetterSpacing(
  value: string | undefined,
  fontSize: number,
  inherited: number,
): number {
  if (!value) return inherited
  if (value.trim().toLowerCase() === 'normal') return 0
  return parseLength(value, fontSize) ?? inherited
}

/**
 * Attributes that tie an element's rendering to its current bounds.
 *
 * A regenerated <text> is rebuilt from our own tspans at our own size, so a
 * filter, mask or clip sized around the designer's run would land somewhere
 * else entirely. Refuse rather than reposition.
 */
const REFERENCE_ATTRS = ['filter', 'mask', 'clip-path']

/**
 * Attributes that describe a typesetting model we do not implement.
 *
 * Each maps to its own refusal rather than a generic one, because the remedies
 * differ: textLength is something a designer can remove, vertical writing is
 * something the engine would have to learn.
 */
const UNSUPPORTED_TEXT_ATTRS: readonly (readonly [string, RegenerationRefusal])[] = [
  ['textLength', 'text_length'],
  ['lengthAdjust', 'text_length'],
  ['rotate', 'per_char_rotate'],
  ['writing-mode', 'writing_mode'],
  ['glyph-orientation-vertical', 'writing_mode'],
  ['unicode-bidi', 'writing_mode'],
]

/** The first unsupported construct declared on an element, if any. */
function unsupportedConstruct(attrs: string): RegenerationRefusal | null {
  for (const [name, refusal] of UNSUPPORTED_TEXT_ATTRS) {
    if (attribute(attrs, name)) return refusal
  }
  return null
}

/**
 * Read the geometry of every <text> element in a piece of artwork.
 *
 * One pass, because a card can be a 2 MB file and the Studio reloads it on
 * every visit — the artwork can be re-uploaded at any time, so nothing here is
 * cached against a row.
 */
export function extractArtworkGeometry(svg: string): ArtworkGeometry {
  const classFonts = readClassFonts(svg)
  const texts: TextGeometry[] = []

  type Frame = {
    tag: string
    id: string | null
    state: InheritedState
    /** Set on the <text> frame that is being accumulated. */
    text?: TextAccumulator
  }
  type TextAccumulator = {
    layerId: string | null
    textKey: string | null
    ctm: Matrix
    anchorPoint: Point | null
    anchor: TextAnchor
    fontSize: number
    letterSpacing: number
    families: string[]
    weight: number
    italic: boolean
    chunks: string[]
    tspans: number
    rawAttrs: string
    refuse: RegenerationRefusal | null
    elementStart: number
    elementEnd: number
  }

  const stack: Frame[] = []
  const textCounts = new Map<string, number>()
  const tagPattern = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g

  const state = (): InheritedState => (stack.length > 0 ? stack[stack.length - 1].state : ROOT_STATE)
  const layerId = (): string | null => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].id) return stack[i].id
    return null
  }
  const openText = (): TextAccumulator | null => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].text) return stack[i].text!
    return null
  }

  /** An element's own declarations, resolved on top of what it inherits. */
  const resolve = (attrs: string, inherited: InheritedState): InheritedState => {
    const classFont = (attribute(attrs, 'class')?.split(/\s+/) ?? [])
      .map((name) => classFonts.get(name))
      .filter((entry): entry is ClassFont => entry !== undefined)
      // Equal-specificity class selectors resolve by stylesheet order.
      .sort((a, b) => a.order - b.order)
      .at(-1)

    const family = resolveProperty(attrs, 'font-family', classFont?.family)
    // Resolved before letter-spacing, because an em tracking value is relative
    // to THIS element's size, not the one it inherited.
    const fontSize =
      parseLength(resolveProperty(attrs, 'font-size', classFont?.size), inherited.fontSize) ??
      inherited.fontSize

    return {
      ctm: multiply(inherited.ctm, parseTransform(attribute(attrs, 'transform'))),
      fontSize,
      letterSpacing: parseLetterSpacing(
        resolveProperty(attrs, 'letter-spacing', classFont?.letterSpacing),
        fontSize,
        inherited.letterSpacing,
      ),
      families: family ? parseFontFamilyList(family) : inherited.families,
      weight: parseWeight(resolveProperty(attrs, 'font-weight', classFont?.weight), inherited.weight),
      italic: parseItalic(resolveProperty(attrs, 'font-style', classFont?.style), inherited.italic),
      anchor: parseAnchor(resolveProperty(attrs, 'text-anchor', classFont?.anchor), inherited.anchor),
    }
  }

  /**
   * The point an element declares, if it declares one.
   *
   * `dx`/`dy` are deliberately ignored: they shift glyphs relative to the
   * previous run, which only has meaning inside typesetting we are about to
   * replace wholesale. A layer that positions itself purely by dx/dy reports no
   * position and is refused rather than anchored to the wrong place.
   */
  const declaredPoint = (attrs: string): Point | null => {
    const x = parseLength((attribute(attrs, 'x') ?? '').split(/[\s,]+/)[0])
    const y = parseLength((attribute(attrs, 'y') ?? '').split(/[\s,]+/)[0])
    return x === null && y === null ? null : { x: x ?? 0, y: y ?? 0 }
  }

  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = tagPattern.exec(svg)) !== null) {
    const [whole, closing, rawTag, attrs, selfClosing] = match

    const accumulating = openText()
    if (accumulating && match.index > cursor) {
      const chunk = svg.slice(cursor, match.index)
      if (chunk.trim()) accumulating.chunks.push(chunk)
    }
    cursor = match.index + whole.length

    const tag = rawTag.toLowerCase()

    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag !== tag) continue
        const finished = stack[i].text
        if (finished) {
          finished.elementEnd = match.index + whole.length
          texts.push(finaliseText(finished))
        }
        stack.length = i
        break
      }
      continue
    }

    // <style> holds CSS, not drawn text. Sampling it would put stylesheet
    // source into a layer's sample copy.
    if (tag === 'style') {
      if (!selfClosing) stack.push({ tag, id: null, state: state() })
      continue
    }

    const resolved = resolve(attrs, state())
    const id = attribute(attrs, 'id')?.trim() || null

    if (tag === 'textpath' && accumulating) accumulating.refuse ??= 'text_path'

    if (tag === 'tspan' && accumulating) {
      accumulating.tspans += 1
      accumulating.anchorPoint ??= declaredPoint(attrs)
      // A tspan can carry the unsupported constructs too, and a per-character
      // rotate lives there far more often than on the <text>.
      accumulating.refuse ??= unsupportedConstruct(attrs)
      // Two faces inside one run cannot be re-set as a single regenerated
      // element: we would have to pick one, and either choice is wrong.
      if (
        resolved.families.length > 0 &&
        accumulating.families.length > 0 &&
        resolved.families[0] !== accumulating.families[0]
      ) {
        accumulating.refuse ??= 'mixed_fonts'
      }
    }

    if (selfClosing) continue

    const frame: Frame = { tag, id, state: resolved }
    stack.push(frame)

    if (tag === 'text') {
      const layer = layerId()
      let key: string | null = null
      if (layer) {
        const n = (textCounts.get(layer) ?? 0) + 1
        textCounts.set(layer, n)
        key = `${layer}#${n}`
      }
      frame.text = {
        layerId: layer,
        textKey: key,
        ctm: resolved.ctm,
        anchorPoint: declaredPoint(attrs),
        anchor: resolved.anchor,
        fontSize: resolved.fontSize,
        letterSpacing: resolved.letterSpacing,
        families: resolved.families,
        weight: resolved.weight,
        italic: resolved.italic,
        chunks: [],
        tspans: 0,
        rawAttrs: attrs,
        elementStart: match.index,
        // Overwritten when </text> is reached. A file truncated mid-element
        // leaves the two equal, which is an empty edit rather than a corrupt one.
        elementEnd: match.index,
        refuse:
          (REFERENCE_ATTRS.some((name) => attribute(attrs, name)) ? 'filtered' : null) ??
          unsupportedConstruct(attrs),
      }
    }
  }

  return { viewBox: readViewBox(svg), texts }
}

function finaliseText(acc: {
  layerId: string | null
  textKey: string | null
  ctm: Matrix
  anchorPoint: Point | null
  anchor: TextAnchor
  fontSize: number
  letterSpacing: number
  families: string[]
  weight: number
  italic: boolean
  chunks: string[]
  tspans: number
  rawAttrs: string
  refuse: RegenerationRefusal | null
  elementStart: number
  elementEnd: number
}): TextGeometry {
  return {
    layerId: acc.layerId,
    textKey: acc.textKey,
    ctm: acc.ctm,
    // A run positioned purely by dx/dy has no anchor of its own. The origin is
    // reported so the shape of the record stays uniform; `refuseRegeneration`
    // is what tells a caller not to trust it.
    anchorPoint: acc.anchorPoint ?? { x: 0, y: 0 },
    anchor: acc.anchor,
    fontSize: acc.fontSize,
    letterSpacing: acc.letterSpacing,
    families: acc.families,
    weight: acc.weight,
    italic: acc.italic,
    sampleText: collapse(acc.chunks.join('')),
    tspans: acc.tspans,
    rawAttrs: acc.rawAttrs,
    elementStart: acc.elementStart,
    elementEnd: acc.elementEnd,
    refuseRegeneration:
      acc.refuse ??
      (acc.families.length === 0 ? 'no_font' : acc.anchorPoint === null ? 'no_position' : null),
  }
}

/**
 * Collapse a run's whitespace and decode its entities.
 *
 * A kerned run arrives split across tspans with newlines and indentation
 * between the fragments, so the raw join reads "A\n      G\n      OSTI".
 */
export function collapse(text: string): string {
  return decodeEntities(text.replace(/\s+/g, ' ').trim())
}
