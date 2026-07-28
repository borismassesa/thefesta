import { ProductsEditor } from './ProductsEditor'
import { loadProductCategories, loadProducts } from './actions'
import { redirectServiceVendors } from '@/lib/storefront/vertical-guard'

// Products tab, for gift-shop and attire & rings vendors only. Service vendors
// land back on the storefront overview instead of a dead tab.
export default async function ProductsPage() {
  await redirectServiceVendors('/storefront')

  const [productsResult, categories] = await Promise.all([
    loadProducts(),
    loadProductCategories(),
  ])

  return (
    <ProductsEditor
      initialProducts={productsResult.ok ? productsResult.products : []}
      categories={categories}
    />
  )
}
