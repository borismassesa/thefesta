'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'
import { Header } from '@/components/Header'
import { StorefrontSidebar } from '@/components/storefront/StorefrontSidebar'

// The vertical isn't a prop here: Sidebar, StorefrontSidebar and Header all
// read it from VendorVerticalProvider, so they can't drift apart or from the
// storefront editors that derive the same section list.
export default function PortalShell({
  children,
  vendorName,
  vendorSlug,
  newLeadCount = 0,
}: {
  children: ReactNode
  vendorName: string
  vendorSlug: string | null
  newLeadCount?: number
}) {
  const pathname = usePathname()
  const isStorefront = pathname.startsWith('/storefront')

  return (
    <div className="flex h-screen bg-[#FDFDFD] font-sans antialiased text-gray-900">
      <Sidebar newLeadCount={newLeadCount} />
      {isStorefront ? <StorefrontSidebar /> : null}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <Header vendorName={vendorName} vendorSlug={vendorSlug} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden">{children}</main>
      </div>
    </div>
  )
}
