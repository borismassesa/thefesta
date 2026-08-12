'use client'

import { useMemo } from 'react'
import { filterProductsByCategory, type DigitalCardCategory } from '@/data/digital-cards-categories'
import type { CatalogProduct } from '@/data/digital-cards-products'
import type { DigitalCardsPromoBannerContent } from '@/lib/cms/digital-cards-promo-banner'
import type { DigitalCardsStyleStripContent } from '@/lib/cms/digital-cards-style-strip'
import DigitalCardsCatalogClient from '../catalog/DigitalCardsCatalogClient'

export default function DigitalCardsCategoryClient({
  category,
  categories,
  products: allProducts,
  fromGuestPrice,
  perGuestLabel,
  perDesignLabel,
  fromLabel,
  promoBanner,
  styleStrip,
}: {
  category: DigitalCardCategory
  categories: DigitalCardCategory[]
  products: CatalogProduct[]
  /** Lowest per-guest package price — keeps card pricing identical to the main catalog. */
  fromGuestPrice?: number
  perGuestLabel?: string
  perDesignLabel?: string
  fromLabel?: string
  promoBanner: DigitalCardsPromoBannerContent
  styleStrip: DigitalCardsStyleStripContent
}) {
  const filtered = useMemo(
    () => filterProductsByCategory(categories, allProducts, category.slug),
    [categories, allProducts, category.slug],
  )

  // If the slug has no matching designs yet, fall back to the full catalog so
  // the page still feels useful — the title + subtitle still reflect the
  // chosen category, but the user sees browsable designs instead of an empty grid.
  const products = filtered.length > 0 ? filtered : allProducts

  return (
    <DigitalCardsCatalogClient
      products={products}
      fromGuestPrice={fromGuestPrice}
      perGuestLabel={perGuestLabel}
      perDesignLabel={perDesignLabel}
      fromLabel={fromLabel}
      title={category.label}
      subtitle={category.subtitle}
      promoBanner={promoBanner}
      styleStrip={styleStrip}
    />
  )
}
