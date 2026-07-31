/**
 * The commission SVG contract: parser, validator and layer-schema extractor.
 * Specs: OP-CCS-PRD-001 §7.7; OP-CCS-TDD-001 §6; loopholes L10, L14.
 *
 * ── Why this is not the existing SVG reader ─────────────────────────────────
 *
 * `packages/lib/card-svg-shapes.ts` and admin's `card-svg-fields.ts` already
 * walk SVG, and they say plainly that they are "deliberately not a full SVG
 * parser" — a permissive tag walk over artwork WE control, to read layer names.
 * That is the right tool for that job.
 *
 * This is a different job. The file arriving here is an upload, it will be
 * served to hundreds of wedding guests, and a permissive parser at a security
 * boundary is not a parser — it is a vulnerability. So this module inverts the
 * posture: it is an ALLOW-LIST that FAILS CLOSED. Anything it does not
 * positively recognise is rejected, including constructs that are probably
 * harmless. A designer re-exporting from Illustrator is a five-minute fix; a
 * script tag reaching a guest's phone is not.
 *
 * ── What it defends against ────────────────────────────────────────────────
 *
 *   - Script execution: <script>, event handlers, javascript: URLs
 *   - Data exfiltration and phone-home: external href/src of any kind
 *   - XXE and entity expansion: any DOCTYPE is rejected outright
 *   - HTML smuggling via <foreignObject>
 *   - CSS-based attacks: @import, expression(), external url()
 *   - Encoding tricks: elements and attributes are matched against an
 *     allow-list, so an unrecognised or obfuscated name is rejected rather
 *     than needing to be recognised as malicious
 *
 * ── And the correctness rules ──────────────────────────────────────────────
 *
 * Beyond security, TDD §6.2 makes several rules blocking because each one has
 * already caused a real production failure: external font references render as
 * fallback glyphs in the compositor, and a missing max-chars silently overflows
 * long Tanzanian names off the edge of the card.
 *
 * Pure TypeScript, no dependencies, no DOM.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Allow-lists
// ─────────────────────────────────────────────────────────────────────────────

/** Elements a card may contain. Everything else is rejected. */
const ALLOWED_ELEMENTS = new Set([
  'svg', 'g', 'defs', 'style', 'title', 'desc', 'metadata',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'textPath',
  'image', 'use', 'symbol',
  'clipPath', 'mask', 'pattern', 'marker',
  'linearGradient', 'radialGradient', 'stop',
  'filter', 'feGaussianBlur', 'feOffset', 'feBlend', 'feColorMatrix',
  'feComposite', 'feFlood', 'feMerge', 'feMergeNode', 'feDropShadow',
])

/**
 * Elements that are never acceptable, listed separately from "unknown" so the
 * validator can give the designer a specific, actionable error rather than a
 * generic "unrecognised element".
 */
const FORBIDDEN_ELEMENTS = new Set([
  'script', 'foreignObject', 'iframe', 'embed', 'object', 'audio', 'video',
  'animate', 'animateTransform', 'animateMotion', 'set', 'handler',
])

/** Attributes allowed on any element. Presentation and geometry only. */
const ALLOWED_ATTRS = new Set([
  'id', 'class', 'style', 'transform', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
  'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'points', 'viewBox',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity',
  'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset',
  'stroke-miterlimit', 'opacity', 'clip-path', 'clip-rule', 'mask', 'filter',
  'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing',
  'word-spacing', 'text-anchor', 'dominant-baseline', 'alignment-baseline',
  'baseline-shift', 'writing-mode', 'text-decoration', 'white-space',
  'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform',
  'spreadMethod', 'patternUnits', 'patternContentUnits', 'patternTransform',
  'maskUnits', 'maskContentUnits', 'clipPathUnits', 'markerWidth',
  'markerHeight', 'refX', 'refY', 'orient', 'preserveAspectRatio',
  'xmlns', 'xmlns:xlink', 'version', 'xml:space', 'overflow', 'enable-background',
  'in', 'in2', 'result', 'stdDeviation', 'dx', 'dy', 'mode', 'values', 'type',
  'operator', 'flood-color', 'flood-opacity', 'k1', 'k2', 'k3', 'k4',
  'systemLanguage', 'requiredFeatures', 'display', 'visibility', 'color',
  'paint-order', 'vector-effect', 'shape-rendering', 'text-rendering', 'isolation',
  'mix-blend-mode', 'stroke-linejoin', 'font-variant', 'font-stretch',
  'pointer-events',
])

