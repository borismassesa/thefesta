// Server-only by construction rather than by marker.
//
// `node:crypto` and `node:fs/promises` cannot be bundled into a client
// component, so importing this from one is a build error already. The
// `server-only` marker is deliberately NOT used: it throws on import outside a
// Next server context, which would make the golden pixel coverage below
// impossible to run, and this is the one module in the pipeline whose output
// nothing else can verify. A guard that costs the only test that can catch a
// wrong-font card is the wrong trade.

import { createHash } from 'node:crypto'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import {
  RASTER_LIMITS,
  looksBlank,
  type PinnableFace,
  type RasterResult,
} from '@opusfesta/lib'

// The ONLY place a card becomes a PNG.
//
// Narrow on purpose. Callers hand over an SVG, the font faces it was pinned to,
// and a width; they cannot reach the rasteriser's configuration. That is not
// tidiness, it is the lesson from the spike: `font: { fontBuffers: … }` where the
// real key is `fontFiles` makes the whole options object fail to deserialize and
// silently reverts to system fonts, so the card renders in the wrong typeface
// with no error anywhere. An options object that exists in one typed function
// cannot be mistyped at a call site, because call sites do not build one.
//
// Everything here returns a RasterResult. Nothing throws, because the caller is
// a preparation job deciding whether a guest's card may be sent.

/** Built once per process. Callers never see it. */
function rasterOptions(fontBuffers: Uint8Array[], widthPx: number) {
  return {
    // Never true. System fonts are what a wrong-font render falls back to, so
    // leaving them available turns a hard failure into a silent one.
    fitTo: { mode: 'width', value: widthPx } as const,
    font: {
      fontBuffers,
      loadSystemFonts: false,
      // No default family either: with nothing to fall back to, an unpinned
      // element draws nothing and the blank check catches it.
      defaultFontFamily: '',
    },
    // WhatsApp composites the header on white; a transparent PNG would show
    // whatever the client puts behind it.
    background: '#ffffff',
  }
}

/**
 * initWasm is process-wide and must run exactly once.
 *
 * Memoised as the PROMISE, not the result, so concurrent guest renders on a cold
 * lambda cannot race into two initialisations. A rejection is not cached: a
 * transient failure would otherwise poison every render for the life of the
 * container, which is the same trap the entrance-pass asset cache documents.
 */
let wasmReady: Promise<void> | null = null

function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = (async () => {
      const { readFile } = await import('node:fs/promises')
      const path = require.resolve('@resvg/resvg-wasm/index_bg.wasm')
      await initWasm(await readFile(path))
    })().catch((err) => {
      wasmReady = null
      throw err
    })
  }
  return wasmReady
}

export type RasterFont = { face: PinnableFace; bytes: Uint8Array }

export type RasterRequest = {
  /** The frozen release with this guest's name already substituted and pinned. */
  svg: string
  /** Every face the pinned SVG names. Empty is only valid for text-free artwork. */
  fonts: RasterFont[]
  /** Output width in pixels. Clamped to the contract's ceiling. */
  widthPx: number
}

const HAS_TEXT = /<text\b/i
const FAMILY_ATTR_GLOBAL = /font-family\s*=\s*"([^"]*)"/gi

/**
 * Families named in the markup that no supplied face answers.
 *
 * After pinning, every font-family holds exactly one canonical family, so
 * anything else means the element was never pinned. Compared case-insensitively
 * because a family name is not case sensitive in CSS, but otherwise exactly: a
 * near-miss is still a different typeface.
 */
