import { getLocale } from '@/lib/cms/locale'
import { loadPortalUiStrings } from '@/lib/cms/portal-ui'
import { PortalUIStringsProvider } from '@/components/providers/PortalUIStringsProvider'
import { redirectProductVendors } from '@/lib/storefront/vertical-guard'
import AvailabilityClient from './AvailabilityClient'

export default async function AvailabilityPage() {
  // A calendar of free dates only means something to a vendor selling booked
  // time. Shops ship stock; their equivalent is the Products tab.
  await redirectProductVendors('/storefront')

  const locale = await getLocale()
  const availabilityStrings = await loadPortalUiStrings('storefront-availability', locale)
  return (
    <PortalUIStringsProvider bundles={{ 'storefront-availability': availabilityStrings }}>
      <AvailabilityClient />
    </PortalUIStringsProvider>
  )
}