/** Attributes carrying a URL. Values are restricted to data: and #fragment. */
const URL_ATTRS = new Set(['href', 'xlink:href', 'src'])

/** The commission-specific machine-addressable attributes (TDD §6.1). */
const OP_ATTRS = new Set([
  'data-op-field', 'data-op-role', 'data-op-layer', 'data-op-slot',
  'data-op-swatch', 'data-op-swatches', 'data-op-max-chars', 'data-op-fit',
  'data-op-optional', 'data-op-card-version', 'data-op-category',
  // Marks the layer this module's own watermarkSvg() injects, so a preview can
  // be re-validated after compositing.
  'data-op-watermark',
])

/**
 * Attribute names are compared case-insensitively.
 *
 * The tokenizer lowercases attribute keys so that `onload` and `ONLOAD` are the
 * same thing to the event-handler check. That means the allow-lists have to be
 * lowercased too — SVG spells plenty of attributes in camelCase (viewBox,
 * patternUnits, gradientTransform, stdDeviation…), and comparing a lowercased
 * key against a camelCase list rejects every one of them. Folding case on both
 * sides does not widen what is allowed: the set of NAMES is unchanged, and an
 * attacker writing VIEWBOX gains nothing a renderer would act on.
 */
const ALLOWED_ATTRS_LC = new Set([...ALLOWED_ATTRS].map((a) => a.toLowerCase()))
const URL_ATTRS_LC = new Set([...URL_ATTRS].map((a) => a.toLowerCase()))
const OP_ATTRS_LC = new Set([...OP_ATTRS].map((a) => a.toLowerCase()))

// ─────────────────────────────────────────────────────────────────────────────
//  Findings
// ─────────────────────────────────────────────────────────────────────────────

export type SvgFindingSeverity = 'error' | 'warning'

export type SvgFinding = {
  severity: SvgFindingSeverity
  /** Stable machine code, so the UI can group and the report can be diffed. */
  code: string
  message: string
  /** Byte offset into the source, when known. Helps a designer find it. */
  at?: number
}

export type SvgFieldSpec = {
  field: string
  maxChars: number | null
  fit: string | null
  optional: boolean
}

export type SvgValidationReport = {
  ok: boolean
  findings: SvgFinding[]
  /** Populated even on failure, so QA can see what WAS understood. */
  schema: {
    cardVersion: string | null
    category: string | null
    viewBox: { minX: number; minY: number; width: number; height: number } | null
    fields: SvgFieldSpec[]
    slots: string[]
    swatches: { name: string; value: string }[]
    embeddedFonts: number
    externalFontRefs: string[]
    byteLength: number
  }
}

/** TDD §6.2: 4 MB after optimisation. */
export const MAX_SVG_BYTES = 4 * 1024 * 1024
/** 1080 x 1350 — the WhatsApp raster target, and therefore the card aspect. */
export const CARD_ASPECT = 4 / 5
const ASPECT_TOLERANCE = 0.01

// ─────────────────────────────────────────────────────────────────────────────
//  Tokenizer
// ─────────────────────────────────────────────────────────────────────────────

type Tag = {
  name: string
  attrs: Map<string, string>
  selfClosing: boolean
  closing: boolean
  at: number
}

class ParseError extends Error {
  constructor(message: string, readonly at: number) {
    super(message)
  }
}

/**
 * Decode the XML entities an attribute value may legitimately contain, so that
 * checks against the decoded value cannot be bypassed by writing
 * `&#106;avascript:` instead of `javascript:`.
 *
 * Only the five predefined entities and numeric character references are
 * decoded. A named entity beyond those five would require a DOCTYPE to define,
 * and DOCTYPEs are rejected outright — so encountering one is itself a signal.
 */
function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|lt|gt|amp|quot|apos);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    return { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[body] ?? whole
  })
}

