import type { MaybeLocalized } from '@/lib/cms/localized'

export type OpusPassDigitalCardsFeaturedSuiteContent = {
  image_url: string
  headline_line_1: MaybeLocalized
  headline_line_2: MaybeLocalized
  body: MaybeLocalized
  primary_cta_label: MaybeLocalized
  primary_cta_href: string
  secondary_cta_label: MaybeLocalized
  secondary_cta_href: string
  trust_strip: MaybeLocalized[]
}

export type OpusPassDigitalCardsFeaturedSuiteRow = {
  id: string
  page_key: string
  section_key: string
  content: OpusPassDigitalCardsFeaturedSuiteContent
  draft_content: OpusPassDigitalCardsFeaturedSuiteContent | null
  is_published: boolean
  updated_at: string
}

export const OPUS_PASS_DIGITAL_CARDS_FEATURED_SUITE_FALLBACK: OpusPassDigitalCardsFeaturedSuiteContent = {
  image_url: '/assets/images/couples_together.jpg',
  headline_line_1: 'From Save the Date',
  headline_line_2: 'to Thank You',
  body:
    'Customise the designs with your names, date, and colours. Send to every guest in seconds by WhatsApp or SMS, and watch RSVPs land in real time. Optional paper prints for elders & VIPs.',
  primary_cta_label: 'Start designing',
  primary_cta_href: '/digital-cards/catalog',
  secondary_cta_label: 'See how it works',
  secondary_cta_href: '/digital-cards/catalog',
  trust_strip: [
    'Share via WhatsApp & SMS',
    'Live RSVP tracking',
    'Pay with M-Pesa or Airtel',
  ],
}
