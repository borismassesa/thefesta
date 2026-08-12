import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicInvite } from '@/lib/dashboard/queries'
import { formatLongDate, publicOrigin, saveDatePath } from '@/lib/dashboard/share'
import PublicInviteClient from '../../rsvp/event/[slug]/PublicInviteClient'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const data = await getPublicInvite(slug)
  const origin = publicOrigin()

  if (!data) {
    return { title: 'Save the date - OpusPass', robots: { index: false, follow: false } }
  }

  const url = `${origin}${saveDatePath(slug)}`
  const title = `Save the date for ${data.coupleName}`
  const description =
    [formatLongDate(data.weddingDate), data.city].filter(Boolean).join(' - ') ||
    'Tap to view the save-the-date details'

  return {
    metadataBase: new URL(origin),
    title,
    description,
    openGraph: { type: 'website', url, siteName: 'OpusPass', title, description },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function SaveTheDatePage({ params }: PageProps) {
  const { slug } = await params
  const data = await getPublicInvite(slug)
  if (!data) notFound()
  return <PublicInviteClient data={data} />
}
