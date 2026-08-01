'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import { requirePermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { randomBytes } from 'node:crypto'
import { isEmailConfigured, sendEmail } from '@/lib/email'
import {
  buildVendorStatusEmail,
  type VendorStatusEvent,
} from '@/lib/vendor-status-email'
import { buildDocumentRequestEmail } from '@/lib/document-request-email'
import { revalidateWebsite } from '@/lib/revalidate'

export type ActionResult =
  | { ok: true; warning?: string }
  | {
      ok: false
      error: string
      reason: 'unauth' | 'not-found' | 'invalid' | 'unknown'
    }

export type SignedUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

const SIGNED_URL_TTL_SECONDS = 60 * 10 // 10 minutes — long enough to read a PDF, short enough that links expire

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

/**
 * What the caller wants to look at, as a row reference rather than a storage
 * key.
 *
 * `agreement-signature` is the odd one out: signature images aren't recorded
 * in a column, they follow the path convention
 * `{vendor_id}/signature/{agreement_version}.png` (see the upload in
 * vendors_portal). We still confirm a matching vendor_agreements row exists
 * before rebuilding that path.
 */
export type VendorFileRef =
  | { kind: 'verification-document'; documentId: string }
  | { kind: 'document-request'; requestId: string }
  | { kind: 'agreement-signature'; agreementVersion: string }

/**
 * Generate a short-lived signed URL for an admin to preview a verification
 * document or signature image stored in the `vendor_verification` bucket.
 *
 * The bucket's RLS lets admins read everything via the service role, but the
 * client browser can't talk to that bucket directly — so we mint signed URLs
 * server-side and return them to the review UI for `<object>` / `<img>`
 * embeds. URLs expire in 10 minutes, after which the admin can click "view"
 * again to refresh.
 *
 * The caller passes a row reference, not a storage path: we re-read the row
 * scoped to `vendorId` and derive the key from it. Signing a caller-supplied
 * path would mean any vendor.read holder could pull an arbitrary object out
 * of the bucket, and would silently become a real IDOR the moment the bucket
 * holds anything narrower than "every doc a vendor reviewer may see".
 */
export async function generateVendorFileUrl(
  vendorId: string,
  ref: VendorFileRef
): Promise<SignedUrlResult> {
  const { userId } = await auth()
  if (!userId) return { ok: false, error: 'Sign in as an admin first.' }
  try {
    await requirePermission('vendor.read')
  } catch {
    return { ok: false, error: "You don't have permission for that." }
  }
  if (!isUuid(vendorId)) return { ok: false, error: 'File not found.' }

  const admin = createSupabaseAdminClient()
  let storagePath: string | null = null

  if (ref.kind === 'verification-document' || ref.kind === 'document-request') {
    const table =
      ref.kind === 'verification-document'
        ? 'vendor_verification_documents'
        : 'vendor_document_requests'
    const rowId =
      ref.kind === 'verification-document' ? ref.documentId : ref.requestId
    if (!isUuid(rowId)) return { ok: false, error: 'File not found.' }

    const { data } = await admin
      .from(table)
      .select('storage_path')
      .eq('id', rowId)
      .eq('vendor_id', vendorId)
      .maybeSingle<{ storage_path: string | null }>()
    storagePath = data?.storage_path ?? null
  } else {
    const { data } = await admin
      .from('vendor_agreements')
      .select('id')
      .eq('vendor_id', vendorId)
      .eq('agreement_version', ref.agreementVersion)
      .limit(1)
      .maybeSingle<{ id: string }>()
    // Version strings are ours, not the vendor's, but they land in a storage
    // key — keep anything path-ish out of it.
    if (data && /^[A-Za-z0-9._-]+$/.test(ref.agreementVersion)) {
      storagePath = `${vendorId}/signature/${ref.agreementVersion}.png`
    }
  }

  // One answer for "no such row", "belongs to another vendor" and "row has no
  // file", so the response can't be used to probe which ids exist.
  if (!storagePath) return { ok: false, error: 'File not found.' }

  const { data, error } = await admin.storage
    .from('vendor_verification')
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)

  if (error || !data) {
    // The previous message interpolated the storage path into a string handed
    // straight to the browser, which leaked the very thing this function now
    // refuses to accept as input. Logged server-side, generic to the caller.
    console.error('[admin] vendor signed URL failed', {
      vendorId,
      kind: ref.kind,
      reason: error?.message ?? 'unknown',
    })
    return { ok: false, error: 'Could not open that file.' }
  }
  return { ok: true, url: data.signedUrl }
}

/**
 * Resolve the Supabase users.id for the current admin Clerk session, used to
 * stamp `reviewed_by` on document review rows. Returns null if the admin
 * doesn't yet have a public.users row — review still proceeds, just without
 * a stamped reviewer for that row (audit trail logs a console warning).
 */
async function resolveAdminUserId(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  clerkUserId: string
): Promise<string | null> {
  const { data, error } = await admin
    .from('users')
    .select('id')
    .eq('clerk_id', clerkUserId)
    .maybeSingle<{ id: string }>()
  if (error) {
    console.warn(
      `[admin] users lookup failed for clerk_id=${clerkUserId}: ${error.message}`
    )
    return null
  }
  return data?.id ?? null
}

// =============================================================================
// Document review
// =============================================================================

/**
 * Mark a vendor verification document as approved. Stamps reviewed_by /
 * reviewed_at and revalidates the review pages. Does NOT change the vendor's
 * onboarding_status — the per-vendor "Approve & activate" action handles that
 * once the admin has reviewed everything.
 */
export async function approveDocument(
  documentId: string
): Promise<ActionResult> {
  const { userId } = await auth()
  try {
    await requirePermission('vendor.moderate')
  } catch {
    return { ok: false, reason: 'unauth', error: "You don't have permission for that." }
  }

  const admin = createSupabaseAdminClient()
  const reviewerId = userId ? await resolveAdminUserId(admin, userId) : null

  const { error } = await admin
    .from('vendor_verification_documents')
    .update({
      status: 'approved',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq('id', documentId)
    .eq('is_latest', true)

  if (error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[admin] approve document failed: ${error.code} ${error.message}`,
    }
  }

  revalidatePath('/operations/vendors')
  return { ok: true }
}

/**
 * Reject a verification document with a reason. The vendor sees the reason
 * on their /verify page and re-uploads. The vendor's `onboarding_status`
 * isn't flipped here — that's handled by `requestCorrections()` which is
 * the explicit "send this back to the vendor" action.
 */
export async function rejectDocument(
  documentId: string,
  reason: string
): Promise<ActionResult> {
  const { userId } = await auth()
  try {
    await requirePermission('vendor.moderate')
  } catch {
    return { ok: false, reason: 'unauth', error: "You don't have permission for that." }
  }
  if (!reason.trim()) {
    return {
      ok: false,
      reason: 'invalid',
      error: 'Rejection reason is required so the vendor knows what to fix.',
    }
  }

  const admin = createSupabaseAdminClient()
  const reviewerId = userId ? await resolveAdminUserId(admin, userId) : null

  const { error } = await admin
    .from('vendor_verification_documents')
    .update({
      status: 'rejected',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason.trim(),
    })
    .eq('id', documentId)
    .eq('is_latest', true)

  if (error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[admin] reject document failed: ${error.code} ${error.message}`,
    }
  }

  revalidatePath('/operations/vendors')
  return { ok: true }
}

// =============================================================================
// Vendor lifecycle
// =============================================================================

/**
 * Best-effort transactional email + audit log when a vendor's lifecycle status
 * flips. Looks up business name + recipient email (preferring contact_info
 * email, falling back to the linked auth user's email), renders a templated
 * Resend message, and fires it. Never throws — email failures must not roll
 * back the underlying status change. Logs `[email]` warnings on failure so
 * ops can investigate.
 */
async function notifyVendorOfStatusChange(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  vendorId: string,
  event: VendorStatusEvent,
  note?: string | null
): Promise<void> {
  if (!isEmailConfigured()) return

  const { data, error } = await admin
    .from('vendors')
    .select('business_name, contact_info, user_id, vendor_code')
    .eq('id', vendorId)
    .maybeSingle<{
      business_name: string | null
      contact_info: { email?: string | null } | null
      user_id: string | null
      vendor_code: string | null
    }>()
  if (error || !data) {
    console.warn(
      `[email] vendor lookup failed for ${event} notify (vendor=${vendorId}): ${error?.message ?? 'no row'}`
    )
    return
  }

  let recipient = data.contact_info?.email?.trim() || ''
  if (!recipient && data.user_id) {
    const userRow = await admin
      .from('users')
      .select('email')
      .eq('id', data.user_id)
      .maybeSingle<{ email: string | null }>()
    recipient = userRow.data?.email?.trim() || ''
  }
  if (!recipient) {
    console.warn(
      `[email] no recipient address for vendor=${vendorId} event=${event}; skipping notify`
    )
    return
  }

  // Live vendors portal. Override via NEXT_PUBLIC_VENDORS_PORTAL_URL (e.g.
  // http://localhost:3003 in local dev).
  const portalUrl =
    process.env.NEXT_PUBLIC_VENDORS_PORTAL_URL?.trim() ||
    'https://vendorsportal.opusfesta.com'
  const message = buildVendorStatusEmail({
    event,
    businessName: data.business_name?.trim() || 'OpusFesta vendor',
    recipientEmail: recipient,
    note: note ?? null,
    portalUrl,
    vendorCode: data.vendor_code,
  })

  // CC the admin team so every status decision is visible across the
  // review group, not only to the admin who clicked the button.
  const adminCc = await resolveAdminBccRecipients(admin, recipient)

  const result = await sendEmail({
    to: recipient,
    subject: message.subject,
    html: message.html,
    text: message.text,
    bcc: adminCc.length > 0 ? adminCc : undefined,
  })
  if (!result.sent) {
    console.warn(
      `[email] vendor status notify failed (vendor=${vendorId} event=${event}): ${result.reason}${result.error ? ` — ${result.error}` : ''}`
    )
  }
}

// Resolve the admin team for BCC. Mirrors apps/vendors_portal/src/lib/email/
// admin-recipients.ts so both halves of the vendor lifecycle (submit and
// status decisions) target the same audience: env override first, then active
// admin_whitelist rows with owner|admin roles. Excludes the vendor recipient
// defensively in case any whitelist email collides with their contact address.
async function resolveAdminBccRecipients(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  excludeEmail: string
): Promise<string[]> {
  const exclude = excludeEmail.trim().toLowerCase()
  const dedupe = (emails: string[]): string[] =>
    Array.from(new Set(emails.filter((email) => email && email !== exclude)))

  const envRaw =
    process.env.VENDOR_NOTIFY_ADMIN_EMAIL || process.env.ADMIN_NOTIFY_EMAIL
  if (envRaw) {
    const envRecipients = envRaw
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.includes('@'))
    if (envRecipients.length > 0) return dedupe(envRecipients)
  }

  const { data, error } = await admin
    .from('workforce_employees')
    .select('email, workforce_roles!dashboard_role_id(slug)')
    .eq('dashboard_access', true)

  if (error) {
    console.warn(`[email] admin BCC lookup failed: ${error.message}`)
    return []
  }
  if (!data) return []
  const emails = data
    .filter((row) => {
      const slug = (row.workforce_roles as { slug?: string } | null)?.slug
      return slug === 'owner' || slug === 'admin'
    })
    .map((row) => (row.email as string)?.trim().toLowerCase())
    .filter((email): email is string => Boolean(email && email.includes('@')))
  return dedupe(emails)
}

