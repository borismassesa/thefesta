import { NextResponse } from 'next/server'
import { getReleasedCardFile } from '@/lib/dashboard/released-cards'

// Serving a couple their own finished card.
//
// A route handler rather than a signed Storage URL, for two reasons: ownership
// is re-checked on every request instead of being frozen into a link that keeps
// working after it is forwarded, and the bucket stays private with no public
// path at all. Same shape as how card-fonts bytes are proxied in the admin.
//
// GET  renders it inline (the dashboard preview).
// POST returns it as an attachment, because the download path a phone actually
//      takes is a form POST into a hidden iframe. See lib/invoice.ts for why:
//      the WhatsApp and Instagram WebViews most couples open OpusPass in ignore
//      Blob-URL anchors entirely, so `<a download>` silently does nothing.

export const dynamic = 'force-dynamic'

function filenameFor(cardName: string, orderRef: string): string {
  const safe = `${cardName}-${orderRef}`.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return `OpusFesta-${safe || 'card'}.svg`
}

async function serve(
  designId: string,
  disposition: 'inline' | 'attachment',
  releaseId?: string | null,
): Promise<NextResponse> {
  const file = await getReleasedCardFile(designId, releaseId)
  // One response for "not yours" and "does not exist": distinguishing them
  // would confirm to a stranger that a given design id is real.
  if (!file) return new NextResponse('Not found', { status: 404 })

  const headers: Record<string, string> = {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    // The couple's names and venue are in this file.
    'Cache-Control': 'private, no-store',
  }
  if (disposition === 'attachment') {
    headers['Content-Disposition'] =
      `attachment; filename="${filenameFor(file.cardName, file.orderRef)}"`
  }
  return new NextResponse(file.svg, { headers })
}

// `?release=<id>` asks for one specific version instead of the current one, so
// the version list on the card's page can be looked through. The id is checked
// against this design before anything is served; without the param the response
// is byte-identical to what it always was.
function releaseParam(request: Request): string | null {
  return new URL(request.url).searchParams.get('release')
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ designId: string }> },
) {
  const { designId } = await params
  return serve(designId, 'inline', releaseParam(request))
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ designId: string }> },
) {
  const { designId } = await params
  return serve(designId, 'attachment', releaseParam(request))
}
