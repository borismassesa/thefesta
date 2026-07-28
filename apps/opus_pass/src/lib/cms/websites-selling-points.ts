import { draftMode } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabase'
import { DEFAULT_LOCALE, resolveLocalized, type Locale, type MaybeLocalized } from './localized'

export type WebsitesSellingPointItem = {
  id: string
  headline: string
  body: string
  cta_label: string
  cta_href: string
  image: string
}

export type WebsitesSellingPointsContent = {
  heading: string
  description: string
  items: WebsitesSellingPointItem[]
}

export const WEBSITES_SELLING_POINTS_FALLBACK: WebsitesSellingPointsContent = {
  heading: 'Built to fit your wedding',
  description:
    'Everything you need for a seamless wedding experience, from beautifully designed websites, digital cards, RSVPs, guest updates, registries, and every meaningful moment leading up to your big day.',
  items: [
    {
      id: 'designer-templates',
      headline: 'Designer templates, no tech skills needed',
      body: 'A wide range of designs, ready for you to customize and share.',
      cta_label: 'Explore designs',
      cta_href: '#designs',
      image: '/assets/images/coupleswithpiano.jpg',
    },
    {
      id: 'guests-love',
      headline: 'Websites loved by couples and guests',
      body: "It's the easiest way to keep guests updated and for them to RSVP and shop your registry.",
      cta_label: 'Start website',
      cta_href: '/website-builder',
      image: '/assets/images/mauzo_crew.jpg',
    },
    {
      id: 'match-invitations',
      headline: 'Match your wedding digital cards and save the dates',
      body: 'Whatever your style, our websites are made to match your invites and more.',
      cta_label: 'Explore digital cards',
      cta_href: '/digital-cards',
      image: '/assets/images/flowers_pinky.jpg',
    },
  ],
}

// Stored shape: translatable fields may be a localized { en, sw } object or a
// legacy plain string; non-text fields are scalar. The loader resolves each
// translatable field for `locale` and returns the flat content the render
// components already expect.
type StoredWebsitesSellingPointItem = {
  id?: string
  headline?: MaybeLocalized
  body?: MaybeLocalized
  cta_label?: MaybeLocalized
  cta_href?: string
  image?: string
}

type StoredWebsitesSellingPoints = {
  heading?: MaybeLocalized
  description?: MaybeLocalized
  items?: StoredWebsitesSellingPointItem[]
}

export async function loadWebsitesSellingPointsContent(
  locale: Locale = DEFAULT_LOCALE
): Promise<WebsitesSellingPointsContent> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return WEBSITES_SELLING_POINTS_FALLBACK
  }
  try {
    const { isEnabled: isDraft } = await draftMode()
    const supabase = createSupabaseServerClient()
    const { data } = await supabase
      .from('website_page_sections')
      .select('content, draft_content')
      .eq('page_key', 'opus-pass-websites')
      .eq('section_key', 'selling-points')
      .maybeSingle()
    const stored = (isDraft ? data?.draft_content ?? data?.content : data?.content) as
      | StoredWebsitesSellingPoints
      | undefined
    if (stored) {
      const F = WEBSITES_SELLING_POINTS_FALLBACK
      const items =
        stored.items && Array.isArray(stored.items) && stored.items.length > 0
          ? stored.items
          : F.items
      return {
        heading: resolveLocalized(stored.heading ?? F.heading, locale),
        description: resolveLocalized(stored.description ?? F.description, locale),
        // Route any legacy "start your website" CTA to the builder, even if a
        // stale CMS row still points it at /sign-up.
        items: items.map((it) => ({
          id: it.id ?? '',
          headline: resolveLocalized(it.headline, locale),
          body: resolveLocalized(it.body, locale),
          cta_label: resolveLocalized(it.cta_label, locale),
          cta_href: it.cta_href === '/sign-up' ? '/website-builder' : it.cta_href ?? '',
          image: it.image ?? '',
        })),
      }
    }
    return WEBSITES_SELLING_POINTS_FALLBACK
  } catch (err) {
    console.error('[opus-pass cms] websites-selling-points load failed', err)
    return WEBSITES_SELLING_POINTS_FALLBACK
  }
}
