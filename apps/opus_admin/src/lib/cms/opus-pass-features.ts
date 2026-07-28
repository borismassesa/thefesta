import type { MaybeLocalized } from '@/lib/cms/localized'

export type OpusPassFeatureBlock = {
  id: string
  reverse: boolean
  media_main: string
  media_secondary: string
  media_overlay: string
  // Translatable copy.
  overlay_eyebrow: MaybeLocalized
  overlay_caption_line_1: MaybeLocalized
  overlay_caption_line_2: MaybeLocalized
  headline_line_1: MaybeLocalized
  headline_line_2: MaybeLocalized
  body: MaybeLocalized
  pills: MaybeLocalized[]
  primary_cta_label: MaybeLocalized
  secondary_cta_label: MaybeLocalized
  // Non-translatable config (hrefs).
  primary_cta_href: string
  secondary_cta_href: string
}

export type OpusPassFeaturesContent = {
  header_title: MaybeLocalized
  header_description: MaybeLocalized
  blocks: OpusPassFeatureBlock[]
}

export type OpusPassFeaturesRow = {
  id: string
  page_key: string
  section_key: string
  content: OpusPassFeaturesContent
  draft_content: OpusPassFeaturesContent | null
  is_published: boolean
  updated_at: string
}

export const OPUS_PASS_FEATURES_FALLBACK: OpusPassFeaturesContent = {
  header_title: 'Built for every wedding moment',
  header_description:
    'Three tools that turn save-the-dates to the final seating chart, OpusPass keeps every guest, message, and detail in sync.',
  blocks: [
    {
      id: 'invitations',
      reverse: false,
      media_main: '/assets/images/cutesy_couple.jpg',
      media_secondary: '/assets/images/flowers_pinky.jpg',
      media_overlay: '/assets/images/authentic_couple.jpg',
      overlay_eyebrow: 'Invites',
      overlay_caption_line_1: 'Tap, RSVP,',
      overlay_caption_line_2: 'done.',
      headline_line_1: 'Designer-worthy',
      headline_line_2: 'digital cards',
      body: 'For save-the-dates, weddings, kitchen parties and send-offs. Delivered by WhatsApp or SMS, with RSVP built in.',
      pills: ['Save the Dates', 'Wedding Invites', 'Kitchen Party', 'Send-Off'],
      primary_cta_label: 'Browse designs',
      primary_cta_href: '/digital-cards/catalog',
      secondary_cta_label: 'See pricing',
      secondary_cta_href: '/pricing',
    },
    {
      id: 'guests',
      reverse: true,
      media_main: '/assets/images/mauzo_crew.jpg',
      media_secondary: '/assets/images/churchcouples.jpg',
      media_overlay: '/assets/images/couples_together.jpg',
      overlay_eyebrow: 'Guests',
      overlay_caption_line_1: 'Every guest,',
      overlay_caption_line_2: 'every RSVP.',
      headline_line_1: 'Your guest list',
      headline_line_2: 'and live RSVPs',
      body: 'Manage your guest list, send invites by WhatsApp or SMS, and watch responses come in live. Send reminders, finalise seating, no spreadsheets needed.',
      pills: ['Guest list', 'Live RSVPs', 'Auto reminders', 'Seating chart'],
      primary_cta_label: 'Manage guests',
      primary_cta_href: '/guests-and-rsvp',
      secondary_cta_label: 'How it works',
      secondary_cta_href: '/guests-and-rsvp',
    },
    {
      id: 'website',
      reverse: false,
      media_main: '/assets/images/coupleswithpiano.jpg',
      media_secondary: '/assets/images/beautiful_bride.jpg',
      media_overlay: '/assets/images/bride_umbrella.jpg',
      overlay_eyebrow: 'Website',
      overlay_caption_line_1: 'One link.',
      overlay_caption_line_2: 'Every detail.',
      headline_line_1: 'A wedding site',
      headline_line_2: 'in minutes',
      body: 'Share your story, venue, travel info and live updates — your guests just tap a single link from their phones. Change anything once and the world sees it instantly.',
      pills: ['Custom link', 'Photo gallery', 'Travel info', 'Live updates'],
      primary_cta_label: 'Build your website',
      primary_cta_href: '/websites',
      secondary_cta_label: 'See examples',
      secondary_cta_href: '/websites',
    },
  ],
}
