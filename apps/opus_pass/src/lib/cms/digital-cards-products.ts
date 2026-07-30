import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase'
import type { Treatment } from '@/components/guests/InvitationVisual'
import type { InvitationPalette } from '@/components/guests/invitation-templates/_types'
import { isProductBadge, type CatalogProduct } from '@/data/digital-cards-products'
import { DEFAULT_LOCALE, type Locale } from './localized'

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

function rowToProduct(row: ProductRow, locale: Locale): CatalogProduct {
  const imageUrl = row.image_url || undefined
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
    gallery:          Array.isArray(row.gallery) ? row.gallery.filter(Boolean) : [],
    designs:          Array.isArray(row.designs) ? row.designs.filter(Boolean) : [],
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
