import { NextResponse } from 'next/server'
import { hasPermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { cardFontFaceCss, fontCssHeaders } from '@/lib/cms/card-font-css'

export const dynamic = 'force-dynamic'

/**
 * The @font-face block for this card's typefaces.
 *
 * Without it the mapping preview renders in a fallback serif, which is exactly
 * the failure the Typefaces panel above exists to warn about, so an admin
 * checking their bindings would be looking at the wrong card.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasPermission('digitalcards.read'))) {
    return new NextResponse('Forbidden', { status: 403 })
  }
  const { id } = await params

  const supabase = createSupabaseAdminClient()
  const { data: product } = await supabase
    .from('website_invitations_products')
    .select('artwork_svg_url')
    .eq('id', id)
    .maybeSingle<{ artwork_svg_url: string | null }>()

  const css = product ? await cardFontFaceCss(product.artwork_svg_url ?? '') : ''
  return new NextResponse(css, { headers: fontCssHeaders() })
}
