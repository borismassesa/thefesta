import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Heart, Star, ChevronDown } from 'lucide-react'
import Navbar from '@/components/navbar'
import Footer from '@/components/footer'
import FilterDrawer from '@/components/attire-and-rings/FilterDrawer'
import {
  BRIDAL_CATEGORIES,
  getBridalCategory,
  type BridalCategory,
} from '@/lib/bridal-categories'
import { listProducts, type Product } from '@/lib/bridal-products'

type Params = Promise<{ category: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { category } = await params
  const cat = getBridalCategory(category)
  if (!cat) return { title: 'Bridal Collection | OpusFesta' }
  return {
    title: `${cat.title} | OpusFesta`,
    description: cat.tagline,
  }
}

export function generateStaticParams() {
  return BRIDAL_CATEGORIES.map((c) => ({ category: c.slug }))
}

function ProductCard({ p, categorySlug }: { p: Product; categorySlug: string }) {
  return (
    <Link
      href={`/attire-and-rings/bridal-collection/${categorySlug}/p/${p.id}`}
      className="group block"
    >
      <div className="relative aspect-square overflow-hidden rounded-lg bg-gray-100">
        <img src={p.img} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        {p.badge && (
          <span className="absolute top-3 left-3 bg-white/95 backdrop-blur-sm px-2.5 py-1 rounded-full text-[11px] font-semibold text-gray-900 shadow-sm">
            {p.badge}
          </span>
        )}
        <span
          aria-label="Favorite"
          className="absolute top-3 right-3 w-9 h-9 bg-white rounded-full shadow-sm flex items-center justify-center text-gray-700 hover:text-red-500 transition-colors"
        >
          <Heart size={16} />
        </span>
      </div>
      <div className="pt-3">
        <div className="flex items-center gap-1 text-xs text-gray-700 mb-1">
          <span className="font-semibold text-gray-900">{p.rating}</span>
          <Star size={12} className="fill-gray-900 text-gray-900" />
          <span className="text-gray-500">({p.reviews.toLocaleString()})</span>
        </div>
        <h3 className="text-[13px] font-medium text-gray-900 leading-snug line-clamp-2 mb-1 group-hover:underline">
          {p.name}
        </h3>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-[13px] font-bold text-gray-900">{p.price}</span>
          {p.oldPrice && <span className="text-[12px] text-gray-500 line-through">{p.oldPrice}</span>}
        </div>
        {p.freeDelivery && (
          <p className="text-[11px] text-green-700 font-medium">Free delivery in Dar es Salaam</p>
        )}
      </div>
    </Link>
  )
}

function FilterPill({ children }: { children: React.ReactNode }) {
  return (
    <button data-opus-button="neutral" data-opus-button-size="medium" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-gray-300 bg-white text-sm font-medium text-gray-800 hover:bg-gray-50 hover:border-gray-400 transition whitespace-nowrap">
      {children}
    </button>
  )
}

