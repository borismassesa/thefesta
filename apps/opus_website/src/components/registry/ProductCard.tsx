import Link from 'next/link'
import { Heart, Star } from 'lucide-react'
import AddToRegistryButton from './AddToRegistryButton'
import type { Product } from '@/lib/registry-products'

// `href` overrides where the card links. The registry browse pages use the
// default category route; the attire shop pages pass their own PDP path, since
// attire products aren't part of the registry category taxonomy.
export default function ProductCard({ p, href }: { p: Product; href?: string }) {
  return (
    <div className="group">
      <Link href={href ?? `/registry/${p.category.slug}/p/${p.id}`} className="block">
        <div className="relative aspect-square overflow-hidden rounded-lg bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.img}
            alt={p.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          {p.badge && (
            <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-gray-900 shadow-sm backdrop-blur-sm">
              {p.badge}
            </span>
          )}
          <span
            aria-label="Favorite"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-700 shadow-sm transition-colors hover:text-red-500"
          >
            <Heart size={16} />
          </span>
        </div>
        <div className="pt-3">
          {/* Only once the product has reviews. Every DB-backed product starts
              at zero, and "5.0 ★ (0)" is a rating nobody gave it. */}
          {p.reviews > 0 && (
            <div className="mb-1 flex items-center gap-1 text-xs text-gray-700">
              <span className="font-semibold text-gray-900">{p.rating}</span>
              <Star size={12} className="fill-gray-900 text-gray-900" />
              <span className="text-gray-500">({p.reviews.toLocaleString()})</span>
            </div>
          )}
          <h3 className="mb-1 line-clamp-2 text-[13px] font-medium leading-snug text-gray-900 group-hover:underline">
            {p.name}
          </h3>
          <div className="mb-2.5 flex items-baseline gap-2">
            <span className="text-[13px] font-bold text-gray-900">{p.price}</span>
            {p.oldPrice && <span className="text-[12px] text-gray-500 line-through">{p.oldPrice}</span>}
          </div>
        </div>
      </Link>
      <AddToRegistryButton product={{ id: p.id, name: p.name, img: p.img, price: p.price, category: p.category.slug }} />
    </div>
  )
}
