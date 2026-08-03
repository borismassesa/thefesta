import 'server-only'
import { createDashboardClient } from './supabase'
import { getDashboardUser, requireDashboardUser } from './auth'
import { eatDateParts, eventInviteUrl, eventSlugBase, firstNameOf, formatLongDate, formatLongDateSw, formatSwahiliTime, formatTicketDate, hasEatTimeComponent, publicOrigin, slugBaseOf } from './share'
import { getWhatsAppProvider } from '@/lib/whatsapp'
import { eventTypeLabel, eventTypeLabelSw, ticketIntroLabel } from './types'
import type { TicketLanguage } from './types'
import { toTzs } from './currency'
import { resolveEventCover, type PledgePageConfig, type PledgePaymentMethod } from './pledge-page'
import { THANK_YOU_FREE_TIER_IDS, resolveThankYouCover, type ThankYouCardConfig } from './thank-you'
import { parseTemplateCardItemId, resolveEventPackageTierId, type TemplateCardType } from './pledge-card-templates'
import {
  invitationDetailsReady,
  invitationHostName,
  invitationLocation,
  invitationMapsUrl,
  invitationPartner2Required,
} from './invitation-event-details'
import { getOrdersForUser, orderRowToStoredOrder } from '@/lib/payments/orders'
import type { StoredOrder } from '@/lib/cart-storage'
import type { SiteDoc } from '@/lib/builder/types'
import type { Treatment } from '@/components/guests/InvitationVisual'
import type {
  DashboardStats,
  EventPledge,
  EventType,
  GiftRegistryItem,
  GuestbookEntry,
  GuestInvitation,
  GuestWithInvitations,
  LastSend,
  PledgeStats,
  PledgeWithContact,
  RsvpAnswer,
  RsvpQuestion,
  SeatableGuest,
  SeatingData,
  SeatingTable,
  SendChannel,
  WeddingEvent,
} from './types'

/** Normalize a raw rsvp_questions row (JSONB options) into a typed question. */
function toRsvpQuestion(row: Record<string, unknown>): RsvpQuestion {
  const rawOptions = Array.isArray(row.options) ? row.options : []
  return {
    id: row.id as string,
    event_id: (row.event_id as string | null) ?? null,
    prompt: (row.prompt as string) ?? '',
    description: (row.description as string | null) ?? null,
    kind: (row.kind as RsvpQuestion['kind']) ?? 'short_answer',
    required: Boolean(row.required),
    attending_only: Boolean(row.attending_only),
    options: rawOptions.map((o) => {
      const opt = (o ?? {}) as Record<string, unknown>
      return {
        id: (opt.id as string) ?? '',
        label: (opt.label as string) ?? '',
        description: (opt.description as string | null) ?? null,
      }
    }),
    sort_order: Number(row.sort_order ?? 0),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

/** Public personal RSVP/follow-up pages should show only a couple-uploaded
 *  photo. Bundled marketing/sample assets are not uploads, even if old seed
 *  data stored one in couple_profiles.cover_image_url. */
function uploadedCouplePhotoUrl(value: string | null | undefined): string | null {
  const url = value?.trim()
  if (!url) return null
  const lower = url.toLowerCase()
  if (
    lower.startsWith('/') ||
    lower.includes('/assets/') ||
    lower.includes('/auth-panel') ||
    lower.includes('/favicon') ||
    lower.includes('/icon-')
  ) {
    return null
  }
  return (lower.includes('/storage/v1/object/public/pledge-covers/') ||
    lower.includes('/storage/v1/object/sign/pledge-covers/')) &&
    lower.includes('/invite-cover-')
    ? url
    : null
}

export async function getEvents(): Promise<WeddingEvent[]> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { data, error } = await supabase
    .from('wedding_events')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })
    .order('starts_at', { ascending: true, nullsFirst: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as WeddingEvent[]
}

/**
 * Events for the checkout event picker. Unlike `getEvents()`, this never
 * redirects — guest/anonymous checkout has no couple account and simply gets
 * no picker (single implicit "unassigned" order, same as today).
 */
export async function getEventsForCheckout(
  locale: 'en' | 'sw' = 'en',
): Promise<{ id: string; name: string; eventTypeLabel: string }[]> {
  const user = await getDashboardUser()
  if (!user) return []
  const events = await getEvents()
  const label = locale === 'sw' ? eventTypeLabelSw : eventTypeLabel
  return events.map((e) => ({ id: e.id, name: e.name, eventTypeLabel: label(e.event_type) }))
}

/** Returns only the event ids that belong to this user — prevents attaching a
 *  guest (or an order) to another couple's event (the FK only checks
 *  existence, not ownership). */
export async function ownedEventIds(userId: string, eventIds: string[]): Promise<string[]> {
  if (eventIds.length === 0) return []
  const supabase = createDashboardClient()
  const { data } = await supabase
    .from('wedding_events')
    .select('id')
    .eq('user_id', userId)
    .in('id', eventIds)
  return (data ?? []).map((r) => r.id as string)
}

/** Verifies `eventId` belongs to `userId` before it's trusted on a paid order. */
export async function resolveOwnedEventId(
  userId: string,
  eventId?: string | null,
): Promise<string | null> {
  if (!eventId) return null
  try {
    const [owned] = await ownedEventIds(userId, [eventId])
    return owned ?? null
  } catch {
    // Malformed id (or transient query failure) — treat as unowned rather
    // than letting a payment request 500 on a bad eventId.
    return null
  }
}

/**
 * Resolve which event a new row (a pledge, etc.) belongs to: the explicit id
 * when it's owned by userId, else the couple's default (first) event — same
 * ordering used everywhere else for "the default event" (sort_order, then
 * start date). Returns null only for a couple with no events yet.
 */
export async function resolveEventIdOrDefault(
  userId: string,
  explicitEventId?: string | null,
): Promise<string | null> {
  if (explicitEventId) {
    const owned = await resolveOwnedEventId(userId, explicitEventId)
    if (owned) return owned
  }
  const supabase = createDashboardClient()
  const { data } = await supabase
    .from('wedding_events')
    .select('id')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('starts_at', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle<{ id: string }>()
  return data?.id ?? null
}

/** All RSVP questions the couple has configured (per-event + general). */
export async function getRsvpQuestions(): Promise<RsvpQuestion[]> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { data, error } = await supabase
    .from('rsvp_questions')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => toRsvpQuestion(r as Record<string, unknown>))
}

/** A tally of guest answers to one question, for the management dashboard. */
export interface RsvpAnswerSummary {
  total: number
  /** For multiple_choice: response count per option label. */
  byOption: { label: string; count: number }[]
}

/** Answer tallies keyed by question_id, across all of the couple's questions. */
export async function getRsvpAnswerSummaries(): Promise<Record<string, RsvpAnswerSummary>> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { data, error } = await supabase
    .from('rsvp_answers')
    .select('question_id, answer_text, option_id')
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)

  const byQuestion: Record<string, { total: number; options: Map<string, number> }> = {}
  for (const a of (data ?? []) as { question_id: string; answer_text: string | null; option_id: string | null }[]) {
    const entry = (byQuestion[a.question_id] ??= { total: 0, options: new Map() })
    entry.total += 1
    if (a.option_id) {
      const label = (a.answer_text || 'Selected').split(':')[0]?.trim() || 'Selected'
      entry.options.set(label, (entry.options.get(label) ?? 0) + 1)
    }
  }

  const out: Record<string, RsvpAnswerSummary> = {}
  for (const [qid, e] of Object.entries(byQuestion)) {
    out[qid] = {
      total: e.total,
      byOption: [...e.options.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    }
  }
  return out
}

/** Per-event RSVP tallies for the management dashboard donut. */
export interface RsvpEventSummary {
  event: WeddingEvent
  invited: number
  accepted: number
  declined: number
  maybe: number
  noResponse: number
}

export async function getRsvpEventSummaries(): Promise<RsvpEventSummary[]> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const [{ data: events, error: eErr }, { data: invitations, error: iErr }] = await Promise.all([
    supabase
      .from('wedding_events')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true }),
    supabase.from('guest_invitations').select('event_id, rsvp_status').eq('user_id', user.id),
  ])
  if (eErr) throw new Error(eErr.message)
  if (iErr) throw new Error(iErr.message)

  const byEvent = new Map<string, { invited: number; accepted: number; declined: number; maybe: number }>()
  for (const inv of (invitations ?? []) as { event_id: string; rsvp_status: string }[]) {
    const t = byEvent.get(inv.event_id) ?? { invited: 0, accepted: 0, declined: 0, maybe: 0 }
    t.invited += 1
    if (inv.rsvp_status === 'attending') t.accepted += 1
    else if (inv.rsvp_status === 'declined') t.declined += 1
    else if (inv.rsvp_status === 'maybe') t.maybe += 1
    byEvent.set(inv.event_id, t)
  }

  return ((events ?? []) as WeddingEvent[]).map((event) => {
    const t = byEvent.get(event.id) ?? { invited: 0, accepted: 0, declined: 0, maybe: 0 }
    return {
      event,
      invited: t.invited,
      accepted: t.accepted,
      declined: t.declined,
      maybe: t.maybe,
      noResponse: Math.max(0, t.invited - t.accepted - t.declined - t.maybe),
    }
  })
}

export async function getGuestsWithInvitations(): Promise<GuestWithInvitations[]> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()

  const [{ data: guests, error: gErr }, { data: invitations, error: iErr }] = await Promise.all([
    supabase
      .from('guest_contacts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase.from('guest_invitations').select('*').eq('user_id', user.id),
  ])
  if (gErr) throw new Error(gErr.message)
  if (iErr) throw new Error(iErr.message)

  const byGuest = new Map<string, GuestInvitation[]>()
  for (const inv of (invitations ?? []) as GuestInvitation[]) {
    const list = byGuest.get(inv.guest_contact_id) ?? []
    list.push(inv)
    byGuest.set(inv.guest_contact_id, list)
  }

  return ((guests ?? []) as GuestWithInvitations[]).map((g) => ({
    ...g,
    invitations: byGuest.get(g.id) ?? [],
  }))
}

/** Which event(s) each guest has a logged send for — keyed by guest_contact_id.
 *  Powers per-event "Sent"/"Not sent" on the guest list when scoped to one
 *  event. Rows that predate event-scoping have a NULL event_id and are
 *  omitted here (see 20260705000002_opuspass_event_scoped_invites.sql). */
export async function getSentEventIdsByGuest(): Promise<Record<string, string[]>> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { data } = await supabase
    .from('guest_message_log')
    .select('guest_contact_id, event_id')
    .eq('user_id', user.id)
    .not('event_id', 'is', null)

  const map: Record<string, string[]> = {}
  for (const row of (data ?? []) as { guest_contact_id: string; event_id: string }[]) {
    const list = map[row.guest_contact_id] ?? []
    if (!list.includes(row.event_id)) list.push(row.event_id)
    map[row.guest_contact_id] = list
  }
  return map
}

/** When/how each guest was last contacted — keyed by guest_contact_id.
 *  Powers the "Replied via" column on the RSVP tracker. Latest send wins. */
export async function getLastSendByGuest(): Promise<Record<string, LastSend>> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { data } = await supabase
    .from('guest_message_log')
    .select('guest_contact_id, channel, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const map: Record<string, LastSend> = {}
  for (const row of (data ?? []) as {
    guest_contact_id: string
    channel: SendChannel
    created_at: string
  }[]) {
    // Rows arrive newest-first, so the first one seen per guest is the latest.
    if (!map[row.guest_contact_id]) {
      map[row.guest_contact_id] = { channel: row.channel, at: row.created_at }
    }
  }
  return map
}

export async function getStats(): Promise<DashboardStats> {
  const guests = await getGuestsWithInvitations()

  let attending = 0
  let declined = 0
  let maybe = 0
  let pending = 0
  let expectedHeadcount = 0
  let invitedGuests = 0
  let respondedInvites = 0
  let totalInvites = 0
  const meals = new Map<string, number>()

  for (const guest of guests) {
    if (guest.invitations.length > 0) invitedGuests += 1
    for (const inv of guest.invitations) {
      totalInvites += 1
      switch (inv.rsvp_status) {
        case 'attending':
          attending += 1
          respondedInvites += 1
          expectedHeadcount += inv.party_size
          if (inv.meal_choice) meals.set(inv.meal_choice, (meals.get(inv.meal_choice) ?? 0) + inv.party_size)
          break
        case 'declined':
          declined += 1
          respondedInvites += 1
          break
        case 'maybe':
          maybe += 1
          respondedInvites += 1
          break
        default:
          pending += 1
      }
    }
  }

  return {
    totalGuests: guests.length,
    invitedGuests,
    attending,
    declined,
    maybe,
    pending,
    expectedHeadcount,
    responseRate: totalInvites === 0 ? 0 : Math.round((respondedInvites / totalInvites) * 100),
    mealBreakdown: [...meals.entries()]
      .map(([choice, count]) => ({ choice, count }))
      .sort((a, b) => b.count - a.count),
  }
}

// ──────────────────────────────── Seat collection ────────────────────────────────

/**
 * The seating planner for one event: its tables, plus every attending guest
 * party (confirmed roster only) tagged with the table they're seated at — or
 * null when still in the "to be seated" pool. Returns null when the event isn't
 * found / not owned by the signed-in couple.
 *
 * Seats a party occupies come from their attending invitation's `party_size`
 * (live, not denormalized), so editing a headcount updates the plan immediately.
 */
