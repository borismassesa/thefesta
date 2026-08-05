import { NextResponse } from 'next/server'

import { cardFontFaceCss, loadArtworkSvg } from '@/lib/dashboard/card-artwork'
import { readCardArtworkSource, resolveCardArtworkUrl } from '@/lib/dashboard/card-details'

export const dynamic = 'force-dynamic'

/** Licensed binaries: cacheable by the browser, never by a shared proxy. */
const HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'private, max-age=86400',
}

/**
 * The `@font-face` block for one card's typefaces.
 *
 * Separate from the artwork because the preview re-renders on every keystroke
 * and this payload never changes: it is concatenated once, at the point the
 * preview Blob is built, rather than being re-sliced out of a 2 MB string.
 *
 * Answers with an empty stylesheet rather than an error for every "no fonts to
 * send" case. A card previewed in a fallback face is worse than a correct one
 * and far better than a preview that refuses to appear.
 */
export async function GET(request: Request) {
  const source = readCardArtworkSource(new URL(request.url).searchParams)
  if (!source) return new NextResponse('', { headers: HEADERS })

  const artworkUrl = await resolveCardArtworkUrl(source)
  if (!artworkUrl) return new NextResponse('', { headers: HEADERS })

  const artwork = await loadArtworkSvg(artworkUrl, request.url)
  if (!artwork.ok) return new NextResponse('', { headers: HEADERS })

  return new NextResponse(await cardFontFaceCss(artwork.svg), { headers: HEADERS })
}
