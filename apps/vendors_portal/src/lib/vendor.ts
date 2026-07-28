import { auth, currentUser } from '@clerk/nextjs/server'
import { createSupabaseAdminClient } from './supabase'
import { isVendorVertical, type VendorVertical } from './onboarding/verticals'

export type CurrentVendor = {
  id: string
  slug: string
  businessName: string
  category: string
  /**
   * Which business the vendor is actually in: a wedding service, a gift shop,
   * or attire/rings. Drives which portal surfaces exist for them (a gift shop
   * has no bookings or availability) and which public directory they appear in.
   */
  vertical: VendorVertical
  bio: string | null
  logo: string | null
  coverImage: string | null
  onboardingStatus: VendorOnboardingStatus
  role: 'owner' | 'manager' | 'staff'
  stats: {
    viewCount: number
    inquiryCount: number
    saveCount: number
    averageRating: number
    reviewCount: number
  }
}

// Mirrors the `vendor_onboarding_status` enum after migration
// 20260501000002_vendor_verification_b_lite.sql. `active` is the only state
// that grants dashboard access; everything else funnels to /verify.
export type VendorOnboardingStatus =
  | 'application_in_progress'
  | 'verification_pending'
  | 'admin_review'
  | 'needs_corrections'
  | 'active'
  | 'suspended'

export type CurrentVendorState =
  | { kind: 'live'; vendor: CurrentVendor }
  | { kind: 'no-application' }
  | {
      kind: 'pending-approval'
      status: Exclude<VendorOnboardingStatus, 'active' | 'suspended'>
      vendorName: string
      // Surfaced so /pending can fetch per-artifact verification progress
      // (which doc is uploaded, whether the agreement is signed) and reflect
      // it as per-step pills on the timeline.
      vendorId: string
      // The caller's membership role + users.id, surfaced so server actions
      // can gate on ownership and stamp signed_by without re-querying — a
      // re-lookup by clerk_id can fail for vendors resolved via the
      // verified-email fallback (whose clerk_id repair is best-effort).
      role: CurrentVendor['role']
      supabaseUserId: string
    }
  | { kind: 'suspended'; vendorName: string; vendorId: string }
  | { kind: 'no-env' }

type VendorRow = {
  id: string
  slug: string
  business_name: string
  category: string
  vertical: string | null
  bio: string | null
  logo: string | null
  cover_image: string | null
  onboarding_status: CurrentVendor['onboardingStatus']
  stats: CurrentVendor['stats'] | null
}

type MembershipRow = {
  vendor_id: string
  role: CurrentVendor['role']
  vendors: VendorRow | VendorRow[] | null
}

type UserLookupRow = {
  id: string
  clerk_id: string | null
  email: string | null
}

const DEFAULT_STATS: CurrentVendor['stats'] = {
  viewCount: 0,
  inquiryCount: 0,
  saveCount: 0,
  averageRating: 0,
  reviewCount: 0,
}

function stateFromMembership(
  row: MembershipRow,
  supabaseUserId: string,
): CurrentVendorState | null {
  const v = Array.isArray(row.vendors) ? row.vendors[0] : row.vendors
  if (!v) {
    console.warn(
      `[vendor] active membership has null vendor row — possible orphan (vendor_id=${row.vendor_id})`,
    )
    return null
  }

  if (v.onboarding_status === 'suspended') {
    return { kind: 'suspended', vendorName: v.business_name, vendorId: v.id }
  }

  if (v.onboarding_status !== 'active') {
    const status = normalizeStatus(v.onboarding_status)
    return {
      kind: 'pending-approval',
      status,
      vendorName: v.business_name,
      vendorId: v.id,
      role: row.role,
      supabaseUserId,
    }
  }

  return {
    kind: 'live',
    vendor: {
      id: v.id,
      slug: v.slug,
      businessName: v.business_name,
      category: v.category,
      // The column is NOT NULL with a 'service' default, so this only falls
      // back for a row written before the verticals migration landed.
      vertical: isVendorVertical(v.vertical) ? v.vertical : 'service',
      bio: v.bio,
      logo: v.logo,
      coverImage: v.cover_image,
      onboardingStatus: v.onboarding_status,
      role: row.role,
      stats: v.stats ?? DEFAULT_STATS,
    },
  }
}

