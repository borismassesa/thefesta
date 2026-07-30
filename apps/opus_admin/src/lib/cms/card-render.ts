// Writing a couple's details into their card's artwork.
//
// Takes the SVG, the card's layer→role bindings, and the field values collected
// from the couple, and returns the personalised SVG.
//
// The guiding rule is that this must never quietly produce a wrong card. A
// wedding invitation goes out to hundreds of guests and cannot be recalled, so
// every layer this can't rewrite safely is SKIPPED and REPORTED rather than
// guessed at. The caller decides whether the remaining gaps are acceptable.
//
// Four things it refuses to touch:
//
//   rasterised    — the layer is an embedded bitmap. No amount of text
//                   substitution changes a PNG.
//   multi_layer   — the role spans several layers (Opus Royal Ivory's date
//                   intro is three separately-positioned words). One string
//                   can't be split across them without inventing a layout.
//   complex_text  — the layer holds more than one <text>/<tspan>, so each
//                   fragment carries its own coordinates. Replacing them with
//                   one run would collapse the typesetting.
//   layer_missing — the binding names a layer this artwork doesn't have,
//                   usually because the artwork was re-exported.

import type { CardFieldBinding } from './card-field-roles'

/** A colour must be a hex value; anything else could be arbitrary CSS. */
const HEX_COLOUR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export type SkipReason =
  | 'rasterised'
  | 'multi_layer'
  | 'complex_text'
  | 'layer_missing'
  | 'no_value'
  /** A colour field whose value isn't a hex colour. */
  | 'bad_colour'
  /** A colour field bound to a layer with no fillable shape. */
  | 'no_fillable_shape'

export type RenderSkip = {
  role: string
  layerIds: string[]
  reason: SkipReason
}

export type CardRenderResult = {
  svg: string
  /** Roles written into the artwork. */
  applied: string[]
  /** Roles deliberately left alone, with the reason. */
  skipped: RenderSkip[]
}

/** XML-escape a value. A couple named "Bi & Bw" would otherwise corrupt the file. */
export function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

type LayerSpan = {
  /** Offsets of the character data to replace, inside the layer's single text run. */
  start: number
  end: number
  textNodes: number
  tspans: number
  hasImage: boolean
  /**
   * Where each fillable shape's `fill` lives, so a colour can be written
   * without re-parsing. `fillStart/fillEnd` span an existing fill="..." value;
   * `insertAt` is where to add one when the shape has none.
   */
  shapes: { fillStart: number; fillEnd: number } []
  shapeInsertPoints: number[]
}

/**
 * Locate the replaceable character data for each named layer.
 *
 * Mirrors the nesting rules in card-svg-fields.ts: the layer name lives on the
 * enclosing <g>, and the innermost named ancestor wins.
 */
const FILLABLE_SHAPES = new Set(['rect', 'circle', 'ellipse', 'path', 'polygon'])

function locateLayers(svg: string): Map<string, LayerSpan> {
  const spans = new Map<string, LayerSpan>()
  const stack: { tag: string; id: string | null }[] = []
  const tagPattern = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g

  let cursor = 0
  let match: RegExpExecArray | null

  const currentLayerId = (): string | null => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].id) return stack[i].id
    return null
  }
  const insideText = (): boolean => stack.some((el) => el.tag === 'text')

  const ensure = (id: string): LayerSpan => {
    const existing = spans.get(id)
    if (existing) return existing
    const created: LayerSpan = {
      start: -1, end: -1, textNodes: 0, tspans: 0, hasImage: false,
      shapes: [], shapeInsertPoints: [],
    }
    spans.set(id, created)
    return created
  }

  while ((match = tagPattern.exec(svg)) !== null) {
    const [whole, closing, rawTag, attrs, selfClosing] = match

    if (match.index > cursor && insideText()) {
      const id = currentLayerId()
      if (id && svg.slice(cursor, match.index).trim()) {
        const span = ensure(id)
        // Widen to cover every run of character data in the layer, so a value
        // replaces the whole visible string rather than only its first word.
        if (span.start === -1) span.start = cursor
        span.end = match.index
      }
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

    const idMatch = /\bid\s*=\s*"([^"]*)"/.exec(attrs)
    const id = idMatch?.[1]?.trim() || null

    if (tag === 'image') {
      const owner = currentLayerId() ?? id
      if (owner) ensure(owner).hasImage = true
    }

    // Shapes that can carry a colour. A swatch is just a filled shape, which
    // is why colour is the one field type that needs no font work.
    if (FILLABLE_SHAPES.has(tag)) {
      const owner = currentLayerId() ?? id
      if (owner) {
        const span = ensure(owner)
        // '<' + the optional closing slash + the tag name. Missing the
        // `closing` term here shifts every offset by one and eats the quote.
        const attrsStart = match.index + 1 + closing.length + rawTag.length
        const fill = /\bfill\s*=\s*"([^"]*)"/.exec(attrs)
        if (fill && fill.index !== undefined) {
          // Offsets of the value inside the attribute, in the whole document.
          const valueStart = attrsStart + fill.index + fill[0].indexOf('"') + 1
          span.shapes.push({ fillStart: valueStart, fillEnd: valueStart + fill[1].length })
        } else {
          // No fill attribute yet — remember where one can be inserted.
          span.shapeInsertPoints.push(attrsStart)
        }
      }
    }

    if (selfClosing) continue
    stack.push({ tag, id })

    const layerId = currentLayerId()
    if (layerId) {
      if (tag === 'text') ensure(layerId).textNodes += 1
      if (tag === 'tspan') ensure(layerId).tspans += 1
    }
  }

  return spans
}

