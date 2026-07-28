// OF-ENG-SPEC-002 — Vendor accounts admin page redesign
// Data contracts for the list page. The UI consumes `VendorAccount` and
// `QueueHealth`; the server page projects raw Supabase rows into these
// shapes so the client doesn't have to know about column names.

export type VendorStatus =
  | 'awaiting_review'
  | 'needs_corrections'
  | 'uploading_docs'
  | 'drafting'
  | 'active'
  | 'suspended'

export type VendorCategory =
  | 'venues'
  | 'photographers'
  | 'videographers'
  | 'caterers'
  | 'decor'
  | 'mcs'
  | 'beauty'
  | 'cakes'
  | 'transport'
  | 'attire'

export type AgreementStatus = 'signed' | 'pending' | 'declined'

// Which business a vendor is actually in. Mirrors `vendors.vertical`
// (migration 20260725000001_vendor_verticals), the column that decides which
// public surface the vendor is published on: the wedding vendor directory, the
// gift registry, or the Attire & Rings pages. Worth surfacing in admin because
// a vendor filed under the wrong vertical shows up in the wrong catalogue.
export const VENDOR_VERTICALS = ['service', 'gift_shop', 'attire_rings'] as const

export type VendorVertical = (typeof VENDOR_VERTICALS)[number]

export const VERTICAL_LABELS: Record<VendorVertical, string> = {
  service: 'Wedding service',
  gift_shop: 'Gift shop',
  attire_rings: 'Attire & rings',
}

export function isVendorVertical(value: unknown): value is VendorVertical {
  return typeof value === 'string' && (VENDOR_VERTICALS as readonly string[]).includes(value)
}

export interface VendorAccount {
  id: string
  publicId: string
  businessName: string
  category: string
  vertical: VendorVertical
  city: string | null
  submittedByName: string | null
  contactEmail: string | null
  submittedAt: string | null
  createdAt: string
  updatedAt: string
  agreementStatus: AgreementStatus
  documentsVerified: number
  documentsTotal: number
  reviewerId: string | null
  status: VendorStatus
  logoUrl: string | null
}

export interface QueueHealth {
  inQueue: number
  avgReviewTimeDays: number
  slaAtRisk: number
}

export interface VerticalCounts {
  service: number
  gift_shop: number
  attire_rings: number
  all: number
}

export interface VendorStatusCounts {
  awaiting_review: number
  needs_corrections: number
  uploading_docs: number
  drafting: number
  active: number
  suspended: number
  all: number
}

// Mapping between the DB enum (`onboarding_status`) and the spec's
// `VendorStatus`. The DB names match more closely with the queue lifecycle;
// the spec names are reviewer-friendly.
export const DB_STATUS_TO_VENDOR_STATUS: Record<string, VendorStatus> = {
  application_in_progress: 'drafting',
  verification_pending: 'uploading_docs',
  admin_review: 'awaiting_review',
  needs_corrections: 'needs_corrections',
  active: 'active',
  suspended: 'suspended',
}

export const VENDOR_STATUS_TO_DB: Record<VendorStatus, string> = {
  drafting: 'application_in_progress',
  uploading_docs: 'verification_pending',
  awaiting_review: 'admin_review',
  needs_corrections: 'needs_corrections',
  active: 'active',
  suspended: 'suspended',
}
