import { draftMode } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabase'
import { DEFAULT_LOCALE, resolveLocalized, type Locale, type MaybeLocalized } from './localized'
import { canonicalOpusPassHref } from './opus-pass-hrefs'

export type HomepageHeroContent = {
  headline_line_1: string
  headline_line_2: string
  description: string
  primary_cta_label: string
  primary_cta_href: string
  secondary_cta_label: string
  secondary_cta_href: string
  // New design (shared LandingHero): trust badge + "As featured in" press strip.
  trust_count: string
  rating: string
  avatars: string[]
  featured_in: string[]
  featured_in_label: string
}

export const HOMEPAGE_HERO_FALLBACK: HomepageHeroContent = {
  headline_line_1: 'Your whole wedding day',
  headline_line_2: 'one beautiful pass',
  description:
    'Digital cards, live RSVP tracking, and a beautiful wedding website — all in one pass. Free to start, bilingual in Swahili and English, and built for couples in Tanzania.',
  primary_cta_label: 'Browse Designs',
  primary_cta_href: '/digital-cards/catalog',
  secondary_cta_label: 'See Pricing',
  secondary_cta_href: '/pricing',
  trust_count: '1000+',
  rating: '4.5',
  avatars: [
    '/assets/images/cutesy_couple.jpg',
    '/assets/images/churchcouples.jpg',
    '/assets/images/coupleswithpiano.jpg',
    '/assets/images/authentic_couple.jpg',
    '/assets/images/mauzo_crew.jpg',
  ],
  featured_in: ['The Citizen', 'Clouds FM', 'Bongo5', 'JamiiForums'],
  featured_in_label: 'As featured in',
}

// Stored shape: translatable fields may be a localized { en, sw } object or a
// legacy plain string; non-text fields are scalar. The loader resolves each
// translatable field for `locale` and returns the flat HomepageHeroContent the
// render components already expect — so no public component changes.
type StoredHomepageHero = {
  headline_line_1?: MaybeLocalized
  headline_line_2?: MaybeLocalized
  description?: MaybeLocalized
  primary_cta_label?: MaybeLocalized
  secondary_cta_label?: MaybeLocalized
  primary_cta_href?: string
  secondary_cta_href?: string
  trust_count?: string
  rating?: string
  avatars?: string[]
  featured_in?: string[]
  featured_in_label?: MaybeLocalized
}

export async function loadHomepageHeroContent(
  locale: Locale = DEFAULT_LOCALE
): Promise<HomepageHeroContent> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return HOMEPAGE_HERO_FALLBACK
  }
  try {
    const { isEnabled: isDraft } = await draftMode()
    const supabase = createSupabaseServerClient()
    const { data } = await supabase
      .from('website_page_sections')
      .select('content, draft_content')
      .eq('page_key', 'opus-pass-homepage')
      .eq('section_key', 'hero')
      .maybeSingle()
    const stored = (isDraft ? data?.draft_content ?? data?.content : data?.content) as
      | StoredHomepageHero
      | undefined
    if (stored) {
      // Map fields explicitly (not a blind spread) so legacy keys from older
      // schemas — main_image_url, card_* from the old two-card hero — never leak
      // into the rendered payload. Translatable fields resolve to `locale`.
      const F = HOMEPAGE_HERO_FALLBACK
      return {
        headline_line_1: resolveLocalized(stored.headline_line_1 ?? F.headline_line_1, locale),
        headline_line_2: resolveLocalized(stored.headline_line_2 ?? F.headline_line_2, locale),
        description: resolveLocalized(stored.description ?? F.description, locale),
        primary_cta_label: resolveLocalized(stored.primary_cta_label ?? F.primary_cta_label, locale),
        primary_cta_href: canonicalOpusPassHref(stored.primary_cta_href, F.primary_cta_href),
        secondary_cta_label: resolveLocalized(stored.secondary_cta_label ?? F.secondary_cta_label, locale),
        secondary_cta_href: canonicalOpusPassHref(stored.secondary_cta_href, F.secondary_cta_href),
        trust_count: stored.trust_count ?? F.trust_count,
        rating: stored.rating ?? F.rating,
        avatars:
          stored.avatars && Array.isArray(stored.avatars) && stored.avatars.length > 0
            ? stored.avatars
            : F.avatars,
        featured_in:
          stored.featured_in && Array.isArray(stored.featured_in) && stored.featured_in.length > 0
            ? stored.featured_in
            : F.featured_in,
        featured_in_label: resolveLocalized(stored.featured_in_label ?? F.featured_in_label, locale),
      }
    }
    return HOMEPAGE_HERO_FALLBACK
  } catch (err) {
    console.error('[opus-pass cms] homepage-hero load failed', err)
    return HOMEPAGE_HERO_FALLBACK
  }
}