function unpinnedFamilies(svg: string, fonts: RasterFont[]): string[] {
  const supplied = new Set(fonts.map((f) => f.face.canonicalFamily.trim().toLowerCase()))
  const missing = new Set<string>()
  for (const match of svg.matchAll(FAMILY_ATTR_GLOBAL)) {
    const declared = (match[1] ?? '').split(',')[0]?.trim().replace(/^['"]|['"]$/g, '') ?? ''
    if (!declared) continue
    if (!supplied.has(declared.toLowerCase())) missing.add(declared)
  }
  return [...missing]
}

/**
 * Rasterise one guest's card.
 *
 * Order of the guards matters: the cheap refusals happen before wasm is touched,
 * so a card that can never render does not pay for an initialisation first.
 */
export async function rasteriseCard(request: RasterRequest): Promise<RasterResult> {
  const { svg, fonts, widthPx } = request

  if (!svg.trim()) return { ok: false, code: 'SVG_INVALID', detail: ['empty svg'] }

  const svgBytes = Buffer.byteLength(svg, 'utf8')
  if (svgBytes > RASTER_LIMITS.maxSvgBytes) {
    return {
      ok: false,
      code: 'OUTPUT_LIMIT_EXCEEDED',
      detail: [`svg is ${svgBytes} bytes, ceiling is ${RASTER_LIMITS.maxSvgBytes}`],
    }
  }

  // Text with no fonts supplied is the vanishing-text failure. Refuse it here
  // rather than rendering a card with no names on it.
  if (HAS_TEXT.test(svg) && fonts.length === 0) {
    return { ok: false, code: 'FONT_UNRESOLVED', detail: ['artwork has text but no fonts supplied'] }
  }

  // Every font-family left in the markup must name a face we are supplying.
  //
  // Measured: an unresolvable family does NOT render blank when any font is
  // loaded. resvg falls back to a supplied face, and with a single-font card the
  // output is byte-identical to a correctly pinned one. `defaultFontFamily: ''`
  // does not prevent it. So the blank check cannot see this, and on a card with
  // several faces it is precisely the silent wrong-typeface failure.
  //
  // Checking it here rather than trusting the caller to have pinned first is the
  // difference between an invariant and a convention.
  const unpinned = unpinnedFamilies(svg, fonts)
  if (unpinned.length > 0) {
    return { ok: false, code: 'FONT_UNRESOLVED', detail: unpinned }
  }

  const width = Math.max(1, Math.min(Math.round(widthPx), RASTER_LIMITS.maxWidth))

  try {
    await ensureWasm()
  } catch (err) {
    return {
      ok: false,
      code: 'WASM_INITIALIZATION_FAILED',
      detail: [String(err instanceof Error ? err.message : err)],
    }
  }

  let png: Uint8Array
  let renderedWidth: number
  let renderedHeight: number
  try {
    const resvg = new Resvg(svg, rasterOptions(fonts.map((f) => f.bytes), width))
    const image = resvg.render()
    renderedWidth = image.width
    renderedHeight = image.height
    png = image.asPng()
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err)
    // usvg reports a parse failure by message; anything else is the renderer.
    const parseFailure = /parse|xml|invalid|unexpected/i.test(message)
    return { ok: false, code: parseFailure ? 'SVG_INVALID' : 'RASTER_FAILED', detail: [message] }
  }

  if (renderedWidth * renderedHeight > RASTER_LIMITS.maxPixels) {
    return {
      ok: false,
      code: 'OUTPUT_LIMIT_EXCEEDED',
      detail: [`${renderedWidth}x${renderedHeight} exceeds the pixel ceiling`],
    }
  }
  if (png.length > RASTER_LIMITS.maxOutputBytes) {
    return {
      ok: false,
      code: 'OUTPUT_LIMIT_EXCEEDED',
      detail: [`png is ${png.length} bytes, ceiling is ${RASTER_LIMITS.maxOutputBytes}`],
    }
  }
  // Catches "nothing drew", which is what an unpinned or unsupported face looks
  // like. It says nothing about the card being in the RIGHT font: that is what
  // the font preflight and the golden tests are for.
  if (looksBlank(png)) {
    return { ok: false, code: 'OUTPUT_BLANK', detail: ['render produced no visible ink'] }
  }

  return {
    ok: true,
    png,
    width: renderedWidth,
    height: renderedHeight,
    sha256: createHash('sha256').update(png).digest('hex'),
  }
}

/**
 * How many guest renders may run at once.
 *
 * Deliberately small. A 200-guest send mapped through Promise.all would hold two
 * hundred PNGs and a 2 MB SVG in one lambda; this keeps the ceiling flat and
 * predictable at the cost of wall-clock we can afford in a prepare step.
 */
export const RASTER_CONCURRENCY = 3

/**
 * Run a bounded number of renders at a time, preserving input order.
 *
 * Not Promise.all with a chunk loop: chunking waits for the slowest item in each
 * chunk before starting the next, so one slow card stalls two others for no
 * reason. This keeps `RASTER_CONCURRENCY` in flight continuously.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const index = next++
      if (index >= items.length) return
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}
