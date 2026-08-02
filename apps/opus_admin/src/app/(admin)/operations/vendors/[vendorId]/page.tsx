import { notFound } from 'next/navigation'
import { createSupabaseAdminClient } from '@/lib/supabase'
import VendorReviewClient, {
  type VendorReviewProps,
} from './VendorReviewClient'
import { isVendorVertical } from '../_lib/types'
import { loadVendorCategoryOptions } from '../actions'

export const dynamic = 'force-dynamic'

type VendorRow = {
  id: string
  vendor_code: string | null
  slug: string
  business_name: string
  logo: string | null
  category: string
  vertical: string | null
  bio: string | null
  description: string | null
  location: {
    houseNumber?: string | null
    street?: string | null
    ward?: string | null
    district?: string | null
    street2?: string | null // legacy
    city?: string | null // legacy locality
    region?: string | null
    landmark?: string | null
    postalCode?: string | null
    country?: string | null
    homeMarket?: string | null
    serviceMarkets?: string[] | null
  } | null
  contact_info: {
    phone?: string | null
    email?: string | null
    whatsapp?: string | null
  } | null
  social_links: Record<string, string | null> | null
  // Canonical database shape: text[] of service-title strings.
  services_offered: string[] | null
  years_in_business: number | null
  onboarding_status: string
  onboarding_started_at: string | null
  onboarding_completed_at: string | null
  suspended_at: string | null
  suspension_reason: string | null
  created_at: string
  updated_at: string
  // Storefront persistence columns from migration 20260503000003.
  team: Array<Record<string, unknown>> | null
  faqs: Array<Record<string, unknown>> | null
  packages: Array<Record<string, unknown>> | null
  awards: string | null
  hours: Record<string, { open?: boolean; from?: string; to?: string }> | null
  languages: string[] | null
  response_time_hours: string | null
  locally_owned: boolean | null
  parallel_booking_capacity: number | null
  deposit_percent: string | null
  cancellation_level: string | null
  reschedule_policy: string | null
  style: string | null
  personality: string | null
  cover_image: string | null
  gallery_urls: string[] | null
}

type VideoUrlsRow = {
  video_urls: string[] | null
}

type ApplicationSnapshotRow = {
  application_snapshot: Record<string, unknown> | null
}

type PackagesRow = {
  packages:
    | Array<{
        id?: string
        name?: string
        price?: string
        description?: string
      }>
    | null
}

type DocRow = {
  id: string
  doc_type: string
  storage_path: string
  original_filename: string | null
  mime_type: string | null
  size_bytes: number | null
  status: string
  rejection_reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  uploaded_at: string
  is_latest: boolean
}

type DocRequestRow = {
  id: string
  title: string
  details: string | null
  token: string
  status: 'pending' | 'submitted' | 'completed' | 'cancelled'
  expires_at: string
  response_note: string | null
  storage_path: string | null
  original_filename: string | null
  mime_type: string | null
  size_bytes: number | null
  submitted_at: string | null
  completed_at: string | null
  created_at: string
}

type PayoutRow = {
  id: string
  method_type: string
  provider: string | null
  account_number: string
  account_holder_name: string
  status: string
  is_default: boolean
  created_at: string
}

type AgreementRow = {
  id: string
  agreement_version: string
  agreement_text_hash: string
  signed_full_name: string
  signed_ip: string | null
  signed_user_agent: string | null
  signed_at: string
}

