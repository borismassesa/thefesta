'use server'

import { randomBytes } from 'node:crypto'
import { auth, currentUser } from '@clerk/nextjs/server'
import {
  createSupabaseAdminClient,
  createClerkSupabaseServerClient,
} from '@/lib/supabase'
import { notifyOnVendorSubmit } from '@/lib/email/notify-on-submit'
import { findCategory, displayCategoryLabel } from './categories'
import { LANGUAGES } from './languages'
import { PERSONALITY_OPTIONS } from './personality'
import { CANCELLATION_OPTIONS, RESCHEDULE_OPTIONS } from './policies'
import { LIPA_NAMBA_NETWORKS, PAYOUT_OPTIONS } from './payouts'
import { SERVICE_MARKETS, TZ_REGIONS } from './regions'
import { getServicesForCategory } from './services'
import { getStylesForCategory } from './styles'
import { sellsProducts } from './verticals'
import { type OnboardingDraft } from './draft'
import {
  hasCompletePayout,
  isPayoutEntryComplete,
  type PayoutMethod,
} from './payout'

export type SubmitApplicationResult =
  | { ok: true; vendorId: string }
  | { ok: false; error: string; reason: 'unauth' | 'incomplete' | 'unknown' }

// Last-resort map from onboarding category id → `vendors.category` value, used
// only when the `vendor_categories` table can't be read at submit time.
//
// The table IS the source of truth (vendors.category is a text column with a
// foreign key to vendor_categories.db_value — see migration 20260611000002), so
// `resolveCategory` below looks the value up there first. This map is
// service-only and deliberately not extended: every category added since
// (product shops, attire, ushers, bridal assistance) exists only in the table,
// and hardcoding new ones here is exactly how they went missing before.
const CATEGORY_TO_DB: Record<string, string> = {
  venue: 'Venues',
  caterer: 'Caterers',
  photographer: 'Photographers',
  videographer: 'Videographers',
  cakes: 'Cake & Desserts',
  florist: 'Florists',
  planner: 'Wedding Planners',
  musician: 'DJs & Music',
  officiant: 'Officiants',
  beauty: 'Beauty & Makeup',
  extras: 'Decorators',
  other: 'Other',
}

// Maps the onboarding payout-method tag to the v_b-lite enum.
const PAYOUT_METHOD_TO_DB: Record<
  NonNullable<PayoutMethod>,
  'mpesa' | 'airtel' | 'tigo' | 'lipa_namba' | 'bank' | null
