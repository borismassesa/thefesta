import { notFound, redirect } from 'next/navigation'
import { matchCardFonts, type CardFieldBinding, type CardFontFace } from '@opusfesta/lib'
import { getAdminAccessRole, hasPermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { listCardFonts } from '@/lib/cms/card-font-actions'
import { loadCardArtwork } from '@/lib/cms/card-artwork'
import LayerMapper from './LayerMapper'
import CardSectionTabs from '../CardSectionTabs'

export const dynamic = 'force-dynamic'

type CardRow = {
  id: string
  name: string
  category: string
  artwork_svg_url: string | null
  field_bindings: CardFieldBinding[] | null
}

/**
 * Everything about a card's artwork: its layers, its fields and its typefaces.
 *
 * Lives under the card rather than under a separate "Templates" tab. Both tabs
 * listed the same table, so a card had two detail pages and setting one up
 * meant hopping between them, with "back" landing on a list instead of the card
 * being worked on.
 */
export default async function CardArtworkPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  if (!(await hasPermission('cms.read'))) redirect('/')
  const { id } = await params
  // There is no artwork to map until the card exists.
  if (id === 'new') redirect('/opus-pass/digital-cards/cards/new')

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('website_invitations_products')
    .select('id, name, category, artwork_svg_url, field_bindings')
    .eq('id', id)
    .maybeSingle<CardRow>()
  if (error) throw error
  if (!data) notFound()

  // Scanned on every visit rather than cached on the row: the artwork can be
  // re-uploaded at any time, and a stale layer list would have an admin mapping
  // fields that no longer exist.
  const artwork = await loadCardArtwork(data.artwork_svg_url ?? '')

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
  const fontMatches = artwork.ok ? matchCardFonts(artwork.requiredFonts, faces) : []

  const role = await getAdminAccessRole()

  return (
    <>
      <CardSectionTabs productId={data.id} />
      <LayerMapper
        productId={data.id}
        productName={data.name}
        category={data.category}
        artworkUrl={data.artwork_svg_url ?? ''}
        saved={data.field_bindings ?? []}
        artwork={artwork}
        fontMatches={fontMatches}
        fontSetupError={library.setupError}
        canAttestLicence={role === 'owner' || role === 'admin'}
      />
    </>
  )
}
