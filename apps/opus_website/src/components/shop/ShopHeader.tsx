import Link from 'next/link'
import { MapPin, Package, Store } from 'lucide-react'
import type { ShopVendor } from '@/lib/products-db'

// Header band for a product vendor's public shop page. Deliberately spare:
// these sellers have a business name, a location, a join date and their stock,
// and nothing else is invented. No rating row unless real reviews exist, no
// stock photography, no "verified since" badges.
export default function ShopHeader({
  shop,
  backHref,
  backLabel,
}: {
  shop: ShopVendor
  backHref: string
  backLabel: string
}) {
  return (
    <header className="border-b border-gray-200 bg-[#f7f4ee]">
      {shop.coverImage ? (
        <div className="h-40 w-full overflow-hidden bg-gray-200 md:h-56">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shop.coverImage} alt="" className="h-full w-full object-cover" />
        </div>
      ) : null}

      <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-5 text-xs text-gray-500">
          <Link href={backHref} className="hover:text-gray-900 hover:underline">
            {backLabel}
          </Link>
          <span className="px-1.5">/</span>
          <span className="text-gray-900">{shop.name}</span>
        </nav>

        <div className="flex flex-col gap-5 md:flex-row md:items-center">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-gray-200 bg-white md:h-20 md:w-20">
            {shop.logo ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={shop.logo} alt="" className="h-full w-full object-cover" />
            ) : (
              <Store size={26} className="text-gray-400" aria-hidden />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-3xl font-medium leading-tight text-gray-900 md:text-4xl">
              {shop.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-gray-600">
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={14} aria-hidden />
                {shop.location}, Tanzania
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Package size={14} aria-hidden />
                {shop.productCount} {shop.productCount === 1 ? 'item' : 'items'}
              </span>
              <span>
                {shop.yearsActive} {shop.yearsActive === 1 ? 'year' : 'years'} on OpusFesta
              </span>
              {/* Rating only when reviews actually exist. */}
              {shop.rating && shop.reviewCount > 0 ? (
                <span>
                  <strong className="font-semibold text-gray-900">{shop.rating}</strong> ·{' '}
                  {shop.reviewCount.toLocaleString()}{' '}
                  {shop.reviewCount === 1 ? 'review' : 'reviews'}
                </span>
              ) : null}
            </div>
            {shop.description ? (
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-gray-700">
                {shop.description}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  )
}