export async function getSeatingData(eventId: string): Promise<SeatingData | null> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()

  const { data: event } = await supabase
    .from('wedding_events')
    .select('*')
    .eq('id', eventId)
    .eq('user_id', user.id)
    .maybeSingle<WeddingEvent>()
  if (!event) return null

  const [{ data: tables, error: tErr }, { data: invitations, error: iErr }, { data: assignments, error: aErr }] =
    await Promise.all([
      supabase
        .from('seating_tables')
        .select('*')
        .eq('user_id', user.id)
        .eq('event_id', eventId)
        .order('is_head', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('guest_invitations')
        .select('guest_contact_id, party_size, meal_choice, dietary_notes')
        .eq('user_id', user.id)
        .eq('event_id', eventId)
        .eq('rsvp_status', 'attending'),
      supabase
        .from('seating_assignments')
        .select('guest_contact_id, table_id')
        .eq('user_id', user.id)
        .eq('event_id', eventId),
    ])
  if (tErr) throw new Error(tErr.message)
  if (iErr) throw new Error(iErr.message)
  if (aErr) throw new Error(aErr.message)

  const attending = (invitations ?? []) as {
    guest_contact_id: string
    party_size: number
    meal_choice: string | null
    dietary_notes: string | null
  }[]

  // Name + group for each attending guest (skip public self-RSVPs awaiting review).
  const guestIds = attending.map((i) => i.guest_contact_id)
  const contactById = new Map<string, { full_name: string; group_tag: string | null }>()
  if (guestIds.length > 0) {
    const { data: contacts } = await supabase
      .from('guest_contacts')
      .select('id, full_name, group_tag, review_status')
      .eq('user_id', user.id)
      .in('id', guestIds)
    for (const c of (contacts ?? []) as {
      id: string
      full_name: string
      group_tag: string | null
      review_status: string
    }[]) {
      if (c.review_status === 'unconfirmed') continue
      contactById.set(c.id, { full_name: c.full_name, group_tag: c.group_tag })
    }
  }

  const tableById = new Map((tables ?? []).map((t) => [t.id as string, t as SeatingTable]))
  const tableByGuest = new Map<string, string>()
  for (const a of (assignments ?? []) as { guest_contact_id: string; table_id: string }[]) {
    // Ignore stale assignments whose table was removed.
    if (tableById.has(a.table_id)) tableByGuest.set(a.guest_contact_id, a.table_id)
  }

  const guests: SeatableGuest[] = attending
    .map((inv) => {
      const contact = contactById.get(inv.guest_contact_id)
      if (!contact) return null
      return {
        guest_contact_id: inv.guest_contact_id,
        full_name: contact.full_name,
        seats: Math.max(1, inv.party_size ?? 1),
        meal_choice: inv.meal_choice,
        dietary_notes: inv.dietary_notes,
        group_tag: contact.group_tag,
        table_id: tableByGuest.get(inv.guest_contact_id) ?? null,
      }
    })
    .filter((g): g is SeatableGuest => g !== null)
    .sort((a, b) => a.full_name.localeCompare(b.full_name))

  return { event, tables: (tables ?? []) as SeatingTable[], guests }
}

// ──────────────────────────────── Pledges ────────────────────────────────

/** Fields selected from guest_contacts to enrich each pledge row. */
interface PledgeContactRow {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  whatsapp_phone: string | null
  group_tag: string | null
  max_party_size: number
  public_token: string
}

export interface PledgeScope {
  /** Scope to one event. Omit for every pledge across events. */
  eventId?: string
  /**
   * Also include legacy rows with no event_id (pledges recorded before the
   * couple had events). Pass true when eventId is the couple's default
   * (first) event so those rows stay visible somewhere.
   */
  includeUnassigned?: boolean
}

export async function getPledges(scope: PledgeScope = {}): Promise<PledgeWithContact[]> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()

  let pledgeQuery = supabase
    .from('event_pledges')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (scope.eventId) {
    pledgeQuery = scope.includeUnassigned
      ? pledgeQuery.or(`event_id.eq.${scope.eventId},event_id.is.null`)
      : pledgeQuery.eq('event_id', scope.eventId)
  }

  const [{ data: pledges, error: pErr }, { data: contacts, error: cErr }] = await Promise.all([
    pledgeQuery,
    supabase
      .from('guest_contacts')
      .select('id, full_name, email, phone, whatsapp_phone, group_tag, max_party_size, public_token')
      .eq('user_id', user.id),
  ])
  if (pErr) throw new Error(pErr.message)
  if (cErr) throw new Error(cErr.message)

  const byId = new Map<string, PledgeContactRow>(
    ((contacts ?? []) as PledgeContactRow[]).map((c) => [c.id, c]),
  )

  return ((pledges ?? []) as EventPledge[]).map((p) => {
    const c = byId.get(p.guest_contact_id)
    return {
      ...p,
      pledged_amount: Number(p.pledged_amount),
      amount_received: Number(p.amount_received),
      full_name: c?.full_name ?? 'Contributor',
      email: c?.email ?? null,
      phone: c?.phone ?? null,
      whatsapp_phone: c?.whatsapp_phone ?? null,
      group_tag: c?.group_tag ?? null,
      max_party_size: Math.min(2, Math.max(1, c?.max_party_size ?? 1)),
      public_token: c?.public_token ?? '',
    }
  })
}

export async function getPledgeStats(scope: PledgeScope = {}): Promise<PledgeStats> {
  return pledgeStatsFrom(await getPledges(scope))
}

/** Pure aggregation over an already-fetched pledge list — use this instead of
 *  getPledgeStats when the caller already has the pledges, to avoid a second
 *  identical query. Totals are in TZS: each pledge's amount is converted
 *  from its own currency before summing, so a mix of TZS/USD/KES/EUR
 *  pledges doesn't get added together as if they were the same currency. */
export function pledgeStatsFrom(pledges: PledgeWithContact[]): PledgeStats {
  let totalPledged = 0
  let totalReceived = 0
  let paidCount = 0
  let attendingCount = 0
  let cardsToPrepare = 0

  for (const p of pledges) {
    if (p.status !== 'declined') totalPledged += toTzs(p.pledged_amount, p.currency)
    totalReceived += toTzs(p.amount_received, p.currency)
    if (p.status === 'paid') paidCount += 1
    if (p.will_attend === 'yes') attendingCount += 1
    // Card prep queue: they paid, confirmed they're coming, card not yet sent.
    if (p.status === 'paid' && p.will_attend === 'yes' && p.card_status !== 'sent') {
      cardsToPrepare += 1
    }
  }

  return {
    totalPledges: pledges.length,
    totalPledged,
    totalReceived,
    outstanding: Math.max(0, totalPledged - totalReceived),
    paidCount,
    attendingCount,
    cardsToPrepare,
  }
}

/** The signed-in couple's public self-pledge token (shareable via WhatsApp). */
export async function getMyPledgeToken(): Promise<string | null> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { data } = await supabase
    .from('users')
    .select('pledge_token')
    .eq('id', user.id)
    .maybeSingle<{ pledge_token: string | null }>()
  return data?.pledge_token ?? null
}

/** Public, token-scoped couple summary for the self-pledge page (no auth). */
export interface PublicPledgeCouple {
  coupleName: string
  weddingDate: string | null
  city: string | null
  /** The verified/default event this public pledge page is rendering for. */
  eventId: string | null
  paymentInstructions: string | null
  paymentMethods: PledgePaymentMethod[]
  pageConfig: PledgePageConfig
}

/** `eventId` is the ?event= carried on the guest link — picks which event's
 *  cover to show (see resolveEventCover). When it is missing, fall back to the
 *  couple's default event so WhatsApp links sent before event-scoped CTA
 *  suffixes still render the actual pledge card instead of the generic panel. */
export async function getPublicPledgeCouple(token: string, eventId: string | null): Promise<PublicPledgeCouple | null> {
  const supabase = createDashboardClient()
  const { data: owner, error: ownerErr } = await supabase
    .from('users')
    .select('id')
    .eq('pledge_token', token)
    .maybeSingle<{ id: string }>()
  if (ownerErr) {
    console.error('[pledge] owner lookup failed', ownerErr)
    throw ownerErr
  }
  if (!owner) return null

  const { data: profile } = await supabase
    .from('couple_profiles')
    .select(
      'partner1_name, partner2_name, wedding_date, city, pledge_payment_instructions, pledge_payment_methods, pledge_page',
    )
    .eq('user_id', owner.id)
    .maybeSingle<{
      partner1_name: string | null
      partner2_name: string | null
      wedding_date: string | null
      city: string | null
      pledge_payment_instructions: string | null
      pledge_payment_methods: PledgePaymentMethod[] | null
      pledge_page: PledgePageConfig | null
    }>()

  // Guests see the pledge page as a personal ask from the couple, not a legal
  // document — first names read warmer than full names here.
  const names = [profile?.partner1_name, profile?.partner2_name].filter(Boolean).map((n) => firstNameOf(n!))
  const coupleName = names.length ? names.join(' & ') : await fallbackCoupleNameFromEvent(supabase, owner.id)
  const storedPage = profile?.pledge_page ?? {}
  const resolvedEventId = await resolveEventIdOrDefault(owner.id, eventId)
  return {
    coupleName,
    weddingDate: profile?.wedding_date ?? null,
    city: profile?.city ?? null,
    eventId: resolvedEventId,
    paymentInstructions: profile?.pledge_payment_instructions ?? null,
    paymentMethods: profile?.pledge_payment_methods ?? [],
    pageConfig: { ...storedPage, ...resolveEventCover(storedPage, resolvedEventId) },
  }
}

/** No partner names on the profile? Fall back to the couple's earliest event's
 *  own title (e.g. "Asha & Juma's Wedding") before the generic placeholder. */
export async function fallbackCoupleNameFromEvent(
  supabase: ReturnType<typeof createDashboardClient>,
  userId: string,
): Promise<string> {
  const { data: primaryEvent } = await supabase
    .from('wedding_events')
    .select('name')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('starts_at', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle<{ name: string | null }>()
  return primaryEvent?.name?.trim() || 'The Couple'
}

/** The signed-in couple's saved pledge-page config, with the cover resolved
 *  for the given event (each event can have its own pledge card cover — see
 *  resolveEventCover). Pass the currently-selected event id, or null for
 *  couples with no events. */
export async function getMyPledgePageConfig(eventId: string | null): Promise<PledgePageConfig> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { data } = await supabase
    .from('couple_profiles')
    .select('pledge_page')
    .eq('user_id', user.id)
    .maybeSingle<{ pledge_page: PledgePageConfig | null }>()
  const stored = data?.pledge_page ?? {}
  return { ...stored, ...resolveEventCover(stored, eventId) }
}

/** The signed-in couple's saved Thank You card selection for one event —
 *  mirrors getMyPledgePageConfig, reading thank_you_config instead. */
export async function getMyThankYouCardConfig(
  eventId: string | null,
): Promise<{
  coverImageUrl: string | null
  coverIsFullTemplate: boolean
  templateId: string | null
  templateName: string | null
}> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { data } = await supabase
    .from('couple_profiles')
    .select('thank_you_config')
    .eq('user_id', user.id)
    .maybeSingle<{ thank_you_config: ThankYouCardConfig | null }>()
  return resolveThankYouCover(data?.thank_you_config ?? null, eventId)
}

/** The signed-in couple's saved Contact Collector page customizations. */
export async function getMyCollectorPageConfig(): Promise<PledgePageConfig> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { data } = await supabase
    .from('couple_profiles')
    .select('collector_page')
    .eq('user_id', user.id)
    .maybeSingle<{ collector_page: PledgePageConfig | null }>()
  return data?.collector_page ?? {}
}

export interface CoupleProfileLite {
  partner1_name: string | null
  partner2_name: string | null
  wedding_date: string | null
  whatsapp_phone: string | null
  city: string | null
  pledge_payment_instructions: string | null
  pledge_payment_methods: PledgePaymentMethod[] | null
  pledge_goal_amount: number | null
  pledge_page: PledgePageConfig | null
}

export async function getCoupleProfile(): Promise<CoupleProfileLite | null> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { data } = await supabase
    .from('couple_profiles')
    .select(
      'partner1_name, partner2_name, wedding_date, whatsapp_phone, city, pledge_payment_instructions, pledge_payment_methods, pledge_goal_amount, pledge_page',
    )
    .eq('user_id', user.id)
    .maybeSingle<CoupleProfileLite>()
  return data ?? null
}

export function coupleDisplayName(profile: CoupleProfileLite | null): string {
  if (!profile) return 'The Couple'
  const names = [profile.partner1_name, profile.partner2_name].filter(Boolean)
  if (names.length === 0) return 'The Couple'
  return names.join(' & ')
}

/** Just the couple's given names (e.g. "Jonathan & Jenifer") — for greetings
 *  where the full "Jonathan David & Jenifer Kasala" reads too long. */
export function coupleFirstNames(profile: CoupleProfileLite | null): string {
  if (!profile) return 'The Couple'
  const names = [profile.partner1_name, profile.partner2_name].filter(Boolean) as string[]
  if (names.length === 0) return 'The Couple'
  return names.map(firstNameOf).join(' & ')
}

/**
 * The celebrant names printed on the entrance-pass ticket and used for the
 * pass message's couple placeholder — always FIRST names when derived from
 * structured name fields ("Claudia & Daniel", never full names).
 *
 * Precedence: the event's own partner names (most specific — a multi-event
 * account celebrates different people per event) → the couple's confirmed
 * host-name override (free text, kept verbatim) → profile partner first
 * names → the event's display name. Shared by the ticket image, the real
 * send and the dashboard preview so all three always agree.
 */
