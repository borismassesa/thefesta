// Sample values and layer highlighting for the ADMIN mapping preview.
//
// This exists to answer exactly one question: "did I bind this artwork layer to
// the right business field?" It is not a second design-job editor. Nothing here
// is persisted, nothing here is fetched, and none of it ever touches a real
// couple's answers — the values are constants compiled from the schema.
//
// The renderer itself is card-render.ts, shared with the design-job editor.
// There is deliberately no second rendering implementation.

import { CARD_FIELD_ROLES } from '@opusfesta/lib'
import { TEXT_NODE_SUFFIX } from './card-svg-fields'

/**
 * Stand-in content for every personalisable field, keyed by role.
 *
 * Taken from each role's own `example`, which is already the curated,
 * locale-correct placeholder shown to admins and designers on the input. Using
 * it here rather than a second table means the preview cannot drift from the
 * examples the rest of the product shows, and there is one place to correct.
 *
 * Two kinds of role are deliberately absent, so renderCardSvg skips them with
 * 'no_value' and the artwork keeps what the designer drew:
 *
 *   template scope — fixed copy that belongs to the design. Replacing "Familia
 *                    ya" with "Familia ya" is a no-op at best and a way to
 *                    corrupt kerned copy at worst.
 *   colour kind    — the palette chips. The point of this preview is checking
 *                    text bindings; recolouring the card would make it harder
 *                    to recognise, not easier.
 */
export const PREVIEW_SAMPLE_VALUES: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    CARD_FIELD_ROLES.filter(
      (role) => role.scope !== 'template' && role.kind !== 'colour' && role.example,
    ).map((role) => [role.key, role.example!]),
  ),
)

/** The roles the preview will actually write. */
export function sampledRoles(): string[] {
  return Object.keys(PREVIEW_SAMPLE_VALUES)
}

// ── Highlighting the layer under inspection ──

/**
 * The element id behind a mapper row.
 *
 * A layer holding several <text> nodes is addressed per node ('Artboard_1#2'),
 * but only the layer itself carries that id in the file, so the suffix has to
 * come off before anything can be selected.
 */
export function layerElementId(layerId: string): string {
  const cut = layerId.lastIndexOf(TEXT_NODE_SUFFIX)
  return cut === -1 ? layerId : layerId.slice(0, cut)
}

/** Width of the drawing in user units, for scaling the halo to the artwork. */
function viewBoxWidth(svg: string): number {
  const viewBox = /<svg\b[^>]*\bviewBox\s*=\s*"([^"]+)"/i.exec(svg)
  if (viewBox) {
    const parts = viewBox[1].trim().split(/[\s,]+/)
    const width = Number(parts[2])
    if (Number.isFinite(width) && width > 0) return width
  }
  const attr = /<svg\b[^>]*\bwidth\s*=\s*"(\d+(?:\.\d+)?)/i.exec(svg)
  if (attr) {
    const width = Number(attr[1])
    if (Number.isFinite(width) && width > 0) return width
  }
  return 1000
}

/** Marker put on the element being inspected. Never derived from the artwork. */
export const ACTIVE_LAYER_CLASS = 'of-mapper-active'

/**
 * The id shapes the artwork pipeline actually produces.
 *
 * Illustrator and Figma exports give us letters, digits, underscore, dot and
 * hyphen ('Bi._Fabiola_Thomas', 'invite_line-2', 'palette_swatch_1'). Anything
 * else is refused and the highlight simply does not appear, which is the right
 * failure: an admin loses a convenience, not the mapper.
 *
 * This is defence in depth rather than the actual guard. The id is never
 * interpolated into CSS at all — see markActiveLayer.
 */
const SAFE_LAYER_ID = /^[A-Za-z_][A-Za-z0-9_.-]*$/

/**
 * Spans of the file that look like markup but are not.
 *
 * Comments, CDATA and the CONTENT of <script>/<style> can all hold text that
 * reads exactly like an element with an id — an Illustrator export carrying
 * `<!-- <g id="couple_name_1"/> -->` from an earlier revision, or a stylesheet
 * with a commented-out rule. Walking backwards from a match to the nearest '<'
 * finds the one inside that text and rewrites it, which corrupts the artwork
 * and highlights nothing.
 *
 * The opening tag of <script>/<style> is NOT inert: it can carry a real id.
 * Only what sits between the tags is.
 */
function inertRanges(svg: string): [number, number][] {
  const ranges: [number, number][] = []
  const lower = svg.toLowerCase()
  const delimited: [string, string][] = [
    ['<!--', '-->'],
    ['<![CDATA[', ']]>'],
  ]

  let i = 0
  outer: while (i < svg.length) {
    const next = svg.indexOf('<', i)
    if (next === -1) break

    for (const [open, close] of delimited) {
      if (!svg.startsWith(open, next)) continue
      const end = svg.indexOf(close, next + open.length)
      const stop = end === -1 ? svg.length : end + close.length
      ranges.push([next, stop])
      i = stop
      continue outer
    }

    const element = /^<(script|style)\b/i.exec(svg.slice(next, next + 8))
    if (element) {
      const tagEnd = svg.indexOf('>', next)
      if (tagEnd === -1) {
        ranges.push([next, svg.length])
        break
      }
      const end = lower.indexOf(`</${element[1].toLowerCase()}`, tagEnd)
      const stop = end === -1 ? svg.length : end
      ranges.push([tagEnd + 1, stop])
      i = stop
      continue
    }

    i = next + 1
  }
  return ranges
}

/**
 * Put a class on the one element carrying this id.
 *
 * A literal string search rather than a built regex, so no part of the id is
 * ever interpreted: an id full of regex metacharacters is matched as the
 * characters it is. Returns null when the artwork has no such element.
 */
