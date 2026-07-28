import type { MaybeLocalized } from '@/lib/cms/localized'

export type OpusPassExploreStyleLink = {
  id: string
  label: MaybeLocalized
  href: string
}

export type OpusPassExploreStyleColumn = {
  id: string
  heading: MaybeLocalized
  items: OpusPassExploreStyleLink[]
}

export type OpusPassDigitalCardsExploreStylesContent = {
  heading: MaybeLocalized
  columns: OpusPassExploreStyleColumn[]
}

export type OpusPassDigitalCardsExploreStylesRow = {
  id: string
  page_key: string
  section_key: string
  content: OpusPassDigitalCardsExploreStylesContent
  draft_content: OpusPassDigitalCardsExploreStylesContent | null
  is_published: boolean
  updated_at: string
}

export const OPUS_PASS_DIGITAL_CARDS_EXPLORE_STYLES_FALLBACK: OpusPassDigitalCardsExploreStylesContent = {
  heading: 'Explore other styles',
  columns: [
    {
      id: 'col-style',
      heading: 'By style',
      items: [
        { id: 'l1', label: 'Modern', href: '/digital-cards/catalog' },
        { id: 'l2', label: 'Classic', href: '/digital-cards/catalog' },
        { id: 'l3', label: 'Rustic', href: '/digital-cards/catalog' },
        { id: 'l4', label: 'Elegant', href: '/digital-cards/catalog' },
        { id: 'l5', label: 'Heritage Karibu', href: '/digital-cards/catalog' },
        { id: 'l6', label: 'Photo-led', href: '/digital-cards/catalog' },
      ],
    },
    {
      id: 'col-colour',
      heading: 'By colour',
      items: [
        { id: 'c1', label: 'Sage green', href: '/digital-cards/catalog' },
        { id: 'c2', label: 'Navy & gold', href: '/digital-cards/catalog' },
        { id: 'c3', label: 'Blush pink', href: '/digital-cards/catalog' },
        { id: 'c4', label: 'Burgundy', href: '/digital-cards/catalog' },
        { id: 'c5', label: 'Cream & black', href: '/digital-cards/catalog' },
        { id: 'c6', label: 'Coral', href: '/digital-cards/catalog' },
      ],
    },
    {
      id: 'col-moment',
      heading: 'By moment',
      items: [
        { id: 'm1', label: 'Save the date', href: '/digital-cards/catalog' },
        { id: 'm2', label: 'Digital Cards', href: '/digital-cards/catalog' },
        { id: 'm3', label: 'RSVP cards', href: '/digital-cards/catalog' },
        { id: 'm4', label: 'Welcome signs', href: '/digital-cards/catalog' },
        { id: 'm5', label: 'Programmes', href: '/digital-cards/catalog' },
        { id: 'm6', label: 'Thank yous', href: '/digital-cards/catalog' },
      ],
    },
    {
      id: 'col-special',
      heading: 'For special days',
      items: [
        { id: 'd1', label: 'Engagement party', href: '/digital-cards/catalog' },
        { id: 'd2', label: 'Send-off (Kitchen Party)', href: '/digital-cards/catalog' },
        { id: 'd3', label: 'Hen do', href: '/digital-cards/catalog' },
        { id: 'd4', label: 'Rehearsal dinner', href: '/digital-cards/catalog' },
        { id: 'd5', label: 'Reception', href: '/digital-cards/catalog' },
      ],
    },
  ],
}
