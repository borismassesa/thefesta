import { createSupabaseAdminClient } from '@/lib/supabase'
import ProductCategoriesClient from './ProductCategoriesClient'

export const dynamic = 'force-dynamic'

export type ProductCategoryRow = {
  slug: string
  label: string
  icon: string
  sort_order: number
  active: boolean
}

export default async function ProductCategoriesPage() {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from('product_categories')
    .select('slug, label, icon, sort_order, active')
    .order('sort_order', { ascending: true })
    .returns<ProductCategoryRow[]>()

  if (error) {
    throw new Error(`[admin] product_categories query failed: ${error.code} ${error.message}`)
  }

  return <ProductCategoriesClient categories={data ?? []} />
}
