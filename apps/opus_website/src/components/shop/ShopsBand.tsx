import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import ShopCard from '@/components/shop/ShopCard'
import { getShopVendors, type ShopVertical } from '@/lib/products-db'

// "Sellers on OpusFesta" band for a vertical's landing page. Renders nothing
// when no seller in the vertical has live stock — the surrounding pages are
// marketing pages, and an empty-state placeholder there reads as a broken
// section rather than an honest "no sellers yet".
export default async function ShopsBand({
  vertical,
  eyebrow,
  heading,
  blurb,
  allHref,
  allLabel,
  limit = 4,
}: {
  vertical: ShopVertical
  eyebrow: string
  heading: string
  blurb: string
  allHref: string
  allLabel: string
  limit?: number
}) {
  const shops = await getShopVendors(vertical)
  if (shops.length === 0) return null

  return (
    <section className="bg-white py-14">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{eyebrow}</p>
            <h2 className="mt-1 font-serif text-3xl font-medium leading-tight text-gray-900 md:text-4xl">
              {heading}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-600">{blurb}</p>
          </div>
          <Link
            href={allHref}
            className="inline-flex items-center gap-1 text-sm font-medium text-gray-900 underline underline-offset-4 hover:text-gray-600"
          >
            {allLabel} <ChevronRight size={14} aria-hidden />
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {shops.slice(0, limit).map((shop) => (
            <ShopCard key={shop.id} shop={shop} />
          ))}
        </div>
      </div>
    </section>
  )
}
