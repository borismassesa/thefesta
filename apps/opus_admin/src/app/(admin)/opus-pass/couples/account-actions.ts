'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getCallerEmail, requirePermission } from '@/lib/admin-auth'
import { recordAuditEvent } from '@/lib/audit-log'
import {
  createPlatformClerkLogin,
  deletePlatformClerkLogin,
  platformClerkSecret,
} from '@/lib/platform-clerk'
import { COUPLE_STAFF_TOKEN_TTL_MINUTES, signCoupleStaffToken } from '@/lib/couple-staff-session'
import { isCoupleSideLogin } from './queries'

// Account lifecycle for OpusPass couples: create, edit, provision a login,
// open their dashboard, delete. The narrower per-couple actions (linking
// orders, credits, notes) live in ./[userId]/actions.ts.
//
// Every write goes through the service-role client with no owner filter —
// the same cross-couple staff pattern as ./queries.ts — and is gated on a
// permission, not on ownership.

/** `warning` means the write landed but something adjacent did not, e.g. the
 *  account saved while its Clerk login could not be created. Callers surface it
 *  instead of treating the whole action as a plain success. */
export type Result<T = object> =
  | ({ ok: true; warning?: string } & T)
  | { ok: false; error: string }

const BUDGET_RANGES = [
  'under_5m',
  '5m_15m',
  '15m_30m',
  '30m_50m',
  'over_50m',
  'undisclosed',
] as const

export interface CoupleAccountInput {
  partner1Name: string
  partner2Name: string
  email: string
  phone: string
  whatsappPhone: string
  city: string
  region: string
  weddingDate: string
  dateUndecided: boolean
  budgetRange: string
  guestCount: string
  /** Create a platform login so they can sign in. Create form only. */
  createLogin?: boolean
}

interface CleanInput {
  partner1Name: string
  partner2Name: string | null
  email: string
  phone: string | null
  whatsappPhone: string | null
  city: string | null
  region: string | null
  weddingDate: string | null
  dateUndecided: boolean
  budgetRange: string | null
  guestCount: number | null
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function isEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
}

/** Shared validation for create and edit. Rejects rather than silently
 *  coercing, so a typo'd wedding date never lands in the DB as null. */
function cleanInput(input: CoupleAccountInput): { ok: true; value: CleanInput } | { ok: false; error: string } {
  const partner1Name = input.partner1Name?.trim() ?? ''
  if (!partner1Name) return { ok: false, error: 'The first partner’s name is required.' }

  const email = input.email?.trim().toLowerCase() ?? ''
  if (!email || !isEmail(email)) return { ok: false, error: 'A valid email address is required.' }

  const weddingDate = blankToNull(input.weddingDate)
  if (weddingDate && !/^\d{4}-\d{2}-\d{2}$/.test(weddingDate)) {
    return { ok: false, error: 'The wedding date must be a calendar date.' }
  }

  const budgetRange = blankToNull(input.budgetRange)
  if (budgetRange && !BUDGET_RANGES.includes(budgetRange as (typeof BUDGET_RANGES)[number])) {
    return { ok: false, error: 'Pick a budget range from the list.' }
  }

  const rawGuests = blankToNull(input.guestCount)
  let guestCount: number | null = null
  if (rawGuests !== null) {
    const parsed = Number(rawGuests)
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 5000) {
      return { ok: false, error: 'Expected guests must be a whole number up to 5000.' }
    }
    guestCount = parsed
  }

  return {
    ok: true,
    value: {
      partner1Name,
      partner2Name: blankToNull(input.partner2Name),
      email,
      phone: blankToNull(input.phone),
      whatsappPhone: blankToNull(input.whatsappPhone),
      city: blankToNull(input.city),
      region: blankToNull(input.region),
      weddingDate,
      // A set date and "undecided" are contradictory; the date wins because
      // it is the more specific statement.
      dateUndecided: weddingDate ? false : Boolean(input.dateUndecided),
      budgetRange,
      guestCount,
    },
  }
}