export function entranceCoupleName(
  event: { name: string; partner1_name: string | null; partner2_name: string | null },
  profile: { partner1_name: string | null; partner2_name: string | null; invite_host_name: string | null } | null,
): string {
  const eventNames = [event.partner1_name, event.partner2_name].filter(Boolean) as string[]
  if (eventNames.length) return eventNames.map(firstNameOf).join(' & ')
  const hostOverride = profile?.invite_host_name?.trim()
  if (hostOverride) return hostOverride
  const profileNames = [profile?.partner1_name, profile?.partner2_name].filter(Boolean) as string[]
  if (profileNames.length) return profileNames.map(firstNameOf).join(' & ')
  return event.name
}

/** The signed-in couple's account-wide public-sharing state (also backs the
 *  wedding-website builder's publish flow) — for the Privacy settings page.
 *  The invite hub itself is event-scoped; see getInviteShareInfo. */
export async function getPublicShareInfo(): Promise<{ slug: string | null; enabled: boolean }> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { data } = await supabase
    .from('couple_profiles')
    .select('public_slug, public_sharing_enabled')
    .eq('user_id', user.id)
    .maybeSingle<{ public_slug: string | null; public_sharing_enabled: boolean | null }>()
  return { slug: data?.public_slug ?? null, enabled: data?.public_sharing_enabled ?? false }
}

/** The signed-in couple's Contact Collector token (shareable via WhatsApp). */
export async function getMyCollectorToken(): Promise<string | null> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { data } = await supabase
    .from('users')
    .select('collector_token')
    .eq('id', user.id)
    .maybeSingle<{ collector_token: string | null }>()
  return data?.collector_token ?? null
}

/** Public, token-scoped fetch for the guest RSVP page (no auth). */
export interface PublicRsvpData {
  guest: {
    id: string
    full_name: string
    max_party_size: number
    public_token: string
  }
  coupleName: string
  weddingDate: string | null
  coverImageUrl: string | null
  events: (WeddingEvent & { invitation: GuestInvitation })[]
  /** Per-event follow-up questions, keyed by event_id. */
  questionsByEvent: Record<string, RsvpQuestion[]>
  /** General questions asked to everyone who RSVPs (event_id NULL). */
  generalQuestions: RsvpQuestion[]
  /** Prior answers keyed by guest_invitation_id -> question_id -> answer. */
  answers: Record<string, Record<string, RsvpAnswer>>
}

export async function getPublicRsvpData(token: string): Promise<PublicRsvpData | null> {
  const supabase = createDashboardClient()

  const { data: guest } = await supabase
    .from('guest_contacts')
    .select('id, user_id, full_name, max_party_size, public_token')
    .eq('public_token', token)
    .maybeSingle<{
      id: string
      user_id: string
      full_name: string
      max_party_size: number
      public_token: string
    }>()
  if (!guest) return null

  const { data: invitations } = await supabase
    .from('guest_invitations')
    .select('*')
    .eq('guest_contact_id', guest.id)

  const invs = (invitations ?? []) as GuestInvitation[]
  if (invs.length === 0) {
    return {
      guest: {
        id: guest.id,
        full_name: guest.full_name,
        max_party_size: guest.max_party_size,
        public_token: guest.public_token,
      },
      coupleName: 'The Couple',
      weddingDate: null,
      coverImageUrl: null,
      events: [],
      questionsByEvent: {},
      generalQuestions: [],
      answers: {},
    }
  }

  const eventIds = invs.map((i) => i.event_id)
  const invitationIds = invs.map((i) => i.id)
  const [{ data: events }, { data: profile }, { data: questionRows }, { data: answerRows }] = await Promise.all([
    // Scope to the guest's owner so a public page can only ever show this couple's events.
    supabase.from('wedding_events').select('*').eq('user_id', guest.user_id).in('id', eventIds),
    supabase
      .from('couple_profiles')
      .select('partner1_name, partner2_name, wedding_date, cover_image_url')
      .eq('user_id', guest.user_id)
      .maybeSingle<{
        partner1_name: string | null
        partner2_name: string | null
        wedding_date: string | null
        cover_image_url: string | null
      }>(),
    // General questions (event_id NULL) + follow-ups for the guest's events.
    supabase
      .from('rsvp_questions')
      .select('*')
      .eq('user_id', guest.user_id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase.from('rsvp_answers').select('*').in('guest_invitation_id', invitationIds),
  ])

  const allQuestions = (questionRows ?? []).map((r) => toRsvpQuestion(r as Record<string, unknown>))
  const eventIdSet = new Set(eventIds)
  const questionsByEvent: Record<string, RsvpQuestion[]> = {}
  const generalQuestions: RsvpQuestion[] = []
  for (const q of allQuestions) {
    if (q.event_id === null) {
      generalQuestions.push(q)
    } else if (eventIdSet.has(q.event_id)) {
      ;(questionsByEvent[q.event_id] ??= []).push(q)
    }
  }

  const answers: Record<string, Record<string, RsvpAnswer>> = {}
  for (const a of (answerRows ?? []) as RsvpAnswer[]) {
    ;(answers[a.guest_invitation_id] ??= {})[a.question_id] = a
  }

  const eventById = new Map((events ?? []).map((e) => [e.id, e as WeddingEvent]))
  const merged = invs
    .map((inv) => {
      const ev = eventById.get(inv.event_id)
      return ev ? { ...ev, invitation: inv } : null
    })
    .filter((x): x is WeddingEvent & { invitation: GuestInvitation } => x !== null)
    .sort((a, b) => a.sort_order - b.sort_order)

  const names = [profile?.partner1_name, profile?.partner2_name].filter(Boolean).map((n) => firstNameOf(n!))
  return {
    guest: {
      id: guest.id,
      full_name: guest.full_name,
      max_party_size: guest.max_party_size,
      public_token: guest.public_token,
    },
    coupleName: names.length ? names.join(' & ') : 'The Couple',
    weddingDate: profile?.wedding_date ?? null,
    coverImageUrl: uploadedCouplePhotoUrl(profile?.cover_image_url),
    events: merged,
    questionsByEvent,
    generalQuestions,
    answers,
  }
}

/** WhatsApp-message-ready values for the entrance-pass template's
 *  {{2}}-{{6}} placeholders — Swahili date/time, and always a non-empty
 *  string (falls back to "will be announced" copy) since Meta rejects
 *  empty template parameters. Shared by the real send (sendEntrancePasses
 *  in actions.ts) and its in-dashboard preview, so what the couple previews
 *  is exactly what gets sent. */
export interface EntrancePassTemplateVars {
  eventCategory: string
  dateLabel: string
  timeLabel: string
  venue: string
}

export function computeEntrancePassVars(event: {
  starts_at: string | null
  event_type: EventType | null
  venue_name: string | null
  address: string | null
  city: string | null
}, categoryOverride: string | null): EntrancePassTemplateVars {
  const eventCategory = categoryOverride ?? eventTypeLabelSw(event.event_type ?? 'other')
  const dateLabel = formatLongDateSw(event.starts_at) || 'Tarehe itatangazwa hivi karibuni'
  const hasTime = hasEatTimeComponent(event.starts_at)
  const timeLabel = (hasTime && formatSwahiliTime(event.starts_at)) || 'Muda utatangazwa hivi karibuni'
  const venue = [event.venue_name, event.address, event.city].filter(Boolean).join(', ') || 'Mahali patatangazwa hivi karibuni'
  return { eventCategory, dateLabel, timeLabel, venue }
}

export interface EntrancePassData {
  guestName: string
  invitationId: string
  guestContactId: string
  /** Celebrant first names ("Claudia & Daniel") — see entranceCoupleName. */
  coupleName: string
  eventName: string
  /** Venue name only (the editable "Venue" field) — the ticket's first venue
   *  row. Deliberately excludes the event's free-form `address`, which isn't
   *  part of the ticket-details form the couple edits. */
  venue: string | null
  /** City on its own — drawn on the ticket's second venue row. */
  city: string | null
  /** Formatted in the ticket's language (formatLongDate vs formatLongDateSw). */
  dateLabel: string | null
  /** Ticket intro line for the event's category, already in the ticket's
   *  language — "The sendoff of" / "Sendoff ya". */
  introLabel: string
  /** Language the ticket image renders in (labels + date formatting). */
  ticketLanguage: TicketLanguage
  /** Seats this invitation admits (>= 1) — drives the ticket's
   *  SINGLE / DOUBLE label. */
  partySize: number
}

/**
 * Data for the guest-facing entrance-pass ticket image
 * (/entrance-pass/[token]/image). Returns null unless the guest is confirmed
 * ATTENDING the given event — a ticket only exists for guests who said yes,
 * so a guest_contacts token guessed for the wrong event or a not-yet-attending
 * guest gets nothing rather than a leaked venue/QR.
 */
export async function getEntrancePassData(token: string, eventId: string): Promise<EntrancePassData | null> {
  const supabase = createDashboardClient()

  const { data: guest } = await supabase
    .from('guest_contacts')
    .select('id, user_id, full_name')
    .eq('public_token', token)
    .maybeSingle<{ id: string; user_id: string; full_name: string }>()
  if (!guest) return null

  const { data: invitation } = await supabase
    .from('guest_invitations')
    .select('id, rsvp_status, party_size')
    .eq('guest_contact_id', guest.id)
    .eq('event_id', eventId)
    .maybeSingle<{ id: string; rsvp_status: string; party_size: number | null }>()
  if (!invitation || invitation.rsvp_status !== 'attending') return null

  const { data: event } = await supabase
    .from('wedding_events')
    .select('name, event_type, partner1_name, partner2_name, ticket_language, venue_name, address, city, starts_at')
    .eq('id', eventId)
    .eq('user_id', guest.user_id)
    .maybeSingle<{
      name: string
      event_type: string
      partner1_name: string | null
      partner2_name: string | null
      ticket_language: TicketLanguage | null
      venue_name: string | null
      address: string | null
      city: string | null
      starts_at: string | null
    }>()
  if (!event) return null

  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('partner1_name, partner2_name, invite_host_name')
    .eq('user_id', guest.user_id)
    .maybeSingle<{ partner1_name: string | null; partner2_name: string | null; invite_host_name: string | null }>()

  const lang: TicketLanguage = event.ticket_language === 'sw' ? 'sw' : 'en'

  return {
    guestName: guest.full_name,
    invitationId: invitation.id,
    guestContactId: guest.id,
    coupleName: entranceCoupleName(event, profile),
    eventName: event.name,
    venue: event.venue_name || null,
    city: event.city || null,
    dateLabel: (lang === 'sw' ? formatLongDateSw(event.starts_at) : formatTicketDate(event.starts_at)) || null,
    introLabel: ticketIntroLabel(event.event_type, lang),
    ticketLanguage: lang,
    partySize: Math.max(1, invitation.party_size ?? 1),
  }
}

/** What the ticket renderer needs, minus anything guest-specific. */
export type EntrancePassPreviewData = Pick<
  EntrancePassData,
  'coupleName' | 'venue' | 'city' | 'dateLabel' | 'introLabel' | 'ticketLanguage' | 'partySize'
>

/**
 * The couple's own event-level ticket preview — the same artwork a guest
 * gets, drawn from the event's saved details, with no guest name, party
 * size or real QR involved. Backs the Pass Ticket tab's thumbnail so it
 * always reflects what was last saved, even before anyone is attending.
 * Owner-scoped: returns null for an event this user doesn't own.
 */
export async function getEntrancePassPreviewData(eventId: string): Promise<EntrancePassPreviewData | null> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()

  const { data: event } = await supabase
    .from('wedding_events')
    .select('name, event_type, partner1_name, partner2_name, ticket_language, venue_name, address, city, starts_at')
    .eq('id', eventId)
    .eq('user_id', user.id)
    .maybeSingle<{
      name: string
      event_type: string
      partner1_name: string | null
      partner2_name: string | null
      ticket_language: TicketLanguage | null
      venue_name: string | null
      address: string | null
      city: string | null
      starts_at: string | null
    }>()
  if (!event) return null

  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('partner1_name, partner2_name, invite_host_name')
    .eq('user_id', user.id)
    .maybeSingle<{ partner1_name: string | null; partner2_name: string | null; invite_host_name: string | null }>()

  const lang: TicketLanguage = event.ticket_language === 'sw' ? 'sw' : 'en'
  return {
    coupleName: entranceCoupleName(event, profile),
    venue: event.venue_name || null,
    city: event.city || null,
    dateLabel: (lang === 'sw' ? formatLongDateSw(event.starts_at) : formatTicketDate(event.starts_at)) || null,
    introLabel: ticketIntroLabel(event.event_type, lang),
    ticketLanguage: lang,
    // The preview is a sample of the design, not anyone's actual admission.
    partySize: 1,
  }
}

// ──────────────────────────── Public invitation hub ────────────────────────────

/** A non-PII projection of an event for the public /i/<slug> hub + OG card. */
export interface PublicInviteEvent {
  id: string
  name: string
  event_type: string
  description: string | null
  venue_name: string | null
  address: string | null
  starts_at: string | null
  dress_code: string | null
}

export interface PublicInviteData {
  slug: string
  coupleName: string
  weddingDate: string | null
  city: string | null
  coverImageUrl: string | null
  coverIsFullTemplate: boolean
  /** True once this event's date has passed — the hub closes RSVPs. */
  hasPassed: boolean
  /** This event accepts RSVPs AND its date hasn't passed. */
  allowRsvp: boolean
  event: PublicInviteEvent
  /** General + this-event's own follow-up questions, for the hub's RSVP form. */
  generalQuestions: RsvpQuestion[]
}

