import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicGiftRegistryPage } from '@/lib/dashboard/queries'
import { fetchCatalogProducts } from '@/lib/dashboard/gift-catalog-db'
import { giftRegistryPath, publicOrigin } from '@/lib/dashboard/share'
import GiftRegistryPublicClient from './GiftRegistryPublicClient'

// Deliberately independent of the wedding-website builder (unlike /w/<slug>):
// reflects claims + sharing state as soon as they change, whether or not the
// couple has ever touched the site builder.
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const data = await getPublicGiftRegistryPage(slug)
  const origin = publicOrigin()

  if (!data) {
    return { title: 'Gift Registry — OpusPass', robots: { index: false, follow: false } }
  }

  const url = `${origin}${giftRegistryPath(slug)}`
  const title = `${data.coupleName}'s Gift Registry`
  const description = "Your presence is present enough, but if you'd like to give a gift, here's their registry."
  return {
    metadataBase: new URL(origin),
    title,
    description,
    openGraph: { type: 'website', url, siteName: 'OpusPass', title, description },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function PublicGiftRegistryPage({ params }: PageProps) {
  const { slug } = await params
  const data = await getPublicGiftRegistryPage(slug)
  if (!data) notFound()
  const catalog = await fetchCatalogProducts()
  return <GiftRegistryPublicClient data={data} catalog={catalog} />
}