export default async function VendorReviewPage({
  params,
}: {
  params: Promise<{ vendorId: string }>
}) {
  const { vendorId } = await params

  const admin = createSupabaseAdminClient()
  const vendorsPortalBase = (
    process.env.NEXT_PUBLIC_VENDORS_PORTAL_URL?.trim() ||
    'https://vendorsportal.opusfesta.com'
  ).replace(/\/$/, '')

  const [vendorRes, docsRes, payoutRes, agreementRes, docRequestsRes] = await Promise.all([
    // Core columns guaranteed to exist after migrations 001 + 056. We pull
    // `packages` in a separate best-effort query below so a missing column
    // (migration 021 not yet applied to the project, or stale PostgREST
    // schema cache) doesn't blow up the whole review page.
    admin
      .from('vendors')
      .select(
        `id, vendor_code, slug, business_name, logo, category, vertical, bio, description,
         location, contact_info, social_links, services_offered,
         years_in_business, onboarding_status, onboarding_started_at,
         onboarding_completed_at, suspended_at, suspension_reason,
         created_at, updated_at,
         team, faqs, packages, awards, hours, languages, response_time_hours,
         locally_owned, parallel_booking_capacity, deposit_percent,
         cancellation_level, reschedule_policy, style, personality,
         cover_image, gallery_urls`,
      )
      .eq('id', vendorId)
      .maybeSingle<VendorRow>(),
    admin
      .from('vendor_verification_documents')
      .select(
        `id, doc_type, storage_path, original_filename, mime_type, size_bytes,
         status, rejection_reason, reviewed_by, reviewed_at, uploaded_at,
         is_latest`,
      )
      .eq('vendor_id', vendorId)
      .order('uploaded_at', { ascending: false })
      .returns<DocRow[]>(),
    admin
      .from('vendor_payout_methods')
      .select(
        `id, method_type, provider, account_number, account_holder_name,
         status, is_default, created_at`,
      )
      .eq('vendor_id', vendorId)
      // Primary first, then oldest — stable order for the review list.
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })
      .returns<PayoutRow[]>(),
    admin
      .from('vendor_agreements')
      .select(
        `id, agreement_version, agreement_text_hash, signed_full_name,
         signed_ip, signed_user_agent, signed_at`,
      )
      .eq('vendor_id', vendorId)
      .order('signed_at', { ascending: false })
      .returns<AgreementRow[]>(),
    admin
      .from('vendor_document_requests')
      .select(
        `id, title, details, token, status, expires_at, response_note,
         storage_path, original_filename, mime_type, size_bytes,
         submitted_at, completed_at, created_at`,
      )
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false })
      .returns<DocRequestRow[]>(),
  ])

  if (vendorRes.error) {
    throw new Error(
      `[admin] vendor query failed: ${vendorRes.error.code} ${vendorRes.error.message}`,
    )
  }
  if (!vendorRes.data) notFound()

  const v = vendorRes.data

  // Best-effort fetch of `packages` (added by migration 021). If the column
  // isn't present on the project (42703) or PostgREST hasn't reloaded its
  // schema cache (PGRST204), we degrade to an empty list rather than fail
  // the whole review page.
  let packages: NonNullable<PackagesRow['packages']> = []
  const packagesRes = await admin
    .from('vendors')
    .select('packages')
    .eq('id', vendorId)
    .maybeSingle<PackagesRow>()

  if (packagesRes.error) {
    if (
      packagesRes.error.code === '42703' ||
      packagesRes.error.code === 'PGRST204'
    ) {
      console.warn(
        `[admin] vendors.packages not available (${packagesRes.error.code}). Apply migration 021 or run NOTIFY pgrst, 'reload schema'. Showing empty packages list.`,
      )
    } else {
      console.warn(
        `[admin] vendors.packages query failed: ${packagesRes.error.code} ${packagesRes.error.message}`,
      )
    }
  } else if (packagesRes.data?.packages) {
    packages = packagesRes.data.packages
  }

  // Best-effort fetch of `application_snapshot` (added by migration
  // 20260502000001). Same degradation pattern as packages — vendors that
  // onboarded *before* this migration won't have a snapshot, and that's fine.
  let applicationSnapshot: Record<string, unknown> | null = null
  const snapshotRes = await admin
    .from('vendors')
    .select('application_snapshot')
    .eq('id', vendorId)
    .maybeSingle<ApplicationSnapshotRow>()

  if (snapshotRes.error) {
    if (
      snapshotRes.error.code === '42703' ||
      snapshotRes.error.code === 'PGRST204'
    ) {
      console.warn(
        `[admin] vendors.application_snapshot not available (${snapshotRes.error.code}). Apply migration 20260502000001 or run NOTIFY pgrst, 'reload schema'.`,
      )
    } else {
      console.warn(
        `[admin] vendors.application_snapshot query failed: ${snapshotRes.error.code} ${snapshotRes.error.message}`,
      )
    }
  } else {
    applicationSnapshot = snapshotRes.data?.application_snapshot ?? null
  }

  // Best-effort fetch of `video_urls` (added by migration 20260512000010).
  // Same degradation pattern as packages / application_snapshot — projects
  // that haven't run the migration yet still load the page; they just see
  // an empty video list.
  let videoUrls: string[] = []
  const videoRes = await admin
    .from('vendors')
    .select('video_urls')
    .eq('id', vendorId)
    .maybeSingle<VideoUrlsRow>()
  if (videoRes.error) {
    if (
      videoRes.error.code === '42703' ||
      videoRes.error.code === 'PGRST204'
    ) {
      console.warn(
        `[admin] vendors.video_urls not available (${videoRes.error.code}). Apply migration 20260512000010.`,
      )
    } else {
      console.warn(
        `[admin] vendors.video_urls query failed: ${videoRes.error.code} ${videoRes.error.message}`,
      )
    }
  } else {
    videoUrls = videoRes.data?.video_urls ?? []
  }

  // Best-effort fetch of capacity/map coords (migration 20260503000001) plus
  // pricing extras + availability (migration 20260624000001). Admin-fillable
  // fields the vendor portal doesn't expose an editor for; degrade gracefully
  // when a project is behind on migrations.
  type PricingCapacityRow = {
    starting_price: string | null
    custom_quotes: boolean | null
    availability: Array<Record<string, unknown>> | null
    capacity: { min?: number; max?: number } | null
    lat: number | null
    lng: number | null
  }
  let pricingCapacity: PricingCapacityRow = {
    starting_price: null,
    custom_quotes: null,
    availability: null,
    capacity: null,
    lat: null,
    lng: null,
  }
  const pcRes = await admin
    .from('vendors')
    .select('starting_price, custom_quotes, availability, capacity, lat, lng')
    .eq('id', vendorId)
    .maybeSingle<PricingCapacityRow>()
  if (pcRes.error) {
    if (pcRes.error.code === '42703' || pcRes.error.code === 'PGRST204') {
      console.warn(
        `[admin] vendors pricing/capacity columns not available (${pcRes.error.code}). Apply migrations 20260503000001 + 20260624000001.`,
      )
    } else {
      console.warn(
        `[admin] vendors pricing/capacity query failed: ${pcRes.error.code} ${pcRes.error.message}`,
      )
    }
  } else if (pcRes.data) {
    pricingCapacity = pcRes.data
  }

  const docs = docsRes.data ?? []
  const latestDocs = docs.filter((d) => d.is_latest)
  const docByType = new Map<string, DocRow>()
  for (const d of latestDocs) docByType.set(d.doc_type, d)

  const tin = docByType.get('tin_certificate') ?? null
  const license =
    docByType.get('business_license') ??
    docByType.get('sole_proprietor_declaration') ??
    null
  // Identity documents — the required NIDA front/back + liveness selfie that
  // vendors now capture via camera (TIN/license are optional). Same table +
  // storage bucket, so admin review + signed-URL preview work unchanged.
  const nationalIdFront = docByType.get('national_id_front') ?? null
  const nationalIdBack = docByType.get('national_id_back') ?? null
  const selfie = docByType.get('selfie_liveness') ?? null

  const toDocSummary = (d: DocRow | null) =>
    d && {
      id: d.id,
      docType: d.doc_type,
      storagePath: d.storage_path,
      filename: d.original_filename,
      mimeType: d.mime_type,
      sizeBytes: d.size_bytes,
      status: d.status,
      rejectionReason: d.rejection_reason,
      reviewedAt: d.reviewed_at,
      uploadedAt: d.uploaded_at,
    }

  // The vendor agreement is the OF-LGL-AGR-002 family — the main contract plus
  // two schedules, each signed independently as its own vendor_agreements row.
  // This mirrors AGREEMENT_DOCS in apps/vendors_portal/src/lib/onboarding/
  // vendor-agreement.ts; keep the version strings in sync if they're bumped.
  const AGREEMENT_FAMILY: ReadonlyArray<{
    version: string
    code: string
    title: string
  }> = [
    {
      version: 'OF-LGL-AGR-002.2026-04',
      code: 'OF-LGL-AGR-002',
      title: 'Mkataba wa Ushirikiano na Mtoa Huduma',
    },
    {
      version: 'OF-LGL-AGR-002-A.2026-04',
      code: 'OF-LGL-AGR-002-A',
      title: 'Masharti ya Kibiashara',
    },
    {
      version: 'OF-LGL-AGR-002-B.2026-04',
      code: 'OF-LGL-AGR-002-B',
      title: 'Maudhui, Ridhaa na Ulinzi wa Taarifa',
    },
  ]

  const signedByVersion = new Map<string, AgreementRow>()
  for (const row of agreementRes.data ?? []) {
    // Ordered signed_at desc, so the first hit per version is the latest.
    if (!signedByVersion.has(row.agreement_version)) {
      signedByVersion.set(row.agreement_version, row)
    }
  }

  // Resolve each signature image path by convention — paths follow
  // `{vendor_id}/signature/{version}.png` and the upload uses upsert. List the
  // folder once and match per version; missing files (vendor typed their name
  // but didn't draw) resolve to null gracefully.
  const { data: signatureFiles } = await admin.storage
    .from('vendor_verification')
    .list(`${vendorId}/signature`, { limit: 100 })
  const signatureNames = new Set((signatureFiles ?? []).map((f) => f.name))

  const agreements = AGREEMENT_FAMILY.map((fam) => {
    const row = signedByVersion.get(fam.version) ?? null
    const signatureImagePath =
      row && signatureNames.has(`${fam.version}.png`)
        ? `${vendorId}/signature/${fam.version}.png`
        : null
    return {
      version: fam.version,
      code: fam.code,
      title: fam.title,
      signed: row
        ? {
            id: row.id,
            textHash: row.agreement_text_hash,
            signedFullName: row.signed_full_name,
            signedIp: row.signed_ip,
            signedUserAgent: row.signed_user_agent,
            signedAt: row.signed_at,
            signatureImagePath,
          }
        : null,
    }
  })

  // Fetch category request (if any) for this vendor — best effort
  let categoryRequest: { requested_label: string; status: string } | null = null
  {
    const { data: catReq } = await admin
      .from('vendor_category_requests')
      .select('requested_label, status')
      .eq('vendor_id', v.id)
      .maybeSingle<{ requested_label: string; status: string }>()
    categoryRequest = catReq ?? null
  }

  // Options for the category picker. Read here rather than in the client so the
  // list is server-rendered with the rest of the page.
  const categoryOptions = await loadVendorCategoryOptions()

  const props: VendorReviewProps = {
    categoryRequest,
    categoryOptions,
    vendor: {
      id: v.id,
      vendorCode: v.vendor_code,
      slug: v.slug,
      businessName: v.business_name,
      category: v.category,
      vertical: isVendorVertical(v.vertical) ? v.vertical : 'service',
      bio: v.bio,
      description: v.description,
      yearsInBusiness: v.years_in_business,
      location: v.location,
      contact: v.contact_info,
      socialLinks: v.social_links,
      services: v.services_offered ?? [],
      packages,
      applicationSnapshot,
      onboardingStatus: v.onboarding_status,
      onboardingStartedAt: v.onboarding_started_at,
      onboardingCompletedAt: v.onboarding_completed_at,
      suspendedAt: v.suspended_at,
      suspensionReason: v.suspension_reason,
      updatedAt: v.updated_at,
      // Editable storefront columns — passed straight through. Editors
      // hydrate their internal state from these on first render.
      teamColumn: v.team ?? [],
      faqsColumn: v.faqs ?? [],
      packagesColumn: v.packages ?? [],
      awardsColumn: v.awards,
      hoursColumn: v.hours,
      languagesColumn: v.languages ?? [],
      responseTimeHoursColumn: v.response_time_hours,
      locallyOwnedColumn: v.locally_owned,
      parallelBookingCapacityColumn: v.parallel_booking_capacity,
      depositPercentColumn: v.deposit_percent,
      cancellationLevelColumn: v.cancellation_level,
      reschedulePolicyColumn: v.reschedule_policy,
      styleColumn: v.style,
      personalityColumn: v.personality,
      coverImageColumn: v.cover_image,
      logoColumn: v.logo ?? null,
      galleryUrlsColumn: v.gallery_urls ?? [],
      videoUrlsColumn: videoUrls,
      startingPriceColumn: pricingCapacity.starting_price,
      customQuotesColumn: pricingCapacity.custom_quotes,
      availabilityColumn: pricingCapacity.availability ?? [],
      capacityColumn: pricingCapacity.capacity,
      latColumn: pricingCapacity.lat,
      lngColumn: pricingCapacity.lng,
    },
    tin: tin && {
      id: tin.id,
      docType: tin.doc_type,
      storagePath: tin.storage_path,
      filename: tin.original_filename,
      mimeType: tin.mime_type,
      sizeBytes: tin.size_bytes,
      status: tin.status,
      rejectionReason: tin.rejection_reason,
      reviewedAt: tin.reviewed_at,
      uploadedAt: tin.uploaded_at,
    },
    license: license && {
      id: license.id,
      docType: license.doc_type,
      storagePath: license.storage_path,
      filename: license.original_filename,
      mimeType: license.mime_type,
      sizeBytes: license.size_bytes,
      status: license.status,
      rejectionReason: license.rejection_reason,
      reviewedAt: license.reviewed_at,
      uploadedAt: license.uploaded_at,
    },
    nationalIdFront: toDocSummary(nationalIdFront),
    nationalIdBack: toDocSummary(nationalIdBack),
    selfie: toDocSummary(selfie),
    payouts: (payoutRes.data ?? []).map((p) => ({
      id: p.id,
      methodType: p.method_type,
      provider: p.provider,
      accountNumber: p.account_number,
      accountHolderName: p.account_holder_name,
      status: p.status,
      isDefault: p.is_default,
    })),
    agreements,
    historicalDocs: docs
      .filter((d) => !d.is_latest)
      .map((d) => ({
        id: d.id,
        docType: d.doc_type,
        storagePath: d.storage_path,
        filename: d.original_filename,
        status: d.status,
        rejectionReason: d.rejection_reason,
        uploadedAt: d.uploaded_at,
      })),
    documentRequests: (docRequestsRes.data ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      details: r.details,
      status: r.status,
      expiresAt: r.expires_at,
      responseNote: r.response_note,
      storagePath: r.storage_path,
      filename: r.original_filename,
      sizeBytes: r.size_bytes,
      submittedAt: r.submitted_at,
      completedAt: r.completed_at,
      createdAt: r.created_at,
      uploadUrl: `${vendorsPortalBase}/upload/${r.token}`,
    })),
  }

  return <VendorReviewClient {...props} />
}
