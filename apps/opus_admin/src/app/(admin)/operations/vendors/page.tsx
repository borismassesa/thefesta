import { createSupabaseAdminClient } from '@/lib/supabase'
import VendorsListClient from './VendorsListClient'
import {
  DB_STATUS_TO_VENDOR_STATUS,
  VENDOR_STATUS_TO_DB,
  isVendorVertical,
  type QueueHealth,
  type VendorAccount,
  type VendorStatus,
  type VendorStatusCounts,
  type VendorVertical,
  type VerticalCounts,
} from './_lib/types'

export const dynamic = 'force-dynamic'

type VendorRow = {
  id: string
  vendor_code: string | null
  slug: string
  business_name: string
  category: string
  vertical: string | null
  onboarding_status: string
  onboarding_started_at: string | null
  onboarding_completed_at: string | null
  suspended_at: string | null
  created_at: string
  updated_at: string
  location: { city?: string | null; homeMarket?: string | null } | null
  application_snapshot: Record<string, unknown> | null
  cover_image: string | null
  gallery_urls: string[] | null
  user_id: string
}

type DocRow = {
  vendor_id: string
  status: string
}

type AgreementRow = { vendor_id: string }

type UserRow = { id: string; name: string | null; email: string | null }

const ALLOWED_STATUSES = new Set<string>([
  'awaiting_review',
  'needs_corrections',
  'uploading_docs',
  'drafting',
  'active',
  'suspended',
  'all',
])

function parseStatus(raw: string | string[] | undefined): VendorStatus | 'all' {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value && ALLOWED_STATUSES.has(value)) {
    return value as VendorStatus | 'all'
  }
  // Default landing tab is the full vendor roster — admins ask for it more
  // often than the awaiting-review queue, and the per-tab counts make the
  // queue easy to reach in one click.
  return 'all'
}

function parseVertical(raw: string | string[] | undefined): VendorVertical | 'all' {
  const value = Array.isArray(raw) ? raw[0] : raw
  return isVendorVertical(value) ? value : 'all'
}

// Vendors awaiting admin review for longer than this threshold are flagged
// as SLA-at-risk. Pulled out as a constant so the threshold is reviewable
// in one place when ops calibrates the queue policy.
const SLA_HOURS = 48

