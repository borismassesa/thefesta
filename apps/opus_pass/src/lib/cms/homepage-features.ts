import { draftMode } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabase'
import { DEFAULT_LOCALE, resolveLocalized, type Locale, type MaybeLocalized } from './localized'
import { canonicalOpusPassHref } from './opus-pass-hrefs'

export type HomepageFeatureBlock = {
  id: string
  reverse: boolean
  /** Optional video URL. When set, the card plays a video instead of the image. */
  media_video?: string
  media_main: string
  media_secondary: string
  media_overlay: string
  overlay_eyebrow: string
  overlay_caption_line_1: string
  overlay_caption_line_2: string
  headline_line_1: string
  headline_line_2: string
  body: string
  pills: string[]
  primary_cta_label: string
  primary_cta_href: string
  secondary_cta_label: string
  secondary_cta_href: string
}

export type HomepageFeaturesContent = {
  header_title: string
  header_description: string
  blocks: HomepageFeatureBlock[]
}

export const HOMEPAGE_FEATURES_FALLBACK: HomepageFeaturesContent = {
  header_title: 'Built for every wedding moment',
  header_description:
    'Three tools that turn save-the-dates to the final seating chart, OpusPass keeps every guest, message, and detail in sync.',
  blocks: [
    {
      id: 'invitations', reverse: false,
      media_video: '/assets/videos/happy_couples.mov',
      media_main: '/assets/images/cutesy_couple.jpg',
      media_secondary: '/assets/images/flowers_pinky.jpg',
      media_overlay: '/assets/images/authentic_couple.jpg',
      overlay_eyebrow: 'Invites', overlay_caption_line_1: 'Tap, RSVP,', overlay_caption_line_2: 'done.',
      headline_line_1: 'Designer-worthy', headline_line_2: 'digital cards',
      body: 'For save-the-dates, weddings, kitchen parties and send-offs. Delivered by WhatsApp or SMS, with RSVP built in.',
      pills: ['Save the Dates', 'Wedding Invites', 'Kitchen Party', 'Send-Off'],
      primary_cta_label: 'Browse designs', primary_cta_href: '/digital-cards/catalog',
      secondary_cta_label: 'See pricing', secondary_cta_href: '/pricing',
    },
    {
      id: 'guests', reverse: true,
      media_main: '/assets/images/mauzo_crew.jpg',
      media_secondary: '/assets/images/churchcouples.jpg',
      media_overlay: '/assets/images/couples_together.jpg',
      overlay_eyebrow: 'Guests', overlay_caption_line_1: 'Every guest,', overlay_caption_line_2: 'every RSVP.',
      headline_line_1: 'Your guest list', headline_line_2: 'and live RSVPs',
      body: 'Manage your guest list, send invites by WhatsApp or SMS, and watch responses come in live. Send reminders, finalise seating, no spreadsheets needed.',
      pills: ['Guest list', 'Live RSVPs', 'Auto reminders', 'Seating chart'],
      primary_cta_label: 'Manage guests', primary_cta_href: '/guests-and-rsvp',
      secondary_cta_label: 'How it works', secondary_cta_href: '/guests-and-rsvp',
    },
    {
      id: 'website', reverse: false,
      media_main: '/assets/images/coupleswithpiano.jpg',
      media_secondary: '/assets/images/beautiful_bride.jpg',
      media_overlay: '/assets/images/bride_umbrella.jpg',
      overlay_eyebrow: 'Website', overlay_caption_line_1: 'One link.', overlay_caption_line_2: 'Every detail.',
      headline_line_1: 'A wedding site', headline_line_2: 'in minutes',
      body: 'Share your story, venue, travel info and live updates — your guests just tap a single link from their phones. Change anything once and the world sees it instantly.',
      pills: ['Custom link', 'Photo gallery', 'Travel info', 'Live updates'],
      primary_cta_label: 'Build your website', primary_cta_href: '/websites',
      secondary_cta_label: 'See examples', secondary_cta_href: '/websites',
    },
  ],
}

