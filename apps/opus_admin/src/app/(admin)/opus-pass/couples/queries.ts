import 'server-only'
import { createSupabaseAdminClient } from '@/lib/supabase'

// Cross-couple staff surface: reads go through the service-role client with no
// owner filter, mirroring the finance/payments and pledge-concierge precedent.
//
// Per-couple counts come from the couple_account_stats view (migration
// 20260722000002) rather than being aggregated here. PostgREST caps every
// response at 1000 rows, and guest_invitations is already past that, so
// counting in the app would silently undercount.
//
// WHO COUNTS AS A COUPLE: the existence of a `couple_accounts` row — the
// couple-side workspace (migration 20260730030000). This list used to filter
// `users.role = 'user'`, which is not a fact about anything: the shared `users`
// table is one row per Clerk login for every app, and no vendor signup path
// writes role='vendor', so vendor logins arrived here as couples while a
// mislabelled couple was hidden. Vendor-ness is likewise a `vendor_memberships`
// row, never a role.

export type CoupleAccountStatus = 'dormant' | 'active' | 'paying'

export interface CoupleAccountRow {
  userId: string
  coupleName: string
  email: string | null
  phone: string | null
  avatarUrl: string | null
  /** Has a Clerk identity, i.e. can actually sign in. */
  clerkLinked: boolean
  signedUpAt: string
  /** Has a couple_profiles row, i.e. finished the onboarding wizard. */
  onboarded: boolean
  weddingDate: string | null
  city: string | null
  // The rest of the onboarding profile, carried so a row can open the edit
  // form without a second round-trip. `weddingDate` above falls back to an
  // event's start date for display; `profileWeddingDate` is the profile's own
  // value, which is the only one the form may prefill.
  partner1Name: string | null
  partner2Name: string | null
  region: string | null
  budgetRange: string | null
  expectedGuestCount: number | null
  whatsappPhone: string | null
  profileWeddingDate: string | null
  dateUndecided: boolean
  eventCount: number
  guestCount: number
  invitationCount: number
  rsvpAttending: number
  rsvpPending: number
  orderCount: number
  paidOrderCount: number
  lifetimeSpendTzs: number
  pledgeCount: number
  registryItemCount: number
  guestbookCount: number
  lastActivityAt: string | null
  status: CoupleAccountStatus
  /** Vendor storefronts owned by this same login. One person may be both a
   *  couple and a vendor — they are separate workspaces on one identity — so
   *  this is surfaced deliberately rather than left invisible. */
  vendorStorefronts: { id: string; businessName: string }[]
}

type UserRow = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  avatar: string | null
  clerk_id: string | null
  created_at: string
  /** Legacy. Only 'admin' is still meaningful — see getCoupleAccounts. */
  role?: string | null
}

type ProfileRow = {
  user_id: string
  partner1_name: string | null
  partner2_name: string | null
  wedding_date: string | null
  date_undecided: boolean | null
  city: string | null
  region: string | null
  budget_range: string | null
  guest_count: number | null
  whatsapp_phone: string | null
  avatar_url: string | null
}

type EventRow = { user_id: string; name: string | null; starts_at: string | null }

type StatsRow = {
  user_id: string
  event_count: number
  guest_count: number
  invitation_count: number
  rsvp_attending: number
  rsvp_pending: number
  order_count: number
  paid_order_count: number
  lifetime_spend_tzs: number | string
  pledge_count: number
  registry_item_count: number
  guestbook_count: number
  last_activity_at: string | null
}

const EMPTY_STATS: Omit<StatsRow, 'user_id'> = {
  event_count: 0,
  guest_count: 0,
  invitation_count: 0,
  rsvp_attending: 0,
  rsvp_pending: 0,
  order_count: 0,
  paid_order_count: 0,
  lifetime_spend_tzs: 0,
  pledge_count: 0,
  registry_item_count: 0,
  guestbook_count: 0,
  last_activity_at: null,
}

/** Same fallback chain as getEligibleCouples in ../pledges/queries.ts, plus
 *  the account's own name/email so dormant signups (who have no profile and
 *  no event) still render as something a human recognises. */
function resolveCoupleName(profile: ProfileRow | undefined, event: EventRow | undefined, user: UserRow): string {
  const fromProfile = [profile?.partner1_name, profile?.partner2_name].filter(Boolean).join(' & ')
  if (fromProfile) return fromProfile
  const fromEvent = event?.name?.trim()
  if (fromEvent) return fromEvent
  const fromAccount = user.name?.trim()
  if (fromAccount) return fromAccount
  const localPart = user.email?.split('@')[0]?.trim()
  return localPart || 'Unnamed account'
}

/**
 * Everyone on the couple side of the platform:
 *
 *  * every live couple workspace (`couple_accounts`), and
 *  * every login that has not picked a side yet — no couple workspace AND no
 *    vendor storefront. These are the dormant signups the "Dormant" filter and
 *    the delete sweep exist for, and knowing how many people made an account
 *    and then did nothing is half the point of this list. They carry empty
 *    stats by construction.
 *
 * A login that owns a vendor storefront but no couple workspace is a vendor,
 * and is the one thing this list must never show. That used to be decided by
 * `users.role`, which no vendor signup path ever set.
 */
