import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import {
  ARTWORK_TOKEN_TTL_SECONDS,
  artworkTraceCode,
  parseSlot,
  verifyArtworkToken,
  type ArtworkSlot,
} from '@/lib/cards/protected-art'
import { fetchProtectedArtwork } from '@/lib/cards/protected-art-storage'
import { artworkAudience } from '@/lib/cards/artwork-audience'

// The only route by which catalogue card artwork reaches a browser.
//
// It replaces a public Supabase storage URL that anyone could fetch, cache,
// enumerate, or hand to a competitor. See lib/cards/protected-art.ts for why
// that mattered more than any right-click blocking.
//
// Every rejection answers with the same bodyless 404 — unknown product,
// unpublished product, missing token, expired token, forged token, absent
// object. The population of product ids is small and guessable, so a
// distinguishable response would let someone map which designs exist and which
// tokens are live, which is most of what a scraper wants to know.
//
// Modelled on /invite-card/[token], which already establishes this shape in the
// codebase: service-role read of a private object, streamed through a route that
// re-authorises per request, never a signed storage URL.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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

type ProductImages = {
  image_url: string | null
  designs: string[] | null
  gallery: string[] | null
}

/**
 * Maps a slot onto the row's stored URL, refusing an out-of-range index.
 *
 * Bounds-checked rather than trusting the caller's arithmetic: the index arrives
 * from a query string, and `designs[99]` returning undefined would otherwise
 * reach the storage read as the string "undefined".
 */
function resolveSlot(row: ProductImages, slot: ArtworkSlot): string | null {
  if (slot === 'hero') return row.image_url || null

  const list = slot.startsWith('d') ? row.designs : row.gallery
  const index = Number(slot.slice(1))
  if (!Array.isArray(list) || !Number.isInteger(index)) return null
  return list[index] || null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params
  const query = new URL(request.url).searchParams
  const token = query.get('t')
  if (!productId || !token) return notFound()

  const slot = parseSlot(query.get('s'))
  if (!slot) return notFound()

  const check = verifyArtworkToken(productId, token)
  if (!check.ok) return notFound()

  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('website_invitations_products')
    .select('image_url, designs, gallery, published')
    .eq('id', productId)
    .maybeSingle()

  // `published` is re-checked HERE rather than trusted from the page that minted
  // the token. Unpublishing a design has to take it out of reach immediately;
  // without this, every token minted while it was live keeps working for the
  // rest of its window.
  if (error || !data?.published) return notFound()

  const source = resolveSlot(data, slot)
  if (!source) return notFound()

  // The viewer is read from THIS request's own cookies and session, not from
  // the URL. That is what lets the URL be identical for everybody (and so
  // cacheable) while the stamp burned into the artwork stays per-viewer: a URL
  // is copyable and editable, a cookie on our own origin is neither.
  const artwork = await fetchProtectedArtwork(
    source,
    artworkTraceCode(productId, await artworkAudience()),
  )
  if (!artwork.ok) return notFound()

  return new NextResponse(Buffer.from(artwork.body), {
    headers: {
      'Content-Type': artwork.contentType,
      // Never `attachment`: the browser's own download shortcut is one of the
      // routes being closed, and a Content-Disposition naming a file invites it.
      'Content-Disposition': 'inline',
      'Content-Length': String(artwork.body.byteLength),
      // PRIVATE, not public. A shared CDN cache keyed on the URL would serve one
      // viewer's trace-stamped copy to the next viewer, which does not leak the
      // artwork but does frame the wrong person for a leak.
      'Cache-Control': `private, max-age=${ARTWORK_TOKEN_TTL_SECONDS}, must-revalidate`,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      // Stops another origin embedding these bytes directly. Hotlinking a
      // catalogue of wedding designs onto a competitor's site is a real and
      // cheap attack, and this is the one header that refuses it outright.
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  })
}
