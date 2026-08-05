// Serialising a resolved plan into SVG.
//
// Deliberately the dullest module in the engine. Every decision — which lines,
// what size, where each baseline sits, what is visible — was made in
// card-layout-resolve.ts. Nothing here measures, fits, wraps or reflows. If a
// question can be asked about the output, its answer is in the plan.
//
// That division is what lets the Studio preview and the server produce the same
// card: two serialisers, one plan, and a test that asserts they agree.
//
// Two details that look like style and are not:
//
// OVERRIDES GO IN AN INLINE STYLE, not in attributes. Illustrator's default
// export puts font-size in a <style> block and leaves only class="cls-7" on the
// element, and a CSS class beats a presentation attribute. Writing
// font-size="12" next to that class would be silently ignored, and the card
// would render at the designer's size with our line breaks — the worst of both.
// An inline style is the only thing that outranks a class, the same conclusion
// card-svg-shapes.ts reached for colours.
//
// FIELDS REPLACE THEIR SOURCE ELEMENT IN PLACE. They are not appended to an
// overlay group, because that would lift every personalised field above the
// whole artwork and destroy any intended compositing — a name that sat behind a
// decorative frame would jump in front of it. Only genuinely new elements are
// placed, and those state where they go.

import type { CardFieldBinding } from './card-field-roles'
import { extractArtworkGeometry, type TextGeometry } from './card-geometry'
import type { OverlayPlacement } from './card-layout'
import type { CardRenderPlan, ResolvedElement, ResolvedTextField } from './card-layout-resolve'
import { escapeXmlText, renderCardSvg, type CardRenderResult } from './card-render'

export type PlanRenderResult = CardRenderResult & {
  /** Field ids written by the layout engine. */
  regenerated: string[]
  /** Roles handed to the in-place renderer instead. */
  deferred: string[]
}

/** Attributes the layout engine owns. Anything else on the element survives. */
const CONTROLLED_ATTRS = ['x', 'y', 'dx', 'dy', 'font-size', 'text-anchor', 'letter-spacing']

/** The same properties as CSS, since a class can declare them too. */
const CONTROLLED_PROPERTIES = ['font-size', 'text-anchor', 'letter-spacing']

const ANCHOR_FOR_LINES = { start: 'start', middle: 'middle', end: 'end' } as const

/**
 * Write a plan into a piece of artwork.
 *
 * `bindings` is still needed for the roles the plan deferred: those are written
 * by card-render.ts, which addresses layers rather than plan fields.
 */
export function renderPlanToSvg(
  svg: string,
  plan: CardRenderPlan,
  bindings: CardFieldBinding[],
  values: Record<string, string>,
): PlanRenderResult {
  const geometry = extractArtworkGeometry(svg)
  const byTarget = new Map<string, TextGeometry>()
  for (const text of geometry.texts) {
    if (text.textKey && !byTarget.has(text.textKey)) byTarget.set(text.textKey, text)
    if (text.layerId && !byTarget.has(text.layerId)) byTarget.set(text.layerId, text)
  }

  const edits: { start: number; end: number; text: string }[] = []
  const regenerated: string[] = []
  const deferredRoles = new Set(plan.deferredRoles)

  for (const field of Object.values(plan.fields)) {
    if (!field.regenerable) continue

    const source = byTarget.get(field.target)
    if (!source) {
      // The artwork changed under the plan. Hand the role back rather than
      // writing nothing: the in-place renderer will report layer_missing, which
      // is the accurate diagnosis.
      deferredRoles.add(field.role)
      continue
    }

    // Four outcomes, decided in the resolver. This is the ONLY place design
    // copy is ever deleted, and only because a policy or a rule said so.
    if (field.presence === 'placeholder') continue
    if (field.presence === 'hidden') {
      edits.push({ start: source.elementStart, end: source.elementEnd, text: '' })
      regenerated.push(field.fieldId)
      continue
    }
    if (field.presence === 'empty') {
      // Deliberately an EMPTY element rather than no element: a group's spacing
      // and any sibling positioned against it stay as the designer drew them.
      edits.push({
        start: source.elementStart,
        end: source.elementEnd,
        text: textElement({ ...field, lines: [] }),
      })
      regenerated.push(field.fieldId)
      continue
    }

    edits.push({
      start: source.elementStart,
      end: source.elementEnd,
      text: textElement(field),
    })
    regenerated.push(field.fieldId)
  }

  for (const edit of placeElements(svg, plan.elements, byTarget)) edits.push(edit)

  // Back-to-front, so earlier offsets stay valid as lengths change.
  let out = svg
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  }

  // The in-place pass runs on the already-edited document. It re-parses, so the
  // shifted offsets are not a problem, and it only ever sees deferred roles.
  const inPlace = renderCardSvg(
    out,
    bindings.filter((binding) => deferredRoles.has(binding.role) || isColour(binding)),
    values,
  )

  return {
    svg: inPlace.svg,
    applied: [...regenerated, ...inPlace.applied],
    skipped: inPlace.skipped,
    regenerated,
    deferred: [...deferredRoles],
  }
}