export async function getCoupleAccounts(): Promise<CoupleAccountRow[]> {
  const supabase = createSupabaseAdminClient()

  const [
    { data: workspaces, error: workspacesErr },
    { data: users, error: usersErr },
    { data: profiles, error: profilesErr },
    { data: events, error: eventsErr },
    { data: stats, error: statsErr },
    { data: vendors, error: vendorsErr },
  ] = await Promise.all([
      supabase
        .from('couple_accounts')
        .select('user_id')
        .is('archived_at', null)
        .returns<{ user_id: string }[]>(),
      supabase
        .from('users')
        .select('id, name, email, phone, avatar, clerk_id, created_at, role')
        .order('created_at', { ascending: false })
        .returns<UserRow[]>(),
      supabase
        .from('couple_profiles')
        .select(
          'user_id, partner1_name, partner2_name, wedding_date, date_undecided, city, region, budget_range, guest_count, whatsapp_phone, avatar_url',
        )
        .returns<ProfileRow[]>(),
      supabase
        .from('wedding_events')
        .select('user_id, name, starts_at')
        .order('sort_order', { ascending: true })
        .order('starts_at', { ascending: true, nullsFirst: false })
        .returns<EventRow[]>(),
      // The view is already scoped to live workspaces, so it needs no filter.
      supabase.from('couple_account_stats').select('*').returns<StatsRow[]>(),
      supabase
        .from('vendors')
        .select('id, user_id, business_name')
        .returns<{ id: string; user_id: string; business_name: string | null }[]>(),
    ])
  if (workspacesErr) throw new Error(workspacesErr.message)
  if (usersErr) throw new Error(usersErr.message)
  if (profilesErr) throw new Error(profilesErr.message)
  if (eventsErr) throw new Error(eventsErr.message)
  if (statsErr) throw new Error(statsErr.message)
  if (vendorsErr) throw new Error(vendorsErr.message)

  const vendorsByUser = new Map<string, { id: string; businessName: string }[]>()
  for (const v of vendors ?? []) {
    const list = vendorsByUser.get(v.user_id) ?? []
    list.push({ id: v.id, businessName: v.business_name ?? 'Unnamed business' })
    vendorsByUser.set(v.user_id, list)
  }

  const profileByUser = new Map((profiles ?? []).map((p) => [p.user_id, p]))
  const statsByUser = new Map((stats ?? []).map((s) => [s.user_id, s]))

  // Events arrive pre-ordered, so the first one seen per couple is their
  // primary event — used for the name fallback and the displayed date.
  const firstEventByUser = new Map<string, EventRow>()
  for (const e of events ?? []) {
    if (!firstEventByUser.has(e.user_id)) firstEventByUser.set(e.user_id, e)
  }

  const isCoupleWorkspace = new Set((workspaces ?? []).map((w) => w.user_id))

  const included = (users ?? []).filter((user) => {
    if (isCoupleWorkspace.has(user.id)) return true
    // No couple workspace: only show them if they have not become a vendor
    // either, i.e. they are still an unclassified signup. `role` is consulted
    // for exactly one thing here — keeping platform admins out of a list of
    // customers — which is the only meaning it still carries.
    return !vendorsByUser.has(user.id) && user.role !== 'admin'
  })

  return included.map((user): CoupleAccountRow => {
    const profile = profileByUser.get(user.id)
    const event = firstEventByUser.get(user.id)
    const s = statsByUser.get(user.id) ?? EMPTY_STATS
    const lifetimeSpendTzs = Number(s.lifetime_spend_tzs) || 0

    const hasActivity =
      Boolean(profile) ||
      s.event_count > 0 ||
      s.guest_count > 0 ||
      s.order_count > 0 ||
      s.pledge_count > 0 ||
      s.registry_item_count > 0 ||
      s.guestbook_count > 0

    return {
      userId: user.id,
      coupleName: resolveCoupleName(profile, event, user),
      email: user.email,
      phone: user.phone,
      avatarUrl: profile?.avatar_url ?? user.avatar,
      clerkLinked: Boolean(user.clerk_id),
      signedUpAt: user.created_at,
      onboarded: Boolean(profile),
      weddingDate: profile?.wedding_date ?? event?.starts_at ?? null,
      city: profile?.city ?? null,
      partner1Name: profile?.partner1_name ?? null,
      partner2Name: profile?.partner2_name ?? null,
      region: profile?.region ?? null,
      budgetRange: profile?.budget_range ?? null,
      expectedGuestCount: profile?.guest_count ?? null,
      whatsappPhone: profile?.whatsapp_phone ?? null,
      profileWeddingDate: profile?.wedding_date ?? null,
      dateUndecided: Boolean(profile?.date_undecided),
      eventCount: s.event_count,
      guestCount: s.guest_count,
      invitationCount: s.invitation_count,
      rsvpAttending: s.rsvp_attending,
      rsvpPending: s.rsvp_pending,
      orderCount: s.order_count,
      paidOrderCount: s.paid_order_count,
      lifetimeSpendTzs,
      pledgeCount: s.pledge_count,
      registryItemCount: s.registry_item_count,
      guestbookCount: s.guestbook_count,
      lastActivityAt: s.last_activity_at,
      status: s.paid_order_count > 0 ? 'paying' : hasActivity ? 'active' : 'dormant',
      vendorStorefronts: vendorsByUser.get(user.id) ?? [],
    }
  })
}

