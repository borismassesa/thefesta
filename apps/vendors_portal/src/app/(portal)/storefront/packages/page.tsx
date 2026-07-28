import { createClerkSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase'
import { getCurrentVendor } from '@/lib/vendor'
import type { PackageDraft } from '@/lib/onboarding/packages'
import { getLocale } from '@/lib/cms/locale'
import { loadPortalUiStrings } from '@/lib/cms/portal-ui'
import { PortalUIStringsProvider } from '@/components/providers/PortalUIStringsProvider'
import { redirectProductVendors } from '@/lib/storefront/vertical-guard'
import { dbPackagesToUi } from './mapping'
import { ensurePackageIds } from './actions'
import PackagesEditor, {
  type InitialPolicies,
  type PackagesSource,
  type PayoutSummary,
} from './PackagesEditor'

const EMPTY_POLICIES: InitialPolicies = {
  depositPercent: '',
  cancellationLevel: null,
  reschedulePolicy: null,
}

type VendorRow = {
  packages: unknown
  deposit_percent: string | null
  cancellation_level: string | null
  reschedule_policy: string | null
}

// Read the vendor's saved payout methods (owner-only under RLS, so we use the
// admin client scoped to this vendor) and reduce them to the summary the
// storefront shows: the default method plus a count of any extras.
async function loadPayoutSummary(vendorId: string): Promise<PayoutSummary> {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from('vendor_payout_methods')
    .select('method_type, provider, account_number, account_holder_name, is_default')
    .eq('vendor_id', vendorId)
  if (error || !data || data.length === 0) return null
  const primary = data.find((r) => r.is_default) ?? data[0]
  return {
    methodType: String(primary.method_type ?? ''),
    provider: (primary.provider as string | null) ?? null,
    accountNumber: String(primary.account_number ?? ''),
    accountHolder: String(primary.account_holder_name ?? ''),
    count: data.length,
  }
}

async function loadPackages(): Promise<{
  source: PackagesSource
  initialPackages: PackageDraft[]
  initialPolicies: InitialPolicies
  initialPayout: PayoutSummary
  canEdit: boolean
}> {
  const state = await getCurrentVendor()

  const empty = {
    initialPackages: [] as PackageDraft[],
    initialPolicies: EMPTY_POLICIES,
    initialPayout: null,
    canEdit: false,
  }
  if (state.kind === 'no-env') return { source: { kind: 'no-env' }, ...empty }
  if (state.kind === 'no-application') return { source: { kind: 'no-application' }, ...empty }
  if (state.kind === 'pending-approval') return { source: { kind: 'pending-approval' }, ...empty }
  if (state.kind === 'suspended') return { source: { kind: 'suspended' }, ...empty }

  const supabase = await createClerkSupabaseServerClient()
  let { data, error } = await supabase
    .from('vendors')
    .select('packages, deposit_percent, cancellation_level, reschedule_policy')
    .eq('id', state.vendor.id)
    .single<VendorRow>()

  if (error) {
    throw new Error(
      `[storefront/packages] vendors query failed: ${error.code} ${error.message}`,
    )
  }
  if (!data) {
    throw new Error(
      `[storefront/packages] vendor row not found after membership probe (vendor_id=${state.vendor.id})`,
    )
  }

  // Lazy ID self-heal: if any package entry lacks an `id`, persist freshly
  // assigned IDs once so saveBadge has a stable target to find. Without this
  // the mapper assigns a fresh UUID per render and saveBadge's findIndex
  // would always miss for idless rows. ensurePackageIds is RLS-bound; staff
  // role no-ops gracefully.
  const hasIdlessEntry =
    Array.isArray(data.packages) &&
    (data.packages as Array<Record<string, unknown>>).some(
      (e) => !e || typeof e !== 'object' || typeof e.id !== 'string',
    )
  if (hasIdlessEntry) {
    const heal = await ensurePackageIds()
    if (heal.ok && heal.healed > 0) {
      const refetch = await supabase
        .from('vendors')
        .select('packages, deposit_percent, cancellation_level, reschedule_policy')
        .eq('id', state.vendor.id)
        .single<VendorRow>()
      if (!refetch.error && refetch.data) {
        data = refetch.data
      }
    }
  }

  const canEdit =
    state.vendor.role === 'owner' || state.vendor.role === 'manager'

  return {
    source: { kind: 'live' },
    initialPackages: dbPackagesToUi(data.packages),
    initialPolicies: {
      depositPercent: data.deposit_percent ?? '',
      cancellationLevel: (data.cancellation_level ?? null) as InitialPolicies['cancellationLevel'],
      reschedulePolicy: (data.reschedule_policy ?? null) as InitialPolicies['reschedulePolicy'],
    },
    initialPayout: await loadPayoutSummary(state.vendor.id),
    canEdit,
  }
}

export default async function StorefrontPackagesPage() {
  // Packages price up booked time. Product vendors price per item instead, on
  // the Products tab, so this section isn't in their storefront checklist.
  await redirectProductVendors('/storefront')

  const [props, locale] = await Promise.all([loadPackages(), getLocale()])
  const packagesStrings = await loadPortalUiStrings('storefront-packages', locale)
  return (
    <PortalUIStringsProvider bundles={{ 'storefront-packages': packagesStrings }}>
      <PackagesEditor {...props} />
    </PortalUIStringsProvider>
  )
}