/**
 * Approve the vendor: flip `onboarding_status` to `active` so they can take
 * bookings on the marketplace. Caller is expected to have approved the
 * individual documents already; we don't enforce that here so admins can
 * approve a vendor whose docs are still in `pending_review` if they're
 * confident the docs are fine and want to skip the per-doc clicks.
 */
export async function approveVendor(vendorId: string): Promise<ActionResult> {
  try {
    await requirePermission('vendor.moderate')
  } catch {
    return { ok: false, reason: 'unauth', error: "You don't have permission for that." }
  }

  const admin = createSupabaseAdminClient()
  const { error } = await admin
    .from('vendors')
    .update({
      onboarding_status: 'active',
      onboarding_completed_at: new Date().toISOString(),
      verified: true,
    })
    .eq('id', vendorId)
    .in('onboarding_status', ['admin_review', 'needs_corrections', 'suspended'])

  if (error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[admin] approve vendor failed: ${error.code} ${error.message}`,
    }
  }

  await notifyVendorOfStatusChange(admin, vendorId, 'approved')

  revalidatePath('/operations/vendors')
  revalidatePath(`/operations/vendors/${vendorId}`)
  return { ok: true }
}

/**
 * Bounce the vendor back to fix flagged items. The admin should reject the
 * specific documents *before* calling this so the vendor sees per-document
 * notes on /verify. This action just flips the high-level status to
 * `needs_corrections` so /pending shows the "Action required" banner and
 * the verify-page auto-transition gate stops promoting them to admin_review
 * until they re-submit. The optional `note` is included verbatim in the
 * notification email so the vendor knows what high-level area to address
 * (per-document notes are still surfaced separately on /verify).
 */
export async function requestCorrections(
  vendorId: string,
  note?: string
): Promise<ActionResult> {
  try {
    await requirePermission('vendor.moderate')
  } catch {
    return { ok: false, reason: 'unauth', error: "You don't have permission for that." }
  }

  const admin = createSupabaseAdminClient()
  const { error } = await admin
    .from('vendors')
    .update({
      onboarding_status: 'needs_corrections',
    })
    .eq('id', vendorId)
    .in('onboarding_status', ['admin_review', 'verification_pending'])

  if (error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[admin] request corrections failed: ${error.code} ${error.message}`,
    }
  }

  await notifyVendorOfStatusChange(
    admin,
    vendorId,
    'corrections_requested',
    note
  )

  revalidatePath('/operations/vendors')
  revalidatePath(`/operations/vendors/${vendorId}`)
  return { ok: true }
}

/**
 * Suspend an active or under-review vendor. Optional reason is stored on
 * the vendors row for the audit trail (admin sees it on subsequent reviews;
 * vendor sees a generic "your account is suspended" message until appeals
 * is wired up).
 */
export async function suspendVendor(
  vendorId: string,
  reason?: string
): Promise<ActionResult> {
  try {
    await requirePermission('vendor.moderate')
  } catch {
    return { ok: false, reason: 'unauth', error: "You don't have permission for that." }
  }

  const admin = createSupabaseAdminClient()
  const { error } = await admin
    .from('vendors')
    .update({
      onboarding_status: 'suspended',
      suspended_at: new Date().toISOString(),
      suspension_reason: reason?.trim() || null,
    })
    .eq('id', vendorId)

  if (error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[admin] suspend vendor failed: ${error.code} ${error.message}`,
    }
  }

  await notifyVendorOfStatusChange(admin, vendorId, 'suspended', reason)

  revalidatePath('/operations/vendors')
  revalidatePath(`/operations/vendors/${vendorId}`)
  return { ok: true }
}

// =============================================================================
// Payout method editing — admin review owns verification status
// =============================================================================

export type VendorPayoutStatus = 'pending' | 'verified' | 'failed'
export type VendorPayoutMethodType =
  | 'mpesa'
  | 'airtel'
  | 'tigo'
  | 'lipa_namba'
  | 'bank'
  | 'stripe_connect'

export type VendorPayoutPatch = {
  methodType: VendorPayoutMethodType
  provider: string | null
  accountNumber: string
  accountHolderName: string
  status: VendorPayoutStatus
  // Only meaningful on insert: make this new method the primary (is_default).
  // Promoting an existing method to primary goes through setPrimaryPayoutMethod.
  makeDefault?: boolean
}

const VALID_PAYOUT_METHODS: VendorPayoutMethodType[] = [
  'mpesa',
  'airtel',
  'tigo',
  'lipa_namba',
  'bank',
  'stripe_connect',
]
const VALID_PAYOUT_STATUSES: VendorPayoutStatus[] = [
  'pending',
  'verified',
  'failed',
]

export async function saveVendorPayoutMethod(
  vendorId: string,
  payoutId: string | null,
  fields: VendorPayoutPatch
): Promise<ActionResult> {
  const { userId } = await auth()
  try {
    await requirePermission('vendor.moderate')
  } catch {
    return { ok: false, reason: 'unauth', error: "You don't have permission for that." }
  }

  if (!VALID_PAYOUT_METHODS.includes(fields.methodType)) {
    return { ok: false, reason: 'invalid', error: 'Unknown payout method.' }
  }
  if (!VALID_PAYOUT_STATUSES.includes(fields.status)) {
    return { ok: false, reason: 'invalid', error: 'Unknown payout status.' }
  }
  if (!fields.accountNumber.trim()) {
    return {
      ok: false,
      reason: 'invalid',
      error: 'Account number is required.',
    }
  }
  if (!fields.accountHolderName.trim()) {
    return { ok: false, reason: 'invalid', error: 'Account name is required.' }
  }

  const admin = createSupabaseAdminClient()
  const reviewerId =
    fields.status === 'verified' && userId
      ? await resolveAdminUserId(admin, userId)
      : null
  const now = new Date().toISOString()
  const payload = {
    method_type: fields.methodType,
    provider: fields.provider?.trim() || null,
    account_number: fields.accountNumber.trim(),
    account_holder_name: fields.accountHolderName.trim(),
    status: fields.status,
    verified_by: reviewerId,
    verified_at: fields.status === 'verified' ? now : null,
    failure_reason: null,
  }

  if (payoutId) {
    // Edit in place. We never touch is_default here — primary changes go
    // through setPrimaryPayoutMethod so the partial unique index is respected.
    const { error } = await admin
      .from('vendor_payout_methods')
      .update(payload)
      .eq('id', payoutId)
      .eq('vendor_id', vendorId)
    if (error) {
      return {
        ok: false,
        reason: 'unknown',
        error: `[admin] payout save failed: ${error.code} ${error.message}`,
      }
    }
  } else {
    // Insert a new method. It becomes the default when the caller asks, or
    // automatically when the vendor has no default yet (so there's always
    // exactly one primary). Clear any existing default first to satisfy the
    // partial unique index (only one is_default=true allowed at a time).
    const existingDefault = await admin
      .from('vendor_payout_methods')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_id', vendorId)
      .eq('is_default', true)
    if (existingDefault.error) {
      return {
        ok: false,
        reason: 'unknown',
        error: `[admin] payout default check failed: ${existingDefault.error.code} ${existingDefault.error.message}`,
      }
    }
    const makeDefault = fields.makeDefault === true || (existingDefault.count ?? 0) === 0
    if (makeDefault && (existingDefault.count ?? 0) > 0) {
      const clear = await admin
        .from('vendor_payout_methods')
        .update({ is_default: false })
        .eq('vendor_id', vendorId)
        .eq('is_default', true)
      if (clear.error) {
        return {
          ok: false,
          reason: 'unknown',
          error: `[admin] payout default clear failed: ${clear.error.code} ${clear.error.message}`,
        }
      }
    }
    const { error } = await admin.from('vendor_payout_methods').insert({
      vendor_id: vendorId,
      is_default: makeDefault,
      ...payload,
    })
    if (error) {
      return {
        ok: false,
        reason: 'unknown',
        error: `[admin] payout save failed: ${error.code} ${error.message}`,
      }
    }
  }

  revalidatePath('/operations/vendors')
  revalidatePath(`/operations/vendors/${vendorId}`)
  return { ok: true }
}

/**
 * Promote one payout method to primary (is_default). Clears the current
 * default first, then sets the chosen one — two steps because the partial
 * unique index (`WHERE is_default`) allows only one default row at a time.
 */
export async function setPrimaryPayoutMethod(
  vendorId: string,
  payoutId: string
): Promise<ActionResult> {
  try {
    await requirePermission('vendor.moderate')
  } catch {
    return { ok: false, reason: 'unauth', error: "You don't have permission for that." }
  }
  if (!payoutId) {
    return { ok: false, reason: 'invalid', error: 'Missing payout method.' }
  }

  const admin = createSupabaseAdminClient()
  const clear = await admin
    .from('vendor_payout_methods')
    .update({ is_default: false })
    .eq('vendor_id', vendorId)
    .eq('is_default', true)
  if (clear.error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[admin] payout primary clear failed: ${clear.error.code} ${clear.error.message}`,
    }
  }
  const set = await admin
    .from('vendor_payout_methods')
    .update({ is_default: true })
    .eq('id', payoutId)
    .eq('vendor_id', vendorId)
  if (set.error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[admin] payout primary set failed: ${set.error.code} ${set.error.message}`,
    }
  }

  revalidatePath('/operations/vendors')
  revalidatePath(`/operations/vendors/${vendorId}`)
  return { ok: true }
}

export async function deleteVendorPayoutMethod(
  vendorId: string,
  payoutId: string
): Promise<ActionResult> {
  try {
    await requirePermission('vendor.moderate')
  } catch {
    return { ok: false, reason: 'unauth', error: "You don't have permission for that." }
  }
  if (!payoutId) {
    return { ok: false, reason: 'invalid', error: 'Missing payout method.' }
  }

  const admin = createSupabaseAdminClient()
  const { error } = await admin
    .from('vendor_payout_methods')
    .delete()
    .eq('id', payoutId)
    .eq('vendor_id', vendorId)

  if (error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[admin] payout delete failed: ${error.code} ${error.message}`,
    }
  }

  revalidatePath('/operations/vendors')
  revalidatePath(`/operations/vendors/${vendorId}`)
  return { ok: true }
}

