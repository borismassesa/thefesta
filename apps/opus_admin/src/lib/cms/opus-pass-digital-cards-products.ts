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

export const PRODUCT_CATEGORIES = [
  'Wedding',
  'Sendoff',
  'Kitchen Party',
  'Save the Date',
  'Kadi za Michango',
  'Anniversary',
  'Communio',
  'Birthday',
  'Gala Dinner',
  'Muslim Wedding',
] as const

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
  /** Attached front card artwork (SVG). When set, replaces the CSS design on the page. */
  image_url: string
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
