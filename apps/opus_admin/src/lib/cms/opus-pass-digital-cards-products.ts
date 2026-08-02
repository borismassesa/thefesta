// Client-safe types + helpers for the OpusPass invitation products CMS.
// Loaders live in the page.tsx files to keep this module free of server imports.

// Kept in sync with DigitalCardPalette in opus_pass/_types.ts — no cross-app import.
export type DigitalCardPalette = {
  name: string
  background: string
  surface: string
  accent: string
  textPrimary: string
  textSecondary: string
  muted: string
}

// Built-in CSS card designs (used when no artwork is attached). Must stay in
// sync with the `Treatment` union in opus_pass InvitationVisual.tsx.
export const PRODUCT_TREATMENTS = [
  'classic-serif',
  'minimal-line',
  'modern-block',
  'floral-border',
  'navy-gold',
  'blush-frame',
  'sage-panel',
  'cultural-red',
  'arch-script',
  'photo-overlay',
  'ticket',
  'ticket-barcode',
  'save-the-date',
  'save-the-date-photo',
] as const

export type ProductTreatment = (typeof PRODUCT_TREATMENTS)[number]

// Promotional status badge shown above the card on the OpusPass storefront.
// Kept in sync with the DB CHECK constraint (migration 20260613000002) and the
// opus_pass BADGE_META map. null = no badge.
export const PRODUCT_BADGES = ['most_popular', 'premium', 'trending'] as const
export type ProductBadge = (typeof PRODUCT_BADGES)[number]

/** Admin-facing label for each badge value (storefront copy lives in opus_pass). */
export const PRODUCT_BADGE_LABELS: Record<ProductBadge, string> = {
  most_popular: '🟡 Most Popular',
  premium: '✨ Premium Template',
  trending: '🔥 Trending This Week',
}

/**
 * The canonical card categories. These strings are STORED VERBATIM in
 * `website_invitations_products.category`, so they are data, not labels —
 * renaming one orphans every card already filed under the old string.
 *
 * The storefront routes a card to its category page by matching these against
 * `DigitalCardCategory.productMatchers` (case-insensitive SUBSTRING match, see
 * opus_pass/src/data/digital-cards-categories.ts), so every value here must
 * contain the matcher of exactly one storefront category:
 *
 *   'Wedding Invitations' → wedding          'Kadi za Michango' → kadi-za-michango
 *   'Sendoff'            → send-off          'Anniversary'      → anniversary
 *   'Kitchen Party'      → kitchen-party     'Communio'         → communio
 *   'Save the Dates'     → save-the-date      'Birthday'         → birthday
 *   'Gala Dinner'        → gala-dinner        'Muslim Wedding'   → muslim-wedding
 */
export const PRODUCT_CATEGORIES = [
  'Wedding Invitations',
  'Sendoff',
  'Kitchen Party',
  'Save the Dates',
  'Kadi za Michango',
  'Anniversary',
  'Communio',
  'Birthday',
  'Gala Dinner',
  'Muslim Wedding',
] as const

// ── Catalogue list sorting ────────────────────────────────────────────────
//
// Sort orders the list; it never hides a card (that's what the filters do).
// 'curated' is the default because sort_order is the hand-picked sequence the
// storefront shows, so the admin list reads in the same order as the shop.
//
// Deliberately no price sort: a card's cost comes from the per-guest package
// tiers (see the Packages CMS section), and price_now / digital_unit_price are
// uniform across the whole catalogue. Sorting on either would be a control that
// visibly does nothing. Add one if per-card pricing ever varies.
//
// Sorting by units sold isn't here either. The units themselves now exist as a
// view (website_invitations_product_sales, migration
// 20260729000001_digital_card_sales_and_auto_badges), and the list DISPLAYS
// them, but PostgREST can't order the products table by a column from a view it
// has no foreign key to. Sorting on it needs one relation carrying both sides:
// either a joined view of products + units, or a units column maintained on the
// products table itself.
export const PRODUCT_SORTS = {
  curated: { label: 'Curated order' },
  newest: { label: 'Newest first' },
  updated: { label: 'Recently updated' },
  name: { label: 'Name A–Z' },
} as const

export type ProductSort = keyof typeof PRODUCT_SORTS

export const DEFAULT_PRODUCT_SORT: ProductSort = 'curated'