/**
 * Walk the document, yielding tags. Throws ParseError on anything structurally
 * unexpected — which the caller converts into a validation failure rather than
 * a crash. Failing to parse is a rejection, never a pass.
 */
function* tokenize(src: string): Generator<Tag> {
  let i = 0
  const n = src.length

  while (i < n) {
    const lt = src.indexOf('<', i)
    if (lt === -1) return
    i = lt + 1

    // <!-- comment -->, <![CDATA[...]]>, <!DOCTYPE ...>
    if (src[i] === '!') {
      if (src.startsWith('!--', i)) {
        const end = src.indexOf('-->', i + 3)
        if (end === -1) throw new ParseError('unterminated comment', lt)
        i = end + 3
        continue
      }
      if (src.startsWith('![CDATA[', i)) {
        const end = src.indexOf(']]>', i + 8)
        if (end === -1) throw new ParseError('unterminated CDATA section', lt)
        i = end + 3
        continue
      }
      // A DOCTYPE can declare entities, which is the door to XXE and to
      // billion-laughs expansion. Card artwork never needs one.
      throw new ParseError('DOCTYPE and internal entity declarations are not allowed', lt)
    }

    // <?xml ... ?>
    if (src[i] === '?') {
      const end = src.indexOf('?>', i)
      if (end === -1) throw new ParseError('unterminated processing instruction', lt)
      i = end + 2
      continue
    }

    const closing = src[i] === '/'
    if (closing) i++

    // Element name.
    const nameStart = i
    while (i < n && !/[\s/>]/.test(src[i])) i++
    const name = src.slice(nameStart, i)
    if (!name) throw new ParseError('malformed tag', lt)

    const attrs = new Map<string, string>()
    let selfClosing = false

    // Attributes.
    for (;;) {
      while (i < n && /\s/.test(src[i])) i++
      if (i >= n) throw new ParseError('unterminated tag', lt)
      if (src[i] === '>') { i++; break }
      if (src[i] === '/' && src[i + 1] === '>') { selfClosing = true; i += 2; break }

      const attrStart = i
      while (i < n && !/[\s=/>]/.test(src[i])) i++
      const attrName = src.slice(attrStart, i)
      if (!attrName) throw new ParseError('malformed attribute', i)

      while (i < n && /\s/.test(src[i])) i++
      let value = ''
      if (src[i] === '=') {
        i++
        while (i < n && /\s/.test(src[i])) i++
        const quote = src[i]
        if (quote === '"' || quote === "'") {
          i++
          const end = src.indexOf(quote, i)
          if (end === -1) throw new ParseError(`unterminated value for ${attrName}`, attrStart)
          value = src.slice(i, end)
          i = end + 1
        } else {
          // Unquoted values are legal in HTML, not in XML, and they are a
          // classic parser-differential trick. Reject rather than guess.
          throw new ParseError(`attribute ${attrName} must be quoted`, attrStart)
        }
      }
      // Last-wins would let `href="#a" href="javascript:..."` slip past a
      // first-wins checker. Duplicates are simply not allowed.
      const key = attrName.toLowerCase()
      if (attrs.has(key)) throw new ParseError(`duplicate attribute ${attrName}`, attrStart)
      attrs.set(key, decodeEntities(value))
    }

    yield { name, attrs, selfClosing, closing, at: lt }
  }
}

/** Text content between tags, used to inspect <style> bodies. */
function styleBodies(src: string): string[] {
  const bodies: string[] = []
  const open = /<style\b[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = open.exec(src))) {
    const start = m.index + m[0].length
    const end = src.toLowerCase().indexOf('</style', start)
    if (end === -1) break
    bodies.push(src.slice(start, end))
  }
  return bodies
}

// ─────────────────────────────────────────────────────────────────────────────
//  Validator
// ─────────────────────────────────────────────────────────────────────────────

export type ValidateOptions = {
  /**
   * When the order's category is ticketed, a QR slot is mandatory: the scanner
   * PWA depends on it, and a card without one cannot be used as an entrance
   * pass at the door.
   */
  requireQrSlot: boolean
}

