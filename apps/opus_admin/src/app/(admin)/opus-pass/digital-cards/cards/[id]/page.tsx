import { notFound, redirect } from 'next/navigation'
import { hasPermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  emptyDigitalCardProduct,
  normalizeDigitalCardProduct,
  type DigitalCardProductRecord,
} from '@/lib/cms/opus-pass-digital-cards-products'
import { getJobsForProduct } from '../../designer/queries'
import CardProductionPanel from './CardProductionPanel'
import CardSectionTabs from './CardSectionTabs'
import ProductEditor from './ProductEditor'

export const dynamic = 'force-dynamic'

export default async function DigitalCardProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  if (!(await hasPermission('digitalcards.read'))) redirect('/')

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

  const jobs = await getJobsForProduct(id)

  return (
    <>
      <CardSectionTabs productId={id} />
      <ProductEditor
        initial={normalizeDigitalCardProduct(data)}
        isNew={false}
        productionPanel={<CardProductionPanel jobs={jobs} />}
      />
    </>
  )
}
