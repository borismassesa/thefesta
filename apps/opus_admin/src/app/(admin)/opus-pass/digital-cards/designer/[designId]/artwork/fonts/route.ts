import { NextResponse } from 'next/server'
import { hasPermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { cardFontFaceCss, fontCssHeaders } from '@/lib/cms/card-font-css'

export const dynamic = 'force-dynamic'

/**
 * The @font-face block for one design job's typefaces.
 *
 * Served SEPARATELY from the artwork on purpose. The editor fetches the artwork
 * once and re-runs renderCardSvg on every keystroke; folding ~400 KB of base64
 * into that string would mean slicing and re-blobbing it each time. It also
 * means the same four fonts are fetched once per session rather than once per
 * card, because this response is cacheable while a personalised card is not.
 *
 * The job's own route rather than the card's: a designer opens a card BY job,
 * and resolving the product here keeps the editor from needing to know which
 * product id sits behind the job it was handed.
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
  // Empty stylesheet, not an error: a preview in a fallback face is worse than
  // a correct one but far better than one that refuses to appear.
  if (!design) return new NextResponse('', { headers: fontCssHeaders() })

  const { data: product } = await supabase
    .from('website_invitations_products')
    .select('artwork_svg_url')
    .eq('id', design.product_id)
    .maybeSingle<{ artwork_svg_url: string | null }>()

  const css = product ? await cardFontFaceCss(product.artwork_svg_url ?? '') : ''
  return new NextResponse(css, { headers: fontCssHeaders() })
}
