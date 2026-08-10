// Making a leaked card traceable, and making the easy copy worthless.
//
// Three separate jobs live here, and they are deliberately not the same thing:
//
//   traceCode()        — derives the short code that identifies WHO was shown a
//                        card. Pure, so the same viewer always gets the same
//                        code and a leak can be matched back later.
//   traceWatermarkSvg()— stamps that code across the artwork faintly enough to
//                        go unnoticed and densely enough to survive a crop.
//   PREVIEW_WIDTH_PX   — the ceiling a public preview is rendered at.
//
// None of this stops a screenshot. Nothing on the web does. What it changes is
// what a screenshot is WORTH: a preview-width raster carrying the leaker's code
// is neither printable nor anonymous, and that is the whole of the claim.
//
// Kept pure and dependency-free so it can be unit-tested without a rasteriser,
// and so the same code path runs on the server and in the golden-pixel tests.

/**
 * The widest a PUBLIC preview is ever rendered.
 *
 * 5:7 at 640px is ~640x896 — comfortable on a retina phone at the sizes the
 * storefront actually displays (max ~420px CSS), and useless for print: a
 * wedding invitation is 5x7 inches, so this lands at ~128 DPI against the 300
 * DPI a press needs. The number is the POINT of the protection, not a
 * performance tuning knob. Raising it to "look sharper" hands the artwork back.
 */
export const PREVIEW_WIDTH_PX = 640

/**
 * The widest a paid owner's own card is rendered.
 *
 * Print quality, because they bought it.
 */
export const OWNER_WIDTH_PX = 2100

/** Characters used by traceCode. No vowels, so codes cannot spell anything. */
const TRACE_ALPHABET = '0123456789BCDFGHJKLMNPQRSTVWXZ'

/**
 * A short, stable, non-reversible code identifying one viewer of one card.
 *
 * Derived from an HMAC the caller has already computed, NOT from the viewer's
 * identifiers directly. That split matters: this module is imported by client
 * bundles for the CSS helpers below, and a function that turned a session id
 * into a code would put the recipe in the browser. The secret never leaves the
 * server; this only reshapes a digest into something short enough to read off a
 * screenshot.
 *
 * @param digestHex a hex digest (any length >= 8) from a keyed hash
 * @param length    how many characters. 8 gives ~30^8 = 6.5e11 codes, far more
 *                  than the population of cards, and stays legible when found.
 */
export function traceCode(digestHex: string, length = 8): string {
  const clean = digestHex.replace(/[^0-9a-f]/gi, '').toLowerCase()
  if (clean.length < 8) {
    throw new Error('traceCode needs at least 8 hex characters of digest')
  }
  let out = ''
  for (let i = 0; i < length; i += 1) {
    // Two hex chars per output char, wrapping if the digest is short. Wrapping
    // rather than throwing keeps a shorter digest usable; the collision cost is
    // bounded by the digest's own entropy either way.
    const pair = clean.slice((i * 2) % clean.length, ((i * 2) % clean.length) + 2)
    out += TRACE_ALPHABET[parseInt(pair, 16) % TRACE_ALPHABET.length]
  }
  return out
}

/** Escapes a string landing inside SVG markup. */
function escapeMarkup(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Reads the artwork's user-space box, so the stamp covers the real canvas.
 *
 * Falls back to the 5:7 card at 1080 wide, which is the shape every catalogue
 * card uses. A wrong box would tile the mark off the edge of the card, which
 * fails SILENTLY — the render succeeds and simply carries no mark — so the
 * fallback is the common case rather than a zero.
 */
function viewBox(source: string): { x: number; y: number; w: number; h: number } {
  const match = source.match(/viewBox\s*=\s*["']([^"']+)["']/i)
  const parts = match ? match[1].trim().split(/[\s,]+/).map(Number) : []
  if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
    return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] }
  }
  return { x: 0, y: 0, w: 1080, h: 1512 }
}

/**
 * Stamps a trace code across the artwork, close to invisibly.
 *
 * Opacity is the whole design. At 0.030 on the mid-tones these cards use, the
 * mark is below what the eye picks out of a busy floral illustration, but a
 * levels adjustment in any image editor pulls it straight out. Raising it makes
 * the card look dirty; lowering it does not survive the JPEG re-encode that
 * WhatsApp and Instagram apply on the way through.
 *
 * Tiled rather than placed once, at a tile smaller than a quarter of the card,
 * so that cropping to "just the names" still carries at least one whole code.
 *
 * Returns the source unchanged when there is no closing tag to insert before —
 * a malformed SVG is the rasteriser's error to report, not this function's to
 * throw on, and returning the original keeps the failure in one place.
 */
