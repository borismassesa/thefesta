import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import Navbar from '@/components/navbar'
import { Hero } from '@/components/attire-and-rings/Hero'
import { CategoriesGrid } from '@/components/attire-and-rings/CategoriesGrid'
import { GiftSection } from '@/components/attire-and-rings/GiftSection'
import { PillCategories } from '@/components/attire-and-rings/PillCategories'
import { DealsSection } from '@/components/attire-and-rings/DealsSection'
import { EditorsPicks } from '@/components/attire-and-rings/EditorsPicks'
import { StandoutStyles } from '@/components/attire-and-rings/StandoutStyles'
import { LocalShops } from '@/components/attire-and-rings/LocalShops'
import { BlogSection } from '@/components/attire-and-rings/BlogSection'
import { InfoSection } from '@/components/attire-and-rings/InfoSection'
import ShopsBand from '@/components/shop/ShopsBand'
import SearchForm from '@/components/advice-ideas/SearchForm'
import Footer from '@/components/footer'

// CMS-driven (website_page_sections, service-role client). ISR instead of
// force-dynamic; edits surface within the revalidate window.
export const revalidate = 1800

export const metadata: Metadata = {
  title: 'Attire & Rings | OpusFesta',
  description:
    'Discover trending wedding attire & rings on OpusFesta — curated dresses, suits, engagement rings, wedding bands, and accessories.',
}

const attireTopics = [
  { id: 'attire-categories', label: 'Wedding Dresses' },
  { id: 'attire-categories', label: 'Groom Suits' },
  { id: 'attire-categories', label: 'Engagement Rings' },
  { id: 'attire-categories', label: 'Wedding Bands' },
  { id: 'accessories', label: 'Bridal Accessories' },
  { id: 'attire-categories', label: 'Bridesmaid Dresses' },
]

export default function AttireAndRingsPage() {
  return (
    <>
      <Navbar />
      <div className="sticky top-0 z-30 bg-black text-white">
        <div className="mx-auto max-w-7xl px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-8">
          <nav aria-label="Browse attire and rings" className="min-w-0 md:flex-1">
            <ul className="hide-scrollbar flex gap-6 overflow-x-auto pr-6 text-sm md:pr-4">
              {attireTopics.map((t, i) => (
                <li key={`${t.label}-${i}`} className="shrink-0">
                  <Link
                    href={`#${t.id}`}
                    className="whitespace-nowrap font-medium text-white/80 transition-colors hover:text-[var(--accent)]"
                  >
                    {t.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="shrink-0">
            <Suspense fallback={null}>
              <SearchForm placeholder="Search attire and rings" ariaLabel="Search attire and rings" />
            </Suspense>
          </div>
        </div>
      </div>

      <main>
        <Hero />
        <section id="attire-categories">
          <CategoriesGrid variant="trending" />
        </section>
        <GiftSection />
        <section id="accessories">
          <PillCategories />
        </section>
        <CategoriesGrid variant="loved" />
        <DealsSection />
        <section id="editor-picks">
          <EditorsPicks />
        </section>
        <StandoutStyles />
        {/* Real attire/rings sellers (vertical='attire_rings'), above the
            CMS-curated LocalShops band. Renders nothing until one is live. */}
        <section id="opusfesta-sellers">
          <ShopsBand
            vertical="attire_rings"
            eyebrow="Sellers"
            heading="Shop attire & rings on OpusFesta"
            blurb="Gowns, suits, jewellery and rings listed directly by Tanzanian sellers. Pay with mobile money at checkout."
            allHref="/attire-and-rings/shops"
            allLabel="All sellers"
          />
        </section>
        <LocalShops />
        <BlogSection />
        <InfoSection />
      </main>
      <Footer />
    </>
  )
}
