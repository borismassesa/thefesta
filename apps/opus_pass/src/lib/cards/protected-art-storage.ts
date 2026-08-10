import 'server-only'
import { traceWatermarkSvg } from '@opusfesta/lib'
import { createSupabaseServerClient } from '@/lib/supabase'
import { parseStorageUrl } from './protected-art'

// The storage half of card-artwork protection.
//
// Split from protected-art.ts so the signing and parsing logic stays pure and
// unit-testable: this file pulls in the service-role Supabase client, which is
// `server-only` and cannot be imported from a test or a client component.

export type ArtworkFetch =
  | { ok: true; body: Uint8Array; contentType: string }
  | { ok: false; reason: 'not_storage' | 'missing' }

/**
 * Reads one artwork object with the service role.
 *
 * Service role rather than a signed URL: a signed URL is itself a shareable
 * credential, and handing one to the browser would reintroduce exactly the leak
 * this module set closes. The bytes go out through our own route or not at all.
 *
 * SVG is re-stamped on the way through. Rasters pass through unchanged —
 * stamping them needs an image-processing dependency this app does not carry
 * (`sharp` is not a declared dependency of opus_pass, and adding a native one
 * risks the Linux-binary stripping that has broken Vercel builds here before).
 * Shipping a half-applied mark would be worse than an honest gap, because it
 * would read as covered when it is not. The vector is the valuable artefact and
 * it IS covered.
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
    return {
      ok: true,
      body: new Uint8Array(await data.arrayBuffer()),
      contentType: data.type || 'application/octet-stream',
    }
  }

  const stamped = traceWatermarkSvg(await data.text(), traceWith)
  return {
    ok: true,
    body: new TextEncoder().encode(stamped),
    contentType: 'image/svg+xml',
  }
}
