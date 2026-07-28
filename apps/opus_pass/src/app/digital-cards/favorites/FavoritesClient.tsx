'use client'

import Link from 'next/link'
import { ArrowRight, Heart } from 'lucide-react'
import type { CatalogProduct } from '@/data/digital-cards-products'
import type { DigitalCardsStyleStripContent } from '@/lib/cms/digital-cards-style-strip'
import { useFavorites } from '@/components/providers/FavoritesProvider'
import { ProductCard, CategoryStrip } from '../catalog/DigitalCardsCatalogClient'

export default function FavoritesClient({
  products,
  styleStrip,
  fromGuestPrice,
  perGuestLabel,
  perDesignLabel,
  fromLabel,
}: {
  products: CatalogProduct[]
  styleStrip: DigitalCardsStyleStripContent
  fromGuestPrice?: number
  perGuestLabel?: string
  perDesignLabel?: string
  fromLabel?: string
}) {
  const { isFavorite, ready } = useFavorites()

  // Server sends the saved snapshot; once the provider has loaded, drop cards the
  // user has just un-saved this session so the grid stays truthful without a
  // reload. Before it's ready we show the snapshot as-is (no empty flash).
  const visible = products.filter((p) => !ready || isFavorite(p.id))
  const count = visible.length
  const isEmpty = count === 0

  return (
    <div className="min-h-[70vh] bg-[#FAFAF8] text-[#1A1A1A]">
      {/* Header — matches the /digital-cards catalog serif heading, on the page
          background (no white band) so it reads as one surface. */}
      <header className="px-4 sm:px-6">
        <div className="mx-auto max-w-7xl pt-10 sm:pt-14 text-center">
          <h1 className="mb-3 font-serif text-2xl md:text-3xl lg:text-4xl font-medium text-gray-900">
            Saved Designs
          </h1>
          <p className="mx-auto max-w-2xl text-sm md:text-base text-gray-700 leading-relaxed">
            {isEmpty
              ? 'Tap the heart on any digital card and it lands here, ready when you are.'
              : `${count} design${count === 1 ? '' : 's'} you have hearted, all in one place.`}
          </p>
        </div>
      </header>

      <div className="px-4 sm:px-6">
        <div className="mx-auto max-w-7xl pb-20 sm:pb-28 pt-10 sm:pt-14">
          {isEmpty ? (
            <div className="mx-auto max-w-3xl">
              {/* Premium empty panel — clean neutral surface, medallion, brand CTA. */}
              <div className="relative overflow-hidden rounded-3xl border border-[#1A1A1A]/10 bg-white px-6 py-14 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04),0_18px_40px_-24px_rgba(0,0,0,0.18)] sm:px-12">
                <span className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-full bg-[#FAFAF8] ring-1 ring-[#1A1A1A]/10">
                  <Heart className="h-7 w-7 text-[#8e57b3]" />
                </span>
                <h2 className="font-serif text-2xl font-medium text-gray-900">
                  Start your collection
                </h2>
                <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-gray-600">
                  You have not saved any designs yet. Browse the catalog and tap the heart on the
                  digital cards you love. They will be waiting for you here.
                </p>
                <Link
                  href="/digital-cards/catalog"
                  className="mt-7 inline-flex items-center gap-2 rounded-full bg-(--accent) px-6 py-3 text-sm font-semibold text-(--on-accent) shadow-sm transition-colors hover:bg-(--accent-hover)"
                >
                  Browse digital cards
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              {/* Browse-by-style — the same catalog affordance, so the page is a
                  launchpad rather than a dead end. */}
              {styleStrip.items.length > 0 && (
                <div className="mt-12">
                  <h3 className="px-1 text-center text-[11px] font-bold uppercase tracking-[0.22em] text-gray-500">
                    Browse by style
                  </h3>
                  <div className="-mx-4 sm:-mx-6">
                    <CategoryStrip items={styleStrip.items} />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8 sm:gap-x-6 sm:gap-y-10">
              {visible.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  fromGuestPrice={fromGuestPrice}
                  perGuestLabel={perGuestLabel}
                  perDesignLabel={perDesignLabel}
                  fromLabel={fromLabel}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
