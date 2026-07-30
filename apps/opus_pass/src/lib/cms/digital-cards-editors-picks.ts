import { draftMode } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabase'
import type { CatalogProduct } from '@/data/digital-cards-products'
import {
  DIGITAL_CARD_CATEGORIES,
  filterProductsByCategory,
  type DigitalCardCategory,
} from '@/data/digital-cards-categories'
import { DEFAULT_LOCALE, resolveLocalized, type Locale, type MaybeLocalized } from './localized'

export type DigitalCardsEditorsPicksRowAlign = 'left' | 'right'

export type DigitalCardsEditorsPicksMediaType = 'image' | 'video'

export type DigitalCardsEditorsPicksTreatment =
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

export type DigitalCardsEditorsPicksOverlay = 'play' | 'heart' | 'none'

export type DigitalCardsEditorsPicksPick = {
  id: string
  /** Catalog product ID (p1, p2, …) — used to build the /digital-cards/p/:id link */
  product_id?: string
  category: string
  /** Locale-resolved display text for `category` — see Product.categoryLabel. */
  categoryLabel?: string
  name: string
  price_was?: number
  price_now: number
  /** Per-digital-card price. Its presence (with a `fromGuestPrice`) selects the per-guest "from" pricing shown for real catalog products. */
  digital_unit_price?: number
  swatches: string[]
  media_url?: string
  media_type?: DigitalCardsEditorsPicksMediaType
  treatment?: DigitalCardsEditorsPicksTreatment
  centered?: boolean
  overlay: DigitalCardsEditorsPicksOverlay
  background?: string
  badge?: string
}

export type DigitalCardsEditorsPicksRow = {
  id: string
  title_line_1: string
  title_line_2: string
  align: DigitalCardsEditorsPicksRowAlign
  /**
   * Storefront category slug (see data/digital-cards-categories.ts) this row is
   * about. When set, the row is filled with cards from that category only and
   * its "Explore designs" button links to the category page. Omit to fall back
   * to the next unused cards in catalog order.
   */
  category_slug?: string
  picks: DigitalCardsEditorsPicksPick[]
}

export type DigitalCardsEditorsPicksContent = {
  rows: DigitalCardsEditorsPicksRow[]
  exploreLabel: string
}

