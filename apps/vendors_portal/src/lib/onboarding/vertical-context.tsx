'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { type VendorVertical } from './verticals'

// Which vertical the active vendor is in: a wedding service, a gift shop, or
// attire & rings. The value comes from `vendors.vertical` and is resolved once
// by the (portal) server layout via getCurrentVendor().
//
// It lives in context rather than being threaded as a prop because the
// storefront section list is derived in a dozen client components (every
// editor's "next section" link, the sidebar, the completeness banner, the
// header breadcrumb), and every one of them needs to agree on which sections
// exist. A product vendor has no Services, Packages or Availability section,
// so a stale `service` list would offer them links into pages that no longer
// apply and skew the completeness ring against sections they can never fill.
//
// Defaults to 'service': the pre-verticals behaviour, and what every vendor row
// written before the verticals migration carries.
const VendorVerticalContext = createContext<VendorVertical>('service')

export function VendorVerticalProvider({
  vertical,
  children,
}: {
  vertical: VendorVertical
  children: ReactNode
}) {
  return (
    <VendorVerticalContext.Provider value={vertical}>
      {children}
    </VendorVerticalContext.Provider>
  )
}

export function useVendorVertical(): VendorVertical {
  return useContext(VendorVerticalContext)
}
