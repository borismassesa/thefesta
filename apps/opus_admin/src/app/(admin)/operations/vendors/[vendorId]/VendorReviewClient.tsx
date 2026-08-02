'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileSignature,
  FileText,
  IdCard,
  Loader2,
  MoreHorizontal,
  PauseCircle,
  PlayCircle,
  Plus,
  ScanFace,
  ShieldCheck,
  Star,
  Tag,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSetPageHeading } from '@/components/PageHeading'
import { HeaderActionsSlot, HeaderBadgeSlot } from '@/components/HeaderPortals'
import { VERTICAL_LABELS, type VendorVertical } from '../_lib/types'
import {
  approveDocument,
  approveVendor,
  cancelVendorDocumentRequest,
  completeVendorDocumentRequest,
  deleteVendor,
  deleteVendorPayoutMethod,
  generateVendorFileUrl,
  getVendorDeletionImpact,
  reactivateVendor,
  rejectDocument,
  requestCorrections,
  requestVendorDocument,
  saveVendorPayoutMethod,
  setPrimaryPayoutMethod,
  suspendVendor,
  updateVendorCategory,
  type VendorCategoryOption,
  type VendorDeletionImpact,
  type VendorPayoutMethodType,
  type VendorPayoutStatus,
} from '../actions'
import {
  AdminBookingPoliciesEditor,
  AdminPricingCapacityEditor,
  AdminFaqEditor,
  AdminHoursEditor,
  AdminPackagesEditor,
  AdminPhotosVideosEditor,
  AdminProfileEditor,
  AdminRecognitionEditor,
  AdminStylePersonalityEditor,
  AdminTeamEditor,
} from './StorefrontEditors'
import {
  VendorEditorProvider,
  useEditorRegistry,
} from './EditorRegistry'

// ---------------------------------------------------------------------------
// Types — mirror the server-page projection
// ---------------------------------------------------------------------------

type DocStatus = 'pending_review' | 'approved' | 'rejected' | string

export type DocSummary = {
  id: string
  docType: string
  storagePath: string
  filename: string | null
  mimeType: string | null
  sizeBytes: number | null
  status: DocStatus
  rejectionReason: string | null
  reviewedAt: string | null
  uploadedAt: string
}

export type VendorReviewProps = {
  categoryRequest: { requested_label: string; status: string } | null
  categoryOptions: VendorCategoryOption[]
  vendor: {
    id: string
    vendorCode: string | null
    slug: string
    businessName: string
    category: string
    vertical: VendorVertical
    bio: string | null
    description: string | null
    yearsInBusiness: number | null
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
    contact: {
      phone?: string | null
      email?: string | null
      whatsapp?: string | null
    } | null
    socialLinks: Record<string, string | null> | null
    services: string[]
    packages: Array<{
      id?: string
      name?: string
      price?: string
      description?: string
    }>
    applicationSnapshot: Record<string, unknown> | null
    onboardingStatus: string
    onboardingStartedAt: string | null
    onboardingCompletedAt: string | null
    suspendedAt: string | null
    suspensionReason: string | null
    updatedAt: string
    // Live editable storefront columns — used to hydrate the per-section
    // admin editor cards. Each editor reads its slice and emits a patch via
    // updateStorefrontSection on save.
    teamColumn: Array<Record<string, unknown>>
    faqsColumn: Array<Record<string, unknown>>
    packagesColumn: Array<Record<string, unknown>>
    awardsColumn: string | null
    hoursColumn: Record<
      string,
      { open?: boolean; from?: string; to?: string }
    > | null
    languagesColumn: string[]
    responseTimeHoursColumn: string | null
    locallyOwnedColumn: boolean | null
    parallelBookingCapacityColumn: number | null
    depositPercentColumn: string | null
    cancellationLevelColumn: string | null
    reschedulePolicyColumn: string | null
    styleColumn: string | null
    personalityColumn: string | null
    coverImageColumn: string | null
    logoColumn: string | null
    galleryUrlsColumn: string[]
    videoUrlsColumn: string[]
    startingPriceColumn: string | null
    customQuotesColumn: boolean | null
    availabilityColumn: Array<Record<string, unknown>>
    capacityColumn: { min?: number; max?: number } | null
    latColumn: number | null
    lngColumn: number | null
  }
  tin: DocSummary | null
  license: DocSummary | null
  nationalIdFront: DocSummary | null
  nationalIdBack: DocSummary | null
  selfie: DocSummary | null
  // A vendor can register several payout methods; exactly one is the primary
  // (isDefault) destination. Admin verifies each independently.
  payouts: Array<{
    id: string
    methodType: string
    provider: string | null
    accountNumber: string
    accountHolderName: string
    status: string
    isDefault: boolean
  }>
  // The OF-LGL-AGR-002 agreement family — main contract + two schedules, each
  // signed independently. One entry per document (signed or not).
  agreements: Array<{
    version: string
    code: string
    title: string
    signed: {
      id: string
      textHash: string
      signedFullName: string
      signedIp: string | null
      signedUserAgent: string | null
      signedAt: string
      signatureImagePath: string | null
    } | null
  }>
  historicalDocs: Array<{
    id: string
    docType: string
    storagePath: string
    filename: string | null
    status: string
    rejectionReason: string | null
    uploadedAt: string
  }>
  // Admin-requested ad-hoc document uploads (vendor_document_requests). Each is
  // a free-text ask with a tokenized public upload link; the file lands here.
  documentRequests: Array<{
    id: string
    title: string
    details: string | null
    status: 'pending' | 'submitted' | 'completed' | 'cancelled'
    expiresAt: string
    responseNote: string | null
    storagePath: string | null
    filename: string | null
    sizeBytes: number | null
    submittedAt: string | null
    completedAt: string | null
    createdAt: string
    uploadUrl: string
  }>
}

const PAYOUT_METHOD_LABEL: Record<string, string> = {
  mpesa: 'M-Pesa',
  airtel: 'Airtel Money',
  tigo: 'Tigo Pesa',
  lipa_namba: 'Lipa Namba',
  bank: 'Bank account',
  stripe_connect: 'Stripe Connect',
}

const STATUS_LABEL: Record<string, string> = {
  application_in_progress: 'Drafting',
  verification_pending: 'Uploading docs',
  admin_review: 'Awaiting your review',
  needs_corrections: 'Needs corrections',
  active: 'Active',
  suspended: 'Suspended',
}

const STATUS_TONE: Record<string, string> = {
  application_in_progress: 'bg-gray-100 text-gray-700 border-gray-200',
  verification_pending: 'bg-[#F0DFF6] text-[#7E5896] border-[#E0C7E8]',
  admin_review: 'bg-amber-50 text-amber-800 border-amber-200',
  needs_corrections: 'bg-rose-50 text-rose-700 border-rose-200',
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  suspended: 'bg-gray-100 text-gray-700 border-gray-200',
}

const MOBILE_PAYOUT_METHODS = new Set([
  'mpesa',
  'airtel',
  'airtel-money',
  'tigo',
  'tigopesa',
  'halopesa',
])

const PAYOUT_METHOD_OPTIONS: Array<{
  value: VendorPayoutMethodType
  label: string
}> = [
  { value: 'mpesa', label: 'M-Pesa' },
  { value: 'airtel', label: 'Airtel Money' },
  { value: 'tigo', label: 'Tigo Pesa' },
  { value: 'lipa_namba', label: 'Lipa Namba' },
  { value: 'bank', label: 'Bank account' },
  { value: 'stripe_connect', label: 'Stripe Connect' },
]

const PAYOUT_STATUS_OPTIONS: Array<{
  value: VendorPayoutStatus
  label: string
}> = [
  { value: 'pending', label: 'Pending' },
  { value: 'verified', label: 'Verified' },
  { value: 'failed', label: 'Failed' },
]

