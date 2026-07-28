'use client'

import Link from 'next/link'

// Pricing model: priceWas / priceNow are TOTAL prices for a PACK_QTY-piece pack.
// The UI displays per-unit pricing — total / PACK_QTY rounded to nearest 10 TZS.
// PACK_QTY_MIN / PACK_QTY_MAX show the pack-size range available per design.
export const PACK_QTY = 100
export const PACK_QTY_MIN = 50
export const PACK_QTY_MAX = 500
export const PROMO_CODE = 'KARIBU40'

export type Product = {
  id: string
  /** Stable, always-English key — other code matches/looks up by this, so it
   *  must never be locale-translated. Use `categoryLabel` for display. */
  category: string
  /** Locale-resolved display text for `category`. Falls back to `category`
   *  itself when absent (e.g. dummy/CMS-fallback picks that predate this field). */
  categoryLabel?: string
  name: string
  /** Optional — TOTAL price for a PACK_QTY-piece paper pack (used to derive per-piece paper pricing). */
  priceWas?: number
  priceNow: number
  /**
   * Optional — marks this as a digital catalog product. When set (alongside a
   * `fromGuestPrice`), ProductInfo shows the per-guest package "from" price
   * instead of the paper per-pack price. The value itself is no longer
   * displayed (pricing is per-guest, not per-card); only its presence selects
   * the digital branch. Catalog products always set it; editorial/feature
   * products omit it and fall back to paper per-pack pricing.
   */
  digitalUnitPrice?: number
  swatches: string[]
}

export function ProductInfo({
  product,
  href,
  fromGuestPrice,
  perGuestLabel = 'per guest',
  perDesignLabel = 'per design',
  fromLabel = 'From',
}: {
  product: Product
  href?: string
  /** Lowest per-guest package price — see `packageFromPrice`. Shown as the digital "from" anchor. */
  fromGuestPrice?: number
  /** Locale-resolved "per guest"/"per design" price suffixes — see packages.ts. */
  perGuestLabel?: string
  perDesignLabel?: string
  /** Locale-resolved "From" price-anchor prefix — see packages.ts. */
  fromLabel?: string
}) {
  const unitNow = Math.round(product.priceNow / PACK_QTY / 10) * 10
  const unitWas = product.priceWas
    ? Math.round(product.priceWas / PACK_QTY / 10) * 10
    : undefined
  // Treat a 0 / missing package price as absent so the digital branch never
  // renders "From TZS 0" — it falls back to the per-design price instead.
  const perGuest = fromGuestPrice && fromGuestPrice > 0 ? fromGuestPrice : undefined

  return (
    <>
      {/* Category label — lighter for hierarchy */}
      <p className="mt-3 text-[11px] text-[#1A1A1A]/50">{product.categoryLabel ?? product.category}</p>

      {/* Title — bigger and bolder, capped at 2 lines for consistent card heights */}
      <p className="mt-1 text-[15px] sm:text-[16px] font-bold text-[#1A1A1A] leading-snug line-clamp-2">
        {href ? (
          product.name
        ) : (
          <Link href={`/digital-cards/p/${product.id}`}>{product.name}</Link>
        )}
      </p>

      {/* Pricing — digital products price per-guest (via packages), so they show
          the "from" package price; the per-design digitalUnitPrice is a safe
          fallback when no package price is available so a 0 paper price can never
          surface as "TZS 0 ea.". Editorial/feature products use paper per-pack. */}
      {product.digitalUnitPrice ? (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[15px] sm:text-[16px] font-bold text-[#1A1A1A]">
            {fromLabel} TZS {(perGuest ?? product.digitalUnitPrice).toLocaleString('en-US')}
          </span>
          <span className="text-[11px] text-[#1A1A1A]/60">
            {perGuest ? perGuestLabel : perDesignLabel}
          </span>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {unitWas && (
            <span aria-label={`Was TZS ${unitWas.toLocaleString('en-US')}`}>
              <span aria-hidden="true" className="text-[11px] text-[#1A1A1A]/45 line-through">
                TZS {unitWas.toLocaleString('en-US')}
              </span>
            </span>
          )}
          <span className="text-[15px] sm:text-[16px] font-bold text-[#1A1A1A]">
            TZS {unitNow.toLocaleString('en-US')} ea.
          </span>
          <span className="text-[11px] text-[#1A1A1A]/60">({PACK_QTY_MIN}&ndash;{PACK_QTY_MAX} qty)</span>
        </div>
      )}
    </>
  )
}
