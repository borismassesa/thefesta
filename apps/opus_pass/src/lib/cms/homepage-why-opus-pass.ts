import { draftMode } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabase'
import { DEFAULT_LOCALE, resolveLocalized, type Locale, type MaybeLocalized } from './localized'
import { canonicalOpusPassHref } from './opus-pass-hrefs'

export type HomepageWhyOpusPassContent = {
  headline: string
  main_image_url: string
  main_image_alt: string
  chip_image_url: string
  chip_title: string
  chip_subtitle: string
  floating_cta_label: string
  floating_cta_href: string
  subheadline: string
  body: string
  primary_button_label: string
  primary_button_href: string
  secondary_button_label: string
  secondary_button_href: string
}

export const HOMEPAGE_WHY_OPUS_PASS_FALLBACK: HomepageWhyOpusPassContent = {
  headline:
    'The #1 reason couples choose OpusPass is to plan their whole wedding in one place',
  main_image_url: '/assets/images/cutesy_couple.jpg',
  main_image_alt: 'A couple planning their wedding',
  chip_image_url: '/assets/images/flowers_pinky.jpg',
  chip_title: 'Save the Date',
  chip_subtitle: 'Wedding invite',
  floating_cta_label: 'Get started',
  floating_cta_href: '/sign-up',
  subheadline: 'Planning that actually feels effortless',
  body:
    'Couples tell us everything just flows — digital cards, live RSVPs, your guest list and a free wedding website all talk to each other, so nothing slips through the cracks. Spend less time on admin, and more time celebrating.',
  primary_button_label: 'How it works',
  primary_button_href: '/guests-and-rsvp',
  secondary_button_label: 'Browse designs',
  secondary_button_href: '/digital-cards/catalog',
}

// Stored shape: translatable fields may be a localized { en, sw } object or a
// legacy plain string; image URLs and hrefs are scalar. The loader resolves
// each translatable field for `locale` and returns the flat
// HomepageWhyOpusPassContent the render component already expects.
type StoredHomepageWhyOpusPass = {
  headline?: MaybeLocalized
  main_image_alt?: MaybeLocalized
  chip_title?: MaybeLocalized
  chip_subtitle?: MaybeLocalized
  floating_cta_label?: MaybeLocalized
  subheadline?: MaybeLocalized
  body?: MaybeLocalized
  primary_button_label?: MaybeLocalized
  secondary_button_label?: MaybeLocalized
  main_image_url?: string
  chip_image_url?: string
  floating_cta_href?: string
  primary_button_href?: string
  secondary_button_href?: string
}

export async function loadHomepageWhyOpusPassContent(
  locale: Locale = DEFAULT_LOCALE
): Promise<HomepageWhyOpusPassContent> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return HOMEPAGE_WHY_OPUS_PASS_FALLBACK
  }
  try {
    const { isEnabled: isDraft } = await draftMode()
    const supabase = createSupabaseServerClient()
    const { data } = await supabase
      .from('website_page_sections')
      .select('content, draft_content')
      .eq('page_key', 'opus-pass-homepage')
      .eq('section_key', 'why-opus-pass')
      .maybeSingle()
    const stored = (isDraft ? data?.draft_content ?? data?.content : data?.content) as
      | StoredHomepageWhyOpusPass
      | undefined
    if (stored) {
      const F = HOMEPAGE_WHY_OPUS_PASS_FALLBACK
      return {
        headline: resolveLocalized(stored.headline ?? F.headline, locale),
        main_image_url: stored.main_image_url ?? F.main_image_url,
        main_image_alt: resolveLocalized(stored.main_image_alt ?? F.main_image_alt, locale),
        chip_image_url: stored.chip_image_url ?? F.chip_image_url,
        chip_title: resolveLocalized(stored.chip_title ?? F.chip_title, locale),
        chip_subtitle: resolveLocalized(stored.chip_subtitle ?? F.chip_subtitle, locale),
        floating_cta_label: resolveLocalized(stored.floating_cta_label ?? F.floating_cta_label, locale),
        floating_cta_href: canonicalOpusPassHref(stored.floating_cta_href, F.floating_cta_href),
        subheadline: resolveLocalized(stored.subheadline ?? F.subheadline, locale),
        body: resolveLocalized(stored.body ?? F.body, locale),
        primary_button_label: resolveLocalized(stored.primary_button_label ?? F.primary_button_label, locale),
        primary_button_href: canonicalOpusPassHref(stored.primary_button_href, F.primary_button_href),
        secondary_button_label: resolveLocalized(stored.secondary_button_label ?? F.secondary_button_label, locale),
        secondary_button_href: canonicalOpusPassHref(stored.secondary_button_href, F.secondary_button_href),
      }
    }
    return HOMEPAGE_WHY_OPUS_PASS_FALLBACK
  } catch (err) {
    console.error('[opus-pass cms] homepage-why-opus-pass load failed', err)
    return HOMEPAGE_WHY_OPUS_PASS_FALLBACK
  }
}
