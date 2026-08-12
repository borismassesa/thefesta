import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase'
import type { Treatment } from '@/components/guests/InvitationVisual'
import type { InvitationPalette } from '@/components/guests/invitation-templates/_types'
import { isProductBadge, type CatalogProduct } from '@/data/digital-cards-products'
import { DEFAULT_LOCALE, type Locale } from './localized'
import { artworkUrl, parseStorageUrl, type ArtworkSlot } from '@/lib/cards/protected-art'

type ProductRow = {
  id: string
  slug: string
  name: string
  // Swahili twins (added in 20260618000001). Optional so the loader stays safe
  // before the migration lands — missing columns just resolve to English.
  name_sw: string | null
  designer: string
  category: string
  description: string | null
  description_sw: string | null
  price_was: number | null
  price_now: number
  digital_unit_price: number
  free_sample: boolean
  swatches: string[] | null
  palettes: InvitationPalette[] | null
  treatment: string
  image_url: string | null
  back_image_url: string | null
  gallery: string[] | null
  designs: string[] | null
  badge: string | null
  published: boolean
  sort_order: number
  created_at: string | null
}

// Category values are a small fixed set (set by admins when creating a
// product), not free text — so a static lookup translates them for DISPLAY
// only, without needing a database column. `category` itself must stay the
// raw English value: other code (category-page filtering, event-type
// lookups) treats it as a stable machine key, not display text. Unknown/
// legacy values pass through untranslated.
const CATEGORY_SW: Record<string, string> = {
  // Admin picklist values (PRODUCT_CATEGORIES in opus_admin).
  'Wedding Invitations': 'Mialiko ya Harusi',
  'Sendoff': 'Send-off',
  'Kitchen Party': 'Kitchen Party',
  'Save the Dates': 'Kadi za Kutunza Tarehe',
  'Kadi za Michango': 'Kadi za Michango',
  'Anniversary': 'Kumbukumbu ya Ndoa',
  'Communio': 'Komunio',
  'Birthday': 'Siku ya Kuzaliwa',
  'Gala Dinner': 'Chakula cha Gala',
  'Muslim Wedding': 'Harusi ya Kiislamu',
  // Singular/legacy spellings: never stored by the current picklist, but kept
  // so any older row or CMS fallback still translates instead of falling
  // through to raw English.
  'Wedding': 'Harusi',
  'Save the Date': 'Kutunza Tarehe',
  'Reception Cards': 'Kadi za Karamu',
  'Day-of Paper Set': 'Seti ya Karatasi za Siku ya Tukio',
  'Menu Cards': 'Kadi za Menyu',
  'Foil & Letterpress': 'Foil na Letterpress',
}

export function translateProductCategory(category: string, locale: Locale): string {
  return locale === 'sw' ? CATEGORY_SW[category] ?? category : category
}

/**
 * Rewrites a stored artwork URL into one the browser may have.
 *
 * THE POINT OF THIS FUNCTION. `image_url`, `designs` and `gallery` hold PUBLIC
 * Supabase storage URLs, and the bucket accepts SVG — so shipping them to the
 * page handed every visitor the complete vector source of every design, with no
 * session and nothing this app could refuse. Rewriting here, at the single
 * mapper every catalogue read already goes through, protects the storefront,
 * the product page, the carousel, the cart and the customise editor at once,
 * rather than asking nine components to remember.
 *
 * Non-storage values (local `/assets/...` files) pass through untouched: they
 * are shipped with the app and are not anyone's artwork to steal.
 */
function protectArtwork(
  productId: string,
  stored: string | null | undefined,
  slot: ArtworkSlot,
): string | undefined {
  if (!stored) return undefined
  if (!parseStorageUrl(stored)) return stored
  // null means the artwork cannot be signed, so it is not served at all. The
  // tile falls back to its built-in <InvitationVisual> treatment: visibly wrong,
  // which gets the missing configuration noticed, and never the leak that
  // handing back the raw storage URL would be.
  return artworkUrl(productId, slot) ?? undefined
}

function rowToProduct(row: ProductRow, locale: Locale): CatalogProduct {
  const imageUrl = protectArtwork(row.id, row.image_url, 'hero')
  // Swahili falls back to English when blank/absent.
  const name = locale === 'sw' ? row.name_sw || row.name : row.name
  const description =
    locale === 'sw' ? row.description_sw || row.description : row.description
  return {
    id:               row.id,
    slug:             row.slug,
    category:         row.category,
    categoryLabel:    translateProductCategory(row.category, locale),
    name,
    designer:         row.designer,
    description:      description?.trim() || undefined,
    priceWas:         row.price_was ?? undefined,
    priceNow:         row.price_now,
    digitalUnitPrice: row.digital_unit_price,
    freeSample:       row.free_sample,
    swatches:         Array.isArray(row.swatches) ? row.swatches : [],
    palettes:         Array.isArray(row.palettes) ? row.palettes : [],
    treatment:        row.treatment as Treatment,
    imageUrl,
    designImage:      imageUrl,
    // Index against the RAW array, not the filtered one: the slot the browser
    // sends back is resolved by index server-side, so filtering first would
    // shift every position after a blank entry and serve the wrong view.
    gallery:          (row.gallery ?? [])
                        .map((url, i) => protectArtwork(row.id, url, `g${i}`))
                        .filter((url): url is string => Boolean(url)),
    designs:          (row.designs ?? [])
                        .map((url, i) => protectArtwork(row.id, url, `d${i}`))
                        .filter((url): url is string => Boolean(url)),
    badge:            isProductBadge(row.badge) ? row.badge : undefined,
    createdAt:        row.created_at ?? undefined,
  }
}

/** All published products, ordered for the catalog. */
export async function loadDigitalCardProducts(
  locale: Locale = DEFAULT_LOCALE
): Promise<CatalogProduct[]> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('website_invitations_products')
    .select('*')
    .eq('published', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return (data as ProductRow[]).map((row) => rowToProduct(row, locale))
}

/** A single published product by id. */
export async function loadDigitalCardProduct(
  id: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<CatalogProduct | undefined> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('website_invitations_products')
    .select('*')
    .eq('id', id)
    .eq('published', true)
    .maybeSingle<ProductRow>()
  if (error) throw error
  if (!data) return undefined
  return rowToProduct(data, locale)
}
