import { getReleasedCards } from '@/lib/dashboard/released-cards'
import ReleasedCardsView from './ReleasedCardsView'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'My cards',
}

export default async function MyCardsPage() {
  const cards = await getReleasedCards()
  return <ReleasedCardsView cards={cards} />
}
