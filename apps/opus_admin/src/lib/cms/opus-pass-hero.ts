import type { MaybeLocalized } from '@/lib/cms/localized'

export type OpusPassHeroContent = {
  // Translatable text — stored as { en, sw } (or a legacy plain string).
  headline_line_1: MaybeLocalized
  headline_line_2: MaybeLocalized
  description: MaybeLocalized
  primary_cta_label: MaybeLocalized
  secondary_cta_label: MaybeLocalized
  // Non-translatable config.
  primary_cta_href: string
  secondary_cta_href: string
  trust_count: string
  rating: string
  avatars: string[]
  featured_in: string[]
  featured_in_label: MaybeLocalized
}

export type OpusPassHeroRow = {
  id: string
  page_key: string
  section_key: string
  content: OpusPassHeroContent
  draft_content: OpusPassHeroContent | null
  is_published: boolean
  updated_at: string
}

export const OPUS_PASS_HERO_FALLBACK: OpusPassHeroContent = {
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
