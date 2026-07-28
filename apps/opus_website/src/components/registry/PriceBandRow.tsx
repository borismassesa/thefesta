import ProductCard from './ProductCard'
import type { PriceBand } from '@/lib/registry-products'
import { getProductsUnder } from '@/lib/products-db'

export async function PriceBandRow({ band }: { band: PriceBand }) {
  const products = await getProductsUnder(band.maxTzs, 6)
  if (products.length === 0) return null

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-8">
      <h2 className="mb-6 text-2xl font-serif font-medium text-gray-900">{band.label}</h2>
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
        {products.map((p) => (
          <ProductCard key={`${p.category.slug}-${p.id}`} p={p} />
        ))}
      </div>
    </div>
  )
}
