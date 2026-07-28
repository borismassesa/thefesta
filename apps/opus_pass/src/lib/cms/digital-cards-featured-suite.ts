import { draftMode } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabase'
import { DEFAULT_LOCALE, resolveLocalized, type Locale, type MaybeLocalized } from './localized'

export type DigitalCardsFeaturedSuiteContent = {
  image_url: string
  headline_line_1: string
  headline_line_2: string
  body: string
  primary_cta_label: string
  primary_cta_href: string
  secondary_cta_label: string
  secondary_cta_href: string
  trust_strip: string[]
}

export const DIGITAL_CARDS_FEATURED_SUITE_FALLBACK: DigitalCardsFeaturedSuiteContent = {
  image_url: '/assets/images/couples_together.jpg',
  headline_line_1: 'From Save the Date',
  headline_line_2: 'to Thank You',
  body:
    'Customise the designs with your names, date, and colours. Send to every guest in seconds by WhatsApp or SMS, and watch RSVPs land in real time. Optional paper prints for elders & VIPs.',
  primary_cta_label: 'Start designing',
  primary_cta_href: '/digital-cards/catalog',
  secondary_cta_label: 'See how it works',
  secondary_cta_href: '/digital-cards/catalog',
  trust_strip: ['Share via WhatsApp & SMS', 'Live RSVP tracking', 'Pay with M-Pesa or Airtel'],
}

// Stored shape: translatable fields (headlines, body, CTA labels, and each
// trust-strip item) may be a localized { en, sw } object or a legacy plain
// string; the image URL and CTA hrefs are scalar. The loader resolves each
// translatable field for `locale` and returns the flat
// DigitalCardsFeaturedSuiteContent the render path already expects.
type StoredFeaturedSuiteContent = {
  image_url?: string
  headline_line_1?: MaybeLocalized
  headline_line_2?: MaybeLocalized
  body?: MaybeLocalized
  primary_cta_label?: MaybeLocalized
  primary_cta_href?: string
  secondary_cta_label?: MaybeLocalized
  secondary_cta_href?: string
  trust_strip?: MaybeLocalized[]
}

export async function loadDigitalCardsFeaturedSuiteContent(
  locale: Locale = DEFAULT_LOCALE
): Promise<DigitalCardsFeaturedSuiteContent> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return DIGITAL_CARDS_FEATURED_SUITE_FALLBACK
  }
  try {
    const { isEnabled: isDraft } = await draftMode()
    const supabase = createSupabaseServerClient()
    const { data } = await supabase
      .from('website_page_sections')
      .select('content, draft_content')
      .eq('page_key', 'opus-pass-invitations')
      .eq('section_key', 'featured-suite')
      .maybeSingle()
    const stored = (isDraft ? data?.draft_content ?? data?.content : data?.content) as
      | StoredFeaturedSuiteContent
      | undefined
    if (stored) {
      const F = DIGITAL_CARDS_FEATURED_SUITE_FALLBACK
      return {
        image_url: stored.image_url ?? F.image_url,
        headline_line_1: resolveLocalized(stored.headline_line_1 ?? F.headline_line_1, locale),
        headline_line_2: resolveLocalized(stored.headline_line_2 ?? F.headline_line_2, locale),
        body: resolveLocalized(stored.body ?? F.body, locale),
        primary_cta_label: resolveLocalized(stored.primary_cta_label ?? F.primary_cta_label, locale),
        primary_cta_href: stored.primary_cta_href ?? F.primary_cta_href,
        secondary_cta_label: resolveLocalized(
          stored.secondary_cta_label ?? F.secondary_cta_label,
          locale
        ),
        secondary_cta_href: stored.secondary_cta_href ?? F.secondary_cta_href,
        trust_strip:
          stored.trust_strip && Array.isArray(stored.trust_strip) && stored.trust_strip.length > 0
            ? stored.trust_strip.map((item) => resolveLocalized(item, locale))
            : F.trust_strip,
      }
    }
    return DIGITAL_CARDS_FEATURED_SUITE_FALLBACK
  } catch (err) {
    console.error('[opus-pass cms] digital-cards-featured-suite load failed', err)
    return DIGITAL_CARDS_FEATURED_SUITE_FALLBACK
  }
}
