import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicPledgeCouple } from '@/lib/dashboard/queries'
import { pledgeUrl, publicOrigin } from '@/lib/dashboard/share'
import { getLocale } from '@/lib/cms/locale'
import { loadUiStrings } from '@/lib/cms/ui-strings'
import { UIStringsProvider } from '@/components/providers/UIStringsProvider'
import PledgeForm from './PledgeForm'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ token: string }>
  searchParams: Promise<{ event?: string }>
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { token } = await params
  const { event: eventId } = await searchParams
  const couple = await getPublicPledgeCouple(token, eventId ?? null)
  if (!couple) return { robots: { index: false, follow: false } }

  const title = `Pledge for ${couple.coupleName} | OpusPass`
  const description = `${couple.coupleName} would love your support. Open their pledge card and add your contribution.`
  const url = pledgeUrl(publicOrigin(), token, couple.eventId)
  const imageUrl = `${publicOrigin()}/pledge/${encodeURIComponent(token)}/opengraph-image${
    couple.eventId ? `?event=${encodeURIComponent(couple.eventId)}` : ''
  }`

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      url,
      images: [{ url: imageUrl, width: 1200, height: 630, alt: `${couple.coupleName} pledge card` }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  }
}

export default async function PledgePage({ params, searchParams }: PageProps) {
  const { token } = await params
  const { event: eventId } = await searchParams
  const couple = await getPublicPledgeCouple(token, eventId ?? null)
  if (!couple) notFound()
  const locale = await getLocale()
  const formsPledge = await loadUiStrings('forms-pledge', locale)
  return (
    <UIStringsProvider bundles={{ 'forms-pledge': formsPledge }}>
      <PledgeForm
        token={token}
        eventId={couple.eventId}
        coupleName={couple.coupleName}
        weddingDate={couple.weddingDate}
        city={couple.city}
        config={couple.pageConfig}
        locale={locale}
      />
    </UIStringsProvider>
  )
}