// =============================================================================
// Per-section approval (storefront)
// =============================================================================

export type StorefrontSection =
  | 'profile'
  | 'photos'
  | 'services'
  | 'packages'
  | 'recognition'
  | 'team'
  | 'faq'

export type SectionStatus = 'pending' | 'approved' | 'rejected'

const VALID_SECTIONS: StorefrontSection[] = [
  'profile',
  'photos',
  'services',
  'packages',
  'recognition',
  'team',
  'faq',
]
const VALID_SECTION_STATUSES: SectionStatus[] = [
  'pending',
  'approved',
  'rejected',
]

/**
 * Set the moderation status of one storefront section. Stored as a JSONB
 * map on `vendors.section_status` (e.g. `{"profile":"approved","faq":"pending"}`).
 *
 * Approving the vendor as a whole (`approveVendor` above) does not auto-set
 * every section to approved — admin can still bounce one section back via
 * this action even after the vendor is live, useful for content moderation.
 */
export async function setSectionStatus(
  vendorId: string,
  section: StorefrontSection,
  status: SectionStatus
): Promise<ActionResult> {
  const { userId } = await auth()
  if (!userId) return { ok: false, reason: 'unauth', error: 'Sign in first.' }
  try { await requirePermission('vendor.moderate') } catch { return { ok: false, reason: 'unauth', error: "You don't have permission for that." } }
  if (!VALID_SECTIONS.includes(section)) {
    return { ok: false, reason: 'invalid', error: 'Unknown section.' }
  }
  if (!VALID_SECTION_STATUSES.includes(status)) {
    return { ok: false, reason: 'invalid', error: 'Unknown status.' }
  }

  const admin = createSupabaseAdminClient()
  // Read-modify-write the JSONB map. Cheap (one row, small payload) and
  // avoids needing a Postgres helper function for object-key set-merge.
  const current = await admin
    .from('vendors')
    .select('section_status')
    .eq('id', vendorId)
    .maybeSingle<{ section_status: Record<string, string> | null }>()
  if (current.error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[admin] section_status read failed: ${current.error.code} ${current.error.message}`,
    }
  }
  const next = { ...(current.data?.section_status ?? {}), [section]: status }

  const { error } = await admin
    .from('vendors')
    .update({ section_status: next })
    .eq('id', vendorId)
  if (error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[admin] section_status write failed: ${error.code} ${error.message}`,
    }
  }
  revalidatePath(`/operations/vendors/${vendorId}`)
  return { ok: true }
}

// =============================================================================
// Storefront section CRUD (admin can edit anything the vendor can edit)
// =============================================================================

export type StorefrontTeamMember = {
  id?: string
  name: string
  role: string
  bio?: string
  avatar?: string
}

export type StorefrontFaq = {
  id?: string
  question: string
  answer: string
}

export type StorefrontPackage = {
  id?: string
  name: string
  price: string
  description?: string
  includes?: string[]
}

export type StorefrontPatch = {
  // Profile
  businessName?: string
  bio?: string
  yearsInBusiness?: number | null
  // Tanzania administrative address.
  houseNumber?: string
  street?: string
  ward?: string
  district?: string
  region?: string
  landmark?: string
  postalCode?: string
  homeMarket?: string | null
  serviceMarkets?: string[]
  phone?: string
  email?: string
  whatsapp?: string
  socialWebsite?: string
  socialInstagram?: string
  socialFacebook?: string
  socialTiktok?: string
  socialWhatsapp?: string
  hours?: Record<string, { open: boolean; from: string; to: string }> | null
  style?: string | null
  personality?: string | null
  languages?: string[]
  responseTimeHours?: string | null
  locallyOwned?: boolean | null
  parallelBookingCapacity?: number | null
  depositPercent?: string | null
  cancellationLevel?: string | null
  reschedulePolicy?: string | null
  // Photos
  coverImage?: string | null
  galleryUrls?: string[]
  // Videos — uploaded MP4/MOV/WebM URLs or YouTube/Vimeo embed links
  videoUrls?: string[]
  // Services
  services?: string[]
  // Packages
  packages?: StorefrontPackage[]
  // Recognition
  awards?: string | null
  awardCertificates?: Array<Record<string, unknown>>
  // Team
  team?: StorefrontTeamMember[]
  // FAQ
  faqs?: StorefrontFaq[]
  // Map coords (admin-fillable until onboarding gains the step)
  lat?: number | null
  lng?: number | null
  // Capacity (admin-fillable until onboarding gains the step)
  capacityMin?: number | null
  capacityMax?: number | null
  // Pricing extras + availability (migration 20260624000001)
  startingPrice?: string | null
  customQuotes?: boolean | null
  availability?: Array<Record<string, unknown>>
}

/**
 * Admin update for any subset of storefront fields. Each field is mapped to
 * its DB column so the website mapper picks it up immediately. JSONB
 * sub-fields (location/contact_info/social_links) are merged with the
 * current value so partial patches don't wipe sibling keys.
 */
export async function updateStorefrontSection(
  vendorId: string,
  patch: StorefrontPatch
): Promise<ActionResult> {
  const { userId } = await auth()
  if (!userId) return { ok: false, reason: 'unauth', error: 'Sign in first.' }
  try { await requirePermission('vendor.moderate') } catch { return { ok: false, reason: 'unauth', error: "You don't have permission for that." } }

  const admin = createSupabaseAdminClient()

  const current = await admin
    .from('vendors')
    .select('location, contact_info, social_links')
    .eq('id', vendorId)
    .maybeSingle<{
      location: Record<string, unknown> | null
      contact_info: Record<string, unknown> | null
      social_links: Record<string, unknown> | null
    }>()
  if (current.error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[admin] storefront read failed: ${current.error.code} ${current.error.message}`,
    }
  }

  const update: Record<string, unknown> = {}

  if (patch.businessName !== undefined)
    update.business_name = patch.businessName.trim()
  if (patch.bio !== undefined) update.bio = patch.bio
  if (patch.yearsInBusiness !== undefined)
    update.years_in_business = patch.yearsInBusiness

  // location merge
  if (
    patch.houseNumber !== undefined ||
    patch.street !== undefined ||
    patch.ward !== undefined ||
    patch.district !== undefined ||
    patch.region !== undefined ||
    patch.landmark !== undefined ||
    patch.postalCode !== undefined ||
    patch.homeMarket !== undefined ||
    patch.serviceMarkets !== undefined
  ) {
    const base = (current.data?.location as Record<string, unknown>) ?? {}
    update.location = {
      ...base,
      ...(patch.houseNumber !== undefined && { houseNumber: patch.houseNumber.trim() }),
      ...(patch.street !== undefined && { street: patch.street.trim() }),
      ...(patch.ward !== undefined && { ward: patch.ward.trim() }),
      ...(patch.district !== undefined && {
        district: patch.district.trim(),
        // Mirror `city` to District for public-marketplace compatibility, but
        // never blank an existing locality when District is cleared.
        ...(patch.district.trim() ? { city: patch.district.trim() } : {}),
      }),
      ...(patch.region !== undefined && { region: patch.region.trim() }),
      ...(patch.landmark !== undefined && { landmark: patch.landmark.trim() }),
      ...(patch.postalCode !== undefined && {
        postalCode: patch.postalCode.trim(),
      }),
      ...(patch.homeMarket !== undefined && { homeMarket: patch.homeMarket }),
      ...(patch.serviceMarkets !== undefined && {
        serviceMarkets: patch.serviceMarkets,
      }),
    }
    if (patch.homeMarket !== undefined) update.home_market = patch.homeMarket
    if (patch.serviceMarkets !== undefined)
      update.service_markets = patch.serviceMarkets
  }

  // contact merge
  if (
    patch.phone !== undefined ||
    patch.email !== undefined ||
    patch.whatsapp !== undefined
  ) {
    const base = (current.data?.contact_info as Record<string, unknown>) ?? {}
    update.contact_info = {
      ...base,
      ...(patch.phone !== undefined && { phone: patch.phone.trim() }),
      ...(patch.email !== undefined && { email: patch.email.trim() }),
      ...(patch.whatsapp !== undefined && { whatsapp: patch.whatsapp.trim() }),
    }
  }

  // socials merge
  if (
    patch.socialWebsite !== undefined ||
    patch.socialInstagram !== undefined ||
    patch.socialFacebook !== undefined ||
    patch.socialTiktok !== undefined ||
    patch.socialWhatsapp !== undefined
  ) {
    const base = (current.data?.social_links as Record<string, unknown>) ?? {}
    update.social_links = {
      ...base,
      ...(patch.socialWebsite !== undefined && {
        website: patch.socialWebsite.trim(),
      }),
      ...(patch.socialInstagram !== undefined && {
        instagram: patch.socialInstagram.trim(),
      }),
      ...(patch.socialFacebook !== undefined && {
        facebook: patch.socialFacebook.trim(),
      }),
      ...(patch.socialTiktok !== undefined && {
        tiktok: patch.socialTiktok.trim(),
      }),
      ...(patch.socialWhatsapp !== undefined && {
        whatsapp: patch.socialWhatsapp.trim(),
      }),
    }
  }

  if (patch.hours !== undefined) update.hours = patch.hours
  if (patch.style !== undefined) update.style = patch.style
  if (patch.personality !== undefined) update.personality = patch.personality
  if (patch.languages !== undefined) update.languages = patch.languages
  if (patch.responseTimeHours !== undefined)
    update.response_time_hours = patch.responseTimeHours
  if (patch.locallyOwned !== undefined)
    update.locally_owned = patch.locallyOwned
  if (patch.parallelBookingCapacity !== undefined)
    update.parallel_booking_capacity = patch.parallelBookingCapacity
  if (patch.depositPercent !== undefined)
    update.deposit_percent = patch.depositPercent
  if (patch.cancellationLevel !== undefined)
    update.cancellation_level = patch.cancellationLevel
  if (patch.reschedulePolicy !== undefined)
    update.reschedule_policy = patch.reschedulePolicy

  if (patch.coverImage !== undefined) update.cover_image = patch.coverImage
  if (patch.galleryUrls !== undefined) {
    const cleaned = patch.galleryUrls
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\//i.test(u))
    update.gallery_urls = cleaned.length > 0 ? cleaned : null
  }
  if (patch.videoUrls !== undefined) {
    const cleaned = patch.videoUrls
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\//i.test(u))
    update.video_urls = cleaned.length > 0 ? cleaned : null
  }

  if (patch.services !== undefined) update.services_offered = patch.services
  if (patch.packages !== undefined) update.packages = patch.packages

  if (patch.awards !== undefined) update.awards = patch.awards
  if (patch.awardCertificates !== undefined)
    update.award_certificates = patch.awardCertificates

  if (patch.team !== undefined) update.team = patch.team
  if (patch.faqs !== undefined) update.faqs = patch.faqs

  if (patch.startingPrice !== undefined)
    update.starting_price = patch.startingPrice
  if (patch.customQuotes !== undefined) update.custom_quotes = patch.customQuotes
  if (patch.availability !== undefined) update.availability = patch.availability

  if (patch.lat !== undefined) update.lat = patch.lat
  if (patch.lng !== undefined) update.lng = patch.lng
  if (patch.capacityMin !== undefined || patch.capacityMax !== undefined) {
    if (patch.capacityMin == null && patch.capacityMax == null) {
      update.capacity = null
    } else {
      update.capacity = {
        min: patch.capacityMin ?? 0,
        max: patch.capacityMax ?? patch.capacityMin ?? 0,
      }
    }
  }

  if (Object.keys(update).length === 0) {
    return { ok: false, reason: 'invalid', error: 'No fields to update.' }
  }

  // Try the full update first, then retry without `video_urls` if the
  // column hasn't been migrated yet (same pattern as the existing
  // packages / application_snapshot guards) so admin saves don't break in
  // environments that are behind on migrations.
  let { error } = await admin.from('vendors').update(update).eq('id', vendorId)
  if (
    error &&
    'video_urls' in update &&
    (error.code === '42703' || error.code === 'PGRST204')
  ) {
    const { video_urls: _omit, ...rest } = update
    void _omit
    const retry = await admin.from('vendors').update(rest).eq('id', vendorId)
    error = retry.error
    if (!error) {
      console.warn(
        '[admin] video_urls column missing — videos were not persisted. Apply migration 20260512000010.',
      )
    }
  }
  if (error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[admin] storefront update failed: ${error.code} ${error.message}`,
    }
  }

  // Mirror the patch into application_snapshot so admin review (which reads
  // snapshot) and structured-column readers stay in sync. Same merge pattern
  // as publishStorefront in vendors_portal — only patch keys that actually
  // changed; preserve everything else.
  await mirrorPatchToSnapshot(admin, vendorId, patch)

  revalidatePath('/operations/vendors')
  revalidatePath(`/operations/vendors/${vendorId}`)
  return { ok: true }
}

