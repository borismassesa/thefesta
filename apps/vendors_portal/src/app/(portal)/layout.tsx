import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getCurrentVendor } from '@/lib/vendor'
import { createClerkSupabaseServerClient } from '@/lib/supabase'
import { getLocale } from '@/lib/cms/locale'
import { loadPortalUiStrings } from '@/lib/cms/portal-ui'
import { PortalUIStringsProvider } from '@/components/providers/PortalUIStringsProvider'
import { ActiveVendorProvider } from '@/lib/onboarding/active-vendor-context'
import { VendorVerticalProvider } from '@/lib/onboarding/vertical-context'
import type { VendorVertical } from '@/lib/onboarding/verticals'
import PortalShell from './PortalShell'

// Count leads that still need a first response (status 'pending' = "new" in the
// UI). This drives the live badge on the sidebar "Leads" item so it reflects
// the real to-do count instead of a hardcoded placeholder.
async function loadNewLeadCount(vendorId: string): Promise<number> {
  try {
    const supabase = await createClerkSupabaseServerClient()
    const { count, error } = await supabase
      .from('inquiries')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_id', vendorId)
      .eq('status', 'pending')
    if (error) {
      console.error('[layout] new-lead count failed', error.code)
      return 0
    }
    return count ?? 0
  } catch (err) {
    console.error('[layout] new-lead count threw', err)
    return 0
  }
}

export default async function PortalLayout({
  children,
}: {
  children: ReactNode
}) {
  const state = await getCurrentVendor()

  // Gate the portal shell behind admin approval. Only `live` vendors reach the
  // dashboard; everyone else is funnelled to where they can act:
  //   - not applied / mid-application → the onboarding wizard
  //   - submitted (pending) / suspended → the /verify status + document hub
  if (state.kind === 'no-application') redirect('/onboard')
  if (state.kind === 'pending-approval') {
    redirect(state.status === 'application_in_progress' ? '/onboard' : '/verify')
  }
  if (state.kind === 'suspended') redirect('/verify')

  // Vendor name + slug are resolved here in the server layout — PortalShell
  // needs the name to greet the vendor in the header, and the slug feeds
  // the "View public storefront" link in the header.
  // `no-env` falls back to the seed values so designers see a populated
  // greeting offline.
  const vendorName =
    state.kind === 'live' ? state.vendor.businessName : 'OpusFesta Photography'
  const vendorSlug =
    state.kind === 'live' ? state.vendor.slug : null
  // Scope every storefront/onboarding-draft consumer in the portal to THIS
  // business, so a user who owns several vendor profiles never sees (or saves)
  // one business's draft fields against another. `null` only on the no-env dev
  // fallback, which reads the shared 'onboarding' slot.
  const activeVendorId = state.kind === 'live' ? state.vendor.id : null

  const newLeadCount = state.kind === 'live' ? await loadNewLeadCount(state.vendor.id) : 0
  // The vendor's vertical drives the whole shape of the portal: a gift shop or
  // an attire seller gets Products and Payments but no Bookings, Leads,
  // Packages or Availability, because they sell goods rather than booked time.
  // This used to be a separate `vendor_categories.sells_products` lookup; the
  // column on `vendors` is now the source of truth and saves a round-trip.
  const vertical: VendorVertical = state.kind === 'live' ? state.vendor.vertical : 'service'

  const locale = await getLocale()
  const portalChrome = await loadPortalUiStrings('portal-chrome', locale)

  return (
    <PortalUIStringsProvider bundles={{ 'portal-chrome': portalChrome }}>
      <ActiveVendorProvider vendorId={activeVendorId}>
        <VendorVerticalProvider vertical={vertical}>
          <PortalShell
            vendorName={vendorName}
            vendorSlug={vendorSlug}
            newLeadCount={newLeadCount}
          >
            {children}
          </PortalShell>
        </VendorVerticalProvider>
      </ActiveVendorProvider>
    </PortalUIStringsProvider>
  )
}
