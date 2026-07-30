import type { MaybeLocalized } from '@/lib/cms/localized'

export type OpusPassEditorsPicksRowAlign = 'left' | 'right'

export type OpusPassEditorsPicksMediaType = 'image' | 'video'

export type OpusPassEditorsPicksTreatment =
  | 'classic-serif'
  | 'minimal-line'
  | 'modern-block'
  | 'floral-border'
  | 'navy-gold'
  | 'blush-frame'
  | 'sage-panel'
  | 'cultural-red'
  | 'arch-script'
  | 'photo-overlay'
  | 'flat-lay-stationery'
  | 'menu-card'

export const EDITORS_PICKS_TREATMENTS: OpusPassEditorsPicksTreatment[] = [
  'photo-overlay',
  'classic-serif',
  'minimal-line',
  'modern-block',
  'floral-border',
  'navy-gold',
  'blush-frame',
  'sage-panel',
  'cultural-red',
  'arch-script',
  'flat-lay-stationery',
  'menu-card',
]

export type OpusPassEditorsPicksOverlay = 'play' | 'heart' | 'none'

export type OpusPassEditorsPicksPick = {
  id: string
  category: string
  name: string
  /** Original price (TZS) — omit to hide the strikethrough. */
  price_was?: number
  /** Current price (TZS). */
  price_now: number
  swatches: string[]
  /** When set, this image/video is rendered instead of the treatment. */
  media_url?: string
  media_type?: OpusPassEditorsPicksMediaType
  /** Fallback CSS-art visual when no media is uploaded. */
  treatment?: OpusPassEditorsPicksTreatment
  /** Wraps treatments in a small centered card with shadow (used by arch-script/modern-block in the seed). */
  centered?: boolean
  overlay: OpusPassEditorsPicksOverlay
  /** Optional card background colour (hex), e.g. '#A6A8A2'. */
  background?: string
  badge?: string
}

/**
 * Storefront category slugs a row can be pinned to. These are the slugs in
 * opus_pass/src/data/digital-cards-categories.ts — stored verbatim, so they are
 * data, not labels.
 */
export const EDITORS_PICKS_CATEGORY_SLUGS = [
  'kadi-za-michango',
  'save-the-date',
  'wedding',
  'send-off',
  'kitchen-party',
  'anniversary',
  'communion',
  'birthday',
  'gala-dinner',
  'muslim-wedding',
] as const

export type OpusPassEditorsPicksCategorySlug = (typeof EDITORS_PICKS_CATEGORY_SLUGS)[number]

export const EDITORS_PICKS_CATEGORY_LABELS: Record<OpusPassEditorsPicksCategorySlug, string> = {
  'kadi-za-michango': 'Pledges (kadi za michango)',
  'save-the-date': 'Save the dates',
  wedding: 'Wedding',
  'send-off': 'Send-off',
  'kitchen-party': 'Kitchen party',
  anniversary: 'Anniversary',
  communion: 'Communion',
  birthday: 'Birthday',
  'gala-dinner': 'Gala dinner',
  'muslim-wedding': 'Muslim wedding',
}

export type OpusPassEditorsPicksRow = {
  id: string
  title_line_1: MaybeLocalized
  title_line_2: MaybeLocalized
  align: OpusPassEditorsPicksRowAlign
  /**
   * When set, the live row shows cards from this storefront category only and
   * its "Explore designs" button links to that category page. Leave blank to
   * fall back to the next unused cards in catalog order.
   */
  category_slug?: string
  picks: OpusPassEditorsPicksPick[]
}

export type OpusPassDigitalCardsEditorsPicksContent = {
  rows: OpusPassEditorsPicksRow[]
  exploreLabel: MaybeLocalized
}

export type OpusPassDigitalCardsEditorsPicksRowSection = {
  id: string
  page_key: string
  section_key: string
  content: OpusPassDigitalCardsEditorsPicksContent
  draft_content: OpusPassDigitalCardsEditorsPicksContent | null
  is_published: boolean
  updated_at: string
}

