import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getCardDetail } from '@/lib/dashboard/released-cards'
import { CardsSection } from '@/components/dashboard/CardsTabs'
import CardDetailView from './CardDetailView'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Card',
}

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ designId: string }>
}) {
  const { designId } = await params
  const card = await getCardDetail(designId)
  // getCardDetail returns null for "not yours" and "does not exist" alike, so
  // a stranger holding a real design id learns nothing from this page either.
  if (!card) notFound()

  return (
    <CardsSection
      title={card.cardName}
      subtitle={[card.category, card.orderRef].filter(Boolean).join(' · ')}
      back={
        <Link
          href="/my/dashboard/cards"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#1A1A1A]/60 transition-colors hover:text-[#1A1A1A]"
        >
          <ArrowLeft className="h-4 w-4" />
          All cards
        </Link>
      }
    >
      <CardDetailView card={card} />
    </CardsSection>
  )
}
