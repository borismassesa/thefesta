import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCardDetailRequestByToken } from '@/lib/dashboard/card-details'
import CardDetailsForm from '../../my/dashboard/card-details/CardDetailsForm'
import CardDetailsReceipt from './CardDetailsReceipt'
import PublicShell from './PublicShell'
import { saveByToken } from './actions'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your card details',
  // A private link addressed by an unguessable token — never index it, and
  // don't let it leak through a referrer either.
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function PublicCardDetailsPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const card = await getCardDetailRequestByToken(token)
  // A wrong or revoked token is a 404, not an error page — it shouldn't
  // confirm whether the token ever existed.
  if (!card) notFound()

  // The card is already with their guests, so there is nothing left to change.
  // They still land here whenever they re-open the link, so show what we
  // printed rather than a bare dead end.
  if (card.locked) {
    return (
      <PublicShell>
        <CardDetailsReceipt request={card} />
      </PublicShell>
    )
  }

  // Everything the artwork can hold, not just what was chased. The couple keeps
  // re-opening this link, and it is their only chance to catch a misspelt name
  // or a wrong venue before it is printed on every card.
  return (
    <PublicShell>
      <CardDetailsForm
        cards={[card]}
        save={saveByToken.bind(null, token)}
        token={token}
        intro={`Type what should be printed on your ${card.cardName}. What you send here goes straight onto the card.`}
      />
    </PublicShell>
  )
}
