import type { RegistryCategory } from './registry-categories'

// Registry shop shared TYPES + the curated home-page marketing rows
// (collections, brands, price bands). The actual product inventory now comes
// from real vendor products via `products-db.ts` — the old fake generated
// catalog (generateProduct / listProducts / mostPopularProducts / …) has been
// removed. Product money is a TZS integer; `id` is the product row uuid.

export type SwatchColor = { name: string; swatch: string }

export type ProductReview = {
  id: string
  author: string
  city: string
  rating: number
  date: string
  text: string
  weddingDate?: string
  media?: { type: 'photo' | 'video'; src: string; poster?: string }[]
}

export type Product = {
  id: string
  vendorId: string
  name: string
  price: string
  priceTzs: number
  oldPrice?: string
  oldPriceTzs?: number
  discountPct?: number
  rating: string
  reviews: number
  sold: number
  img: string
  gallery: string[]
  badge?: 'Bestseller' | "OpusFesta's Pick" | 'Most Wanted'
  mostWanted: boolean
  freeDelivery: boolean
  madeIn: string
  category: RegistryCategory
  brand: {
    name: string
    location: string
    rating: string
    reviews: number
    yearsActive: number
    /** Public shop page for this seller, when it's a real vendor
     *  (`/registry/shops/<slug>` or `/attire-and-rings/shops/<slug>`).
     *  Absent on seeded/demo products, which have no shop to link to. */
    href?: string
  }
  description: string
  highlights: string[]
  colors?: SwatchColor[]
  reviewSnippets: ProductReview[]
}

const IMG = {
  kitchen: 'https://images.unsplash.com/photo-1556909212-d5b604d0c90d?auto=format&fit=crop&w=1200&q=80',
  dinnerware: 'https://images.unsplash.com/photo-1562050344-f7ad946cee35?auto=format&fit=crop&w=1200&q=80',
  wineGlass: 'https://images.unsplash.com/photo-1613477581402-306fa9dc6b95?auto=format&fit=crop&w=1200&q=80',
  sofa: 'https://images.unsplash.com/photo-1759722665629-29df6ee4f9a5?auto=format&fit=crop&w=1200&q=80',
  coconutBeach: 'https://images.unsplash.com/photo-1551523713-c1473aa01d9f?auto=format&fit=crop&w=1200&q=80',
  giftBoxPink: 'https://images.unsplash.com/photo-1513201099705-a9746e1e201f?auto=format&fit=crop&w=1200&q=80',
}

export type Collection = { id: string; title: string; image: string; href: string }

export const REGISTRY_COLLECTIONS: Collection[] = [
  { id: 'essentials', title: 'Registry Essentials', image: IMG.kitchen, href: '/registry/kitchen-dining' },
  { id: 'guests-love', title: 'Gifts Guests Love to Give', image: IMG.giftBoxPink, href: '/registry/gifts-keepsakes' },
  { id: 'top-rated', title: 'Top Rated Products', image: IMG.sofa, href: '/registry/home-decor' },
  { id: 'kitchen-essentials', title: 'Ultimate Kitchen Essentials', image: IMG.dinnerware, href: '/registry/kitchen-dining' },
  { id: 'build-your-bar', title: 'Build Your Bar', image: IMG.wineGlass, href: '/registry/tabletop-bar' },
  { id: 'weekend-ready', title: 'Weekend Ready', image: IMG.coconutBeach, href: '/registry/outdoor-weekend' },
]

export type Brand = { name: string }

export const REGISTRY_BRANDS: Brand[] = [
  { name: 'Serengeti Home Co.' },
  { name: 'Kilimanjaro Kitchenware' },
  { name: 'Coastal Linen Studio' },
  { name: 'Dar Design House' },
  { name: 'Highland Living' },
  { name: 'Bagamoyo Ceramics' },
  { name: 'Mwanza Home Market' },
  { name: 'Tanga Trading Co.' },
]

export type PriceBand = { id: string; label: string; maxTzs: number }

export const PRICE_BANDS: PriceBand[] = [
  { id: 'under-50k', label: 'Gifts Under TZS 50,000', maxTzs: 50_000 },
  { id: 'under-150k', label: 'Gifts Under TZS 150,000', maxTzs: 150_000 },
  { id: 'under-350k', label: 'Gifts Under TZS 350,000', maxTzs: 350_000 },
]
