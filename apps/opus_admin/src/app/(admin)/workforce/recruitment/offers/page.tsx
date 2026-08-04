import { requirePermission } from '@/lib/admin-auth'
import CollectionPage from '../_components/CollectionPage'
import { getOfferRows } from '../_lib/collections'

export default async function OffersPage() {
  await requirePermission('workforce.offers.read')
  const rows = await getOfferRows()
  return <CollectionPage title="Offers" subtitle="Versioned terms, compensation approvals, documents and candidate responses." rows={rows} emptyMessage="Approved finalist applications can be converted into versioned offers here." />
}