/**
 * Best-effort merge of admin's patch into `vendors.application_snapshot`.
 * We read-modify-write because Supabase JS doesn't expose JSONB `||`. This
 * keeps the admin operations card view consistent with the structured
 * columns the website mapper reads. Failure here is logged but doesn't fail
 * the parent action — the structured-column update has already succeeded
 * and is what the public page actually renders.
 */
async function mirrorPatchToSnapshot(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  vendorId: string,
  patch: StorefrontPatch
): Promise<void> {
  const snapPatch: Record<string, unknown> = {}
  if (patch.businessName !== undefined)
    snapPatch.businessName = patch.businessName
  if (patch.bio !== undefined) snapPatch.bio = patch.bio
  if (patch.yearsInBusiness !== undefined) {
    snapPatch.yearsInBusiness =
      typeof patch.yearsInBusiness === 'number'
        ? String(patch.yearsInBusiness)
        : patch.yearsInBusiness
  }
  if (patch.houseNumber !== undefined) snapPatch.houseNumber = patch.houseNumber
  if (patch.street !== undefined) snapPatch.street = patch.street
  if (patch.ward !== undefined) snapPatch.ward = patch.ward
  if (patch.district !== undefined) {
    snapPatch.district = patch.district
    // Mirror `city` to District for public-marketplace compatibility, but never
    // blank an existing locality when District is cleared.
    if (patch.district.trim()) snapPatch.city = patch.district
  }
  if (patch.region !== undefined) snapPatch.region = patch.region
  if (patch.landmark !== undefined) snapPatch.landmark = patch.landmark
  if (patch.postalCode !== undefined) snapPatch.postalCode = patch.postalCode
  if (patch.homeMarket !== undefined) snapPatch.homeMarket = patch.homeMarket
  if (patch.serviceMarkets !== undefined)
    snapPatch.serviceMarkets = patch.serviceMarkets
  if (patch.phone !== undefined) snapPatch.phone = patch.phone
  if (patch.email !== undefined) snapPatch.email = patch.email
  if (patch.whatsapp !== undefined) snapPatch.whatsapp = patch.whatsapp
  if (
    patch.socialWebsite !== undefined ||
    patch.socialInstagram !== undefined ||
    patch.socialFacebook !== undefined ||
    patch.socialTiktok !== undefined ||
    patch.socialWhatsapp !== undefined
  ) {
    snapPatch.socials = {
      ...(patch.socialWebsite !== undefined && {
        website: patch.socialWebsite,
      }),
      ...(patch.socialInstagram !== undefined && {
        instagram: patch.socialInstagram,
      }),
      ...(patch.socialFacebook !== undefined && {
        facebook: patch.socialFacebook,
      }),
      ...(patch.socialTiktok !== undefined && { tiktok: patch.socialTiktok }),
      ...(patch.socialWhatsapp !== undefined && {
        whatsapp: patch.socialWhatsapp,
      }),
    }
  }
  if (patch.hours !== undefined) snapPatch.hours = patch.hours
  if (patch.style !== undefined) snapPatch.style = patch.style
  if (patch.personality !== undefined) snapPatch.personality = patch.personality
  if (patch.languages !== undefined) snapPatch.languages = patch.languages
  if (patch.responseTimeHours !== undefined)
    snapPatch.responseTimeHours = patch.responseTimeHours
  if (patch.locallyOwned !== undefined)
    snapPatch.locallyOwned = patch.locallyOwned
  if (patch.parallelBookingCapacity !== undefined)
    snapPatch.parallelBookingCapacity = patch.parallelBookingCapacity
  if (patch.depositPercent !== undefined)
    snapPatch.depositPercent = patch.depositPercent
  if (patch.cancellationLevel !== undefined)
    snapPatch.cancellationLevel = patch.cancellationLevel
  if (patch.reschedulePolicy !== undefined)
    snapPatch.reschedulePolicy = patch.reschedulePolicy
  if (patch.services !== undefined) snapPatch.specialServices = patch.services
  if (patch.packages !== undefined) snapPatch.packages = patch.packages
  if (patch.awards !== undefined) snapPatch.awards = patch.awards
  if (patch.awardCertificates !== undefined)
    snapPatch.awardCertificates = patch.awardCertificates
  if (patch.team !== undefined) snapPatch.team = patch.team
  if (patch.faqs !== undefined) snapPatch.faqs = patch.faqs

  if (Object.keys(snapPatch).length === 0) return

  const read = await admin
    .from('vendors')
    .select('application_snapshot')
    .eq('id', vendorId)
    .maybeSingle<{ application_snapshot: Record<string, unknown> | null }>()
  if (read.error) {
    console.warn(
      `[admin] snapshot read failed (skipping mirror): ${read.error.code} ${read.error.message}`
    )
    return
  }
  const merged = {
    ...(read.data?.application_snapshot ?? {}),
    ...snapPatch,
  }
  const write = await admin
    .from('vendors')
    .update({ application_snapshot: merged })
    .eq('id', vendorId)
  if (write.error) {
    console.warn(
      `[admin] snapshot mirror write failed: ${write.error.code} ${write.error.message}`
    )
  }
}

/**
 * Reactivate a suspended vendor. Symmetric to suspendVendor; clears the
 * suspended_at + suspension_reason fields.
 */
// =============================================================================
// Admin-created vendor accounts
// =============================================================================
//
// Admin can spin up a vendor record directly — useful for vendors who
// can't (or won't) navigate the self-serve onboarding flow, or for
// seeding curated featured vendors before they sign up. The flow:
//
//   1. Upsert a `public.users` row keyed on email (placeholder password
//      since Clerk owns auth). If the email is already a user we reuse
//      the existing row — no orphans.
//   2. Insert the `vendors` row pointing at that user with a unique slug
//      derived from the business name. Status starts at
//      `application_in_progress` so admin can fill in the rest via the
//      existing review-page editors.
//   3. Insert an owner-role `vendor_memberships` row so the vendor can
//      eventually claim the account when they sign in with the matching
//      email.
//
// The created vendor row is intentionally minimal — admin fills the rest
// (address, phone, packages, photos, etc.) using the per-section
// editors on the review page.

const VALID_VENDOR_CATEGORIES = [
  'Venues',
  'Photographers',
  'Videographers',
  'Caterers',
  'Wedding Planners',
  'Florists',
  'DJs & Music',
  'Beauty & Makeup',
  'Bridal Salons',
  'Cake & Desserts',
  'Decorators',
  'Officiants',
  'Rentals',
  'Transportation',
] as const

export type VendorCategory = (typeof VALID_VENDOR_CATEGORIES)[number]

/**
 * Resolve a category's vertical from `vendor_categories`, the source of truth.
 *
 * `vendors.category` is an FK onto `vendor_categories(db_value)` (migration
 * 20260611000002), so that column — not `label` or `slug` — is the join key.
 * Anything unmatched falls back to 'service', which is the column default and
 * the safest guess: a service vendor shows up in the directory the admin was
 * already looking at, rather than silently appearing in a shop catalogue.
 */
async function verticalForCategory(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  category: string,
): Promise<string> {
  const { data, error } = await admin
    .from('vendor_categories')
    .select('vertical')
    .eq('db_value', category)
    .maybeSingle<{ vertical: string | null }>()
  if (error) {
    console.error('[admin] vertical lookup failed', error.code, error.message)
    return 'service'
  }
  return data?.vertical ?? 'service'
}

