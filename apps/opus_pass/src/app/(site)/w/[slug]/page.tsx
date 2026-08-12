import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublishedWebsite } from '@/lib/dashboard/queries'
import { formatLongDate, publicOrigin } from '@/lib/dashboard/share'
import { composeDoc } from '@/lib/builder/presets'
import { SiteRenderer } from '../../website-builder/components/SiteRenderer'

// Always reflect the couple's latest published doc + sharing state.
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const doc = await getPublishedWebsite(slug)
  const origin = publicOrigin()
  if (!doc) {
    return { title: 'Wedding Website — OpusPass', robots: { index: false, follow: false } }
  }
  const m = doc.meta
  const names = `${firstName(m.partnerA)} & ${firstName(m.partnerB)}`
  const description = [formatLongDate(m.date), m.location].filter(Boolean).join(' • ') ||
    'You are invited — view the details and RSVP.'
  const url = `${origin}/w/${slug}`
  return {
    metadataBase: new URL(origin),
    title: `${names} — Wedding`,
    description,
    openGraph: { type: 'website', url, siteName: 'OpusPass', title: `${names} — Wedding`, description },
    twitter: { card: 'summary_large_image', title: `${names} — Wedding`, description },
  }
}

export default async function PublishedWebsitePage({ params }: PageProps) {
  const { slug } = await params
  const doc = await getPublishedWebsite(slug)
  if (!doc) notFound()
  return (
    <main className="min-h-screen w-full">
      <SiteRenderer doc={composeDoc(doc)} editable={false} compact={false} slug={slug} />
    </main>
  )
}

function firstName(full: string): string {
  return (full || '').trim().split(/\s+/)[0] || full
}
