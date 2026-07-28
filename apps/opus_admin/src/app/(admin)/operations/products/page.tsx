import {
  getModerationProducts,
  getProductModerationSummary,
  type ProductFilter,
} from './queries'
import ProductsModerationClient from './ProductsModerationClient'

export const dynamic = 'force-dynamic'

const FILTERS: ProductFilter[] = ['review', 'approved', 'rejected', 'all']

export default async function ProductsModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>
}) {
  const sp = await searchParams
  const filter: ProductFilter = FILTERS.includes(sp.filter as ProductFilter)
    ? (sp.filter as ProductFilter)
    : 'review'
  const q = sp.q ?? ''

  const [products, summary] = await Promise.all([
    getModerationProducts(filter, q),
    getProductModerationSummary(),
  ])

  return (
    <ProductsModerationClient
      products={products}
      summary={summary}
      filter={filter}
      query={q}
    />
  )
}
