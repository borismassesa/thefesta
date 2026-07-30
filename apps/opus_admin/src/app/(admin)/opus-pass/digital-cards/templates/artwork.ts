import 'server-only'

import { inspectCardArtwork, type CardArtworkInspection } from '@/lib/cms/card-svg-fields'
import { resolveOpusPassAssetUrl } from '@/lib/cms/opus-pass-asset-url'

// Card artwork is large — the reference card is a 2 MB SVG, most of it base64
// bitmaps — so downloading it is a deliberate, on-demand step in the mapper
// rather than something the catalogue list does per row.
const MAX_ARTWORK_BYTES = 12 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15_000

export type ArtworkLoad =
  | ({ ok: true; /** Raw file, needed to render a personalised copy. */ svg: string } & CardArtworkInspection)
  | { ok: false; reason: string }

/**
 * Download a card's front artwork and read its layers.
 *
 * Returns a reason instead of throwing: "this card has no SVG" and "the file
 * didn't load" are both ordinary states the mapper has to explain to an admin,
 * not errors that should blank the page.
 */
export async function loadCardArtwork(imageUrl: string): Promise<ArtworkLoad> {
  const url = imageUrl.trim()
  if (!url) return { ok: false, reason: 'This card has no front artwork attached yet.' }
  if (!/\.svg(\?|#|$)/i.test(url)) {
    return {
      ok: false,
      reason:
        'The front artwork is a flat image (PNG/JPG), not an SVG. Text layers can only be read from SVG artwork.',
    }
  }

  const resolved = resolveOpusPassAssetUrl(url)

  try {
    const response = await fetch(resolved, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // Artwork changes only when an admin re-uploads it, and the mapper is
      // opened rarely, so skip Next's fetch cache to avoid holding megabytes.
      cache: 'no-store',
    })
    if (!response.ok) {
      return { ok: false, reason: `Could not download the artwork (HTTP ${response.status}).` }
    }

    const declared = Number(response.headers.get('content-length') ?? '')
    if (Number.isFinite(declared) && declared > MAX_ARTWORK_BYTES) {
      return { ok: false, reason: `Artwork is ${Math.round(declared / 1e6)} MB — too large to scan.` }
    }

    const svg = await response.text()
    // content-length can be absent or wrong (compression); check the real size.
    if (svg.length > MAX_ARTWORK_BYTES) {
      return { ok: false, reason: `Artwork is ${Math.round(svg.length / 1e6)} MB — too large to scan.` }
    }

    const inspection = inspectCardArtwork(svg)
    if (inspection.textLayers.length === 0 && inspection.rasterLayers.length === 0) {
      return { ok: false, reason: 'No named layers found. The export may have flattened everything.' }
    }
    return { ok: true, svg, ...inspection }
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    return {
      ok: false,
      reason: timedOut
        ? 'Downloading the artwork timed out.'
        : `Could not read the artwork: ${error instanceof Error ? error.message : 'unknown error'}`,
    }
  }
}
