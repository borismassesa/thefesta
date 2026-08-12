import type { Metadata } from 'next'
import { draftMode } from 'next/headers'
import { PreviewBanner } from '@/components/PreviewBanner'
import { getLocale } from '@/lib/cms/locale'
import { loadWebsitesHeroContent } from '@/lib/cms/websites-hero'
import { loadWebsitesDesignsContent } from '@/lib/cms/websites-designs'
import { loadWebsitesSellingPointsContent } from '@/lib/cms/websites-selling-points'
import { loadWebsitesFeaturesContent } from '@/lib/cms/websites-features'
import { loadWebsitesFaqsContent } from '@/lib/cms/websites-faqs'
import { loadWebsitesTestimonialsContent } from '@/lib/cms/websites-testimonials'
import { DigitalCardShowcase } from '@/components/home/DigitalCardShowcase'
import WebsitesLandingClient from './WebsitesLandingClient'

// CMS-driven AND locale-aware: sections resolve content from the per-visitor
// `opuspass_locale` cookie (see lib/cms/locale.ts), so this route must render
// dynamically — a shared ISR cache entry keys only on path and would serve one
// visitor's language to everyone. Published changes appear immediately (no ISR
// window); the admin's on-demand revalidate is a harmless no-op for this route.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Wedding Websites | OpusPass',
  description:
    'Build a free wedding website in minutes with OpusPass. Beautiful designs, bilingual RSVPs, registry links and live guest updates — all in one place.',
}

export default async function WebsitesLandingPage() {
  const locale = await getLocale()
  const [{ isEnabled: isDraft }, hero, designs, sellingPoints, features, faqs, testimonials] =
    await Promise.all([
      draftMode(),
      loadWebsitesHeroContent(locale),
      loadWebsitesDesignsContent(locale),
      loadWebsitesSellingPointsContent(locale),
      loadWebsitesFeaturesContent(locale),
      loadWebsitesFaqsContent(locale),
      loadWebsitesTestimonialsContent(locale),
    ])
  return (
    <>
      {isDraft && <PreviewBanner />}
      <WebsitesLandingClient
        hero={hero}
        designs={designs}
        sellingPoints={sellingPoints}
        features={features}
        faqs={faqs}
        testimonials={<DigitalCardShowcase content={testimonials} />}
      />
    </>
  )
}
