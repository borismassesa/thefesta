import 'server-only'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getEventCreditUsage, type EventCreditUsage } from '../../../finance/payments/queries'
import { isCoupleSideLogin } from '../queries'
import { GUEST_PAGE_SIZE } from './constants'

// Per-couple console reads. Everything is scoped to one userId and goes
// through the service-role client — same cross-couple staff pattern as the
// pledge console. Aggregates come from the couple_event_stats view
// (migration 20260722000002) so counts never hit PostgREST's 1000-row cap.

export interface CoupleAccountDetail {
  userId: string
  coupleName: string
  /** The two names on their own, so the edit form can round-trip them rather
   *  than trying to split `coupleName` back apart. */
  partner1Name: string | null
  partner2Name: string | null
  accountName: string | null
  email: string | null
  phone: string | null
  whatsappPhone: string | null
  avatarUrl: string | null
  clerkLinked: boolean
  signedUpAt: string
  onboarded: boolean
  onboardingCompletedAt: string | null
  weddingDate: string | null
  dateUndecided: boolean
  city: string | null
  region: string | null
  budgetRange: string | null
  expectedGuestCount: number | null
  publicSlug: string | null
  publicSharingEnabled: boolean
  websitePublishedAt: string | null
}

export interface CoupleEvent {
  id: string
  name: string
  eventType: string
  startsAt: string | null
  venueName: string | null
  city: string | null
  isPublic: boolean
  allowRsvp: boolean
  invitationCount: number
  rsvpAttending: number
  rsvpDeclined: number
  rsvpMaybe: number
  rsvpPending: number
  expectedHeadcount: number
  checkedInCount: number
  checkedInHeadcount: number
  pledgeCount: number
  registryItemCount: number
  guestbookCount: number
  seatingTableCount: number
  paidOrderCount: number
  spendTzs: number
}

export interface CoupleOrder {
  id: string
  ref: string
  status: string
  eventId: string | null
  eventName: string | null
  amountTotal: number
  currency: string
  tierLabels: string[]
  guestsPurchased: number
  paymentMethod: string | null
  createdAt: string
  paidAt: string | null
  fulfillmentStatus: string | null
}

export interface CoupleNote {
  id: string
  body: string
  adminEmail: string
  createdAt: string
}

type UserRow = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  avatar: string | null
  clerk_id: string | null
  created_at: string
}

type ProfileRow = {
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
  onboarding_completed_at: string | null
  public_slug: string | null
  public_sharing_enabled: boolean | null
  website_published_at: string | null
}

export async function getCoupleAccount(userId: string): Promise<CoupleAccountDetail | null> {
  const supabase = createSupabaseAdminClient()

  const [
    { data: user, error: userErr },
    { data: profile, error: profileErr },
    { data: firstEvent },
    coupleSide,
  ] = await Promise.all([
    supabase
      .from('users')
      .select('id, name, email, phone, avatar, clerk_id, created_at')
      .eq('id', userId)
      .maybeSingle<UserRow>(),
    supabase
      .from('couple_profiles')
      .select(
        'partner1_name, partner2_name, wedding_date, date_undecided, city, region, budget_range, guest_count, whatsapp_phone, avatar_url, onboarding_completed_at, public_slug, public_sharing_enabled, website_published_at',
      )
      .eq('user_id', userId)
      .maybeSingle<ProfileRow>(),
    supabase
      .from('wedding_events')
      .select('name')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle<{ name: string | null }>(),
    isCoupleSideLogin(userId),
  ])
  if (userErr) throw new Error(userErr.message)
  if (profileErr) throw new Error(profileErr.message)
  if (!user) return null
  // A vendor login has no couple console, even if someone hand-types its id
  // into the URL. Same couple-side rule the list uses (migration
  // 20260730030000); the caller turns this into a 404.
  if (!coupleSide) return null

  // Same fallback chain as the list page's resolveCoupleName.
  const coupleName =
    [profile?.partner1_name, profile?.partner2_name].filter(Boolean).join(' & ') ||
    firstEvent?.name?.trim() ||
    user.name?.trim() ||
    user.email?.split('@')[0]?.trim() ||
    'Unnamed account'

  return {
    userId: user.id,
    coupleName,
    partner1Name: profile?.partner1_name ?? null,
    partner2Name: profile?.partner2_name ?? null,
    accountName: user.name,
    email: user.email,
    phone: user.phone,
    whatsappPhone: profile?.whatsapp_phone ?? null,
    avatarUrl: profile?.avatar_url ?? user.avatar,
    clerkLinked: Boolean(user.clerk_id),
    signedUpAt: user.created_at,
    onboarded: Boolean(profile),
    onboardingCompletedAt: profile?.onboarding_completed_at ?? null,
    weddingDate: profile?.wedding_date ?? null,
    dateUndecided: Boolean(profile?.date_undecided),
    city: profile?.city ?? null,
    region: profile?.region ?? null,
    budgetRange: profile?.budget_range ?? null,
    expectedGuestCount: profile?.guest_count ?? null,
    publicSlug: profile?.public_slug ?? null,
    publicSharingEnabled: Boolean(profile?.public_sharing_enabled),
    websitePublishedAt: profile?.website_published_at ?? null,
  }
}

