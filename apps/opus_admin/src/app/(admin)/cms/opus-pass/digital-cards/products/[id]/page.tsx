import { notFound } from 'next/navigation'
import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  emptyDigitalCardProduct,
  type DigitalCardProductRecord,
} from '@/lib/cms/opus-pass-digital-cards-products'
import ProductEditor from './ProductEditor'

export const dynamic = 'force-dynamic'

export default async function DigitalCardProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  if (id === 'new') {
    return <ProductEditor initial={emptyDigitalCardProduct()} isNew />
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('website_invitations_products')
    .select('*')
    .eq('id', id)
    .maybeSingle<DigitalCardProductRecord>()

  if (error) throw error
  if (!data) notFound()

  return <ProductEditor initial={data} isNew={false} />
}
