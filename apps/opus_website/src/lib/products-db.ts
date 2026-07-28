import { formatTzs } from '@opusfesta/lib'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getRegistryCategory, type RegistryCategory } from '@/lib/registry-categories'
import type { Product } from '@/lib/registry-products'

// Maps real vendor `products` rows (written by the vendors_portal Products
// editor, approved by admin) into the public registry `Product` shape the
// /registry pages already render. Replaces the fake generated catalog in
// registry-products.ts. Only live products from active vendors are readable
// (products_public_read RLS), and we still filter explicitly here.
//
// Every query here is scoped to a vendor VERTICAL. A gift-shop seller and an
// attire seller both list goods on the same `products` table, but they belong
// on different public surfaces: cookware in the gift registry, gowns and rings
// on the attire pages. Without the filter an approved wedding dress would show
// up under "Kitchen & Dining" — the same leak `vertical='service'` fixed for
// the vendor directory in vendors-db.ts.

/** Which public surface a product belongs to. Mirrors `vendors.vertical`. */
export type ShopVertical = 'gift_shop' | 'attire_rings'

/** Base path of the shop pages for a vertical. */
export function shopBasePath(vertical: ShopVertical): string {
  return vertical === 'attire_rings' ? '/attire-and-rings/shops' : '/registry/shops'
}

type VendorJoin = {
  slug: string | null
  business_name: string | null
  location: { city?: string; region?: string } | null
  created_at: string | null
  stats: { averageRating?: number; reviewCount?: number } | null
  vertical: string | null
} | null

type ProductJoinRow = {
  id: string
  vendor_id: string
  category_slug: string | null
  name: string
  description: string | null
  highlights: string[] | null
  price_tzs: number
  compare_at_price_tzs: number | null
  images: string[] | null
  stock_quantity: number | null
  made_to_order: boolean
  sort_order: number
  created_at: string
  vendor: VendorJoin
}

const PRODUCT_SELECT =
  'id, vendor_id, category_slug, name, description, highlights, price_tzs, compare_at_price_tzs, images, stock_quantity, made_to_order, sort_order, created_at, vendor:vendors!inner(slug, business_name, location, created_at, stats, vertical, onboarding_status)'

function isShopVertical(value: string | null | undefined): value is ShopVertical {
  return value === 'gift_shop' || value === 'attire_rings'
}

function yearsActive(createdAt: string | null): number {
  if (!createdAt) return 1
  const then = new Date(createdAt).getTime()
  if (Number.isNaN(then)) return 1
  const years = Math.floor((Date.now() - then) / (365.25 * 24 * 3600 * 1000))
  return Math.max(1, years)
}

function fallbackCategory(slug: string | null): RegistryCategory {
  return (
    (slug ? getRegistryCategory(slug) : undefined) ?? {
      slug: slug ?? 'gifts-keepsakes',
      name: 'Gifts',
      title: 'Gifts',
      tagline: '',
      img: '',
      related: [],
    }
  )
}

/** DB product row (with vendor join) → the registry Product the UI renders. */
function mapProduct(row: ProductJoinRow): Product {
  const vendor = row.vendor
  const location = vendor?.location?.city || vendor?.location?.region || 'Tanzania'
  const gallery = (row.images ?? []).filter(Boolean)
  const discountPct =
    row.compare_at_price_tzs && row.compare_at_price_tzs > row.price_tzs
      ? Math.round((1 - row.price_tzs / row.compare_at_price_tzs) * 100)
      : undefined

  return {
    id: row.id,
    vendorId: row.vendor_id,
    name: row.name,
    price: formatTzs(row.price_tzs),
    priceTzs: row.price_tzs,
    oldPrice: row.compare_at_price_tzs ? formatTzs(row.compare_at_price_tzs) : undefined,
    oldPriceTzs: row.compare_at_price_tzs ?? undefined,
    discountPct,
    // Real product reviews don't exist yet — show an honest neutral state
    // (ProductReviewsSection renders an empty-reviews fallback).
    rating: vendor?.stats?.averageRating ? vendor.stats.averageRating.toFixed(1) : '5.0',
    reviews: 0,
    sold: 0,
    img: gallery[0] ?? '',
    gallery: gallery.length > 0 ? gallery : [''],
    badge: undefined,
    mostWanted: false,
    freeDelivery: false,
    madeIn: location,
    category: fallbackCategory(row.category_slug),
    brand: {
      name: vendor?.business_name ?? 'OpusFesta shop',
      location,
      rating: vendor?.stats?.averageRating ? vendor.stats.averageRating.toFixed(1) : '5.0',
      reviews: vendor?.stats?.reviewCount ?? 0,
      yearsActive: yearsActive(vendor?.created_at ?? null),
      href:
        vendor?.slug && isShopVertical(vendor.vertical)
          ? `${shopBasePath(vendor.vertical)}/${vendor.slug}`
          : undefined,
    },
    description: row.description ?? `${row.name} — available on the OpusFesta registry shop.`,
    highlights: row.highlights ?? [],
    colors: undefined,
    reviewSnippets: [],
  }
}

