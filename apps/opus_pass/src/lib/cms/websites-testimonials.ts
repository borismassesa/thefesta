import { draftMode } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabase'
import { DEFAULT_LOCALE, resolveLocalized, type Locale, type MaybeLocalized } from './localized'

// Mirrors HomepageTestimonialsContent so it can be passed straight to the shared
// <DigitalCardShowcase> wall on /websites — two scrolling columns of cards.
export type WebsitesTestimonialFg = 'light' | 'dark'

export type WebsitesTestimonialItem = {
  id: string
  quote: string
  name: string
  location: string
  avatar: string
  bg: string
  fg: WebsitesTestimonialFg
}

export type WebsitesTestimonialsContent = {
  headline: string
  description: string
  cta_label: string
  cta_href: string
  column1: WebsitesTestimonialItem[]
  column2: WebsitesTestimonialItem[]
}

export const WEBSITES_TESTIMONIALS_FALLBACK: WebsitesTestimonialsContent = {
  headline: 'Couples who built their site with OpusPass.',
  description:
    'One link, every detail — see how couples shared their story, venue and live updates with a free OpusPass wedding website.',
  cta_label: 'Read more stories',
  cta_href: '/reviews',
  column1: [
    { id: 'wc1-a', quote: 'Our wedding website was up the same day. Guests loved the photo gallery and travel info.', name: 'Rehema & Bakari', location: 'Dar es Salaam', avatar: '/assets/images/cutesy_couple.jpg', bg: 'bg-[#5d3a78]', fg: 'dark' },
    { id: 'wc1-b', quote: 'Bilingual pages meant both sides of the family felt at home — and it was completely free.', name: 'Faith & Daniel', location: 'Arusha', avatar: '/assets/images/authentic_couple.jpg', bg: 'bg-[#fbeede]', fg: 'light' },
    { id: 'wc1-c', quote: 'We changed the venue once and the site updated instantly. No reprints, no panic.', name: 'Neema & Amani', location: 'Bagamoyo', avatar: '/assets/images/coupleswithpiano.jpg', bg: 'bg-[#3f6b3f]', fg: 'dark' },
    { id: 'wc1-d', quote: 'From save-the-date to thank-yous, every page matched our digital cards beautifully.', name: 'Joyce & Mwita', location: 'Mwanza', avatar: '/assets/images/churchcouples.jpg', bg: 'bg-[#e7c8c8]', fg: 'light' },
  ],
  column2: [
    { id: 'wc2-a', quote: 'One link in our WhatsApp groups and everyone had the schedule, the map and the RSVP.', name: 'Shirima & Joyce', location: 'Zanzibar', avatar: '/assets/images/beautiful_bride.jpg', bg: 'bg-[#c47a3a]', fg: 'dark' },
    { id: 'wc2-b', quote: 'The registry link sat right on the site, so gifting was effortless for our guests.', name: 'Grace & Peter', location: 'Moshi', avatar: '/assets/images/bride_umbrella.jpg', bg: 'bg-[#e8d4f2]', fg: 'light' },
    { id: 'wc2-c', quote: 'Live updates on the site meant no last-minute phone calls. Everyone just checked the link.', name: 'Esther & Tumaini', location: 'Tanga', avatar: '/assets/images/brideincar.jpg', bg: 'bg-[#1f4a47]', fg: 'dark' },
    { id: 'wc2-d', quote: 'A beautiful site in minutes, free with our pass. Our guests kept asking how we did it.', name: 'Zawadi & Emmanuel', location: 'Morogoro', avatar: '/assets/images/beautyinbride.jpg', bg: 'bg-[#fbeede]', fg: 'light' },
  ],
}

// Stored shape: translatable fields may be a localized { en, sw } object or a
// legacy plain string; proper names, places and config stay scalar. The loader
// resolves each translatable field for `locale` and returns the flat content the
// shared <DigitalCardShowcase> wall already expects.
type StoredWebsitesTestimonialItem = {
  id?: string
  quote?: MaybeLocalized
  name?: string
  location?: string
  avatar?: string
  bg?: string
  fg?: WebsitesTestimonialFg
}

type StoredWebsitesTestimonials = {
  headline?: MaybeLocalized
  description?: MaybeLocalized
  cta_label?: MaybeLocalized
  cta_href?: string
  column1?: StoredWebsitesTestimonialItem[]
  column2?: StoredWebsitesTestimonialItem[]
}

function resolveColumn(
  items: StoredWebsitesTestimonialItem[],
  locale: Locale
): WebsitesTestimonialItem[] {
  return items.map((it) => ({
    id: it.id ?? '',
    quote: resolveLocalized(it.quote, locale),
    name: it.name ?? '',
    location: it.location ?? '',
    avatar: it.avatar ?? '',
    bg: it.bg ?? 'bg-white',
    fg: it.fg ?? 'light',
  }))
}

export async function loadWebsitesTestimonialsContent(
  locale: Locale = DEFAULT_LOCALE
): Promise<WebsitesTestimonialsContent> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return WEBSITES_TESTIMONIALS_FALLBACK
  }
  try {
    const { isEnabled: isDraft } = await draftMode()
    const supabase = createSupabaseServerClient()
    const { data } = await supabase
      .from('website_page_sections')
      .select('content, draft_content')
      .eq('page_key', 'opus-pass-websites')
      .eq('section_key', 'testimonials')
      .maybeSingle()
    const stored = (isDraft ? data?.draft_content ?? data?.content : data?.content) as
      | StoredWebsitesTestimonials
      | undefined
    if (stored) {
      const F = WEBSITES_TESTIMONIALS_FALLBACK
      return {
        headline: resolveLocalized(stored.headline ?? F.headline, locale),
        description: resolveLocalized(stored.description ?? F.description, locale),
        cta_label: resolveLocalized(stored.cta_label ?? F.cta_label, locale),
        cta_href: stored.cta_href ?? F.cta_href,
        column1:
          stored.column1 && Array.isArray(stored.column1) && stored.column1.length > 0
            ? resolveColumn(stored.column1, locale)
            : F.column1,
        column2:
          stored.column2 && Array.isArray(stored.column2) && stored.column2.length > 0
            ? resolveColumn(stored.column2, locale)
            : F.column2,
      }
    }
    return WEBSITES_TESTIMONIALS_FALLBACK
  } catch (err) {
    console.error('[opus-pass cms] websites-testimonials load failed', err)
    return WEBSITES_TESTIMONIALS_FALLBACK
  }
}
