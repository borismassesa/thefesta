import { createSupabaseAdminClient } from '@/lib/supabase'

// Product moderation queue — mirrors the vendor-accounts console but for the
// products table. Service-role reads (admin app trusts requirePermission at
// the action layer, not RLS).

export type ProductModerationStatus = 'draft' | 'pending' | 'approved' | 'rejected'
export type ProductFilter = 'review' | 'approved' | 'rejected' | 'all'

export type ModerationProduct = {
  id: string
  vendorId: string
  vendorName: string
  vendorStatus: string
  name: string
  categorySlug: string | null
  priceTzs: number
  compareAtPriceTzs: number | null
  images: string[]
  stockQuantity: number | null
  madeToOrder: boolean
  status: ProductModerationStatus
  rejectionNote: string | null
  published: boolean
  createdAt: string
  updatedAt: string
}

export type ProductModerationSummary = {
  review: number
  approved: number
  rejected: number
}

type ProductRow = {
  id: string
  vendor_id: string
  name: string
  category_slug: string | null
  price_tzs: number
  compare_at_price_tzs: number | null
  images: string[] | null
  stock_quantity: number | null
  made_to_order: boolean
  status: ProductModerationStatus
  rejection_note: string | null
  published: boolean
  created_at: string
  updated_at: string
  vendors: { business_name: string | null; onboarding_status: string | null } | null
}

const FILTER_STATUSES: Record<ProductFilter, ProductModerationStatus[] | null> = {
  review: ['pending'],
  approved: ['approved'],
  rejected: ['rejected'],
  all: null,
}

export async function getModerationProducts(
  filter: ProductFilter,
  q: string,
): Promise<ModerationProduct[]> {
  const admin = createSupabaseAdminClient()
  let query = admin
    .from('products')
    .select(
      'id, vendor_id, name, category_slug, price_tzs, compare_at_price_tzs, images, stock_quantity, made_to_order, status, rejection_note, published, created_at, updated_at, vendors(business_name, onboarding_status)',
    )
    .order('updated_at', { ascending: false })
    .limit(200)

  const statuses = FILTER_STATUSES[filter]
  if (statuses) query = query.in('status', statuses)
  const term = q.trim().replace(/[%,()]/g, '')
  if (term) query = query.ilike('name', `%${term}%`)

  const { data, error } = await query.returns<ProductRow[]>()
  if (error) {
    console.error('[admin] product moderation query failed', error.code, error.message)
    return []
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    vendorId: r.vendor_id,
    vendorName: r.vendors?.business_name ?? 'Unknown vendor',
    vendorStatus: r.vendors?.onboarding_status ?? 'unknown',
    name: r.name,
    categorySlug: r.category_slug,
    priceTzs: r.price_tzs,
    compareAtPriceTzs: r.compare_at_price_tzs,
    images: r.images ?? [],
    stockQuantity: r.stock_quantity,
    madeToOrder: r.made_to_order,
    status: r.status,
    rejectionNote: r.rejection_note,
    published: r.published,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))
}

export async function getProductModerationSummary(): Promise<ProductModerationSummary> {
  const admin = createSupabaseAdminClient()
  const counts = await Promise.all(
    (['pending', 'approved', 'rejected'] as ProductModerationStatus[]).map((status) =>
      admin
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('status', status)
        .then(({ count }) => count ?? 0),
    ),
  )
  return { review: counts[0], approved: counts[1], rejected: counts[2] }
}