/**
 * Products for a shop grid. `vertical` defaults to 'gift_shop' because every
 * caller today is a /registry page; attire callers pass 'attire_rings'
 * explicitly. There is deliberately no "all verticals" option — a query that
 * mixes cookware and bridal gowns has no surface to render it on.
 */
export async function getShopProducts(opts: {
  vertical?: ShopVertical
  category?: string
  vendorId?: string
  limit?: number
  excludeId?: string
} = {}): Promise<Product[]> {
  const supabase = createSupabaseServerClient()
  let query = supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('status', 'approved')
    .eq('published', true)
    .eq('vendor.onboarding_status', 'active')
    .eq('vendor.vertical', opts.vertical ?? 'gift_shop')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
  if (opts.category) query = query.eq('category_slug', opts.category)
  if (opts.vendorId) query = query.eq('vendor_id', opts.vendorId)
  if (opts.limit) query = query.limit(opts.limit + (opts.excludeId ? 1 : 0))

  const { data, error } = await query.returns<ProductJoinRow[]>()
  if (error || !data) return []
  let rows = data
  if (opts.excludeId) rows = rows.filter((r) => r.id !== opts.excludeId)
  if (opts.limit) rows = rows.slice(0, opts.limit)
  return rows.map(mapProduct)
}

/**
 * One product for the PDP, or null if it isn't live *on this surface*. The
 * vertical check is what stops `/registry/kitchen-dining/p/<gown-id>` from
 * rendering a bridal gown under a registry breadcrumb: a hand-typed or stale
 * URL 404s instead.
 */
export async function getShopProductById(
  id: string,
  vertical: ShopVertical = 'gift_shop',
): Promise<Product | null> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('id', id)
    .eq('status', 'approved')
    .eq('published', true)
    .eq('vendor.onboarding_status', 'active')
    .eq('vendor.vertical', vertical)
    .maybeSingle<ProductJoinRow>()
  if (error || !data) return null
  return mapProduct(data)
}

/**
 * Live products for one vendor's shop page. Scoped by vertical like every
 * other read so the caller can't accidentally render an attire seller's stock
 * inside a registry layout.
 */
export async function getProductsForVendor(
  vendorId: string,
  vertical: ShopVertical = 'gift_shop',
  limit = 24,
): Promise<Product[]> {
  return getShopProducts({ vertical, vendorId, limit })
}

/**
 * Every live product keyed by its seller's slug, for generateStaticParams on
 * shop-nested PDP routes (`/attire-and-rings/shops/<slug>/p/<id>`).
 */
export async function getShopProductParams(
  vertical: ShopVertical,
): Promise<{ slug: string; id: string }[]> {
  const supabase = createSupabaseServerClient()
  const { data } = await supabase
    .from('products')
    .select('id, vendor:vendors!inner(slug, onboarding_status, vertical)')
    .eq('status', 'approved')
    .eq('published', true)
    .eq('vendor.onboarding_status', 'active')
    .eq('vendor.vertical', vertical)
    .returns<{ id: string; vendor: { slug: string | null } | null }[]>()
  return (data ?? [])
    .filter((r): r is { id: string; vendor: { slug: string } } => Boolean(r.vendor?.slug))
    .map((r) => ({ slug: r.vendor.slug, id: r.id }))
}

/** Every live product id in a vertical, for generateStaticParams on PDP routes. */
export async function getAllProductParams(
  vertical: ShopVertical = 'gift_shop',
): Promise<{ category: string; id: string }[]> {
  const supabase = createSupabaseServerClient()
  const { data } = await supabase
    .from('products')
    .select('id, category_slug, vendor:vendors!inner(onboarding_status, vertical)')
    .eq('status', 'approved')
    .eq('published', true)
    .eq('vendor.onboarding_status', 'active')
    .eq('vendor.vertical', vertical)
    .returns<{ id: string; category_slug: string | null }[]>()
  return (data ?? []).map((r) => ({ category: r.category_slug ?? 'gifts-keepsakes', id: r.id }))
}