/**
 * Public, slug-scoped fetch for one event's shareable invite hub (no auth, no
 * PII). Tied to a single wedding_events row (its own invite_slug/
 * invite_sharing_enabled) rather than the couple account-wide — a multi-event
 * couple gets one link per event, so a guest's RSVP here only ever applies to
 * the event the link was actually for. See
 * 20260718000003_opuspass_invite_event_scoped_link.sql. Returns null when the
 * slug is unknown or sharing is off, so the page 404s.
 */
/**
 * Public, slug-scoped fetch of a PUBLISHED wedding website (the full SiteDoc).
 * Returns null when the slug is unknown, the site isn't published, or sharing
 * is disabled — so a revoked link 404s. Service-role read; the doc is non-PII.
 */
export async function getPublishedWebsite(slug: string): Promise<SiteDoc | null> {
  if (!slug) return null
  const supabase = createDashboardClient()
  const { data, error } = await supabase
    .from('couple_profiles')
    .select('website_doc, website_published_at, public_sharing_enabled')
    .eq('public_slug', slug)
    .maybeSingle<{
      website_doc: SiteDoc | null
      website_published_at: string | null
      public_sharing_enabled: boolean
    }>()
  if (error) {
    console.error('[published-website] lookup failed', error)
    return null
  }
  if (!data || !data.website_doc || !data.website_published_at || !data.public_sharing_enabled) {
    return null
  }
  // Defensive: only serve a well-formed v2 doc (composeDoc requires meta). A
  // malformed/legacy doc 404s instead of 500-ing the public route.
  if (!data.website_doc.meta || !Array.isArray(data.website_doc.sections)) return null
  return data.website_doc
}

export async function getPublicInvite(slug: string): Promise<PublicInviteData | null> {
  if (!slug) return null
  const supabase = createDashboardClient()

  const { data: event, error } = await supabase
    .from('wedding_events')
    .select(
      'id, user_id, name, event_type, description, venue_name, address, city, starts_at, ends_at, dress_code, allow_rsvp, invite_sharing_enabled',
    )
    .eq('invite_slug', slug)
    .maybeSingle<{
      id: string
      user_id: string
      name: string
      event_type: string
      description: string | null
      venue_name: string | null
      address: string | null
      city: string | null
      starts_at: string | null
      ends_at: string | null
      dress_code: string | null
      allow_rsvp: boolean
      invite_sharing_enabled: boolean
    }>()
  if (error) {
    console.error('[public-invite] event lookup failed', error)
    throw error
  }
  if (!event || !event.invite_sharing_enabled) return null

  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('partner1_name, partner2_name, cover_image_url, pledge_page')
    .eq('user_id', event.user_id)
    .maybeSingle<{
      partner1_name: string | null
      partner2_name: string | null
      cover_image_url: string | null
      pledge_page: PledgePageConfig | null
    }>()

  // This event's own follow-ups, plus the couple's general questions (asked
  // regardless of event) — mirrors what the couple configured for this event
  // in RSVP setup, not just the account-wide general set.
  const { data: questionRows } = await supabase
    .from('rsvp_questions')
    .select('*')
    .eq('user_id', event.user_id)
    .or(`event_id.eq.${event.id},event_id.is.null`)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  const generalQuestions = (questionRows ?? []).map((r) => toRsvpQuestion(r as Record<string, unknown>))

  const names = [profile?.partner1_name, profile?.partner2_name]
    .filter(Boolean)
    .map((name) => firstNameOf(name!))
  const hasPassed = event.starts_at ? new Date(event.starts_at).getTime() < Date.now() : false
  const pledgeCover = resolveEventCover(profile?.pledge_page, event.id)
  const coverImageUrl = pledgeCover.coverImageUrl ?? profile?.cover_image_url ?? null

  return {
    slug,
    coupleName: names.length ? names.join(' & ') : 'The Couple',
    weddingDate: event.starts_at,
    city: event.city,
    coverImageUrl,
    coverIsFullTemplate: Boolean(pledgeCover.coverImageUrl && pledgeCover.coverIsFullTemplate),
    hasPassed,
    allowRsvp: !hasPassed && event.allow_rsvp,
    event: {
      id: event.id,
      name: event.name,
      event_type: event.event_type,
      description: event.description,
      venue_name: event.venue_name,
      address: event.address,
      starts_at: event.starts_at,
      dress_code: event.dress_code,
    },
    generalQuestions,
  }
}

/** One event's public invite/RSVP link — /rsvp/event/<slug>, distinct per event
 *  (getGuestbookShareInfo/getGiftRegistryShareInfo are the sibling lookups). */
export interface InviteShareInfo {
  slug: string | null
  enabled: boolean
}