type EventRow = {
  id: string
  name: string | null
  event_type: string
  starts_at: string | null
  venue_name: string | null
  city: string | null
  is_public: boolean | null
  allow_rsvp: boolean | null
}

type EventStatsRow = {
  event_id: string
  invitation_count: number
  rsvp_attending: number
  rsvp_declined: number
  rsvp_maybe: number
  rsvp_pending: number
  expected_headcount: number
  checked_in_count: number
  checked_in_headcount: number
  pledge_count: number
  registry_item_count: number
  guestbook_count: number
  seating_table_count: number
  paid_order_count: number
  spend_tzs: number | string
}

export async function getCoupleEvents(userId: string): Promise<CoupleEvent[]> {
  const supabase = createSupabaseAdminClient()

  const [{ data: events, error: eventsErr }, { data: stats, error: statsErr }] = await Promise.all([
    supabase
      .from('wedding_events')
      .select('id, name, event_type, starts_at, venue_name, city, is_public, allow_rsvp')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })
      .order('starts_at', { ascending: true, nullsFirst: false })
      .returns<EventRow[]>(),
    supabase.from('couple_event_stats').select('*').eq('user_id', userId).returns<EventStatsRow[]>(),
  ])
  if (eventsErr) throw new Error(eventsErr.message)
  if (statsErr) throw new Error(statsErr.message)

  const statsByEvent = new Map((stats ?? []).map((s) => [s.event_id, s]))

  return (events ?? []).map((event): CoupleEvent => {
    const s = statsByEvent.get(event.id)
    return {
      id: event.id,
      name: event.name?.trim() || 'Untitled event',
      eventType: event.event_type,
      startsAt: event.starts_at,
      venueName: event.venue_name,
      city: event.city,
      isPublic: Boolean(event.is_public),
      allowRsvp: Boolean(event.allow_rsvp),
      invitationCount: s?.invitation_count ?? 0,
      rsvpAttending: s?.rsvp_attending ?? 0,
      rsvpDeclined: s?.rsvp_declined ?? 0,
      rsvpMaybe: s?.rsvp_maybe ?? 0,
      rsvpPending: s?.rsvp_pending ?? 0,
      expectedHeadcount: s?.expected_headcount ?? 0,
      checkedInCount: s?.checked_in_count ?? 0,
      checkedInHeadcount: s?.checked_in_headcount ?? 0,
      pledgeCount: s?.pledge_count ?? 0,
      registryItemCount: s?.registry_item_count ?? 0,
      guestbookCount: s?.guestbook_count ?? 0,
      seatingTableCount: s?.seating_table_count ?? 0,
      paidOrderCount: s?.paid_order_count ?? 0,
      spendTzs: Number(s?.spend_tzs) || 0,
    }
  })
}

type OrderRow = {
  id: string
  ref: string
  status: string
  event_id: string | null
  amount_total: number | string | null
  currency: string | null
  payment_method: string | null
  created_at: string
  paid_at: string | null
  fulfillment_status: string | null
  items: { tier?: string; tierId?: string; guests?: number }[] | null
}

