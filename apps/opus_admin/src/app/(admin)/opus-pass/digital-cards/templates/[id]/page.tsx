import { notFound, redirect } from 'next/navigation'
import { hasPermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import type { CardFieldBinding } from '@/lib/cms/card-field-roles'
import { loadCardArtwork } from '../artwork'
import LayerMapper from './LayerMapper'

export const dynamic = 'force-dynamic'

type CardRow = {
  id: string
  name: string
  category: string
  image_url: string | null
  field_bindings: CardFieldBinding[] | null
}

export default async function CardDesignerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  if (!(await hasPermission('cms.read'))) redirect('/')
  const { id } = await params

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('website_invitations_products')
    .select('id, name, category, image_url, field_bindings')
    .eq('id', id)
    .maybeSingle<CardRow>()
  if (error) throw error
  if (!data) notFound()

  // Scanning happens on every visit rather than being cached on the row: the
  // artwork can be re-uploaded at any time, and a stale layer list would have
  // the admin mapping fields that no longer exist.
  const artwork = await loadCardArtwork(data.image_url ?? '')

  return (
    <LayerMapper
      productId={data.id}
      productName={data.name}
      category={data.category}
      imageUrl={data.image_url ?? ''}
      saved={data.field_bindings ?? []}
      artwork={artwork}
    />
  )
}
