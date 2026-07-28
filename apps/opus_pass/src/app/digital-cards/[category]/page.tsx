import type { Metadata } from 'next'
import { draftMode } from 'next/headers'
import { notFound } from 'next/navigation'
import { PreviewBanner } from '@/components/PreviewBanner'
import { findCategory } from '@/data/digital-cards-categories'
import { loadDigitalCardCategoriesList } from '@/lib/cms/digital-cards-categories'
import { loadDigitalCardsPromoBannerContent } from '@/lib/cms/digital-cards-promo-banner'
import { styleStripFromCategories } from '@/lib/cms/digital-cards-style-strip'
import { loadDigitalCardProducts } from '@/lib/cms/digital-cards-products'
import { loadPackagesContent, packageFromPrice } from '@/lib/cms/packages'
import { getLocale } from '@/lib/cms/locale'
import DigitalCardsCategoryClient from './DigitalCardsCategoryClient'

// CMS-driven AND locale-aware (reads the opuspass_locale cookie), so it renders
// dynamically — see lib/cms/locale.ts.
export const dynamic = 'force-dynamic'

type Params = { category: string }

export async function generateStaticParams() {
  const categories = await loadDigitalCardCategoriesList()
  return categories.map((c) => ({ category: c.slug }))
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { category } = await params
  const categories = await loadDigitalCardCategoriesList()
  const cat = findCategory(categories, category)
  if (!cat) return { title: 'Category not found | OpusPass' }
  const description = `Browse ${cat.label.toLowerCase()} designs — bilingual digital cards for Tanzanian weddings.`
  return {
    title: `${cat.label} | OpusPass Digital Cards`,
    description,
    openGraph: {
      title: `${cat.label} | OpusPass Digital Cards`,
      description,
      images: cat.img ? [{ url: cat.img, alt: cat.label }] : [],
      type: 'website',
    },
  }
}

export default async function DigitalCardsCategoryPage({ params }: { params: Promise<Params> }) {
  const { category } = await params
  const locale = await getLocale()
  const [{ isEnabled: isDraft }, categories, products, promoBanner, packages] =
    await Promise.all([
      draftMode(),
      loadDigitalCardCategoriesList(locale),
      loadDigitalCardProducts(locale),
      loadDigitalCardsPromoBannerContent(locale),
      loadPackagesContent(locale),
    ])
  const cat = findCategory(categories, category)
  if (!cat) return notFound()
  return (
    <>
      {isDraft && <PreviewBanner />}
      <DigitalCardsCategoryClient
        category={cat}
        categories={categories}
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