function coupleNameOf(value: CleanInput): string {
  return [value.partner1Name, value.partner2Name].filter(Boolean).join(' & ')
}

function revalidateCouples(userId?: string): void {
  revalidatePath('/opus-pass/couples')
  if (userId) revalidatePath(`/opus-pass/couples/${userId}`)
}

// ---------------------------------------------------------------------- create

/**
 * Create a couple account on the couple's behalf — the walk-in / phone-in
 * case, where staff have the details but the couple has never signed up.
 *
 * Writes the same two rows the onboarding wizard writes (`users` +
 * `couple_profiles`) so the account is indistinguishable from a self-serve
 * one, and optionally provisions a platform Clerk login so the couple can
 * actually sign in and find their dashboard already set up.
 *
 * The login is created AFTER the DB rows, on purpose: a Clerk hiccup then
 * leaves a usable account plus a warning, instead of an orphaned login with
 * no account behind it.
 */
export async function createCoupleAccount(
  input: CoupleAccountInput,
): Promise<Result<{ userId: string }>> {
  await requirePermission('opuspass.couples.write')

  const cleaned = cleanInput(input)
  if (!cleaned.ok) return cleaned
  const value = cleaned.value
  const supabase = createSupabaseAdminClient()

  // `users.email` is UNIQUE, so a collision would surface as a raw 23505.
  // Check first, and decide by what the login already HAS rather than by what
  // its legacy `role` says.
  //
  // A login that already owns a vendor storefront is NOT a reason to refuse: a
  // couple workspace and a vendor storefront are separate workspaces on one
  // identity (migration 20260730030000), and the same human is often both. We
  // adopt the existing login and give it the couple side it is missing. Only an
  // account that is already a couple is a genuine duplicate.
  const { data: existing, error: existingErr } = await supabase
    .from('users')
    .select('id')
    .eq('email', value.email)
    .maybeSingle<{ id: string }>()
  if (existingErr) return { ok: false, error: existingErr.message }

  let adoptedLogin = false
  if (existing) {
    const { data: workspace, error: workspaceErr } = await supabase
      .from('couple_accounts')
      .select('user_id')
      .eq('user_id', existing.id)
      .maybeSingle<{ user_id: string }>()
    if (workspaceErr) return { ok: false, error: workspaceErr.message }
    if (workspace) {
      return {
        ok: false,
        error: 'An account already uses that email. Open it from the list and edit it instead.',
      }
    }
    adoptedLogin = true
  }

  const now = new Date().toISOString()
  const coupleName = coupleNameOf(value)

  let userId: string
  if (existing) {
    userId = existing.id
  } else {
    const { data: user, error: userErr } = await supabase
      .from('users')
      .insert({
        email: value.email,
        name: coupleName,
        phone: value.phone,
        // Legacy NOT NULL column, unused under Clerk. Same marker the vendor
        // create flow writes (see operations/vendors/actions.ts).
        password: 'admin-created-placeholder',
        // `role` is deliberately not written. It is legacy and only 'admin' is
        // still meaningful; the couple_profiles insert below is what makes this
        // a couple, via the ensure_couple_account trigger.
        // Admin filled in the profile below, so the onboarding wizard has
        // nothing left to ask — matching what the couple would see if they had
        // completed it themselves.
        onboarding_complete: true,
      })
      .select('id')
      .single<{ id: string }>()
    if (userErr) return { ok: false, error: `Could not create the account: ${userErr.message}` }
    userId = user.id
  }

  const { error: profileErr } = await supabase.from('couple_profiles').insert({
    user_id: userId,
    partner1_name: value.partner1Name,
    partner2_name: value.partner2Name,
    wedding_date: value.weddingDate,
    date_undecided: value.dateUndecided,
    city: value.city,
    region: value.region,
    budget_range: value.budgetRange,
    guest_count: value.guestCount,
    whatsapp_phone: value.whatsappPhone,
    onboarding_completed_at: now,
  })
  if (profileErr) {
    // Roll the account back rather than leaving a profile-less shell that
    // shows up in the list as a dormant signup nobody made. An adopted login
    // is left alone: it existed before this action and owns other things.
    if (!adoptedLogin) await supabase.from('users').delete().eq('id', userId)
    return { ok: false, error: `Could not save the couple’s details: ${profileErr.message}` }
  }

  const warnings: string[] = []
  if (adoptedLogin) {
    warnings.push(
      'That email already had a login on the platform, so the couple side was added to it rather than creating a second account.',
    )
  }
  if (input.createLogin) {
    const login = await provisionLogin(userId, value.email, value.partner1Name, value.partner2Name)
    if (!login.ok && login.error) warnings.push(login.error)
  }
  const warning = warnings.length > 0 ? warnings.join(' ') : undefined

  await recordAuditEvent({
    eventType: 'opuspass.couple_created',
    message: `${adoptedLogin ? 'Added a couple workspace to the existing login for' : 'Created couple account'} ${coupleName} <${value.email}>${input.createLogin ? ' with a sign-in login' : ''}`,
    targetResource: `users:${userId}`,
    metadata: {
      user_id: userId,
      email: value.email,
      created_login: Boolean(input.createLogin),
      adopted_existing_login: adoptedLogin,
    },
  })

  revalidateCouples(userId)
  return { ok: true, userId, warning }
}

