import { NextResponse } from 'next/server'

import { loadArtworkSvg } from '@/lib/dashboard/card-artwork'
import { readCardArtworkSource, resolveCardArtworkUrl } from '@/lib/dashboard/card-details'

export const dynamic = 'force-dynamic'

/**
 * One card's UNPERSONALISED artwork, for the details form's live preview.
 *
 * The form fetches this once (~2 MB) and then re-renders in the browser on
 * every keystroke, so a couple watches their names appear on the card instead
 * of waiting for a save round-trip. Serving the raw file rather than a rendered
 * one per keystroke keeps that to a single download.
 *
 * Carries no customer content — it is the catalogue's own file, identical for
 * everyone who bought that card — which is why it can be cached at all.
 */
export async function GET(request: Request) {
  const source = readCardArtworkSource(new URL(request.url).searchParams)
  if (!source) return new NextResponse('Bad request', { status: 400 })

  const artworkUrl = await resolveCardArtworkUrl(source)
  // 404 for "not yours", "no such card" and "no artwork attached" alike: a
  // preview is a convenience, and none of those deserve a distinct answer.
  if (!artworkUrl) return new NextResponse('Not found', { status: 404 })

  const artwork = await loadArtworkSvg(artworkUrl, request.url)
  if (!artwork.ok) return new NextResponse(artwork.reason, { status: 422 })

  return new NextResponse(artwork.svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      // Only changes when an admin re-uploads the card, so it can be held for
      // the length of a sitting. Private because reaching it needed an
      // ownership check that a shared proxy would skip.
      'Cache-Control': 'private, max-age=300',
    },
  })
}