async function loadActiveMembership(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  supabaseUserId: string,
): Promise<MembershipRow | null> {
  const { data, error } = await admin
    .from('vendor_memberships')
    .select(
      `
      vendor_id,
      role,
      vendors (
        id, slug, business_name, category, vertical, bio, logo, cover_image,
        onboarding_status, stats
      )
    `,
    )
    .eq('user_id', supabaseUserId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(5)
    .returns<MembershipRow[]>()

  if (error) {
    if (error.code === 'PGRST205') {
      console.warn(
        `[vendor] ${error.code} — table 'public.vendor_memberships' not in schema cache. Run pending migrations on your Supabase project, or NOTIFY pgrst, 'reload schema'. Falling back to no-env state.`,
      )
      throw new Error('vendor_memberships_schema_cache')
    }
    throw new Error(
      `[vendor] vendor_memberships query failed: ${error.code} ${error.message}`,
    )
  }

  if (data && data.length > 1) {
    console.warn(
      `[vendor] user has ${data.length} active vendor memberships — using the oldest OWNED vendor (oldest of any role if none owned). Vendor switcher ships when staff support lands.`,
    )
  }

  // Prefer a vendor this user OWNS over an older membership where they're
  // only a manager/staff member: the portal's verification flow (agreement
  // signing, doc uploads) acts on the resolved vendor, and pointing it at a
  // vendor the caller can't sign for would dead-end them.
  return data?.find((r) => r.role === 'owner') ?? data?.[0] ?? null
}

async function verifiedClerkEmail(): Promise<{
  email: string
  name: string | null
} | null> {
  const user = await currentUser()
  const emailAddress = user?.primaryEmailAddress ?? user?.emailAddresses[0]
  const email = emailAddress?.emailAddress?.trim().toLowerCase()
  if (!email) return null

  // Clerk normally only exposes signed-in sessions for verified emails, but
  // keep the fallback conservative because it can claim a legacy vendor row.
  const verificationStatus = emailAddress?.verification?.status
  if (verificationStatus && verificationStatus !== 'verified') return null

  const name =
    [user?.firstName, user?.lastName]
      .filter((p): p is string => Boolean(p && p.trim()))
      .join(' ')
      .trim() || null

  return { email, name }
}

async function resolveVendorByVerifiedEmail(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  clerkUserId: string,
  currentSupabaseUserId: string | null,
): Promise<CurrentVendorState | null> {
  const clerkEmail = await verifiedClerkEmail()
  if (!clerkEmail) return null

  const usersByEmail = await admin
    .from('users')
    .select('id, clerk_id, email')
    .ilike('email', clerkEmail.email)
    .limit(10)
    .returns<UserLookupRow[]>()

  if (usersByEmail.error) {
    console.warn(
      `[vendor] email fallback users lookup failed: ${usersByEmail.error.code} ${usersByEmail.error.message}`,
    )
    return null
  }

  const matches: Array<{ user: UserLookupRow; membership: MembershipRow }> = []
  for (const user of usersByEmail.data ?? []) {
    if (user.email?.trim().toLowerCase() !== clerkEmail.email) continue

    const membership = await loadActiveMembership(admin, user.id)
    if (membership) matches.push({ user, membership })
  }

  if (matches.length !== 1) {
    if (matches.length > 1) {
      console.warn(
        `[vendor] email fallback found ${matches.length} vendor memberships for ${clerkEmail.email}; refusing to guess.`,
      )
    }
    return null
  }

  const { user, membership } = matches[0]
  const vendorId = membership.vendor_id

  if (!currentSupabaseUserId || currentSupabaseUserId === user.id) {
    if (user.clerk_id !== clerkUserId) {
      const repair = await admin
        .from('users')
        .update({ clerk_id: clerkUserId, name: clerkEmail.name })
        .eq('id', user.id)

      if (repair.error) {
        console.warn(
          `[vendor] email fallback clerk_id repair failed for users.id=${user.id}: ${repair.error.code} ${repair.error.message}`,
        )
      }
    }
  } else {
    const [vendorRepair, membershipRepair] = await Promise.all([
      admin
        .from('vendors')
        .update({ user_id: currentSupabaseUserId })
        .eq('id', vendorId),
      admin.from('vendor_memberships').upsert(
        {
          vendor_id: vendorId,
          user_id: currentSupabaseUserId,
          role: membership.role,
          status: 'active' as const,
        },
        { onConflict: 'vendor_id,user_id' },
      ),
    ])

    if (vendorRepair.error) {
      console.warn(
        `[vendor] email fallback vendor owner repair failed for vendor.id=${vendorId}: ${vendorRepair.error.code} ${vendorRepair.error.message}`,
      )
    }
    if (membershipRepair.error) {
      console.warn(
        `[vendor] email fallback membership repair failed for vendor.id=${vendorId}: ${membershipRepair.error.code} ${membershipRepair.error.message}`,
      )
    }
  }

  console.warn(
    `[vendor] resolved vendor by verified email fallback for clerk_id=${clerkUserId} users.id=${user.id} vendor.id=${vendorId}`,
  )
  // The caller's users.id: the freshly-provisioned row when one exists,
  // otherwise the email-matched legacy row we just repaired clerk_id on.
  return stateFromMembership(membership, currentSupabaseUserId ?? user.id)
}

// Map legacy onboarding_status values to their B-lite equivalents. The
// migration UPDATE statement handles the bulk migration; this is a runtime
// safety net for any row that slipped through (e.g. partial migration apply).
function normalizeStatus(
  raw: string,
): Exclude<VendorOnboardingStatus, 'active' | 'suspended'> {
  switch (raw) {
    case 'application_in_progress':
    case 'invited':
    case 'in_progress':
      return 'application_in_progress'
    case 'verification_pending':
    case 'pending_review':
      return 'verification_pending'
    case 'admin_review':
      return 'admin_review'
    case 'needs_corrections':
      return 'needs_corrections'
    default:
      console.warn(
        `[vendor] unknown onboarding_status '${raw}' — defaulting to verification_pending`,
      )
      return 'verification_pending'
  }
}

/**
 * Resolve the current Clerk-authenticated user's vendor record for portal
 * pages to render against.
 *
 * Vendors register individually as businesses on OpusFesta — there is no team
 * to be invited to. A signed-in user without a vendor row has not yet started
 * a vendor application. The `vendor_memberships` table is still used internally
 * (a solo vendor is the `owner` of their own record) so we can layer in staff
 * support later without re-modeling.
 *
 * **Why the admin client (service role) for reads:**
 * The Clerk-authed Supabase client only works when the Clerk app has a JWT
 * template named `supabase` configured — and many dev environments (including
 * Clerk's keyless mode) don't have that out of the box. Without it the JWT's
 * `sub` claim never reaches PostgREST, so every RLS-bound query reads as
 * unauthenticated, and getCurrentVendor() returns `no-application` even for
 * a vendor that just submitted. We bypass that fragility by reading via the
 * service-role admin client and applying our own `WHERE user_id = ?` filter
 * — `userId` comes from `auth()`, which the Clerk middleware has already
 * verified, so the trust boundary is the same.
 *
 * Returns a discriminated state:
 *   - `live`: vendor approved and active — render the dashboard
 *   - `pending-approval`: vendor exists but not yet active — /verify shows
 *     which verification gate they're at (application / docs / agreement /
 *     admin review / corrections needed)
 *   - `suspended`: admin disabled the vendor — locked-out screen
 *   - `no-application`: signed-in user with no vendor record yet — apply CTA
 *   - `no-env`: Supabase env vars missing (dev-only fallback)
 *
 * Throws on any unexpected Supabase error so the portal `error.tsx` boundary
 * can render an actionable fallback instead of silent mock data.
 */
export async function getCurrentVendor(): Promise<CurrentVendorState> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return { kind: 'no-env' }
  }

  const { userId } = await auth()
  if (!userId) {
    console.warn('[vendor] getCurrentVendor: no Clerk userId — auth() empty')
    // Clerk middleware should have already redirected unauthenticated users
    // to /sign-in for any non-public route; reaching here means somebody is
    // calling getCurrentVendor() from a public route. Treat as 'no
    // application' so /pending shows the apply CTA rather than crashing.
    return { kind: 'no-application' }
  }

  const admin = createSupabaseAdminClient()

  // 1) Resolve the Supabase users.id for this Clerk userId. The submit action
  //    auto-provisions this row, so its absence means the vendor never
  //    completed application submission.
  const userLookup = await admin
    .from('users')
    .select('id')
    .eq('clerk_id', userId)
    .maybeSingle<{ id: string }>()

  if (userLookup.error) {
    if (userLookup.error.code === 'PGRST205') {
      console.warn(
        `[vendor] ${userLookup.error.code} — public.users not in schema cache. Run NOTIFY pgrst, 'reload schema' on your Supabase project. Falling back to no-env.`,
      )
      return { kind: 'no-env' }
    }
    throw new Error(
      `[vendor] users lookup failed: ${userLookup.error.code} ${userLookup.error.message}`,
    )
  }

  if (!userLookup.data) {
    const fallbackState = await resolveVendorByVerifiedEmail(admin, userId, null)
    if (fallbackState) return fallbackState

    console.warn(
      `[vendor] no public.users row for clerk_id=${userId} — submit() never ran for this Clerk user, or the upsert failed. Returning no-application.`,
    )
    return { kind: 'no-application' }
  }
  const supabaseUserId = userLookup.data.id

  let row: MembershipRow | null
  try {
    row = await loadActiveMembership(admin, supabaseUserId)
  } catch (err) {
    if (err instanceof Error && err.message === 'vendor_memberships_schema_cache') {
      return { kind: 'no-env' }
    }
    throw err
  }

  if (!row) {
    const fallbackState = await resolveVendorByVerifiedEmail(
      admin,
      userId,
      supabaseUserId,
    )
    if (fallbackState) return fallbackState

    console.warn(
      `[vendor] no active vendor_memberships for users.id=${supabaseUserId} (clerk_id=${userId}). The vendor row may not have been inserted, or the ensure_vendor_owner_membership trigger didn't fire. Returning no-application.`,
    )
    return { kind: 'no-application' }
  }

  return stateFromMembership(row, supabaseUserId) ?? { kind: 'no-application' }
}
