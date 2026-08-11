import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  Star,
  MapPin,
  ChevronRight,
  RotateCcw,
  Scissors,
  Check,
  ShieldCheck,
} from 'lucide-react'

const SPEC_MATERIAL: Record<string, string> = {
  'engagement-rings': '18k gold + natural stones',
  'wedding-bands': '18k gold or platinum',
  'wedding-jewellery': '18k gold + pearls',
  'mens-watches': 'Stainless steel + sapphire crystal',
  'wedding-dresses': 'Silk, lace, hand-beaded detail',
  'bridesmaid-dresses': 'Satin or chiffon',
  'veils-and-headpieces': 'Tulle with pearl trim',
  'bridal-shoes': 'Italian leather or satin',
  'groom-suits': 'Wool blend, full canvas',
  'groomsmen-looks': 'Wool blend',
  'custom-tailoring': 'Premium fabrics (made-to-measure)',
  'vintage-bridal-finds': 'Vintage textiles, hand-restored',
  'bridal-party-gifts': 'Premium materials',
  'bridal-trends': 'Premium fabrics',
  'reception-looks': 'Satin, sequins',
}

const SPEC_LEAD_TIME: Record<string, string> = {
  'engagement-rings': '3–4 weeks',
  'wedding-bands': '2–3 weeks',
  'wedding-jewellery': '2–3 weeks',
  'mens-watches': 'In stock, ships in 48h',
  'wedding-dresses': '8–12 weeks (made-to-measure)',
  'bridesmaid-dresses': '4–6 weeks',
  'veils-and-headpieces': '2 weeks',
  'bridal-shoes': 'In stock or 3 weeks custom',
  'groom-suits': '6–8 weeks (made-to-measure)',
  'groomsmen-looks': '4–6 weeks',
  'custom-tailoring': '8–12 weeks',
  'vintage-bridal-finds': 'In stock, ships in 48h',
  'bridal-party-gifts': '1–2 weeks',
  'bridal-trends': 'Made to order — 4 weeks',
  'reception-looks': '4–6 weeks',
}
import Navbar from '@/components/navbar'
import Footer from '@/components/footer'
import PdpHero from '@/components/attire-and-rings/PdpHero'
import ProductReviewsSection from '@/components/attire-and-rings/ProductReviewsSection'
import ExpandableText from '@/components/attire-and-rings/ExpandableText'
import { BRIDAL_CATEGORIES, getBridalCategory } from '@/lib/bridal-categories'
import JsonLd from '@/components/JsonLd'
import { generateProduct, listProducts, generateAllParams } from '@/lib/bridal-products'

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://opusfesta.com'

type Params = Promise<{ category: string; id: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { category, id } = await params
  const p = generateProduct(category, Number(id))
  if (!p) return { title: 'Product | OpusFesta' }
  const description = `${p.name} from ${p.vendor.name}, ${p.vendor.location}. ${p.description.slice(0, 140)}`
  return {
    title: `${p.name} — ${p.vendor.name} | OpusFesta`,
    description,
    openGraph: {
      title: `${p.name} — ${p.vendor.name} | OpusFesta`,
      description,
      images: [{ url: p.img, alt: p.name }],
      type: 'website',
    },
  }
}

export function generateStaticParams() {
  return generateAllParams()
}

