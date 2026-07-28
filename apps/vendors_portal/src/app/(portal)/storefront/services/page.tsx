import { createClerkSupabaseServerClient } from '@/lib/supabase'
import { getCurrentVendor } from '@/lib/vendor'
import { getServicesForCategory } from '@/lib/onboarding/services'
import { getLocale } from '@/lib/cms/locale'
import { loadPortalUiStrings } from '@/lib/cms/portal-ui'
import { PortalUIStringsProvider } from '@/components/providers/PortalUIStringsProvider'
import { redirectProductVendors } from '@/lib/storefront/vertical-guard'
import ServicesEditor, { type ServicesSource } from './ServicesEditor'
import { dbServicesToUi } from './mapping'

type VendorServicesRow = {
  // text[] of plain title strings on the live DB; typed as unknown[] so the
  // tolerant mapper (dbServicesToUi) can also absorb legacy object / stringified
  // shapes without a type cast. See ./mapping serviceTitle().
  services_offered: unknown[] | null
}

async function loadServices(): Promise<{
  source: ServicesSource
  presets: Array<{ id: string; label: string }>
  initialPresetIds: string[]
  initialCustomServices: string[]
  canEdit: boolean
  category: string | null
}> {
  const state = await getCurrentVendor()

  if (state.kind === 'no-env') {
    return {
      source: { kind: 'no-env' },
      presets: getServicesForCategory(null),
      initialPresetIds: [],
      initialCustomServices: [],
      canEdit: false,
      category: null,
    }
  }
  if (state.kind === 'no-application') {
    return {
      source: { kind: 'no-application' },
      presets: getServicesForCategory(null),
      initialPresetIds: [],
      initialCustomServices: [],
      canEdit: false,
      category: null,
    }
  }
  if (state.kind === 'pending-approval') {
    return {
      source: { kind: 'pending-approval' },
      presets: getServicesForCategory(null),
      initialPresetIds: [],
      initialCustomServices: [],
      canEdit: false,
      category: null,
    }
  }
  if (state.kind === 'suspended') {
    return {
      source: { kind: 'suspended' },
      presets: getServicesForCategory(null),
      initialPresetIds: [],
      initialCustomServices: [],
      canEdit: false,
      category: null,
    }
  }

  const supabase = await createClerkSupabaseServerClient()
  const { data, error } = await supabase
    .from('vendors')
    .select('services_offered')
    .eq('id', state.vendor.id)
    .single<VendorServicesRow>()

  if (error) {
    throw new Error(
      `[storefront/services] vendors query failed: ${error.code} ${error.message}`,
    )
  }
  if (!data) {
    // The membership probe in getCurrentVendor() succeeded, but the vendors
    // row is unreachable — typically this means the row was deleted between
    // the two queries, or RLS started filtering it. Surface as a hard error
    // so error.tsx renders rather than showing an "empty live" editor that
    // would overwrite a row the user may not own.
    throw new Error(
      `[storefront/services] vendor row not found after membership probe (vendor_id=${state.vendor.id})`,
    )
  }

  const ui = dbServicesToUi(data.services_offered, state.vendor.category)
  // Per migration 056, services edits via vendors UPDATE require owner or
  // manager. Staff can read but not write — UI disables Save for them.
  const canEdit = state.vendor.role === 'owner' || state.vendor.role === 'manager'

  return {
    source: { kind: 'live' },
    presets: getServicesForCategory(state.vendor.category),
    initialPresetIds: ui.specialServices,
    initialCustomServices: ui.customServices,
    canEdit,
    category: state.vendor.category,
  }
}

export default async function StorefrontServicesPage() {
  // Services describe what couples can book you for. A shop's offer is its
  // Products list, so this section isn't part of their storefront.
  await redirectProductVendors('/storefront')

  const [props, locale] = await Promise.all([loadServices(), getLocale()])
  const servicesStrings = await loadPortalUiStrings('storefront-services', locale)
  return (
    <PortalUIStringsProvider bundles={{ 'storefront-services': servicesStrings }}>
      <ServicesEditor {...props} />
    </PortalUIStringsProvider>
  )
}
