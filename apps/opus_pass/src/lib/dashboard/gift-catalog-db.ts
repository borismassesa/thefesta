import 'server-only'
import { formatTzs } from '@opusfesta/lib'
import { createSupabaseServerClient } from '@/lib/supabase'
import type { CatalogGift } from './gift-catalog'
import { GIFT_REGISTRY_CATEGORIES, type GiftRegistryCategory } from './types'

// DB-backed registry shop catalog — real vendor products (approved + published
// + active vendor), mapped into the CatalogGift shape the dashboard and public
// registry shops already render. Replaces the static GIFT_CATALOG. Server-only
// (kept out of gift-catalog.ts so that file stays client-import-safe).

// product_categories slug → the couple-facing GiftRegistryCategory used for the
// shop's category filter. Falls back to the first category for anything unmapped.
const CATEGORY_BY_SLUG: Record<string, GiftRegistryCategory> = {
  'kitchen-dining': 'Kitchen',
  'tabletop-bar': 'Tabletop',
  'bed-bath': 'Bed & Bath',
  'home-decor': 'Home',
  'outdoor-weekend': 'Weekend',
  'gifts-keepsakes': 'Experiences & Gift Cards',
}

type Row = {
  id: string
  name: string
  description: string | null
  images: string[] | null
  price_tzs: number
  category_slug: string | null
  vendor: { business_name: string | null; location: { city?: string; region?: string } | null } | null
}

export async function fetchCatalogProducts(limit = 60): Promise<CatalogGift[]> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('products')
    .select('id, name, description, images, price_tzs, category_slug, vendor:vendors!inner(business_name, location, onboarding_status)')
    .eq('status', 'approved')
    .eq('published', true)
    .eq('vendor.onboarding_status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<Row[]>()
  if (error || !data) return []

  return data.map((r) => {
    const location = r.vendor?.location?.city || r.vendor?.location?.region || 'Tanzania'
    return {
      id: r.id,
      productId: r.id,
      title: r.name,
      description: r.description ?? '',
      image: (r.images ?? [])[0] ?? '',
      priceLabel: formatTzs(r.price_tzs),
      priceTzs: r.price_tzs,
      category: (r.category_slug && CATEGORY_BY_SLUG[r.category_slug]) || GIFT_REGISTRY_CATEGORIES[0],
      shopName: r.vendor?.business_name ?? 'OpusFesta shop',
      shopLocation: location,
    }
  })
}