function slugifyForVendor(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export type CreateVendorInput = {
  businessName: string
  category: string
  contactEmail: string
  city?: string
  phone?: string
  bio?: string
}

export type CreateVendorResult =
  | { ok: true; vendorId: string }
  | {
      ok: false
      error: string
      reason: 'unauth' | 'invalid' | 'duplicate' | 'unknown'
    }

export async function createVendorAccount(
  input: CreateVendorInput,
): Promise<CreateVendorResult> {
  const { userId } = await auth()
  if (!userId) return { ok: false, reason: 'unauth', error: 'Sign in first.' }
  try { await requirePermission('vendor.moderate') } catch { return { ok: false, reason: 'unauth', error: "You don't have permission for that." } }

  const businessName = input.businessName?.trim()
  const email = input.contactEmail?.trim().toLowerCase()
  const category = input.category as VendorCategory
  if (!businessName) {
    return { ok: false, reason: 'invalid', error: 'Business name is required.' }
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return {
      ok: false,
      reason: 'invalid',
      error: 'A valid contact email is required.',
    }
  }
  if (!VALID_VENDOR_CATEGORIES.includes(category)) {
    return { ok: false, reason: 'invalid', error: 'Pick a vendor category.' }
  }

  const admin = createSupabaseAdminClient()

  // 1) Upsert the user keyed on email. The legacy `password` column is
  // NOT NULL but unused under Clerk — store an opaque marker. clerk_id
  // is left null and gets linked when the vendor signs in via the
  // matching email.
  const userUpsert = await admin
    .from('users')
    .upsert(
      {
        email,
        name: businessName,
        password: 'admin-created-placeholder',
        role: 'vendor',
      },
      { onConflict: 'email' },
    )
    .select('id')
    .single<{ id: string }>()
  if (userUpsert.error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[admin] users upsert failed: ${userUpsert.error.code} ${userUpsert.error.message}`,
    }
  }
  const supabaseUserId = userUpsert.data.id

  // 2) Resolve a unique slug — append a short random suffix on collision.
  const baseSlug = slugifyForVendor(businessName) || 'vendor'
  let slug = baseSlug
  const slugCheck = await admin
    .from('vendors')
    .select('id', { count: 'exact', head: true })
    .eq('slug', baseSlug)
  if (slugCheck.error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[admin] slug check failed: ${slugCheck.error.code} ${slugCheck.error.message}`,
    }
  }
  if ((slugCheck.count ?? 0) > 0) {
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`
  }

  // Guard against a duplicate vendor row for the same user — if admin
  // already created one for this contact email, surface a clear error
  // rather than letting the insert blow up on a unique constraint.
  const existing = await admin
    .from('vendors')
    .select('id, business_name')
    .eq('user_id', supabaseUserId)
    .limit(1)
    .maybeSingle<{ id: string; business_name: string }>()
  if (existing.data) {
    return {
      ok: false,
      reason: 'duplicate',
      error: `A vendor already exists for ${email}: ${existing.data.business_name}.`,
    }
  }

  // The vertical decides which public catalogue this vendor is published to,
  // so it's derived from the chosen category rather than defaulted. Today every
  // entry in VALID_VENDOR_CATEGORIES is a wedding service, but the moment a
  // product category is added to that list an admin-created shop would
  // otherwise be born as a service vendor and leak into the vendor directory.
  const vertical = await verticalForCategory(admin, category)

  const corePayload: Record<string, unknown> = {
    slug,
    user_id: supabaseUserId,
    business_name: businessName,
    category,
    vertical,
    bio: input.bio?.trim() || null,
    location: input.city?.trim() ? { city: input.city.trim() } : {},
    contact_info: {
      email,
      ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
    },
    onboarding_status: 'application_in_progress' as const,
    onboarding_started_at: new Date().toISOString(),
  }

  const insert = await admin
    .from('vendors')
    .insert(corePayload)
    .select('id')
    .single<{ id: string }>()
  if (insert.error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[admin] vendor insert failed: ${insert.error.code} ${insert.error.message}`,
    }
  }
  const vendorId = insert.data.id

  // 3) Owner membership so the vendor can claim the account on sign-in.
  // ON CONFLICT (vendor_id, user_id) — same pattern as the portal submit
  // flow, see vendors_portal/src/lib/onboarding/submit.ts.
  const membership = await admin.from('vendor_memberships').upsert(
    {
      vendor_id: vendorId,
      user_id: supabaseUserId,
      role: 'owner' as const,
      status: 'active' as const,
    },
    { onConflict: 'vendor_id,user_id' },
  )
  if (membership.error) {
    console.warn(
      `[admin] vendor_memberships upsert failed for vendor=${vendorId}: ${membership.error.code} ${membership.error.message} — vendor row exists but owner membership wasn't created`,
    )
  }

  revalidatePath('/operations/vendors')
  return { ok: true, vendorId }
}

// =============================================================================
// Admin-side media uploads (photos + videos) on behalf of a vendor
// =============================================================================
//
// Admins curate vendor storefronts: they need to add a missing cover, swap
// a watermarked photo, or attach the highlight reel the vendor emailed
// over. These actions write into the same `vendor-portfolios` bucket and
// the same `cover_image` / `gallery_urls` / `video_urls` columns that the
// vendor portal uses, so the public profile reads one canonical source.
//
// Photos travel through a server action (small, image MIME guard). Videos
// use a signed *upload* URL — a 100 MB MOV would exceed the Vercel server
// action body cap, so the browser PUTs the file directly to Supabase
// Storage and we just persist the resulting public URL.

const ADMIN_PHOTO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const ADMIN_VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/quicktime'])
const ADMIN_PHOTO_MAX_BYTES = 25 * 1024 * 1024 // 25 MB — matches portal cap
const ADMIN_VIDEO_MAX_BYTES = 500 * 1024 * 1024 // 500 MB — matches bucket cap

export type AdminUploadResult =
  | { ok: true; url: string; path: string }
  | { ok: false; error: string; reason: 'unauth' | 'invalid' | 'unknown' }

export type AdminVideoUploadUrlResult =
  | {
      ok: true
      uploadUrl: string
      token: string
      publicUrl: string
      path: string
    }
  | { ok: false; error: string; reason: 'unauth' | 'invalid' | 'unknown' }

export async function adminUploadVendorPhoto(
  formData: FormData,
): Promise<AdminUploadResult> {
  const { userId } = await auth()
  if (!userId) return { ok: false, reason: 'unauth', error: 'Sign in first.' }
  try { await requirePermission('vendor.moderate') } catch { return { ok: false, reason: 'unauth', error: "You don't have permission for that." } }

  const vendorId = formData.get('vendorId')
  const kind = formData.get('kind')
  const file = formData.get('file')
  if (typeof vendorId !== 'string' || !vendorId) {
    return { ok: false, reason: 'invalid', error: 'Missing vendor id.' }
  }
  if (kind !== 'cover' && kind !== 'gallery') {
    return { ok: false, reason: 'invalid', error: 'Unknown upload kind.' }
  }
  if (!(file instanceof File)) {
    return { ok: false, reason: 'invalid', error: 'No file in upload payload.' }
  }
  if (!ADMIN_PHOTO_MIME.has(file.type)) {
    return {
      ok: false,
      reason: 'invalid',
      error: 'Only JPEG, PNG, WebP, or GIF images are allowed.',
    }
  }
  if (file.size > ADMIN_PHOTO_MAX_BYTES) {
    return {
      ok: false,
      reason: 'invalid',
      error: `${file.name}: file is over the 25 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB).`,
    }
  }

  const ext = (() => {
    if (file.type === 'image/jpeg') return 'jpg'
    if (file.type === 'image/png') return 'png'
    if (file.type === 'image/webp') return 'webp'
    if (file.type === 'image/gif') return 'gif'
    return 'bin'
  })()
  const path = `${vendorId}/storefront/${kind}/${Date.now()}.${ext}`
  const admin = createSupabaseAdminClient()
  const buf = Buffer.from(await file.arrayBuffer())
  const upload = await admin.storage
    .from('vendor-portfolios')
    .upload(path, buf, { contentType: file.type, upsert: false })
  if (upload.error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[admin] photo upload failed: ${upload.error.message}`,
    }
  }
  const publicUrl = admin.storage.from('vendor-portfolios').getPublicUrl(path)
  return { ok: true, url: publicUrl.data.publicUrl, path }
}

export async function adminCreateVendorVideoUploadUrl(input: {
  vendorId: string
  filename: string
  mimeType: string
  sizeBytes: number
}): Promise<AdminVideoUploadUrlResult> {
  const { userId } = await auth()
  if (!userId) return { ok: false, reason: 'unauth', error: 'Sign in first.' }
  try { await requirePermission('vendor.moderate') } catch { return { ok: false, reason: 'unauth', error: "You don't have permission for that." } }
  if (!input.vendorId) {
    return { ok: false, reason: 'invalid', error: 'Missing vendor id.' }
  }
  if (!ADMIN_VIDEO_MIME.has(input.mimeType)) {
    return {
      ok: false,
      reason: 'invalid',
      error: 'Only MP4, WebM, or MOV video files are allowed.',
    }
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, reason: 'invalid', error: 'Missing file size.' }
  }
  if (input.sizeBytes > ADMIN_VIDEO_MAX_BYTES) {
    return {
      ok: false,
      reason: 'invalid',
      error: `${input.filename}: video is over the 500 MB limit (${(input.sizeBytes / 1024 / 1024).toFixed(1)} MB).`,
    }
  }

  const ext = (() => {
    if (input.mimeType === 'video/mp4') return 'mp4'
    if (input.mimeType === 'video/webm') return 'webm'
    if (input.mimeType === 'video/quicktime') return 'mov'
    return 'bin'
  })()
  const path = `${input.vendorId}/storefront/video/${Date.now()}.${ext}`
  const admin = createSupabaseAdminClient()
  const signed = await admin.storage
    .from('vendor-portfolios')
    .createSignedUploadUrl(path)
  if (signed.error || !signed.data) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[admin] signed upload URL failed: ${signed.error?.message ?? 'unknown'}`,
    }
  }
  const publicUrl = admin.storage.from('vendor-portfolios').getPublicUrl(path)
  return {
    ok: true,
    uploadUrl: signed.data.signedUrl,
    token: signed.data.token,
    publicUrl: publicUrl.data.publicUrl,
    path,
  }
}

export type VendorCategoryOption = {
  slug: string
  /** The value written to `vendors.category` (FK onto vendor_categories.db_value). */
  dbValue: string
  label: string
  vertical: string
}

/** Active business categories, for the admin's category picker. */
export async function loadVendorCategoryOptions(): Promise<VendorCategoryOption[]> {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from('vendor_categories')
    .select('slug, db_value, profile_label, label, vertical, active')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .returns<
      Array<{
        slug: string
        db_value: string
        profile_label: string | null
        label: string
        vertical: string | null
        active: boolean
      }>
    >()
  if (error) {
    console.error('[admin] category options failed', error.code, error.message)
    return []
  }
  return (data ?? []).map((c) => ({
    slug: c.slug,
    dbValue: c.db_value,
    // `profile_label` is the short public-facing noun ("Venue", "Home &
    // Kitchen"); `label` is the longer onboarding question phrasing ("Venue or
    // event space"). The short form reads better in a picker.
    label: c.profile_label?.trim() || c.label,
    vertical: c.vertical ?? 'service',
  }))
}

