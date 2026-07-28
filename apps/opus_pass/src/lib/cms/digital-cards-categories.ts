import { draftMode } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabase'
import { DIGITAL_CARD_CATEGORIES, type DigitalCardCategory } from '@/data/digital-cards-categories'
import { DEFAULT_LOCALE, resolveLocalized, type Locale, type MaybeLocalized } from './localized'

/** CMS-shape category — uses snake_case to match the JSONB storage convention. */
export type DigitalCardCategoryCms = {
  slug: string
  label: string
  img: string
  alt: string
  subtitle: string
  product_matchers: string[]
}

export type DigitalCardsCategoriesContent = {
  heading: string
  description: string
  categories: DigitalCardCategoryCms[]
}

const HARDCODED_CMS_CATEGORIES: DigitalCardCategoryCms[] = DIGITAL_CARD_CATEGORIES.map((c) => ({
  slug: c.slug,
  label: c.label,
  img: c.img,
  alt: c.alt,
  subtitle: c.subtitle,
  product_matchers: c.productMatchers,
}))

export const DIGITAL_CARDS_CATEGORIES_FALLBACK: DigitalCardsCategoriesContent = {
  heading: 'Digital Cards for Every Moment',
  description:
    'Pick one design once, and every card across your day matches your suite. No mixing fonts, no clashing palettes, no last-minute hunt for matching paper.',
  categories: HARDCODED_CMS_CATEGORIES,
}

// Stored shape: translatable fields (heading, description, and each category's
// label/alt/subtitle) may be a localized { en, sw } object or a legacy plain
// string; non-text fields (slug, img, product_matchers) are scalar. The loader
// resolves each translatable field for `locale` and returns the flat
// DigitalCardsCategoriesContent the render components already expect.
type StoredCategory = {
  slug?: string
  label?: MaybeLocalized
  img?: string
  alt?: MaybeLocalized
  subtitle?: MaybeLocalized
  product_matchers?: string[]
}

type StoredCategoriesContent = {
  heading?: MaybeLocalized
  description?: MaybeLocalized
  categories?: StoredCategory[]
}

/** Convert a CMS-shape category to the runtime shape used by /digital-cards/[category]. */
export function cmsCategoryToRuntime(c: DigitalCardCategoryCms): DigitalCardCategory {
  return {
    slug: c.slug,
    label: c.label,
    img: c.img,
    alt: c.alt,
    subtitle: c.subtitle,
    productMatchers: c.product_matchers,
  }
}

export async function loadDigitalCardsCategoriesContent(
  locale: Locale = DEFAULT_LOCALE
): Promise<DigitalCardsCategoriesContent> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return DIGITAL_CARDS_CATEGORIES_FALLBACK
  }
  try {
    let isDraft = false
    try {
      const draft = await draftMode()
      isDraft = draft.isEnabled
    } catch {
      // called outside a request scope (e.g. generateStaticParams) — treat as non-draft
    }
    const supabase = createSupabaseServerClient()
    const { data } = await supabase
      .from('website_page_sections')
      .select('content, draft_content')
      .eq('page_key', 'opus-pass-invitations')
      .eq('section_key', 'categories')
      .maybeSingle()
    const stored = (isDraft ? data?.draft_content ?? data?.content : data?.content) as
      | StoredCategoriesContent
      | undefined
    if (stored) {
      const F = DIGITAL_CARDS_CATEGORIES_FALLBACK
      return {
        heading: resolveLocalized(stored.heading ?? F.heading, locale),
        description: resolveLocalized(stored.description ?? F.description, locale),
        categories:
          stored.categories && Array.isArray(stored.categories) && stored.categories.length > 0
            ? stored.categories.map((c) => ({
                slug: c.slug ?? '',
                label: resolveLocalized(c.label, locale),
                img: c.img ?? '',
                alt: resolveLocalized(c.alt, locale),
                subtitle: resolveLocalized(c.subtitle, locale),
                product_matchers: Array.isArray(c.product_matchers) ? c.product_matchers : [],
              }))
            : F.categories,
      }
    }
    return DIGITAL_CARDS_CATEGORIES_FALLBACK
  } catch (err) {
    console.error('[opus-pass cms] digital-cards-categories load failed', err)
    return DIGITAL_CARDS_CATEGORIES_FALLBACK
  }
}

/**
 * Server-side build helper: used by /digital-cards/[category]/generateStaticParams
 * and the [category] page lookup. Tries the CMS and falls back to the hardcoded
 * list if Supabase env vars are missing or the row doesn't exist yet.
 */
export async function loadDigitalCardCategoriesList(
  locale: Locale = DEFAULT_LOCALE
): Promise<DigitalCardCategory[]> {
  const { categories } = await loadDigitalCardsCategoriesContent(locale)
  return categories.map(cmsCategoryToRuntime)
}