export const OPUS_PASS_DIGITAL_CARDS_EDITORS_PICKS_FALLBACK: OpusPassDigitalCardsEditorsPicksContent =
  {
    exploreLabel: 'Explore designs',
    rows: [
      {
        id: 'row-save-the-dates',
        title_line_1: 'Save the dates',
        title_line_2: 'your guests will remember',
        align: 'left',
        category_slug: 'save-the-date',
        picks: [
          { id: 'e4', category: 'Save the Dates', name: 'Two of Us Photo Save the Date Cards', price_was: 195000, price_now: 117000, swatches: ['#1A1A1A', '#F5EFE3', '#7A1F2B', '#A6B89A'], treatment: 'photo-overlay', overlay: 'play' },
          { id: 'e5', category: 'Save the Dates', name: 'Authentic Portrait Video Save the Date', price_was: 215000, price_now: 129000, swatches: ['#1A1A1A', '#7A1F2B', '#F5EFE3', '#C8A35C'], media_url: '/assets/images/authentic_couple.jpg', media_type: 'image', overlay: 'play' },
          { id: 'e6', category: 'Save the Dates', name: 'Modern Suite Save the Date Set', price_now: 145000, swatches: ['#F5EFE3', '#1A1A1A', '#A6B89A', '#7A1F2B'], treatment: 'flat-lay-stationery', overlay: 'none', background: '#A6A8A2' },
        ],
      },
      {
        id: 'row-wedding',
        title_line_1: 'Wedding invites',
        title_line_2: 'for the main event',
        align: 'right',
        category_slug: 'wedding',
        picks: [
          { id: 'e7', category: 'Wedding Invitations', name: 'Botanical Frame Invitation Suite', price_was: 198000, price_now: 119000, swatches: ['#A6B89A', '#F5DCE2', '#FBF7F2', '#1A1A1A', '#7A1F2B'], treatment: 'floral-border', overlay: 'heart' },
          { id: 'e8', category: 'Wedding Invitations', name: 'Navy & Gold Editorial Invitations', price_was: 225000, price_now: 135000, swatches: ['#1E2D54', '#E8D9A7', '#F5EFE3', '#C8A35C'], treatment: 'navy-gold', overlay: 'play' },
          { id: 'e9', category: 'Wedding Invitations', name: 'Arch Script Bagamoyo Invitations', price_now: 132000, swatches: ['#7A1F2B', '#F5EFE3', '#A6B89A'], treatment: 'arch-script', centered: true, overlay: 'none', background: '#CFE6F1' },
        ],
      },
      {
        id: 'row-sendoff',
        title_line_1: 'Send-off cards',
        title_line_2: 'that honour the tradition',
        align: 'left',
        category_slug: 'send-off',
        picks: [
          { id: 'e10', category: 'Sendoff', name: 'Heritage Crown Kuaga Cards', price_was: 245000, price_now: 147000, swatches: ['#7A1F2B', '#C8A35C', '#F5EFE3', '#1A1A1A'], treatment: 'cultural-red', overlay: 'heart' },
          { id: 'e11', category: 'Sendoff', name: 'Botanical Send-off Cards', price_was: 185000, price_now: 111000, swatches: ['#A6B89A', '#F5DCE2', '#FBF7F2', '#7A1F2B'], media_url: '/assets/images/flowers_pinky.jpg', media_type: 'image', overlay: 'play' },
          { id: 'e12', category: 'Sendoff', name: 'Modern Block Send-off Cards', price_now: 198000, swatches: ['#1A1A1A', '#FBF7F2', '#E8D9A7', '#C8A35C'], treatment: 'modern-block', centered: true, overlay: 'none', background: '#FBF7F2' },
        ],
      },
      {
        id: 'row-kitchen-party',
        title_line_1: 'Kitchen party cards',
        title_line_2: 'that set the tone',
        align: 'right',
        category_slug: 'kitchen-party',
        picks: [
          { id: 'e13', category: 'Kitchen Party', name: 'Blush Frame Kitchen Party Cards', price_was: 145000, price_now: 87000, swatches: ['#F5DCE2', '#A84F66', '#7A1F2B', '#FBF7F2'], treatment: 'blush-frame', overlay: 'heart' },
          { id: 'e14', category: 'Kitchen Party', name: 'Botanical Kitchen Party Cards', price_now: 92000, swatches: ['#A6B89A', '#F5DCE2', '#FBF7F2', '#7A1F2B'], media_url: '/assets/images/flowers_pinky.jpg', media_type: 'image', overlay: 'none' },
          { id: 'e15', category: 'Kitchen Party', name: 'Arch Script Kitchen Party Cards', price_was: 118000, price_now: 71000, swatches: ['#7A1F2B', '#F5EFE3', '#A6B89A'], treatment: 'arch-script', centered: true, overlay: 'none', background: '#F5EFE3' },
        ],
      },
    ],
  }
