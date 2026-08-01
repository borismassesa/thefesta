import { NextResponse } from 'next/server'
import { buildFontFaceCss, matchCardFonts, type CardFontFace } from '@opusfesta/lib'
import { hasPermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { listCardFonts } from '@/lib/cms/card-font-actions'
import { loadCardArtwork } from '@/lib/cms/card-artwork'

export const dynamic = 'force-dynamic'

const BUCKET = 'card-fonts'

/**
 * Base64 of a font file, cached for the life of the lambda.
 *
 * The same handful of faces serves the whole catalogue, so without this every
 * card view would re-download and re-encode a few hundred KB that never change.
 */
const encoded = new Map<string, string>()

/**
 * The @font-face block for one card's typefaces.
 *
 * Served SEPARATELY from the artwork on purpose. The editor fetches the artwork
 * once and re-runs renderCardSvg on every keystroke; folding ~400 KB of base64
 * into that string would mean slicing and re-blobbing it each time. It also
 * means the same four fonts are fetched once per session rather than once per
 * card, because this response is cacheable while a personalised card is not.
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
    .select('product_id')
    .eq('id', designId)
    .maybeSingle<{ product_id: string }>()
  if (!design) return new NextResponse('', { headers: cssHeaders() })

  const { data: product } = await supabase
    .from('website_invitations_products')
    .select('artwork_svg_url')
    .eq('id', design.product_id)
    .maybeSingle<{ artwork_svg_url: string | null }>()

  const artwork = await loadCardArtwork(product?.artwork_svg_url ?? '')
  if (!artwork.ok || artwork.requiredFonts.length === 0) {
    return new NextResponse('', { headers: cssHeaders() })
  }

  const library = await listCardFonts()
  const faces: CardFontFace[] = library.fonts.map((font) => ({
    id: font.id,
    familyName: font.family_name,
    subfamilyName: font.subfamily_name,
    postscriptName: font.postscript_name,
    weightClass: font.weight_class,
    isItalic: font.is_italic,
    matchKeys: font.match_keys,
    embeddable: font.embeddable,
    restricted: font.fs_type_no_embedding,
  }))
  const byId = new Map(library.fonts.map((font) => [font.id, font]))

  const matches = matchCardFonts(artwork.requiredFonts, faces)
  const embeddable = []

  for (const match of matches) {
    // The licence gate is a generated column, so a font that is not cleared
    // simply never reaches this list. There is no second check to forget.
    if (!match.face?.embeddable) continue
    const row = byId.get(match.face.id)
    if (!row) continue

    let base64 = encoded.get(row.id)
    if (base64 === undefined) {
      const { data: blob } = await supabase.storage.from(BUCKET).download(row.storage_path)
      if (!blob) continue
      base64 = Buffer.from(await blob.arrayBuffer()).toString('base64')
      encoded.set(row.id, base64)
    }

    embeddable.push({
      // Keyed on the name the ARTWORK asks for, not the font's own family, so
      // CSS resolves it on the first entry of the font-family list.
      familyName: match.required.primary,
      italic: match.required.italic,
      format: row.format,
      base64,
    })
  }

  return new NextResponse(buildFontFaceCss(embeddable), { headers: cssHeaders() })
}

function cssHeaders() {
  return {
    'Content-Type': 'text/plain; charset=utf-8',
    // Licensed binaries: cacheable by the browser, never by a shared proxy.
    'Cache-Control': 'private, max-age=86400',
  }
}