/**
 * Colour fields are always the in-place path's job.
 *
 * A swatch is a filled shape, not a run of text: it has no geometry, no
 * measurement and no fit. This is not a fallback, it is the other renderer
 * doing the thing it is for.
 */
function isColour(binding: CardFieldBinding): boolean {
  return binding.kind === 'colour'
}

/** Build the replacement <text> for one resolved field. */
export function textElement(field: ResolvedTextField): string {
  const anchor =
    field.lines.length > 0 && field.box.w > 0
      ? anchorFromX(field)
      : ANCHOR_FOR_LINES.start

  const attrs = overrideAttributes(field.rawAttrs, {
    'font-size': `${field.font.size}px`,
    'text-anchor': anchor,
    ...(field.font.letterSpacing ? { 'letter-spacing': `${field.font.letterSpacing}px` } : {}),
  })

  const tspans = field.lines
    .map((line) => `<tspan x="${line.x}" y="${line.baselineY}">${escapeXmlText(line.text)}</tspan>`)
    .join('')

  return `<text${attrs}>${tspans}</text>`
}

/**
 * Recover the anchor from where the resolver put the lines.
 *
 * The plan carries coordinates rather than an alignment, deliberately: the
 * coordinate is what actually determines the drawing, and re-deriving the
 * anchor from it means the two can never contradict each other.
 */
function anchorFromX(field: ResolvedTextField): 'start' | 'middle' | 'end' {
  const x = field.lines[0].x
  const centre = field.box.x + field.box.w / 2
  const right = field.box.x + field.box.w
  if (Math.abs(x - centre) < 0.01) return 'middle'
  if (Math.abs(x - right) < 0.01) return 'end'
  return 'start'
}

/**
 * Place overlay elements according to their declared stacking position.
 *
 * Appending everything to the end of the document would put every overlay above
 * the whole artwork. That is right for a QR code on a blank corner and wrong
 * for anything meant to sit behind a frame or inside a decorative group, so the
 * position is stated per element rather than assumed.
 */
function placeElements(
  svg: string,
  elements: ResolvedElement[],
  byTarget: Map<string, TextGeometry>,
): { start: number; end: number; text: string }[] {
  const visible = elements.filter((element) => element.visible)
  if (visible.length === 0) return []

  const edits: { start: number; end: number; text: string }[] = []
  const ordered = [...visible].sort((a, b) => a.z - b.z)

  const grouped = new Map<string, ResolvedElement[]>()
  for (const element of ordered) {
    const key = placementKey(element.placement)
    const bucket = grouped.get(key) ?? []
    bucket.push(element)
    grouped.set(key, bucket)
  }

  for (const [key, bucket] of grouped) {
    const markup = bucket.map(elementMarkup).join('')
    const anchor = placementAnchor(svg, key, byTarget)
    if (anchor) edits.push({ ...anchor, text: anchor.replace ? markup : markup + anchor.keep })
  }

  return edits.map(({ start, end, text }) => ({ start, end, text }))
}