// Stored shape: translatable fields may be a localized { en, sw } object or a
// legacy plain string; media URLs and hrefs are scalar. The loader resolves
// each translatable field for `locale` and returns the flat
// HomepageFeaturesContent the render components already expect.
type StoredFeatureBlock = {
  id?: string
  reverse?: boolean
  media_video?: string
  media_main?: string
  media_secondary?: string
  media_overlay?: string
  overlay_eyebrow?: MaybeLocalized
  overlay_caption_line_1?: MaybeLocalized
  overlay_caption_line_2?: MaybeLocalized
  headline_line_1?: MaybeLocalized
  headline_line_2?: MaybeLocalized
  body?: MaybeLocalized
  pills?: MaybeLocalized[]
  primary_cta_label?: MaybeLocalized
  primary_cta_href?: string
  secondary_cta_label?: MaybeLocalized
  secondary_cta_href?: string
}
type StoredHomepageFeatures = {
  header_title?: MaybeLocalized
  header_description?: MaybeLocalized
  blocks?: StoredFeatureBlock[]
}

function resolveBlock(block: StoredFeatureBlock, locale: Locale, i: number): HomepageFeatureBlock {
  const fallback =
    HOMEPAGE_FEATURES_FALLBACK.blocks.find((item) => item.id === block.id) ??
    HOMEPAGE_FEATURES_FALLBACK.blocks[i]
  return {
    id: block.id ?? `block-${i}`,
    reverse: block.reverse ?? false,
    ...(block.media_video ? { media_video: block.media_video } : {}),
    media_main: block.media_main ?? '',
    media_secondary: block.media_secondary ?? '',
    media_overlay: block.media_overlay ?? '',
    overlay_eyebrow: resolveLocalized(block.overlay_eyebrow, locale),
    overlay_caption_line_1: resolveLocalized(block.overlay_caption_line_1, locale),
    overlay_caption_line_2: resolveLocalized(block.overlay_caption_line_2, locale),
    headline_line_1: resolveLocalized(block.headline_line_1, locale),
    headline_line_2: resolveLocalized(block.headline_line_2, locale),
    body: resolveLocalized(block.body, locale),
    pills: Array.isArray(block.pills) ? block.pills.map((p) => resolveLocalized(p, locale)) : [],
    primary_cta_label: resolveLocalized(block.primary_cta_label, locale),
    primary_cta_href: canonicalOpusPassHref(block.primary_cta_href, fallback?.primary_cta_href ?? '/'),
    secondary_cta_label: resolveLocalized(block.secondary_cta_label, locale),
    secondary_cta_href: canonicalOpusPassHref(block.secondary_cta_href, fallback?.secondary_cta_href ?? '/'),
  }
}

export async function loadHomepageFeaturesContent(
  locale: Locale = DEFAULT_LOCALE
): Promise<HomepageFeaturesContent> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return HOMEPAGE_FEATURES_FALLBACK
  }
  try {
    const { isEnabled: isDraft } = await draftMode()
    const supabase = createSupabaseServerClient()
    const { data } = await supabase
      .from('website_page_sections')
      .select('content, draft_content')
      .eq('page_key', 'opus-pass-homepage')
      .eq('section_key', 'features')
      .maybeSingle()
    const stored = (isDraft ? data?.draft_content ?? data?.content : data?.content) as
      | StoredHomepageFeatures
      | undefined
    if (stored) {
      const F = HOMEPAGE_FEATURES_FALLBACK
      return {
        header_title: resolveLocalized(stored.header_title ?? F.header_title, locale),
        header_description: resolveLocalized(stored.header_description ?? F.header_description, locale),
        blocks:
          stored.blocks && Array.isArray(stored.blocks) && stored.blocks.length > 0
            ? stored.blocks.map((b, i) => resolveBlock(b, locale, i))
            : F.blocks,
      }
    }
    return HOMEPAGE_FEATURES_FALLBACK
  } catch (err) {
    console.error('[opus-pass cms] homepage-features load failed', err)
    return HOMEPAGE_FEATURES_FALLBACK
  }
}
