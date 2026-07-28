import { createSupabaseAdminClient } from '@/lib/supabase'
import CategoriesClient from './CategoriesClient'

export const dynamic = 'force-dynamic'

export type CategoryRow = {
  slug: string
  label: string
  profile_label: string
  db_value: string
  icon: string
  sort_order: number
  active: boolean
  sells_products: boolean
  created_at: string
  updated_at: string
}

export default async function CategoriesPage() {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from('vendor_categories')
    .select('slug, label, profile_label, db_value, icon, sort_order, active, sells_products, created_at, updated_at')
    .order('sort_order', { ascending: true })
    .returns<CategoryRow[]>()

  if (error) {
    throw new Error(`[admin] vendor_categories query failed: ${error.code} ${error.message}`)
  }

  return <CategoriesClient categories={data ?? []} />
}
