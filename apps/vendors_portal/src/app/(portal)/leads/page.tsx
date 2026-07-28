import type { InquiryRow } from '@/lib/mock-data'
import { recentInquiries } from '@/lib/mock-data'
import { createClerkSupabaseServerClient } from '@/lib/supabase'
import type { VendorPricingPackage } from '@/lib/vendors'
import { getCurrentVendor } from '@/lib/vendor'
import { getLocale } from '@/lib/cms/locale'
import { loadPortalUiStrings } from '@/lib/cms/portal-ui'
import { PortalUIStringsProvider } from '@/components/providers/PortalUIStringsProvider'
import { redirectProductVendors } from '@/lib/storefront/vertical-guard'
import LeadsClient, { type LeadsSource } from './LeadsClient'

type DbInquiryStatus =
  | 'pending'
  | 'responded'
  | 'accepted'
  | 'declined'
  | 'closed'

const STATUS_TO_UI: Record<DbInquiryStatus, InquiryRow['status']> = {
  pending: 'new',
  responded: 'replied',
  accepted: 'booked',
  declined: 'declined',
  closed: 'closed',
}

type InquiryRowFromDb = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  event_date: string | null
  budget: string | null
  location: string | null
  message: string | null
  guest_count: number | null
  status: DbInquiryStatus | null
}

type VendorPricingRow = {
  pricing_details: VendorPricingPackage[] | null
}

type VendorPackagesRow = {
  packages: unknown
}

function formatEventDate(date: string | null, dateTbcLabel: string): string {
  if (!date) return dateTbcLabel
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) {
    console.warn('[leads] invalid event_date in DB:', date)
    return dateTbcLabel
  }
  return parsed.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function mapStatus(status: DbInquiryStatus | null): InquiryRow['status'] {
  if (!status) return 'new'
  const mapped = STATUS_TO_UI[status]
  if (!mapped) {
    console.warn('[leads] unmapped inquiry_status:', status)
    return 'new'
  }
  return mapped
}

function mapRow(row: InquiryRowFromDb, dateTbcLabel: string, anonymousLeadLabel: string): InquiryRow {
  return {
    id: row.id,
    couple: row.name ?? anonymousLeadLabel,
    date: formatEventDate(row.event_date, dateTbcLabel),
    eventDateIso: row.event_date ?? undefined,
    budget: row.budget ?? '—',
    location: row.location ?? '—',
    status: mapStatus(row.status),
    // Real couples have no uploaded photo here; the client renders a
    // deterministic initials avatar when avatarUrl is null.
    avatarUrl: null,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    message: row.message ?? undefined,
    guestCount: row.guest_count ?? undefined,
  }
}

async function loadInquiries(dateTbcLabel: string, defaultVendorName: string, anonymousLeadLabel: string): Promise<{
  inquiries: InquiryRow[]
  source: LeadsSource
  vendorName: string
  packages: VendorPricingPackage[]
}> {
  const state = await getCurrentVendor()
  if (state.kind === 'no-env') {
    return {
      inquiries: recentInquiries,
      source: { kind: 'no-env' },
      vendorName: defaultVendorName,
      packages: [],
    }
  }
  if (state.kind === 'no-application') {
    return { inquiries: [], source: { kind: 'no-application' }, vendorName: '', packages: [] }
  }
  if (state.kind === 'pending-approval') {
    return {
      inquiries: [],
      source: { kind: 'pending-approval' },
      vendorName: state.vendorName,
      packages: [],
    }
  }
  if (state.kind === 'suspended') {
    return { inquiries: [], source: { kind: 'suspended' }, vendorName: state.vendorName, packages: [] }
  }

  const supabase = await createClerkSupabaseServerClient()
  const inquiries = await supabase
    .from('inquiries')
    .select('id, name, email, phone, event_date, budget, location, message, guest_count, status')
    .eq('vendor_id', state.vendor.id)
    .order('created_at', { ascending: false })
    .limit(50)
    .returns<InquiryRowFromDb[]>()

  if (inquiries.error) {
    throw new Error(
      `[leads] inquiries query failed: ${inquiries.error.code} ${inquiries.error.message}`,
    )
  }

  const [websiteVendorRow, storefrontRow] = await Promise.all([
    supabase
      .from('website_vendors')
      .select('pricing_details')
      .eq('id', state.vendor.id)
      .maybeSingle<VendorPricingRow>(),
    supabase
      .from('vendors')
      .select('packages')
      .eq('id', state.vendor.id)
      .maybeSingle<VendorPackagesRow>(),
  ])

  if (websiteVendorRow.error) console.error('[leads] website_vendors fetch failed', websiteVendorRow.error.code)
  if (storefrontRow.error) console.error('[leads] vendors packages fetch failed', storefrontRow.error.code)

  const pricingDetails: VendorPricingPackage[] =
    websiteVendorRow.data?.pricing_details ?? []

  const storefrontPackages: VendorPricingPackage[] = Array.isArray(
    storefrontRow.data?.packages,
  )
    ? (storefrontRow.data.packages as Array<Record<string, unknown>>)
        .filter(
          (e): e is Record<string, unknown> =>
            Boolean(e) && typeof e === 'object' && typeof e.name === 'string' && e.name !== '',
        )
        .map((e) => ({
          label: e.name as string,
          value: typeof e.price === 'string' ? e.price : '',
        }))
    : []

  // Storefront packages are the canonical source; pricing_details fills any gaps.
  const seen = new Set<string>()
  const packages: VendorPricingPackage[] = []
  for (const pkg of [...storefrontPackages, ...pricingDetails]) {
    const key = (pkg.label ?? '').trim().toLowerCase()
    if (key && !seen.has(key)) {
      seen.add(key)
      packages.push(pkg)
    }
  }

  return {
    inquiries: (inquiries.data ?? []).map((row) => mapRow(row, dateTbcLabel, anonymousLeadLabel)),
    source: { kind: 'live' },
    vendorName: state.vendor.businessName,
    packages,
  }
}

export default async function LeadsPage() {
  // Leads come from the wedding vendor directory, which product vendors aren't
  // listed in, so this inbox can only ever be empty for them.
  await redirectProductVendors()

  const locale = await getLocale()
  const leadsStrings = await loadPortalUiStrings('leads', locale)
  const { inquiries, source, vendorName, packages } = await loadInquiries(
    leadsStrings.date_tbc,
    leadsStrings.dev_default_vendor_name,
    leadsStrings.anonymous_lead,
  )
  return (
    <PortalUIStringsProvider bundles={{ leads: leadsStrings }}>
      <LeadsClient inquiries={inquiries} source={source} vendorName={vendorName} packages={packages} />
    </PortalUIStringsProvider>
  )
}
