import ProductCard from '@/components/registry/ProductCard'
import type { Product } from '@/lib/registry-products'

// A shop's live stock. `productHref` lets each surface route to its own PDP:
// registry products keep the category route, attire products live under their
// shop. Empty state is plain text rather than a "coming soon" promise — the
// seller may simply have nothing published right now.
export default function ShopProductGrid({
  products,
  shopName,
  productHref,
}: {
  products: Product[]
  shopName: string
  productHref?: (product: Product) => string
}) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-10 lg:px-8">
      <h2 className="mb-6 text-lg font-semibold text-gray-900 md:text-xl">
        {products.length > 0
          ? `${products.length} ${products.length === 1 ? 'item' : 'items'} from ${shopName}`
          : `From ${shopName}`}
      </h2>

      {products.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-5">
          {products.map((p) => (
            <ProductCard key={p.id} p={p} href={productHref?.(p)} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-gray-200 py-16 text-center">
          <p className="text-base font-semibold text-gray-900">Nothing listed right now</p>
          <p className="max-w-sm text-sm text-gray-600">
            {shopName} doesn&apos;t have anything on sale at the moment.
          </p>
        </div>
      )}
    </section>
  )
}