async function reserveUniqueInviteSlugForEvent(
  supabase: ReturnType<typeof createDashboardClient>,
  userId: string,
  eventId: string,
  base: string,
): Promise<string> {
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`
    const { data, error } = await supabase
      .from('wedding_events')
      .select('id')
      .eq('user_id', userId)
      .eq('invite_slug', candidate)
      .neq('id', eventId)
      .maybeSingle<{ id: string }>()
    if (error) throw new Error(error.message)
    if (!data) return candidate
  }
  return `${base}-${Math.floor(Date.now() % 100000)}`
}

export async function getInviteShareInfo(eventId: string): Promise<InviteShareInfo> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { data, error } = await supabase
    .from('wedding_events')
    .select('name, invite_slug, invite_sharing_enabled')
    .eq('id', eventId)
    .eq('user_id', user.id)
    .maybeSingle<{ name: string; invite_slug: string | null; invite_sharing_enabled: boolean | null }>()
  if (error) throw new Error(error.message)
  if (!data) return { slug: null, enabled: false }

  const enabled = Boolean(data.invite_sharing_enabled)
  let slug = data.invite_slug
  const expectedSlugBase = eventSlugBase(data.name)
  if (enabled && (!slug || slugBaseOf(slug) !== expectedSlugBase)) {
    slug = await reserveUniqueInviteSlugForEvent(supabase, user.id, eventId, expectedSlugBase)
    const { error: updateErr } = await supabase
      .from('wedding_events')
      .update({ invite_slug: slug, updated_at: new Date().toISOString() })
      .eq('id', eventId)
      .eq('user_id', user.id)
    if (updateErr) throw new Error(updateErr.message)
  }

  return { slug, enabled }
}

// ──────────────────────────────────── Guestbook ─────────────────────────────────

/** Every guestbook entry for the signed-in couple, newest first (dashboard moderation queue). */
/** Guestbook messages for the couple's selected event (per the dashboard's
 *  event-scoping — see event-scope.ts). `eventId: null` returns every
 *  message regardless of event (0-event couples, or before a scope is
 *  resolved) — mirrors getGiftRegistryItems. */
export async function getGuestbookEntries(eventId: string | null): Promise<GuestbookEntry[]> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  let query = supabase.from('guestbook_entries').select('*').eq('user_id', user.id)
  if (eventId) query = query.eq('event_id', eventId)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) {
    console.error('[guestbook] list failed', error)
    return []
  }
  return (data ?? []) as GuestbookEntry[]
}

/**
 * Public, slug-scoped data for the standalone /guestbook/<slug> page.
 * Scoped to a single wedding_events row (its own guestbook_sharing_enabled
 * flag and guestbook_slug) rather than the couple-wide invite slug, so each
 * event has its own link and only shows that event's messages.
 *
 * Deliberately independent of the wedding-website builder: it doesn't
 * require a built/published website_doc, so guests can leave a message even
 * if the couple never touches the site builder. Returns null when the slug
 * is unknown or sharing is off, so the page 404s.
 */
export interface PublicGuestbookPage {
  slug: string
  coupleName: string
  coverImageUrl: string | null
  city: string | null
  entries: GuestbookEntry[]
}

export async function getPublicGuestbookPage(slug: string): Promise<PublicGuestbookPage | null> {
  if (!slug) return null
  const supabase = createDashboardClient()
  const { data: event, error: eventErr } = await supabase
    .from('wedding_events')
    .select('id, user_id, name, city, guestbook_sharing_enabled')
    .eq('guestbook_slug', slug)
    .maybeSingle<{
      id: string
      user_id: string
      name: string
      city: string | null
      guestbook_sharing_enabled: boolean
    }>()
  if (eventErr) {
    console.error('[guestbook] public page lookup failed', eventErr)
    return null
  }
  if (!event || !event.guestbook_sharing_enabled) return null

  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('cover_image_url')
    .eq('user_id', event.user_id)
    .maybeSingle<{ cover_image_url: string | null }>()

  const { data, error } = await supabase
    .from('guestbook_entries')
    .select('*')
    .eq('event_id', event.id)
    .eq('review_status', 'approved')
    .order('created_at', { ascending: false })
    .limit(60)
  if (error) {
    console.error('[guestbook] public list failed', error)
  }
  return {
    slug,
    coupleName: event.name,
    coverImageUrl: profile?.cover_image_url ?? null,
    city: event.city,
    entries: (data ?? []) as GuestbookEntry[],
  }
}

/** The guestbook's per-event public share link — /guestbook/<slug>, distinct
 *  from the account-wide invite-hub slug (getMyPublicInvite). */
export interface GuestbookShareInfo {
  slug: string | null
  enabled: boolean
}

export async function getGuestbookShareInfo(eventId: string): Promise<GuestbookShareInfo> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { data } = await supabase
    .from('wedding_events')
    .select('guestbook_slug, guestbook_sharing_enabled')
    .eq('id', eventId)
    .eq('user_id', user.id)
    .maybeSingle<{ guestbook_slug: string | null; guestbook_sharing_enabled: boolean | null }>()
  return { slug: data?.guestbook_slug ?? null, enabled: Boolean(data?.guestbook_sharing_enabled) }
}

// ─────────────────────────────── Gift registry ──────────────────────────────────

/** The manage-registry page's "hero" card — couple names, wedding date, and
 *  the registry's own customizable header/banner/photo/welcome message. Kept
 *  separate from MyPublicInvite (shared across RSVPs/guestbook) since these
 *  fields are registry-specific. */
export interface GiftRegistryHero {
  coupleName: string
  /** Couple's override for the displayed header — falls back to coupleName when unset. */
  registryHeader: string | null
  /**
   * The selected event's own start date (wedding_events.starts_at), not a
   * couple-level "wedding date" — a multi-event couple's registry countdown
   * should track whichever event is currently in scope. Supplied by the
   * caller (page.tsx already has the resolved event scope), not fetched here.
   */
  eventDate: string | null
  /** Wide banner photo behind the header. */
  registryBannerImageUrl: string | null
  /** Small circular photo overlapping the banner's bottom edge. */
  registryCoverImageUrl: string | null
  registryWelcomeMessage: string | null
}

/** Everything except eventDate, which the caller merges in from the resolved event scope.
 *  Scoped to a single wedding_events row — a multi-event couple gets a distinct hero
 *  (name, banner, cover, welcome message) per event, defaulting to that event's own
 *  `name` when no custom header override has been set for it. */
export async function getGiftRegistryHero(eventId: string): Promise<Omit<GiftRegistryHero, 'eventDate'>> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { data } = await supabase
    .from('wedding_events')
    .select('name, gift_registry_header, gift_registry_banner_image_url, gift_registry_cover_image_url, gift_registry_welcome_message')
    .eq('id', eventId)
    .eq('user_id', user.id)
    .maybeSingle<{
      name: string
      gift_registry_header: string | null
      gift_registry_banner_image_url: string | null
      gift_registry_cover_image_url: string | null
      gift_registry_welcome_message: string | null
    }>()
  return {
    coupleName: data?.gift_registry_header?.trim() || data?.name || 'The Couple',
    registryHeader: data?.gift_registry_header ?? null,
    registryBannerImageUrl: data?.gift_registry_banner_image_url ?? null,
    registryCoverImageUrl: data?.gift_registry_cover_image_url ?? null,
    registryWelcomeMessage: data?.gift_registry_welcome_message ?? null,
  }
}

/** The manage-registry page's per-event public share link — /gift-registry/<slug>,
 *  distinct from the account-wide invite-hub/guestbook slug (getMyPublicInvite). */
export interface GiftRegistryShareInfo {
  slug: string | null
  enabled: boolean
}

export async function getGiftRegistryShareInfo(eventId: string): Promise<GiftRegistryShareInfo> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { data } = await supabase
    .from('wedding_events')
    .select('gift_registry_slug, gift_registry_sharing_enabled')
    .eq('id', eventId)
    .eq('user_id', user.id)
    .maybeSingle<{ gift_registry_slug: string | null; gift_registry_sharing_enabled: boolean | null }>()
  return { slug: data?.gift_registry_slug ?? null, enabled: Boolean(data?.gift_registry_sharing_enabled) }
}

/** Count-only lookup (no row fetch) for the registry's "add your guest count" nudge. */
export async function getGuestCount(): Promise<number> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { count } = await supabase
    .from('guest_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
  return count ?? 0
}

/** Gifts for the couple's selected event (per the dashboard's event-scoping — see event-scope.ts).
 *  `eventId: null` returns every gift regardless of event (0-event couples, or before a scope is resolved). */
export async function getGiftRegistryItems(eventId: string | null): Promise<GiftRegistryItemWithClaims[]> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  let query = supabase.from('gift_registry_items').select('*').eq('user_id', user.id)
  if (eventId) query = query.eq('event_id', eventId)
  const { data, error } = await query.order('sort_order', { ascending: true }).order('created_at', { ascending: true })
  if (error) {
    console.error('[gift-registry] list failed', error)
    return []
  }
  return attachClaimCounts(supabase, (data ?? []) as GiftRegistryItem[])
}

/** One guest's claim on one unit of a gift — the couple-facing contact record. */
export interface GiftClaimant {
  name: string
  phone: string | null
  email: string | null
  claimedAt: string
}

/**
 * A gift with its total claimed-unit count and the list of claimants
 * attached. For quantity_requested <= 1 (the common case) this is derived
 * straight from the item's own claimed_by_* columns — for gifts asking for
 * more than one, it comes from gift_registry_claims (one row per guest who
 * claimed a unit). See attachClaimCounts.
 */
export type GiftRegistryItemWithClaims = GiftRegistryItem & { claimedCount: number; claimants: GiftClaimant[] }

/** Batches the gift_registry_claims lookup for every multi-unit item in one
 *  query rather than N+1, and folds a claimedCount + claimants list onto
 *  each item (single-unit items derive theirs from their own columns). */
async function attachClaimCounts(
  supabase: ReturnType<typeof createDashboardClient>,
  items: GiftRegistryItem[],
): Promise<GiftRegistryItemWithClaims[]> {
  const multiUnitIds = items.filter((i) => i.quantity_requested > 1).map((i) => i.id)
  const claimantsById = new Map<string, GiftClaimant[]>()
  if (multiUnitIds.length) {
    const { data } = await supabase
      .from('gift_registry_claims')
      .select('item_id, guest_name, guest_phone, guest_email, claimed_at')
      .in('item_id', multiUnitIds)
      .order('claimed_at', { ascending: true })
    for (const row of (data ?? []) as {
      item_id: string
      guest_name: string
      guest_phone: string | null
      guest_email: string | null
      claimed_at: string
    }[]) {
      const list = claimantsById.get(row.item_id) ?? []
      list.push({ name: row.guest_name, phone: row.guest_phone, email: row.guest_email, claimedAt: row.claimed_at })
      claimantsById.set(row.item_id, list)
    }
  }
  return items.map((i) => {
    const claimsTableEntries = claimantsById.get(i.id) ?? []
    // claimed_by_name is written for single-unit guest claims AND for the
    // host's "already have this" action (markGiftRegistryItemReceived) —
    // folding it in here (instead of gating it to quantity_requested <= 1)
    // keeps a guest's claim from being silently dropped once a gift's
    // quantity is bumped above 1. But the two cases mean different things:
    // a real guest's name is exactly one claimed unit, same as any row in
    // gift_registry_claims — only markGiftRegistryItemReceived's literal
    // 'You' means the whole request is satisfied, not just one unit.
    const legacyClaimant: GiftClaimant[] = i.claimed_by_name
      ? [{ name: i.claimed_by_name, phone: i.claimed_by_phone, email: i.claimed_by_email, claimedAt: i.claimed_at ?? i.created_at }]
      : []
    const claimants = [...legacyClaimant, ...claimsTableEntries]
    const claimedCount = i.claimed_by_name === 'You' ? Math.max(i.quantity_requested, claimants.length) : claimants.length
    return { ...i, claimedCount, claimants }
  })
}

/**
 * One row per guest claim, flattened across every gift the couple owns, for
 * the Claims management table. Unlike `GiftClaimant` (the read-only DTO
 * folded onto each gift card), this carries a stable identity — `claimId` +
 * `kind` — so the UI can target the right row for edit/delete: `kind:
 * 'claim'` rows live in gift_registry_claims (multi-unit gifts), `kind:
 * 'item'` rows are a single-unit gift's own claimed_by_* columns. The host's
 * own "already have this" marker (claimed_by_name === 'You') is excluded —
 * it isn't a guest.
 */
export interface GiftRegistryClaimRow {
  claimId: string
  kind: 'claim' | 'item'
  itemId: string
  itemTitle: string
  itemImageUrl: string | null
  guestName: string
  guestPhone: string | null
  guestEmail: string | null
  claimedAt: string
}

/** Every guest claim for the couple's selected event, newest first. See GiftRegistryClaimRow. */
export async function getGiftRegistryClaims(eventId: string | null): Promise<GiftRegistryClaimRow[]> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()

  let itemQuery = supabase
    .from('gift_registry_items')
    .select('id, title, image_urls, claimed_by_name, claimed_by_phone, claimed_by_email, claimed_at, created_at')
    .eq('user_id', user.id)
  if (eventId) itemQuery = itemQuery.eq('event_id', eventId)
  const { data: items, error: itemsError } = await itemQuery
  if (itemsError) {
    console.error('[gift-registry] claims item lookup failed', itemsError)
    return []
  }
  const rows = (items ?? []) as {
    id: string
    title: string
    image_urls: string[]
    claimed_by_name: string | null
    claimed_by_phone: string | null
    claimed_by_email: string | null
    claimed_at: string | null
    created_at: string
  }[]
  const itemIds = rows.map((i) => i.id)
  const titleById = new Map(rows.map((i) => [i.id, i.title]))
  const imageById = new Map(rows.map((i) => [i.id, i.image_urls[0] ?? null]))

  const claims: GiftRegistryClaimRow[] = rows
    .filter((i) => i.claimed_by_name && i.claimed_by_name !== 'You')
    .map((i) => ({
      claimId: i.id,
      kind: 'item' as const,
      itemId: i.id,
      itemTitle: i.title,
      itemImageUrl: i.image_urls[0] ?? null,
      guestName: i.claimed_by_name as string,
      guestPhone: i.claimed_by_phone,
      guestEmail: i.claimed_by_email,
      claimedAt: i.claimed_at ?? i.created_at,
    }))

  if (itemIds.length) {
    const { data: claimRows, error: claimsError } = await supabase
      .from('gift_registry_claims')
      .select('id, item_id, guest_name, guest_phone, guest_email, claimed_at')
      .in('item_id', itemIds)
    if (claimsError) {
      console.error('[gift-registry] claims lookup failed', claimsError)
    } else {
      for (const row of (claimRows ?? []) as {
        id: string
        item_id: string
        guest_name: string
        guest_phone: string | null
        guest_email: string | null
        claimed_at: string
      }[]) {
        claims.push({
          claimId: row.id,
          kind: 'claim',
          itemId: row.item_id,
          itemTitle: titleById.get(row.item_id) ?? '',
          itemImageUrl: imageById.get(row.item_id) ?? null,
          guestName: row.guest_name,
          guestPhone: row.guest_phone,
          guestEmail: row.guest_email,
          claimedAt: row.claimed_at,
        })
      }
    }
  }

  return claims.sort((a, b) => (a.claimedAt < b.claimedAt ? 1 : -1))
}

/**
 * Public, slug-scoped data for the standalone /gift-registry/<slug> page.
 * Scoped to a single wedding_events row (its own gift_registry_sharing_enabled
 * flag and gift_registry_slug) rather than the couple-wide invite/guestbook
 * slug, so each event has its own link and only shows that event's gifts.
 * Returns null when the slug is unknown or sharing is off, so the page 404s.
 */
export interface PublicGiftRegistryPage {
  slug: string
  coupleName: string
  registryHeader: string | null
  weddingDate: string | null
  registryBannerImageUrl: string | null
  registryCoverImageUrl: string | null
  registryWelcomeMessage: string | null
  items: GiftRegistryItemWithClaims[]
}

export async function getPublicGiftRegistryPage(slug: string): Promise<PublicGiftRegistryPage | null> {
  if (!slug) return null
  const supabase = createDashboardClient()
  const { data: event, error: eventErr } = await supabase
    .from('wedding_events')
    .select(
      'id, name, starts_at, gift_registry_sharing_enabled, gift_registry_header, gift_registry_banner_image_url, gift_registry_cover_image_url, gift_registry_welcome_message',
    )
    .eq('gift_registry_slug', slug)
    .maybeSingle<{
      id: string
      name: string
      starts_at: string | null
      gift_registry_sharing_enabled: boolean
      gift_registry_header: string | null
      gift_registry_banner_image_url: string | null
      gift_registry_cover_image_url: string | null
      gift_registry_welcome_message: string | null
    }>()
  if (eventErr) {
    console.error('[gift-registry] public page lookup failed', eventErr)
    return null
  }
  if (!event || !event.gift_registry_sharing_enabled) return null

  const { data, error } = await supabase
    .from('gift_registry_items')
    .select('*')
    .eq('event_id', event.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[gift-registry] public list failed', error)
  }
  // This page is public and unauthenticated — never let a guest's contact
  // info reach the client bundle, even though the UI doesn't render it.
  // React Server Components serialize the whole prop object to the browser,
  // so stripping has to happen here, not just in what JSX chooses to show.
  const items = (await attachClaimCounts(supabase, (data ?? []) as GiftRegistryItem[])).map((item) => ({
    ...item,
    claimed_by_phone: null,
    claimed_by_email: null,
    claimants: [],
  }))
  return {
    slug,
    coupleName: event.gift_registry_header?.trim() || event.name,
    registryHeader: event.gift_registry_header,
    weddingDate: event.starts_at,
    registryBannerImageUrl: event.gift_registry_banner_image_url,
    registryCoverImageUrl: event.gift_registry_cover_image_url,
    registryWelcomeMessage: event.gift_registry_welcome_message,
    items,
  }
}

/**
 * WhatsApp send entitlement = how many released invitation "credits" the couple
 * can use vs how many they've used, SCOPED TO ONE EVENT. Credits are the sum of
 * `guests` across paid invitation_orders assigned to this event ONLY AFTER
 * design approval/release (`fulfillment_status` ready/delivered). Payment alone
 * is not enough: the new commission lifecycle's equivalent unlock point is
 * APPROVED, not AWAITING_DEPOSIT/DEPOSIT_PAID.
 *
 * A couple can have released paid orders not yet linked to any event (bought before
 * event-scoping shipped, or a 2+-event couple who hasn't assigned them yet —
 * see `unassignedOrders`). Those never silently count toward any event's
 * quota; the couple must explicitly assign them.
 */
export interface WhatsAppEntitlement {
  /** Base purchased count from paid orders, before any admin adjustment —
   *  the same for both pools since one purchase grants one of each per guest. */
  basePurchased: number
  /** Invite pool's effective size: basePurchased + admin invite adjustments. */
  purchased: number
  used: number
  remaining: number
  hasPaidOrder: boolean
  /** The paid invitation card's hero image — used as the WhatsApp header. */
  cardImageUrl: string | null
  /** Authenticated URL for the couple's frozen released card. Page-preview
   *  only: real WhatsApp sends intentionally continue using `cardImageUrl`
   *  until the per-guest delivery switch lands. */
  releasedCardPreviewUrl: string | null
  /** Visual treatment — fallback thumbnail when the card has no hero image. */
  cardTreatment: Treatment | null
  /** The paid card's tier (e.g. "Signature"), for the "card purchased" badge. */
  cardTier: string | null
  /** The paid card/product name (e.g. "The Couple"). */
  cardName: string | null
  /** Distinct add-ons purchased across paid orders (prints, swag, etc.). */
  addOns: string[]
  /** Couple/honoree display name for the template body ({{2}}). */
  coupleName: string
  /** Celebrant first names for entrance-pass contexts ({{3}} of the pass
   *  template + the ticket image) — see entranceCoupleName. */
  entranceCoupleName: string
  /** Swahili event category noun for the template body ({{3}}), e.g. "harusi". */
  eventCategory: string
  /** Event-owned location used by the View Location webhook response. */
  locationLabel: string
  locationMapsUrl: string | null
  /** False when the always-present View Location button would have no useful reply. */
  invitationDetailsReady: boolean
  /** True once the couple has explicitly confirmed {{2}}/{{3}} — sends are
   *  blocked in the UI until then. */
  sendSettingsConfirmed: boolean
  /** guest_contact_ids already sent a WhatsApp invite for THIS event (re-sends
   *  don't re-charge). */
  alreadySentIds: string[]
  /** Entrance-pass pool: same purchase grants one ticket per paid guest,
   *  consumed independently of invites (first send per guest charges, re-sends
   *  are free). Guests ticketed before metering shipped stay counted as used
   *  and keep free re-sends — only NEW guests are blocked when the pool runs dry. */
  /** Entrance pool's effective size: basePurchased + admin entrance-pass adjustments. */
  entrancePassPurchased: number
  entrancePassUsed: number
  entrancePassRemaining: number
  /** guest_contact_ids already sent an entrance pass for THIS event. */
  entrancePassSentIds: string[]
  /** Paid orders not yet assigned to any event — the couple needs to pick
   *  which event each one is for before it counts toward that event's quota. */
  unassignedOrders: PaidOrderSummary[]
  /** Paid order for this event whose design is not released yet. Visible as
   *  production status only; it must not unlock sending. */
  productionOrder: PaidOrderSummary | null
}

interface PaidOrderItem {
  id?: string
  name?: string
  guests?: number
  image?: string
  /** Visual treatment — fallback thumbnail when the card has no hero image. */
  treatment?: Treatment
  tier?: string
  /** Package tier id (lite/classic/elegant/signature) — drives which
   *  entrance-pass ticket template to composite (see entrance-pass route). */
  tierId?: string
  addOns?: string[]
}

export type InvitationOrderFulfillmentStatus = 'not_started' | 'in_progress' | 'ready' | 'delivered'

interface PaidOrderRow {
  id: string
  items: PaidOrderItem[] | null
  paid_at: string
  event_id: string | null
  fulfillment_status: InvitationOrderFulfillmentStatus
}

const INVITE_RELEASED_FULFILLMENT_STATUSES = new Set<InvitationOrderFulfillmentStatus>([
  'ready',
  'delivered',
])

export function isOrderReleasedForInvites(order: Pick<PaidOrderRow, 'fulfillment_status'>): boolean {
  return INVITE_RELEASED_FULFILLMENT_STATUSES.has(order.fulfillment_status)
}

/**
 * Every paid order that belongs to this couple. Matches by user_id first;
 * email/phone are ONLY consulted for guest-checkout orders (user_id IS NULL —
 * the buyer wasn't signed in yet) so an order that already carries a
 * DIFFERENT user_id can never be pulled in by a coincidental email/phone
 * match — important now that assignOrderToEvent can WRITE to a matched row,
 * not just read it.
 */
export async function fetchPaidOrdersForCouple(
  supabase: ReturnType<typeof createDashboardClient>,
  userId: string,
  email: string | null | undefined,
  whatsappPhone: string | null,
): Promise<PaidOrderRow[]> {
  const guestCheckoutOrs: string[] = []
  if (email) guestCheckoutOrs.push(`and(user_id.is.null,contact_email.eq.${email})`)
  if (whatsappPhone) guestCheckoutOrs.push(`and(user_id.is.null,contact_phone.eq.${whatsappPhone})`)
  const ors = [`user_id.eq.${userId}`, ...guestCheckoutOrs]

  const { data } = await supabase
    .from('invitation_orders')
    .select('id, items, paid_at, event_id, fulfillment_status')
    .eq('status', 'paid')
    .or(ors.join(','))
    .order('paid_at', { ascending: false })
  return (data ?? []) as PaidOrderRow[]
}

/** Which pledge-card / thank-you-card template designs this event has already
 *  bought (via the per-template checkout — see templateCardItemId()). */
export async function getPurchasedTemplateIds(
  templateType: TemplateCardType,
  eventId?: string | null,
): Promise<Set<string>> {
  const user = await getDashboardUser()
  if (!user || !eventId) return new Set()
  const supabase = createDashboardClient()
  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('whatsapp_phone')
    .eq('user_id', user.id)
    .maybeSingle<{ whatsapp_phone: string | null }>()
  const orders = await fetchPaidOrdersForCouple(supabase, user.id, user.email, profile?.whatsapp_phone ?? null)
  const ids = new Set<string>()
  for (const order of orders.filter((o) => o.event_id === eventId)) {
    for (const item of order.items ?? []) {
      if (!item.id) continue
      const parsed = parseTemplateCardItemId(item.id)
      if (parsed && parsed.type === templateType) ids.add(parsed.templateId)
    }
  }
  return ids
}

/**
 * Every order that belongs to this couple — paid, still processing, or
 * awaiting manual payment review — for the dashboard's Orders page. Mirrors
 * fetchPaidOrdersForCouple's user/email/phone matching via getOrdersForUser,
 * but isn't restricted to status='paid', so an order still under review still
 * shows up instead of the page looking empty until it clears. Dead orders
 * (failed/expired/refunded) are excluded — see getOrdersForUser. Redirects to
 * sign-in when signed out (dashboard page, not an API route).
 */
export async function getOrdersForDashboard(): Promise<StoredOrder[]> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('whatsapp_phone')
    .eq('user_id', user.id)
    .maybeSingle<{ whatsapp_phone: string | null }>()
  const rows = await getOrdersForUser(user.id, user.email, profile?.whatsapp_phone ?? null)
  return rows.map(orderRowToStoredOrder)
}

export interface PaidOrderSummary {
  id: string
  cardName: string | null
  cardTier: string | null
  cardImageUrl: string | null
  /** Visual treatment — fallback thumbnail when the card has no hero image. */
  cardTreatment: Treatment | null
  purchasedGuests: number
  addOns: string[]
  fulfillmentStatus: InvitationOrderFulfillmentStatus
  /** When the order was paid — day zero for the production countdown. */
  placedAt: string | null
}

function orderSummaryFrom(o: PaidOrderRow): PaidOrderSummary {
  const items = o.items ?? []
  const withImage = items.find((it) => it.image)
  const withTreatment = items.find((it) => it.treatment)
  const withTier = items.find((it) => it.tier)
  const addOnSet = new Set<string>()
  for (const item of items) {
    for (const a of item.addOns ?? []) {
      const label = a.trim()
      if (label) addOnSet.add(label)
    }
  }
  const purchasedGuests = items.reduce(
    (sum, it) => sum + (typeof it.guests === 'number' && it.guests > 0 ? Math.floor(it.guests) : 0),
    0,
  )
  return {
    id: o.id,
    cardName: withImage?.name ?? items[0]?.name ?? null,
    cardTier: withTier?.tier ?? null,
    cardImageUrl: withImage?.image ?? null,
    cardTreatment: withTreatment?.treatment ?? null,
    purchasedGuests,
    addOns: [...addOnSet],
    fulfillmentStatus: o.fulfillment_status,
    placedAt: o.paid_at ?? null,
  }
}

/** Paid orders not yet attached to any event, shaped for the "assign this
 *  design to an event" prompt. */
function unassignedOrdersFrom(orders: PaidOrderRow[]): PaidOrderSummary[] {
  return orders.filter((o) => !o.event_id).map(orderSummaryFrom)
}

export interface EventOrderLinks {
  /** Paid orders currently linked to each event, keyed by event id — an
   *  event can have more than one order (quota adds up across them). */
  byEvent: Record<string, PaidOrderSummary[]>
  /** Paid orders not yet linked to any event. */
  unassigned: PaidOrderSummary[]
}

/** Powers the "linked paid design" card on the Events editor: which order(s)
 *  are already tied to each event, and which paid orders are still up for grabs. */
export async function getEventOrderLinks(): Promise<EventOrderLinks> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('whatsapp_phone')
    .eq('user_id', user.id)
    .maybeSingle<{ whatsapp_phone: string | null }>()
  const orders = await fetchPaidOrdersForCouple(supabase, user.id, user.email, profile?.whatsapp_phone ?? null)

  const byEvent: Record<string, PaidOrderSummary[]> = {}
  for (const o of orders) {
    if (!o.event_id) continue
    ;(byEvent[o.event_id] ??= []).push(orderSummaryFrom(o))
  }
  return { byEvent, unassigned: unassignedOrdersFrom(orders) }
}

/** The package tier (lite/classic/elegant/signature) behind an event's paid
 *  orders, if any — used to gate free vs. paid pledge-card templates. UI-only
 *  signal; the server action re-derives this itself before actually granting
 *  the free template. */
export async function getEventPackageTierId(eventId: string): Promise<string | null> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('whatsapp_phone')
    .eq('user_id', user.id)
    .maybeSingle<{ whatsapp_phone: string | null }>()
  const orders = await fetchPaidOrdersForCouple(supabase, user.id, user.email, profile?.whatsapp_phone ?? null)
  return resolveEventPackageTierId(orders, eventId)
}

export async function getWhatsAppEntitlement(
  eventId: string,
  options: { includeReleasedCardPreview?: boolean } = {},
): Promise<WhatsAppEntitlement> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()

  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('whatsapp_phone, partner1_name, partner2_name, invite_host_name')
    .eq('user_id', user.id)
    .maybeSingle<{
      whatsapp_phone: string | null
      partner1_name: string | null
      partner2_name: string | null
      invite_host_name: string | null
    }>()
  // The SELECTED event, used both for the event-category template variable
  // ({{3}}) and as a coupleName fallback below — not just "the couple's
  // earliest event," now that a couple can be sending for any of several.
  const { data: primaryEvent } = await supabase
    .from('wedding_events')
    .select('name, event_type, partner1_name, partner2_name, venue_name, address, city')
    .eq('user_id', user.id)
    .eq('id', eventId)
    .maybeSingle<{
      name: string | null
      event_type: string
      partner1_name: string | null
      partner2_name: string | null
      venue_name: string | null
      address: string | null
      city: string | null
    }>()
  const eventCategory = eventTypeLabelSw(primaryEvent?.event_type ?? 'other')
  const coupleName = primaryEvent ? invitationHostName(primaryEvent) : 'The Couple'
  const locationLabel = primaryEvent ? invitationLocation(primaryEvent) : ''
  const locationMapsUrl = primaryEvent ? invitationMapsUrl(primaryEvent) : null
  const detailsReady = primaryEvent ? invitationDetailsReady(primaryEvent) : false

  // Entrance-pass contexts use first names. The selected event is also the
  // source of truth here, with the profile retained only as a legacy fallback.
  const entranceNames = primaryEvent
    ? entranceCoupleName(
        { name: primaryEvent.name?.trim() || 'The Couple', partner1_name: primaryEvent.partner1_name, partner2_name: primaryEvent.partner2_name },
        profile ?? null,
      )
    : coupleName

  const allPaidOrders = await fetchPaidOrdersForCouple(supabase, user.id, user.email, profile?.whatsapp_phone ?? null)
  const releasedOrders = allPaidOrders.filter(isOrderReleasedForInvites)
  const productionOrder = allPaidOrders
    .filter((o) => o.event_id === eventId && !isOrderReleasedForInvites(o))
    .map(orderSummaryFrom)[0] ?? null

  const orders = releasedOrders.filter((o) => o.event_id === eventId)

  let purchased = 0
  let cardImageUrl: string | null = null
  let cardTreatment: Treatment | null = null
  let cardTier: string | null = null
  let cardName: string | null = null
  const addOnSet = new Set<string>()
  for (const o of orders) {
    for (const item of o.items ?? []) {
      if (typeof item.guests === 'number' && item.guests > 0) purchased += Math.floor(item.guests)
      // The card they paid for: first hero image/treatment/tier/name found (orders are newest-first).
      if (!cardImageUrl && item.image) cardImageUrl = item.image
      if (!cardTreatment && item.treatment) cardTreatment = item.treatment
      if (!cardTier && item.tier) cardTier = item.tier
      if (!cardName && item.name) cardName = item.name
      for (const a of item.addOns ?? []) {
        const label = a.trim()
        if (label) addOnSet.add(label)
      }
    }
  }
  const addOns = [...addOnSet]

  // The Send Invites identity card should show what the couple actually
  // approved, not the catalogue hero stored on the order line. Keep this URL
  // separate from cardImageUrl: send/test-send actions call this entitlement
  // too, and switching that field here would prematurely change real outgoing
  // WhatsApp media before the per-guest delivery path is ready.
  let releasedCardPreviewUrl: string | null = null
  if (options.includeReleasedCardPreview && orders.length > 0) {
    const { data: releasedDesigns } = await supabase
      .from('invitation_card_designs')
      .select('id, order_id, released_at')
      .in('order_id', orders.map((order) => order.id))
      .in('status', ['ready', 'delivered'])
      .not('release_svg_path', 'is', null)
      .order('released_at', { ascending: false })

    // Orders are newest-first. Prefer the newest released design belonging to
    // the same order that supplies the displayed package/name metadata.
    const newestDesignByOrder = new Map<string, string>()
    for (const design of (releasedDesigns ?? []) as { id: string; order_id: string }[]) {
      if (!newestDesignByOrder.has(design.order_id)) {
        newestDesignByOrder.set(design.order_id, design.id)
      }
    }
    const designId = orders
      .map((order) => newestDesignByOrder.get(order.id))
      .find((id): id is string => Boolean(id))
    if (designId) releasedCardPreviewUrl = `/api/my/card/${encodeURIComponent(designId)}`
  }

  // Paid orders that exist but aren't attached to ANY event yet — surfaced so
  // the couple can assign them instead of them silently counting for nothing.
  const unassignedOrders = unassignedOrdersFrom(releasedOrders)

  // Used = distinct guests already credited a WhatsApp send FOR THIS EVENT,
  // read from the credit_consumptions ledger — the atomic source of truth
  // consume_send_credit() writes to (see migration 20260711000002). Also
  // match consumptions logged BEFORE event-scoping shipped (event_id IS
  // NULL) — those predate this feature and can't be attributed to a specific
  // event, but treating them as "never sent" would double-invite AND
  // double-charge a guest who was genuinely already invited. Erring toward a
  // free resend is the safer failure mode for a paying customer.
  const { data: consumed } = await supabase
    .from('credit_consumptions')
    .select('guest_contact_id, kind')
    .eq('user_id', user.id)
    .or(`event_id.eq.${eventId},event_id.is.null`)
    .in('kind', ['invite', 'entrance_pass'])
  const consumedRows = (consumed ?? []) as { guest_contact_id: string | null; kind: string }[]
  const distinctGuests = (kind: string) => [
    ...new Set(
      consumedRows
        .filter((r) => r.kind === kind)
        .map((r) => r.guest_contact_id)
        .filter((x): x is string => Boolean(x)),
    ),
  ]
  const alreadySentIds = distinctGuests('invite')
  const entrancePassSentIds = distinctGuests('entrance_pass')

  // Admin-granted/-revoked credits on top of the purchase — see
  // migration 20260711000003. Each pool only ever adjusts by its own kind.
  const { data: adjustments } = await supabase
    .from('entitlement_adjustments')
    .select('kind, delta')
    .eq('user_id', user.id)
    .eq('event_id', eventId)
  const adjustmentRows = (adjustments ?? []) as { kind: string; delta: number }[]
  const adjustmentTotal = (kind: string) =>
    adjustmentRows.filter((r) => r.kind === kind).reduce((sum, r) => sum + r.delta, 0)
  const invitePurchased = Math.max(0, purchased + adjustmentTotal('invite'))
  const entrancePassPurchased = Math.max(0, purchased + adjustmentTotal('entrance_pass'))

  return {
    basePurchased: purchased,
    purchased: invitePurchased,
    used: alreadySentIds.length,
    remaining: Math.max(0, invitePurchased - alreadySentIds.length),
    entrancePassPurchased,
    entrancePassUsed: entrancePassSentIds.length,
    entrancePassRemaining: Math.max(0, entrancePassPurchased - entrancePassSentIds.length),
    entrancePassSentIds,
    hasPaidOrder: orders.length > 0,
    cardImageUrl,
    releasedCardPreviewUrl,
    cardTreatment,
    cardTier,
    cardName,
    addOns,
    coupleName,
    entranceCoupleName: entranceNames,
    eventCategory,
    locationLabel,
    locationMapsUrl,
    invitationDetailsReady: detailsReady,
    sendSettingsConfirmed: detailsReady,
    alreadySentIds,
    unassignedOrders,
    productionOrder,
  }
}

export type CreditKind = 'invite' | 'entrance_pass'
export type ConsumeCreditVerdict = 'resend' | 'consumed' | 'blocked'

/**
 * Atomically check-and-spend one credit of `kind` for `guestContactId`, or
 * report the guest already holds one (free resend) or the pool is dry
 * (blocked). See consume_send_credit() in migration 20260711000002 — the
 * advisory lock inside it is what actually closes the race two concurrent
 * sends could otherwise hit on the last credit; this is just the typed call.
 */
export async function consumeSendCredit(
  supabase: ReturnType<typeof createDashboardClient>,
  args: { userId: string; eventId: string; guestContactId: string; kind: CreditKind; purchased: number },
): Promise<ConsumeCreditVerdict> {
  const { data, error } = await supabase.rpc('consume_send_credit', {
    p_user_id: args.userId,
    p_event_id: args.eventId,
    p_guest_contact_id: args.guestContactId,
    p_kind: args.kind,
    p_purchased: args.purchased,
  })
  if (error) throw new Error(error.message)
  return data as ConsumeCreditVerdict
}

/**
 * Hand back a credit consume_send_credit() just reserved, because the actual
 * WhatsApp send that followed it failed. Only call this for a 'consumed'
 * verdict — never for 'resend' (that guest's original consumption predates
 * this request and must not be forgotten).
 */
export async function releaseSendCredit(
  supabase: ReturnType<typeof createDashboardClient>,
  args: { userId: string; eventId: string; guestContactId: string; kind: CreditKind },
): Promise<void> {
  const { error } = await supabase.rpc('release_send_credit', {
    p_user_id: args.userId,
    p_event_id: args.eventId,
    p_guest_contact_id: args.guestContactId,
    p_kind: args.kind,
  })
  if (error) throw new Error(error.message)
}

// ──────────────────────────── Send-invites page ────────────────────────────

export type SendRowStatus = 'none' | 'sent' | 'viewed' | 'attending' | 'declined' | 'maybe'

export interface SendGuestRow {
  id: string
  name: string
  phone: string | null
  whatsappPhone: string | null
  /** Preferred channel from which number is present. */
  channel: 'whatsapp' | 'sms'
  status: SendRowStatus
  statusLabel: string
  /** Absolute personal RSVP link (for the per-row copy action). */
  rsvpUrl: string
  /** Absolute entrance-pass ticket URL — only ever fetchable once this guest
   *  is attending (the route 404s otherwise), but always present so the
   *  entrance-pass preview can pick any attending guest as its sample. */
  entrancePassUrl: string
  /** True once this guest has been sent an entrance pass for this event —
   *  drives the persistent Sent/Not sent status on the Pass Ticket tab. */
  entrancePassSent: boolean
  /** Seats the couple's invite covers (guest_contacts.max_party_size,
   *  clamped 1..2 on new writes) — the "Single/Double card sent" badge. */
  assignedPartySize: number
  /** Seats the guest confirmed at RSVP for THIS event — the ticket's pill
   *  and the door scanner's count. Null until they're attending. */
  rsvpPartySize: number | null
  /** Door check-in for THIS event — set once an attendant scans this guest's
   *  entrance pass. Null until they arrive; drives the live Check-ins tab. */
  checkedInAt: string | null
  /** The door the guest was scanned at (e.g. "Main Gate"). */
  checkedInDoor: string | null
  /** Headcount actually admitted at the door. Null until scanned. */
  checkedInPartySize: number | null
  /** The attendant who scanned this guest in. Parsed from the check-in audit
   *  label (which also embeds the door + any manual-override reason) down to
   *  just the person's name for display. Null until scanned. */
  checkedInBy: string | null
  /** The seating table this guest is assigned to for THIS event (from the
   *  Seat collection planner), so an usher can send an arrival to their seat.
   *  Null when the guest hasn't been seated yet. */
  tableName: string | null
}

export interface SendInvitesData {
  event: {
    coupleName: string
    /** The selected event's own name (e.g. "Boris & Lu") — the heading's display
     *  name. Comes from wedding_events, NOT the profile. Null with no events. */
    eventName: string | null
    /** The selected event's type label (e.g. "Wedding") — the heading suffix. */
    eventTypeLabel: string | null
    /** Swahili event-category noun (e.g. "harusi") — template {{3}}, used by the
     *  in-page WhatsApp preview so it mirrors the real send exactly. */
    eventCategorySw: string
    dateLabel: string | null
    venue: string | null
    /** Swahili-formatted date/time + venue for the entrance-pass WhatsApp
     *  template preview — always non-empty (falls back to "will be
     *  announced" copy), matching computeEntrancePassVars exactly. */
    entranceDateLabel: string
    entranceTimeLabel: string
    entranceVenue: string
    /** Celebrant first names for the entrance-pass preview's {{3}} — the
     *  same entranceCoupleName derivation the real send uses. */
    entranceCoupleName: string
    /** Event-owned invitation identity and location. The Digital Cards editor
     *  writes these exact wedding_events fields; the preview, send and webhook
     *  all read the same row. */
    invitationFields: {
      partner1Name: string
      partner2Name: string
      venueName: string
      address: string
      city: string
      locationLabel: string
      mapsUrl: string | null
      partner2Required: boolean
      ready: boolean
    } | null
    /** Raw event fields prefilling the Pass Ticket tab's Ticket Details
     *  editor (it edits the real wedding_events row, not overrides). */
    ticketFields: {
      eventType: string
      partner1Name: string
      partner2Name: string
      /** YYYY-MM-DD (local) of starts_at, '' when unset. */
      startDate: string
      venueName: string
      city: string
      ticketLanguage: TicketLanguage
    } | null
    cardTier: string | null
    /** The paid card/product name (e.g. "The Couple"). */
    cardName: string | null
    /** The paid card's hero artwork — rendered in the event-context preview. */
    cardImageUrl: string | null
    /** The couple's frozen released artwork for the visible card in the Send
     *  Invites header. Kept distinct from outgoing WhatsApp media. */
    releasedCardPreviewUrl: string | null
    /** Visual treatment — fallback thumbnail when the card has no hero image. */
    cardTreatment: Treatment | null
    /** Save the Date template selected for this event. Separate from the
     * paid invitation card image/quota. */
    saveDateTemplateId: string | null
    saveDateTemplateName: string | null
    saveDateTemplateImageUrl: string | null
    /** Distinct add-ons purchased across paid orders (prints, swag, etc.). */
    addOns: string[]
    hasPaidOrder: boolean
    /** A paid card linked to this event but still in production/review. */
    productionOrder: PaidOrderSummary | null
  }
  /** Every one of the couple's events, for the event switcher. Only worth
   *  rendering a switcher when this has 2+ entries — a single-event couple
   *  never needs to think about "which event." */
  events: { id: string; name: string; eventTypeLabel: string }[]
  /** Which event this data is scoped to. */
  selectedEventId: string | null
  /** Paid orders not yet assigned to any event — show a prompt to assign them
   *  so their design/quota isn't invisible to every event. */
  unassignedOrders: PaidOrderSummary[]
  funnel: { invited: number; delivered: number; viewed: number; rsvpd: number }
  quota: { used: number; purchased: number; remaining: number; hasPaidOrder: boolean }
  /** Entrance-pass pool — same purchased size as the invite quota, consumed
   *  independently (first ticket per guest charges, re-sends are free). */
  entranceQuota: { used: number; purchased: number; remaining: number }
  publicLink: { enabled: boolean; slug: string | null; url: string | null }
  whatsappLive: boolean
  /** The couple's own WhatsApp number — prefills the "send a test" input. */
  testPhone: string | null
  /** Template {{2}}/{{3}} values. `confirmed` is false until the couple has
   *  explicitly saved them — every send path requires that first. */
  sendSettings: { hostName: string; eventCategory: string; confirmed: boolean }
  guests: SendGuestRow[]
  /** Full RSVP/response data reused by the Send Invites pipeline tabs. */
  responseGuests: GuestWithInvitations[]
  responseEvents: WeddingEvent[]
  responseLastSend: Record<string, LastSend>
  responseQuestions: RsvpQuestion[]
  responseSummaries: RsvpEventSummary[]
  responseAnswerSummaries: Record<string, RsvpAnswerSummary>
}

/**
 * `eventId` scopes everything on this page — the design/quota that's live,
 * which guests count as invited/sent for THIS event, and the event-category
 * template variable. Defaults to the couple's first event (by their own
 * sort order) when not given, so single-event couples never see a switcher
 * and nothing changes for them.
 */
/** EAT-zone YYYY-MM-DD of an ISO timestamp, '' when unset/invalid — prefills
 *  the Ticket Details date input. Must resolve in East Africa Time, NOT the
 *  runtime zone: this runs server-side (Vercel = UTC), so a getTimezoneOffset
 *  shift would be a no-op and a date-only event stored at EAT midnight
 *  (21:00Z the prior day) would prefill a day early. eatDateParts is the same
 *  EAT extractor updateEventTicketDetails uses to preserve time-of-day. */
function localDatePart(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const { year, month, day } = eatDateParts(d)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export async function getSendInvitesData(
  eventId?: string,
  preloadedEvents?: WeddingEvent[],
): Promise<SendInvitesData> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const origin = publicOrigin()

  const [events, profile, guests] = await Promise.all([
    preloadedEvents ? Promise.resolve(preloadedEvents) : getEvents(),
    getCoupleProfile(),
    getGuestsWithInvitations(),
  ])

  const selectedEvent = (eventId && events.find((e) => e.id === eventId)) || events[0] || null
  const selectedEventId = selectedEvent?.id ?? null

  // No events at all yet: nothing to scope guests/quota — or the invite
  // link — to, but the couple may already have bought a design before
  // setting up their first event; still surface it so they can create an
  // event and assign it, rather than it silently vanishing.
  if (!selectedEventId) {
    const paidOrders = await fetchPaidOrdersForCouple(
      supabase,
      user.id,
      user.email,
      profile?.whatsapp_phone ?? null,
    )
    const releasedOrders = paidOrders.filter(isOrderReleasedForInvites)
    return {
      event: {
        coupleName: profile ? coupleDisplayName(profile) : 'The Couple',
        eventName: null,
        eventTypeLabel: null,
        eventCategorySw: 'sherehe',
        dateLabel: null,
        venue: null,
        entranceDateLabel: 'Tarehe itatangazwa hivi karibuni',
        entranceTimeLabel: 'Muda utatangazwa hivi karibuni',
        entranceVenue: 'Mahali patatangazwa hivi karibuni',
        entranceCoupleName: coupleFirstNames(profile),
        invitationFields: null,
        ticketFields: null,
        cardTier: null,
        cardName: null,
        cardImageUrl: null,
        releasedCardPreviewUrl: null,
        cardTreatment: null,
        saveDateTemplateId: null,
        saveDateTemplateName: null,
        saveDateTemplateImageUrl: null,
        addOns: [],
        hasPaidOrder: false,
        productionOrder: null,
      },
      events: [],
      selectedEventId: null,
      unassignedOrders: unassignedOrdersFrom(releasedOrders),
      funnel: { invited: 0, delivered: 0, viewed: 0, rsvpd: 0 },
      quota: { used: 0, purchased: 0, remaining: 0, hasPaidOrder: false },
      entranceQuota: { used: 0, purchased: 0, remaining: 0 },
      publicLink: { enabled: false, slug: null, url: null },
      whatsappLive: getWhatsAppProvider().live,
      testPhone: profile?.whatsapp_phone ?? null,
      sendSettings: { hostName: '', eventCategory: '', confirmed: false },
      guests: [],
      responseGuests: guests,
      responseEvents: events,
      responseLastSend: {},
      responseQuestions: [],
      responseSummaries: [],
      responseAnswerSummaries: {},
    }
  }

  const [entitlement, publicInvite, responseLastSend, responseQuestions, responseSummaries, responseAnswerSummaries] = await Promise.all([
    getWhatsAppEntitlement(selectedEventId, { includeReleasedCardPreview: true }),
    getInviteShareInfo(selectedEventId),
    getLastSendByGuest(),
    getRsvpQuestions(),
    getRsvpEventSummaries(),
    getRsvpAnswerSummaries(),
  ])

  // WhatsApp read receipts → "viewed" (real once delivery webhooks land),
  // scoped to this event only.
  const { data: readRows } = await supabase
    .from('whatsapp_messages')
    .select('guest_contact_id')
    .eq('user_id', user.id)
    .eq('event_id', selectedEventId)
    .eq('direction', 'out')
    .eq('status', 'read')
  const readSet = new Set(
    (readRows ?? []).map((r) => r.guest_contact_id as string | null).filter((x): x is string => Boolean(x)),
  )
  const sentSet = new Set(entitlement.alreadySentIds)
  const entranceSentSet = new Set(entitlement.entrancePassSentIds)

  // Seat collection assignments → each guest's table name, so the live
  // Check-ins roster can point an arriving guest to their seat. Read-only
  // here; the seating itself is arranged on the Seat collection page.
  const [{ data: seatTables }, { data: seatAssignments }] = await Promise.all([
    supabase
      .from('seating_tables')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('event_id', selectedEventId),
    supabase
      .from('seating_assignments')
      .select('guest_contact_id, table_id')
      .eq('user_id', user.id)
      .eq('event_id', selectedEventId),
  ])
  const tableNameById = new Map(
    ((seatTables ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name]),
  )
  const tableNameByGuest = new Map<string, string>()
  for (const a of (seatAssignments ?? []) as { guest_contact_id: string; table_id: string }[]) {
    // Skip stale assignments whose table was since removed.
    const name = tableNameById.get(a.table_id)
    if (name) tableNameByGuest.set(a.guest_contact_id, name)
  }

  const roster = guests.filter((g) => g.review_status !== 'unconfirmed')

  const rows: SendGuestRow[] = roster.map((g) => {
    // Scope this guest's invitations to the SELECTED event only — a guest
    // attending the Sendoff must not show as "Attending" on the Wedding's
    // Send Invites page.
    const invs = g.invitations.filter((i) => i.event_id === selectedEventId)
    const attending = invs.find((i) => i.rsvp_status === 'attending')
    const anyDeclined = invs.length > 0 && invs.every((i) => i.rsvp_status === 'declined')
    const anyMaybe = invs.some((i) => i.rsvp_status === 'maybe')
    const wasSent = sentSet.has(g.id)
    const wasRead = readSet.has(g.id)

    let status: SendRowStatus = 'none'
    let statusLabel = 'Not sent'
    if (attending) {
      status = 'attending'
      statusLabel = attending.party_size > 1 ? `Attending · ${attending.party_size}` : 'Attending'
    } else if (anyDeclined) {
      status = 'declined'
      statusLabel = 'Declined'
    } else if (anyMaybe) {
      status = 'maybe'
      statusLabel = 'Maybe'
    } else if (wasRead) {
      status = 'viewed'
      statusLabel = 'Viewed'
    } else if (wasSent) {
      status = 'sent'
      statusLabel = 'Sent'
    }

    return {
      id: g.id,
      name: g.full_name,
      phone: g.phone,
      whatsappPhone: g.whatsapp_phone,
      channel: g.whatsapp_phone ? 'whatsapp' : 'sms',
      status,
      statusLabel,
      rsvpUrl: `${origin}/rsvp/${g.public_token}`,
      entrancePassUrl: `${origin}/entrance-pass/${g.public_token}?event=${selectedEventId}`,
      entrancePassSent: entranceSentSet.has(g.id),
      assignedPartySize: Math.max(1, g.max_party_size ?? 1),
      rsvpPartySize: attending ? Math.max(1, attending.party_size ?? 1) : null,
      checkedInAt: attending?.checked_in_at ?? null,
      checkedInDoor: attending?.checked_in_door ?? null,
      checkedInPartySize: attending?.checked_in_party_size ?? null,
      // The audit label is "Name (Door) (manual: reason)"; the couple only
      // needs the attendant's name — the door has its own column.
      checkedInBy: attending?.checked_in_by ? attending.checked_in_by.split(' (')[0].trim() || null : null,
      tableName: tableNameByGuest.get(g.id) ?? null,
    }
  })

  const funnel = {
    invited: roster.length,
    delivered: rows.filter((r) => r.status !== 'none').length,
    viewed: rows.filter((r) => r.status === 'viewed' || r.status === 'attending' || r.status === 'declined' || r.status === 'maybe').length,
    rsvpd: roster.filter((g) => g.invitations.some((i) => i.event_id === selectedEventId && i.responded_at)).length,
  }

  const eventName = selectedEvent.name?.trim() || null
  const eventTypeLbl = eventTypeLabel(selectedEvent.event_type)
  const venue = [selectedEvent.venue_name, selectedEvent.city].filter(Boolean).join(', ') || null
  const saveDateTemplate = profile?.pledge_page?.saveDateTemplates?.[selectedEventId] ?? null
  // Category is already resolved from the selected event. Only the
  // date/time/venue fields are needed here, computed identically to the send.
  const entranceVars = computeEntrancePassVars(selectedEvent, null)

  return {
    event: {
      coupleName: entitlement.coupleName,
      eventName,
      eventTypeLabel: eventTypeLbl,
      eventCategorySw: entitlement.eventCategory,
      dateLabel: formatLongDate(selectedEvent.starts_at) || null,
      venue,
      entranceDateLabel: entranceVars.dateLabel,
      entranceTimeLabel: entranceVars.timeLabel,
      entranceVenue: entranceVars.venue,
      entranceCoupleName: entitlement.entranceCoupleName,
      invitationFields: {
        partner1Name: selectedEvent.partner1_name ?? '',
        partner2Name: selectedEvent.partner2_name ?? '',
        venueName: selectedEvent.venue_name ?? '',
        address: selectedEvent.address ?? '',
        city: selectedEvent.city ?? '',
        locationLabel: entitlement.locationLabel,
        mapsUrl: entitlement.locationMapsUrl,
        partner2Required: invitationPartner2Required(selectedEvent),
        ready: entitlement.invitationDetailsReady,
      },
      ticketFields: {
        eventType: selectedEvent.event_type,
        partner1Name: selectedEvent.partner1_name ?? '',
        partner2Name: selectedEvent.partner2_name ?? '',
        startDate: localDatePart(selectedEvent.starts_at),
        venueName: selectedEvent.venue_name ?? '',
        city: selectedEvent.city ?? '',
        ticketLanguage: selectedEvent.ticket_language === 'sw' ? 'sw' : 'en',
      },
      cardTier: entitlement.cardTier,
      cardName: entitlement.cardName,
      cardImageUrl: entitlement.cardImageUrl,
      releasedCardPreviewUrl: entitlement.releasedCardPreviewUrl,
      cardTreatment: entitlement.cardTreatment,
      saveDateTemplateId: saveDateTemplate?.id ?? null,
      saveDateTemplateName: saveDateTemplate?.name ?? null,
      saveDateTemplateImageUrl: saveDateTemplate?.imageUrl ?? null,
      addOns: entitlement.addOns,
      hasPaidOrder: entitlement.hasPaidOrder,
      productionOrder: entitlement.hasPaidOrder ? null : entitlement.productionOrder,
    },
    events: events.map((e) => ({ id: e.id, name: e.name, eventTypeLabel: eventTypeLabel(e.event_type) })),
    selectedEventId,
    unassignedOrders: entitlement.unassignedOrders,
    funnel,
    quota: {
      used: entitlement.used,
      purchased: entitlement.purchased,
      remaining: entitlement.remaining,
      hasPaidOrder: entitlement.hasPaidOrder,
    },
    entranceQuota: {
      used: entitlement.entrancePassUsed,
      purchased: entitlement.entrancePassPurchased,
      remaining: entitlement.entrancePassRemaining,
    },
    publicLink: {
      enabled: publicInvite.enabled,
      slug: publicInvite.slug,
      url: publicInvite.slug ? eventInviteUrl(origin, publicInvite.slug) : null,
    },
    whatsappLive: getWhatsAppProvider().live,
    testPhone: profile?.whatsapp_phone ?? null,
    sendSettings: {
      hostName: entitlement.coupleName,
      eventCategory: entitlement.eventCategory,
      confirmed: entitlement.sendSettingsConfirmed,
    },
    guests: rows,
    responseGuests: guests,
    responseEvents: events,
    responseLastSend,
    responseQuestions,
    responseSummaries,
    responseAnswerSummaries,
  }
}

// ──────────────────────────── Thank-you page ────────────────────────────

export interface ThankYouGuestRow {
  id: string
  name: string
  phone: string | null
  whatsappPhone: string | null
  /** Preferred channel from which number is present. */
  channel: 'whatsapp' | 'sms'
  thankYouSent: boolean
  thankYouSentAt: string | null
  thankYouCount: number
}

export interface ThankYouData {
  event: {
    coupleName: string
    eventName: string | null
    eventTypeLabel: string | null
    /** Swahili event-category noun (e.g. "harusi") — template {{3}}, used by the
     *  in-page WhatsApp preview so it mirrors the real send exactly. */
    eventCategorySw: string
    dateLabel: string | null
    venue: string | null
  }
  /** Every one of the couple's events, for the event switcher. */
  events: { id: string; name: string; eventTypeLabel: string }[]
  selectedEventId: string | null
  /** The package tier behind this event's paid order — UI-only signal, the
   *  card-template action re-derives it server-side before actually
   *  applying a template. Sending itself isn't tier-gated. */
  packageTierId: string | null
  /** True when packageTierId is Elegant/Signature — drives the card-picker's
   *  locked state (Classic/Essential can still send, just can't pick a
   *  template card for free). */
  hasFreeCardAccess: boolean
  whatsappLive: boolean
  /** The couple's own WhatsApp number — prefills the "send a test" input. */
  testPhone: string | null
  /** Guests confirmed "attending" for the selected event — the only audience
   *  a thank-you broadcast makes sense for. */
  guests: ThankYouGuestRow[]
}

/**
 * `eventId` scopes everything on this page the same way it does on the Send
 * Invites page: which guests are attending THIS event, and the event-category
 * template variable. Defaults to the couple's first event when not given.
 */
export async function getThankYouData(eventId?: string, preloadedEvents?: WeddingEvent[]): Promise<ThankYouData> {
  const [events, profile, guests] = await Promise.all([
    preloadedEvents ? Promise.resolve(preloadedEvents) : getEvents(),
    getCoupleProfile(),
    getGuestsWithInvitations(),
  ])

  const selectedEvent = (eventId && events.find((e) => e.id === eventId)) || events[0] || null
  const selectedEventId = selectedEvent?.id ?? null

  if (!selectedEventId) {
    return {
      event: {
        coupleName: profile ? coupleDisplayName(profile) : 'The Couple',
        eventName: null,
        eventTypeLabel: null,
        eventCategorySw: 'sherehe',
        dateLabel: null,
        venue: null,
      },
      events: [],
      selectedEventId: null,
      packageTierId: null,
      hasFreeCardAccess: false,
      whatsappLive: getWhatsAppProvider().live,
      testPhone: profile?.whatsapp_phone ?? null,
      guests: [],
    }
  }

  const [entitlement, packageTierId] = await Promise.all([
    getWhatsAppEntitlement(selectedEventId),
    getEventPackageTierId(selectedEventId),
  ])

  const guestRows: ThankYouGuestRow[] = []
  for (const g of guests) {
    if (g.review_status === 'unconfirmed') continue
    const attending = g.invitations.find((i) => i.event_id === selectedEventId && i.rsvp_status === 'attending')
    if (!attending) continue
    guestRows.push({
      id: g.id,
      name: g.full_name,
      phone: g.phone,
      whatsappPhone: g.whatsapp_phone,
      channel: g.whatsapp_phone ? 'whatsapp' : 'sms',
      thankYouSent: Boolean(attending.thank_you_sent_at),
      thankYouSentAt: attending.thank_you_sent_at,
      thankYouCount: attending.thank_you_count,
    })
  }

  const eventName = selectedEvent.name?.trim() || null
  const eventTypeLbl = eventTypeLabel(selectedEvent.event_type)
  const venue = [selectedEvent.venue_name, selectedEvent.city].filter(Boolean).join(', ') || null

  return {
    event: {
      coupleName: entitlement.coupleName,
      eventName,
      eventTypeLabel: eventTypeLbl,
      eventCategorySw: entitlement.eventCategory,
      dateLabel: formatLongDate(selectedEvent.starts_at) || null,
      venue,
    },
    events: events.map((e) => ({ id: e.id, name: e.name, eventTypeLabel: eventTypeLabel(e.event_type) })),
    selectedEventId,
    packageTierId,
    hasFreeCardAccess: Boolean(packageTierId && THANK_YOU_FREE_TIER_IDS.includes(packageTierId)),
    whatsappLive: getWhatsAppProvider().live,
    testPhone: profile?.whatsapp_phone ?? null,
    guests: guestRows,
  }
}

/** Guests that self-registered via the public link and await host review. */
export async function getGuestsAwaitingReview(): Promise<GuestWithInvitations[]> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { data: guests, error } = await supabase
    .from('guest_contacts')
    .select('*')
    .eq('user_id', user.id)
    .eq('review_status', 'unconfirmed')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  const ids = (guests ?? []).map((g) => g.id as string)
  if (ids.length === 0) return []

  const { data: invitations } = await supabase
    .from('guest_invitations')
    .select('*')
    .in('guest_contact_id', ids)

  const byGuest = new Map<string, GuestInvitation[]>()
  for (const inv of (invitations ?? []) as GuestInvitation[]) {
    const list = byGuest.get(inv.guest_contact_id) ?? []
    list.push(inv)
    byGuest.set(inv.guest_contact_id, list)
  }
  return ((guests ?? []) as GuestWithInvitations[]).map((g) => ({
    ...g,
    invitations: byGuest.get(g.id) ?? [],
  }))
}
