import { getPurchasedCardDetails } from '@/lib/dashboard/card-details'
import { CardsSection } from '@/components/dashboard/CardsTabs'
import CardDetailsForm from './CardDetailsForm'
import { askForCardChange, saveCardDetails } from './actions'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Card details',
}

export default async function CardDetailsPage() {
  const cards = await getPurchasedCardDetails()
  const outstanding = cards.filter(
    (card) => !card.locked && card.fields.some((field) => !card.values[field.role]),
  ).length

  return (
    <CardsSection
      title="Card details"
      subtitle={
        cards.length === 0
          ? 'Once you have bought a card, this is where you type the names, dates and venues that get printed on it.'
          : outstanding === 0
            ? 'Everything our designers need is in. You can still change it until your cards go to print.'
            : `What you type here is what gets printed on your ${
                cards.length === 1 ? 'card' : 'cards'
              }. Check every name and spelling against the preview, then send it to our design team.`
      }
    >
      <CardDetailsForm
        cards={cards}
        save={saveCardDetails}
        requestChange={askForCardChange}
        showHeader={false}
      />
    </CardsSection>
  )
}
