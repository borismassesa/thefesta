import type { MaybeLocalized } from '@/lib/cms/localized'

export type OpusPassDigitalCardsFeatureVisual = 'invitations' | 'phone' | 'envelope'

export type OpusPassDigitalCardsFeatureCard = {
  id: string
  title: MaybeLocalized
  body: MaybeLocalized
  cta_label: MaybeLocalized
  cta_href: string
  /** When set, renders this image instead of the built-in `visual` component. */
  image_url?: string
  visual: OpusPassDigitalCardsFeatureVisual
}

export type OpusPassDigitalCardsFeaturesContent = {
  heading: MaybeLocalized
  subheading?: MaybeLocalized
  cards: OpusPassDigitalCardsFeatureCard[]
}

export type OpusPassDigitalCardsFeaturesRow = {
  id: string
  page_key: string
  section_key: string
  content: OpusPassDigitalCardsFeaturesContent
  draft_content: OpusPassDigitalCardsFeaturesContent | null
  is_published: boolean
  updated_at: string
}

export const DIGITAL_CARDS_FEATURE_VISUALS: OpusPassDigitalCardsFeatureVisual[] = [
  'invitations',
  'phone',
  'envelope',
]

export const OPUS_PASS_DIGITAL_CARDS_FEATURES_FALLBACK: OpusPassDigitalCardsFeaturesContent = {
  heading: 'Wedding stationery made easy, from invite to seat',
  subheading:
    'From invite to seating, beautifully organized. Track confirmations, plus-ones, and special-guest notes in one live dashboard.',
  cards: [
    {
      id: 'guest-list',
      title: 'Free guest list, free RSVPs',
      body: 'Track every yes, every plus-one, every dietary need. Free with every OpusFesta wedding.',
      cta_label: 'Open my guest list',
      cta_href: '/my/guests',
      visual: 'invitations',
    },
    {
      id: 'matching-website',
      title: 'Free matching website',
      body: 'Pick an invitation, get a wedding website to match — bilingual RSVP form built in, ready to share.',
      cta_label: 'Find your match',
      cta_href: '/my/planning',
      visual: 'phone',
    },
    {
      id: 'guest-addressing',
      title: 'Easy guest addressing',
      body: 'Save addresses against names. We pull them onto envelopes when you order — handwritten or printed.',
      cta_label: 'Get started',
      cta_href: '/my/guests',
      visual: 'envelope',
    },
  ],
}
