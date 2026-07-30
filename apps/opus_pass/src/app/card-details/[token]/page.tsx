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
  const request = await getCardDetailRequestByToken(token)
  // A wrong or revoked token is a 404, not an error page — it shouldn't
  // confirm whether the token ever existed.
  if (!request) notFound()

  // Nothing outstanding. The couple still lands here whenever they re-open the
  // link, so show what we hold rather than a bare dead end — a wrong venue or
  // a misspelt name is expensive once it is printed, and this is their only
  // chance to notice it.
  if (request.requested.length === 0) {
    return (
      <PublicShell>
        <CardDetailsReceipt request={request} />
      </PublicShell>
    )
  }

  return (
    <PublicShell>
      <CardDetailsForm
        requests={[request]}
        save={saveByToken.bind(null, token)}
        intro={`Our designers need a few details before they can finish your ${request.cardName}. What you type here goes straight onto the card.`}
      />
    </PublicShell>
  )
}
