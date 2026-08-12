import type { Metadata } from 'next'
import { requireDashboardUser } from '@/lib/dashboard/auth'
import { listFavoriteProductIds } from '@/lib/dashboard/favorites'
import { loadDigitalCardProducts } from '@/lib/cms/digital-cards-products'
import { loadDigitalCardCategoriesList } from '@/lib/cms/digital-cards-categories'
import { styleStripFromCategories } from '@/lib/cms/digital-cards-style-strip'
import { loadPackagesContent, packageFromPrice } from '@/lib/cms/packages'
import { getLocale } from '@/lib/cms/locale'
import FavoritesClient from './FavoritesClient'

// Per-user saved designs — reads the couple's favorites and the current locale
// cookie, so it renders dynamically.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Saved Designs | OpusPass',
  description: 'The wedding digital card designs you have saved.',
}

export default async function FavoritesPage() {
  const user = await requireDashboardUser('/digital-cards/favorites')
  const locale = await getLocale()
  const [ids, products, packages, categories] = await Promise.all([
    listFavoriteProductIds(user.id),
    loadDigitalCardProducts(locale),
    loadPackagesContent(locale),
    loadDigitalCardCategoriesList(locale),
  ])

  // Keep the couple's newest-first save order; drop any ids whose product has
  // since been unpublished (the LEFT-join equivalent of a missing product).
  const byId = new Map(products.map((p) => [p.id, p]))
  const favorites = ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p))

  return (
    <FavoritesClient
      products={favorites}
      styleStrip={styleStripFromCategories(categories)}
      fromGuestPrice={packageFromPrice(packages)}
      perGuestLabel={packages.perGuestLabel}
      perDesignLabel={packages.perDesignLabel}
      fromLabel={packages.fromLabel}
    />
  )
}