export async function getCoupleOrders(userId: string, eventNameById: Map<string, string>): Promise<CoupleOrder[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('invitation_orders')
    .select(
      'id, ref, status, event_id, amount_total, currency, payment_method, created_at, paid_at, fulfillment_status, items',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .returns<OrderRow[]>()
  if (error) throw new Error(error.message)

  return (data ?? []).map((order): CoupleOrder => {
    const items = order.items ?? []
    return {
      id: order.id,
      ref: order.ref,
      status: order.status,
      eventId: order.event_id,
      eventName: order.event_id ? (eventNameById.get(order.event_id) ?? null) : null,
      amountTotal: Number(order.amount_total) || 0,
      currency: order.currency ?? 'TZS',
      // `.tier` is the display label, `.tierId` the machine key — see ../pledges/tier.ts.
      tierLabels: [...new Set(items.map((i) => i.tier).filter((t): t is string => Boolean(t)))],
      guestsPurchased: items.reduce((sum, i) => sum + (typeof i.guests === 'number' ? Math.floor(i.guests) : 0), 0),
      paymentMethod: order.payment_method,
      createdAt: order.created_at,
      paidAt: order.paid_at,
      fulfillmentStatus: order.fulfillment_status,
    }
  })
}

/** Orders bought without being signed in whose contact_email matches this
 *  account — candidates for the Orders tab's link action. */
export async function getLinkableOrdersForCouple(userId: string): Promise<CoupleOrder[]> {
  const supabase = createSupabaseAdminClient()

  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('email')
    .eq('id', userId)
    .maybeSingle<{ email: string | null }>()
  if (userErr) throw new Error(userErr.message)
  if (!user?.email) return []

  const { data, error } = await supabase
    .from('invitation_orders')
    .select(
      'id, ref, status, event_id, amount_total, currency, payment_method, created_at, paid_at, fulfillment_status, items',
    )
    .is('user_id', null)
    .ilike('contact_email', user.email)
    .order('created_at', { ascending: false })
    .returns<OrderRow[]>()
  if (error) throw new Error(error.message)

  return (data ?? []).map((order) => ({
    id: order.id,
    ref: order.ref,
    status: order.status,
    eventId: order.event_id,
    eventName: null,
    amountTotal: Number(order.amount_total) || 0,
    currency: order.currency ?? 'TZS',
    tierLabels: [...new Set((order.items ?? []).map((i) => i.tier).filter((t): t is string => Boolean(t)))],
    guestsPurchased: (order.items ?? []).reduce(
      (sum, i) => sum + (typeof i.guests === 'number' ? Math.floor(i.guests) : 0),
      0,
    ),
    paymentMethod: order.payment_method,
    createdAt: order.created_at,
    paidAt: order.paid_at,
    fulfillmentStatus: order.fulfillment_status,
  }))
}

export async function getCoupleNotes(userId: string): Promise<CoupleNote[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('couple_account_notes')
    .select('id, body, admin_email, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .returns<{ id: string; body: string; admin_email: string; created_at: string }[]>()
  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => ({
    id: row.id,
    body: row.body,
    adminEmail: row.admin_email,
    createdAt: row.created_at,
  }))
}

/** Invite + entrance-pass pools for the selected event. Reuses finance's
 *  getEventCreditUsage so the two consoles can never disagree on the math. */
export async function getCreditUsage(userId: string, eventId: string | null): Promise<EventCreditUsage | null> {
  if (!eventId) return null
  return getEventCreditUsage(userId, eventId)
}

export interface CoupleGuestRow {
  id: string
  fullName: string
  email: string | null
  phone: string | null
  groupTag: string | null
  rsvpStatus: string
  partySize: number
  mealChoice: string | null
  respondedAt: string | null
  checkedInAt: string | null
}

/** Guest list for one event, capped at GUEST_PAGE_SIZE — the caller shows a
 *  "showing first N" note rather than silently under-reporting (the counts on
 *  the event cards come from couple_event_stats and stay exact). */
export async function getEventGuests(eventId: string): Promise<CoupleGuestRow[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('guest_invitations')
    .select(
      'id, rsvp_status, party_size, meal_choice, responded_at, checked_in_at, guest_contacts(full_name, email, phone, group_tag)',
    )
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })
    .limit(GUEST_PAGE_SIZE)
    .returns<
      {
        id: string
        rsvp_status: string
        party_size: number | null
        meal_choice: string | null
        responded_at: string | null
        checked_in_at: string | null
        guest_contacts: { full_name: string | null; email: string | null; phone: string | null; group_tag: string | null } | null
      }[]
    >()
  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.guest_contacts?.full_name?.trim() || 'Unnamed guest',
    email: row.guest_contacts?.email ?? null,
    phone: row.guest_contacts?.phone ?? null,
    groupTag: row.guest_contacts?.group_tag ?? null,
    rsvpStatus: row.rsvp_status,
    partySize: row.party_size ?? 1,
    mealChoice: row.meal_choice,
    respondedAt: row.responded_at,
    checkedInAt: row.checked_in_at,
  }))
}
