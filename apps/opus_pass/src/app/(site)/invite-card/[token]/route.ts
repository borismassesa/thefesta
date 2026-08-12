import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { hashAssetToken, tokenFromSegment } from '@/lib/cards/asset-tokens'
import { downgradeMissingObject, resolveAssetByTokenHash } from '@/lib/cards/verify-asset'

// One guest's card image, fetched without a session.
//
// Meta fetches this URL itself when it sends the template, and the guest's own
// client may fetch it again later, so there is no Clerk session and no cookie to
// authorise against. The token in the path IS the credential.
//
// Everything invalid answers the same way. Unknown token, expired, revoked, not
// ready, object gone, all produce an identical 404 with no body detail. A
// distinguishable response would let a stranger probe which tokens exist and
// which cards are real, and the population is small enough to make that worth
// something.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Cache aggressively, because the artefact is immutable.
 *
 * REVOCATION LAG IS THE PRICE. A revoked or downgraded asset can still be served
 * from a shared cache for up to a day. That is acceptable only while revocation
 * is not promised to be immediate; if it ever is, this drops to no-store and the
 * route authorises every fetch.
 */
const CACHE_CONTROL = 'public, max-age=86400, immutable'

function notFound(): NextResponse {
  return new NextResponse('Not found', {
    status: 404,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  })
}

/**
 * Diagnostics carry identifiers and a code, never content.
 *
 * No guest name, no storage path, no provider message, no token or hash. This
 * line is read by more people and kept longer than the row it describes.
 */
function logAssetEvent(code: string, assetId: string | null, releaseId: string | null): void {
  console.warn(`[invite-card] ${code} asset=${assetId ?? 'none'} release=${releaseId ?? 'none'}`)
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: segment } = await params
  const token = tokenFromSegment(segment ?? '')
  if (!token) return notFound()

  const supabase = createSupabaseServerClient()
  const resolved = await resolveAssetByTokenHash(supabase, hashAssetToken(token))

  if (resolved.presence === 'ready_and_present' && resolved.bytes) {
    const buffer = Buffer.from(await resolved.bytes.arrayBuffer())
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': 'inline',
        'Content-Length': String(buffer.byteLength),
        'Cache-Control': CACHE_CONTROL,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    })
  }

  if (resolved.presence === 'object_missing' && resolved.assetId && resolved.pngStoragePath) {
    // Demote so the next preparation rebuilds it, and so send preflight stops
    // treating this asset as usable. Conditional on the observed path, so a
    // concurrent request cannot demote a repair that already happened.
    const downgraded = await downgradeMissingObject(
      supabase,
      resolved.assetId,
      resolved.pngStoragePath,
    )
    if (downgraded) {
      logAssetEvent('STORAGE_OBJECT_MISSING', resolved.assetId, resolved.designReleaseId)
    }
    return notFound()
  }

  if (resolved.presence === 'storage_unavailable') {
    // NOT a downgrade. A timeout is not evidence the object is gone, and
    // demoting on ambiguous evidence would let a provider blip break a send.
    logAssetEvent('STORAGE_UNAVAILABLE', resolved.assetId, resolved.designReleaseId)
  }

  return notFound()
}
