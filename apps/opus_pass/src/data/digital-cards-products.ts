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

/** Display metadata for each badge: emoji, label, and pill tone classes. */
export const BADGE_META: Record<
  ProductBadge,
  { emoji: string; label: string; className: string }
> = {
  most_popular: {
    emoji: '🟡',
    label: 'Most Popular',
    className: 'bg-amber-50 text-amber-800 ring-amber-200',
  },
  premium: {
    emoji: '✨',
    label: 'Premium Template',
    className: 'bg-[#F4ECDD] text-[#8A6D1F] ring-[#E2CF9E]',
  },
  trending: {
    emoji: '🔥',
    label: 'Trending This Week',
    className: 'bg-rose-50 text-rose-700 ring-rose-200',
  },
}