function RelatedRow({ items }: { items: BridalCategory[] }) {
  return (
    <section className="max-w-7xl mx-auto px-4 lg:px-8 py-10">
      <h2 className="text-lg md:text-xl font-semibold text-gray-900 mb-5">Explore related categories</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {items.map((c) => (
          <Link
            key={c.slug}
            href={`/attire-and-rings/bridal-collection/${c.slug}`}
            className="group flex items-stretch gap-4 rounded-lg border border-gray-200 bg-white p-2 hover:border-gray-400 hover:shadow-sm transition-colors"
          >
            <div className="w-20 md:w-24 aspect-square shrink-0 overflow-hidden rounded-md bg-gray-100">
              <img
                src={c.img}
                alt={c.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            </div>
            <span className="flex items-center text-sm font-semibold text-gray-900 group-hover:underline flex-1 min-w-0 leading-snug">
              {c.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default async function BridalCategoryPage({ params }: { params: Params }) {
  const { category } = await params
  const cat = getBridalCategory(category)
  if (!cat) notFound()

  const relatedCats = cat.related
    .map((slug) => getBridalCategory(slug))
    .filter((c): c is BridalCategory => Boolean(c))

  const allCats = BRIDAL_CATEGORIES.filter((c) => c.slug !== cat.slug)
  // De-dupe the three Related Categories rows by drawing each from a distinct
  // window of allCats. With 14 sibling categories this gives row2 (0–7) and
  // row3 (6–13) only two items of overlap; the first row stays bespoke to the
  // current category's `related` whitelist (falls back to allCats[0..3]).
  const rowOne =
    relatedCats.length > 0 ? relatedCats : allCats.slice(0, 4)
  const rowTwo = allCats.slice(0, 8)
  const rowThree = allCats.length > 8 ? allCats.slice(Math.max(0, allCats.length - 8)) : allCats.slice(0, 8)

  const batch1 = listProducts(cat.slug, 20, 0)
  const batch2 = listProducts(cat.slug, 16, 20)
  const batch3 = listProducts(cat.slug, 12, 36)

  return (
    <>
      <Navbar />

      <main className="bg-white text-gray-900 font-sans">
        <section className="bg-[#f7f4ee] border-b border-gray-200 pt-10 md:pt-14 pb-12 md:pb-16 px-4">
          <div className="max-w-7xl mx-auto text-center">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-serif font-medium text-gray-900 mb-2 leading-tight">
              {cat.title}
            </h1>
            <p className="text-sm md:text-base text-gray-600 max-w-2xl mx-auto leading-relaxed mb-10">
              {cat.tagline}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 md:gap-5 max-w-5xl mx-auto">
              {cat.subTrends.map((t) => (
                <Link
                  key={t.name}
                  href={`/attire-and-rings/bridal-collection/${cat.slug}?trend=${encodeURIComponent(t.name)}`}
                  className="group block"
                >
                  <div className="aspect-square overflow-hidden rounded-lg bg-gray-100 mb-2.5 transition-shadow group-hover:shadow-md">
                    <img src={t.img} alt={t.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                  <p className="text-sm font-semibold text-gray-900 text-center group-hover:underline">{t.name}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 lg:px-8 pt-8">
          <div className="flex items-center gap-3 overflow-x-auto hide-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0 pb-1">
            <FilterDrawer />
            <FilterPill>
              Sort: Featured <ChevronDown size={14} />
            </FilterPill>
          </div>
          <p className="text-sm text-gray-600 mt-4">
            Showing curated <strong className="font-semibold text-gray-900">{cat.name.toLowerCase()}</strong> from verified Tanzanian boutiques.
          </p>
        </section>

        <section className="max-w-7xl mx-auto px-4 lg:px-8 pt-8 pb-10">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-8">
            {batch1.map((p) => (
              <ProductCard key={p.id} p={p} categorySlug={cat.slug} />
            ))}
          </div>
        </section>

        <RelatedRow items={rowOne} />

        <section className="max-w-7xl mx-auto px-4 lg:px-8 pt-2 pb-10">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-8">
            {batch2.map((p) => (
              <ProductCard key={p.id} p={p} categorySlug={cat.slug} />
            ))}
          </div>
        </section>

        <RelatedRow items={rowTwo} />

        <section className="max-w-7xl mx-auto px-4 lg:px-8 pt-2 pb-12">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-8">
            {batch3.map((p) => (
              <ProductCard key={p.id} p={p} categorySlug={cat.slug} />
            ))}
          </div>
          <div className="mt-10 flex justify-center">
            <button data-opus-button="control" className="border border-gray-300 text-gray-900 font-medium px-6 py-2.5 rounded-full hover:bg-gray-50 transition text-sm">
              Show more
            </button>
          </div>
        </section>

        <RelatedRow items={rowThree} />
      </main>

      <Footer />
    </>
  )
}