> = {
  mpesa: 'mpesa',
  'airtel-money': 'airtel',
  tigopesa: 'tigo',
  halopesa: null, // No 'halo' enum value yet — falls back to lipa_namba below
  'lipa-namba': 'lipa_namba',
  bank: 'bank',
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function buildLocation(draft: OnboardingDraft) {
  return {
    // Tanzania administrative address.
    houseNumber: draft.houseNumber || null,
    street: draft.street || null,
    ward: draft.ward || null,
    district: draft.district || null,
    region: draft.region || null,
    landmark: draft.landmark || null,
    postalCode: draft.postalCode || null,
    // `city` is kept populated (= District) for backward compatibility: the
    // public marketplace (cards, map, search) and the admin vendor list still
    // read `location.city` as the locality label.
    city: draft.district || null,
    country: 'TZ',
    serviceMarkets: draft.serviceMarkets,
    homeMarket: draft.homeMarket,
  }
}

function buildContactInfo(draft: OnboardingDraft) {
  return {
    phone: draft.phone || null,
    email: draft.email || null,
    whatsapp: draft.whatsapp || null,
  }
}

function buildSocialLinks(draft: OnboardingDraft) {
  return {
    website: draft.socials.website || null,
    instagram: draft.socials.instagram || null,
    facebook: draft.socials.facebook || null,
    tiktok: draft.socials.tiktok || null,
    whatsapp: draft.socials.whatsapp || null,
  }
}

function buildApplicationSnapshot(draft: OnboardingDraft) {
  // Strip session-only blob URLs from team avatars before persisting — those
  // URLs only resolve in the vendor's own browser and would render as
  // 404/broken in admin. Counts and other fields are preserved verbatim so
  // admin can see exactly what was answered.
  const team = draft.team.map(({ avatarUrl: _avatarUrl, ...member }) => member)
  return {
    ...draft,
    team,
    // Resolved labels alongside raw IDs so admin review renders human-friendly
    // values without needing to import the vendor-portal lookup tables.
    labels: buildSnapshotLabels(draft),
    submittedAt: new Date().toISOString(),
  }
}

function buildSnapshotLabels(draft: OnboardingDraft) {
  const styles = draft.categoryId ? getStylesForCategory(draft.categoryId) : []
  const services = draft.categoryId ? getServicesForCategory(draft.categoryId) : []
  const homeMarket = SERVICE_MARKETS.find((m) => m.id === draft.homeMarket)
  return {
    category: displayCategoryLabel(draft.categoryId, draft.customCategoryLabel),
    region: TZ_REGIONS.find((r) => r.code === draft.region)?.name ?? null,
    homeMarket: homeMarket?.name ?? null,
    serviceMarkets: draft.serviceMarkets
      .map((id) => SERVICE_MARKETS.find((m) => m.id === id)?.name)
      .filter((x): x is string => Boolean(x)),
    languages: draft.languages
      .map((id) => LANGUAGES.find((l) => l.id === id)?.label)
      .filter((x): x is string => Boolean(x)),
    style: styles.find((s) => s.id === draft.style)?.label ?? null,
    personality:
      PERSONALITY_OPTIONS.find((p) => p.id === draft.personality)?.label ?? null,
    specialServices: draft.specialServices
      .map((id) => services.find((s) => s.id === id)?.label)
      .filter((x): x is string => Boolean(x)),
    cancellationLevel:
      CANCELLATION_OPTIONS.find((o) => o.id === draft.cancellationLevel)?.label ??
      null,
    reschedulePolicy:
      RESCHEDULE_OPTIONS.find((o) => o.id === draft.reschedulePolicy)?.label ??
      null,
    // Resolved, human-friendly view of every payout method for admin review.
    payoutMethods: draft.payoutMethods.map((p) => ({
      method: PAYOUT_OPTIONS.find((o) => o.id === p.method)?.label ?? p.method,
      network: p.network
        ? LIPA_NAMBA_NETWORKS.find((n) => n.id === p.network)?.label ?? p.network
        : null,
      bankName: p.bankName || null,
      number: p.number,
      accountName: p.accountName,
      primary: p.primary,
    })),
  }
}

function buildServicesOffered(draft: OnboardingDraft): string[] {
  // vendors.services_offered is a Postgres text[] of plain title strings — the
  // shape the live column and the public marketplace (opus_website) use.
  // Migration 025 meant to convert it to a jsonb array of {title, description}
  // objects, but that DDL never took effect on the live database; writing
  // objects therefore got stringified into text cells ("double-encoding").
  // Resolve preset ids to their human labels so they round-trip in the
  // storefront editor, then append custom labels as-is.
  const presets = draft.categoryId ? getServicesForCategory(draft.categoryId) : []
  const labelById = new Map(presets.map((p) => [p.id, p.label]))
  return [
    ...draft.specialServices.map((id) => labelById.get(id) ?? id),
    ...draft.customServices.map((label) => label.trim()).filter(Boolean),
  ]
}

function validateDraft(draft: OnboardingDraft): string | null {
  if (!draft.vertical) return 'Pick what you offer before submitting.'
  if (!draft.categoryId) return 'Pick a category before submitting.'
  if (!draft.vowsAccepted) return 'Vendor Vows must be accepted before submitting.'
  if (!draft.businessName.trim()) return 'Add a business name before submitting.'
  if (!draft.region) return 'Add a region before submitting.'
  if (!draft.district.trim()) return 'Add a district before submitting.'
  if (!draft.phone.trim() && !draft.email.trim()) {
    return 'Add at least one contact method (phone or email).'
  }
  // Packages and cancellation policies price booked TIME. Product vendors sell
  // goods with a per-item price and are never asked these steps — requiring
  // them here would make a shop application unsubmittable.
  if (!sellsProducts(draft.vertical)) {
    if (draft.packages.length === 0) return 'Add at least one package.'
    if (!draft.cancellationLevel) return 'Pick a cancellation policy.'
  }
  if (!hasCompletePayout(draft)) {
    return 'Add at least one complete payout method.'
  }
  if (draft.payoutMethods.some((p) => p.method && !isPayoutEntryComplete(p))) {
    return 'Finish or remove the incomplete payout method.'
  }
  if (!draft.payoutMethods.some((p) => p.primary)) {
    return 'Mark one payout method as primary.'
  }
  return null
}

/**
 * Submit a completed onboarding draft and provision the vendor record.
 *
 * 1. Ensures a `public.users` row exists for the current Clerk user (so the
 *    `requesting_user_id()` function in RLS can resolve them — no row means
 *    any RLS-bound query later returns zero results).
 * 2. Inserts (or updates, if the user already started a vendor row) the
 *    `vendors` record with every draft field mapped to its DB column.
 * 3. The `ensure_vendor_owner_membership_trigger` (migration 056) auto-creates
 *    the matching `vendor_memberships` row with role=owner.
 * 4. Persists the chosen payout method to `vendor_payout_methods` so the
 *    verification pipeline can flag it as `done`.
 * 5. Records the Vendor Vows acceptance into `vendor_agreements` as the v1
 *    e-signature for this vendor (a richer e-sign UI lives at /verify in PR
 *    follow-ups; this gives admins a row to point at today).
 * 6. Sets `onboarding_status = 'verification_pending'` so the portal layout
 *    sends them to /pending → /verify for the document upload step.
 *
 * Uses the service-role client because (a) `public.users` write is not
 * permitted to the Clerk-authed client, and (b) the `vendors` RLS policy
 * requires `requesting_user_id() = user_id`, which is only resolvable after
 * the user row exists. Clerk's `userId` is the source of trust here.
 */
export async function submitApplication(
  draft: OnboardingDraft,
): Promise<SubmitApplicationResult> {
  // Clerk's auth()/currentUser() and the Supabase admin client can THROW
  // (env misconfig, Clerk outage, Server Action origin rejection). Catch them
  // so this action always RESOLVES with a result object — a rejected promise
  // would otherwise hang the client's "Submitting…" button.
  let userId: string | null
  try {
    ;({ userId } = await auth())
  } catch (err) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[submit] auth check failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  if (!userId) {
    return { ok: false, reason: 'unauth', error: 'Sign in before submitting.' }
  }

  const validation = validateDraft(draft)
  if (validation) {
    return { ok: false, reason: 'incomplete', error: validation }
  }

  let clerkUser
  try {
    clerkUser = await currentUser()
  } catch (err) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[submit] account lookup failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  const email =
    clerkUser?.emailAddresses?.[0]?.emailAddress ?? draft.email ?? null
  const fullName =
    [draft.firstName, draft.lastName].filter(Boolean).join(' ').trim() ||
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(' ').trim() ||
    null

  if (!email) {
    return {
      ok: false,
      reason: 'incomplete',
      error: 'No email on file — set one in your account before submitting.',
    }
  }

  let admin
  try {
    admin = createSupabaseAdminClient()
  } catch (err) {
    // Thrown synchronously when NEXT_PUBLIC_SUPABASE_URL or
    // SUPABASE_SERVICE_ROLE_KEY is missing in the deployment env.
    return {
      ok: false,
      reason: 'unknown',
      error: `[submit] database unavailable — check Supabase env config: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  // 1) Provision public.users row keyed on clerk_id, so RLS can resolve it.
  let upsertUser = await admin
    .from('users')
    .upsert(
      {
        clerk_id: userId,
        email,
        name: fullName,
        // The legacy `password` column is NOT NULL but unused under Clerk;
        // store an opaque marker so the row inserts without leaking secrets.
        password: 'clerk-managed',
      },
      { onConflict: 'clerk_id' },
    )
    .select('id')
    .single<{ id: string }>()

  // A legacy row may already exist with the same email but no/different clerk_id
  // (e.g. pre-Clerk signup). In that case the INSERT conflicts on users_email_key
  // (23505). Recover by updating that existing row to claim the current clerk_id.
  if (upsertUser.error?.code === '23505') {
    upsertUser = await admin
      .from('users')
      .update({ clerk_id: userId, name: fullName })
      .eq('email', email)
      .select('id')
      .single<{ id: string }>()
  }

  if (upsertUser.error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[submit] users upsert failed: ${upsertUser.error.code} ${upsertUser.error.message}`,
    }
  }
  const supabaseUserId = upsertUser.data.id

  // 2) Build the vendors row payload.
  //
  // Resolve the category from the table so any category an admin adds works
  // without a code change, and cross-check its vertical: the two are written to
  // the same row and a mismatch would publish the vendor on the wrong surface.
  const categoryRow = await admin
    .from('vendor_categories')
    .select('db_value, vertical')
    .eq('slug', draft.categoryId!)
    .maybeSingle<{ db_value: string; vertical: string }>()

  const dbCategory = categoryRow.data?.db_value ?? CATEGORY_TO_DB[draft.categoryId!]
  if (!dbCategory) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[submit] no DB category mapping for '${draft.categoryId}'`,
    }
  }
  // The category's own vertical wins over the draft's — the draft is
  // localStorage a vendor could have edited, the table is authoritative.
  const dbVertical = categoryRow.data?.vertical ?? draft.vertical ?? 'service'

  const baseSlug = slugify(draft.businessName) || 'vendor'

  // Re-use an existing draft vendor row if the user already has one; otherwise
  // create a fresh row. We look up by user_id since RLS won't filter against
  // our admin client and slug collisions are common across re-attempts.
  const existing = await admin
    .from('vendors')
    .select('id, slug, onboarding_status')
    .eq('user_id', supabaseUserId)
    .limit(1)
    .maybeSingle<{ id: string; slug: string; onboarding_status: string | null }>()

  if (existing.error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[submit] vendors lookup failed: ${existing.error.code} ${existing.error.message}`,
    }
  }

  let slug = existing.data?.slug ?? baseSlug
  if (!existing.data) {
    // Resolve slug collisions by appending a short random suffix on retry.
    const slugCheck = await admin
      .from('vendors')
      .select('id', { count: 'exact', head: true })
      .eq('slug', baseSlug)
    if (slugCheck.error) {
      return {
        ok: false,
        reason: 'unknown',
        error: `[submit] slug check failed: ${slugCheck.error.code} ${slugCheck.error.message}`,
      }
    }
    if ((slugCheck.count ?? 0) > 0) {
      slug = `${baseSlug}-${randomBytes(3).toString('hex')}`
    }
  }

  // First submission = no vendor row yet, or one that's still a pre-submit
  // draft. Only then do we advance the lifecycle to `verification_pending` and
  // stamp `onboarding_started_at`. On a later EDIT (vendor is already
  // verification_pending / admin_review / needs_corrections / active /
  // suspended) we must NOT touch the status or the started-at clock — otherwise
  // editing a detail silently knocks an advanced vendor back to
  // verification_pending and resets their review SLA.
  const currentStatus =
    existing.data?.onboarding_status ?? 'application_in_progress'
  const isFirstSubmission = !existing.data || currentStatus === 'application_in_progress'

  // Decide what (if anything) this submit does to the lifecycle:
  //  • First submission → advance to `verification_pending` + stamp the clock.
  //  • Re-submit after `needs_corrections` → push back into `admin_review` so
  //    the admin re-checks the fixes (the vendor has "answered" the request).
  //  • Any other edit (verification_pending / admin_review / active / …) →
  //    leave the status and SLA clock untouched.
  const lifecycleFields: Record<string, unknown> = isFirstSubmission
    ? {
        onboarding_status: 'verification_pending',
        onboarding_started_at: new Date().toISOString(),
      }
    : currentStatus === 'needs_corrections'
      ? { onboarding_status: 'admin_review' }
      : {}

  // Core columns guaranteed to exist after migration 001 + 056 — anything
  // beyond this set is treated as "best effort" so missing migrations or
  // stale PostgREST schema caches don't block submit.
  const corePayload = {
    slug,
    user_id: supabaseUserId,
    business_name: draft.businessName.trim(),
    category: dbCategory,
    vertical: dbVertical,
    bio: draft.bio || null,
    description: draft.description?.trim() || null,
    location: buildLocation(draft),
    contact_info: buildContactInfo(draft),
    // Logo / profile picture captured on the onboarding name step. Already a
    // public URL (uploaded during onboarding); persisted so it shows on the
    // storefront + admin.
    logo: draft.logo?.trim() || null,
    ...lifecycleFields,
  }

  // Optional columns added by later migrations (021 packages, 025 services_offered
  // → JSONB, etc.). We attempt to write them after the core insert succeeds,
  // and tolerate PGRST204 ("column not in schema cache") by skipping the
  // missing column with a console warning. This keeps submit working even
  // when the project hasn't applied every historical migration.
  const optionalPayload: Record<string, unknown> = {
    social_links: buildSocialLinks(draft),
    services_offered: buildServicesOffered(draft),
    packages: draft.packages,
    years_in_business: draft.yearsInBusiness
      ? Number.parseInt(draft.yearsInBusiness, 10) || null
      : null,
    // Dedicated columns the admin storefront editors and public storefront
    // read directly. Without these the admin UI shows blank for fields the
    // vendor actually answered during onboarding.
    style: draft.style,
    personality: draft.personality,
    languages: draft.languages,
    cancellation_level: draft.cancellationLevel,
    reschedule_policy: draft.reschedulePolicy,
    deposit_percent: draft.depositPercent
      ? Number.parseInt(draft.depositPercent, 10) || null
      : null,
    // Service area — the wizard collects these (Markets step), but they were
    // previously written ONLY into the `location` JSONB. The admin review page
    // and the storefront editors read the dedicated `home_market` /
    // `service_markets` columns, so without this write the vendor's service
    // area showed up blank in admin and required a manual storefront re-save
    // before it reached the public page via the columns.
    home_market: draft.homeMarket,
    service_markets: draft.serviceMarkets,
    // Pricing extras + availability (migration 20260624000001). Previously
    // these onboarding answers lived only in `application_snapshot`, so neither
    // admin nor the public detail page could read them.
    starting_price: draft.startingPrice || null,
    custom_quotes: draft.customQuotes,
    availability: draft.availability,
    // Full draft kept as a JSONB blob so admin review can audit every answered
    // field (resolved labels included), even ones we haven't broken out into
    // columns yet (FAQs, team avatars, etc.).
    application_snapshot: buildApplicationSnapshot(draft),
  }

  let vendorId: string
  if (existing.data) {
    const update = await admin
      .from('vendors')
      .update(corePayload)
      .eq('id', existing.data.id)
      .select('id')
      .single<{ id: string }>()
    if (update.error) {
      return {
        ok: false,
        reason: 'unknown',
        error: `[submit] vendors update failed: ${update.error.code} ${update.error.message}`,
      }
    }
    vendorId = update.data.id
  } else {
    const insert = await admin
      .from('vendors')
      .insert(corePayload)
      .select('id')
      .single<{ id: string }>()
    if (insert.error) {
      return {
        ok: false,
        reason: 'unknown',
        error: `[submit] vendors insert failed: ${insert.error.code} ${insert.error.message}`,
      }
    }
    vendorId = insert.data.id
  }

  // Belt-and-braces: explicitly upsert the owner vendor_memberships row.
  //
  // Migration 056 installs an `ensure_vendor_owner_membership_trigger` on
  // INSERT-of-vendors that's *supposed* to do this for us, but in practice
  // we've seen environments where the trigger isn't installed (or silently
  // fails) and the vendor ends up without an active membership — which makes
  // getCurrentVendor() resolve to `no-application` even though their vendor
  // row exists. Doing the upsert here explicitly removes the dependency on
  // the trigger; if the trigger DOES fire, ON CONFLICT (vendor_id, user_id)
  // is a no-op.
  const membership = await admin
    .from('vendor_memberships')
    .upsert(
      {
        vendor_id: vendorId,
        user_id: supabaseUserId,
        role: 'owner' as const,
        status: 'active' as const,
      },
      { onConflict: 'vendor_id,user_id' },
    )
    .select('id')
    .single<{ id: string }>()

  if (membership.error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[submit] vendor_memberships upsert failed: ${membership.error.code} ${membership.error.message}`,
    }
  }
  console.log(
    `[submit] vendor=${vendorId} user=${supabaseUserId} membership=${membership.data.id} owner=active`,
  )

  // Best-effort: persist each optional column. Skip any that the schema
  // doesn't know about so submit doesn't fail on a missing migration.
  await persistOptionalVendorColumns(vendorId, optionalPayload)

  // 3) Persist payout methods. A vendor can register several; exactly one is
  //    marked primary (is_default). We only (re)write them while the vendor is
  //    still pre-review — once admin has started verifying (admin_review and
  //    beyond), the admin owns these rows (verify / mark-failed / edit), so a
  //    vendor edit must NOT wipe that work. In the pre-review states we replace
  //    the whole set, which is safe because nothing's been verified yet.
  const payoutEditable =
    isFirstSubmission ||
    currentStatus === 'verification_pending' ||
    currentStatus === 'needs_corrections'

  if (payoutEditable) {
    const payoutRows = draft.payoutMethods
      .filter(isPayoutEntryComplete)
      .map((entry) => {
        // Fallback: halopesa lands in the lipa_namba bucket since there's no
        // dedicated enum value yet; admin can correct during review.
        const methodDb =
          (entry.method && PAYOUT_METHOD_TO_DB[entry.method]) || 'lipa_namba'
        return {
          vendor_id: vendorId,
          method_type: methodDb,
          provider:
            entry.method === 'bank'
              ? entry.bankName || null
              : entry.method === 'lipa-namba'
                ? entry.network || null
                : null,
          account_number: entry.number.trim(),
          account_holder_name: entry.accountName.trim(),
          status: 'pending' as const,
          is_default: entry.primary,
        }
      })

    // Guarantee exactly one default to satisfy the partial unique index
    // (`WHERE is_default`) and so payouts have a clear destination.
    if (payoutRows.length > 0 && !payoutRows.some((r) => r.is_default)) {
      payoutRows[0].is_default = true
    }

    // Replace the whole set: delete the existing pre-review rows, then insert
    // the current draft's methods. Cleaner than per-row reconciliation and
    // safe before any admin verification exists.
    const del = await admin
      .from('vendor_payout_methods')
      .delete()
      .eq('vendor_id', vendorId)
    if (del.error) {
      return {
        ok: false,
        reason: 'unknown',
        error: `[submit] payout clear failed: ${del.error.code} ${del.error.message}`,
      }
    }
    if (payoutRows.length > 0) {
      const ins = await admin.from('vendor_payout_methods').insert(payoutRows)
      if (ins.error) {
        return {
          ok: false,
          reason: 'unknown',
          error: `[submit] payout write failed: ${ins.error.code} ${ins.error.message}`,
        }
      }
    }
  }

  // 4a) Persist vendor category request when the vendor chose "other".
  //     Best-effort — upserts on vendor_id so re-submits update the label
  //     rather than duplicate. Never blocks the submit.
  if (draft.categoryId === 'other' && draft.customCategoryLabel.trim()) {
    const label = draft.customCategoryLabel.trim().slice(0, 80)
    const { error: reqErr } = await admin
      .from('vendor_category_requests')
      .upsert(
        { vendor_id: vendorId, requested_label: label, status: 'pending' },
        { onConflict: 'vendor_id' },
      )
    if (reqErr) {
      console.warn(
        `[submit] vendor_category_requests upsert failed for vendor=${vendorId}: ${reqErr.code} ${reqErr.message}`,
      )
    }
  }

  // 4) Vendor agreement: NOT recorded here. Vendor Vows is a values pledge —
  // a separate, optional commitment. The legally-binding vendor agreement is
  // an explicit e-signature step on /verify *after* the document uploads.
  // The auto-transition to admin_review checks for the agreement row's
  // presence, so the vendor must complete that step before review begins.

  // 5) Best-effort transactional emails: ping admins about the new
  //    application and receipt the vendor. Email failures are logged but
  //    never block the submit — the persisted vendor row + payout method
  //    above are the source of truth.
  //
  //    ONLY fire on events that actually need review: a first submission, or a
  //    re-submit after `needs_corrections` (the vendor answered the review
  //    request). A plain edit of an already-submitted vendor
  //    (verification_pending / admin_review / active / suspended) must NOT
  //    re-notify — otherwise every "Save changes" spams admins with a
  //    duplicate "new application" email and re-receipts the vendor.
  const shouldNotifySubmission =
    isFirstSubmission || currentStatus === 'needs_corrections'
  if (shouldNotifySubmission) {
    try {
      const region =
        TZ_REGIONS.find((r) => r.code === draft.region)?.name ?? draft.region ?? null
      // The set_vendor_code_trigger populated vendor_code on insert; on
      // re-submit it's already there. Read it back so the receipt + admin
      // notification can quote the human-readable application reference.
      const codeRow = await admin
        .from('vendors')
        .select('vendor_code')
        .eq('id', vendorId)
        .maybeSingle<{ vendor_code: string | null }>()
      await notifyOnVendorSubmit({
        vendorId,
        vendorCode: codeRow.data?.vendor_code ?? null,
        businessName: draft.businessName.trim(),
        category: displayCategoryLabel(draft.categoryId, draft.customCategoryLabel),
        customCategoryLabel: draft.categoryId === 'other' && draft.customCategoryLabel.trim()
          ? draft.customCategoryLabel.trim()
          : null,
        region,
        city: draft.district.trim() || null,
        vendorContactEmail: draft.email?.trim() || email,
        vendorContactPhone: draft.phone?.trim() || null,
        submittedAt: new Date().toISOString(),
      })
    } catch (err) {
      console.warn(
        `[submit] notifyOnVendorSubmit threw for vendor=${vendorId}:`,
        err instanceof Error ? err.message : err,
      )
    }
  } else {
    console.log(
      `[submit] vendor=${vendorId} edit (status=${currentStatus}) — skipping submit notifications`,
    )
  }

  return { ok: true, vendorId }
}

/**
 * Best-effort write of vendor columns added by later migrations. Each column
 * is attempted in isolation; if PostgREST returns PGRST204 ("column not in
 * schema cache") — meaning the project hasn't applied that migration yet, or
 * the schema cache is stale — we log a warning and move on instead of
 * failing the whole submit. Anything else (RLS, constraint violation) bubbles
 * up via the warning so a real bug is visible in logs.
 */
async function persistOptionalVendorColumns(
  vendorId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const admin = createSupabaseAdminClient()
  for (const [column, value] of Object.entries(payload)) {
    if (value === undefined) continue
    const { error } = await admin
      .from('vendors')
      .update({ [column]: value })
      .eq('id', vendorId)
    if (!error) continue
    if (error.code === 'PGRST204') {
      console.warn(
        `[submit] vendors.${column} not in schema cache — skipping. Apply the relevant migration or run NOTIFY pgrst, 'reload schema'; in your Supabase project.`,
      )
      continue
    }
    console.warn(
      `[submit] vendors.${column} update failed: ${error.code} ${error.message}`,
    )
  }
}

/**
 * Force-refresh the caller's vendor read. Used after submit so the next page
 * load sees the new onboarding_status without a hard reload race.
 */
export async function refreshCurrentVendor(): Promise<void> {
  // Touching the supabase client purges any per-request RPC caches the route
  // segment cache may have warmed against the old status.
  await createClerkSupabaseServerClient()
}