// ------------------------------------------------------------------ edit / update

/**
 * Update the couple's own details. Touches only the fields the form owns, so
 * everything the couple configured themselves (pledge page, website, invite
 * settings, tokens) is left alone.
 *
 * Changing the email here does NOT move their Clerk login — that is a separate
 * identity in another Clerk instance and only its owner can verify a new
 * address. The action reports that as a warning instead of pretending it moved.
 */
export async function updateCoupleAccount(
  userId: string,
  input: CoupleAccountInput,
): Promise<Result> {
  await requirePermission('opuspass.couples.write')
  if (!userId) return { ok: false, error: 'Missing account.' }

  const cleaned = cleanInput(input)
  if (!cleaned.ok) return cleaned
  const value = cleaned.value
  const supabase = createSupabaseAdminClient()

  const { data: current, error: currentErr } = await supabase
    .from('users')
    .select('id, email, clerk_id, role')
    .eq('id', userId)
    .maybeSingle<{ id: string; email: string | null; clerk_id: string | null; role: string | null }>()
  if (currentErr) return { ok: false, error: currentErr.message }
  if (!current) return { ok: false, error: 'That account no longer exists.' }

  const emailChanged = (current.email ?? '').toLowerCase() !== value.email
  if (emailChanged) {
    const { data: clash, error: clashErr } = await supabase
      .from('users')
      .select('id')
      .eq('email', value.email)
      .neq('id', userId)
      .maybeSingle<{ id: string }>()
    if (clashErr) return { ok: false, error: clashErr.message }
    if (clash) return { ok: false, error: 'Another account already uses that email.' }
  }

  const coupleName = coupleNameOf(value)
  const { error: userErr } = await supabase
    .from('users')
    .update({
      name: coupleName,
      email: value.email,
      phone: value.phone,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
  if (userErr) return { ok: false, error: `Could not save the account: ${userErr.message}` }

  // Upsert, not update: accounts that never finished onboarding have no
  // couple_profiles row, and this form is exactly how staff fill one in.
  const { error: profileErr } = await supabase.from('couple_profiles').upsert(
    {
      user_id: userId,
      partner1_name: value.partner1Name,
      partner2_name: value.partner2Name,
      wedding_date: value.weddingDate,
      date_undecided: value.dateUndecided,
      city: value.city,
      region: value.region,
      budget_range: value.budgetRange,
      guest_count: value.guestCount,
      whatsapp_phone: value.whatsappPhone,
    },
    { onConflict: 'user_id' },
  )
  if (profileErr) return { ok: false, error: `Could not save the couple’s details: ${profileErr.message}` }

  await recordAuditEvent({
    eventType: 'opuspass.couple_updated',
    message: `Updated couple account ${coupleName} <${value.email}>`,
    targetResource: `users:${userId}`,
    metadata: {
      user_id: userId,
      email: value.email,
      email_changed: emailChanged,
      previous_email: emailChanged ? current.email : undefined,
    },
  })

  revalidateCouples(userId)
  return {
    ok: true,
    warning:
      emailChanged && current.clerk_id
        ? 'Saved. Their sign-in email is unchanged: that lives in Clerk and only they can verify a new address, so they still sign in with the old one.'
        : undefined,
  }
}

// ------------------------------------------------------------------ login access

/** Create the Clerk login and stamp it on the users row. Shared by the create
 *  form's checkbox and the standalone "Give them a login" action. */
async function provisionLogin(
  userId: string,
  email: string,
  partner1Name: string | null,
  partner2Name: string | null,
): Promise<{ ok: true; alreadyExisted: boolean } | { ok: false; error: string }> {
  const login = await createPlatformClerkLogin({
    email,
    firstName: partner1Name,
    lastName: partner2Name,
  })
  if (!login.ok) {
    return {
      ok: false,
      error: `The account is saved, but the sign-in login was not created: ${login.error}`,
    }
  }

  const supabase = createSupabaseAdminClient()
  // Only claim an unlinked row. If something else already linked a Clerk id
  // we must not overwrite it — that would sever a live sign-in.
  const { error } = await supabase
    .from('users')
    .update({ clerk_id: login.clerkId, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .is('clerk_id', null)
  if (error) {
    return {
      ok: false,
      error: `The login exists in Clerk but could not be linked to the account: ${error.message}`,
    }
  }
  return { ok: true, alreadyExisted: login.alreadyExisted }
}

/**
 * Give an existing account a working sign-in. Accounts created by admin (or
 * imported) show as "No sign-in" until this runs: they have a users row but no
 * Clerk identity, so the couple cannot reach their own dashboard.
 */
export async function createCoupleSignIn(userId: string): Promise<Result> {
  await requirePermission('opuspass.couples.write')
  if (!userId) return { ok: false, error: 'Missing account.' }
  if (!platformClerkSecret()) {
    return {
      ok: false,
      error: 'PLATFORM_CLERK_SECRET_KEY is not configured on this environment, so logins cannot be created from here.',
    }
  }

  const supabase = createSupabaseAdminClient()
  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, clerk_id')
    .eq('id', userId)
    .maybeSingle<{ id: string; email: string | null; clerk_id: string | null }>()
  if (error) return { ok: false, error: error.message }
  if (!user) return { ok: false, error: 'That account no longer exists.' }
  if (user.clerk_id) return { ok: false, error: 'This couple can already sign in.' }
  if (!user.email) return { ok: false, error: 'This account has no email, so there is nothing to sign in with.' }

  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('partner1_name, partner2_name')
    .eq('user_id', userId)
    .maybeSingle<{ partner1_name: string | null; partner2_name: string | null }>()

  const login = await provisionLogin(userId, user.email, profile?.partner1_name ?? null, profile?.partner2_name ?? null)
  if (!login.ok) return { ok: false, error: login.error }

  await recordAuditEvent({
    eventType: 'opuspass.couple_login_created',
    message: `Created a sign-in login for ${user.email}${login.alreadyExisted ? ' (linked an existing Clerk user)' : ''}`,
    targetResource: `users:${userId}`,
    metadata: { user_id: userId, email: user.email, already_existed: login.alreadyExisted },
  })

  revalidateCouples(userId)
  return {
    ok: true,
    warning: login.alreadyExisted
      ? 'They already had a login on this email. The account is now linked to it.'
      : 'They can now sign in at OpusPass with this email (a one-time code is sent to it, or they can use Google).',
  }
}

/**
 * Mint a link that drops the caller into this couple's real OpusPass
 * dashboard, acting as them. The token is short-lived and single-purpose; the
 * receiving app verifies it and shows a permanent "staff session" banner
 * (apps/opus_pass/src/lib/dashboard/staff-session.ts).
 *
 * This is full access, not a read-only preview: writes made in there are
 * indistinguishable from the couple's own. That is the point — staff set up
 * events and guest lists for couples over the phone — and it is why every
 * issued session is recorded in the audit log.
 */
export async function openCoupleDashboard(userId: string): Promise<Result<{ url: string }>> {
  await requirePermission('opuspass.couples.write')
  if (!userId) return { ok: false, error: 'Missing account.' }

  const supabase = createSupabaseAdminClient()
  const [{ data: user, error }, coupleSide] = await Promise.all([
    supabase
      .from('users')
      .select('id, email')
      .eq('id', userId)
      .maybeSingle<{ id: string; email: string | null }>(),
    isCoupleSideLogin(userId),
  ])
  if (error) return { ok: false, error: error.message }
  if (!user) return { ok: false, error: 'That account no longer exists.' }
  // Vendors have no couple dashboard. A dormant signup does — setting one up
  // over the phone is what this link is for — so the gate is the same
  // couple-side rule the list uses, not `users.role`.
  if (!coupleSide) {
    return { ok: false, error: 'Only couple accounts have an OpusPass dashboard.' }
  }

  const adminEmail = (await getCallerEmail()) ?? 'admin'
  const token = signCoupleStaffToken({ userId, adminEmail })
  if (!token) {
    return {
      ok: false,
      error: 'COUPLE_STAFF_ACCESS_SECRET is not configured on this environment, so staff dashboard access is unavailable.',
    }
  }

  const base = (process.env.NEXT_PUBLIC_OPUS_PASS_URL ?? 'http://localhost:3008').replace(/\/$/, '')

  await recordAuditEvent({
    eventType: 'opuspass.couple_dashboard_opened',
    severity: 'warn',
    actorEmail: adminEmail,
    message: `Opened the OpusPass dashboard as ${user.email ?? userId} (${COUPLE_STAFF_TOKEN_TTL_MINUTES}-minute staff session)`,
    targetResource: `users:${userId}`,
    metadata: { user_id: userId, email: user.email, ttl_minutes: COUPLE_STAFF_TOKEN_TTL_MINUTES },
  })

  return { ok: true, url: `${base}/api/staff-access?token=${encodeURIComponent(token)}` }
}

// ---------------------------------------------------------------------- delete

export interface CoupleDeletionImpact {
  coupleName: string
  email: string | null
  /** Rows that CASCADE away with the account. */
  events: number
  guests: number
  invitations: number
  pledges: number
  registryItems: number
  guestbookEntries: number
  notes: number
  reviews: number
  websites: number
  /** Paid orders — kept, but detached back to the unattributed banner. */
  paidOrders: number
  lifetimeSpendTzs: number
  /** Vendor storefronts owned by this same login. Non-zero blocks deletion. */
  vendors: number
  canSignIn: boolean
}

/**
 * What deleting this account destroys. Counted live rather than from the
 * couple_account_stats view alone, because the view has no notion of the rows
 * that make a delete unsafe (vendor storefronts) or recoverable (orders).
 */
export async function getCoupleDeletionImpact(userId: string): Promise<Result<{ impact: CoupleDeletionImpact }>> {
  await requirePermission('opuspass.couples.read')
  if (!userId) return { ok: false, error: 'Missing account.' }

  const supabase = createSupabaseAdminClient()
  const { data: user, error } = await supabase
    .from('users')
    .select('id, name, email, clerk_id')
    .eq('id', userId)
    .maybeSingle<{ id: string; name: string | null; email: string | null; clerk_id: string | null }>()
  if (error) return { ok: false, error: error.message }
  if (!user) return { ok: false, error: 'That account no longer exists — it may already have been deleted.' }

  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('partner1_name, partner2_name')
    .eq('user_id', userId)
    .maybeSingle<{ partner1_name: string | null; partner2_name: string | null }>()

  // One helper for every count so a table that does not exist on this
  // environment degrades to 0 with a log line, instead of failing the dialog
  // that is about to warn someone.
  const countBy = async (table: string, column = 'user_id'): Promise<number> => {
    const { count, error: countErr } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq(column, userId)
    if (countErr) {
      console.warn(`[couples] deletion impact count failed for ${table}: ${countErr.code} ${countErr.message}`)
      return 0
    }
    return count ?? 0
  }

  const [stats, orders, events, notes, reviews, websites, vendors] = await Promise.all([
    supabase
      .from('couple_account_stats')
      .select('guest_count, invitation_count, pledge_count, registry_item_count, guestbook_count, paid_order_count, lifetime_spend_tzs')
      .eq('user_id', userId)
      .maybeSingle<{
        guest_count: number
        invitation_count: number
        pledge_count: number
        registry_item_count: number
        guestbook_count: number
        paid_order_count: number
        lifetime_spend_tzs: number | string
      }>(),
    supabase
      .from('invitation_orders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'paid'),
    countBy('wedding_events'),
    countBy('couple_account_notes'),
    countBy('reviews'),
    countBy('wedding_websites'),
    countBy('vendors'),
  ])

  const s = stats.data
  const paidOrders = orders.count ?? s?.paid_order_count ?? 0
  const coupleName =
    [profile?.partner1_name, profile?.partner2_name].filter(Boolean).join(' & ') ||
    user.name?.trim() ||
    user.email ||
    'Unnamed account'

  return {
    ok: true,
    impact: {
      coupleName,
      email: user.email,
      events,
      guests: s?.guest_count ?? 0,
      invitations: s?.invitation_count ?? 0,
      pledges: s?.pledge_count ?? 0,
      registryItems: s?.registry_item_count ?? 0,
      guestbookEntries: s?.guestbook_count ?? 0,
      notes,
      reviews,
      websites,
      paidOrders,
      lifetimeSpendTzs: Number(s?.lifetime_spend_tzs) || 0,
      vendors,
      canSignIn: Boolean(user.clerk_id),
    },
  }
}

/**
 * Permanently delete a couple account.
 *
 * Order, and why:
 *  1. Refuse if this login also owns a vendor storefront. `vendors.user_id`
 *     CASCADEs from `users`, so deleting the couple would silently destroy a
 *     live vendor business. Those have their own delete flow under
 *     /operations/vendors.
 *  2. Detach paid orders. `invitation_orders.user_id` has no foreign key, so the
 *     delete would leave rows pointing at a ghost account — revenue that shows
 *     in no total and in no unattributed banner. Nulling it returns them to the
 *     banner on this page, where they can be re-linked. This runs before the
 *     irreversible steps on purpose: if a later step fails, the orders are
 *     merely un-attributed, which is a state the banner already handles.
 *  3. Remove the Clerk login, so the email is free for a fresh sign-up. A
 *     genuine Clerk failure aborts before the account row is deleted.
 *  4. Delete the `users` row; every couple-side child table CASCADEs.
 *
 * `confirmName` must match the displayed couple name exactly, which is what
 * makes this safe to expose in a list row.
 */
export async function deleteCoupleAccount(userId: string, confirmName: string): Promise<Result> {
  await requirePermission('opuspass.couples.delete')
  if (!userId) return { ok: false, error: 'Missing account.' }

  const impactResult = await getCoupleDeletionImpact(userId)
  if (!impactResult.ok) return impactResult
  const impact = impactResult.impact

  if (confirmName.trim() !== impact.coupleName.trim()) {
    return {
      ok: false,
      error: `The name you typed doesn’t match “${impact.coupleName}”. Deletion cancelled.`,
    }
  }
  if (impact.vendors > 0) {
    return {
      ok: false,
      error: `This login also owns ${impact.vendors} vendor ${impact.vendors === 1 ? 'storefront' : 'storefronts'}, which would be destroyed with it. Delete the vendor from Operations → Vendors first, or leave this account in place.`,
    }
  }

  const supabase = createSupabaseAdminClient()
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('email, clerk_id')
    .eq('id', userId)
    .maybeSingle<{ email: string | null; clerk_id: string | null }>()
  if (userErr) return { ok: false, error: userErr.message }
  if (!user) return { ok: false, error: 'That account no longer exists.' }

  if (impact.paidOrders > 0) {
    const { error: detachErr } = await supabase
      .from('invitation_orders')
      .update({ user_id: null })
      .eq('user_id', userId)
    if (detachErr) {
      return {
        ok: false,
        error: `Could not detach this couple’s orders, so nothing was deleted: ${detachErr.message}`,
      }
    }
  }

  const clerkRes = await deletePlatformClerkLogin({ clerkId: user.clerk_id, email: user.email })
  if (!clerkRes.ok) {
    return { ok: false, error: clerkRes.error ?? 'Could not remove the couple’s sign-in login.' }
  }

  const { error: deleteErr } = await supabase.from('users').delete().eq('id', userId)
  if (deleteErr) {
    return { ok: false, error: `Could not delete the account: ${deleteErr.message}` }
  }

  await recordAuditEvent({
    eventType: 'opuspass.couple_deleted',
    severity: 'critical',
    message: `Deleted couple account ${impact.coupleName} <${user.email ?? 'no email'}>: ${impact.events} events, ${impact.guests} guests, ${impact.invitations} invitations. ${impact.paidOrders} paid orders detached`,
    targetResource: `users:${userId}`,
    metadata: { user_id: userId, email: user.email, impact },
  })

  revalidateCouples(userId)
  revalidatePath('/finance/payments')
  return { ok: true, warning: clerkRes.warning }
}

// ------------------------------------------------------------- dormant clean-up

/** Hard cap on one sweep. Deleting hundreds of accounts in a single request
 *  would run past the server-action timeout halfway through, which is a worse
 *  outcome than making staff click twice. */
const DORMANT_SWEEP_LIMIT = 100

export interface DormantSweepResult {
  deleted: number
  /** Accounts left alone, with the reason, so nothing fails silently. */
  skipped: { name: string; reason: string }[]
}

/**
 * Delete a batch of dormant accounts: people who signed up and then did
 * nothing at all. This is the clean-up that used to need hand-written SQL (see
 * supabase/manual/restore_dormant_users_20260721.sql, written after 29 of these
 * were removed by hand).
 *
 * "Dormant" is re-derived here from the database, never taken from the client:
 * no onboarding profile, no events, guests, orders, pledges, registry items or
 * guestbook entries, and no vendor storefront on the same login. An account
 * that has since done something is skipped and reported, not deleted — the page
 * the ids came from may be minutes stale.
 *
 * Per-account work mirrors deleteCoupleAccount minus the order detachment,
 * which cannot apply: an account with any order is not dormant.
 */
export async function deleteDormantCoupleAccounts(userIds: string[]): Promise<Result<{ result: DormantSweepResult }>> {
  await requirePermission('opuspass.couples.delete')

  const ids = Array.from(new Set(userIds.filter((id) => typeof id === 'string' && id)))
  if (ids.length === 0) return { ok: false, error: 'No accounts were selected.' }
  if (ids.length > DORMANT_SWEEP_LIMIT) {
    return {
      ok: false,
      error: `Too many accounts at once. Narrow the list to ${DORMANT_SWEEP_LIMIT} or fewer and run it again.`,
    }
  }

  const supabase = createSupabaseAdminClient()

  const [{ data: users, error: usersErr }, { data: profiles }, { data: stats }, { data: vendors }, { data: orders }] =
    await Promise.all([
      supabase
        .from('users')
        .select('id, name, email, clerk_id, role')
        .in('id', ids)
        .returns<{ id: string; name: string | null; email: string | null; clerk_id: string | null; role: string | null }[]>(),
      supabase.from('couple_profiles').select('user_id').in('user_id', ids).returns<{ user_id: string }[]>(),
      supabase
        .from('couple_account_stats')
        .select('user_id, event_count, guest_count, order_count, pledge_count, registry_item_count, guestbook_count')
        .in('user_id', ids)
        .returns<
          {
            user_id: string
            event_count: number
            guest_count: number
            order_count: number
            pledge_count: number
            registry_item_count: number
            guestbook_count: number
          }[]
        >(),
      supabase.from('vendors').select('user_id').in('user_id', ids).returns<{ user_id: string }[]>(),
      // invitation_orders has no FK to users, so it is not covered by the stats
      // view's joins for every historical row — check it directly.
      supabase.from('invitation_orders').select('user_id').in('user_id', ids).returns<{ user_id: string | null }[]>(),
    ])
  if (usersErr) return { ok: false, error: usersErr.message }

  const hasProfile = new Set((profiles ?? []).map((p) => p.user_id))
  const isVendorOwner = new Set((vendors ?? []).map((v) => v.user_id))
  const hasOrder = new Set((orders ?? []).map((o) => o.user_id).filter((id): id is string => Boolean(id)))
  const statsByUser = new Map((stats ?? []).map((s) => [s.user_id, s]))
  const userById = new Map((users ?? []).map((u) => [u.id, u]))

  const result: DormantSweepResult = { deleted: 0, skipped: [] }

  for (const id of ids) {
    const user = userById.get(id)
    const label = user?.name?.trim() || user?.email || id

    if (!user) {
      result.skipped.push({ name: label, reason: 'no longer exists' })
      continue
    }
    // A dormant account has no couple workspace by definition — a workspace only
    // exists because someone engaged — so "is it a couple?" is the wrong
    // question here. What must be excluded is anyone who is NOT a customer: the
    // vendor check below, and platform admins. `role` is consulted for that one
    // remaining purpose only.
    if (user.role === 'admin') {
      result.skipped.push({ name: label, reason: 'is a platform admin account' })
      continue
    }
    if (isVendorOwner.has(id)) {
      result.skipped.push({ name: label, reason: 'also owns a vendor storefront' })
      continue
    }
    if (hasProfile.has(id)) {
      result.skipped.push({ name: label, reason: 'has completed onboarding' })
      continue
    }
    if (hasOrder.has(id)) {
      result.skipped.push({ name: label, reason: 'has orders attached' })
      continue
    }
    const s = statsByUser.get(id)
    if (
      s &&
      (s.event_count > 0 ||
        s.guest_count > 0 ||
        s.order_count > 0 ||
        s.pledge_count > 0 ||
        s.registry_item_count > 0 ||
        s.guestbook_count > 0)
    ) {
      result.skipped.push({ name: label, reason: 'is no longer dormant' })
      continue
    }

    const clerkRes = await deletePlatformClerkLogin({ clerkId: user.clerk_id, email: user.email })
    if (!clerkRes.ok) {
      result.skipped.push({ name: label, reason: 'their sign-in login could not be removed' })
      continue
    }

    const { error: deleteErr } = await supabase.from('users').delete().eq('id', id)
    if (deleteErr) {
      result.skipped.push({ name: label, reason: deleteErr.message })
      continue
    }
    result.deleted += 1
  }

  if (result.deleted > 0) {
    await recordAuditEvent({
      eventType: 'opuspass.dormant_couples_deleted',
      severity: 'critical',
      message: `Deleted ${result.deleted} dormant couple ${result.deleted === 1 ? 'account' : 'accounts'}${result.skipped.length > 0 ? `, skipped ${result.skipped.length}` : ''}`,
      targetResource: 'users',
      metadata: { requested: ids.length, deleted: result.deleted, skipped: result.skipped, user_ids: ids },
    })
    revalidateCouples()
  }

  return { ok: true, result }
}