const REVIEW_INPUT_CLASS =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7E5896]/30 focus:border-[#7E5896]/40'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type VendorTab = 'profile' | 'storefront' | 'availability' | 'verification'

const TAB_ORDER: ReadonlyArray<{ id: VendorTab; label: string }> = [
  { id: 'profile', label: 'Public Profile' },
  { id: 'storefront', label: 'Storefront' },
  { id: 'availability', label: 'Availability' },
  { id: 'verification', label: 'Verification & Payout' },
]

export default function VendorReviewClient(props: VendorReviewProps) {
  const {
    categoryRequest,
    categoryOptions,
    vendor,
    tin,
    license,
    nationalIdFront,
    nationalIdBack,
    selfie,
    payouts,
    agreements,
    historicalDocs,
    documentRequests,
  } = props
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [bannerError, setBannerError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<VendorTab>('profile')
  const [deleteOpen, setDeleteOpen] = useState(false)
  // Drives the in-app note prompt (replaces window.prompt) for the optional
  // message that rides along with Suspend / Request-corrections. `run` receives
  // the typed note when the admin confirms.
  const [notePrompt, setNotePrompt] = useState<{
    title: string
    label: string
    placeholder: string
    confirmLabel: string
    run: (note: string) => void
  } | null>(null)

  const isApproved = vendor.onboardingStatus === 'active'
  const isSuspended = vendor.onboardingStatus === 'suspended'

  // The primary payout (or the first if none flagged) is the one that must be
  // verified before activation; alternates can be verified too but don't gate.
  const primaryPayout =
    payouts.find((p) => p.isDefault) ?? payouts[0] ?? null

  const verificationFlags = {
    // Flagged until every document in the agreement family is signed.
    agreement:
      agreements.length === 0 || agreements.some((a) => !a.signed),
    payout: !primaryPayout || primaryPayout.status !== 'verified',
    tin: !tin || tin.status !== 'approved',
    license: !license || license.status !== 'approved',
  }
  const verificationPending =
    verificationFlags.agreement ||
    verificationFlags.payout ||
    verificationFlags.tin ||
    verificationFlags.license

  // Drive the global Header from real vendor data. The status pill and the
  // Approve / Suspend / Request-corrections buttons portal into the Header
  // slots below; here we just feed the title + subtitle text.
  // The vertical rides in the subtitle only when it isn't the 'service'
  // default, matching the list: it's the exception that needs spotting, because
  // it decides which public catalogue this vendor is published to.
  const subtitleParts = [
    vendor.vendorCode,
    vendor.category,
    vendor.vertical === 'service' ? null : VERTICAL_LABELS[vendor.vertical],
    `/${vendor.slug}`,
    `last update ${formatRelative(vendor.updatedAt)}`,
  ].filter(Boolean) as string[]
  useSetPageHeading({
    title: vendor.businessName,
    subtitle: subtitleParts.join(' · '),
  })

  const runAction = (
    label: string,
    fn: () => Promise<{ ok: boolean; error?: string }>
  ) => {
    setBannerError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) {
        setBannerError(res.error ?? `${label} failed.`)
        return
      }
      router.refresh()
    })
  }

  const openCorrectionsPrompt = () =>
    setNotePrompt({
      title: 'Request corrections',
      label:
        'What does the vendor need to fix? (optional, included in the email to the vendor):',
      placeholder:
        'e.g. The business licence is expired, please re-upload a current one.',
      confirmLabel: 'Request corrections',
      run: (note) =>
        runAction('Request corrections', () =>
          requestCorrections(vendor.id, note || undefined)
        ),
    })

  // Guardrail: documents the admin rejected but hasn't yet notified the vendor
  // about. Rejecting a doc does not email or change the vendor's status on its
  // own; "Request corrections" batches every rejection into one email and moves
  // the vendor to needs_corrections. If anything is rejected and that hasn't
  // happened, the vendor is stuck with no notice, so surface a prompt that can
  // not be missed.
  const rejectedDocCount = [
    tin,
    license,
    nationalIdFront,
    nationalIdBack,
    selfie,
  ].filter((d) => d?.status === 'rejected').length
  const showUnsentRejections =
    rejectedDocCount > 0 &&
    vendor.onboardingStatus !== 'needs_corrections' &&
    !isApproved &&
    !isSuspended

  return (
    <VendorEditorProvider>
    <div className="px-8 pt-4 pb-12">
      <div className="max-w-[1200px] mx-auto">
        {/* Status pill — portaled into the global Header next to the title. */}
        <HeaderBadgeSlot>
          <span
            className={cn(
              'inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border',
              STATUS_TONE[vendor.onboardingStatus] ??
                STATUS_TONE.application_in_progress
            )}
          >
            {STATUS_LABEL[vendor.onboardingStatus] ?? vendor.onboardingStatus}
          </span>
        </HeaderBadgeSlot>

        {/* Vendor-level CTAs — portaled into the Header's right rail so the
            primary action sits next to the global icons, not inside the
            page content. Approve / Reject / Suspend logic unchanged. */}
        <HeaderActionsSlot>
          <div className="flex items-center gap-2">
          {isApproved ? (
            <button
              type="button"
              onClick={() =>
                setNotePrompt({
                  title: 'Suspend vendor',
                  label:
                    'Reason for suspension (optional — included in the notification email to the vendor):',
                  placeholder: 'e.g. Reported by multiple couples for no-shows…',
                  confirmLabel: 'Suspend vendor',
                  run: (note) =>
                    runAction('Suspend', () =>
                      suspendVendor(vendor.id, note || undefined)
                    ),
                })
              }
              disabled={pending}
              className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50 transition-colors"
            >
              <PauseCircle className="w-3.5 h-3.5" />
              Suspend vendor
            </button>
          ) : isSuspended ? (
            <button
              type="button"
              onClick={() =>
                runAction('Reactivate', () => reactivateVendor(vendor.id))
              }
              disabled={pending}
              className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-colors"
            >
              <PlayCircle className="w-3.5 h-3.5" />
              Reactivate
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={openCorrectionsPrompt}
                disabled={pending}
                className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50 transition-colors"
              >
                <ThumbsDown className="w-3.5 h-3.5" />
                Request corrections
              </button>
              <button
                type="button"
                onClick={() =>
                  runAction('Approve & activate', () =>
                    approveVendor(vendor.id)
                  )
                }
                disabled={pending}
                className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50 transition-colors"
              >
                <ThumbsUp className="w-3.5 h-3.5" />
                Approve &amp; activate
              </button>
            </>
          )}
          <HeaderMoreMenu
            disabled={pending}
            onDelete={() => setDeleteOpen(true)}
          />
          </div>
        </HeaderActionsSlot>

        {/* Back link */}
        <Link
          href="/operations/vendors"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          All vendors
        </Link>

        {/* Suspension note (if any) + section-approval pills + transient
            errors stay at the top of the page content — they're contextual
            to this page, not to the global Header. */}
        {isSuspended && vendor.suspensionReason && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5">
            <PauseCircle className="w-3.5 h-3.5 text-gray-500 mt-0.5 shrink-0" />
            <p className="text-xs text-gray-700 leading-relaxed">
              <span className="font-semibold">Suspension note:</span>{' '}
              {vendor.suspensionReason}
            </p>
          </div>
        )}

        {bannerError && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
            <p className="text-xs text-rose-800 leading-relaxed">
              {bannerError}
            </p>
          </div>
        )}

        {categoryRequest && categoryRequest.status === 'pending' && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-[#F0DFF6] border border-[#E0C7E8] px-3 py-2.5">
            <Tag className="w-4 h-4 text-[#7E5896] mt-0.5 shrink-0" />
            <p className="text-xs text-[#5C3A73] leading-relaxed flex-1">
              <strong>New category requested:</strong> &ldquo;{categoryRequest.requested_label}&rdquo; —
              this vendor doesn&apos;t fit an existing category.{' '}
              <Link href="/operations/category-requests" className="underline hover:no-underline font-semibold">
                Review request →
              </Link>
            </p>
          </div>
        )}

        <CategoryCard
          vendorId={vendor.id}
          businessName={vendor.businessName}
          currentCategory={vendor.category}
          currentVertical={vendor.vertical}
          options={categoryOptions}
          pending={pending}
          onError={setBannerError}
          onSaved={() => router.refresh()}
        />

        {/* Un-sent rejections guardrail — rejecting a document neither emails
            the vendor nor changes their status. This makes sure the admin
            doesn't reject docs and forget to actually notify the vendor. */}
        {showUnsentRejections && (
          <div className="mb-4 flex items-start gap-3 rounded-lg bg-rose-50 border border-rose-200 px-4 py-3">
            <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-rose-900">
                {rejectedDocCount} document{rejectedDocCount === 1 ? '' : 's'}{' '}
                rejected, but the vendor hasn&rsquo;t been notified yet
              </p>
              <p className="text-xs text-rose-800 leading-relaxed mt-0.5">
                Rejecting a document doesn&rsquo;t email the vendor on its own.
                Send their corrections so they get one email (with your note and
                a link to re-upload) and can fix everything in one pass.
              </p>
            </div>
            <button
              type="button"
              onClick={openCorrectionsPrompt}
              disabled={pending}
              className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50 transition-colors"
            >
              <ThumbsDown className="w-3 h-3" />
              Request corrections
            </button>
          </div>
        )}

        {/* Tab navigation — splits the page into 4 distinct jobs so the
            highest-leverage actions (Verification & Payout) aren't buried
            at the bottom of a long scroll. */}
        <div className="border-b border-gray-200 mb-8 -mx-1 px-1 overflow-x-auto">
          <nav className="flex gap-1" aria-label="Vendor review sections">
            {TAB_ORDER.map((tab) => {
              const isActive = activeTab === tab.id
              const showPendingBadge =
                tab.id === 'verification' && verificationPending
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'relative inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px whitespace-nowrap',
                    isActive
                      ? 'border-[#7E5896] text-[#7E5896]'
                      : 'border-transparent text-gray-500 hover:text-gray-900'
                  )}
                >
                  {tab.label}
                  {showPendingBadge && (
                    <span className="ml-1 inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                      Review
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
        </div>

        <div className="space-y-10">
          {activeTab === 'profile' && (
          <ReviewSection
            title="Public Profile"
            description="Edit the vendor details couples see first: business profile, contact details, location, capacity, photos, style, and languages."
          >
            <AdminProfileEditor
              vendorId={vendor.id}
              initial={{
                businessName: vendor.businessName,
                bio: vendor.bio ?? '',
                yearsInBusiness: vendor.yearsInBusiness,
                houseNumber: vendor.location?.houseNumber ?? '',
                street: vendor.location?.street ?? '',
                ward: vendor.location?.ward ?? '',
                // Backward compatibility: legacy rows stored the locality as `city`.
                district: vendor.location?.district ?? vendor.location?.city ?? '',
                region: vendor.location?.region ?? '',
                landmark: vendor.location?.landmark ?? '',
                postalCode: vendor.location?.postalCode ?? '',
                phone: formatTzPhone(vendor.contact?.phone ?? null) ?? '',
                email: vendor.contact?.email ?? '',
                whatsapp: formatTzPhone(vendor.contact?.whatsapp ?? null) ?? '',
                socialWebsite:
                  (vendor.socialLinks?.website as string | null) ?? '',
                socialInstagram:
                  (vendor.socialLinks?.instagram as string | null) ?? '',
                socialFacebook:
                  (vendor.socialLinks?.facebook as string | null) ?? '',
                socialTiktok:
                  (vendor.socialLinks?.tiktok as string | null) ?? '',
                socialWhatsapp:
                  formatTzPhone(
                    (vendor.socialLinks?.whatsapp as string | null) ?? null
                  ) ?? '',
                homeMarket: vendor.location?.homeMarket ?? null,
                serviceMarkets: vendor.location?.serviceMarkets ?? [],
              }}
            />

            <AdminStylePersonalityEditor
              vendorId={vendor.id}
              initial={{
                style: vendor.styleColumn,
                personality: vendor.personalityColumn,
                languages: vendor.languagesColumn,
              }}
            />

            {/* Read-only audit of the raw onboarding submission. Lets admins
                inspect exactly what the vendor answered — including any field
                that doesn't (yet) map to a structured column or editor. */}
            {vendor.applicationSnapshot &&
              Object.keys(vendor.applicationSnapshot).length > 0 && (
                <details className="rounded-xl border border-gray-200 bg-gray-50">
                  <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-gray-700">
                    Original application (raw onboarding submission)
                  </summary>
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-gray-200 px-4 py-3 text-xs leading-relaxed text-gray-600">
                    {JSON.stringify(vendor.applicationSnapshot, null, 2)}
                  </pre>
                </details>
              )}
          </ReviewSection>
          )}

          {activeTab === 'storefront' && (
          <ReviewSection
            title="Storefront Content"
            description="Manage the commercial content and trust signals shown on the vendor storefront."
          >
            {/* Logo / profile picture — read-only; the vendor uploads this in
                onboarding or the storefront About editor. */}
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
              {vendor.logoColumn ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={vendor.logoColumn}
                  alt="Vendor logo"
                  className="h-16 w-16 shrink-0 rounded-xl border border-gray-200 bg-white object-contain p-1"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  No logo
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">
                  Logo / profile picture
                </p>
                <p className="text-xs text-gray-500">
                  {vendor.logoColumn
                    ? 'Uploaded by the vendor.'
                    : 'The vendor has not uploaded a logo yet.'}
                </p>
              </div>
            </div>

            <AdminPhotosVideosEditor
              vendorId={vendor.id}
              initial={{
                coverImage: vendor.coverImageColumn,
                galleryUrls: vendor.galleryUrlsColumn,
                videoUrls: vendor.videoUrlsColumn,
              }}
            />

            <AdminPackagesEditor
              vendorId={vendor.id}
              initial={vendor.packagesColumn.map((p, i) => ({
                id:
                  (typeof p.id === 'string' && p.id) ||
                  `pkg-${i}-${Math.random().toString(36).slice(2, 8)}`,
                name: typeof p.name === 'string' ? p.name : '',
                price: typeof p.price === 'string' ? p.price : '',
                description:
                  typeof p.description === 'string' ? p.description : '',
                includes: Array.isArray(p.includes)
                  ? (p.includes as unknown[])
                      .filter((x): x is string => typeof x === 'string')
                      .join('\n')
                  : '',
              }))}
            />

            <AdminRecognitionEditor
              vendorId={vendor.id}
              initial={{
                awards: vendor.awardsColumn,
                responseTimeHours: vendor.responseTimeHoursColumn,
                locallyOwned: vendor.locallyOwnedColumn,
              }}
            />

            <AdminTeamEditor
              vendorId={vendor.id}
              initial={vendor.teamColumn.map((m, i) => ({
                id:
                  (typeof m.id === 'string' && m.id) ||
                  `tm-${i}-${Math.random().toString(36).slice(2, 8)}`,
                name: typeof m.name === 'string' ? m.name : '',
                role: typeof m.role === 'string' ? m.role : '',
                bio: typeof m.bio === 'string' ? m.bio : '',
                avatar: typeof m.avatar === 'string' ? m.avatar : undefined,
              }))}
            />

            <AdminFaqEditor
              vendorId={vendor.id}
              initial={vendor.faqsColumn.map((f, i) => ({
                id:
                  (typeof f.id === 'string' && f.id) ||
                  `faq-${i}-${Math.random().toString(36).slice(2, 8)}`,
                question: typeof f.question === 'string' ? f.question : '',
                answer: typeof f.answer === 'string' ? f.answer : '',
              }))}
            />
          </ReviewSection>
          )}

          {activeTab === 'availability' && (
          <ReviewSection
            title="Availability & Booking Rules"
            description="Set the operational rules that affect how couples book, pay deposits, cancel, and reschedule."
          >
            <AdminHoursEditor
              vendorId={vendor.id}
              initial={
                vendor.hoursColumn
                  ? (vendor.hoursColumn as Parameters<
                      typeof AdminHoursEditor
                    >[0]['initial'])
                  : null
              }
            />

            <AdminBookingPoliciesEditor
              vendorId={vendor.id}
              initial={{
                depositPercent: vendor.depositPercentColumn,
                cancellationLevel: vendor.cancellationLevelColumn,
                reschedulePolicy: vendor.reschedulePolicyColumn,
                parallelBookingCapacity: vendor.parallelBookingCapacityColumn,
              }}
            />

            <AdminPricingCapacityEditor
              vendorId={vendor.id}
              initial={{
                startingPrice: vendor.startingPriceColumn,
                customQuotes: vendor.customQuotesColumn,
                capacityMin: vendor.capacityColumn?.min ?? null,
                capacityMax: vendor.capacityColumn?.max ?? null,
                lat: vendor.latColumn,
                lng: vendor.lngColumn,
              }}
            />

            <AvailabilitySummaryCard entries={vendor.availabilityColumn} />
          </ReviewSection>
          )}

          {activeTab === 'verification' && (
          <ReviewSection
            title="Verification & Payout"
            description="Approve the required legal documents, confirm the vendor agreement, and verify the payout account before activating the vendor."
          >
            <AgreementReviewCard vendorId={vendor.id} agreements={agreements} />

            <PayoutSection vendorId={vendor.id} payouts={payouts} />

            {/* Identity (required) — NIDA front/back + liveness selfie captured
                by the vendor's camera. Same approve/reject flow as any doc. */}
            <DocReviewCard
              vendorId={vendor.id}
              title="National ID — Front"
              subtitle="Front of the Tanzania National ID (NIDA). Required."
              icon={IdCard}
              doc={nationalIdFront}
              missingMessage="Vendor hasn't captured the front of their National ID yet."
              onApprove={(id) =>
                runAction('Approve ID front', () => approveDocument(id))
              }
              onReject={(id, reason) =>
                runAction('Reject ID front', () => rejectDocument(id, reason))
              }
              actionsDisabled={pending || isApproved || isSuspended}
            />

            <DocReviewCard
              vendorId={vendor.id}
              title="National ID — Back"
              subtitle="Back of the Tanzania National ID (NIDA). Required."
              icon={IdCard}
              doc={nationalIdBack}
              missingMessage="Vendor hasn't captured the back of their National ID yet."
              onApprove={(id) =>
                runAction('Approve ID back', () => approveDocument(id))
              }
              onReject={(id, reason) =>
                runAction('Reject ID back', () => rejectDocument(id, reason))
              }
              actionsDisabled={pending || isApproved || isSuspended}
            />

            <DocReviewCard
              vendorId={vendor.id}
              title="Liveness selfie"
              subtitle="Selfie captured to confirm the vendor matches their ID. Required."
              icon={ScanFace}
              doc={selfie}
              missingMessage="Vendor hasn't taken a liveness selfie yet."
              onApprove={(id) =>
                runAction('Approve selfie', () => approveDocument(id))
              }
              onReject={(id, reason) =>
                runAction('Reject selfie', () => rejectDocument(id, reason))
              }
              actionsDisabled={pending || isApproved || isSuspended}
            />

            <DocReviewCard
              vendorId={vendor.id}
              title="TRA TIN certificate"
              subtitle="Tanzania Revenue Authority tax ID. Optional."
              icon={FileText}
              doc={tin}
              missingMessage="Vendor hasn't uploaded the TIN certificate (optional)."
              onApprove={(id) =>
                runAction('Approve TIN', () => approveDocument(id))
              }
              onReject={(id, reason) =>
                runAction('Reject TIN', () => rejectDocument(id, reason))
              }
              actionsDisabled={pending || isApproved || isSuspended}
            />

            <DocReviewCard
              vendorId={vendor.id}
              title="Business license"
              subtitle="BRELA registration, council license, or sole-proprietor declaration. Optional."
              icon={FileText}
              doc={license}
              missingMessage="Vendor hasn't uploaded a business license (optional)."
              onApprove={(id) =>
                runAction('Approve license', () => approveDocument(id))
              }
              onReject={(id, reason) =>
                runAction('Reject license', () => rejectDocument(id, reason))
              }
              actionsDisabled={pending || isApproved || isSuspended}
            />
          </ReviewSection>
          )}

          {activeTab === 'verification' && (
            <ReviewSection
              title="Document requests"
              description="Ask the vendor for an extra document or information. They get an emailed link to upload it with no login, and the file lands here for you to review."
            >
              <DocumentRequestsPanel
                vendorId={vendor.id}
                requests={documentRequests}
              />
            </ReviewSection>
          )}

          {activeTab === 'verification' && historicalDocs.length > 0 && (
            <ReviewSection
              title="Past Submissions"
              description="Older uploads are kept here for audit context; the current review only uses the latest document for each requirement."
            >
              <details className="bg-white rounded-2xl border border-gray-100 px-5 py-4">
                <summary className="cursor-pointer text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <ChevronRight className="w-3.5 h-3.5" />
                  Past document submissions ({historicalDocs.length})
                </summary>
                <ul className="mt-3 space-y-2 text-xs text-gray-600">
                  {historicalDocs.map((d) => (
                    <li key={d.id} className="flex items-center gap-3">
                      <span
                        className={cn(
                          'inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
                          d.status === 'rejected'
                            ? 'bg-rose-50 text-rose-700'
                            : d.status === 'approved'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-800'
                        )}
                      >
                        {d.status}
                      </span>
                      <span className="font-medium">{d.docType}</span>
                      <span className="text-gray-400">
                        {d.filename ?? 'file'} · {formatRelative(d.uploadedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </ReviewSection>
          )}
        </div>

      </div>

      <DeleteVendorDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        vendorId={vendor.id}
        businessName={vendor.businessName}
        onDeleted={() => router.push('/operations/vendors')}
      />
      <NotePromptDialog
        prompt={notePrompt}
        pending={pending}
        onCancel={() => setNotePrompt(null)}
        onConfirm={(note) => {
          notePrompt?.run(note)
          setNotePrompt(null)
        }}
      />
      <GlobalSaveBar />
    </div>
    </VendorEditorProvider>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Re-file a vendor under a different business category.
 *
 * The admin picks a CATEGORY, never a vertical directly: `vendor_categories`
 * owns the mapping and `vendors.vertical` is a denormalised copy of it, so
 * exposing both would be the one way to create a vendor the schema considers
 * self-contradictory (a "Venues" row published in the gift registry).
 *
 * A change that also moves the vertical moves the vendor between public
 * catalogues, so that case is called out with a warning naming the catalogue
 * they leave and the one they land in. There is deliberately no extra
 * confirmation gate: the move is one click, and reversible by picking the old
 * category back. A same-vertical change (Venues → Caterers) is ordinary
 * bookkeeping and saves without ceremony.
 */
function CategoryCard({
  vendorId,
  businessName,
  currentCategory,
  currentVertical,
  options,
  pending,
  onError,
  onSaved,
}: {
  vendorId: string
  businessName: string
  currentCategory: string
  currentVertical: VendorVertical
  options: VendorCategoryOption[]
  pending: boolean
  onError: (msg: string | null) => void
  onSaved: () => void
}) {
  const [choice, setChoice] = useState(currentCategory)
  const [saving, startSaving] = useTransition()

  if (options.length === 0) return null

  const selected = options.find((o) => o.dbValue === choice)
  const nextVertical = (selected?.vertical ?? 'service') as VendorVertical
  const dirty = choice !== currentCategory
  const movesVertical = dirty && nextVertical !== currentVertical
  // The catalogue move and the portal reshape are separate consequences, and
  // they don't always travel together: gift_shop and attire_rings are different
  // catalogues but the same portal shape, so a move between them changes where
  // the vendor is published without touching a single tab. Only mention the
  // portal when it actually changes.
  const reshapesPortal =
    movesVertical && isProductVertical(nextVertical) !== isProductVertical(currentVertical)

  const save = () => {
    onError(null)
    startSaving(async () => {
      const res = await updateVendorCategory(vendorId, choice)
      if (!res.ok) {
        onError(res.error ?? 'Could not change the category.')
        setChoice(currentCategory)
        return
      }
      onSaved()
    })
  }

  // Group the picker by vertical so the consequence of a choice is visible
  // before it's made, rather than only in the warning afterwards.
  const groups = (['service', 'gift_shop', 'attire_rings'] as const)
    .map((v) => ({ vertical: v, items: options.filter((o) => o.vertical === v) }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Tag className="h-4 w-4 shrink-0 text-gray-400" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-900">Business category</p>
          <p className="text-[11px] text-gray-500">
            Decides which public catalogue this vendor appears in.
          </p>
        </div>
        <select
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          disabled={pending || saving}
          aria-label="Business category"
          className="ml-auto rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC] disabled:opacity-50"
        >
          {groups.map((g) => (
            <optgroup key={g.vertical} label={VERTICAL_LABELS[g.vertical]}>
              {g.items.map((o) => (
                <option key={o.slug} value={o.dbValue}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {dirty && (
          <button
            type="button"
            onClick={save}
            disabled={pending || saving}
            className="shrink-0 rounded-full bg-[#5B2D8E] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#4A2472] disabled:opacity-50"
          >
            {saving ? 'Saving…' : movesVertical ? 'Move vendor' : 'Save'}
          </button>
        )}
        {dirty && (
          <button
            type="button"
            onClick={() => setChoice(currentCategory)}
            disabled={pending || saving}
            className="shrink-0 text-xs font-medium text-gray-500 hover:text-gray-900 disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>

      {movesVertical && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <p className="text-xs leading-relaxed text-amber-900">
            This moves <strong>{businessName}</strong> out of{' '}
            {SURFACE_BY_VERTICAL[currentVertical]} and into{' '}
            {SURFACE_BY_VERTICAL[nextVertical]}.{' '}
            {reshapesPortal
              ? nextVertical === 'service'
                ? 'In their portal they get Bookings, Leads, Packages and Availability back, and lose Products and Payments.'
                : 'In their portal they lose Bookings, Leads, Packages and Availability, and gain Products and Payments.'
              : 'Their portal is unchanged: both sell goods rather than booked time.'}
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * Whether a vertical sells goods rather than booked time. Mirrors
 * `sellsProducts()` in the vendors portal, which is what actually decides the
 * portal's shape — the two product verticals are indistinguishable there.
 */
function isProductVertical(vertical: VendorVertical): boolean {
  return vertical === 'gift_shop' || vertical === 'attire_rings'
}

const SURFACE_BY_VERTICAL: Record<VendorVertical, string> = {
  service: 'the wedding vendor directory',
  gift_shop: 'the gift registry',
  attire_rings: 'the Attire & Rings pages',
}

// Header "⋯" overflow menu. Keeps destructive / rare lifecycle actions out of
// the always-visible primary buttons (Approve / Suspend) and off the editing
// surface entirely. Right now it just hosts "Delete vendor account", which
// opens the guarded DeleteVendorDialog.
function HeaderMoreMenu({
  disabled,
  onDelete,
}: {
  disabled?: boolean
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click or Esc — the menu is a thin disclosure, no library.
  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More vendor actions"
        className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 w-56 rounded-xl border border-gray-100 bg-white p-1 shadow-lg z-20"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onDelete()
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 transition-colors"
          >
            <Trash2 className="w-4 h-4 shrink-0" />
            Delete vendor account
          </button>
        </div>
      )}
    </div>
  )
}

// Guarded permanent-deletion dialog. Triggered from the header overflow menu
// (never inline on the editing surface). On open it loads the deletion impact
// (live bookings, reviews) and requires the admin to retype the exact business
// name before the destructive button unlocks.
function DeleteVendorDialog({
  open,
  onClose,
  vendorId,
  businessName,
  onDeleted,
}: {
  open: boolean
  onClose: () => void
  vendorId: string
  businessName: string
  onDeleted: () => void
}) {
  const [confirmText, setConfirmText] = useState('')
  const [impact, setImpact] = useState<VendorDeletionImpact | null>(null)
  const [loadingImpact, setLoadingImpact] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Set when the delete succeeded but the action returned a warning (e.g. the
  // vendor's portal login couldn't be removed). We hold the dialog open on this
  // notice so the admin reads it, then "Done" navigates away.
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Reset the form each time the dialog opens, and fetch the impact summary
  // once per open. Tying the fetch to the open transition keeps it pinned to
  // the admin's intent.
  useEffect(() => {
    if (!open) return
    setConfirmText('')
    setError(null)
    setNotice(null)
    setImpact(null)
    setLoadingImpact(true)
    getVendorDeletionImpact(vendorId).then((res) => {
      setLoadingImpact(false)
      if (res.ok) setImpact(res.impact)
      // A failed impact lookup isn't fatal — the name-match guard still
      // protects the delete. Leave counts unknown rather than blocking.
    })
  }, [open, vendorId])

  // Esc closes the dialog (unless a delete is in flight).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, pending, onClose])

  if (!open) return null

  const confirmed = confirmText.trim() === businessName.trim()

  const onDelete = () => {
    if (!confirmed || pending) return
    setError(null)
    startTransition(async () => {
      const res = await deleteVendor(vendorId, confirmText)
      if (!res.ok) {
        setError(res.error ?? 'Delete failed.')
        return
      }
      // Deleted, but the action flagged a caveat (e.g. the portal login wasn't
      // removed). Hold the dialog open on the notice instead of navigating, so
      // the admin sees what still needs attention.
      if (res.warning) {
        setNotice(res.warning)
        return
      }
      onDeleted()
    })
  }

  // Post-delete notice: the record is already gone, so this is a calm amber
  // "done, but read this" panel — not the destructive red form — with a single
  // "Done" action that navigates away.
  if (notice) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-vendor-notice-title"
      >
        <div className="relative w-full max-w-lg rounded-2xl border border-gray-100 bg-white shadow-xl">
          <header className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-gray-100">
            <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <h2
                id="delete-vendor-notice-title"
                className="text-base font-semibold text-amber-900"
              >
                Vendor deleted — one thing to note
              </h2>
              <p className="text-xs text-amber-800/90 mt-1 leading-relaxed">{notice}</p>
            </div>
          </header>
          <div className="flex items-center justify-end px-6 py-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onDeleted}
              autoFocus
              className="inline-flex items-center text-sm font-semibold px-4 py-2 rounded-full bg-[#7E5896] hover:bg-[#6B4880] text-white shadow-sm transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-vendor-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose()
      }}
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-gray-100 bg-white shadow-xl">
        <header className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="w-10 h-10 rounded-full bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id="delete-vendor-title"
              className="text-base font-semibold text-rose-900"
            >
              Delete vendor account
            </h2>
            <p className="text-xs text-rose-800/80 mt-0.5 leading-relaxed">
              Permanently removes this vendor and everything attached to it —
              bookings, reviews, messages, payouts, verification documents, and
              uploaded media — and deletes their sign-in login so the email is
              freed up. This cannot be undone. To temporarily disable a vendor
              instead, use <span className="font-semibold">Suspend</span> in the
              header.
            </p>
          </div>
        </header>

        <div className="px-6 py-4">
          {/* Impact summary */}
          {loadingImpact ? (
            <p className="text-xs text-gray-500 flex items-center gap-2 mb-4">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Checking what will be removed…
            </p>
          ) : impact ? (
            <div className="flex flex-wrap gap-2 mb-4">
              {impact.liveBookings > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-rose-100 text-rose-800 border border-rose-200">
                  <AlertCircle className="w-3 h-3" />
                  {impact.liveBookings} live booking
                  {impact.liveBookings === 1 ? '' : 's'}
                </span>
              )}
              <ImpactPill label="bookings" count={impact.totalBookings} />
              <ImpactPill label="reviews" count={impact.reviews} />
            </div>
          ) : null}

          {impact && impact.liveBookings > 0 && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-700 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-900 leading-relaxed">
                This vendor has{' '}
                <span className="font-semibold">
                  {impact.liveBookings} active booking
                  {impact.liveBookings === 1 ? '' : 's'}
                </span>{' '}
                with couples. Deleting will also remove{' '}
                {impact.liveBookings === 1 ? 'it' : 'them'}. Consider{' '}
                <span className="font-semibold">Suspend</span> unless
                you&rsquo;re sure.
              </p>
            </div>
          )}

          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Type{' '}
            <span className="font-mono text-rose-700">{businessName}</span> to
            confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={businessName}
            autoComplete="off"
            autoFocus
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
          />

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 text-rose-600 mt-0.5 shrink-0" />
              <p className="text-xs text-rose-800">{error}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex items-center text-sm font-semibold px-4 py-2 rounded-full text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={!confirmed || pending}
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full bg-rose-600 hover:bg-rose-700 text-white shadow-sm disabled:bg-rose-300 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            {pending ? 'Deleting…' : 'Permanently delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// In-app replacement for window.prompt — collects an optional note (suspension
// reason / correction request) in a styled modal. Controlled by a `prompt`
// config object: non-null = open. The textarea resets each time it opens.
function NotePromptDialog({
  prompt,
  pending,
  onCancel,
  onConfirm,
}: {
  prompt: {
    title: string
    label: string
    placeholder: string
    confirmLabel: string
  } | null
  pending: boolean
  onCancel: () => void
  onConfirm: (note: string) => void
}) {
  const [note, setNote] = useState('')

  // Reset the field whenever a new prompt opens.
  useEffect(() => {
    if (prompt) setNote('')
  }, [prompt])

  // Esc cancels (unless a request is mid-flight).
  useEffect(() => {
    if (!prompt) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prompt, pending, onCancel])

  if (!prompt) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="note-prompt-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel()
      }}
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-gray-100 bg-white shadow-xl">
        <header className="px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 id="note-prompt-title" className="text-base font-semibold text-gray-900">
            {prompt.title}
          </h2>
        </header>
        <div className="px-6 py-4">
          <label htmlFor="note-prompt-field" className="block text-sm text-gray-600 leading-relaxed">
            {prompt.label}
          </label>
          <textarea
            id="note-prompt-field"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={prompt.placeholder}
            rows={3}
            autoFocus
            onKeyDown={(e) => {
              // ⌘/Ctrl + Enter submits, matching common note fields.
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !pending) {
                e.preventDefault()
                onConfirm(note.trim())
              }
            }}
            className="mt-2 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] focus:border-transparent"
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-gray-100">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="inline-flex items-center text-sm font-semibold px-4 py-2 rounded-full text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(note.trim())}
            disabled={pending}
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full bg-[#7E5896] hover:bg-[#6B4880] text-white shadow-sm disabled:opacity-50 transition-colors"
          >
            {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {prompt.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function ImpactPill({ label, count }: { label: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-gray-100 text-gray-600 border border-gray-200">
      {count} {label}
    </span>
  )
}

// Read-only view of the vendor's blocked dates (vendors.availability). The
// vendor owns editing this in their portal calendar; admin only needs to see
// it during review, so this is a compact summary rather than an editor.
function AvailabilitySummaryCard({
  entries,
}: {
  entries: Array<Record<string, unknown>>
}) {
  const clean = (Array.isArray(entries) ? entries : [])
    .filter(
      (e): e is { date: string; status: string } =>
        !!e &&
        typeof e.date === 'string' &&
        (e.status === 'unavailable' || e.status === 'limited'),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
  const unavailable = clean.filter((e) => e.status === 'unavailable')
  const limited = clean.filter((e) => e.status === 'limited')

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
      <div className="mb-3 flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-900">Availability</h3>
        <span className="text-xs text-gray-400">vendor-managed</span>
      </div>
      {clean.length === 0 ? (
        <p className="text-sm text-gray-500">
          No blocked dates. The vendor&rsquo;s calendar shows as fully open.
        </p>
      ) : (
        <div className="space-y-3 text-sm">
          {unavailable.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-rose-500">
                Unavailable ({unavailable.length})
              </p>
              <p className="leading-relaxed text-gray-700">
                {unavailable.map((e) => e.date).join(', ')}
              </p>
            </div>
          )}
          {limited.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-amber-500">
                Limited ({limited.length})
              </p>
              <p className="leading-relaxed text-gray-700">
                {limited.map((e) => e.date).join(', ')}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function ReviewSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4">
      <header className="border-b border-gray-200 pb-3">
        <div className="max-w-3xl">
          <h2 className="text-xl font-semibold text-gray-950">{title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">
            {description}
          </p>
        </div>
      </header>
      <div className="space-y-5">{children}</div>
    </section>
  )
}

// Sticky bottom action bar — appears only when one or more storefront editors
// are dirty. Replaces the per-section gray Save buttons. Save All runs every
// dirty editor's save in parallel and shows a transient toast with the result.
// bottomOffsetClass lets the parent bump this bar up when the verification
// action bar is also showing, so they stack instead of overlap.
function GlobalSaveBar({ bottomOffsetClass = 'pb-4' }: { bottomOffsetClass?: string }) {
  const editors = useEditorRegistry()
  const dirty = editors.filter((e) => e.dirty)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<
    { kind: 'ok' | 'mixed' | 'error'; text: string } | null
  >(null)

  // Auto-dismiss toast after 3s.
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const onSaveAll = async () => {
    if (dirty.length === 0 || saving) return
    setSaving(true)
    setToast(null)
    const results = await Promise.allSettled(
      dirty.map(async (editor) => ({ editor, result: await editor.save() }))
    )
    setSaving(false)
    let okCount = 0
    const failed: string[] = []
    results.forEach((r) => {
      if (r.status === 'fulfilled' && r.value.result.ok) okCount += 1
      else if (r.status === 'fulfilled') failed.push(r.value.editor.label)
      else failed.push('Unknown section')
    })
    if (failed.length === 0) {
      setToast({ kind: 'ok', text: `Saved ${okCount} section${okCount === 1 ? '' : 's'}.` })
    } else if (okCount === 0) {
      setToast({
        kind: 'error',
        text: `Couldn't save: ${failed.join(', ')}.`,
      })
    } else {
      setToast({
        kind: 'mixed',
        text: `Saved ${okCount}, failed: ${failed.join(', ')}.`,
      })
    }
  }

  const onDiscardAll = () => {
    if (dirty.length === 0 || saving) return
    dirty.forEach((e) => e.discard())
  }

  if (dirty.length === 0 && !toast) return null

  return (
    <div
      role="region"
      aria-label="Unsaved changes"
      className={cn(
        'fixed bottom-0 right-0 left-0 lg:left-64 z-40 pointer-events-none flex justify-center px-4',
        bottomOffsetClass
      )}
    >
      <div className="pointer-events-auto w-full max-w-[1200px]">
        {toast && (
          <div
            className={cn(
              'mb-3 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold shadow-lg border',
              toast.kind === 'ok' &&
                'bg-emerald-600 border-emerald-700 text-white',
              toast.kind === 'mixed' &&
                'bg-amber-500 border-amber-600 text-white',
              toast.kind === 'error' &&
                'bg-rose-600 border-rose-700 text-white'
            )}
          >
            {toast.kind === 'ok' && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
            {toast.kind === 'mixed' && <AlertCircle className="w-3.5 h-3.5" />}
            {toast.kind === 'error' && <XCircle className="w-3.5 h-3.5" />}
            {toast.text}
          </div>
        )}
        {dirty.length > 0 && (
          <div className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-2xl shadow-[0_12px_32px_-8px_rgba(0,0,0,0.18)] px-5 py-3">
            <div className="text-sm">
              <span className="font-semibold text-gray-900">
                {dirty.length} unsaved change{dirty.length === 1 ? '' : 's'}
              </span>
              <span className="text-gray-500 ml-2 hidden sm:inline">
                {dirty.map((e) => e.label).join(', ')}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onDiscardAll}
                disabled={saving}
                className="inline-flex items-center text-sm font-semibold px-4 py-2 rounded-full text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition-colors"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={onSaveAll}
                disabled={saving}
                className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full bg-[#7E5896] hover:bg-[#6B4880] text-white shadow-sm disabled:opacity-50 transition-colors"
              >
                <Check className="w-3.5 h-3.5" strokeWidth={3} />
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function useReviewAction() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const run = (
    action: () => Promise<{ ok: boolean; error?: string }>,
    after?: () => void
  ) => {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const res = await action()
      if (!res.ok) {
        setError(res.error ?? 'Action failed.')
        return
      }
      setSaved(true)
      after?.()
      router.refresh()
    })
  }

  return { pending, error, saved, run }
}

function ReviewPanelActions({
  pending,
  dirty,
  error,
  saved,
  onSave,
  children,
  saveLabel = 'Save',
}: {
  pending: boolean
  dirty: boolean
  error: string | null
  saved: boolean
  onSave: () => void
  children?: React.ReactNode
  saveLabel?: string
}) {
  return (
    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
      <div className="text-xs">
        {error && <span className="text-rose-700">{error}</span>}
        {saved && !error && <span className="text-emerald-700">Saved.</span>}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {children}
        <button
          type="button"
          onClick={onSave}
          disabled={pending || !dirty}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-gray-900 hover:bg-black text-white disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          <Check className="w-3 h-3" strokeWidth={3} />
          {pending ? 'Saving...' : saveLabel}
        </button>
      </div>
    </div>
  )
}

function PayoutSection({
  vendorId,
  payouts,
}: {
  vendorId: string
  payouts: VendorReviewProps['payouts']
}) {
  const [adding, setAdding] = useState(false)

  return (
    <SidePanel title="Payout methods" icon={Banknote}>
      <div className="flex flex-col gap-4">
        {payouts.length === 0 && !adding && (
          <p className="text-sm text-gray-500 italic">
            No payout method on file yet. Add the destination the vendor sent
            over.
          </p>
        )}

        {payouts.map((p) => (
          <PayoutCard
            key={p.id}
            vendorId={vendorId}
            payout={p}
            canSetPrimary={payouts.length > 1 && !p.isDefault}
          />
        ))}

        {adding && (
          <PayoutCard
            vendorId={vendorId}
            payout={null}
            canSetPrimary={false}
            isFirst={payouts.length === 0}
            onDone={() => setAdding(false)}
          />
        )}

        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-[#7E5896] hover:text-[#6B4880] transition-colors"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Add payout method
          </button>
        )}
      </div>

      <p className="text-[11px] text-gray-500 italic mt-4">
        Verify the account holder name matches the TIN certificate above before
        approving the vendor. The <span className="font-semibold">primary</span>{' '}
        method must be verified to activate.
      </p>
    </SidePanel>
  )
}

function PayoutCard({
  vendorId,
  payout,
  canSetPrimary,
  isFirst = false,
  onDone,
}: {
  vendorId: string
  payout: VendorReviewProps['payouts'][number] | null
  canSetPrimary: boolean
  isFirst?: boolean
  onDone?: () => void
}) {
  const initialMethod = isVendorPayoutMethodType(payout?.methodType)
    ? payout.methodType
    : 'mpesa'
  const initialStatus = isVendorPayoutStatus(payout?.status)
    ? payout.status
    : 'pending'
  const initialProvider = payout?.provider ?? ''
  const initialAccountNumber = payout ? formatPayoutAccountNumber(payout) : ''
  const initialAccountName = payout?.accountHolderName ?? ''

  const [methodType, setMethodType] =
    useState<VendorPayoutMethodType>(initialMethod)
  const [provider, setProvider] = useState(initialProvider)
  const [accountNumber, setAccountNumber] = useState(initialAccountNumber)
  const [accountHolderName, setAccountHolderName] = useState(initialAccountName)
  const [status, setStatus] = useState<VendorPayoutStatus>(initialStatus)
  const { pending, error, saved, run } = useReviewAction()

  const dirty =
    methodType !== initialMethod ||
    provider !== initialProvider ||
    accountNumber !== initialAccountNumber ||
    accountHolderName !== initialAccountName ||
    status !== initialStatus ||
    !payout

  const save = (nextStatus = status) =>
    run(
      () =>
        saveVendorPayoutMethod(vendorId, payout?.id ?? null, {
          methodType,
          provider: provider || null,
          accountNumber,
          accountHolderName,
          status: nextStatus,
          // A brand-new first method becomes the default; extra ones are
          // alternates the admin can promote with "Make primary".
          makeDefault: !payout ? isFirst : undefined,
        }),
      () => onDone?.()
    )

  const saveWithStatus = (nextStatus: VendorPayoutStatus) => {
    setStatus(nextStatus)
    save(nextStatus)
  }

  const deletePayout = () => {
    if (!payout?.id) return
    const confirmed = window.confirm(
      'Delete this payout method? If it was the primary, set another as primary afterward.'
    )
    if (!confirmed) return
    run(() => deleteVendorPayoutMethod(vendorId, payout.id))
  }

  const makePrimary = () => {
    if (!payout?.id) return
    run(() => setPrimaryPayoutMethod(vendorId, payout.id))
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">
            {payout
              ? PAYOUT_METHOD_LABEL[methodType] ?? methodType
              : 'New payout method'}
          </span>
          {payout?.isDefault && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#F0DFF6] text-[#7E5896]">
              <Star className="w-2.5 h-2.5 fill-current" />
              Primary
            </span>
          )}
          {payout && (
            <span
              className={cn(
                'inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
                status === 'verified'
                  ? 'bg-emerald-50 text-emerald-700'
                  : status === 'failed'
                    ? 'bg-rose-50 text-rose-700'
                    : 'bg-amber-50 text-amber-800'
              )}
            >
              {status}
            </span>
          )}
        </div>
        {canSetPrimary && (
          <button
            type="button"
            onClick={makePrimary}
            disabled={pending}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#7E5896] hover:text-[#6B4880] disabled:opacity-50 transition-colors"
          >
            <Star className="w-3.5 h-3.5" />
            Make primary
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <Field label="Method">
          <select
            className={REVIEW_INPUT_CLASS}
            value={methodType}
            onChange={(e) =>
              setMethodType(e.target.value as VendorPayoutMethodType)
            }
          >
            {PAYOUT_METHOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            className={REVIEW_INPUT_CLASS}
            value={status}
            onChange={(e) => setStatus(e.target.value as VendorPayoutStatus)}
          >
            {PAYOUT_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Provider">
          <input
            className={REVIEW_INPUT_CLASS}
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            placeholder="Optional"
          />
        </Field>
        <Field label="Account number">
          <input
            className={`${REVIEW_INPUT_CLASS} font-mono`}
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="+255 754 123 456"
          />
        </Field>
        <Field label="Account name">
          <input
            className={REVIEW_INPUT_CLASS}
            value={accountHolderName}
            onChange={(e) => setAccountHolderName(e.target.value)}
          />
        </Field>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs min-w-0">
          {error && <span className="text-rose-700">{error}</span>}
          {saved && !error && <span className="text-emerald-700">Saved.</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {payout?.id ? (
            <button
              type="button"
              onClick={deletePayout}
              disabled={pending}
              className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-full bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Delete
            </button>
          ) : onDone ? (
            <button
              type="button"
              onClick={onDone}
              disabled={pending}
              className="inline-flex items-center text-xs font-semibold px-2.5 py-1.5 rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => saveWithStatus('failed')}
            disabled={pending || !payout}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 disabled:opacity-50 transition-colors"
          >
            <XCircle className="w-3 h-3" />
            Mark failed
          </button>
          <button
            type="button"
            onClick={() => save()}
            disabled={pending || !dirty}
            className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-gray-900 hover:bg-black text-white disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? 'Saving…' : payout ? 'Save' : 'Create'}
          </button>
          <button
            type="button"
            onClick={() => saveWithStatus('verified')}
            disabled={pending}
            className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50 transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Verify
          </button>
        </div>
      </div>
    </div>
  )
}

// Force-download a Supabase signed URL as a file. Appending `&download=<name>`
// makes storage respond with Content-Disposition: attachment, so the browser
// saves the file instead of opening it (the anchor `download` attribute alone
// is ignored cross-origin).
function downloadSignedUrl(signedUrl: string, filename: string) {
  const sep = signedUrl.includes('?') ? '&' : '?'
  const a = document.createElement('a')
  a.href = `${signedUrl}${sep}download=${encodeURIComponent(filename)}`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function slugifyFilename(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Open a print-optimized window with the full signing audit + drawn signature
// for one signed agreement document. The admin saves it as a PDF from the
// browser's print dialog. Self-contained so it doubles as a legal record.
function printAgreementRecord(
  doc: VendorReviewProps['agreements'][number],
  signatureUrl: string | null,
) {
  const s = doc.signed
  if (!s) return
  const esc = (v: string | null | undefined) =>
    (v ?? '').replace(
      /[&<>"]/g,
      (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
    )
  const signedAt = new Date(s.signedAt).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const win = window.open('', '_blank', 'width=820,height=1040')
  if (!win) return
  const row = (label: string, value: string, mono = false) =>
    `<tr><td class="lbl">${esc(label)}</td><td class="${mono ? 'mono' : ''}">${esc(value)}</td></tr>`
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.title)} — signed record</title>
<style>
  *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;margin:48px;line-height:1.5}
  .brand{font-weight:700;font-size:18px;letter-spacing:-.01em;margin-bottom:24px}
  h1{font-size:20px;margin:0 0 2px} .code{font-family:ui-monospace,Menlo,monospace;color:#888;font-size:12px}
  table{border-collapse:collapse;width:100%;margin-top:20px;font-size:13px}
  td{padding:7px 0;border-bottom:1px solid #eee;vertical-align:top}
  td.lbl{color:#888;width:170px;padding-right:16px} .mono{font-family:ui-monospace,Menlo,monospace;font-size:12px;word-break:break-all}
  .sig{margin-top:24px} .sig p{color:#888;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;margin:0 0 6px}
  .sig img{max-width:280px;border:1px solid #ddd;border-radius:8px;background:#fff;padding:4px}
  .foot{margin-top:32px;font-size:11px;color:#999}
</style></head><body>
  <div class="brand">OpusFesta — Vendor agreement record</div>
  <h1>${esc(doc.title)}</h1>
  <div class="code">${esc(doc.code)}</div>
  <table>
    ${row('Version', doc.version, true)}
    ${row('Signed name', s.signedFullName)}
    ${row('Signed at', signedAt)}
    ${s.signedIp ? row('IP address', s.signedIp, true) : ''}
    ${s.signedUserAgent ? row('User-agent', s.signedUserAgent, true) : ''}
    ${row('Body hash (SHA-256)', s.textHash, true)}
  </table>
  ${signatureUrl ? `<div class="sig"><p>Drawn signature</p><img src="${esc(signatureUrl)}" alt="signature"></div>` : ''}
  <div class="foot">This record certifies the vendor e-signed ${esc(doc.title)} (${esc(doc.code)}). The body hash binds the signature to the exact agreement text presented at signing.</div>
</body></html>`,
  )
  win.document.close()
  win.focus()
  // Give the signature image a moment to load before printing.
  setTimeout(() => win.print(), 400)
}

function DocReviewCard({
  vendorId,
  title,
  subtitle,
  icon: Icon,
  doc,
  missingMessage,
  onApprove,
  onReject,
  actionsDisabled,
}: {
  vendorId: string
  title: string
  subtitle: string
  icon: typeof FileText
  doc: DocSummary | null
  missingMessage: string
  onApprove: (id: string) => void
  onReject: (id: string, reason: string) => void
  actionsDisabled: boolean
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectReason, setRejectReason] = useState(doc?.rejectionReason ?? '')

  // Mint a signed URL on mount whenever a doc exists. URLs expire in 10
  // minutes; the click-to-refresh affordance below regenerates if needed.
  useEffect(() => {
    if (!doc) {
      setSignedUrl(null)
      return
    }
    let cancelled = false
    generateVendorFileUrl(vendorId, {
      kind: 'verification-document',
      documentId: doc.id,
    }).then((res) => {
      if (cancelled) return
      if (!res.ok) {
        setUrlError(res.error)
      } else {
        setSignedUrl(res.url)
      }
    })
    return () => {
      cancelled = true
    }
  }, [vendorId, doc?.storagePath, doc?.id])

  const isPending = doc?.status === 'pending_review'
  const isApproved = doc?.status === 'approved'
  const isRejected = doc?.status === 'rejected'

  return (
    <article className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-6">
      <header className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-white border border-gray-200 text-gray-500 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {doc && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border',
                  isApproved &&
                    'bg-emerald-50 text-emerald-700 border-emerald-200',
                  isPending && 'bg-amber-50 text-amber-800 border-amber-200',
                  isRejected && 'bg-rose-50 text-rose-700 border-rose-200'
                )}
              >
                {isApproved && (
                  <Check className="w-2.5 h-2.5" strokeWidth={3} />
                )}
                {isPending && <Clock className="w-2.5 h-2.5" />}
                {isRejected && <XCircle className="w-2.5 h-2.5" />}
                {doc.status.replace('_', ' ')}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
          {doc && (
            <p className="text-xs text-gray-500 mt-1">
              <span className="font-semibold text-gray-700">
                {doc.filename ?? 'Uploaded file'}
              </span>{' '}
              {doc.docType !== title && (
                <span>
                  · stored as{' '}
                  <code className="font-mono text-[11px]">{doc.docType}</code>
                </span>
              )}{' '}
              · uploaded {formatRelative(doc.uploadedAt)}
              {doc.reviewedAt &&
                ` · reviewed ${formatRelative(doc.reviewedAt)}`}
            </p>
          )}
        </div>
      </header>

      {!doc ? (
        <p className="text-sm text-gray-500 italic">{missingMessage}</p>
      ) : (
        <>
          {/* Embedded preview */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden mb-4">
            {urlError ? (
              <div className="p-6 text-center text-xs text-rose-700">
                {urlError}
              </div>
            ) : !signedUrl ? (
              <div className="p-6 text-center text-xs text-gray-500 flex items-center justify-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Generating preview…
              </div>
            ) : doc.mimeType?.startsWith('image/') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={signedUrl}
                alt={doc.filename ?? 'Uploaded document'}
                className="block w-full max-h-[640px] object-contain bg-gray-100"
              />
            ) : (
              <object
                data={`${signedUrl}#view=FitH`}
                type={doc.mimeType ?? 'application/pdf'}
                aria-label={doc.filename ?? 'Uploaded document'}
                className="w-full h-[640px]"
              >
                <div className="p-6 text-center text-xs text-gray-600">
                  Can&rsquo;t display this file inline.{' '}
                  <a
                    href={signedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-[#7E5896] underline underline-offset-2"
                  >
                    Open in a new tab
                  </a>
                </div>
              </object>
            )}
          </div>

          {/* Open / download affordances */}
          {signedUrl && (
            <div className="flex items-center gap-4 mb-4">
              <a
                href={signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900"
              >
                <ExternalLink className="w-3 h-3" />
                Open in new tab
              </a>
              <button
                type="button"
                onClick={() =>
                  downloadSignedUrl(
                    signedUrl,
                    doc?.filename || `${slugifyFilename(title)}.jpg`,
                  )
                }
                className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900"
              >
                <Download className="w-3 h-3" />
                Download
              </button>
            </div>
          )}

          {/* Existing rejection reason if any */}
          {isRejected && doc.rejectionReason && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-100 px-3 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
              <p className="text-xs text-rose-800 leading-relaxed">
                <span className="font-semibold">Current rejection note:</span>{' '}
                {doc.rejectionReason}
              </p>
            </div>
          )}

          {/* Actions */}
          {!actionsDisabled && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => onApprove(doc.id)}
                disabled={isApproved}
                className={cn(
                  'inline-flex items-center gap-1.5 text-sm font-semibold px-3.5 py-1.5 rounded-full transition-colors',
                  isApproved
                    ? 'bg-emerald-50 text-emerald-700 cursor-default'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                )}
              >
                <ThumbsUp className="w-3.5 h-3.5" />
                {isApproved ? 'Approved' : 'Approve'}
              </button>
              <button
                type="button"
                onClick={() => setShowRejectForm((s) => !s)}
                className={cn(
                  'inline-flex items-center gap-1.5 text-sm font-semibold px-3.5 py-1.5 rounded-full transition-colors',
                  showRejectForm
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-white border border-rose-200 text-rose-700 hover:bg-rose-50'
                )}
              >
                <ThumbsDown className="w-3.5 h-3.5" />
                {showRejectForm ? 'Cancel' : 'Reject…'}
              </button>
            </div>
          )}

          {showRejectForm && (
            <div className="mt-3 rounded-xl bg-rose-50/40 border border-rose-100 p-3">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Rejection note (the vendor sees this verbatim)
              </label>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Image is blurry — please re-scan the certificate."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => {
                  if (!doc) return
                  onReject(doc.id, rejectReason)
                  setShowRejectForm(false)
                }}
                disabled={!rejectReason.trim()}
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold px-3.5 py-1.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50 transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" />
                Send rejection
              </button>
            </div>
          )}
        </>
      )}
    </article>
  )
}

function AgreementReviewCard({
  vendorId,
  agreements,
}: {
  vendorId: string
  agreements: VendorReviewProps['agreements']
}) {
  const signedCount = agreements.filter((a) => a.signed).length
  const allSigned = agreements.length > 0 && signedCount === agreements.length

  return (
    <article className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-6">
      <header className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-white border border-gray-200 text-gray-500 flex items-center justify-center shrink-0">
          <FileSignature className="w-5 h-5" strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold text-gray-900">
              Vendor agreement
            </h2>
            {allSigned ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-2.5 h-2.5" />
                All signed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 border border-gray-200">
                {signedCount}/{agreements.length} signed
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Mkataba wa Watoa Huduma (OF-LGL-AGR-002) · the binding e-signatures
            on the main contract and its two schedules, separate from the
            Vendor Vows pledge.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-3">
        {agreements.map((doc) => (
          <AgreementDocRow key={doc.version} vendorId={vendorId} doc={doc} />
        ))}
      </div>
    </article>
  )
}

/**
 * One document in the agreement family — its signature audit detail when
 * signed, or a muted "not signed" placeholder otherwise.
 */
function AgreementDocRow({
  vendorId,
  doc,
}: {
  vendorId: string
  doc: VendorReviewProps['agreements'][number]
}) {
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  // Only an existence signal now — the action rebuilds the key itself from
  // the agreement version after confirming the row belongs to this vendor.
  const hasSignatureImage = Boolean(doc.signed?.signatureImagePath)

  useEffect(() => {
    if (!hasSignatureImage) return
    let cancelled = false
    generateVendorFileUrl(vendorId, {
      kind: 'agreement-signature',
      agreementVersion: doc.version,
    }).then((res) => {
      if (cancelled) return
      if (res.ok) setSignatureUrl(res.url)
    })
    return () => {
      cancelled = true
    }
  }, [hasSignatureImage, vendorId, doc.version])

  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        doc.signed
          ? 'border-emerald-200 bg-emerald-50/40'
          : 'border-gray-200 bg-gray-50/40',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-900">
              {doc.title}
            </h3>
            <span className="font-mono text-[10px] text-gray-400">
              {doc.code}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {doc.signed ? (
            <>
              <button
                type="button"
                onClick={() => printAgreementRecord(doc, signatureUrl)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 hover:text-gray-900 px-2 py-0.5 rounded-md border border-gray-200 bg-white transition-colors"
              >
                <Download className="w-3 h-3" />
                Download record
              </button>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-2.5 h-2.5" />
                Signed
              </span>
            </>
          ) : (
            <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 border border-gray-200">
              Not signed
            </span>
          )}
        </div>
      </div>

      {!doc.signed ? (
        <p className="mt-2 text-xs text-gray-500 italic">
          Vendor hasn&rsquo;t signed this document yet.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <ul className="space-y-1.5 text-xs text-gray-700">
            <li>
              <span className="text-gray-400">Version:</span>{' '}
              <span className="font-mono">{doc.version}</span>
            </li>
            <li>
              <span className="text-gray-400">Signed name:</span>{' '}
              <span className="font-semibold">
                {doc.signed.signedFullName}
              </span>
            </li>
            <li>
              <span className="text-gray-400">Signed at:</span>{' '}
              {new Date(doc.signed.signedAt).toLocaleString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </li>
            {doc.signed.signedIp && (
              <li>
                <span className="text-gray-400">IP:</span>{' '}
                <span className="font-mono">{doc.signed.signedIp}</span>
              </li>
            )}
            {doc.signed.signedUserAgent && (
              <li className="break-words">
                <span className="text-gray-400">User-agent:</span>{' '}
                <span className="font-mono text-[11px] text-gray-500">
                  {doc.signed.signedUserAgent}
                </span>
              </li>
            )}
            <li className="pt-2 border-t border-gray-100">
              <span className="text-gray-400">Body hash (SHA-256):</span>{' '}
              <span className="font-mono text-[11px] text-gray-500 break-all">
                {doc.signed.textHash}
              </span>
            </li>
          </ul>

          {/* Drawn signature image, if the vendor opted to draw */}
          {signatureUrl ? (
            <div className="self-start">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                Drawn signature
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signatureUrl}
                alt="Vendor's drawn signature"
                className="block w-48 h-auto rounded-lg border border-gray-200 bg-white"
              />
              <button
                type="button"
                onClick={() =>
                  downloadSignedUrl(signatureUrl, `signature-${slugifyFilename(doc.code)}.png`)
                }
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 hover:text-gray-900"
              >
                <Download className="w-3 h-3" />
                Download signature
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-gray-400 italic">
              Vendor signed by typed name only (no canvas drawing).
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function isVendorPayoutMethodType(
  value: string | null | undefined
): value is VendorPayoutMethodType {
  return PAYOUT_METHOD_OPTIONS.some((option) => option.value === value)
}

function isVendorPayoutStatus(
  value: string | null | undefined
): value is VendorPayoutStatus {
  return PAYOUT_STATUS_OPTIONS.some((option) => option.value === value)
}

function formatPayoutAccountNumber(
  payout: NonNullable<VendorReviewProps['payouts'][number]>
): string {
  if (!MOBILE_PAYOUT_METHODS.has(payout.methodType)) {
    return payout.accountNumber
  }

  return formatTzPhone(payout.accountNumber) ?? payout.accountNumber
}

function formatTzPhone(raw: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('+')) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return trimmed
  if (digits.startsWith('255')) return `+255 ${digits.slice(3)}`
  if (digits.startsWith('0')) return `+255 ${digits.slice(1)}`
  return `+255 ${digits}`
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}

function SidePanel({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: LucideIcon
  children: React.ReactNode
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-5">
      <header className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-gray-500" strokeWidth={1.75} />
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </header>
      {children}
    </section>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <dt className="text-gray-400">{label}</dt>
      <dd className="text-gray-900 font-medium mt-0.5">{children}</dd>
    </div>
  )
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// ── Document requests panel ─────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

type DocumentRequest = VendorReviewProps['documentRequests'][number]

const DOC_REQUEST_TONE: Record<DocumentRequest['status'], string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
}

function formatBytes(n: number | null): string {
  if (!n || n <= 0) return ''
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function DocumentRequestsPanel({
  vendorId,
  requests,
}: {
  vendorId: string
  requests: DocumentRequest[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const run = (fn: () => Promise<{ ok: boolean; error?: string; warning?: string }>) => {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) {
        setError(res.error ?? 'Something went wrong.')
        return
      }
      if (res.warning) setError(res.warning)
      router.refresh()
    })
  }

  const submitRequest = () => {
    if (!title.trim()) {
      setError('Describe the document you need.')
      return
    }
    run(async () => {
      const res = await requestVendorDocument(vendorId, title.trim(), details.trim() || undefined)
      if (res.ok) {
        setTitle('')
        setDetails('')
        setShowForm(false)
      }
      return res
    })
  }

  const preview = (requestId: string) => {
    startTransition(async () => {
      const res = await generateVendorFileUrl(vendorId, {
        kind: 'document-request',
        requestId,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      window.open(res.url, '_blank', 'noopener,noreferrer')
    })
  }

  const copyLink = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(id)
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1800)
    } catch {
      setError('Could not copy the link.')
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-xs text-rose-600 font-medium">{error}</p>
      )}

      {showForm ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={160}
            placeholder="What do you need? e.g. 2024 TRA tax clearance"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-[#C9A0DC]"
          />
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={2}
            placeholder="Optional: extra instructions for the vendor."
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-[#C9A0DC]"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={submitRequest}
              disabled={pending || !title.trim()}
              className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full bg-[#C9A0DC] hover:bg-[#b98dcc] text-white disabled:opacity-50 transition-colors"
            >
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Send request
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setError(null) }}
              disabled={pending}
              className="text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-2 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full bg-white border border-gray-200 text-gray-800 hover:bg-gray-50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Request a document
        </button>
      )}

      {requests.length === 0 ? (
        <p className="text-xs text-gray-500">No document requests yet.</p>
      ) : (
        <ul className="space-y-2">
          {requests.map((r) => {
            const expired = r.status === 'pending' && new Date(r.expiresAt) < new Date()
            return (
              <li key={r.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 truncate">{r.title}</span>
                      <span className={cn('inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border', DOC_REQUEST_TONE[r.status])}>
                        {expired ? 'expired' : r.status}
                      </span>
                    </div>
                    {r.details && <p className="mt-0.5 text-xs text-gray-500">{r.details}</p>}
                    {r.status === 'submitted' && r.filename && (
                      <p className="mt-1 text-xs text-gray-600 flex items-center gap-1.5">
                        <FileText className="w-3 h-3 shrink-0" />
                        {r.filename}{r.sizeBytes ? ` · ${formatBytes(r.sizeBytes)}` : ''}
                      </p>
                    )}
                    {r.responseNote && (
                      <p className="mt-1 text-xs text-gray-500 italic">“{r.responseNote}”</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {r.status === 'pending' && !expired && (
                      <>
                        <button
                          type="button"
                          onClick={() => copyLink(r.id, r.uploadUrl)}
                          className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                        >
                          {copiedId === r.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          {copiedId === r.id ? 'Copied' : 'Copy link'}
                        </button>
                        <button
                          type="button"
                          onClick={() => run(() => cancelVendorDocumentRequest(r.id))}
                          disabled={pending}
                          className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        >
                          <XCircle className="w-3 h-3" />
                          Cancel
                        </button>
                      </>
                    )}
                    {r.status === 'submitted' && (
                      <>
                        {r.storagePath && (
                          <button
                            type="button"
                            onClick={() => preview(r.id)}
                            disabled={pending}
                            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Preview
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => run(() => completeVendorDocumentRequest(r.id))}
                          disabled={pending}
                          className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                        >
                          <Check className="w-3 h-3" />
                          Mark complete
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <p className="mt-1.5 text-[11px] text-gray-400">
                  {r.status === 'pending' && !expired && `Link expires ${formatDate(r.expiresAt)}`}
                  {r.status === 'submitted' && r.submittedAt && `Uploaded ${formatDate(r.submittedAt)}`}
                  {r.status === 'completed' && r.completedAt && `Completed ${formatDate(r.completedAt)}`}
                  {(r.status === 'cancelled' || expired) && `Requested ${formatDate(r.createdAt)}`}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