export function validateCommissionSvg(
  source: string,
  options: ValidateOptions = { requireQrSlot: false },
): SvgValidationReport {
  const findings: SvgFinding[] = []
  const fields: SvgFieldSpec[] = []
  const slots: string[] = []
  const swatches: { name: string; value: string }[] = []
  const externalFontRefs: string[] = []
  let embeddedFonts = 0
  let viewBox: SvgValidationReport['schema']['viewBox'] = null
  let cardVersion: string | null = null
  let category: string | null = null
  let sawSvgRoot = false

  // TextEncoder, not Buffer: this module is in @opusfesta/lib, which client
  // components may import, and Buffer does not exist in the browser bundle.
  const byteLength = new TextEncoder().encode(source).length
  const err = (code: string, message: string, at?: number) =>
    findings.push({ severity: 'error', code, message, at })
  const warn = (code: string, message: string, at?: number) =>
    findings.push({ severity: 'warning', code, message, at })

  if (byteLength > MAX_SVG_BYTES) {
    err(
      'file_too_large',
      `The file is ${(byteLength / 1048576).toFixed(1)} MB. The limit is 4 MB — large files stall on the mid-range Android phones most guests use.`,
    )
  }

  let tags: Tag[]
  try {
    tags = [...tokenize(source)]
  } catch (error) {
    const pe = error as ParseError
    // Unparseable means rejected. There is no partial-trust path.
    return {
      ok: false,
      findings: [
        {
          severity: 'error',
          code: 'unparseable',
          message: `This file could not be safely parsed: ${pe.message}. Re-export it as plain SVG from Illustrator or Figma.`,
          at: pe.at,
        },
      ],
      schema: {
        cardVersion: null, category: null, viewBox: null, fields: [], slots: [],
        swatches: [], embeddedFonts: 0, externalFontRefs: [], byteLength,
      },
    }
  }

  for (const tag of tags) {
    if (tag.closing) continue
    const lower = tag.name.toLowerCase()

    if (FORBIDDEN_ELEMENTS.has(tag.name) || FORBIDDEN_ELEMENTS.has(lower)) {
      err(
        'forbidden_element',
        `<${tag.name}> is not allowed in a card. It can execute code on a guest's phone.`,
        tag.at,
      )
      continue
    }
    if (!ALLOWED_ELEMENTS.has(tag.name)) {
      err(
        'unknown_element',
        `<${tag.name}> is not on the allowed list. Cards may only use plain shapes, text, gradients and embedded images.`,
        tag.at,
      )
      continue
    }

    if (tag.name === 'svg') {
      sawSvgRoot = true
      cardVersion = tag.attrs.get('data-op-card-version') ?? null
      category = tag.attrs.get('data-op-category') ?? null
      // Lowercased: the tokenizer folds attribute keys (see ALLOWED_ATTRS_LC).
      const vb = tag.attrs.get('viewbox')
      if (!vb) {
        err('no_viewbox', 'The root <svg> has no viewBox. Without it the card cannot be scaled to a consistent raster.', tag.at)
      } else {
        const parts = vb.trim().split(/[\s,]+/).map(Number)
        if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p))) {
          err('bad_viewbox', `viewBox "${vb}" is not four numbers.`, tag.at)
        } else {
          const [minX, minY, width, height] = parts
          viewBox = { minX, minY, width, height }
          const aspect = width / height
          if (Math.abs(aspect - CARD_ASPECT) > ASPECT_TOLERANCE) {
            err(
              'bad_aspect',
              `The card is ${width}x${height} (ratio ${aspect.toFixed(3)}). It must be 4:5 — for example 1080x1350 — so every card rasterises identically for WhatsApp.`,
              tag.at,
            )
          }
        }
      }
    }

    for (const [attr, value] of tag.attrs) {
      // Event handlers, in any casing or spelling.
      if (attr.startsWith('on')) {
        err('event_handler', `The attribute "${attr}" runs code. Remove it.`, tag.at)
        continue
      }
      if (OP_ATTRS_LC.has(attr)) continue

      if (URL_ATTRS_LC.has(attr)) {
        const v = value.trim()
        const safe = v.startsWith('data:') || v.startsWith('#')
        if (!safe) {
          err(
            'external_reference',
            `"${attr}" points at ${v.slice(0, 60)}. Cards must be fully self-contained: embed the asset as a data: URI, or reference an element in the same file with #id.`,
            tag.at,
          )
        } else if (v.toLowerCase().replace(/\s/g, '').startsWith('data:text/html')) {
          err('html_data_uri', 'A data:text/html reference is not allowed.', tag.at)
        }
        continue
      }

      if (!ALLOWED_ATTRS_LC.has(attr)) {
        err(
          'unknown_attribute',
          `The attribute "${attr}" on <${tag.name}> is not on the allowed list.`,
          tag.at,
        )
        continue
      }

      // Inline styles can smuggle the same attacks as a <style> block.
      if (attr === 'style') {
        const s = value.toLowerCase()
        if (s.includes('javascript:') || s.includes('expression(') || s.includes('@import')) {
          err('unsafe_style', `The style attribute on <${tag.name}> contains an executable expression.`, tag.at)
        }
        const urls = [...value.matchAll(/url\(\s*['"]?([^'")]+)/gi)].map((m) => m[1].trim())
        for (const u of urls) {
          if (!u.startsWith('#') && !u.startsWith('data:')) {
            err('external_reference', `The style attribute references ${u.slice(0, 60)}, which is outside the file.`, tag.at)
          }
        }
      }
    }

    // ── Machine-addressable layers ─────────────────────────────────────────
    const field = tag.attrs.get('data-op-field')
    if (field) {
      const rawMax = tag.attrs.get('data-op-max-chars')
      const maxChars = rawMax ? Number(rawMax) : null
      if (rawMax && !Number.isFinite(maxChars)) {
        err('bad_max_chars', `data-op-max-chars="${rawMax}" on "${field}" is not a number.`, tag.at)
      }
      if (!rawMax) {
        err(
          'missing_max_chars',
          `The field "${field}" has no data-op-max-chars. Long Tanzanian names overflow silently without it.`,
          tag.at,
        )
      }
      fields.push({
        field,
        maxChars: Number.isFinite(maxChars) ? (maxChars as number) : null,
        fit: tag.attrs.get('data-op-fit') ?? null,
        optional: tag.attrs.get('data-op-optional') === 'true',
      })
    }

    const slot = tag.attrs.get('data-op-slot')
    if (slot) slots.push(slot)

    const swatch = tag.attrs.get('data-op-swatch')
    if (swatch) swatches.push({ name: swatch, value: tag.attrs.get('fill') ?? '' })
  }

  if (!sawSvgRoot) {
    err('no_svg_root', 'No root <svg> element was found. This does not look like an SVG file.')
  }

  // ── Per-guest substitution needs exactly one anchor ───────────────────────
  const guestNameFields = fields.filter((f) => f.field === 'guest_name')
  if (guestNameFields.length === 0) {
    err(
      'no_guest_name',
      'The card has no data-op-field="guest_name". OpusPass substitutes each guest\'s name into that layer, so a card without one cannot be personalised.',
    )
  } else if (guestNameFields.length > 1) {
    err(
      'duplicate_guest_name',
      `Found ${guestNameFields.length} layers marked guest_name. There must be exactly one — otherwise there is no single anchor to substitute into.`,
    )
  }

  const duplicateFields = fields
    .map((f) => f.field)
    .filter((f, i, arr) => f !== 'guest_name' && arr.indexOf(f) !== i)
  for (const dup of [...new Set(duplicateFields)]) {
    warn('duplicate_field', `The field "${dup}" appears more than once. Both copies will receive the same value.`)
  }

  if (options.requireQrSlot && !slots.includes('qr')) {
    err(
      'no_qr_slot',
      'This category issues entrance passes, so the card must include a QR slot: <rect data-op-slot="qr" .../>. The scanner at the door depends on it.',
    )
  }

  // ── Fonts ────────────────────────────────────────────────────────────────
  // External font references are a known past failure: they render as fallback
  // glyphs in the compositor, so the card the guest receives is not the card
  // that was approved.
  for (const body of styleBodies(source)) {
    const lower = body.toLowerCase()
    if (lower.includes('@import')) {
      err('style_import', '<style> contains an @import, which pulls in an external stylesheet.')
    }
    if (lower.includes('javascript:') || lower.includes('expression(')) {
      err('unsafe_style', '<style> contains an executable expression.')
    }
    for (const m of body.matchAll(/@font-face[^}]*\}/gi)) {
      const face = m[0]
      const srcs = [...face.matchAll(/url\(\s*['"]?([^'")]+)/gi)].map((s) => s[1].trim())
      for (const u of srcs) {
        if (u.startsWith('data:')) {
          embeddedFonts++
          if (!/^data:(font\/woff2|application\/font-woff2)/i.test(u)) {
            warn(
              'font_not_woff2',
              'An embedded font is not WOFF2. It will still render, but the file will be larger than it needs to be.',
            )
          }
        } else {
          externalFontRefs.push(u)
          err(
            'external_font',
            `The font "${u.slice(0, 60)}" is referenced but not embedded. External fonts render as fallback glyphs in the compositor, so the guest sees a different card from the one approved.`,
          )
        }
      }
    }
    for (const u of body.matchAll(/url\(\s*['"]?([^'")]+)/gi)) {
      const v = u[1].trim()
      if (!v.startsWith('#') && !v.startsWith('data:')) {
        err('external_reference', `<style> references ${v.slice(0, 60)}, which is outside the file.`)
      }
    }
  }

  const hasTextElement = tags.some((t) => !t.closing && t.name === 'text')
  if (hasTextElement && embeddedFonts === 0 && externalFontRefs.length === 0) {
    warn(
      'no_embedded_font',
      'The card has text but no embedded @font-face. If it relies on a system font, the compositor will substitute a different one.',
    )
  }

  return {
    ok: findings.every((f) => f.severity !== 'error'),
    findings,
    schema: {
      cardVersion, category, viewBox, fields, slots, swatches,
      embeddedFonts, externalFontRefs, byteLength,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Watermarking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Composite a watermark ACROSS the artwork, server-side.
 * Spec: OP-CCS-TDD-001 §7.4; loophole L14.
 *
 * Deliberately not a corner mark. L14 is "customer approves, screenshots the
 * preview, never pays the balance" — a corner watermark is cropped out in
 * seconds. A repeating diagonal wash over the whole card cannot be removed
 * from a screenshot without destroying the thing being stolen, which is the
 * entire point.
 *
 * Applied at render time to a COPY. The clean master is never written to a
 * bucket the customer's session can reach, and does not exist in storage at all
 * until settlement, so a leaked signed URL cannot expose it.
 *
 * Returns SVG rather than a raster because it needs no native dependency: the
 * preview is served as an <img src> from a private signed URL, and the raster
 * master is generated by the existing card-render pipeline at settlement.
 */
export function watermarkSvg(source: string, label = 'OpusFesta · PREVIEW'): string {
  const closing = source.lastIndexOf('</svg>')
  if (closing === -1) return source

  const vb = source.match(/viewBox\s*=\s*["']([^"']+)["']/i)
  const parts = vb ? vb[1].trim().split(/[\s,]+/).map(Number) : []
  const width = parts.length === 4 && Number.isFinite(parts[2]) ? parts[2] : 1080
  const height = parts.length === 4 && Number.isFinite(parts[3]) ? parts[3] : 1350

  // Escape the label: it is a caller-supplied string landing inside markup.
  const safe = label
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const fontSize = Math.round(width / 22)
  const overlay = `
<g data-op-watermark="true" pointer-events="none">
  <defs>
    <pattern id="op-wm" width="${Math.round(width / 2)}" height="${Math.round(height / 5)}"
             patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
      <text x="0" y="${fontSize}" font-family="sans-serif" font-size="${fontSize}"
            fill="#4A2D5C" fill-opacity="0.16" letter-spacing="2">${safe}</text>
    </pattern>
  </defs>
  <rect x="${parts[0] ?? 0}" y="${parts[1] ?? 0}" width="${width}" height="${height}" fill="url(#op-wm)"/>
</g>`

  return source.slice(0, closing) + overlay + source.slice(closing)
}

/** True when a validated report is safe to publish to guests. */
export function isPublishable(report: SvgValidationReport): boolean {
  return report.ok
}

/** Errors only, for the blocking message shown at upload. */
export function blockingErrors(report: SvgValidationReport): SvgFinding[] {
  return report.findings.filter((f) => f.severity === 'error')
}
