import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import Navbar from '@/components/navbar'
import Footer from '@/components/footer'
import SearchForm from '@/components/advice-ideas/SearchForm'
import { Hero } from '@/components/registry/Hero'
import { CategoryIcons } from '@/components/registry/CategoryIcons'
import { CollectionsRow } from '@/components/registry/CollectionsRow'
import { BrandStrip } from '@/components/registry/BrandStrip'
import { PriceBandRow } from '@/components/registry/PriceBandRow'
import { PopularGiftsGrid } from '@/components/registry/PopularGiftsGrid'
import { PerksRow } from '@/components/registry/PerksRow'
import { NewArrivalsRow } from '@/components/registry/NewArrivalsRow'
import ShopsBand from '@/components/shop/ShopsBand'
import { REGISTRY_CATEGORIES } from '@/lib/registry-categories'
import { PRICE_BANDS } from '@/lib/registry-products'

// The rows below (price bands, popular, new arrivals, shops) all read live
// products from Supabase, so this page needs the same ISR window as the rest
// of /registry rather than being frozen at build time.
export const revalidate = 600

export const metadata: Metadata = {
  title: 'Gift Registry | OpusFesta',
  description:
    'Build your wedding gift registry on OpusFesta — browse curated kitchen, home, and experience gifts and let guests give exactly what you need.',
}

export default function RegistryPage() {
  return (
    <>
      <Navbar />
      <div className="sticky top-0 z-30 bg-black text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between md:gap-8">
          <nav aria-label="Browse registry categories" className="min-w-0 md:flex-1">
            <ul className="hide-scrollbar flex gap-6 overflow-x-auto pr-6 text-sm md:pr-4">
              {REGISTRY_CATEGORIES.map((c) => (
                <li key={c.slug} className="shrink-0">
                  <Link
                    href={`/registry/${c.slug}`}
                    className="whitespace-nowrap font-medium text-white/80 transition-colors hover:text-[var(--accent)]"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
              <li className="shrink-0">
                <Link
                  href="/registry/shops"
                  className="whitespace-nowrap font-medium text-white/80 transition-colors hover:text-[var(--accent)]"
                >
                  Shops
                </Link>
              </li>
            </ul>
          </nav>
          <div className="flex shrink-0 items-center gap-3">
            <Suspense fallback={null}>
              <SearchForm placeholder="Search the registry" ariaLabel="Search the registry" />
            </Suspense>
          </div>
        </div>
      </div>

      <main>
        <Hero />
        <CategoryIcons />
        <CollectionsRow />
        <BrandStrip />
        {PRICE_BANDS.map((band) => (
          <PriceBandRow key={band.id} band={band} />
        ))}
        <PopularGiftsGrid />
        <ShopsBand
          vertical="gift_shop"
          eyebrow="Sellers"
          heading="Shops on the registry"
          blurb="Every gift here comes from a real Tanzanian seller. Browse a shop to see everything they stock."
          allHref="/registry/shops"
          allLabel="All shops"
        />
        <PerksRow />
        <NewArrivalsRow />
      </main>
      <Footer />
    </>
  )
}