// Row order follows the wedding timeline: save the dates → the wedding invite →
// the send-off → the kitchen party.
export const DIGITAL_CARDS_EDITORS_PICKS_FALLBACK: DigitalCardsEditorsPicksContent = {
  exploreLabel: 'Explore designs',
  rows: [
    {
      id: 'row-save-the-dates', title_line_1: 'Save the dates', title_line_2: 'your guests will remember', align: 'left',
      category_slug: 'save-the-date',
      picks: [
        { id: 'e4', product_id: 'p9',  category: 'Save the Dates', name: 'Two of Us Photo Save the Date Cards', price_was: 195000, price_now: 117000, swatches: ['#1A1A1A', '#F5EFE3', '#7A1F2B', '#A6B89A'], treatment: 'photo-overlay', overlay: 'play' },
        { id: 'e5', product_id: 'p17', category: 'Save the Dates', name: 'Authentic Portrait Video Save the Date', price_was: 215000, price_now: 129000, swatches: ['#1A1A1A', '#7A1F2B', '#F5EFE3', '#C8A35C'], media_url: '/assets/images/authentic_couple.jpg', media_type: 'image', overlay: 'play' },
        { id: 'e6', product_id: 'p4',  category: 'Save the Dates', name: 'Modern Suite Save the Date Set', price_now: 145000, swatches: ['#F5EFE3', '#1A1A1A', '#A6B89A', '#7A1F2B'], treatment: 'flat-lay-stationery', overlay: 'none', background: '#A6A8A2' },
      ],
    },
    {
      id: 'row-wedding', title_line_1: 'Wedding invites', title_line_2: 'for the main event', align: 'right',
      category_slug: 'wedding',
      picks: [
        { id: 'e7', product_id: 'p1',  category: 'Wedding Invitations', name: 'Botanical Frame Invitation Suite', price_was: 198000, price_now: 119000, swatches: ['#A6B89A', '#F5DCE2', '#FBF7F2', '#1A1A1A', '#7A1F2B'], treatment: 'floral-border', overlay: 'heart' },
        { id: 'e8', product_id: 'p6',  category: 'Wedding Invitations', name: 'Navy & Gold Editorial Invitations', price_was: 225000, price_now: 135000, swatches: ['#1E2D54', '#E8D9A7', '#F5EFE3', '#C8A35C'], treatment: 'navy-gold', overlay: 'play' },
        { id: 'e9', product_id: 'p19', category: 'Wedding Invitations', name: 'Arch Script Bagamoyo Invitations', price_now: 132000, swatches: ['#7A1F2B', '#F5EFE3', '#A6B89A'], treatment: 'arch-script', centered: true, overlay: 'none', background: '#CFE6F1' },
      ],
    },
    {
      id: 'row-sendoff', title_line_1: 'Send-off cards', title_line_2: 'that honour the tradition', align: 'left',
      category_slug: 'send-off',
      picks: [
        { id: 'e10', product_id: 'p2',  category: 'Sendoff', name: 'Heritage Crown Kuaga Cards', price_was: 245000, price_now: 147000, swatches: ['#7A1F2B', '#C8A35C', '#F5EFE3', '#1A1A1A'], treatment: 'cultural-red', overlay: 'heart' },
        { id: 'e11', product_id: 'p11', category: 'Sendoff', name: 'Botanical Send-off Cards', price_was: 185000, price_now: 111000, swatches: ['#A6B89A', '#F5DCE2', '#FBF7F2', '#7A1F2B'], media_url: '/assets/images/flowers_pinky.jpg', media_type: 'image', overlay: 'play' },
        { id: 'e12', product_id: 'p3',  category: 'Sendoff', name: 'Modern Block Send-off Cards', price_now: 198000, swatches: ['#1A1A1A', '#FBF7F2', '#E8D9A7', '#C8A35C'], treatment: 'modern-block', centered: true, overlay: 'none', background: '#FBF7F2' },
      ],
    },
    {
      id: 'row-kitchen-party', title_line_1: 'Kitchen party cards', title_line_2: 'that set the tone', align: 'right',
      category_slug: 'kitchen-party',
      picks: [
        { id: 'e13', product_id: 'p8',  category: 'Kitchen Party', name: 'Blush Frame Kitchen Party Cards', price_was: 145000, price_now: 87000, swatches: ['#F5DCE2', '#A84F66', '#7A1F2B', '#FBF7F2'], treatment: 'blush-frame', overlay: 'heart' },
        { id: 'e14', product_id: 'p11', category: 'Kitchen Party', name: 'Botanical Kitchen Party Cards', price_now: 92000, swatches: ['#A6B89A', '#F5DCE2', '#FBF7F2', '#7A1F2B'], media_url: '/assets/images/flowers_pinky.jpg', media_type: 'image', overlay: 'none' },
        { id: 'e15', product_id: 'p4',  category: 'Kitchen Party', name: 'Arch Script Kitchen Party Cards', price_was: 118000, price_now: 71000, swatches: ['#7A1F2B', '#F5EFE3', '#A6B89A'], treatment: 'arch-script', centered: true, overlay: 'none', background: '#F5EFE3' },
      ],
    },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
//  REAL-PRODUCT PICKS
//  The landing page's Editors' Picks shows live products from
//  `website_invitations_products` (the same table the catalog uses) rather than
//  the curated/dummy picks stored in the CMS section. We keep the CMS rows only
//  for their editorial headings + alignment, and slot real products into them so
//  every card links to a real product page and shows real DB pricing/artwork.
// ─────────────────────────────────────────────────────────────────────────────

const PICKS_PER_ROW = 3

function productToPick(product: CatalogProduct): DigitalCardsEditorsPicksPick {
  const media = product.imageUrl || product.designs?.[0]
  return {
    id: product.id,
    product_id: product.id,
    category: product.category,
    categoryLabel: product.categoryLabel,
    name: product.name,
    price_was: product.priceWas,
    price_now: product.priceNow,
    digital_unit_price: product.digitalUnitPrice,
    swatches: Array.isArray(product.swatches) ? product.swatches : [],
    media_url: media,
    media_type: media ? 'image' : undefined,
    // No artwork → fall back to the built-in CSS treatment so the card isn't blank.
    treatment: media ? undefined : (product.treatment as DigitalCardsEditorsPicksTreatment),
    overlay: 'none',
  }
}

/**
 * Build Editors' Picks rows from live catalog products, borrowing each row's
 * heading/alignment/category from the CMS template. Returns the CMS template
 * untouched when there are no products (e.g. DB unreachable) so the section
 * never renders empty.
 */
export function editorsPicksRowsFromProducts(
  products: CatalogProduct[],
  template: DigitalCardsEditorsPicksContent,
  categories: DigitalCardCategory[] = DIGITAL_CARD_CATEGORIES,
): DigitalCardsEditorsPicksContent {
  if (products.length === 0) return template
  const rows: DigitalCardsEditorsPicksRow[] = []

  // One curated editorial row per CMS heading, each pairing a title cell with
  // PICKS_PER_ROW products. A row pinned to a category shows that category's
  // cards so the heading and the cards under it agree; unpinned rows just take
  // the next unused cards in catalog order. Either way the leftovers are NOT
  // shown here — they live on the full catalog page (/digital-cards/catalog),
  // so the landing stays a tight editorial teaser rather than a repeating wall.
  const used = new Set<string>()
  for (const tmpl of template.rows) {
    const pool = tmpl.category_slug
      ? filterProductsByCategory(categories, products, tmpl.category_slug)
      : products
    const picks = pool.filter((p) => !used.has(p.id)).slice(0, PICKS_PER_ROW)
    // Nothing left to show: an empty row would render as a bare heading, so the
    // row waits until its category has published cards.
    if (picks.length === 0) continue
    picks.forEach((p) => used.add(p.id))
    rows.push({
      id: tmpl.id,
      title_line_1: tmpl.title_line_1,
      title_line_2: tmpl.title_line_2,
      align: tmpl.align,
      category_slug: tmpl.category_slug,
      picks: picks.map(productToPick),
    })
  }

  return { rows, exploreLabel: template.exploreLabel }
}

// Stored shape: only each row's two title lines are translatable (they may be a
// localized { en, sw } object or a legacy plain string). Everything else on a
// row/pick — align, category_slug, and the picks themselves (which on the live
// landing page are replaced by real catalog products) — passes through. The
// loader resolves the title lines for `locale` and returns the flat
// DigitalCardsEditorsPicksContent the render path already expects.
type StoredEditorsPicksRow = Omit<DigitalCardsEditorsPicksRow, 'title_line_1' | 'title_line_2'> & {
  title_line_1?: MaybeLocalized
  title_line_2?: MaybeLocalized
}

type StoredEditorsPicksContent = {
  rows?: StoredEditorsPicksRow[]
  exploreLabel?: MaybeLocalized
}

export async function loadDigitalCardsEditorsPicksContent(
  locale: Locale = DEFAULT_LOCALE
): Promise<DigitalCardsEditorsPicksContent> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return DIGITAL_CARDS_EDITORS_PICKS_FALLBACK
  }
  try {
    const { isEnabled: isDraft } = await draftMode()
    const supabase = createSupabaseServerClient()
    const { data } = await supabase
      .from('website_page_sections')
      .select('content, draft_content')
      .eq('page_key', 'opus-pass-invitations')
      .eq('section_key', 'editors-picks')
      .maybeSingle()
    const stored = (isDraft ? data?.draft_content ?? data?.content : data?.content) as
      | StoredEditorsPicksContent
      | undefined
    if (stored?.rows && Array.isArray(stored.rows) && stored.rows.length > 0) {
      return {
        exploreLabel: resolveLocalized(
          stored.exploreLabel ?? DIGITAL_CARDS_EDITORS_PICKS_FALLBACK.exploreLabel,
          locale
        ),
        rows: stored.rows.map((row) => ({
          ...row,
          title_line_1: resolveLocalized(row.title_line_1, locale),
          title_line_2: resolveLocalized(row.title_line_2, locale),
        })),
      }
    }
    return DIGITAL_CARDS_EDITORS_PICKS_FALLBACK
  } catch (err) {
    console.error('[opus-pass cms] digital-cards-editors-picks load failed', err)
    return DIGITAL_CARDS_EDITORS_PICKS_FALLBACK
  }
}
