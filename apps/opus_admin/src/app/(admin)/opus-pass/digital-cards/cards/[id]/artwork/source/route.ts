import { NextResponse } from 'next/server'
import { hasPermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { loadCardArtwork } from '@/lib/cms/card-artwork'

export const dynamic = 'force-dynamic'

/**
 * The card's UNPERSONALISED artwork, for the mapping preview.
 *
 * The mapper fetches this once and re-renders in the browser as roles are
 * assigned, so an admin sees whether they picked the right layer without a save
 * round-trip. Serving the raw file rather than a rendered one per change keeps
 * a 2 MB download to a single request.
 *
 * Carries no customer data of any kind: it is the designer's file exactly as
 * uploaded, before any couple's answers exist.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasPermission('cms.read'))) {
    return new NextResponse('Forbidden', { status: 403 })
  }
  const { id } = await params

  const supabase = createSupabaseAdminClient()
  const { data: product } = await supabase
    .from('website_invitations_products')
    .select('artwork_svg_url')
    .eq('id', id)
    .maybeSingle<{ artwork_svg_url: string | null }>()
  if (!product) return new NextResponse('Not found', { status: 404 })

  const artwork = await loadCardArtwork(product.artwork_svg_url ?? '')
  if (!artwork.ok) return new NextResponse(artwork.reason, { status: 422 })

  return new NextResponse(artwork.svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      // The artwork itself carries no customer data, and only changes when an
      // admin re-uploads it, so it can be held for the duration of a session.
      // `private` keeps it out of any shared proxy.
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      /**
       * This body is a file someone uploaded, served from the admin origin.
       *
       * The mapper itself is safe either way: it fetches this as TEXT and shows
       * the result through an <img> on a blob URL, and an <img> never runs
       * script. The hole is an admin opening this URL directly, where an SVG
       * carrying <script> would execute against admin.opusfesta.com. `sandbox`
       * drops the response into an opaque origin with scripting off, which
       * costs the <img> path nothing.
       */
      'Content-Security-Policy': 'sandbox',
      'Content-Disposition': 'inline',
    },
  })
}