/** Most-recent live products, for the registry home "new arrivals" row. */
export async function getNewArrivals(limit = 8): Promise<Product[]> {
  return getShopProducts({ limit })
}

/** A simple "most popular" surface until product reviews/sales exist: newest live products. */
export async function getMostPopular(limit = 9): Promise<Product[]> {
  return getShopProducts({ limit })
}

/** Live products at or under a price ceiling, for the registry home price bands. */
export async function getProductsUnder(maxTzs: number, limit = 6): Promise<Product[]> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('status', 'approved')
    .eq('published', true)
    .eq('vendor.onboarding_status', 'active')
    .eq('vendor.vertical', 'gift_shop')
    .lte('price_tzs', maxTzs)
    .order('price_tzs', { ascending: true })
    .limit(limit)
    .returns<ProductJoinRow[]>()
  if (error || !data) return []
  return data.map(mapProduct)
}

// ── Shop pages ──────────────────────────────────────────────────────────────
//
// Product vendors are excluded from `/vendors/[slug]` (that directory is for
// service vendors), so without these they'd have no public page at all and
// "More from <seller>" on a PDP would link nowhere. A shop page is the product
// vendor's equivalent of the directory profile.

export type ShopVendor = {
  id: string
  slug: string
  name: string
  vertical: ShopVertical
  location: string
  description: string | null
  logo: string | null
  coverImage: string | null
  yearsActive: number
  rating: string | null
  reviewCount: number
  productCount: number
}

type ShopVendorRow = {
  id: string
  slug: string
  business_name: string | null
  location: { city?: string; region?: string } | null
  description: string | null
  bio: string | null
  logo: string | null
  cover_image: string | null
  created_at: string | null
  stats: { averageRating?: number; reviewCount?: number } | null
  vertical: string | null
}

const SHOP_VENDOR_SELECT =
  'id, slug, business_name, location, description, bio, logo, cover_image, created_at, stats, vertical'

function mapShopVendor(row: ShopVendorRow, vertical: ShopVertical, productCount: number): ShopVendor {
  return {
    id: row.id,
    slug: row.slug,
    name: row.business_name ?? 'OpusFesta shop',
    vertical,
    location: row.location?.city || row.location?.region || 'Tanzania',
    description: row.description || row.bio || null,
    logo: row.logo,
    coverImage: row.cover_image,
    yearsActive: yearsActive(row.created_at),
    // No rating rather than a flattering default: these sellers have no review
    // system yet, and printing "5.0" next to zero reviews is a fabricated stat.
    rating: row.stats?.averageRating ? row.stats.averageRating.toFixed(1) : null,
    reviewCount: row.stats?.reviewCount ?? 0,
    productCount,
  }
}

/**
 * Live product counts per vendor in a vertical. Used to hide shops with
 * nothing to sell — an empty shop page is worse than no listing.
 */
async function liveProductCounts(vertical: ShopVertical): Promise<Map<string, number>> {
  const supabase = createSupabaseServerClient()
  const { data } = await supabase
    .from('products')
    .select('vendor_id, vendor:vendors!inner(onboarding_status, vertical)')
    .eq('status', 'approved')
    .eq('published', true)
    .eq('vendor.onboarding_status', 'active')
    .eq('vendor.vertical', vertical)
    .returns<{ vendor_id: string }[]>()
  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    counts.set(row.vendor_id, (counts.get(row.vendor_id) ?? 0) + 1)
  }
  return counts
}

/** Every shop in a vertical that has at least one live product. */
export async function getShopVendors(vertical: ShopVertical): Promise<ShopVendor[]> {
  const counts = await liveProductCounts(vertical)
  if (counts.size === 0) return []
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('vendors')
    .select(SHOP_VENDOR_SELECT)
    .in('id', [...counts.keys()])
    .eq('onboarding_status', 'active')
    .eq('vertical', vertical)
    .returns<ShopVendorRow[]>()
  if (error || !data) return []
  return data
    .map((row) => mapShopVendor(row, vertical, counts.get(row.id) ?? 0))
    .sort((a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name))
}

/** One shop by slug, or null if it isn't an active vendor in this vertical. */
export async function getShopVendorBySlug(
  slug: string,
  vertical: ShopVertical,
): Promise<ShopVendor | null> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('vendors')
    .select(SHOP_VENDOR_SELECT)
    .eq('slug', slug)
    .eq('onboarding_status', 'active')
    .eq('vertical', vertical)
    .maybeSingle<ShopVendorRow>()
  if (error || !data) return null
  const counts = await liveProductCounts(vertical)
  return mapShopVendor(data, vertical, counts.get(data.id) ?? 0)
}
