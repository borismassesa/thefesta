import Link from 'next/link'
import ProductCard from './ProductCard'
import { getNewArrivals } from '@/lib/products-db'

export async function NewArrivalsRow() {
  const products = await getNewArrivals(8)
  if (products.length === 0) return null

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 lg:px-8">
      <div className="mb-6 flex items-end justify-between">
        <h2 className="text-2xl font-serif font-medium text-gray-900">New arrivals</h2>
        <Link href="/registry/kitchen-dining" className="text-sm font-medium text-gray-700 underline underline-offset-4 hover:text-gray-900">
          Shop all
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={`${p.category.slug}-${p.id}`} p={p} />
        ))}
      </div>
    </div>
  )
}