export default async function ProductDetailPage({ params }: { params: Params }) {
  const { category, id } = await params
  const productId = Number(id)
  if (!Number.isFinite(productId) || productId < 0 || !Number.isInteger(productId)) notFound()
  const product = generateProduct(category, productId)
  if (!product) notFound()

  const fromShop = listProducts(category, 8, productId + 50)
  const youMayLike = listProducts(category, 10, productId + 130)
  const relatedTrends = product.category.subTrends

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Bridal Collection', item: `${BASE}/attire-and-rings/bridal-collection` },
      { '@type': 'ListItem', position: 3, name: product.category.name, item: `${BASE}/attire-and-rings/bridal-collection/${category}` },
      { '@type': 'ListItem', position: 4, name: product.name, item: `${BASE}/attire-and-rings/bridal-collection/${category}/p/${id}` },
    ],
  }

  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <Navbar />

      <main className="bg-white text-gray-900 font-sans">
        {/* Breadcrumb */}
        <nav className="max-w-7xl mx-auto px-2 lg:px-2 pt-5 text-xs text-gray-600">
          <ol className="flex items-center gap-1.5 flex-wrap">
            <li>
              <Link href="/attire-and-rings/bridal-collection" className="hover:underline">
                Bridal Collection
              </Link>
            </li>
            <li className="text-gray-400">›</li>
            <li>
              <Link
                href={`/attire-and-rings/bridal-collection/${product.category.slug}`}
                className="hover:underline"
              >
                {product.category.name}
              </Link>
            </li>
            <li className="text-gray-400">›</li>
            <li className="text-gray-900 truncate max-w-[260px]">{product.name}</li>
          </ol>
        </nav>

        {/* Main hero — 3-column layout (gallery+vendor / details / Order Details) */}
        <PdpHero product={product} />

        {/* About this piece — 2-column with spec table + trust strip */}
        <section id="about" className="border-t border-gray-100">
          <div className="max-w-7xl mx-auto px-2 lg:px-2 py-12">
            <h2 className="text-2xl font-serif font-medium text-gray-900 mb-6">About this piece</h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12 items-start">
              {/* Left — description + what's included */}
              <div className="lg:col-span-2">
                <ExpandableText
                  text={product.description}
                  limit={240}
                  className="text-[15px] text-gray-700 leading-relaxed mb-8"
                />

                <h3 className="text-base font-semibold text-gray-900 mb-4">What&apos;s included</h3>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm text-gray-800">
                  {product.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2.5">
                      <Check size={16} className="mt-0.5 text-emerald-600 shrink-0" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>

                {/* Trust strip */}
                <div className="mt-10 pt-6 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <div className="flex items-start gap-3">
                    <ShieldCheck size={20} className="mt-0.5 text-emerald-600 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Verified maker</p>
                      <p className="text-xs text-gray-600">Authentic, hand-finished in {product.madeIn}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Scissors size={20} className="mt-0.5 text-gray-700 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Free fittings</p>
                      <p className="text-xs text-gray-600">Two visits included at the boutique</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <RotateCcw size={20} className="mt-0.5 text-gray-700 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Lifetime cleaning</p>
                      <p className="text-xs text-gray-600">Polish and minor repairs included</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right — specs card */}
              <aside className="lg:col-span-1">
                <div className="rounded-2xl border border-gray-200 p-6 bg-white">
                  <h3 className="text-base font-bold text-gray-900 mb-4">Specifications</h3>
                  <dl className="text-sm divide-y divide-gray-100">
                    <div className="flex justify-between gap-4 py-2.5">
                      <dt className="text-gray-600 shrink-0">Material</dt>
                      <dd className="font-medium text-gray-900 text-right">
                        {SPEC_MATERIAL[product.category.slug] ?? 'Premium materials'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 py-2.5">
                      <dt className="text-gray-600 shrink-0">Made by hand in</dt>
                      <dd className="font-medium text-gray-900 text-right">{product.madeIn}</dd>
                    </div>
                    <div className="flex justify-between gap-4 py-2.5">
                      <dt className="text-gray-600 shrink-0">Lead time</dt>
                      <dd className="font-medium text-gray-900 text-right">
                        {SPEC_LEAD_TIME[product.category.slug] ?? 'Made to order'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 py-2.5">
                      <dt className="text-gray-600 shrink-0">Ships from</dt>
                      <dd className="font-medium text-gray-900 text-right">
                        {product.vendor.location}, Tanzania
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 py-2.5">
                      <dt className="text-gray-600 shrink-0">Delivery</dt>
                      <dd className="font-medium text-gray-900 text-right">Tanzania-wide</dd>
                    </div>
                    <div className="flex justify-between gap-4 py-2.5">
                      <dt className="text-gray-600 shrink-0">Returns</dt>
                      <dd className="font-medium text-gray-900 text-right max-w-[60%]">
                        30-day on stock items; custom pieces are final sale
                      </dd>
                    </div>
                  </dl>
                </div>
              </aside>
            </div>
          </div>
        </section>

        {/* Meet the boutique — full-width with mini products */}
        <section className="border-t border-gray-100 bg-[#fbfaf6]">
          <div className="max-w-7xl mx-auto px-2 lg:px-2 py-12">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-8 lg:gap-12 items-start">
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-2">Meet the boutique</p>
                <h2 className="text-2xl md:text-3xl font-serif font-medium text-gray-900 mb-3">{product.vendor.name}</h2>
                <div className="flex items-center gap-2 text-sm text-gray-700 mb-2">
                  <MapPin size={14} />
                  {product.vendor.location}, Tanzania
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700 mb-1">
                  <span className="font-semibold text-gray-900">{product.vendor.rating}</span>
                  <Star size={13} className="fill-gray-900 text-gray-900" />
                  <span>· {product.vendor.reviews.toLocaleString()} reviews</span>
                </div>
                <p className="text-xs text-gray-600 mb-5">{product.vendor.yearsActive} years on OpusFesta</p>
                <p className="text-[15px] text-gray-700 leading-relaxed mb-6 max-w-md">
                  Every piece you see here is made by the team at {product.vendor.name}. They take walk-in fittings, ship across Tanzania, and answer messages within a day.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href={`/vendors?search=${encodeURIComponent(product.vendor.name)}`}
                    className="h-11 bg-gray-900 text-white text-sm font-semibold rounded-full hover:bg-gray-800 transition inline-flex items-center px-6"
                  >
                    Visit boutique
                  </Link>
                  <Link
                    href={`/vendors?search=${encodeURIComponent(product.vendor.name)}&contact=1`}
                    className="h-11 bg-white text-gray-900 text-sm font-semibold rounded-full border border-gray-300 hover:bg-gray-50 transition inline-flex items-center px-6"
                  >
                    Message vendor
                  </Link>
                </div>
              </div>

              <div>
                <div className="flex items-end justify-between mb-4">
                  <h3 className="text-base font-semibold text-gray-900">More from {product.vendor.name}</h3>
                  <Link
                    href={`/attire-and-rings/bridal-collection/${product.category.slug}`}
                    className="text-sm font-medium text-gray-900 underline underline-offset-4 inline-flex items-center gap-1 hover:text-gray-600"
                  >
                    See all <ChevronRight size={14} />
                  </Link>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {fromShop.slice(0, 4).map((p) => (
                    <Link
                      key={p.id}
                      href={`/attire-and-rings/bridal-collection/${product.category.slug}/p/${p.id}`}
                      className="group"
                    >
                      <div className="aspect-square overflow-hidden rounded-lg bg-gray-100 mb-2">
                        <img src={p.img} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      </div>
                      <p className="text-[13px] font-medium text-gray-900 line-clamp-2 leading-snug group-hover:underline">{p.name}</p>
                      <p className="text-[13px] font-bold text-gray-900 mt-0.5">{p.price}</p>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Reviews — mirrors the vendor-detail review section */}
        <div className="max-w-7xl mx-auto px-2 lg:px-2">
          <ProductReviewsSection product={product} />
        </div>

        {/* You may also like */}
        <section className="border-t border-gray-100">
          <div className="max-w-7xl mx-auto px-2 lg:px-2 py-12">
            <h2 className="text-2xl font-serif font-medium text-gray-900 mb-6">You may also like</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-8">
              {youMayLike.map((p) => (
                <Link
                  key={p.id}
                  href={`/attire-and-rings/bridal-collection/${product.category.slug}/p/${p.id}`}
                  className="group"
                >
                  <div className="relative aspect-square overflow-hidden rounded-lg bg-gray-100 mb-2">
                    <img src={p.img} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    {p.badge && (
                      <span className="absolute top-2 left-2 bg-white/95 backdrop-blur-sm px-2 py-0.5 rounded-full text-[10px] font-semibold text-gray-900 shadow-sm">
                        {p.badge}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-700 mb-0.5">
                    <span className="font-semibold text-gray-900">{p.rating}</span>
                    <Star size={11} className="fill-gray-900 text-gray-900" />
                    <span className="text-gray-500">({p.reviews.toLocaleString()})</span>
                  </div>
                  <p className="text-sm text-gray-900 line-clamp-2 group-hover:underline">{p.name}</p>
                  <p className="text-sm font-bold text-gray-900 mt-0.5">{p.price}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Related trends */}
        <section className="border-t border-gray-100">
          <div className="max-w-7xl mx-auto px-2 lg:px-2 py-12">
            <h2 className="text-2xl font-serif font-medium text-gray-900 mb-6">Explore related trends</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              {relatedTrends.map((t) => (
                <Link
                  key={t.name}
                  href={`/attire-and-rings/bridal-collection/${product.category.slug}?trend=${encodeURIComponent(t.name)}`}
                  className="group"
                >
                  <div className="aspect-square overflow-hidden rounded-lg bg-gray-100 mb-2">
                    <img src={t.img} alt={t.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                  <p className="text-sm font-semibold text-gray-900 text-center group-hover:underline">{t.name}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Personalised picks CTA */}
        <section className="max-w-7xl mx-auto px-2 lg:px-2 py-12">
          <div className="rounded-2xl overflow-hidden bg-[#fbeed1]">
            <div className="grid grid-cols-1 md:grid-cols-2">
              <div className="relative min-h-[220px] md:min-h-[280px]">
                <img
                  src="https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=1200&q=80"
                  alt="Wedding scene"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </div>
              <div className="p-8 md:p-10 flex flex-col justify-center">
                <h2 className="text-2xl md:text-3xl font-serif font-medium text-gray-900 leading-tight mb-3">
                  Get personalised picks for your big day
                </h2>
                <p className="text-sm text-gray-700 mb-5">
                  Tell us your wedding date and we&apos;ll send a curated edit of attire, rings, and accessories from boutiques near you.
                </p>
                <form className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="date"
                    aria-label="Wedding date"
                    className="h-11 rounded-full border border-gray-300 bg-white px-4 text-sm focus:outline-none focus:border-gray-500"
                  />
                  <button data-opus-button="primary" data-opus-button-size="medium"
                    type="button"
                    className="h-11 bg-gray-900 text-white text-sm font-semibold px-6 rounded-full hover:bg-gray-800 transition"
                  >
                    Save the date
                  </button>
                </form>
              </div>
            </div>
          </div>
        </section>

        {/* Top searches */}
        <section className="border-t border-gray-100">
          <div className="max-w-7xl mx-auto px-2 lg:px-2 py-12">
            <h2 className="text-xl font-serif font-medium text-gray-900 mb-6">Top searches in {product.category.name.toLowerCase()}</h2>
            <div className="flex flex-wrap gap-2">
              {[
                ...product.category.subTrends.map((t) => t.name),
                ...BRIDAL_CATEGORIES.slice(0, 6).map((c) => c.name),
              ].map((tag) => (
                <Link
                  key={tag}
                  href={`/attire-and-rings/bridal-collection/${product.category.slug}?trend=${encodeURIComponent(tag)}`}
                  className="px-3 py-1.5 rounded-full border border-gray-300 bg-white text-sm text-gray-800 hover:bg-gray-50 hover:border-gray-400 transition"
                >
                  {tag}
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}
