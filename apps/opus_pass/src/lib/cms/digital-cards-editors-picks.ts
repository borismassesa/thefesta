import { draftMode } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabase'
import type { CatalogProduct } from '@/data/digital-cards-products'
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
  picks: DigitalCardsEditorsPicksPick[]
}

export type DigitalCardsEditorsPicksContent = {
  rows: DigitalCardsEditorsPicksRow[]
  exploreLabel: string
}

export const DIGITAL_CARDS_EDITORS_PICKS_FALLBACK: DigitalCardsEditorsPicksContent = {
  exploreLabel: 'Explore designs',
  rows: [
    {
      id: 'row-1', title_line_1: 'Save the dates', title_line_2: 'worth saving', align: 'left',
      picks: [
        { id: 'e1', product_id: 'p9',  category: 'Save the Dates', name: 'Two of Us Photo Save the Date Cards', price_was: 195000, price_now: 117000, swatches: ['#1A1A1A', '#F5EFE3', '#7A1F2B', '#A6B89A'], treatment: 'photo-overlay', overlay: 'play' },
        { id: 'e2', product_id: 'p17', category: 'Save the Dates', name: 'Authentic Portrait Video Save the Date', price_was: 215000, price_now: 129000, swatches: ['#1A1A1A', '#7A1F2B', '#F5EFE3', '#C8A35C'], media_url: '/assets/images/authentic_couple.jpg', media_type: 'image', overlay: 'play' },
        { id: 'e3', product_id: 'p4',  category: 'Save the Dates', name: 'Modern Suite Save the Date Set', price_now: 145000, swatches: ['#F5EFE3', '#1A1A1A', '#A6B89A', '#7A1F2B'], treatment: 'flat-lay-stationery', overlay: 'none', background: '#A6A8A2' },
      ],
    },
    {
      id: 'row-2', title_line_1: 'Invite & RSVPs', title_line_2: 'for every wedding style', align: 'right',
      picks: [
        { id: 'e4', product_id: 'p1',  category: 'Wedding Invitations', name: 'Botanical Frame Invitation Suite', price_was: 198000, price_now: 119000, swatches: ['#A6B89A', '#F5DCE2', '#FBF7F2', '#1A1A1A', '#7A1F2B'], treatment: 'floral-border', overlay: 'heart' },
        { id: 'e5', product_id: 'p6',  category: 'Wedding Invitations', name: 'Navy & Gold Editorial Invitations', price_was: 225000, price_now: 135000, swatches: ['#1E2D54', '#E8D9A7', '#F5EFE3', '#C8A35C'], treatment: 'navy-gold', overlay: 'play' },
        { id: 'e6', product_id: 'p4',  category: 'Wedding Invitations', name: 'Arch Script Bagamoyo Invitations', price_now: 132000, swatches: ['#7A1F2B', '#F5EFE3', '#A6B89A'], treatment: 'arch-script', centered: true, overlay: 'none', background: '#CFE6F1' },
      ],
    },
    {
      id: 'row-3', title_line_1: 'Matching suites', title_line_2: 'and day-of paper', align: 'left',
      picks: [
        { id: 'e7', product_id: 'p5',  category: 'Reception Cards', name: 'Sage Panel Reception Suite', price_was: 168000, price_now: 101000, swatches: ['#A6B89A', '#FBF7F2', '#5C6B4D'], treatment: 'sage-panel', overlay: 'heart' },
        { id: 'e8', product_id: 'p11', category: 'Day-of Paper Set', name: 'Botanical Day-of Paper Bundle', price_now: 155000, swatches: ['#A6B89A', '#F5DCE2', '#FBF7F2', '#7A1F2B'], media_url: '/assets/images/flowers_pinky.jpg', media_type: 'image', overlay: 'none' },
        { id: 'e9', product_id: 'p14', category: 'Menu Cards', name: 'Karibu Reception Menu Cards', price_was: 89000, price_now: 53000, swatches: ['#7A1F2B', '#F5EFE3', '#A6B89A', '#C8A35C'], treatment: 'menu-card', overlay: 'play', background: '#F5EFE3' },
      ],
    },
    {
      id: 'row-4', title_line_1: 'Premium quality,', title_line_2: 'perfectly priced', align: 'right',
      picks: [
        { id: 'e10', product_id: 'p2',  category: 'Wedding Invitations', name: 'Heritage Crown Karibu Invitations', price_was: 245000, price_now: 147000, swatches: ['#7A1F2B', '#C8A35C', '#F5EFE3', '#1A1A1A'], treatment: 'cultural-red', overlay: 'heart' },
        { id: 'e11', product_id: 'p17', category: 'Save the Dates', name: 'Ring Detail Foil Save the Date', price_was: 185000, price_now: 111000, swatches: ['#C8A35C', '#F5EFE3', '#1A1A1A'], media_url: '/assets/images/hand_rings.jpg', media_type: 'image', overlay: 'play' },
        { id: 'e12', product_id: 'p3',  category: 'Foil & Letterpress', name: 'Modern Block Foil Invitations', price_now: 198000, swatches: ['#1A1A1A', '#FBF7F2', '#E8D9A7', '#C8A35C'], treatment: 'modern-block', centered: true, overlay: 'none', background: '#FBF7F2', badge: 'Foil & Letterpress' },
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
 * heading/alignment from the CMS template. Returns the CMS template untouched
 * when there are no products (e.g. DB unreachable) so the section never renders
 * empty.
 */
export function editorsPicksRowsFromProducts(
  products: CatalogProduct[],
  template: DigitalCardsEditorsPicksContent,
): DigitalCardsEditorsPicksContent {
  if (products.length === 0) return template
  const rows: DigitalCardsEditorsPicksRow[] = []

  // One curated editorial row per CMS heading, each pairing a title cell with
  // PICKS_PER_ROW products. Products beyond the curated headings are NOT shown
  // here — they live on the full catalog page (/digital-cards/catalog), so the
  // landing stays a tight, editorial teaser rather than a repeating wall.
  let cursor = 0
  for (const tmpl of template.rows) {
    if (cursor >= products.length) break
    rows.push({
      id: tmpl.id,
      title_line_1: tmpl.title_line_1,
      title_line_2: tmpl.title_line_2,
      align: tmpl.align,
      picks: products.slice(cursor, cursor + PICKS_PER_ROW).map(productToPick),
    })
    cursor += PICKS_PER_ROW
  }

  return { rows, exploreLabel: template.exploreLabel }
}

// Stored shape: only each row's two title lines are translatable (they may be a
// localized { en, sw } object or a legacy plain string). Everything else on a
// row/pick — align, and the picks themselves (which on the live landing page
// are replaced by real catalog products) — is passed through unchanged. The
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
