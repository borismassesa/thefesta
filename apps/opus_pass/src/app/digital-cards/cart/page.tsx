import { loadDigitalCardProducts } from '@/lib/cms/digital-cards-products'
import { loadPackagesContent, packageFromPrice } from '@/lib/cms/packages'
import { getLocale } from '@/lib/cms/locale'
import { loadUiStrings } from '@/lib/cms/ui-strings'
import { UIStringsProvider } from '@/components/providers/UIStringsProvider'
import CartClient from './CartClient'

// Products feed the "you might also like" cross-sell row. ISR safety net keeps
// the catalog in sync with CMS publishes (matches the catalog page).
export const revalidate = 60

export default async function CartPage() {
  const locale = await getLocale()
  const [products, packages, cart] = await Promise.all([
    loadDigitalCardProducts(locale),
    loadPackagesContent(locale),
    loadUiStrings('cart', locale),
  ])
  return (
    <UIStringsProvider bundles={{ cart }}>
      <CartClient
        products={products}
        fromGuestPrice={packageFromPrice(packages)}
        perGuestLabel={packages.perGuestLabel}
        perDesignLabel={packages.perDesignLabel}
        fromLabel={packages.fromLabel}
      />
    </UIStringsProvider>
  )
}
