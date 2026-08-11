import type { Metadata } from 'next'
import Link from 'next/link'
import { Star, ArrowRight } from 'lucide-react'
import Navbar from '@/components/navbar'
import Footer from '@/components/footer'
import { BRIDAL_CATEGORIES } from '@/lib/bridal-categories'

export const metadata: Metadata = {
  title: 'Bridal Collection | OpusFesta',
  description:
    "OpusFesta's bridal collection — dresses, rings, suits, accessories, and curated wedding looks from trusted Tanzanian boutiques.",
}


type Product = { name: string; price: string; oldPrice?: string; rating?: string; img: string; pick?: boolean }

const CLASSIC_WHITE: Product[] = [
  { name: 'A-line lace bridal gown', price: 'TZS 1,450,000', oldPrice: 'TZS 1,800,000', rating: '4.8', img: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=600&q=80', pick: true },
  { name: 'Cathedral-length chapel veil', price: 'TZS 240,000', rating: '4.9', img: 'https://images.unsplash.com/photo-1606800052052-a08af7148866?auto=format&fit=crop&w=600&q=80', pick: true },
  { name: 'Solitaire round-cut engagement ring', price: 'TZS 3,200,000', rating: '5.0', img: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=600&q=80', pick: true },
  { name: 'Pavé eternity wedding band', price: 'TZS 890,000', oldPrice: 'TZS 1,050,000', rating: '4.7', img: 'https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?auto=format&fit=crop&w=600&q=80', pick: true },
  { name: 'Pearl drop bridal earrings', price: 'TZS 165,000', rating: '4.8', img: 'https://images.unsplash.com/photo-1591604466107-ec97de577aff?auto=format&fit=crop&w=600&q=80' },
  { name: 'Closed-toe satin bridal heels', price: 'TZS 320,000', rating: '4.6', img: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=600&q=80' },
  { name: 'Classic three-piece groom suit', price: 'TZS 1,150,000', rating: '4.9', img: 'https://images.unsplash.com/photo-1593030761757-71fae45fa0e7?auto=format&fit=crop&w=600&q=80' },
  { name: 'Silk groomsmen pocket squares (set of 6)', price: 'TZS 95,000', rating: '4.7', img: 'https://images.unsplash.com/photo-1589756823695-278bc923f962?auto=format&fit=crop&w=600&q=80' },
]

const COASTAL_ZANZIBAR: Product[] = [
  { name: 'Lightweight chiffon beach gown', price: 'TZS 980,000', rating: '4.9', img: 'https://images.unsplash.com/photo-1591604466107-ec97de577aff?auto=format&fit=crop&w=600&q=80', pick: true },
  { name: 'Hand-beaded coral hair piece', price: 'TZS 175,000', rating: '4.8', img: 'https://images.unsplash.com/photo-1606800052052-a08af7148866?auto=format&fit=crop&w=600&q=80', pick: true },
  { name: 'Sea-glass inspired bridal band', price: 'TZS 720,000', oldPrice: 'TZS 870,000', rating: '4.7', img: 'https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?auto=format&fit=crop&w=600&q=80', pick: true },
  { name: 'Linen blazer & trousers set', price: 'TZS 760,000', rating: '4.8', img: 'https://images.unsplash.com/photo-1593030761757-71fae45fa0e7?auto=format&fit=crop&w=600&q=80', pick: true },
  { name: 'Barefoot sandal foot jewellery', price: 'TZS 85,000', rating: '4.6', img: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=600&q=80' },
  { name: 'Driftwood ring bearer pillow', price: 'TZS 110,000', rating: '4.9', img: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=600&q=80' },
  { name: 'Bohemian bridesmaid sundresses', price: 'TZS 420,000', rating: '4.7', img: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=600&q=80' },
  { name: 'Hand-stitched cowrie groom cufflinks', price: 'TZS 65,000', rating: '4.8', img: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80' },
]

const DISCOVER_MORE = [
  { label: 'Planning Guides', desc: 'Step-by-step help', href: '/advice-and-ideas', bg: '#fff4d6' },
  { label: 'Real Weddings', desc: 'Stories from couples', href: '/advice-and-ideas#real-weddings', bg: '#ffe8e0' },
  { label: 'Editorial Picks', desc: "Stylists' favourites", href: '/attire-and-rings#editor-picks', bg: '#dde6ec' },
  { label: 'Vendor Directory', desc: 'Browse all boutiques', href: '/vendors', bg: '#e8f0e1' },
]

function ProductCard({ p }: { p: Product }) {
  return (
    <div className="group cursor-pointer">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-gray-100">
        <img src={p.img} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        {p.pick && (
          <span className="absolute top-3 left-3 bg-white/95 backdrop-blur-sm px-2.5 py-1 rounded-full text-[11px] font-semibold text-gray-900 shadow-sm">
            OpusFesta&apos;s Pick
          </span>
        )}
      </div>
      <div className="pt-3">
        {p.rating && (
          <div className="flex items-center gap-1 text-xs text-gray-600 mb-1">
            <span className="font-semibold text-gray-900">{p.rating}</span>
            <Star size={12} className="fill-gray-900 text-gray-900" />
          </div>
        )}
        <h3 className="text-[13px] font-medium text-gray-900 leading-snug line-clamp-2 mb-1 group-hover:underline">
          {p.name}
        </h3>
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-bold text-gray-900">{p.price}</span>
          {p.oldPrice && <span className="text-[12px] text-gray-500 line-through">{p.oldPrice}</span>}
        </div>
      </div>
    </div>
  )
}

export default function BridalCollectionPage() {
  return (
    <>
      <Navbar />

      <main className="bg-white text-gray-900 font-sans">
        <section className="bg-[#fbeed1] pt-12 pb-24 md:pt-16 md:pb-32 px-4">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-serif font-medium text-gray-900 mb-4 text-center">
              OpusFesta&apos;s Bridal Collection
            </h1>
            <p className="text-sm md:text-base text-gray-700 leading-relaxed text-center md:whitespace-nowrap overflow-x-auto hide-scrollbar">
              A handpicked edit of rings, gowns, suits, and accessories from Tanzania&apos;s most trusted bridal boutiques and jewellers.
            </p>
          </div>
        </section>

        <section className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 -mt-16 md:-mt-20 pb-12 md:pb-16">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-x-6 md:gap-x-8 gap-y-10 md:gap-y-12">
            {BRIDAL_CATEGORIES.map((cat) => (
              <Link key={cat.slug} href={`/attire-and-rings/bridal-collection/${cat.slug}`} className="group flex flex-col items-center text-center">
                <div className="aspect-square w-full overflow-hidden rounded-full bg-white ring-1 ring-gray-200 mb-3 transition-shadow group-hover:shadow-md">
                  <img src={cat.img} alt={cat.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
                <span className="inline-flex items-center gap-1 text-xs md:text-sm font-medium text-gray-800 group-hover:underline">
                  {cat.name}
                  <ArrowRight size={14} className="shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 lg:px-8 pb-12">
          <div className="rounded-2xl md:rounded-3xl overflow-hidden bg-white border border-gray-200 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2">
              <div className="flex flex-col justify-center px-8 md:px-12 py-10 md:py-14">
                <h2 className="text-2xl md:text-3xl lg:text-4xl font-serif font-medium text-gray-900 leading-tight mb-4">
                  Build your bridal vendor team
                </h2>
                <p className="text-sm md:text-base text-gray-700 leading-relaxed mb-6 max-w-md">
                  Connect with boutiques, jewellers, and tailors across Tanzania. Save the shops you love, book fittings, and pay securely in TZS.
                </p>
                <Link
                  href="/vendors"
                  className="inline-flex w-fit items-center bg-gray-900 text-white px-6 py-3 rounded-full font-medium hover:bg-gray-800 transition shadow-sm text-sm"
                >
                  Browse vendors
                </Link>
              </div>
              <div className="relative min-h-[260px] md:min-h-[320px]">
                <img
                  src="https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=1200&q=80"
                  alt="Wedding reception"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 lg:px-8 pt-6 pb-12">
          <h2 className="text-2xl md:text-3xl font-serif font-medium text-gray-900 text-center mb-8">
            Classic White Wedding
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8">
            {CLASSIC_WHITE.map((p) => (
              <ProductCard key={p.name} p={p} />
            ))}
          </div>
          <div className="mt-8 flex justify-center">
            <button data-opus-button="control" className="border border-gray-300 text-gray-900 font-medium px-6 py-2.5 rounded-full hover:bg-gray-50 transition text-sm">
              Show more
            </button>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 lg:px-8 pt-6 pb-12">
          <h2 className="text-2xl md:text-3xl font-serif font-medium text-gray-900 text-center mb-8">
            Coastal Zanzibar Wedding
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8">
            {COASTAL_ZANZIBAR.map((p) => (
              <ProductCard key={p.name} p={p} />
            ))}
          </div>
          <div className="mt-8 flex justify-center">
            <button data-opus-button="control" className="border border-gray-300 text-gray-900 font-medium px-6 py-2.5 rounded-full hover:bg-gray-50 transition text-sm">
              Show more
            </button>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 lg:px-8 py-12">
          <h2 className="text-2xl md:text-3xl font-serif font-medium text-gray-900 text-center mb-8">
            Discover more
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-6">
            {DISCOVER_MORE.map((tile) => (
              <Link
                key={tile.label}
                href={tile.href}
                className="group rounded-2xl overflow-hidden aspect-[4/3] flex flex-col justify-end p-5 hover:shadow-md transition-shadow"
                style={{ backgroundColor: tile.bg }}
              >
                <h3 className="text-base md:text-lg font-medium text-gray-900 group-hover:underline">
                  {tile.label}
                </h3>
                <p className="text-xs md:text-sm text-gray-700">{tile.desc}</p>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}
