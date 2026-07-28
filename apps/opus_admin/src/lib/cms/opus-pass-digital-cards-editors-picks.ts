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

export type OpusPassEditorsPicksRow = {
  id: string
  title_line_1: MaybeLocalized
  title_line_2: MaybeLocalized
  align: OpusPassEditorsPicksRowAlign
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
        id: 'row-1',
        title_line_1: 'Save the dates',
        title_line_2: 'worth saving',
        align: 'left',
        picks: [
          { id: 'e1', category: 'Save the Dates', name: 'Two of Us Photo Save the Date Cards', price_was: 195000, price_now: 117000, swatches: ['#1A1A1A', '#F5EFE3', '#7A1F2B', '#A6B89A'], treatment: 'photo-overlay', overlay: 'play' },
          { id: 'e2', category: 'Save the Dates', name: 'Authentic Portrait Video Save the Date', price_was: 215000, price_now: 129000, swatches: ['#1A1A1A', '#7A1F2B', '#F5EFE3', '#C8A35C'], media_url: '/assets/images/authentic_couple.jpg', media_type: 'image', overlay: 'play' },
          { id: 'e3', category: 'Save the Dates', name: 'Modern Suite Save the Date Set', price_now: 145000, swatches: ['#F5EFE3', '#1A1A1A', '#A6B89A', '#7A1F2B'], treatment: 'flat-lay-stationery', overlay: 'none', background: '#A6A8A2' },
        ],
      },
      {
        id: 'row-2',
        title_line_1: 'Invite & RSVPs',
        title_line_2: 'for every wedding style',
        align: 'right',
        picks: [
          { id: 'e4', category: 'Wedding Invitations', name: 'Botanical Frame Invitation Suite', price_was: 198000, price_now: 119000, swatches: ['#A6B89A', '#F5DCE2', '#FBF7F2', '#1A1A1A', '#7A1F2B'], treatment: 'floral-border', overlay: 'heart' },
          { id: 'e5', category: 'Wedding Invitations', name: 'Navy & Gold Editorial Invitations', price_was: 225000, price_now: 135000, swatches: ['#1E2D54', '#E8D9A7', '#F5EFE3', '#C8A35C'], treatment: 'navy-gold', overlay: 'play' },
          { id: 'e6', category: 'Wedding Invitations', name: 'Arch Script Bagamoyo Invitations', price_now: 132000, swatches: ['#7A1F2B', '#F5EFE3', '#A6B89A'], treatment: 'arch-script', centered: true, overlay: 'none', background: '#CFE6F1' },
        ],
      },
      {
        id: 'row-3',
        title_line_1: 'Matching suites',
        title_line_2: 'and day-of paper',
        align: 'left',
        picks: [
          { id: 'e7', category: 'Reception Cards', name: 'Sage Panel Reception Suite', price_was: 168000, price_now: 101000, swatches: ['#A6B89A', '#FBF7F2', '#5C6B4D'], treatment: 'sage-panel', overlay: 'heart' },
          { id: 'e8', category: 'Day-of Paper Set', name: 'Botanical Day-of Paper Bundle', price_now: 155000, swatches: ['#A6B89A', '#F5DCE2', '#FBF7F2', '#7A1F2B'], media_url: '/assets/images/flowers_pinky.jpg', media_type: 'image', overlay: 'none' },
          { id: 'e9', category: 'Menu Cards', name: 'Karibu Reception Menu Cards', price_was: 89000, price_now: 53000, swatches: ['#7A1F2B', '#F5EFE3', '#A6B89A', '#C8A35C'], treatment: 'menu-card', overlay: 'play', background: '#F5EFE3' },
        ],
      },
      {
        id: 'row-4',
        title_line_1: 'Premium quality,',
        title_line_2: 'perfectly priced',
        align: 'right',
        picks: [
          { id: 'e10', category: 'Wedding Invitations', name: 'Heritage Crown Karibu Invitations', price_was: 245000, price_now: 147000, swatches: ['#7A1F2B', '#C8A35C', '#F5EFE3', '#1A1A1A'], treatment: 'cultural-red', overlay: 'heart' },
          { id: 'e11', category: 'Save the Dates', name: 'Ring Detail Foil Save the Date', price_was: 185000, price_now: 111000, swatches: ['#C8A35C', '#F5EFE3', '#1A1A1A'], media_url: '/assets/images/hand_rings.jpg', media_type: 'image', overlay: 'play' },
          { id: 'e12', category: 'Foil & Letterpress', name: 'Modern Block Foil Invitations', price_now: 198000, swatches: ['#1A1A1A', '#FBF7F2', '#E8D9A7', '#C8A35C'], treatment: 'modern-block', centered: true, overlay: 'none', background: '#FBF7F2', badge: 'Foil & Letterpress' },
        ],
      },
    ],
  }
