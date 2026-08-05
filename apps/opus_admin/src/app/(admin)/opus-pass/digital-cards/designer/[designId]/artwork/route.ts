import { NextResponse } from 'next/server'
import { hasPermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { loadCardArtwork } from '@/lib/cms/card-artwork'

export const dynamic = 'force-dynamic'

/**
 * The card's UNPERSONALISED artwork.
 *
 * The editor fetches this once and then re-renders in the browser on every
 * keystroke, so a designer sees their typing on the card immediately instead of
 * waiting for a save round-trip. Serving the raw file (rather than a rendered
 * one per keystroke) keeps a 2 MB download to a single request.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ designId: string }> },
) {
  if (!(await hasPermission('digitalcards.read'))) {
    return new NextResponse('Forbidden', { status: 403 })
  }
  const { designId } = await params

  const supabase = createSupabaseAdminClient()
  const { data: design } = await supabase
    .from('invitation_card_designs')
    .select('product_id')
    .eq('id', designId)
    .maybeSingle<{ product_id: string }>()
  if (!design) return new NextResponse('Not found', { status: 404 })

  const { data: product } = await supabase
    .from('website_invitations_products')
    .select('artwork_svg_url')
    .eq('id', design.product_id)
    .maybeSingle<{ artwork_svg_url: string | null }>()

  const artwork = await loadCardArtwork(product?.artwork_svg_url ?? '')
  if (!artwork.ok) return new NextResponse(artwork.reason, { status: 422 })

  return new NextResponse(artwork.svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      // The artwork itself carries no customer data, and only changes when an
      // admin re-uploads it, so it can be held for the duration of a session.
      'Cache-Control': 'private, max-age=300',
    },
  })
}