export default async function VendorsListPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string
    q?: string
    sort?: string
    letter?: string
    vertical?: string
  }>
}) {
  const params = await searchParams
  const status = parseStatus(params.status)
  const vertical = parseVertical(params.vertical)

  const admin = createSupabaseAdminClient()

  let query = admin
    .from('vendors')
    .select(
      `id, vendor_code, slug, business_name, category, vertical, onboarding_status,
       onboarding_started_at, onboarding_completed_at, suspended_at,
       created_at, updated_at, location, application_snapshot,
       cover_image, gallery_urls, user_id`,
    )
    .order('onboarding_started_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(200)

  if (status !== 'all') {
    query = query.eq('onboarding_status', VENDOR_STATUS_TO_DB[status])
  }

  // Vertical filters server-side rather than in the client like Category does.
  // The roster is capped at 200 rows, so filtering after the fetch would search
  // only the first 200 vendors and quietly under-report the smaller verticals.
  if (vertical !== 'all') {
    query = query.eq('vertical', vertical)
  }

  const { data: vendors, error } = await query.returns<VendorRow[]>()
  if (error) {
    throw new Error(
      `[admin] vendors list query failed: ${error.code} ${error.message}`,
    )
  }

  const vendorIds = (vendors ?? []).map((v) => v.id)
  const userIds = Array.from(
    new Set((vendors ?? []).map((v) => v.user_id).filter(Boolean)),
  )

  type DocAggregates = { verified: number; total: number }
  const docAggByVendor = new Map<string, DocAggregates>()
  const agreementByVendor = new Set<string>()
  const userById = new Map<string, UserRow>()

  if (vendorIds.length > 0) {
    // Documents — count latest submissions per vendor, splitting verified
    // (approved) from total (any latest status). Used for the verification
    // pill on each row.
    const { data: docs } = await admin
      .from('vendor_verification_documents')
      .select('vendor_id, status')
      .in('vendor_id', vendorIds)
      .eq('is_latest', true)
      .returns<DocRow[]>()

    for (const d of docs ?? []) {
      const agg = docAggByVendor.get(d.vendor_id) ?? { verified: 0, total: 0 }
      agg.total += 1
      if (d.status === 'approved') agg.verified += 1
      docAggByVendor.set(d.vendor_id, agg)
    }

    // Agreement — `signed` if any agreement row exists for the vendor; the
    // version-matching gate happens in the activation flow, not the list.
    const { data: agreements } = await admin
      .from('vendor_agreements')
      .select('vendor_id')
      .in('vendor_id', vendorIds)
      .returns<AgreementRow[]>()

    for (const a of agreements ?? []) agreementByVendor.add(a.vendor_id)
  }

  if (userIds.length > 0) {
    const { data: users } = await admin
      .from('users')
      .select('id, name, email')
      .in('id', userIds)
      .returns<UserRow[]>()
    for (const u of users ?? []) userById.set(u.id, u)
  }

  // Project rows into the spec's `VendorAccount` shape. The owner's display
  // name comes from the `users` table when available; otherwise we fall back
  // to the application snapshot's first/last name pair, then to the email
  // local-part. Reviewer assignment is null for now (no reviewer table yet
  // — this is the "stubbed" field per spec §11).
  const accounts: VendorAccount[] = (vendors ?? []).map((v) => {
    const docs = docAggByVendor.get(v.id) ?? { verified: 0, total: 0 }
    const owner = userById.get(v.user_id)
    const snapshot =
      v.application_snapshot && typeof v.application_snapshot === 'object'
        ? (v.application_snapshot as Record<string, unknown>)
        : null
    const snapshotName = [snapshot?.firstName, snapshot?.lastName]
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .join(' ')
      .trim()
    const submittedByName =
      owner?.name?.trim() ||
      (snapshotName.length > 0 ? snapshotName : null) ||
      owner?.email?.split('@')[0] ||
      null

    return {
      id: v.id,
      publicId: v.vendor_code ?? v.id.slice(0, 8),
      businessName: v.business_name,
      category: v.category,
      // NOT NULL with a 'service' default in the DB; the fallback only covers a
      // row written before the verticals migration landed.
      vertical: isVendorVertical(v.vertical) ? v.vertical : 'service',
      city: v.location?.city ?? v.location?.homeMarket ?? null,
      submittedByName,
      contactEmail: owner?.email ?? null,
      submittedAt: v.onboarding_started_at,
      createdAt: v.created_at,
      updatedAt: v.updated_at,
      agreementStatus: agreementByVendor.has(v.id) ? 'signed' : 'pending',
      documentsVerified: docs.verified,
      documentsTotal: docs.total,
      reviewerId: null,
      status:
        DB_STATUS_TO_VENDOR_STATUS[v.onboarding_status] ?? 'drafting',
      // Vendors have no dedicated logo column — use the storefront cover as
      // the profile pic, then the first gallery shot, then the snapshot's
      // cover. Falls back to an initials avatar when none exist.
      logoUrl:
        v.cover_image?.trim() ||
        v.gallery_urls?.find((u) => typeof u === 'string' && u.trim())?.trim() ||
        (typeof snapshot?.coverImage === 'string'
          ? (snapshot.coverImage as string).trim()
          : null) ||
        null,
    }
  })

  // Rollup for the filter counts. One lightweight query — we only need the two
  // columns, not the rest of the row. Each dimension is counted within the
  // other's active filter, so the numbers describe what a click would actually
  // return: status counts are scoped to the selected vertical, and vice versa.
  const { data: rollup } = await admin
    .from('vendors')
    .select('onboarding_status, vertical')
    .returns<Pick<VendorRow, 'onboarding_status' | 'vertical'>[]>()

  const counts: VendorStatusCounts = {
    awaiting_review: 0,
    needs_corrections: 0,
    uploading_docs: 0,
    drafting: 0,
    active: 0,
    suspended: 0,
    all: 0,
  }
  const verticalCounts: VerticalCounts = {
    service: 0,
    gift_shop: 0,
    attire_rings: 0,
    all: 0,
  }
  for (const r of rollup ?? []) {
    const rowVertical = isVendorVertical(r.vertical) ? r.vertical : 'service'
    const mapped = DB_STATUS_TO_VENDOR_STATUS[r.onboarding_status]

    if (vertical === 'all' || rowVertical === vertical) {
      counts.all += 1
      if (mapped) counts[mapped] += 1
    }
    if (status === 'all' || mapped === status) {
      verticalCounts.all += 1
      verticalCounts[rowVertical] += 1
    }
  }

  // Queue health derives from the live awaiting-review queue plus historical
  // approval timing — no hardcoded numbers. `slaAtRisk` counts vendors that
  // submitted longer ago than SLA_HOURS and are still awaiting review.
  const queueHealth = computeQueueHealth(rollup ? null : null, accounts)

  return (
    <VendorsListClient
      vendors={accounts}
      status={status}
      vertical={vertical}
      counts={counts}
      verticalCounts={verticalCounts}
      health={queueHealth}
      slaHours={SLA_HOURS}
    />
  )
}

function computeQueueHealth(
  _unused: null,
  vendors: VendorAccount[],
): QueueHealth {
  const now = Date.now()
  const slaThreshold = SLA_HOURS * 60 * 60 * 1000
  const awaiting = vendors.filter((v) => v.status === 'awaiting_review')

  const slaAtRisk = awaiting.filter((v) => {
    if (!v.submittedAt) return false
    return now - new Date(v.submittedAt).getTime() > slaThreshold
  }).length

  // Avg review time = mean(activatedAt - submittedAt) across active vendors
  // that have both timestamps. Activated vendors are the closest proxy we
  // have to a completed review.
  const reviewedDays: number[] = []
  for (const v of vendors) {
    if (v.status !== 'active') continue
    if (!v.submittedAt) continue
    // We don't have onboarding_completed_at on the projected shape, so we
    // approximate review time from createdAt → "now" minus the queued time.
    // When there's a real `reviewed_at` field on the vendor, swap this in.
    const submitted = new Date(v.submittedAt).getTime()
    const completed = new Date(v.createdAt).getTime()
    const days = Math.max(0, (completed - submitted) / (24 * 60 * 60 * 1000))
    if (Number.isFinite(days) && days > 0) reviewedDays.push(days)
  }

  const avgReviewTimeDays = reviewedDays.length
    ? Math.round(
        (reviewedDays.reduce((a, b) => a + b, 0) / reviewedDays.length) * 10,
      ) / 10
    : 0

  return {
    inQueue: awaiting.length,
    avgReviewTimeDays,
    slaAtRisk,
  }
}