export function traceWatermarkSvg(source: string, code: string): string {
  const closing = source.lastIndexOf('</svg>')
  if (closing === -1) return source

  const { x, y, w, h } = viewBox(source)
  const safe = escapeMarkup(code)

  // Sized off the canvas so a 300px template and a 3000px one look the same.
  const fontSize = Math.max(6, Math.round(w / 60))
  const tileW = Math.round(w / 3)
  const tileH = Math.round(h / 6)

  // A per-call id. Two watermarked SVGs inlined into one document would
  // otherwise share a <pattern> id, and the second one silently adopts the
  // first one's code — which is exactly the wrong failure for a trace mark.
  const id = `op-trace-${safe.toLowerCase()}`

  const overlay = `
<g data-op-trace="${safe}" pointer-events="none" aria-hidden="true">
  <defs>
    <pattern id="${id}" width="${tileW}" height="${tileH}"
             patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">
      <text x="0" y="${fontSize}" font-family="monospace" font-size="${fontSize}"
            fill="#000000" fill-opacity="0.030" letter-spacing="1">${safe}</text>
      <text x="${Math.round(tileW / 2)}" y="${Math.round(tileH / 2) + fontSize}"
            font-family="monospace" font-size="${fontSize}"
            fill="#ffffff" fill-opacity="0.030" letter-spacing="1">${safe}</text>
    </pattern>
  </defs>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${id})"/>
</g>`

  return source.slice(0, closing) + overlay + source.slice(closing)
}

/**
 * The trace mark drawn with SHAPES ONLY, for compositing onto a raster.
 *
 * Why not reuse traceWatermarkSvg: that one uses <text>, and this overlay is
 * rendered by whatever SVG engine the image pipeline carries. On a serverless
 * Linux host there is frequently no fontconfig and no font file, and a <text>
 * element then draws NOTHING — silently. The stamp would be absent exactly
 * where it is most needed and nobody would find out until a leak could not be
 * traced. Rectangles have no such dependency.
 *
 * The code is encoded as a dot grid: one column per character, five rows per
 * column holding that character's index in TRACE_ALPHABET as five bits, plus a
 * solid marker column so the grid can be located and oriented in a crop. The
 * block is tiled, so cropping to a detail still carries a whole copy.
 *
 * Both a dark and a light pass are drawn at low opacity, half a tile apart, so
 * the mark survives on pale artwork and dark artwork alike.
 */
export function traceDotOverlaySvg(code: string, width: number, height: number): string {
  const chars = code.split('')
  const cols = chars.length + 1
  const rows = 5

  // Sized so one tile is a comfortably small fraction of the card, and so the
  // dots stay at least a pixel on the smallest preview we render.
  const dot = Math.max(1, Math.round(width / 220))
  const gap = dot * 3
  const blockW = cols * gap
  const blockH = rows * gap
  const tileW = Math.max(blockW * 2, Math.round(width / 3))
  const tileH = Math.max(blockH * 2, Math.round(height / 5))

  const dots: string[] = []
  // Marker column: all five rows filled. No character index is 31, so a full
  // column cannot be mistaken for data.
  for (let r = 0; r < rows; r += 1) {
    dots.push(`<rect x="0" y="${r * gap}" width="${dot}" height="${dot}"/>`)
  }
  chars.forEach((char, c) => {
    const index = Math.max(0, TRACE_ALPHABET.indexOf(char))
    for (let r = 0; r < rows; r += 1) {
      if ((index >> r) & 1) {
        dots.push(
          `<rect x="${(c + 1) * gap}" y="${r * gap}" width="${dot}" height="${dot}"/>`,
        )
      }
    }
  })
  const block = dots.join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <pattern id="op-dots" width="${tileW}" height="${tileH}" patternUnits="userSpaceOnUse">
      <g fill="#000000" fill-opacity="0.045">${block}</g>
      <g fill="#ffffff" fill-opacity="0.045" transform="translate(${Math.round(tileW / 2)}, ${Math.round(tileH / 2)})">${block}</g>
    </pattern>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#op-dots)"/>
</svg>`
}

/**
 * True when an SVG already carries a trace stamp.
 *
 * Used to assert the public path never serves an unstamped card, rather than
 * trusting that every call site remembered to stamp.
 */
export function hasTraceWatermark(source: string): boolean {
  return /data-op-trace="/.test(source)
}

/**
 * Reads the code back out of a stamped SVG.
 *
 * The forensic half of the pair: given a leaked file, say who it was rendered
 * for. Only works on the vector; a screenshot needs the levels adjustment.
 */
export function readTraceWatermark(source: string): string | null {
  return source.match(/data-op-trace="([^"]+)"/)?.[1] ?? null
}