function placementKey(placement: OverlayPlacement): string {
  return placement.kind === 'above-all' || placement.kind === 'below-all'
    ? placement.kind
    : `${placement.kind}:${placement.layerId}`
}

/** Where a bucket of elements is spliced in. */
function placementAnchor(
  svg: string,
  key: string,
  byTarget: Map<string, TextGeometry>,
): { start: number; end: number; replace: boolean; keep: string } | null {
  if (key === 'above-all') {
    const close = svg.lastIndexOf('</svg>')
    return close === -1 ? null : { start: close, end: close, replace: false, keep: '' }
  }
  if (key === 'below-all') {
    const open = /<svg\b[^>]*>/i.exec(svg)
    if (!open) return null
    const at = open.index + open[0].length
    return { start: at, end: at, replace: false, keep: '' }
  }

  const [kind, layerId] = key.split(/:(.+)/)
  const source = byTarget.get(layerId)
  if (!source) return null

  return kind === 'replace-layer'
    ? { start: source.elementStart, end: source.elementEnd, replace: true, keep: '' }
    : { start: source.elementEnd, end: source.elementEnd, replace: false, keep: '' }
}

/**
 * One overlay element as SVG.
 *
 * QR codes are emitted by the caller as an image href, because generating the
 * matrix needs the `qrcode` dependency and this package stays free of runtime
 * dependencies so both apps can import it anywhere.
 */
function elementMarkup(element: ResolvedElement): string {
  const { x, y, w, h } = element.box
  switch (element.type) {
    case 'qr':
    case 'image':
      return `<image id="${escapeAttr(element.id)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${
        element.type === 'image' && element.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'
      }" href="${escapeAttr(element.type === 'qr' ? element.source : element.href)}"/>`
    case 'shape':
      return element.shape === 'ellipse'
        ? `<ellipse id="${escapeAttr(element.id)}" cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${escapeAttr(element.fill)}"/>`
        : `<rect id="${escapeAttr(element.id)}" x="${x}" y="${y}" width="${w}" height="${h}"${
            element.radius ? ` rx="${element.radius}"` : ''
          } fill="${escapeAttr(element.fill)}"/>`
  }
}

function escapeAttr(value: string): string {
  return escapeXmlText(value).replace(/"/g, '&quot;')
}

/**
 * Strip the attributes the layout engine owns and re-declare them in an inline
 * style, which is the only thing that outranks a CSS class.
 *
 * Everything else the designer declared — fill, gradient reference, opacity,
 * stroke, paint-order, font-feature-settings — is carried through verbatim,
 * because the element's attribute string is kept whole rather than filtered
 * through an allowlist that would silently drop whatever nobody thought of.
 */
export function overrideAttributes(rawAttrs: string, overrides: Record<string, string>): string {
  let attrs = rawAttrs
  for (const name of CONTROLLED_ATTRS) {
    attrs = attrs.replace(
      new RegExp(`(^|[^\\w-])${name}\\s*=\\s*"[^"]*"`, 'gi'),
      (_whole, prefix: string) => prefix,
    )
  }

  const styleMatch = /(^|[^\w-])style\s*=\s*"([^"]*)"/i.exec(attrs)
  const existing = (styleMatch?.[2] ?? '')
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(
      (declaration) =>
        declaration !== '' &&
        !CONTROLLED_PROPERTIES.some((property) =>
          new RegExp(`^${property}\\s*:`, 'i').test(declaration),
        ),
    )
  if (styleMatch) {
    attrs = attrs.replace(/(^|[^\w-])style\s*=\s*"[^"]*"/i, (_whole, prefix: string) => prefix)
  }

  const declarations = [
    ...existing,
    ...Object.entries(overrides).map(([property, value]) => `${property}:${value}`),
  ]

  return `${attrs.trimEnd()} style="${declarations.join(';')}"`
}
