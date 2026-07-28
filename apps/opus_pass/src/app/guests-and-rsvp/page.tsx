import type { Metadata } from 'next'
import { draftMode } from 'next/headers'
import { PreviewBanner } from '@/components/PreviewBanner'
import { DigitalCardShowcase } from '@/components/home/DigitalCardShowcase'
import { getLocale } from '@/lib/cms/locale'
import { loadGuestsHeroContent } from '@/lib/cms/guests-hero'
import { loadGuestsFeaturesContent } from '@/lib/cms/guests-features'
import { loadGuestsSpreadContent } from '@/lib/cms/guests-spread-the-joy'
import { loadGuestsFaqsContent } from '@/lib/cms/guests-faqs'
import { loadGuestsTestimonialsContent } from '@/lib/cms/guests-testimonials'
import GuestsLandingClient from './GuestsLandingClient'

// CMS-driven AND locale-aware: sections resolve content from the per-visitor
// `opuspass_locale` cookie (see lib/cms/locale.ts), so this route must render
// dynamically — a shared ISR cache entry keys only on path and would serve one
// visitor's language to everyone. Published changes appear immediately (no ISR
// window); the admin's on-demand revalidate is a harmless no-op for this route.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Guests & RSVPs | OpusPass',
  description:
    'Send digital wedding invitations by WhatsApp or SMS and watch RSVPs roll in live. Manage your guest list, track replies in English and Swahili, and plan your seating chart — all in one place.',
}

export default async function GuestsLandingPage() {
  const { isEnabled: isDraft } = await draftMode()
  const locale = await getLocale()
  const [hero, features, spread, faqs, testimonials] = await Promise.all([
    loadGuestsHeroContent(locale),
    loadGuestsFeaturesContent(locale),
    loadGuestsSpreadContent(locale),
    loadGuestsFaqsContent(locale),
    loadGuestsTestimonialsContent(locale),
  ])
  return (
    <>
      {isDraft && <PreviewBanner />}
      <GuestsLandingClient
        hero={hero}
        features={features}
        spread={spread}
        faqs={faqs}
        testimonials={<DigitalCardShowcase content={testimonials} />}
      />
    </>
  )
}
