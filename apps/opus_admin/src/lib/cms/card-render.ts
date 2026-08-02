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
import {
  FILLABLE_SHAPES,
  fillEditText,
  readClassFills,
  resolveShapeFill,
  shapeLayerIds,
  type FillTarget,
} from '@opusfesta/lib'

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
  /**
   * How many <tspan> elements are open where the replaceable run starts and
   * where it ends.
   *
   * Illustrator does not always wrap the first character: the reference card's
   * year is `<text>2<tspan>0</tspan><tspan>26</tspan></text>`, so the run
   * begins OUTSIDE a tspan and ends INSIDE one. Replacing that range removes
   * the opening tags but leaves a stray `</tspan>`, producing invalid XML that
   * renders as a broken card with no error anywhere. These two depths are what
   * let the edit rebalance the tags.
   */
  tspanDepthAtStart: number
  tspanDepthAtEnd: number
  hasImage: boolean
  /**
   * Where each fillable shape's colour must be written, as absolute document
   * offsets, so a colour can be applied without re-parsing. Resolved through
   * card-svg-shapes so the write always outranks whatever declared the original
   * colour, rather than being silently overridden by a stylesheet.
   */
  colourTargets: FillTarget[]
}

/** Move a target's offsets from attribute-relative to document-absolute. */
function shiftTarget(target: FillTarget, offset: number): FillTarget {
  return target.mode === 'replace'
    ? { mode: 'replace', start: target.start + offset, end: target.end + offset }
    : { ...target, at: target.at + offset }
}

/**
 * Locate the replaceable character data for each named layer.
 *
 * Mirrors the nesting rules in card-svg-fields.ts: the layer name lives on the
 * enclosing <g>, and the innermost named ancestor wins.
 */
function locateLayers(svg: string): Map<string, LayerSpan> {
  const spans = new Map<string, LayerSpan>()
  const classFills = readClassFills(svg)
  const stack: { tag: string; id: string | null; textKey?: string }[] = []
  const tagPattern = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g
  // How many <text> nodes each layer has produced so far, so the nth can be
  // addressed as 'layer#n'. See TEXT_NODE_SUFFIX in card-svg-fields.ts.
  const textCounts = new Map<string, number>()

  let cursor = 0
  let match: RegExpExecArray | null

  const currentLayerId = (): string | null => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].id) return stack[i].id
    return null
  }
  const currentTextKey = (): string | null => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].textKey) return stack[i].textKey!
    return null
  }
  const insideText = (): boolean => stack.some((el) => el.tag === 'text')

  const ensure = (id: string): LayerSpan => {
    const existing = spans.get(id)
    if (existing) return existing
    const created: LayerSpan = {
      start: -1, end: -1, textNodes: 0, tspans: 0,
      tspanDepthAtStart: 0, tspanDepthAtEnd: 0, hasImage: false, colourTargets: [],
    }
    spans.set(id, created)
    return created
  }

  while ((match = tagPattern.exec(svg)) !== null) {
    const [whole, closing, rawTag, attrs, selfClosing] = match

    if (match.index > cursor && insideText() && svg.slice(cursor, match.index).trim()) {
      // Widen to cover every run of character data, so a value replaces the
      // whole visible string rather than only its first word. Recorded against
      // the layer AND the individual <text> node, because a layer holding two
      // of them (an unnamed group with a month and a year in it) needs each
      // addressed separately.
      const tspanDepth = stack.reduce((n, el) => n + (el.tag === 'tspan' ? 1 : 0), 0)
      for (const key of [currentLayerId(), currentTextKey()]) {
        if (!key) continue
        const span = ensure(key)
        if (span.start === -1) {
          span.start = cursor
          span.tspanDepthAtStart = tspanDepth
        }
        span.end = match.index
        span.tspanDepthAtEnd = tspanDepth
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
      // '<' + the optional closing slash + the tag name. Missing the
      // `closing` term here shifts every offset by one and eats the quote.
      const attrsStart = match.index + 1 + closing.length + rawTag.length
      const target = shiftTarget(resolveShapeFill(attrs, classFills).target, attrsStart)
      for (const owner of shapeLayerIds(id, currentLayerId())) {
        ensure(owner).colourTargets.push(target)
      }
    }

    if (selfClosing) continue
    const frame: { tag: string; id: string | null; textKey?: string } = { tag, id }
    stack.push(frame)

    const layerId = currentLayerId()
    if (layerId) {
      if (tag === 'text') {
        const n = (textCounts.get(layerId) ?? 0) + 1
        textCounts.set(layerId, n)
        frame.textKey = `${layerId}#${n}`
        ensure(layerId).textNodes += 1
        ensure(frame.textKey).textNodes = 1
      }
      if (tag === 'tspan') {
        ensure(layerId).tspans += 1
        const textKey = currentTextKey()
        if (textKey) ensure(textKey).tspans += 1
      }
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
    if (layerIds.length !== 1) {
      skip('multi_layer')
      continue
    }

    // The artwork is checked BEFORE the stored `rasterised` flag, because the
    // flag is a claim about whatever export the card was mapped against. Once
    // artwork is re-exported and not re-mapped, trusting the flag reports a
    // fixed layer as still baked in, which sends a designer to redo work they
    // have already done. A layer this file doesn't have is a mapping problem.
    const span = layers.get(layerIds[0])
    if (!span) {
      skip('layer_missing')
      continue
    }
    if (binding.rasterised) {
      skip('rasterised')
      continue
    }

    // ── Colour fields write a `fill`, not text content ──
    if (binding.kind === 'colour') {
      if (!HEX_COLOUR.test(value)) {
        // Anything else could inject arbitrary CSS into the artwork.
        skip('bad_colour')
        continue
      }
      if (span.colourTargets.length === 0) {
        skip('no_fillable_shape')
        continue
      }
      for (const target of span.colourTargets) {
        const text = fillEditText(target, value)
        const at = target.mode === 'replace' ? target.start : target.at
        edits.push({ start: at, end: target.mode === 'replace' ? target.end : at, text })
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
    // Several <text> nodes in one layer is genuinely ambiguous: 'Save the Date'
    // set as three positioned words is one phrase, while an unnamed group
    // holding a month and a year is two fields. Refuse, and let the admin map
    // the individual nodes ('layer#1', 'layer#2') instead.
    if (span.textNodes > 1) {
      skip('complex_text')
      continue
    }
    // Several tspans inside ONE <text> is not ambiguous. Illustrator emits one
    // per kerning adjustment, so 'AGOSTI' arrives as four fragments of a single
    // run. The recorded span already covers from the first character to the
    // last, which means replacing it also swallows the intervening </tspan>
    // <tspan x=...> markup and collapses the run to one tspan. The <text>'s own
    // attributes and the first tspan's survive; only the per-character tracking
    // is lost, which is the price of the field being editable at all.

    // Rebalance the tspans the replacement swallows, in whichever direction
    // the run is unbalanced. Without this the artwork silently becomes invalid
    // XML and the card fails to render at all.
    let end = span.end
    let text = escapeXmlText(value)
    for (let extra = span.tspanDepthAtEnd - span.tspanDepthAtStart; extra > 0; extra--) {
      const closer = svg.indexOf('</tspan>', end)
      if (closer === -1) break
      end = closer + '</tspan>'.length
    }
    for (let missing = span.tspanDepthAtStart - span.tspanDepthAtEnd; missing > 0; missing--) {
      text += '</tspan>'
    }

    edits.push({ start: span.start, end, text })
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