export function isProductSort(value: string): value is ProductSort {
  return Object.prototype.hasOwnProperty.call(PRODUCT_SORTS, value)
}

/** Sentinel for "card carries no promotional badge" — badge IS NULL. */
export const NO_BADGE = 'none'

export type DigitalCardProductRecord = {
  id: string
  slug: string
  name: string
  /** Swahili card name. Blank = falls back to the English name on the public site. */
  name_sw: string
  designer: string
  category: string

  /** Short "Details" paragraph shown under the card on the product page. Falls back to auto-generated copy when empty. */
  description: string
  /** Swahili "Details" paragraph. Blank = falls back to the English description. */
  description_sw: string

  /** Promotional status badge shown above the card on the storefront. null = none. */
  badge: ProductBadge | null

  /** Optional struck-through "before" total price (TZS). */
  price_was: number | null
  /** Current total price (TZS). */
  price_now: number
  /** TZS per digital card — the primary product. */
  digital_unit_price: number
  free_sample: boolean

  /** Design colour swatches (hex strings) — derived from palettes[].accent on save. */
  swatches: string[]
  /** Full palette objects (6 colour roles + name). Drives the palette picker on the product page. */
  palettes: DigitalCardPalette[]
  /** Built-in CSS card design, used when image_url is empty. */
  treatment: ProductTreatment
  /** Flattened public hero/cover image for the catalogue and first detail slide. */
  image_url: string
  /** Editable front artwork (SVG) used for layer mapping and personalised rendering. */
  artwork_svg_url: string
  /** Attached back card artwork (SVG). Optional — leave empty to omit back design. */
  back_image_url: string
  /** Extra card views/scenes shown as gallery thumbnails. */
  gallery: string[]
  /**
   * Designer-uploaded "mockup" card views (PNG/JPG/WebP/SVG), max 5, shown in
   * the product detail carousel as landscape 800×600 (4:3) slides. The portrait
   * hero (image_url) is a separate slide shown first and on the catalog/landing.
   */
  designs: string[]

  published: boolean
  sort_order: number

  created_at: string
  updated_at: string
}

/**
 * Columns the admin must never write back.
 *
 * `badge_effective` is GENERATED (coalesce of badge/badge_auto) — Postgres
 * rejects any write to it. `badge_auto` belongs to the nightly
 * refresh_digital_card_auto_badges() job. The editor loads rows with
 * `select('*')`, so both arrive in the record and would otherwise be echoed
 * straight back on save.
 */
export const READ_ONLY_PRODUCT_COLUMNS = [
  'badge_effective',
  'badge_auto',
  'created_at',
  'updated_at',
] as const

/**
 * Force a row from the database into the shape the record type promises.
 *
 * name_sw and description_sw are nullable in Postgres but typed `string` here,
 * so a legacy row hands React `value={null}` and turns a controlled input into
 * an uncontrolled one mid-edit. Coalescing at the boundary keeps that lie out
 * of the component.
 */
export function normalizeDigitalCardProduct(
  row: DigitalCardProductRecord,
): DigitalCardProductRecord {
  return {
    ...row,
    name: row.name ?? '',
    name_sw: row.name_sw ?? '',
    designer: row.designer ?? '',
    description: row.description ?? '',
    description_sw: row.description_sw ?? '',
    image_url: row.image_url ?? '',
    artwork_svg_url: row.artwork_svg_url ?? '',
    back_image_url: row.back_image_url ?? '',
    swatches: row.swatches ?? [],
    palettes: row.palettes ?? [],
    gallery: row.gallery ?? [],
    designs: row.designs ?? [],
  }
}

export function emptyDigitalCardProduct(
  partial: Partial<DigitalCardProductRecord> = {},
): DigitalCardProductRecord {
  return {
    id: '',
    slug: '',
    name: '',
    name_sw: '',
    designer: '',
    category: 'Wedding Invitations',
    description: '',
    description_sw: '',
    badge: null,
    price_was: null,
    price_now: 0,
    digital_unit_price: 10000,
    free_sample: true,
    swatches: [],
    palettes: [],
    treatment: 'classic-serif',
    image_url: '',
    artwork_svg_url: '',
    back_image_url: '',
    gallery: [],
    designs: [],
    published: true,
    sort_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...partial,
  }
}

/** URL-safe slug from a free-text name. */
export function slugifyProductName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