/**
 * The single rule for whether one login belongs on the couple side, so the list,
 * the per-couple console and the staff dashboard link cannot drift apart.
 *
 * True when the login has a live couple workspace, or is still unclassified (no
 * workspace and no vendor storefront). False for vendors and platform admins.
 * Mirrors the filter in getCoupleAccounts — keep the two in step.
 */
export async function isCoupleSideLogin(userId: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient()

  const [{ data: workspace }, { data: vendors }, { data: user }] = await Promise.all([
    supabase
      .from('couple_accounts')
      .select('user_id')
      .eq('user_id', userId)
      .is('archived_at', null)
      .maybeSingle<{ user_id: string }>(),
    supabase.from('vendors').select('id').eq('user_id', userId).returns<{ id: string }[]>(),
    supabase.from('users').select('role').eq('id', userId).maybeSingle<{ role: string | null }>(),
  ])

  if (workspace) return true
  if ((vendors ?? []).length > 0) return false
  return user?.role !== 'admin'
}

export interface UnlinkedOrder {
  orderId: string
  ref: string
  status: string
  contactName: string | null
  contactEmail: string
  amountTotal: number
  currency: string
  createdAt: string
  /** The account whose email matches, if any — the link action's target. */
  matchedUserId: string | null
  matchedCoupleName: string | null
}

type OrphanOrderRow = {
  id: string
  ref: string
  status: string
  contact_name: string | null
  contact_email: string | null
  amount_total: number | string | null
  currency: string | null
  created_at: string
}

/**
 * Orders that were paid for but never attached to an account. Checkout can
 * complete without a signed-in user, so `invitation_orders.user_id` stays
 * NULL — which hides that revenue from the couple's own dashboard AND from
 * getEligibleCouples in ../pledges/queries.ts (it filters user_id NOT NULL),
 * so those couples silently never reach Pledge Concierge either.
 *
 * Matching is on contact_email, case-insensitively, against EVERY login — not
 * just ones that already have a couple workspace. Someone who bought a card
 * before doing anything else on the couple side (a vendor buying for their own
 * wedding, say) is still the right link target, and attaching the order is what
 * creates their workspace: `invitation_orders` carries an AFTER UPDATE OF
 * user_id trigger for exactly this path (migration 20260730030000).
 */
export async function getUnlinkedOrders(): Promise<UnlinkedOrder[]> {
  const supabase = createSupabaseAdminClient()

  const [{ data: orders, error: ordersErr }, { data: users, error: usersErr }, { data: profiles, error: profilesErr }] =
    await Promise.all([
      supabase
        .from('invitation_orders')
        .select('id, ref, status, contact_name, contact_email, amount_total, currency, created_at')
        .is('user_id', null)
        .order('created_at', { ascending: false })
        .returns<OrphanOrderRow[]>(),
      supabase.from('users').select('id, name, email').returns<Pick<UserRow, 'id' | 'name' | 'email'>[]>(),
      supabase.from('couple_profiles').select('user_id, partner1_name, partner2_name').returns<ProfileRow[]>(),
    ])
  if (ordersErr) throw new Error(ordersErr.message)
  if (usersErr) throw new Error(usersErr.message)
  if (profilesErr) throw new Error(profilesErr.message)

  const profileByUser = new Map((profiles ?? []).map((p) => [p.user_id, p]))
  const userByEmail = new Map<string, Pick<UserRow, 'id' | 'name' | 'email'>>()
  for (const u of users ?? []) {
    if (u.email) userByEmail.set(u.email.toLowerCase(), u)
  }

  return (orders ?? []).map((order): UnlinkedOrder => {
    const match = order.contact_email ? userByEmail.get(order.contact_email.toLowerCase()) : undefined
    const profile = match ? profileByUser.get(match.id) : undefined
    const matchedName = match
      ? [profile?.partner1_name, profile?.partner2_name].filter(Boolean).join(' & ') ||
        match.name?.trim() ||
        match.email ||
        'Unnamed account'
      : null

    return {
      orderId: order.id,
      ref: order.ref,
      status: order.status,
      contactName: order.contact_name,
      contactEmail: order.contact_email ?? '',
      amountTotal: Number(order.amount_total) || 0,
      currency: order.currency ?? 'TZS',
      createdAt: order.created_at,
      matchedUserId: match?.id ?? null,
      matchedCoupleName: matchedName,
    }
  })
}