/**
 * Re-file a vendor under a different business category.
 *
 * The vertical is DERIVED from the chosen category rather than set separately.
 * `vendor_categories.vertical` is the source of truth and `vendors.vertical` is
 * a denormalised copy of it, so letting an admin set the two independently is
 * the one way to produce a vendor the schema considers self-contradictory: a
 * "Venues" row published in the gift registry.
 *
 * When the new category sits in a different vertical this moves the vendor
 * between PUBLIC CATALOGUES (out of the wedding vendor directory and into the
 * registry, or back) and, if it crosses the service/product line, reshapes their
 * portal: they lose Bookings, Leads, Packages and Availability and gain Products
 * and Payments, or the reverse (see the guards in vendors_portal).
 *
 * The ISR cache bust runs on EVERY save, not just vertical moves. A vendor's
 * public page renders its category, so a same-vertical rename is stale too, and
 * over-purging a handful of paths is cheaper than reasoning about which ones
 * actually changed.
 */
export async function updateVendorCategory(
  vendorId: string,
  categoryDbValue: string,
): Promise<ActionResult> {
  const { userId } = await auth()
  if (!userId) return { ok: false, reason: 'unauth', error: 'Sign in first.' }
  try { await requirePermission('vendor.moderate') } catch { return { ok: false, reason: 'unauth', error: "You don't have permission for that." } }

  const admin = createSupabaseAdminClient()

  // Resolve against the table rather than trusting the client's string: this
  // value goes into a column with an FK onto vendor_categories(db_value), and
  // it decides which public catalogue the vendor lands in.
  const { data: category, error: catError } = await admin
    .from('vendor_categories')
    .select('db_value, vertical, active')
    .eq('db_value', categoryDbValue)
    .maybeSingle<{ db_value: string; vertical: string | null; active: boolean }>()
  if (catError) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[admin] category lookup failed: ${catError.code} ${catError.message}`,
    }
  }
  if (!category || !category.active) {
    return { ok: false, reason: 'invalid', error: 'Pick an active vendor category.' }
  }

  // Read the slug BEFORE the write, because it's what names the public paths to
  // purge. A failure here doesn't block the re-file, but it must not pass in
  // silence: the write would succeed while the public site kept serving the old
  // listing for a full ISR window, which is exactly the "publish does nothing"
  // failure the revalidate helper's own header warns about.
  const { data: before, error: beforeError } = await admin
    .from('vendors')
    .select('slug, category, vertical')
    .eq('id', vendorId)
    .maybeSingle<{ slug: string; category: string; vertical: string | null }>()
  if (beforeError) {
    console.error(
      `[admin] vendor lookup before category change failed: ${beforeError.code} ${beforeError.message} — public cache will not be purged for vendor ${vendorId}.`,
    )
  }

  const { error } = await admin
    .from('vendors')
    .update({
      category: category.db_value,
      vertical: category.vertical ?? 'service',
    })
    .eq('id', vendorId)

  if (error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[admin] update vendor category failed: ${error.code} ${error.message}`,
    }
  }

  revalidatePath('/operations/vendors')
  revalidatePath(`/operations/vendors/${vendorId}`)

  // Bust the public caches. The vendor's own page plus both index surfaces they
  // could be entering or leaving — we don't try to be clever about which,
  // because the old and new verticals are both stale after this write.
  if (before?.slug) {
    await revalidateWebsite(
      `/vendors/${before.slug}`,
      '/vendors',
      `/registry/shops/${before.slug}`,
      '/registry/shops',
      `/attire-and-rings/shops/${before.slug}`,
      '/attire-and-rings/shops',
    )
  } else {
    console.error(
      `[admin] no slug resolved for vendor ${vendorId} — public cache not purged after category change.`,
    )
  }

  // A vendor filed under "Other" carries a pending `vendor_category_requests`
  // row, which renders a standing "this vendor doesn't fit an existing
  // category" banner on this page and sits in the category-requests queue.
  // Re-filing them into a real category IS the answer to that request: the
  // admin has decided they do fit one, so no new category will be created.
  // Resolving it here is the same write an admin would otherwise make by hand
  // in the queue; leaving it pending would strand the banner and the queue
  // entry forever. Best-effort — the re-file itself has already succeeded.
  if (before?.category === 'Other' && category.db_value !== 'Other') {
    const { error: requestError } = await admin
      .from('vendor_category_requests')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
      .eq('vendor_id', vendorId)
      .eq('status', 'pending')
    if (requestError) {
      console.error(
        `[admin] could not resolve pending category request for vendor ${vendorId}: ${requestError.code} ${requestError.message}`,
      )
    } else {
      revalidatePath('/operations/category-requests')
    }
  }

  return { ok: true }
}

export async function reactivateVendor(
  vendorId: string
): Promise<ActionResult> {
  const { userId } = await auth()
  if (!userId) return { ok: false, reason: 'unauth', error: 'Sign in first.' }
  try { await requirePermission('vendor.moderate') } catch { return { ok: false, reason: 'unauth', error: "You don't have permission for that." } }

  const admin = createSupabaseAdminClient()
  const { error } = await admin
    .from('vendors')
    .update({
      onboarding_status: 'active',
      suspended_at: null,
      suspension_reason: null,
    })
    .eq('id', vendorId)
    .eq('onboarding_status', 'suspended')

  if (error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[admin] reactivate vendor failed: ${error.code} ${error.message}`,
    }
  }

  await notifyVendorOfStatusChange(admin, vendorId, 'reactivated')

  revalidatePath('/operations/vendors')
  revalidatePath(`/operations/vendors/${vendorId}`)
  return { ok: true }
}

// =============================================================================
// Permanent deletion — the irreversible end of the lifecycle
// =============================================================================
//
// "Suspend" is the soft off-switch: the vendor row survives, bookings and
// history stay intact, and the vendor can be reactivated. "Delete" is the
// hard one — it removes the `vendors` row, which CASCADEs to every child
// table (bookings, reviews, inquiries link, payments, invoices, payouts,
// verification documents, agreements, memberships, availability, …) AND
// deletes the vendor's Clerk login so their email is freed for re-signup.
// There is no undo. Reach for it to remove test/duplicate accounts or to
// honour a vendor's account-deletion request, NOT as a stronger suspend.
//
// The Clerk piece is the whole point: vendors sign in through the
// vendors-portal Clerk instance, which is SEPARATE from the admin's own
// Clerk instance. So this action calls Clerk's Backend API with the portal
// instance's secret (VENDORS_CLERK_SECRET_KEY) to remove the login — without
// it, the email stays "taken" and the admin would have to delete the user by
// hand in the Clerk dashboard, which is exactly what we're avoiding.
//
// Two guards make an accidental wipe hard:
//   1. The caller must echo the exact business name (checked server-side, so
//      a stray client call can't delete the wrong vendor).
//   2. The UI surfaces the live-booking count first via getVendorDeletionImpact
//      so the admin sees what they're about to destroy.

export type VendorDeletionImpact = {
  liveBookings: number
  totalBookings: number
  reviews: number
}

export type VendorDeletionImpactResult =
  | { ok: true; businessName: string; impact: VendorDeletionImpact }
  | { ok: false; error: string; reason: 'unauth' | 'not-found' | 'unknown' }

/**
 * Summarise what a delete would destroy so the admin can make an informed
 * call before confirming. Counts are best-effort — a missing table (e.g. an
 * environment behind on migrations) degrades that count to 0 rather than
 * failing the whole preview. "Live" bookings are those not yet cancelled or
 * completed: deleting a vendor mid-engagement orphans a real couple.
 */
export async function getVendorDeletionImpact(
  vendorId: string
): Promise<VendorDeletionImpactResult> {
  // Gate via requireAdminRole, which resolves the caller across all three auth
  // paths — Clerk session, temp shared-passcode access, and DISABLE_ADMIN_AUTH
  // dev. A raw Clerk `userId` check wrongly rejects temp/dev admins (who have an
  // owner role but no Clerk session) with "Sign in first".
  try {
    await requirePermission('vendor.moderate')
  } catch {
    return { ok: false, reason: 'unauth', error: 'Sign in as an admin first.' }
  }

  const admin = createSupabaseAdminClient()
  const vendor = await admin
    .from('vendors')
    .select('business_name')
    .eq('id', vendorId)
    .maybeSingle<{ business_name: string | null }>()
  if (vendor.error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[admin] deletion impact lookup failed: ${vendor.error.code} ${vendor.error.message}`,
    }
  }
  if (!vendor.data) {
    return {
      ok: false,
      reason: 'not-found',
      error: 'Vendor not found — it may have already been deleted.',
    }
  }

  const countFor = async (
    table: string,
    liveOnly = false
  ): Promise<number> => {
    let query = admin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('vendor_id', vendorId)
    if (liveOnly) {
      // Everything not yet cancelled or completed — a vendor mid-engagement.
      query = query.not('stage', 'in', '("cancelled","completed")')
    }
    const { count, error } = await query
    if (error) {
      console.warn(
        `[admin] deletion impact count failed for ${table}: ${error.code} ${error.message}`
      )
      return 0
    }
    return count ?? 0
  }

  const [totalBookings, liveBookings, reviews] = await Promise.all([
    countFor('vendor_bookings'),
    countFor('vendor_bookings', true),
    countFor('reviews'),
  ])

  return {
    ok: true,
    businessName: vendor.data.business_name?.trim() || '',
    impact: { liveBookings, totalBookings, reviews },
  }
}

/**
 * Recursively collect every object key under a storage prefix. Supabase's
 * `list` is one folder deep, so we walk into sub-folders (entries with no
 * `id`) until we bottom out. Used to purge a deleted vendor's media so we
 * don't orphan private KYC scans or portfolio files in the bucket.
 */
async function listStorageObjects(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  bucket: string,
  prefix: string
): Promise<string[]> {
  const { data, error } = await admin.storage.from(bucket).list(prefix, {
    limit: 1000,
  })
  if (error || !data) {
    if (error) {
      console.warn(
        `[admin] storage list failed (${bucket}/${prefix}): ${error.message}`
      )
    }
    return []
  }
  const keys: string[] = []
  for (const entry of data) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.id === null) {
      // A folder — recurse into it.
      keys.push(...(await listStorageObjects(admin, bucket, path)))
    } else {
      keys.push(path)
    }
  }
  return keys
}

