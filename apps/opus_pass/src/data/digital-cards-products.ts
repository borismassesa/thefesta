import type { Treatment, InvitationPalette } from '@/components/guests/InvitationVisual'
import type { InvitationContent } from '@/components/guests/StructuredInvitation'
import type { Product as BaseProduct } from '@/components/guests/productInfo'

// Catalog product — shared Product + visual treatment + CMS-driven fields.
// Lives in a plain (non-'use client') module so both server and client components
// can import the type cleanly.
export type CatalogProduct = BaseProduct & {
  designer: string
  freeSample?: boolean
  /** Editable "Details" paragraph shown under the card. Empty → auto-generated copy. */
  description?: string
  treatment: Treatment
  /** TZS per digital card (the primary product). */
  digitalUnitPrice: number
  /** URL-safe slug (CMS-managed). */
  slug?: string
  /** Attached hero card artwork. When set, replaces the CSS `treatment` on the page. */
  imageUrl?: string
  /** Extra attached card views shown in the gallery. */
  gallery?: string[]
  /** Designer-uploaded finished card images (max 5), shown in the detail carousel at 5:7. */
  designs?: string[]
  /** Structured invite content. When set, overrides the category-derived default. */
  content?: InvitationContent
  /** SVG used by the card renderer — set to imageUrl at load time. */
  designImage?: string
  /** Per-swatch palettes — index matches swatches[]. */
  palettes: InvitationPalette[]
  /** Admin-set promotional status badge shown above the card. Undefined → none. */
  badge?: ProductBadge
  /** ISO creation timestamp — drives the catalog's Newest/Oldest sort. */
  createdAt?: string
}

// ── Promotional status badge ──────────────────────────────────────────────────
// Admin-set per design. Kept in sync with the DB CHECK constraint in migration
// 20260613000002_invitations_products_badge.sql and the admin editor's options.

export const PRODUCT_BADGES = ['most_popular', 'premium', 'trending'] as const
export type ProductBadge = (typeof PRODUCT_BADGES)[number]

export function isProductBadge(v: unknown): v is ProductBadge {
  return typeof v === 'string' && (PRODUCT_BADGES as readonly string[]).includes(v)
}

/**
 * Display metadata for each badge: emoji, label, and pill tone classes.
 *
 * These pills sit ON TOP of the card artwork, which is overwhelmingly ivory,
 * cream and gold. The previous pale-tint fills measured 1.01:1 to 1.12:1
 * against that artwork — the pill and the invitation behind it were the same
 * value, so the badge read as a smudge rather than a label. Deep brand fills
 * with white text put every badge at 3:1 or better against ivory while staying
 * legible on the dark cards (burgundy, forest) too.
 *
 * The white ring is load-bearing, not decoration: on a dark card the deep fill
 * alone drops to ~2.7:1 against the background, and the ring is what keeps the
 * pill's edge readable there.
 *
 * Colours come from the brand palette's `deep` steps (see vendors_portal
 * brand-palette.ts). Champagne is the one exception — its deep step (#B07F2C)
 * only reaches 3.5:1 with white text, under AA for 11px, so this uses the same
 * hue and saturation stepped 14% darker to clear 4.5:1.
 *
 * Sage/green is deliberately NOT used here: the Emerald Principle reserves it
 * for booking, publish and success states, and these are promotional labels.
 */
export const BADGE_META: Record<
  ProductBadge,
  { emoji: string; label: string; className: string }
> = {
  most_popular: {
    emoji: '🟡',
    label: 'Most Popular',
    // champagne deep, darkened to 4.63:1 with white text
    className: 'bg-[#976D26] text-white ring-white/70',
  },
  premium: {
    emoji: '✨',
    label: 'Premium Template',
    // lavender deep — brand primary, 5.6:1 with white text
    className: 'bg-[#7E5896] text-white ring-white/70',
  },
  trending: {
    emoji: '🔥',
    label: 'Trending This Week',
    // rose deep — 5.3:1 with white text
    className: 'bg-[#A84F66] text-white ring-white/70',
  },
}
