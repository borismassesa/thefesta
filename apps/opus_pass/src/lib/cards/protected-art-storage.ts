import 'server-only'
import { traceWatermarkSvg } from '@opusfesta/lib'
import { createSupabaseServerClient } from '@/lib/supabase'
import { parseStorageUrl } from './protected-art'
import { renderPreviewRaster } from './preview-raster'

// The storage half of card-artwork protection.
//
// Split from protected-art.ts so the signing and parsing logic stays pure and
// unit-testable: this file pulls in the service-role Supabase client, which is
// `server-only` and cannot be imported from a test or a client component.

export type ArtworkFetch =
  | {
      ok: true
      body: Uint8Array
      contentType: string
      /** False when the original was served as-is. See PreviewResult.reason. */
      protectedOutput: boolean
    }
  | { ok: false; reason: 'not_storage' | 'missing' }

/**
 * Reads one artwork object with the service role.
 *
 * Service role rather than a signed URL: a signed URL is itself a shareable
 * credential, and handing one to the browser would reintroduce exactly the leak
 * this module set closes. The bytes go out through our own route or not at all.
 *
 * Two shapes come out of it:
 *
 *   SVG    — stamped with the trace code and served as a vector. NOT rasterised:
 *            doing that correctly needs the artwork's fonts pinned through the
 *            card font library, and an unpinned face renders BLANK rather than
 *            wrong, so a card would silently lose its typography. That is the
 *            guest-card pipeline's job, not this route's.
 *   raster — downscaled to preview width and stamped (see preview-raster.ts).
 *            This is the path every live catalogue product actually takes.
 *
 * `protectedOutput` reports which happened, so a caller can tell "protected" from
 * "served the original because something was unavailable" instead of assuming.
 */
export async function fetchProtectedArtwork(
  sourceUrl: string,
  traceWith: string,
): Promise<ArtworkFetch> {
  const location = parseStorageUrl(sourceUrl)
  if (!location) return { ok: false, reason: 'not_storage' }

  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase.storage
    .from(location.bucket)
    .download(location.path)

  if (error || !data) return { ok: false, reason: 'missing' }

  const isSvg =
    location.path.toLowerCase().endsWith('.svg') || data.type === 'image/svg+xml'

  if (!isSvg) {
    const preview = await renderPreviewRaster(
      new Uint8Array(await data.arrayBuffer()),
      data.type || 'application/octet-stream',
      traceWith,
    )
    return {
      ok: true,
      body: preview.body,
      contentType: preview.contentType,
      protectedOutput: preview.protected,
    }
  }

  const stamped = traceWatermarkSvg(await data.text(), traceWith)
  return {
    ok: true,
    body: new TextEncoder().encode(stamped),
    contentType: 'image/svg+xml',
    protectedOutput: true,
  }
}
