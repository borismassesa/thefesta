import type { ReactNode } from 'react'
import { redirectProductVendors } from '@/lib/storefront/vertical-guard'

// Bookings is service-only: a gift shop or an attire seller sells goods, not
// booked time, so this calendar could never hold anything for them. The sidebar
// already hides the tab; this stops a bookmark or a typed URL getting in behind
// it. Sits on the parent segment so both the list and the detail page are
// covered.
export default async function BookingsLayout({ children }: { children: ReactNode }) {
  await redirectProductVendors()
  return <>{children}</>
}
