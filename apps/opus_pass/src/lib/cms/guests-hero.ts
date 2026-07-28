import { draftMode } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabase'
import { DEFAULT_LOCALE, resolveLocalized, type Locale, type MaybeLocalized } from './localized'

export type GuestsHeroImage = {
  src: string
  alt: string
}

export type GuestsHeroContent = {
  headline_line_1: string
  headline_line_2: string
  description: string
  primary_cta_label: string
  primary_cta_href: string
  secondary_cta_label: string
  secondary_cta_href: string
  trust_lead: string
  trust_rest: string
  avatars: string[]
  collage: GuestsHeroImage[]
}

export const GUESTS_HERO_FALLBACK: GuestsHeroContent = {
  headline_line_1: 'Your guest list, replying in',
  headline_line_2: 'real time',
  description:
    'Send digital cards by WhatsApp or SMS and watch the “Joyful yes” replies roll in — a free guest list and bilingual RSVP page in English & Swahili.',
  primary_cta_label: 'Start your guest list',
  // Go straight to the dashboard. /my is auth-protected, so a signed-in couple
  // (shared OpusFesta session) lands directly on it, while a signed-out visitor
  // is funnelled through /sign-in (→ back here) by middleware. seed=1 triggers
  // first-run setup on the dashboard. Rendered via next/link, so basePath
  // (/opuspass) is prepended automatically.
  primary_cta_href: '/my/dashboard?seed=1',
  secondary_cta_label: 'See how it works',
  secondary_cta_href: '#collection',
  trust_lead: 'Trusted by 500+',
  trust_rest: 'Tanzanian couples',
  avatars: [
    '/assets/images/cutesy_couple.jpg',
    '/assets/images/authentic_couple.jpg',
    '/assets/images/couples_together.jpg',
    '/assets/images/beautiful_bride.jpg',
  ],
  collage: [
    { src: '/assets/images/flowers_pinky.jpg', alt: 'Wedding flowers' },
    { src: '/assets/images/bridering.jpg', alt: 'Wedding rings' },
    { src: '/assets/images/cutesy_couple.jpg', alt: 'A couple celebrating with their guests' },
    { src: '/assets/images/hand_rings.jpg', alt: 'Hands with wedding rings' },
    { src: '/assets/images/authentic_couple.jpg', alt: 'Couple portrait' },
    { src: '/assets/images/coupleswithpiano.jpg', alt: 'Couple at the piano' },
  ],
}

// Stored shape: translatable fields may be a localized { en, sw } object or a
// legacy plain string; non-text fields (URLs, image keys) stay scalar. The
// loader resolves each translatable field for `locale` and returns the flat
// GuestsHeroContent the render components already expect — no component changes.
type StoredGuestsHeroImage = {
  src?: string
  alt?: MaybeLocalized
}

type StoredGuestsHero = {
  headline_line_1?: MaybeLocalized
  headline_line_2?: MaybeLocalized
  description?: MaybeLocalized
  primary_cta_label?: MaybeLocalized
  secondary_cta_label?: MaybeLocalized
  primary_cta_href?: string
  secondary_cta_href?: string
  trust_lead?: MaybeLocalized
  trust_rest?: MaybeLocalized
  avatars?: string[]
  collage?: StoredGuestsHeroImage[]
}

export async function loadGuestsHeroContent(
  locale: Locale = DEFAULT_LOCALE
): Promise<GuestsHeroContent> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return GUESTS_HERO_FALLBACK
  }
  try {
    const { isEnabled: isDraft } = await draftMode()
    const supabase = createSupabaseServerClient()
    const { data } = await supabase
      .from('website_page_sections')
      .select('content, draft_content')
      .eq('page_key', 'opus-pass-guests')
      .eq('section_key', 'hero')
      .maybeSingle()
    const stored = (isDraft ? data?.draft_content ?? data?.content : data?.content) as
      | StoredGuestsHero
      | undefined
    if (stored) {
      const F = GUESTS_HERO_FALLBACK
      return {
        headline_line_1: resolveLocalized(stored.headline_line_1 ?? F.headline_line_1, locale),
        headline_line_2: resolveLocalized(stored.headline_line_2 ?? F.headline_line_2, locale),
        description: resolveLocalized(stored.description ?? F.description, locale),
        primary_cta_label: resolveLocalized(stored.primary_cta_label ?? F.primary_cta_label, locale),
        primary_cta_href: stored.primary_cta_href ?? F.primary_cta_href,
        secondary_cta_label: resolveLocalized(stored.secondary_cta_label ?? F.secondary_cta_label, locale),
        secondary_cta_href: stored.secondary_cta_href ?? F.secondary_cta_href,
        trust_lead: resolveLocalized(stored.trust_lead ?? F.trust_lead, locale),
        trust_rest: resolveLocalized(stored.trust_rest ?? F.trust_rest, locale),
        avatars:
          stored.avatars && Array.isArray(stored.avatars) && stored.avatars.length > 0
            ? stored.avatars
            : F.avatars,
        collage:
          stored.collage && Array.isArray(stored.collage) && stored.collage.length > 0
            ? stored.collage.map((image) => ({
                src: image.src ?? '',
                alt: resolveLocalized(image.alt, locale),
              }))
            : F.collage,
      }
    }
    return GUESTS_HERO_FALLBACK
  } catch (err) {
    console.error('[opus-pass cms] guests-hero load failed', err)
    return GUESTS_HERO_FALLBACK
  }
}
