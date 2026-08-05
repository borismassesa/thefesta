import { getCardGallery } from '@/lib/dashboard/released-cards'
import { CardsSection } from '@/components/dashboard/CardsTabs'
import CardGallery from './CardGallery'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'My cards',
}

export default async function MyCardsPage() {
  const cards = await getCardGallery()
  const ready = cards.filter((c) => c.status === 'ready' || c.status === 'delivered').length
  const inProgress = cards.length - ready

  return (
    <CardsSection title="My cards" subtitle={subtitle(cards.length, ready, inProgress)}>
      <CardGallery cards={cards} />
    </CardsSection>
  )
}

/**
 * Says where their cards are, in the couple's terms.
 *
 * Written as a sentence rather than a tally. "1 card: 1 ready to use" counts
 * the same card twice and tells them nothing they cannot see in the gallery
 * below; what they came to find out is whether they can send it yet.
 */
function subtitle(total: number, ready: number, inProgress: number): string {
  if (total === 0) return 'Every card you buy appears here, from order to finished artwork.'

  if (inProgress === 0) {
    return ready === 1
      ? 'Your card is approved and ready to send to your guests.'
      : `All ${ready} of your cards are approved and ready to send to your guests.`
  }

  if (ready === 0) {
    return inProgress === 1
      ? 'Your card is with our designers. We will let you know the moment it is ready.'
      : `Your ${inProgress} cards are with our designers. We will let you know as each one is ready.`
  }

  return `${ready} ${ready === 1 ? 'card is' : 'cards are'} ready to send to your guests. ${inProgress} still with our designers.`
}