function addActiveClass(svg: string, id: string): string | null {
  const needle = `id="${id}"`
  const inert = inertRanges(svg)
  let from = 0

  for (;;) {
    const at = svg.indexOf(needle, from)
    if (at === -1) return null
    from = at + needle.length

    // Must be a whole attribute of an element, not the tail of 'data-id="…"'
    // and not text content that happens to read like one.
    if (!/\s/.test(svg[at - 1] ?? '')) continue
    if (inert.some(([start, stop]) => at >= start && at < stop)) continue
    const tagStart = svg.lastIndexOf('<', at)
    if (tagStart === -1) continue
    const tagEnd = svg.indexOf('>', tagStart)
    if (tagEnd === -1 || tagEnd < at) continue

    const tag = svg.slice(tagStart, tagEnd + 1)
    const existing = /\sclass\s*=\s*"([^"]*)"/.exec(tag)

    let replacement: string
    if (existing) {
      replacement =
        tag.slice(0, existing.index) +
        ` class="${existing[1]} ${ACTIVE_LAYER_CLASS}"` +
        tag.slice(existing.index + existing[0].length)
    } else {
      const name = /^<([A-Za-z][\w:.-]*)/.exec(tag)
      if (!name) continue
      replacement = `<${name[1]} class="${ACTIVE_LAYER_CLASS}"` + tag.slice(name[0].length)
    }

    return svg.slice(0, tagStart) + replacement + svg.slice(tagEnd + 1)
  }
}

/**
 * Ring the layer an admin is pointing at, inside the rendered SVG.
 *
 * Three redundant channels, because one is not enough:
 *
 *   halo   — a coloured glow, which is the obvious cue but useless on its own
 *            to a colour-blind admin, and the artwork is already full of colour.
 *   pulse  — a luminance change over time, readable without colour vision.
 *            Suppressed under prefers-reduced-motion.
 *   label  — the caller names the field in the page chrome. That is the channel
 *            that survives when both of the above fail.
 *
 * The halo is scaled to the viewBox rather than fixed: a stroke of "6" is
 * invisible on a 4000-unit card and swallows a 100-unit one.
 *
 * SELECTOR INJECTION IS NOT POSSIBLE HERE. Layer ids come from artwork someone
 * uploaded, so they are untrusted, and the earlier version interpolated one
 * into `[id="…"]` and leaned on rejecting quotes. That is a blocklist, and a
 * blocklist over untrusted input is a standing invitation. Instead the element
 * is TAGGED with a fixed class and the stylesheet only ever names that class,
 * so there is no position in the CSS an id can reach.
 *
 * Returns the SVG untouched when there is nothing to highlight, so the caller
 * can pass through without branching.
 */
export function markActiveLayer(svg: string, layerId: string | null): string {
  if (!layerId) return svg

  const elementId = layerElementId(layerId)
  if (!elementId || !SAFE_LAYER_ID.test(elementId)) return svg

  const tagged = addActiveClass(svg, elementId)
  if (tagged === null) return svg

  // Located on the TAGGED copy: adding the class moved every later offset.
  const openTag = /<svg\b[^>]*>/i.exec(tagged)
  if (!openTag) return svg

  const unit = viewBoxWidth(svg) / 200
  const style = `<style>
@keyframes of-mapper-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.45 } }
.${ACTIVE_LAYER_CLASS} {
  filter: drop-shadow(0 0 ${unit.toFixed(2)}px #7E5896) drop-shadow(0 0 ${(unit * 3).toFixed(2)}px #7E5896);
}
@media (prefers-reduced-motion: no-preference) {
  .${ACTIVE_LAYER_CLASS} { animation: of-mapper-pulse 1.4s ease-in-out infinite }
}
</style>`

  const insertAt = openTag.index + openTag[0].length
  return tagged.slice(0, insertAt) + style + tagged.slice(insertAt)
}

// ── What the preview panel should be showing ──

/**
 * The preview's state, as one value rather than four booleans.
 *
 * Split out from the component so the decision "which panel does the admin
 * see" is testable without a DOM. The app has no React test harness, so logic
 * left inside the component is logic nothing checks.
 */
export type PreviewState =
  | { kind: 'no_artwork' }
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'network_error'; message: string; retryable: true }
  | { kind: 'render_error'; message: string; retryable: false }

/**
 * Stable, sanitised copy.
 *
 * Storage, parser and font errors carry bucket paths, provider hostnames and
 * stack detail. None of that helps an admin decide what to do, and all of it
 * is worth not printing on a shared screen. The raw text is for the log.
 */
export const PREVIEW_MESSAGES = {
  network: 'The preview could not load this artwork.',
  render: 'This artwork could not be rendered.',
} as const

export function classifyPreview(input: {
  /** The card has an SVG attached at all. */
  artworkAttached: boolean
  /** Artwork downloaded and held in memory. */
  svg: string | null
  /** The fetch failed. Retrying is worth offering. */
  fetchFailed: boolean
  /** The renderer threw on this artwork. Retrying will do the same thing. */
  renderFailed: boolean
}): PreviewState {
  if (!input.artworkAttached) return { kind: 'no_artwork' }
  // Checked before `loading`: a failed fetch never sets svg, so the two are
  // otherwise indistinguishable and the panel would spin forever.
  if (input.fetchFailed) {
    return { kind: 'network_error', message: PREVIEW_MESSAGES.network, retryable: true }
  }
  if (input.svg === null) return { kind: 'loading' }
  if (input.renderFailed) {
    return { kind: 'render_error', message: PREVIEW_MESSAGES.render, retryable: false }
  }
  return { kind: 'ready' }
}
