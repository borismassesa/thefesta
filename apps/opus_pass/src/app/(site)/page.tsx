import type { Metadata } from 'next'
import { draftMode } from 'next/headers'
import SiteChrome from '@/components/chrome/SiteChrome'
import { PreviewBanner } from '@/components/PreviewBanner'
import { Hero } from '@/components/home/Hero'
import { Manifesto } from '@/components/home/Manifesto'
import { Showcase } from '@/components/home/Showcase'
import { WhyOpusPass } from '@/components/home/WhyOpusPass'
import { DigitalCardShowcase } from '@/components/home/DigitalCardShowcase'
import { Promises } from '@/components/home/Promises'
import { Features } from '@/components/home/Features'

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://opuspass.opusfesta.com'
const OPUS_PASS_LOGO = `${BASE}/assets/logo/OpusPass%20Logo.svg`

// CMS-driven AND locale-aware: sections resolve content from the per-visitor
// `opuspass_locale` cookie (see lib/cms/locale.ts), so this route must render
// dynamically — a shared ISR cache entry keys only on path and would serve one
// visitor's language to everyone. Published changes appear immediately (no ISR
// window); the admin's on-demand revalidate is a harmless no-op for this route.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'OpusPass — Your wedding, in one digital pass',
  description:
    'Digital cards, live RSVP tracking, and a beautiful wedding website — all in one pass. Free to start. Built for couples in Tanzania.',
  openGraph: {
    title: 'OpusPass — Your wedding, in one digital pass',
    description:
      'Digital cards, live RSVP tracking, and a beautiful wedding website — all in one pass.',
    // Absolute URL so link scrapers resolve the OG image against the subdomain.
    images: [{ url: OPUS_PASS_LOGO, alt: 'OpusPass' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    images: [OPUS_PASS_LOGO],
  },
}

export default async function HomePage() {
  const { isEnabled: isDraft } = await draftMode()
  return (
    <>
      {isDraft && <PreviewBanner />}
      <SiteChrome>
        <Hero />
        <Showcase />
        <WhyOpusPass />
        <Features />
        <DigitalCardShowcase />
        <div className="bg-[#FAF6EF]">
          <Manifesto />
          <Promises />
        </div>
      </SiteChrome>
    </>
  )
}
