import { getCardDetailRequests } from '@/lib/dashboard/card-details'
import CardDetailsForm from './CardDetailsForm'
import { saveCardDetails } from './actions'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Card details',
}

export default async function CardDetailsPage() {
  const requests = await getCardDetailRequests()
  return <CardDetailsForm requests={requests} save={saveCardDetails} />
}
