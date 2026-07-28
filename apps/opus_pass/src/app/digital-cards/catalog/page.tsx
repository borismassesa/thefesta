import type { Metadata } from 'next'
import { draftMode } from 'next/headers'
import { PreviewBanner } from '@/components/PreviewBanner'
import { loadDigitalCardsPromoBannerContent } from '@/lib/cms/digital-cards-promo-banner'
import { loadDigitalCardCategoriesList } from '@/lib/cms/digital-cards-categories'
import { styleStripFromCategories } from '@/lib/cms/digital-cards-style-strip'
import { loadDigitalCardProducts } from '@/lib/cms/digital-cards-products'
import { loadPackagesContent, packageFromPrice } from '@/lib/cms/packages'
import { getLocale } from '@/lib/cms/locale'
import DigitalCardsCatalogClient from './DigitalCardsCatalogClient'

// CMS-driven AND locale-aware (reads the opuspass_locale cookie), so it renders
// dynamically — see lib/cms/locale.ts.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Wedding Digital Cards | OpusPass',
  description:
    'Browse wedding digital cards, save the dates, and RSVP cards. Personalise with your colours, photos, and bilingual copy — designed for Tanzanian weddings.',
}

export default async function DigitalCardsCatalogPage() {
  const locale = await getLocale()
  const [{ isEnabled: isDraft }, products, promoBanner, categories, packages] =
    await Promise.all([
      draftMode(),
      loadDigitalCardProducts(locale),
      loadDigitalCardsPromoBannerContent(locale),
      loadDigitalCardCategoriesList(locale),
      loadPackagesContent(locale),
    ])
  return (
    <>
      {isDraft && <PreviewBanner />}
      <DigitalCardsCatalogClient
        products={products}
        fromGuestPrice={packageFromPrice(packages)}
        perGuestLabel={packages.perGuestLabel}
        perDesignLabel={packages.perDesignLabel}
        fromLabel={packages.fromLabel}
        promoBanner={promoBanner}
        styleStrip={styleStripFromCategories(categories)}
      />
    </>
  )
}
