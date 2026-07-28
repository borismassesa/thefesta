import Link from 'next/link'
import { MapPin, Store } from 'lucide-react'
import type { ShopVendor } from '@/lib/products-db'
import { shopBasePath } from '@/lib/products-db'

// One shop in a shops index / "shops on OpusFesta" row. Uses the seller's own
// cover image and logo when they've uploaded them, and a plain placeholder
// when they haven't — never a stock photo standing in for a real storefront.
export default function ShopCard({ shop }: { shop: ShopVendor }) {
  return (
    <Link
      href={`${shopBasePath(shop.vertical)}/${shop.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:border-gray-400 hover:shadow-md"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
        {shop.coverImage ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={shop.coverImage}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[#f7f4ee]">
            <Store size={30} className="text-gray-400" aria-hidden />
          </div>
        )}
      </div>

      <div className="flex flex-1 items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-white">
          {shop.logo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={shop.logo} alt="" className="h-full w-full object-cover" />
          ) : (
            <Store size={16} className="text-gray-400" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-gray-900 group-hover:underline">{shop.name}</p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-500">
            <MapPin size={11} aria-hidden />
            {shop.location} · {shop.productCount} {shop.productCount === 1 ? 'item' : 'items'}
          </p>
        </div>
      </div>
    </Link>
  )
}
