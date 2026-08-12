import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicGuestbookPage } from '@/lib/dashboard/queries'
import { guestbookPath, publicOrigin } from '@/lib/dashboard/share'
import GuestbookPublicClient from './GuestbookPublicClient'

// Deliberately independent of the wedding-website builder (unlike /w/<slug>):
// reflects moderation + sharing state as soon as it changes, whether or not
// the couple has ever touched the site builder.
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const data = await getPublicGuestbookPage(slug)
  const origin = publicOrigin()

  if (!data) {
    return { title: 'Guestbook — OpusPass', robots: { index: false, follow: false } }
  }

  const url = `${origin}${guestbookPath(slug)}`
  const title = `${data.coupleName}'s Guestbook`
  const description = 'Leave a message or a photo memory for the happy couple.'
  return {
    metadataBase: new URL(origin),
    title,
    description,
    openGraph: { type: 'website', url, siteName: 'OpusPass', title, description },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function PublicGuestbookPage({ params }: PageProps) {
  const { slug } = await params
  const data = await getPublicGuestbookPage(slug)
  if (!data) notFound()
  return <GuestbookPublicClient data={data} />
}