/**
 * Best-effort purge of a vendor's stored files before the row (and its
 * exact storage-path records) disappear. Pulls precise verification-document
 * and signature paths from the DB, plus a recursive sweep of the portfolio
 * folder. Never throws — a storage hiccup must not block the DB delete.
 */
async function removeVendorStorageObjects(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  vendorId: string
): Promise<void> {
  // vendor_verification bucket: KYC documents + the drawn signature image.
  const verificationKeys = new Set<string>()
  const docs = await admin
    .from('vendor_verification_documents')
    .select('storage_path')
    .eq('vendor_id', vendorId)
  if (!docs.error) {
    for (const row of docs.data ?? []) {
      const path = (row as { storage_path: string | null }).storage_path
      if (path) verificationKeys.add(path)
    }
  }
  const agreements = await admin
    .from('vendor_agreements')
    .select('signature_image_path')
    .eq('vendor_id', vendorId)
  if (!agreements.error) {
    for (const row of agreements.data ?? []) {
      const path = (row as { signature_image_path: string | null })
        .signature_image_path
      if (path) verificationKeys.add(path)
    }
  }
  // Belt-and-braces: also sweep anything left under the vendor's folder.
  for (const key of await listStorageObjects(
    admin,
    'vendor_verification',
    vendorId
  )) {
    verificationKeys.add(key)
  }
  if (verificationKeys.size > 0) {
    const { error } = await admin.storage
      .from('vendor_verification')
      .remove(Array.from(verificationKeys))
    if (error) {
      console.warn(
        `[admin] vendor_verification purge failed for ${vendorId}: ${error.message}`
      )
    }
  }

  // vendor-portfolios bucket: cover, gallery, and video uploads.
  const portfolioKeys = await listStorageObjects(
    admin,
    'vendor-portfolios',
    vendorId
  )
  if (portfolioKeys.length > 0) {
    const { error } = await admin.storage
      .from('vendor-portfolios')
      .remove(portfolioKeys)
    if (error) {
      console.warn(
        `[admin] vendor-portfolios purge failed for ${vendorId}: ${error.message}`
      )
    }
  }
}

const CLERK_API_BASE = 'https://api.clerk.com/v1'

/**
 * Delete the vendor's login from the vendors-portal Clerk instance so the
 * email is freed for a fresh sign-up — the whole reason admins shouldn't have
 * to open the Clerk dashboard. Uses VENDORS_CLERK_SECRET_KEY (the *portal*
 * instance's secret, NOT the admin instance's). Resolves the Clerk user id
 * from `clerkId` when we have it, otherwise looks it up by email (covers
 * admin-created vendors whose users row was never linked).
 *
 * Returns `{ ok: true }` when there's nothing to remove (no login exists) or
 * the user is already gone (404) — those are success states.
 *
 * When the secret is NOT configured, returns `{ ok: true, warning }` rather than
 * an error: a missing platform config shouldn't block a core admin operation, so
 * the caller proceeds with the DB deletion and surfaces the warning (the email
 * may stay reserved in the vendors portal until the key is set). A genuine Clerk
 * rejection still returns `{ ok: false }` so the caller can abort.
 */
async function deleteVendorClerkLogin(opts: {
  clerkId: string | null
  email: string | null
}): Promise<{ ok: boolean; error?: string; warning?: string }> {
  const secret = process.env.VENDORS_CLERK_SECRET_KEY?.trim()
  if (!secret) {
    return {
      ok: true,
      warning:
        'The vendor record was deleted, but their portal sign-in login was NOT removed — VENDORS_CLERK_SECRET_KEY (the vendors-portal Clerk secret) is not configured on the admin app. That email may stay reserved in the vendors portal until the key is set and the login is cleared.',
    }
  }
  const headers = { Authorization: `Bearer ${secret}` }

  let clerkId = opts.clerkId?.trim() || null

  // No stored id → resolve by email. Clerk's list endpoint filters on exact
  // email_address and returns an array of matching users.
  if (!clerkId && opts.email) {
    try {
      const lookup = await fetch(
        `${CLERK_API_BASE}/users?email_address=${encodeURIComponent(opts.email)}&limit=1`,
        { headers }
      )
      if (lookup.ok) {
        const rows = (await lookup.json()) as Array<{ id?: string }>
        clerkId = Array.isArray(rows) ? (rows[0]?.id ?? null) : null
      } else if (lookup.status !== 404) {
        const body = await lookup.text().catch(() => '')
        return {
          ok: false,
          error: `Clerk user lookup failed (${lookup.status}): ${body.slice(0, 200)}`,
        }
      }
    } catch (err) {
      return {
        ok: false,
        error: `Clerk user lookup error: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }

  // Nothing to delete — e.g. an admin-created vendor that never signed in.
  if (!clerkId) return { ok: true }

  try {
    const res = await fetch(`${CLERK_API_BASE}/users/${clerkId}`, {
      method: 'DELETE',
      headers,
    })
    // 404 = already deleted in Clerk; treat as success so we don't wedge.
    if (res.ok || res.status === 404) return { ok: true }
    const body = await res.text().catch(() => '')
    return {
      ok: false,
      error: `Clerk login deletion failed (${res.status}): ${body.slice(0, 200)}`,
    }
  } catch (err) {
    return {
      ok: false,
      error: `Clerk login deletion error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/**
 * Permanently delete a vendor account. Order matters: remove the Clerk login
 * FIRST (so the email is freed and we abort cleanly if that can't happen),
 * then purge stored media, then delete the `vendors` row — every child table
 * CASCADEs. Finally the linked `public.users` row's `clerk_id` is cleared so a
 * later re-signup re-links cleanly instead of colliding with a dead id; the
 * users row itself is kept (it may be referenced by non-vendor data).
 * `confirmName` must exactly match the vendor's current business name or the
 * action refuses, defending against a misfired call.
 */
export async function deleteVendor(
  vendorId: string,
  confirmName: string
): Promise<ActionResult> {
  // Gate via requireAdminRole, which resolves the caller across all three auth
  // paths — Clerk session, temp shared-passcode access, and DISABLE_ADMIN_AUTH
  // dev. A raw Clerk `userId` check wrongly rejects temp/dev admins (who have an
  // owner role but no Clerk session) with "Sign in first".
  try {
    await requirePermission('vendor.moderate')
  } catch {
    return { ok: false, reason: 'unauth', error: 'Sign in as an admin first.' }
  }
  if (!vendorId) {
    return { ok: false, reason: 'invalid', error: 'Missing vendor id.' }
  }

  const admin = createSupabaseAdminClient()
  const vendor = await admin
    .from('vendors')
    .select('business_name, user_id, contact_info')
    .eq('id', vendorId)
    .maybeSingle<{
      business_name: string | null
      user_id: string | null
      contact_info: { email?: string | null } | null
    }>()
  if (vendor.error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[admin] vendor lookup failed: ${vendor.error.code} ${vendor.error.message}`,
    }
  }
  if (!vendor.data) {
    return {
      ok: false,
      reason: 'not-found',
      error: 'Vendor not found — it may have already been deleted.',
    }
  }

  const expected = (vendor.data.business_name ?? '').trim()
  if (confirmName.trim() !== expected) {
    return {
      ok: false,
      reason: 'invalid',
      error: `The name you typed doesn't match "${expected}". Deletion cancelled.`,
    }
  }

  // Resolve the vendor's login email + Clerk id from the linked users row,
  // falling back to the contact email on the vendor record.
  let clerkId: string | null = null
  let loginEmail: string | null = vendor.data.contact_info?.email?.trim() || null
  if (vendor.data.user_id) {
    const userRow = await admin
      .from('users')
      .select('clerk_id, email')
      .eq('id', vendor.data.user_id)
      .maybeSingle<{ clerk_id: string | null; email: string | null }>()
    if (!userRow.error && userRow.data) {
      clerkId = userRow.data.clerk_id?.trim() || null
      loginEmail = userRow.data.email?.trim() || loginEmail
    }
  }

  // Remove the Clerk login first. A genuine Clerk failure aborts before we touch
  // any DB rows — otherwise we'd delete the vendor but leave the email stuck as
  // "taken". A missing secret is NOT a failure: it returns ok with a warning, so
  // the deletion still proceeds and we surface the warning to the admin.
  const clerkRes = await deleteVendorClerkLogin({ clerkId, email: loginEmail })
  if (!clerkRes.ok) {
    return {
      ok: false,
      reason: 'unknown',
      error: clerkRes.error ?? 'Could not delete the vendor login.',
    }
  }

  // Purge storage before the row goes — afterwards we lose the exact paths.
  await removeVendorStorageObjects(admin, vendorId)

  const { error } = await admin.from('vendors').delete().eq('id', vendorId)
  if (error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[admin] delete vendor failed: ${error.code} ${error.message}`,
    }
  }

  // Clear the now-dangling Clerk link on the users row so a future sign-up
  // with the same email re-links instead of hitting the unique clerk_id.
  if (vendor.data.user_id && clerkId) {
    const clear = await admin
      .from('users')
      .update({ clerk_id: null })
      .eq('id', vendor.data.user_id)
    if (clear.error) {
      console.warn(
        `[admin] clearing clerk_id failed for user=${vendor.data.user_id}: ${clear.error.code} ${clear.error.message}`
      )
    }
  }

  revalidatePath('/operations/vendors')
  revalidatePath(`/operations/vendors/${vendorId}`)
  return { ok: true, warning: clerkRes.warning }
}

/**
 * Merge two duplicate vendor records into one. The `survivorId` keeps all data;
 * the `loserId` is absorbed and then permanently deleted.
 *
 * Order, and why:
 *  1. `merge_vendors` RPC reassigns every child row (bookings inquiries,
 *     invoices, payments, payouts, portfolio, reviews, documents, agreements,
 *     memberships, …) from loser → survivor in ONE transaction, deduping the
 *     unique-constrained tables. Atomic so a vendor's data is never split.
 *  2. Delete the loser's Clerk login — but ONLY when it's a *different* login
 *     from the survivor's owner. If the same person owns both duplicates,
 *     deleting "their" login would lock them out of the survivor. We compare
 *     resolved Clerk ids and skip when they match.
 *  3. Delete the now child-less loser `vendors` row (cascade is a no-op since
 *     step 1 moved everything). We deliberately do NOT purge the loser's
 *     storage objects — the reassigned portfolio/document rows still point at
 *     those files, so they now belong to the survivor.
 *
 * `confirmName` must exactly match the LOSER's business name (it's the record
 * being destroyed), defending against a misfired merge.
 */
export async function mergeVendors(input: {
  survivorId: string
  loserId: string
  confirmName: string
}): Promise<ActionResult> {
  // Gate via requireAdminRole, which resolves the caller across all three auth
  // paths — Clerk session, temp shared-passcode access, and DISABLE_ADMIN_AUTH
  // dev. A raw Clerk `userId` check wrongly rejects temp/dev admins (who have an
  // owner role but no Clerk session) with "Sign in first".
  try {
    await requirePermission('vendor.moderate')
  } catch {
    return { ok: false, reason: 'unauth', error: 'Sign in as an admin first.' }
  }

  const { survivorId, loserId, confirmName } = input
  if (!survivorId || !loserId) {
    return { ok: false, reason: 'invalid', error: 'Both vendors are required.' }
  }
  if (survivorId === loserId) {
    return {
      ok: false,
      reason: 'invalid',
      error: 'Pick two different vendors to merge.',
    }
  }

  const admin = createSupabaseAdminClient()

  type MergeVendorRow = {
    id: string
    business_name: string | null
    user_id: string | null
    contact_info: { email?: string | null } | null
  }
  const both = await admin
    .from('vendors')
    .select('id, business_name, user_id, contact_info')
    .in('id', [survivorId, loserId])
    .returns<MergeVendorRow[]>()
  if (both.error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[admin] merge lookup failed: ${both.error.code} ${both.error.message}`,
    }
  }
  const survivor = both.data?.find((v) => v.id === survivorId)
  const loser = both.data?.find((v) => v.id === loserId)
  if (!survivor || !loser) {
    return {
      ok: false,
      reason: 'not-found',
      error: 'One of the vendors no longer exists — it may have been deleted.',
    }
  }

  const expected = (loser.business_name ?? '').trim()
  if (confirmName.trim() !== expected) {
    return {
      ok: false,
      reason: 'invalid',
      error: `The name you typed doesn't match "${expected}". Merge cancelled.`,
    }
  }

  // Resolve both sides' login (Clerk id + email) so we can (a) absorb the
  // loser's login and (b) NEVER delete a login the survivor still needs.
  const resolveLogin = async (
    v: MergeVendorRow,
  ): Promise<{ clerkId: string | null; email: string | null }> => {
    let clerkId: string | null = null
    let email: string | null = v.contact_info?.email?.trim() || null
    if (v.user_id) {
      const userRow = await admin
        .from('users')
        .select('clerk_id, email')
        .eq('id', v.user_id)
        .maybeSingle<{ clerk_id: string | null; email: string | null }>()
      if (!userRow.error && userRow.data) {
        clerkId = userRow.data.clerk_id?.trim() || null
        email = userRow.data.email?.trim() || email
      }
    }
    return { clerkId, email }
  }
  const [survivorLogin, loserLogin] = await Promise.all([
    resolveLogin(survivor),
    resolveLogin(loser),
  ])

  // 1) Reassign all child rows loser → survivor, atomically.
  const merge = await admin.rpc('merge_vendors', {
    p_loser: loserId,
    p_survivor: survivorId,
  })
  if (merge.error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[admin] merge_vendors failed: ${merge.error.code} ${merge.error.message}`,
    }
  }

  // 2) Remove the loser's login, but only if it's genuinely a separate login
  // from the survivor's owner (same person owning both duplicates → keep it).
  const sharesOwner =
    (loserLogin.clerkId != null && loserLogin.clerkId === survivorLogin.clerkId) ||
    (loser.user_id != null && loser.user_id === survivor.user_id)
  let loginWarning: string | undefined
  if (!sharesOwner && loserLogin.clerkId) {
    const clerkRes = await deleteVendorClerkLogin({
      clerkId: loserLogin.clerkId,
      email: loserLogin.email,
    })
    if (!clerkRes.ok) {
      return {
        ok: false,
        reason: 'unknown',
        error:
          (clerkRes.error ?? 'Could not delete the duplicate login.') +
          ' The records were merged; only the duplicate login removal failed.',
      }
    }
    loginWarning = clerkRes.warning
  }

  // 3) Delete the now child-less loser row. NOT its storage — those files back
  // the reassigned rows and now belong to the survivor.
  const del = await admin.from('vendors').delete().eq('id', loserId)
  if (del.error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[admin] deleting merged loser failed: ${del.error.code} ${del.error.message}`,
    }
  }

  // Clear the dangling clerk_id on the loser's users row (when not shared) so a
  // future sign-up with that email re-links cleanly.
  if (!sharesOwner && loser.user_id && loserLogin.clerkId) {
    const clear = await admin
      .from('users')
      .update({ clerk_id: null })
      .eq('id', loser.user_id)
    if (clear.error) {
      console.warn(
        `[admin] clearing clerk_id failed for user=${loser.user_id}: ${clear.error.code} ${clear.error.message}`,
      )
    }
  }

  revalidatePath('/operations/vendors')
  revalidatePath(`/operations/vendors/${survivorId}`)
  // Drop the loser's cached detail route too — its row is gone on success, and
  // if step 3 ever fails mid-way this keeps a stale page from lingering.
  revalidatePath(`/operations/vendors/${loserId}`)
  return { ok: true, warning: loginWarning }
}

// =============================================================================
// Document requests — admin asks a vendor for an arbitrary document via a
// tokenized, no-login upload link. See vendor_document_requests table.
// =============================================================================

const DOC_REQUEST_TTL_DAYS = 14

function vendorsPortalBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_VENDORS_PORTAL_URL?.trim() ||
    'https://vendorsportal.opusfesta.com'
  ).replace(/\/$/, '')
}

