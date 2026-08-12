import { createSupabaseServerClient } from '@/lib/supabase'
import { requireDashboardUser } from '@/lib/dashboard/auth'
import InquiriesInbox from './InquiriesInbox'
import type { InquirySummary } from './types'

export const dynamic = 'force-dynamic'

// Vendor inquiries live in the shared `inquiries` table (same Supabase project
// as the marketplace) and are keyed by the couple's email. The conversation
// thread, messaging and proposal actions are served by /api/my/inquiries/*.
const MARKETPLACE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3006'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function resolvePageSlug(
  vendorSlug: string | null,
  vendorId: string | null,
  slugByVendorId: Map<string, string>,
): string | null {
  if (vendorSlug && !UUID_RE.test(vendorSlug)) return vendorSlug
  if (vendorId) return slugByVendorId.get(vendorId) ?? null
  return null
}

export default async function InquiriesPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ id?: string }> }>) {
  const user = await requireDashboardUser('/my/dashboard/inquiries')
  const email = user.email?.trim().toLowerCase() ?? null
  const { id: preselectId } = await searchParams

  let inquiries: InquirySummary[] = []

  if (email) {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('inquiries')
      .select('id, vendor_id, vendor_name, vendor_slug, status, created_at, event_date, location, guest_count')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) console.error('[inquiries-page] fetch failed', error.code)

    const rawInquiries = (data ?? []) as Array<Omit<InquirySummary, 'vendor_page_slug'>>

    const vendorIds = Array.from(
      new Set(rawInquiries.map((inq) => inq.vendor_id).filter((id): id is string => Boolean(id))),
    )

    const slugByVendorId = new Map<string, string>()
    if (vendorIds.length > 0) {
      const { data: vendors, error: vendorError } = await supabase
        .from('vendors')
        .select('id, slug')
        .in('id', vendorIds)
      if (vendorError) {
        console.error('[inquiries-page] vendor slug lookup failed', vendorError.code)
      } else {
        for (const vendor of vendors ?? []) {
          if (vendor?.id && vendor?.slug) slugByVendorId.set(vendor.id, vendor.slug)
        }
      }
    }

    inquiries = rawInquiries.map((inq) => ({
      ...inq,
      vendor_page_slug: resolvePageSlug(inq.vendor_slug, inq.vendor_id, slugByVendorId),
    }))
  }

  return (
    <InquiriesInbox
      initialInquiries={inquiries}
      marketplaceUrl={MARKETPLACE_URL}
      preselectId={preselectId}
    />
  )
}
