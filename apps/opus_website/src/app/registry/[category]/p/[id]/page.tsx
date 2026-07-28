import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight, Check, ShieldCheck, Gift, RotateCcw, Store } from 'lucide-react'
import Navbar from '@/components/navbar'
import Footer from '@/components/footer'
import ProductCard from '@/components/registry/ProductCard'
import RegistryPdpHero from '@/components/registry/RegistryPdpHero'
import ExpandableText from '@/components/attire-and-rings/ExpandableText'
import ProductReviewsSection from '@/components/attire-and-rings/ProductReviewsSection'
import { getRegistryCategory, type RegistryCategory } from '@/lib/registry-categories'
import { getAllProductParams, getProductsForVendor, getShopProductById, getShopProducts } from '@/lib/products-db'

type Params = Promise<{ category: string; id: string }>

export const revalidate = 600

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params
  const product = await getShopProductById(id)
  if (!product) return { title: 'Registry | OpusFesta' }
  return {
    title: `${product.name} | OpusFesta Registry`,
    description: product.description,
  }
}

export function generateStaticParams() {
  return getAllProductParams()
}

export default async function RegistryProductPage({ params }: { params: Params }) {
  const { id } = await params
  const product = await getShopProductById(id)
  if (!product) notFound()
  // Breadcrumbs/related use the product's own category, not the URL slug —
  // the URL is cosmetic and could drift from where the product now lives.
  const cat = product.category

  const [fromStoreRaw, youMayLike] = await Promise.all([
    getProductsForVendor(product.vendorId, 'gift_shop', 5),
    getShopProducts({ category: cat.slug, limit: 10, excludeId: product.id }),
  ])
  const fromStore = fromStoreRaw.filter((p) => p.id !== product.id).slice(0, 4)
  // The seller's shop page. Only absent for seeded demo products with no
  // vendor row; those fall back to the browse category.
  const storeHref = product.brand.href ?? `/registry/${cat.slug}`
  const relatedCats = cat.related
    .map((slug) => getRegistryCategory(slug))
    .filter((c): c is RegistryCategory => Boolean(c))

  return (
    <>
      <Navbar />

      <main className="bg-white font-sans text-gray-900">
        {/* Breadcrumb */}
        <div className="mx-auto max-w-7xl px-4 pt-5 lg:px-8">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-gray-500">
            <Link href="/registry" className="hover:text-gray-900 hover:underline">
              Registry
            </Link>
            <ChevronRight size={12} />
            <Link href={`/registry/${cat.slug}`} className="hover:text-gray-900 hover:underline">
              {cat.name}
            </Link>
            <ChevronRight size={12} />
            <span className="max-w-[260px] truncate text-gray-700">{product.name}</span>
          </nav>
        </div>

        {/* Hero — 3-column (gallery+store / details / registry box) */}
        <RegistryPdpHero product={product} />

        {/* About this gift */}
        <section id="about" className="border-t border-gray-100">
          <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
            <h2 className="mb-6 text-2xl font-serif font-medium text-gray-900">About this gift</h2>

            <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-3 lg:gap-12">
              {/* Left — description + what's included + trust strip */}
              <div className="lg:col-span-2">
                <ExpandableText
                  text={product.description}
                  limit={240}
                  className="mb-8 text-[15px] leading-relaxed text-gray-700"
                />

                <h3 className="mb-4 text-base font-semibold text-gray-900">What&apos;s included</h3>
                <ul className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm text-gray-800 sm:grid-cols-2">
                  {product.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2.5">
                      <Check size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-10 grid grid-cols-1 gap-5 border-t border-gray-100 pt-6 sm:grid-cols-3">
                  <div className="flex items-start gap-3">
                    <ShieldCheck size={20} className="mt-0.5 shrink-0 text-emerald-600" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Verified store</p>
                      <p className="text-xs text-gray-600">Curated for quality by the OpusFesta team</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Gift size={20} className="mt-0.5 shrink-0 text-gray-700" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Zero fees</p>
                      <p className="text-xs text-gray-600">The full value goes toward your gift</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <RotateCcw size={20} className="mt-0.5 shrink-0 text-gray-700" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Easy exchange</p>
                      <p className="text-xs text-gray-600">Swap for anything else from the same store</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right — specs card */}
              <aside className="lg:col-span-1">
                <div className="rounded-2xl border border-gray-200 bg-white p-6">
                  <h3 className="mb-4 text-base font-bold text-gray-900">Gift details</h3>
                  <dl className="divide-y divide-gray-100 text-sm">
                    <div className="flex justify-between gap-4 py-2.5">
                      <dt className="shrink-0 text-gray-600">Store</dt>
                      <dd className="text-right font-medium text-gray-900">{product.brand.name}</dd>
                    </div>
                    <div className="flex justify-between gap-4 py-2.5">
                      <dt className="shrink-0 text-gray-600">Ships from</dt>
                      <dd className="text-right font-medium text-gray-900">{product.brand.location}, Tanzania</dd>
                    </div>
                    <div className="flex justify-between gap-4 py-2.5">
                      <dt className="shrink-0 text-gray-600">Delivery</dt>
                      <dd className="text-right font-medium text-gray-900">Tanzania-wide</dd>
                    </div>
                    <div className="flex justify-between gap-4 py-2.5">
                      <dt className="shrink-0 text-gray-600">Lead time</dt>
                      <dd className="text-right font-medium text-gray-900">Ships in 3–5 days</dd>
                    </div>
                    <div className="flex justify-between gap-4 py-2.5">
                      <dt className="shrink-0 text-gray-600">Payment</dt>
                      <dd className="text-right font-medium text-gray-900">M-Pesa, Airtel, Tigo, card</dd>
                    </div>
                    <div className="flex justify-between gap-4 py-2.5">
                      <dt className="shrink-0 text-gray-600">Returns</dt>
                      <dd className="max-w-[60%] text-right font-medium text-gray-900">
                        30-day exchange from the same store
                      </dd>
                    </div>
                  </dl>
                </div>
              </aside>
            </div>
          </div>
        </section>

        {/* Meet the store */}
        <section className="border-t border-gray-100 bg-[#fbfaf6]">
          <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
            <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_2fr] lg:gap-12">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">Meet the store</p>
                <h2 className="mb-3 flex items-center gap-2.5 text-2xl font-serif font-medium text-gray-900 md:text-3xl">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-gray-900 text-white">
                    <Store size={18} />
                  </span>
                  {product.brand.name}
                </h2>
                {/* Same rule as the product rating: no stars until the store
                    has actually been reviewed. */}
                {product.brand.reviews > 0 && (
                  <div className="mb-1 flex items-center gap-2 text-sm text-gray-700">
                    <span className="font-semibold text-gray-900">{product.brand.rating}</span>
                    <span>· {product.brand.reviews.toLocaleString()} reviews</span>
                  </div>
                )}
                <p className="mb-5 text-xs text-gray-600">
                  {product.brand.location}, Tanzania · {product.brand.yearsActive} {product.brand.yearsActive === 1 ? 'year' : 'years'} on OpusFesta
                </p>
                <p className="mb-6 max-w-md text-[15px] leading-relaxed text-gray-700">
                  Every piece here is supplied by {product.brand.name}. They ship across Tanzania, accept mobile money,
                  and answer registry questions within a day.
                </p>
                <Link
                  href={storeHref}
                  className="inline-flex h-11 items-center rounded-full bg-gray-900 px-6 text-sm font-semibold text-white transition hover:bg-gray-800"
                >
                  Shop this store
                </Link>
              </div>

              <div>
                <div className="mb-4 flex items-end justify-between">
                  <h3 className="text-base font-semibold text-gray-900">More from {product.brand.name}</h3>
                  <Link
                    href={storeHref}
                    className="inline-flex items-center gap-1 text-sm font-medium text-gray-900 underline underline-offset-4 hover:text-gray-600"
                  >
                    See all <ChevronRight size={14} />
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  {fromStore.slice(0, 4).map((p) => (
                    <Link key={p.id} href={`/registry/${cat.slug}/p/${p.id}`} className="group">
                      <div className="mb-2 aspect-square overflow-hidden rounded-lg bg-gray-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.img}
                          alt={p.name}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>
                      <p className="line-clamp-2 text-[13px] font-medium leading-snug text-gray-900 group-hover:underline">
                        {p.name}
                      </p>
                      <p className="mt-0.5 text-[13px] font-bold text-gray-900">{p.price}</p>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Reviews */}
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <ProductReviewsSection product={product} />
        </div>

        {/* You may also like */}
        <section className="border-t border-gray-100">
          <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
            <h2 className="mb-6 text-2xl font-serif font-medium text-gray-900">You may also like</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-5">
              {youMayLike.map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
            </div>
          </div>
        </section>

        {/* Explore related categories */}
        {relatedCats.length > 0 && (
          <section className="border-t border-gray-100">
            <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
              <h2 className="mb-6 text-2xl font-serif font-medium text-gray-900">Explore related categories</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-4">
                {relatedCats.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/registry/${c.slug}`}
                    className="group flex items-stretch gap-4 rounded-lg border border-gray-200 bg-white p-2 transition-colors hover:border-gray-400 hover:shadow-sm"
                  >
                    <div className="aspect-square w-20 shrink-0 overflow-hidden rounded-md bg-gray-100 md:w-24">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={c.img}
                        alt={c.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                    <span className="flex min-w-0 flex-1 items-center text-sm font-semibold leading-snug text-gray-900 group-hover:underline">
                      {c.name}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      <Footer />
    </>
  )
}