/**
 * Create a document request for a vendor and email them a tokenized upload
 * link. The vendor uploads on a public (no-login) page; the file attaches to
 * this request row for the admin to review and mark complete.
 */
export async function requestVendorDocument(
  vendorId: string,
  title: string,
  details?: string
): Promise<ActionResult> {
  const { userId } = await auth()
  try {
    await requirePermission('vendor.moderate')
  } catch {
    return { ok: false, reason: 'unauth', error: "You don't have permission for that." }
  }

  const cleanTitle = title.trim()
  if (!cleanTitle) {
    return { ok: false, reason: 'invalid', error: 'Describe the document you need.' }
  }
  if (cleanTitle.length > 160) {
    return { ok: false, reason: 'invalid', error: 'Keep the document title under 160 characters.' }
  }
  const cleanDetails = details?.trim() || null

  const admin = createSupabaseAdminClient()
  const requestedBy = userId ? await resolveAdminUserId(admin, userId) : null
  const token = randomBytes(24).toString('base64url')
  const expiresAt = new Date(Date.now() + DOC_REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000)

  const { data: inserted, error } = await admin
    .from('vendor_document_requests')
    .insert({
      vendor_id: vendorId,
      title: cleanTitle,
      details: cleanDetails,
      token,
      requested_by: requestedBy,
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .single<{ id: string }>()

  if (error || !inserted) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[admin] document request insert failed: ${error?.code ?? ''} ${error?.message ?? 'no row'}`.trim(),
    }
  }

  // Best-effort email — never roll back the request if the send fails.
  let warning: string | undefined
  if (isEmailConfigured()) {
    const { data: vendor } = await admin
      .from('vendors')
      .select('business_name, contact_info, user_id, vendor_code')
      .eq('id', vendorId)
      .maybeSingle<{
        business_name: string | null
        contact_info: { email?: string | null } | null
        user_id: string | null
        vendor_code: string | null
      }>()

    let recipient = vendor?.contact_info?.email?.trim() || ''
    if (!recipient && vendor?.user_id) {
      const userRow = await admin
        .from('users')
        .select('email')
        .eq('id', vendor.user_id)
        .maybeSingle<{ email: string | null }>()
      recipient = userRow.data?.email?.trim() || ''
    }

    if (!recipient) {
      warning = 'Request saved, but the vendor has no email on file, so no message was sent.'
    } else {
      const message = buildDocumentRequestEmail({
        businessName: vendor?.business_name?.trim() || 'OpusFesta vendor',
        recipientEmail: recipient,
        title: cleanTitle,
        details: cleanDetails,
        uploadUrl: `${vendorsPortalBaseUrl()}/upload/${token}`,
        vendorCode: vendor?.vendor_code ?? null,
      })
      const adminCc = await resolveAdminBccRecipients(admin, recipient)
      const result = await sendEmail({
        to: recipient,
        subject: message.subject,
        html: message.html,
        text: message.text,
        bcc: adminCc.length > 0 ? adminCc : undefined,
      })
      if (!result.sent) {
        warning = 'Request saved, but the email could not be sent. Share the link manually.'
        console.warn(
          `[email] document request notify failed (vendor=${vendorId}): ${result.reason}${result.error ? ` — ${result.error}` : ''}`
        )
      }
    }
  } else {
    warning = 'Request saved. Email is not configured, so share the upload link manually.'
  }

  revalidatePath(`/operations/vendors/${vendorId}`)
  return warning ? { ok: true, warning } : { ok: true }
}

/** Cancel a pending document request so its link stops working. */
export async function cancelVendorDocumentRequest(
  requestId: string
): Promise<ActionResult> {
  try {
    await requirePermission('vendor.moderate')
  } catch {
    return { ok: false, reason: 'unauth', error: "You don't have permission for that." }
  }

  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from('vendor_document_requests')
    .update({ status: 'cancelled' })
    .eq('id', requestId)
    .in('status', ['pending', 'submitted'])
    .select('vendor_id')
    .maybeSingle<{ vendor_id: string }>()

  if (error) {
    return { ok: false, reason: 'unknown', error: `[admin] cancel request failed: ${error.message}` }
  }
  if (!data) {
    return { ok: false, reason: 'not-found', error: 'Request not found or already closed.' }
  }
  revalidatePath(`/operations/vendors/${data.vendor_id}`)
  return { ok: true }
}

/** Mark a submitted document request as handled. */
export async function completeVendorDocumentRequest(
  requestId: string
): Promise<ActionResult> {
  try {
    await requirePermission('vendor.moderate')
  } catch {
    return { ok: false, reason: 'unauth', error: "You don't have permission for that." }
  }

  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from('vendor_document_requests')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('status', 'submitted')
    .select('vendor_id')
    .maybeSingle<{ vendor_id: string }>()

  if (error) {
    return { ok: false, reason: 'unknown', error: `[admin] complete request failed: ${error.message}` }
  }
  if (!data) {
    return { ok: false, reason: 'not-found', error: 'Only a submitted request can be marked complete.' }
  }
  revalidatePath(`/operations/vendors/${data.vendor_id}`)
  return { ok: true }
}
