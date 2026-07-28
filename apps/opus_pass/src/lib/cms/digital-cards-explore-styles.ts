import { draftMode } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabase'
import { DEFAULT_LOCALE, resolveLocalized, type Locale, type MaybeLocalized } from './localized'

export type DigitalCardsExploreStyleLink = {
  id: string
  label: string
  href: string
}

export type DigitalCardsExploreStyleColumn = {
  id: string
  heading: string
  items: DigitalCardsExploreStyleLink[]
}

export type DigitalCardsExploreStylesContent = {
  heading: string
  columns: DigitalCardsExploreStyleColumn[]
}

export const DIGITAL_CARDS_EXPLORE_STYLES_FALLBACK: DigitalCardsExploreStylesContent = {
  heading: 'Explore other styles',
  columns: [
    {
      id: 'col-style', heading: 'By style',
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
      id: 'col-colour', heading: 'By colour',
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
      id: 'col-moment', heading: 'By moment',
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
      id: 'col-special', heading: 'For special days',
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

// Stored shape: translatable fields (the section heading, each column's heading,
// and each link's label) may be a localized { en, sw } object or a legacy plain
// string; the link href is scalar. The loader resolves each translatable field
// for `locale` and returns the flat DigitalCardsExploreStylesContent the render
// path already expects.
type StoredExploreStyleLink = {
  id?: string
  label?: MaybeLocalized
  href?: string
}

type StoredExploreStyleColumn = {
  id?: string
  heading?: MaybeLocalized
  items?: StoredExploreStyleLink[]
}

type StoredExploreStylesContent = {
  heading?: MaybeLocalized
  columns?: StoredExploreStyleColumn[]
}

export async function loadDigitalCardsExploreStylesContent(
  locale: Locale = DEFAULT_LOCALE
): Promise<DigitalCardsExploreStylesContent> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return DIGITAL_CARDS_EXPLORE_STYLES_FALLBACK
  }
  try {
    const { isEnabled: isDraft } = await draftMode()
    const supabase = createSupabaseServerClient()
    const { data } = await supabase
      .from('website_page_sections')
      .select('content, draft_content')
      .eq('page_key', 'opus-pass-invitations')
      .eq('section_key', 'explore-styles')
      .maybeSingle()
    const stored = (isDraft ? data?.draft_content ?? data?.content : data?.content) as
      | StoredExploreStylesContent
      | undefined
    if (stored) {
      const F = DIGITAL_CARDS_EXPLORE_STYLES_FALLBACK
      return {
        heading: resolveLocalized(stored.heading ?? F.heading, locale),
        columns:
          stored.columns && Array.isArray(stored.columns) && stored.columns.length > 0
            ? stored.columns.map((col, ci) => ({
                id: col.id ?? `col-${ci}`,
                heading: resolveLocalized(col.heading, locale),
                items: Array.isArray(col.items)
                  ? col.items.map((link, li) => ({
                      id: link.id ?? `lnk-${ci}-${li}`,
                      label: resolveLocalized(link.label, locale),
                      href: link.href ?? '/digital-cards/catalog',
                    }))
                  : [],
              }))
            : F.columns,
      }
    }
    return DIGITAL_CARDS_EXPLORE_STYLES_FALLBACK
  } catch (err) {
    console.error('[opus-pass cms] digital-cards-explore-styles load failed', err)
    return DIGITAL_CARDS_EXPLORE_STYLES_FALLBACK
  }
}
