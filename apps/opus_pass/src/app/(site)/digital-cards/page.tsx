import type { Metadata } from 'next'
import { draftMode } from 'next/headers'
import { PreviewBanner } from '@/components/PreviewBanner'
import { loadDigitalCardsFeaturesContent } from '@/lib/cms/digital-cards-features'
import { loadDigitalCardsFaqsContent } from '@/lib/cms/digital-cards-faqs'
import {
  loadDigitalCardsEditorsPicksContent,
  editorsPicksRowsFromProducts,
} from '@/lib/cms/digital-cards-editors-picks'
import { loadDigitalCardsCategoriesContent, cmsCategoryToRuntime } from '@/lib/cms/digital-cards-categories'
import { styleStripFromCategories } from '@/lib/cms/digital-cards-style-strip'
import { loadDigitalCardProducts } from '@/lib/cms/digital-cards-products'
import { loadPackagesContent, packageFromPrice } from '@/lib/cms/packages'
import { getLocale } from '@/lib/cms/locale'
import { DigitalCardShowcase } from '@/components/home/DigitalCardShowcase'
import DigitalCardsLandingClient from './DigitalCardsLandingClient'
import JsonLd from '@/components/JsonLd'

// CMS-driven AND locale-aware: sections resolve content from the per-visitor
// `opuspass_locale` cookie (see lib/cms/locale.ts), so this route must render
// dynamically — a shared ISR cache entry keys only on path and would serve one
// visitor's language to everyone. Published changes appear immediately (no ISR
// window); the admin's on-demand revalidate is a harmless no-op for this route.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Wedding Digital Cards | OpusPass',
  description:
    'Wedding digital cards, save the dates, RSVPs and thank yous designed for Tanzanian weddings. Bilingual wording, free wedding website, free RSVP page.',
}

export default async function DigitalCardsLandingPage() {
  const locale = await getLocale()
  const [
    { isEnabled: isDraft },
    categoriesContent,
    features,
    faqs,
    editorsPicksTemplate,
    products,
    packages,
  ] = await Promise.all([
    draftMode(),
    loadDigitalCardsCategoriesContent(locale),
    loadDigitalCardsFeaturesContent(locale),
    loadDigitalCardsFaqsContent(locale),
    loadDigitalCardsEditorsPicksContent(locale),
    loadDigitalCardProducts(locale),
    loadPackagesContent(locale),
  ])
  const categories = categoriesContent.categories.map(cmsCategoryToRuntime)
  const styleStrip = styleStripFromCategories(categories)
  // Editors' Picks renders live products from the DB (same source as the
  // catalog); the CMS section only supplies the editorial row headings.
  const editorsPicks = editorsPicksRowsFromProducts(products, editorsPicksTemplate, categories)
  const fromGuestPrice = packageFromPrice(packages)
  const faqSchema = faqs.items.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.items.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      }
    : null

  return (
    <>
      {faqSchema && <JsonLd data={faqSchema} />}
      {isDraft && <PreviewBanner />}
      <DigitalCardsLandingClient
        styleStrip={styleStrip}
        heroHeading={categoriesContent.heading}
        heroDescription={categoriesContent.description}
        features={features}
        faqs={faqs}
        editorsPicks={editorsPicks}
        fromGuestPrice={fromGuestPrice}
        perGuestLabel={packages.perGuestLabel}
        perDesignLabel={packages.perDesignLabel}
        fromLabel={packages.fromLabel}
        testimonials={<DigitalCardShowcase />}
      />
    </>
  )
}