/**
 * Personalise a card.
 *
 * `values` is keyed by field role. A role with no value is skipped rather than
 * blanked — an empty layer would silently delete design copy.
 */
export function renderCardSvg(
  svg: string,
  bindings: CardFieldBinding[],
  values: Record<string, string>,
): CardRenderResult {
  const layers = locateLayers(svg)
  const applied: string[] = []
  const skipped: RenderSkip[] = []

  // Collect edits first, then apply them back-to-front so earlier offsets stay
  // valid as the string length changes.
  const edits: { start: number; end: number; text: string }[] = []

  for (const binding of bindings) {
    const value = (values[binding.role] ?? '').trim()
    const layerIds = binding.layerIds ?? []
    const skip = (reason: SkipReason) => skipped.push({ role: binding.role, layerIds, reason })

    if (!value) {
      skip('no_value')
      continue
    }
    if (binding.rasterised) {
      skip('rasterised')
      continue
    }
    if (layerIds.length !== 1) {
      skip('multi_layer')
      continue
    }

    const span = layers.get(layerIds[0])
    if (!span) {
      skip('layer_missing')
      continue
    }

    // ── Colour fields write a `fill`, not text content ──
    if (binding.kind === 'colour') {
      if (!HEX_COLOUR.test(value)) {
        // Anything else could inject arbitrary CSS into the artwork.
        skip('bad_colour')
        continue
      }
      if (span.shapes.length === 0 && span.shapeInsertPoints.length === 0) {
        skip('no_fillable_shape')
        continue
      }
      for (const shape of span.shapes) {
        edits.push({ start: shape.fillStart, end: shape.fillEnd, text: value })
      }
      for (const at of span.shapeInsertPoints) {
        edits.push({ start: at, end: at, text: ` fill="${value}"` })
      }
      applied.push(binding.role)
      continue
    }

    if (span.start === -1) {
      skip('layer_missing')
      continue
    }
    // A bitmap inside the layer means the visible content isn't the text.
    if (span.hasImage) {
      skip('rasterised')
      continue
    }
    if (span.textNodes > 1 || span.tspans > 1) {
      skip('complex_text')
      continue
    }

    edits.push({ start: span.start, end: span.end, text: escapeXmlText(value) })
    applied.push(binding.role)
  }

  let out = svg
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  }

  return { svg: out, applied, skipped }
}

/**
 * One rendered card per guest.
 *
 * Everything except the per-guest role is identical, so the shared fields are
 * written once and only the guest name differs — an order of 50 guests is 50
 * cards that vary in exactly one layer.
 */
export function renderCardsForGuests(
  svg: string,
  bindings: CardFieldBinding[],
  values: Record<string, string>,
  guestNames: string[],
  guestRole = 'guest_name',
): { guestName: string; result: CardRenderResult }[] {
  return guestNames.map((guestName) => ({
    guestName,
    result: renderCardSvg(svg, bindings, { ...values, [guestRole]: guestName }),
  }))
}
