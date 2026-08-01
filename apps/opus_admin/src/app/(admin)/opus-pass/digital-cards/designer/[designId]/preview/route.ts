import { NextResponse } from 'next/server'
import { hasPermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { renderCardSvg } from '@/lib/cms/card-render'
import type { CardFieldBinding } from '@/lib/cms/card-field-roles'
import { loadCardArtwork } from '@/lib/cms/card-artwork'
import { resolveOpusPassAssetUrl } from '@/lib/cms/opus-pass-asset-url'

export const dynamic = 'force-dynamic'

/**
 * The design job's card, rendered with the values collected so far.
 *
 * Served as an image rather than embedded in the page: the reference artwork is
 * a 2 MB SVG, and inlining that into the editor's HTML on every keystroke-driven
 * re-render would be wasteful. An <img src> lets the browser cache and decode it
 * once.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ designId: string }> },
) {
  if (!(await hasPermission('cms.read'))) {
    return new NextResponse('Forbidden', { status: 403 })
  }
  const { designId } = await params

  const supabase = createSupabaseAdminClient()
  const { data: design } = await supabase
    .from('invitation_card_designs')
    .select('product_id, field_values')
    .eq('id', designId)
    .maybeSingle<{ product_id: string; field_values: Record<string, string> | null }>()
  if (!design) return new NextResponse('Not found', { status: 404 })

  const { data: product } = await supabase
    .from('website_invitations_products')
    .select('artwork_svg_url, field_bindings')
    .eq('id', design.product_id)
    .maybeSingle<{ artwork_svg_url: string | null; field_bindings: CardFieldBinding[] | null }>()

  const artwork = await loadCardArtwork(product?.artwork_svg_url ?? '')
  if (!artwork.ok) {
    // Fall back to the untouched artwork so the designer still sees the card
    // rather than a broken image; the editor already explains why it's stuck.
    const url = product?.artwork_svg_url
    if (url) return NextResponse.redirect(resolveOpusPassAssetUrl(url))
    return new NextResponse('No artwork', { status: 404 })
  }

  const { svg, applied, skipped } = renderCardSvg(
    artwork.svg,
    product?.field_bindings ?? [],
    design.field_values ?? {},
  )

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      // Personalised customer content: never cached by a shared proxy.
      'Cache-Control': 'private, no-store',
      'X-Card-Fields-Applied': String(applied.length),
      'X-Card-Fields-Skipped': String(skipped.length),
    },
  })
}
