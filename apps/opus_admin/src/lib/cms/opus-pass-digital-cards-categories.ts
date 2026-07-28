import type { MaybeLocalized } from '@/lib/cms/localized'

export type OpusPassDigitalCardCategory = {
  slug: string
  label: MaybeLocalized
  img: string
  alt: MaybeLocalized
  /** Subtitle shown beneath the category title on the category page. */
  subtitle: MaybeLocalized
  /** Substrings to match against `product.category` (case-insensitive). */
  product_matchers: string[]
}

export type OpusPassDigitalCardsCategoriesContent = {
  heading: MaybeLocalized
  description: MaybeLocalized
  categories: OpusPassDigitalCardCategory[]
}

export type OpusPassDigitalCardsCategoriesRow = {
  id: string
  page_key: string
  section_key: string
  content: OpusPassDigitalCardsCategoriesContent
  draft_content: OpusPassDigitalCardsCategoriesContent | null
  is_published: boolean
  updated_at: string
}

export const OPUS_PASS_DIGITAL_CARDS_CATEGORIES_FALLBACK: OpusPassDigitalCardsCategoriesContent = {
  heading: 'Digital Cards for Every Moment',
  description:
    'Pick one design once, and every card across your day matches your suite. No mixing fonts, no clashing palettes, no last-minute hunt for matching paper.',
  categories: [
    { slug: 'wedding', label: 'Wedding', img: '/assets/images/churchcouples.jpg', alt: 'Wedding ceremony', subtitle: 'The main event invite — bilingual, fully customisable, and designed for Tanzanian celebrations from Bagamoyo to Mwanza.', product_matchers: ['Wedding Invitations', 'All-in-One Wedding', 'Wedding'] },
    { slug: 'send-off', label: 'Sendoff', img: '/assets/images/couples_together.jpg', alt: 'Sendoff', subtitle: 'Honour the Kuaga tradition with a card that reflects the moment. From the bride’s family to every guest invited to bless the journey.', product_matchers: ['Send-Off', 'Sendoff'] },
    { slug: 'kitchen-party', label: 'Kitchen party', img: '/assets/images/flowers_pinky.jpg', alt: 'Kitchen party — bridal shower florals', subtitle: 'Set the tone for the bridal shower. Playful designs the wadada will save, share, and screenshot — without losing the family elegance.', product_matchers: ['Bridal Shower', 'Kitchen Party'] },
    { slug: 'save-the-date', label: 'Save the date', img: '/assets/images/beautiful_bride.jpg', alt: 'Save the date', subtitle: 'Announce your date in style. Sent by WhatsApp or SMS, opened by every guest before the formal invite arrives.', product_matchers: ['Save the Date'] },
    { slug: 'kadi-za-michango', label: 'Kadi za michango', img: '/assets/images/coupleswithpiano.jpg', alt: 'Kadi za michango', subtitle: 'Coordinate contributions and family meetings with formal, dignified designs. Built for the planning the rest of the world never sees.', product_matchers: ['Michango', 'Vikao'] },
    { slug: 'anniversary', label: 'Anniversary', img: '/assets/images/ring_piano.jpg', alt: 'Anniversary', subtitle: 'Mark the years together with an invite as enduring as the milestone. From a quiet dinner to a full vow renewal.', product_matchers: ['Anniversary'] },
    { slug: 'communio', label: 'Communio', img: '/assets/images/bridering.jpg', alt: 'Communio', subtitle: 'Celebrate First Communion and other sacraments with reverent, family-centred designs in Swahili or English.', product_matchers: ['Communion', 'Communio'] },
    { slug: 'birthday', label: 'Birthday', img: '/assets/images/cutesy_couple.jpg', alt: 'Birthday', subtitle: 'From a child’s first party to a milestone year, invites that set the mood and reach every guest by WhatsApp or SMS.', product_matchers: ['Birthday'] },
    { slug: 'gala-dinner', label: 'Gala Dinner', img: '/assets/images/authentic_couple.jpg', alt: 'Gala Dinner', subtitle: 'Formal invitations for fundraisers, awards nights, and corporate galas — with RSVP and live guest list included.', product_matchers: ['Gala'] },
    { slug: 'muslim-wedding', label: 'Muslim Wedding', img: '/assets/images/bride_umbrella.jpg', alt: 'Muslim Wedding', subtitle: 'Nikah and walima invites that honour the occasion — bilingual designs crafted for Tanzanian Muslim celebrations.', product_matchers: ['Muslim Wedding', 'Nikah', 'Walima'] },
  ],
}
