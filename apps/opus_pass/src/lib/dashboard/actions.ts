'use server'

import { revalidatePath } from 'next/cache'
import { randomUUID } from 'node:crypto'
import { createDashboardClient } from './supabase'
import { requireDashboardUser } from './auth'
import { createNotification } from './notifications'
import type { PledgePageConfig, PledgePaymentMethod, CollectorEventContent } from './pledge-page'
import { paymentMethodsToText, resolveEventCover, EVENTLESS_COVER_KEY } from './pledge-page'
import { PLEDGE_TEMPLATE_FREE_TIER_IDS, parseTemplateCardItemId, resolveEventPackageTierId } from './pledge-card-templates'
import { THANK_YOU_FREE_TIER_IDS, resolveThankYouCover, type ThankYouCardConfig } from './thank-you'
import {
  coupleSlugBase,
  eatDateParts,
  eventHeroSlugBase,
  eventSlugBase,
  firstNameOf,
  greetingNameOf,
  heroSlugBase,
  normalizePhone,
  pledgeUrl,
  publicOrigin,
  slugBaseOf,
  templateParam,
} from './share'
import {
  consumeSendCredit,
  fetchPaidOrdersForCouple,
  getEvents,
  getMyCollectorToken,
  getMyPledgeToken,
  getWhatsAppEntitlement,
  isOrderReleasedForInvites,
  ownedEventIds,
  releaseSendCredit,
  resolveEventIdOrDefault,
  resolveOwnedEventId,
  loadRosterIdentities,
} from './queries'
import { deliverEntrancePasses } from './entrance-pass-send'
import { getWhatsAppProvider } from '@/lib/whatsapp'
import { formatInviteGuestName, type LinkRequestKind } from '@/lib/whatsapp/types'
import { getSmsProvider } from '@/lib/sms'
import { cardRenderVariant, deriveAssetToken } from '@/lib/cards/asset-tokens'
import { prepareGuestCardAsset, type PrepareFailureCode } from '@/lib/cards/prepare-guest-asset'
import { invitationPartner2Required, parseInvitationCoordinates } from './invitation-event-details'
import { isEmailConfigured, sendEmail } from '@/lib/email'
import { pledgeRequestEmail } from './pledge-email'
import { sendGiftClaimReceipts, type ReceiptGift, type ReceiptLang } from './gift-registry-receipt'
import { GIFT_CATALOG } from './gift-catalog'
import { MAX_TICKET_PARTY } from './types'
import type { GuestImportRow } from './guest-import-rows'
import {
  findDuplicates,
  toIdentity,
  type DuplicateMatch,
  type GuestIdentity,
} from './guest-duplicates'
import { guestPhoneKey } from './guest-duplicates'
import {
  assessRosterDelivery,
  resolveSendEligibility,
  type GuestDeliveryStatus,
} from './guest-delivery'
import {
  buildImportPreview,
  buildImportVerification,
  type GuestImportPreview,
  type GuestImportVerification,
  type ImportReviewRow,
} from './guest-import-review'
import type {
  AttendanceAnswer,
  CardStatus,
  ChildEntry,
  EventType,
  GuestInvitation,
  GuestWithInvitations,
  PaymentMethod,
  PledgeStatus,
  ReminderCadence,
  RsvpQuestionKind,
  RsvpQuestionOption,
  RsvpStatus,
  SendChannel,
  TicketLanguage,
} from './types'

function revalidateDashboard() {
  revalidatePath('/my/dashboard')
  revalidatePath('/my/dashboard/guests')
  revalidatePath('/my/dashboard/events')
  revalidatePath('/my/dashboard/invitations')
  revalidatePath('/my/dashboard/rsvps')
  revalidatePath('/my/dashboard/pledges')
  revalidatePath('/my/dashboard/website')
  revalidatePath('/my/dashboard/seating')
  revalidatePath('/my/dashboard/guestbook')
  revalidatePath('/my/dashboard/thank-you')
  revalidatePath('/my/dashboard/gift-registry')
}

// ---------------------------------------------------------------- Events

export interface EventInput {
  name: string
  event_type: EventType
  description?: string | null
  /** Celebrants' names for the entrance-pass ticket (second one optional —
   *  a kitchen party or birthday has a single celebrant). */
  partner1_name?: string | null
  partner2_name?: string | null
  venue_name?: string | null
  address?: string | null
  city?: string | null
  starts_at?: string | null
  ends_at?: string | null
  dress_code?: string | null
  /** Show on public website. Defaults to true server-side. */
  is_public?: boolean
  /** Let guests RSVP via the website. Defaults to false server-side. */
  allow_rsvp?: boolean
  sort_order?: number
}

export async function createEvent(input: EventInput): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { error } = await supabase.from('wedding_events').insert({
    user_id: user.id,
    name: input.name.trim(),
    event_type: input.event_type,
    description: input.description || null,
    partner1_name: input.partner1_name?.trim() || null,
    partner2_name: input.partner2_name?.trim() || null,
    venue_name: input.venue_name || null,
    address: input.address || null,
    city: input.city || null,
    starts_at: input.starts_at || null,
    ends_at: input.ends_at || null,
    dress_code: input.dress_code || null,
    is_public: input.is_public ?? true,
    allow_rsvp: input.allow_rsvp ?? false,
    sort_order: input.sort_order ?? 0,
  })
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

export async function updateEvent(id: string, input: EventInput): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const trimmedName = input.name.trim()

  // Renaming the event should carry its gift-registry and guestbook links
  // along when they're still following the event's own name (gift registry:
  // no custom header override; guestbook: always, it has no override concept)
  // — otherwise the link silently keeps pointing guests at the couple's old
  // name, same bug as a stale account-level slug, just triggered by a rename
  // instead of a header edit.
  const { data: existingEvent, error: existingEventErr } = await supabase
    .from('wedding_events')
    .select('gift_registry_header, gift_registry_slug, guestbook_slug, invite_slug')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle<{
      gift_registry_header: string | null
      gift_registry_slug: string | null
      guestbook_slug: string | null
      invite_slug: string | null
    }>()
  if (existingEventErr) throw new Error(existingEventErr.message)
  const expectedSlugBase = eventHeroSlugBase(existingEvent?.gift_registry_header ?? null, trimmedName)
  let giftRegistrySlug = existingEvent?.gift_registry_slug ?? null
  if (giftRegistrySlug && slugBaseOf(giftRegistrySlug) !== expectedSlugBase) {
    giftRegistrySlug = await reserveUniqueGiftRegistrySlug(supabase, expectedSlugBase)
  }
  const expectedGuestbookSlugBase = eventSlugBase(trimmedName)
  let guestbookSlug = existingEvent?.guestbook_slug ?? null
  if (guestbookSlug && slugBaseOf(guestbookSlug) !== expectedGuestbookSlugBase) {
    guestbookSlug = await reserveUniqueGuestbookSlug(supabase, expectedGuestbookSlugBase)
  }
  const previousInviteSlug = existingEvent?.invite_slug ?? null
  let inviteSlug = existingEvent?.invite_slug ?? null
  if (inviteSlug && slugBaseOf(inviteSlug) !== expectedGuestbookSlugBase) {
    inviteSlug = await reserveUniqueInviteSlug(supabase, expectedGuestbookSlugBase)
  }

  const { error } = await supabase
    .from('wedding_events')
    .update({
      name: trimmedName,
      event_type: input.event_type,
      description: input.description || null,
      partner1_name: input.partner1_name?.trim() || null,
      partner2_name: input.partner2_name?.trim() || null,
      venue_name: input.venue_name || null,
      address: input.address || null,
      city: input.city || null,
      starts_at: input.starts_at || null,
      ends_at: input.ends_at || null,
      dress_code: input.dress_code || null,
      is_public: input.is_public ?? true,
      allow_rsvp: input.allow_rsvp ?? false,
      sort_order: input.sort_order ?? 0,
      gift_registry_slug: giftRegistrySlug,
      guestbook_slug: guestbookSlug,
      invite_slug: inviteSlug,
    })
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  for (const slug of new Set([previousInviteSlug, inviteSlug].filter((s): s is string => Boolean(s)))) {
    revalidatePath(`/rsvp/event/${slug}`)
    revalidatePath(`/save-the-date/${slug}`)
  }
  revalidateDashboard()
}

export interface InvitationEventDetailsInput {
  partner1_name: string
  partner2_name?: string | null
  venue_name: string
  address?: string | null
  city: string
  venue_latitude?: string | number | null
  venue_longitude?: string | number | null
}

/** Save the fields used by the card, message identity, and View Location reply.
 *  They live on wedding_events so every invitation surface reads one source. */
export async function updateInvitationEventDetails(
  eventId: string,
  input: InvitationEventDetailsInput,
): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const cleanInput = (value: unknown, max: number) =>
    (typeof value === 'string' ? value : '').replace(/\s+/g, ' ').trim().slice(0, max)
  const partner1 = cleanInput(input?.partner1_name, 60)
  const partner2 = cleanInput(input?.partner2_name, 60) || null
  const venue = cleanInput(input?.venue_name, 120)
  const address = cleanInput(input?.address, 240) || null
  const city = cleanInput(input?.city, 80)
  const coordinates = parseInvitationCoordinates(input?.venue_latitude, input?.venue_longitude)

  if (!partner1) throw new Error('Add Partner 1 before sending invitations.')
  if (!venue && !address && !city) throw new Error('Add the event location before sending invitations.')
  if (!coordinates.ok) throw new Error(coordinates.error)

  const { data: existing, error: readError } = await supabase
    .from('wedding_events')
    .select('name, event_type')
    .eq('id', eventId)
    .eq('user_id', user.id)
    .maybeSingle<{ name: string; event_type: string }>()
  if (readError) throw new Error(readError.message)
  if (!existing) throw new Error('Event not found.')
  if (invitationPartner2Required({
    ...existing,
    partner1_name: partner1,
    partner2_name: partner2,
    venue_name: venue,
    address,
    city,
  }) && !partner2) {
    throw new Error('Add Partner 2 for this event before sending invitations.')
  }

  const { data, error } = await supabase
    .from('wedding_events')
    .update({
      partner1_name: partner1,
      partner2_name: partner2,
      venue_name: venue || null,
      address,
      city: city || null,
      venue_latitude: coordinates.value?.latitude ?? null,
      venue_longitude: coordinates.value?.longitude ?? null,
    })
    .eq('id', eventId)
    .eq('user_id', user.id)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('Event not found.')
  revalidateDashboard()
}

export async function deleteEvent(id: string): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { error } = await supabase.from('wedding_events').delete().eq('id', id).eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

/** Toggle "Collect RSVPs" for one event (the management-dashboard switch). */
export async function setEventAllowRsvp(eventId: string, allow: boolean): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { error } = await supabase
    .from('wedding_events')
    .update({ allow_rsvp: allow, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

// ---------------------------------------------------------------- RSVP questions

export interface RsvpQuestionInput {
  /** NULL = a general question asked to everyone; set = a per-event follow-up. */
  event_id?: string | null
  prompt: string
  description?: string | null
  kind: RsvpQuestionKind
  required?: boolean
  attending_only?: boolean
  /** For multiple_choice. Ids are generated server-side when missing. */
  options?: { id?: string; label: string; description?: string | null }[]
  sort_order?: number
}

/** Build a clean, validated options array for a multiple-choice question. */
function normalizeOptions(input: RsvpQuestionInput): RsvpQuestionOption[] {
  if (input.kind !== 'multiple_choice') return []
  return (input.options ?? [])
    .map((o) => ({
      id: o.id?.trim() || `opt_${crypto.randomUUID().slice(0, 8)}`,
      label: o.label.trim(),
      description: o.description?.trim() || null,
    }))
    .filter((o) => o.label.length > 0)
}

export async function createRsvpQuestion(input: RsvpQuestionInput): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const prompt = input.prompt.trim()
  if (!prompt) throw new Error('Please enter a question.')
  const options = normalizeOptions(input)
  if (input.kind === 'multiple_choice' && options.length < 2) {
    throw new Error('Multiple-choice questions need at least two options.')
  }
  const { error } = await supabase.from('rsvp_questions').insert({
    user_id: user.id,
    event_id: input.event_id ?? null,
    prompt,
    description: input.description?.trim() || null,
    kind: input.kind,
    // Multiple-choice answers are required by default; short answers are skippable.
    required: input.required ?? input.kind === 'multiple_choice',
    attending_only: input.attending_only ?? false,
    options,
    sort_order: input.sort_order ?? 0,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/my/dashboard/rsvps')
}

export async function updateRsvpQuestion(id: string, input: RsvpQuestionInput): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const prompt = input.prompt.trim()
  if (!prompt) throw new Error('Please enter a question.')
  const options = normalizeOptions(input)
  if (input.kind === 'multiple_choice' && options.length < 2) {
    throw new Error('Multiple-choice questions need at least two options.')
  }
  const { error } = await supabase
    .from('rsvp_questions')
    .update({
      event_id: input.event_id ?? null,
      prompt,
      description: input.description?.trim() || null,
      kind: input.kind,
      required: input.required ?? input.kind === 'multiple_choice',
      attending_only: input.attending_only ?? false,
      options,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidatePath('/my/dashboard/rsvps')
}

export async function deleteRsvpQuestion(id: string): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { error } = await supabase.from('rsvp_questions').delete().eq('id', id).eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidatePath('/my/dashboard/rsvps')
}

/** Persist a new ordering for a set of questions (drag-to-reorder). */
export async function reorderRsvpQuestions(orderedIds: string[]): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  await Promise.all(
    orderedIds.map((id, i) =>
      supabase
        .from('rsvp_questions')
        .update({ sort_order: i, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', user.id),
    ),
  )
  revalidatePath('/my/dashboard/rsvps')
}

// ---------------------------------------------------------------- Guests

export interface GuestInput {
  /** Required for the legacy code path / public RSVP page; auto-synthesized from
   *  title + first + last + suffix when first_name/last_name are present. */
  full_name?: string
  title?: string | null
  first_name?: string | null
  last_name?: string | null
  suffix?: string | null

  plus_one_title?: string | null
  plus_one_first_name?: string | null
  plus_one_last_name?: string | null
  plus_one_suffix?: string | null
  plus_one_name_unknown?: boolean

  children?: ChildEntry[]

  email?: string | null
  phone?: string | null
  whatsapp_phone?: string | null
  group_tag?: string | null
  max_party_size?: number
  notes?: string | null

  name_on_envelope?: string | null
  address_country?: string | null
  address_line1?: string | null
  address_apt?: string | null
  address_city?: string | null
  address_region?: string | null
  address_postal_code?: string | null

  /** Event ids this guest should be invited to (syncs invitations). */
  eventIds?: string[]
}

function composeName(parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' ')
}

function ticketPartySize(value: number | null | undefined): number {
  return Math.min(MAX_TICKET_PARTY, Math.max(1, Number(value) || 1))
}

function guestColumnsFromInput(input: GuestInput): Record<string, unknown> {
  const first = (input.first_name ?? '').trim() || null
  const last = (input.last_name ?? '').trim() || null
  const title = (input.title ?? '').trim() || null
  const suffix = (input.suffix ?? '').trim() || null
  const composed = composeName([title, first, last, suffix])
  const full_name = (input.full_name ?? composed).trim()
  if (!full_name) throw new Error('Guest name is required')

  const plusOneNameUnknown = input.plus_one_name_unknown === true
  const plusOneFirst = (input.plus_one_first_name ?? '').trim() || null
  const plusOneLast = (input.plus_one_last_name ?? '').trim() || null
  const children = (input.children ?? [])
    .map((c) => ({
      first_name: (c.first_name ?? '').trim(),
      last_name: (c.last_name ?? '').trim(),
    }))
    .filter((c) => c.first_name || c.last_name)

  // Derive a sensible max_party_size if the caller didn't pin one, capped at
  // the Single/Double ticket limit (a plus-one + children can push the
  // derived count higher, but an invite never covers more than two seats).
  const hasPlusOne = plusOneNameUnknown || Boolean(plusOneFirst) || Boolean(plusOneLast)
  const derivedParty = 1 + (hasPlusOne ? 1 : 0) + children.length
  const max_party_size = ticketPartySize(input.max_party_size ?? derivedParty)

  return {
    full_name,
    title,
    first_name: first,
    last_name: last,
    suffix,

    plus_one_title: (input.plus_one_title ?? '').trim() || null,
    plus_one_first_name: plusOneFirst,
    plus_one_last_name: plusOneLast,
    plus_one_suffix: (input.plus_one_suffix ?? '').trim() || null,
    plus_one_name_unknown: plusOneNameUnknown,

    children,

    email: (input.email ?? '').trim() || null,
    phone: (input.phone ?? '').trim() || null,
    whatsapp_phone: (input.whatsapp_phone ?? '').trim() || null,
    group_tag: (input.group_tag ?? '').trim() || null,
    max_party_size,
    notes: (input.notes ?? '').trim() || null,

    name_on_envelope: (input.name_on_envelope ?? '').trim() || null,
    address_country: (input.address_country ?? '').trim() || null,
    address_line1: (input.address_line1 ?? '').trim() || null,
    address_apt: (input.address_apt ?? '').trim() || null,
    address_city: (input.address_city ?? '').trim() || null,
    address_region: (input.address_region ?? '').trim() || null,
    address_postal_code: (input.address_postal_code ?? '').trim() || null,
  }
}

async function syncInvitations(userId: string, guestId: string, requestedEventIds: string[], maxPartySize?: number) {
  const supabase = createDashboardClient()
  const eventIds = await ownedEventIds(userId, requestedEventIds)
  const party_size = ticketPartySize(maxPartySize)
  const { data: existing } = await supabase
    .from('guest_invitations')
    .select('id, event_id, rsvp_status')
    .eq('user_id', userId)
    .eq('guest_contact_id', guestId)

  const have = new Map((existing ?? []).map((r) => [r.event_id as string, r as { id: string; event_id: string; rsvp_status: RsvpStatus | null }]))
  const want = new Set(eventIds)

  const toAdd = eventIds.filter((eid) => !have.has(eid))
  const toRemove = [...have.entries()].filter(([eid]) => !want.has(eid)).map(([, r]) => r.id)
  const toAlign = [...have.values()]
    .filter((r) => want.has(r.event_id) && (r.rsvp_status ?? 'pending') === 'pending')
    .map((r) => r.id)

  if (toAdd.length) {
    const { error } = await supabase.from('guest_invitations').insert(
      toAdd.map((event_id) => ({ user_id: userId, guest_contact_id: guestId, event_id, party_size }))
    )
    if (error) throw new Error(error.message)
  }
  if (toAlign.length) {
    const { error } = await supabase
      .from('guest_invitations')
      .update({ party_size })
      .in('id', toAlign)
    if (error) throw new Error(error.message)
  }
  if (toRemove.length) {
    const { error } = await supabase.from('guest_invitations').delete().in('id', toRemove)
    if (error) throw new Error(error.message)
  }
}

/** All of the couple's event ids — the default linkage for a new guest. */
async function allOwnedEventIds(userId: string): Promise<string[]> {
  const supabase = createDashboardClient()
  const { data } = await supabase.from('wedding_events').select('id').eq('user_id', userId)
  return (data ?? []).map((r) => r.id as string)
}

/** Guarantee a guest is linked to every one of the couple's events — the
 *  unified-roster invariant every surface (RSVPs, funnel, taps) relies on. */
async function ensureInvitationsForAllEvents(userId: string, guestId: string, maxPartySize?: number): Promise<void> {
  const supabase = createDashboardClient()
  const eventIds = await allOwnedEventIds(userId)
  if (!eventIds.length) return
  let party_size = ticketPartySize(maxPartySize)
  if (typeof maxPartySize !== 'number') {
    const { data: guest, error: guestErr } = await supabase
      .from('guest_contacts')
      .select('max_party_size')
      .eq('id', guestId)
      .eq('user_id', userId)
      .maybeSingle<{ max_party_size: number | null }>()
    if (guestErr) throw new Error(guestErr.message)
    party_size = ticketPartySize(guest?.max_party_size)
  }
  const { data: existing } = await supabase
    .from('guest_invitations')
    .select('id, event_id, rsvp_status')
    .eq('user_id', userId)
    .eq('guest_contact_id', guestId)
  const have = new Set((existing ?? []).map((r) => r.event_id as string))
  const missing = eventIds.filter((id) => !have.has(id))
  if (missing.length) {
    await supabase
      .from('guest_invitations')
      .insert(missing.map((event_id) => ({ user_id: userId, guest_contact_id: guestId, event_id, party_size })))
  }
  const pendingIds = (existing ?? [])
    .filter((r) => (r.rsvp_status ?? 'pending') === 'pending')
    .map((r) => r.id as string)
  if (pendingIds.length) {
    await supabase
      .from('guest_invitations')
      .update({ party_size })
      .in('id', pendingIds)
  }
}

async function alignPendingInvitationPartySize(userId: string, guestId: string, maxPartySize: number): Promise<void> {
  const supabase = createDashboardClient()
  const { data, error: readErr } = await supabase
    .from('guest_invitations')
    .select('id')
    .eq('user_id', userId)
    .eq('guest_contact_id', guestId)
    .eq('rsvp_status', 'pending')
  if (readErr) throw new Error(readErr.message)
  const ids = (data ?? []).map((r) => r.id as string)
  if (!ids.length) return
  const { error } = await supabase
    .from('guest_invitations')
    .update({ party_size: ticketPartySize(maxPartySize) })
    .in('id', ids)
  if (error) throw new Error(error.message)
}

/**
 * Returned rather than thrown — Next.js strips thrown Server Action error
 * messages in production builds down to a generic "Server Components render"
 * message with no detail, which makes an expected outcome like a duplicate
 * phone number look like a crash. Returning it keeps the real message intact.
 *
 * `updateGuest` used to throw, which is why a failed EDIT looked like nothing
 * happening at all: the write genuinely failed, and the reason was discarded
 * in transit. Both writes now return the saved row too, so the client can
 * update its own list instead of waiting on a full page re-render.
 */
export type SaveGuestResult =
  | { ok: true; guest: GuestWithInvitations }
  | { ok: false; error: string; conflicts?: DuplicateMatch[] }

export type CreateGuestResult = SaveGuestResult

/**
 * The deliverability gate, loaded once per send run.
 *
 * Every outbound path asks this same question through this same function.
 * A send loop that re-derived "can I send to this guest?" for itself is how
 * the duplicate guard and the send paths came to disagree in the first place.
 */
async function loadDeliveryGate(userId: string): Promise<Map<string, GuestDeliveryStatus>> {
  return assessRosterDelivery(await loadRosterIdentities(userId))
}

/** Re-read one guest with its invitations, so the client can patch its list. */
async function readGuestWithInvitations(
  userId: string,
  guestId: string,
): Promise<GuestWithInvitations | null> {
  const supabase = createDashboardClient()
  const [{ data: guest }, { data: invitations }] = await Promise.all([
    supabase.from('guest_contacts').select('*').eq('id', guestId).eq('user_id', userId).maybeSingle(),
    supabase.from('guest_invitations').select('*').eq('user_id', userId).eq('guest_contact_id', guestId),
  ])
  if (!guest) return null
  return {
    ...(guest as GuestWithInvitations),
    invitations: (invitations ?? []) as GuestInvitation[],
  }
}

export async function createGuest(input: GuestInput): Promise<CreateGuestResult> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()

  // Built before the duplicate check so the name compared is the same name
  // that would be stored (title + first + last + suffix, composed).
  let columns: Record<string, unknown>
  try {
    columns = guestColumnsFromInput(input)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Guest name is required' }
  }

  // One person, one row. Compares NORMALIZED numbers, not raw digits: the
  // original guard compared `replace(/\D/g,'')`, so '0757200767' and
  // '+255757200767' — the same Tanzanian number — did not clash and two guests
  // ended up sharing one number. The database enforces this too; this check
  // exists to name the other guest rather than surface a constraint violation.
  const candidate = toIdentity({
    id: null,
    full_name: String(columns.full_name ?? ''),
    phone: input.phone,
    whatsapp_phone: input.whatsapp_phone,
  })
  const conflicts = findDuplicates(candidate, await loadRosterIdentities(user.id))
  const blocking = conflicts.filter((c) => c.level === 'blocked')
  if (blocking.length > 0) {
    return { ok: false, error: blocking[0].reason, conflicts }
  }

  const { data, error } = await supabase
    .from('guest_contacts')
    .insert({ user_id: user.id, ...columns })
    .select('id')
    .single<{ id: string }>()
  if (error || !data) {
    // The unique index is the real gate. Two admins adding the same number at
    // once both pass the check above, and one of them lands here.
    if (error?.code === '23505') {
      return { ok: false, error: 'That number was just added to your list by someone else.' }
    }
    return { ok: false, error: error?.message ?? 'Failed to create guest' }
  }

  // Unified roster: a non-empty eventIds list (Guests form selection) narrows
  // deliberately; ANYTHING else — undefined (quick-add) or [] (form saved with
  // nothing ticked) — links the guest to every event. Zero-link guests are the
  // drift that made the dashboard surfaces disagree.
  if (input.eventIds?.length) {
    await syncInvitations(user.id, data.id, input.eventIds, input.max_party_size)
  } else {
    await ensureInvitationsForAllEvents(user.id, data.id, input.max_party_size)
  }
  const saved = await readGuestWithInvitations(user.id, data.id)
  if (!saved) return { ok: false, error: 'Guest was created but could not be read back' }
  revalidateDashboard()
  return { ok: true, guest: saved }
}

export async function updateGuest(id: string, input: GuestInput): Promise<SaveGuestResult> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()

  let columns: Record<string, unknown>
  try {
    columns = guestColumnsFromInput(input)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Guest name is required' }
  }

  // An EDIT could always create a duplicate — this path had no check at all,
  // so retyping one guest's number onto another was accepted in full. The
  // candidate carries its own id so a guest is never a duplicate of itself.
  const candidate = toIdentity({
    id,
    full_name: String(columns.full_name ?? ''),
    phone: input.phone,
    whatsapp_phone: input.whatsapp_phone,
  })
  const conflicts = findDuplicates(candidate, await loadRosterIdentities(user.id))
  const blocking = conflicts.filter((c) => c.level === 'blocked')
  if (blocking.length > 0) {
    return { ok: false, error: blocking[0].reason, conflicts }
  }

  const { error } = await supabase
    .from('guest_contacts')
    .update(columns)
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'Another guest on your list already uses that number.' }
    }
    return { ok: false, error: error.message }
  }

  if (input.eventIds) {
    await syncInvitations(user.id, id, input.eventIds, input.max_party_size)
  }
  const saved = await readGuestWithInvitations(user.id, id)
  if (!saved) return { ok: false, error: 'Guest was saved but could not be read back' }
  revalidateDashboard()
  return { ok: true, guest: saved }
}

export async function deleteGuest(id: string): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { error } = await supabase.from('guest_contacts').delete().eq('id', id).eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

/** Bulk remove guests from the roster in one statement (Send Invites table). */
export async function deleteGuests(guestIds: string[]): Promise<number> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  if (!guestIds.length) return 0
  const { data, error } = await supabase
    .from('guest_contacts')
    .delete()
    .in('id', guestIds)
    .eq('user_id', user.id)
    .select('id')
  if (error) throw new Error(error.message)
  revalidateDashboard()
  return data?.length ?? 0
}

/**
 * Mark guests as attending, so a hand-delivered pass works at the door.
 *
 * The couple sends a card and an entrance pass by hand whenever WhatsApp
 * refuses to deliver. Until the guest is attending that pass is half a
 * product: it renders, but checkin_admit_guest() carries its own
 * `rsvp_status = 'attending'` predicate and turns them away at the gate.
 *
 * This is the supported way to close that gap. It is a couple-initiated
 * admission, not a forged reply: `responded_at` is left alone, so the RSVP
 * figures still count real replies and the roster is not quietly inflated
 * with answers nobody gave.
 *
 * Consumes no credit. rsvp_status and credit_consumptions are separate
 * ledgers, and this touches only the first.
 */
export async function markGuestsAttending(guestIds: string[], eventId?: string): Promise<number> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  if (!guestIds.length) return 0
  const resolvedEventId = await resolveDefaultEventId(eventId)
  if (!resolvedEventId) throw new Error('Set up an event first.')

  // Only guests who have not already answered. Overwriting a real "attending"
  // is a no-op, but overwriting a real "declined" would erase somebody's
  // decision, and this action exists to unlock a door — not to change minds.
  const { data, error } = await supabase
    .from('guest_invitations')
    .update({ rsvp_status: 'attending' })
    .eq('user_id', user.id)
    .eq('event_id', resolvedEventId)
    .eq('rsvp_status', 'pending')
    .in('guest_contact_id', guestIds)
    .select('id')
  if (error) throw new Error(error.message)
  revalidateDashboard()
  return data?.length ?? 0
}

/**
 * Stage one of an import: say what the file WOULD do, change nothing.
 *
 * This replaces an importer that inserted immediately and reported three
 * integers. A row whose number already existed was dropped silently, so the
 * admin saw "2 skipped as duplicates" and never learned which two, or against
 * whom. On the Moses Seeta list that cost Mama Meena her number outright — it
 * collided with a later row in the same file, her record was written with no
 * number at all, and the number reappeared by hand on a different guest hours
 * later. Nothing in the product could show that had happened.
 */
export async function previewGuestImport(input: GuestImportRow[]): Promise<GuestImportPreview> {
  const user = await requireDashboardUser()
  const rows = normalizeImportRows(input)
  return buildImportPreview(rows, await loadRosterIdentities(user.id))
}

/** Re-validated server-side; the browser is never trusted for name or party size. */
function normalizeImportRows(input: GuestImportRow[]): GuestImportRow[] {
  return (Array.isArray(input) ? input : []).map((row) => ({
    full_name: String(row?.full_name ?? '').trim(),
    email: String(row?.email ?? '').trim() || null,
    phone: String(row?.phone ?? '').trim() || null,
    max_party_size: ticketPartySize(row?.max_party_size),
  }))
}

/** What a committed import actually did. */
export interface GuestImportOutcome {
  imported: number
  /** Rows the admin left unresolved, or that the DB refused on write. */
  notImported: number
  /** Rows imported with no phone number: they cannot be messaged. */
  importedWithoutPhone: number
  /** Named, so a shortfall is never just a number. */
  rejected: { name: string; reason: string }[]
  /** File reconciled against the roster read back out of the database. */
  verification: GuestImportVerification
}

/**
 * Stage two: write the rows the admin approved.
 *
 * The preview is re-run here rather than trusting the browser's verdict. The
 * roster can change between preview and commit (a second admin importing, a
 * guest added by hand), and re-checking is what makes concurrent imports safe
 * at this layer. The unique index behind it is what makes them safe at all.
 */
export async function commitGuestImport(
  input: GuestImportRow[],
  approvedLineNumbers: number[],
  eventIds: string[] = [],
): Promise<GuestImportOutcome> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()

  const rows = normalizeImportRows(input)
  const approved = new Set(approvedLineNumbers)
  const preview = buildImportPreview(rows, await loadRosterIdentities(user.id))

  const rejected: { name: string; reason: string }[] = []
  const toWrite: ImportReviewRow[] = []
  for (const reviewed of preview.rows) {
    if (!approved.has(reviewed.lineNumber)) continue
    // An admin can approve a Level 2 hold — that is the point of the review
    // screen. They cannot approve a row the DATABASE will refuse, because the
    // insert would fail and take the rest of the batch with it.
    if (reviewed.flags.hasExactPhoneDuplicate || reviewed.flags.hasExactNameDuplicate || reviewed.flags.hasMissingName) {
      rejected.push({
        name: reviewed.row.full_name || `Row ${reviewed.lineNumber}`,
        reason: reviewed.issues[0] ?? 'Unresolved conflict',
      })
      continue
    }
    toWrite.push(reviewed)
  }

  if (toWrite.length === 0) {
    return {
      imported: 0,
      notImported: rejected.length,
      importedWithoutPhone: 0,
      rejected,
      verification: buildImportVerification(rows, await loadRosterIdentities(user.id)),
    }
  }

  const { data, error } = await supabase
    .from('guest_contacts')
    .insert(
      toWrite.map((r) => ({
        user_id: user.id,
        full_name: r.row.full_name,
        email: r.row.email,
        phone: r.row.phone,
        // The imported number is the WhatsApp number too. A spreadsheet carries
        // ONE mobile column (the header map folds "whatsapp" into it), and a
        // guest with no whatsapp_phone reads as SMS-only on the send console, so
        // leaving it null made every import a second pass of copying the same
        // number across by hand. Same defaulting updateGuestPhone already does.
        whatsapp_phone: r.row.phone,
        max_party_size: r.row.max_party_size,
      })),
    )
    .select('id, max_party_size')
  if (error) {
    if (error.code === '23505') {
      throw new Error(
        'One of these numbers was added to your list while you were reviewing. Re-run the import to see which.',
      )
    }
    throw new Error(error.message)
  }

  // Unified roster: no explicit event selection means link to every event.
  const ownedIds = eventIds.length
    ? await ownedEventIds(user.id, eventIds)
    : await allOwnedEventIds(user.id)
  if (ownedIds.length && data?.length) {
    const invites = data.flatMap((g) =>
      ownedIds.map((event_id) => ({
        user_id: user.id,
        guest_contact_id: g.id,
        event_id,
        party_size: ticketPartySize(g.max_party_size as number | null),
      }))
    )
    const { error: invErr } = await supabase.from('guest_invitations').insert(invites)
    if (invErr) throw new Error(invErr.message)
  }
  revalidateDashboard()
  return {
    imported: toWrite.length,
    notImported: preview.rows.length - toWrite.length,
    importedWithoutPhone: toWrite.filter((r) => !r.phoneNormalized).length,
    rejected,
    // Reconciled by re-reading the roster from the database, NOT from what we
    // believe we just wrote. An importer reporting its own success is what let
    // a dropped row go unnoticed for weeks.
    verification: buildImportVerification(rows, await loadRosterIdentities(user.id)),
  }
}

/**
 * Check a spreadsheet against the stored guest list without importing anything.
 *
 * Lets an admin answer "does the table actually match my file?" at any time,
 * including for imports done before this receipt existed.
 */
export async function verifyGuestImport(input: GuestImportRow[]): Promise<GuestImportVerification> {
  const user = await requireDashboardUser()
  return buildImportVerification(normalizeImportRows(input), await loadRosterIdentities(user.id))
}

// ---------------------------------------------------------------- RSVPs (owner edit)

export interface RsvpUpdate {
  rsvp_status?: RsvpStatus
  party_size?: number
  meal_choice?: string | null
  dietary_notes?: string | null
  guest_message?: string | null
}

export async function updateRsvp(invitationId: string, update: RsvpUpdate): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const patch: Record<string, unknown> = { ...update }
  if (typeof update.party_size === 'number') {
    patch.party_size = Math.min(MAX_TICKET_PARTY, Math.max(1, update.party_size))
  }
  if (update.rsvp_status) patch.responded_at = new Date().toISOString()
  const { error } = await supabase
    .from('guest_invitations')
    .update(patch)
    .eq('id', invitationId)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

// ---------------------------------------------------------------- Sending

export async function recordSend(guestId: string, channel: SendChannel, eventId?: string): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()

  const { data: guest } = await supabase
    .from('guest_contacts')
    .select('invite_count')
    .eq('id', guestId)
    .eq('user_id', user.id)
    .maybeSingle<{ invite_count: number }>()
  if (!guest) throw new Error('Guest not found')

  const { error } = await supabase
    .from('guest_contacts')
    .update({ last_invited_at: new Date().toISOString(), invite_count: guest.invite_count + 1 })
    .eq('id', guestId)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)

  const { error: logErr } = await supabase
    .from('guest_message_log')
    .insert({ user_id: user.id, guest_contact_id: guestId, channel, event_id: eventId ?? null })
  if (logErr) throw new Error(logErr.message)
  revalidateDashboard()
}

// ---------------------------------------------------------------- Pledges ("michango")

export interface PledgeInput {
  /** Which wedding_event the pledge is for. Must belong to the signed-in couple. */
  eventId?: string
  /** Link to an existing contributor. When omitted, a new guest_contacts row is created. */
  guestContactId?: string
  /** New contributor details (used only when guestContactId is omitted). */
  full_name?: string
  phone?: string | null
  whatsapp_phone?: string | null
  email?: string | null
  group_tag?: string | null
  max_party_size?: number

  pledged_amount?: number
  amount_received?: number
  currency?: string
  promised_date?: string | null
  status?: PledgeStatus
  payment_method?: PaymentMethod | null
  will_attend?: AttendanceAnswer | null
  card_status?: CardStatus
  reminder_cadence?: ReminderCadence
  notes?: string | null
}

const CADENCE_DAYS: Record<ReminderCadence, number | null> = {
  none: null,
  weekly: 7,
  biweekly: 14,
}

/** Next reminder timestamp from a cadence, measured from `from` (default now). */
function nextReminderAt(cadence: ReminderCadence, from = new Date()): string | null {
  const days = CADENCE_DAYS[cadence]
  if (!days) return null
  const next = new Date(from)
  next.setDate(next.getDate() + days)
  return next.toISOString()
}

/** Derive a status from the money when the caller didn't pin one explicitly. */
function derivePledgeStatus(
  explicit: PledgeStatus | undefined,
  pledged: number,
  received: number,
): PledgeStatus {
  if (explicit) return explicit
  if (received <= 0) return pledged > 0 ? 'pledged' : 'invited'
  if (received >= pledged && pledged > 0) return 'paid'
  return 'partial'
}

function pledgeColumnsFromInput(input: PledgeInput): Record<string, unknown> {
  const pledged = Math.max(0, Number(input.pledged_amount ?? 0))
  const received = Math.max(0, Number(input.amount_received ?? 0))
  const cadence: ReminderCadence = input.reminder_cadence ?? 'none'
  return {
    pledged_amount: pledged,
    amount_received: received,
    currency: (input.currency ?? 'TZS').trim() || 'TZS',
    promised_date: input.promised_date || null,
    status: derivePledgeStatus(input.status, pledged, received),
    payment_method: input.payment_method || null,
    will_attend: input.will_attend || null,
    card_status: input.card_status ?? 'none',
    reminder_cadence: cadence,
    next_reminder_at: nextReminderAt(cadence),
    notes: (input.notes ?? '').trim() || null,
  }
}

/**
 * Resolve the event a pledge belongs to: a verified-owned explicit choice,
 * else the couple's default (first) event, else null for couples with no
 * events yet.
 */
async function resolvePledgeEventId(userId: string, explicit?: string): Promise<string | null> {
  if (explicit) {
    const owned = await resolveOwnedEventId(userId, explicit)
    if (!owned) throw new Error('Event not found')
    return owned
  }
  return resolveEventIdOrDefault(userId)
}

/** Resolve the contributor's contact row, creating one when a new name is given. */
async function resolvePledgeContact(userId: string, input: PledgeInput): Promise<string> {
  const supabase = createDashboardClient()
  if (input.guestContactId) {
    const { data } = await supabase
      .from('guest_contacts')
      .select('id')
      .eq('id', input.guestContactId)
      .eq('user_id', userId)
      .maybeSingle<{ id: string }>()
    if (!data) throw new Error('Contributor not found')
    if (typeof input.max_party_size === 'number') {
      const { error } = await supabase
        .from('guest_contacts')
        .update({ max_party_size: ticketPartySize(input.max_party_size) })
        .eq('id', data.id)
        .eq('user_id', userId)
      if (error) throw new Error(error.message)
      await alignPendingInvitationPartySize(userId, data.id, input.max_party_size)
    }
    return data.id
  }
  const full_name = (input.full_name ?? '').trim()
  if (!full_name) throw new Error("Enter the contributor's name")
  const { data, error } = await supabase
    .from('guest_contacts')
    .insert({
      user_id: userId,
      full_name,
      phone: (input.phone ?? '').trim() || null,
      whatsapp_phone: (input.whatsapp_phone ?? '').trim() || null,
      email: (input.email ?? '').trim() || null,
      group_tag: (input.group_tag ?? '').trim() || null,
      max_party_size: ticketPartySize(input.max_party_size),
    })
    .select('id')
    .single<{ id: string }>()
  if (error || !data) throw new Error(error?.message ?? 'Failed to create contributor')
  return data.id
}

export async function createPledge(input: PledgeInput): Promise<string> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const [guestContactId, eventId] = await Promise.all([
    resolvePledgeContact(user.id, input),
    resolvePledgeEventId(user.id, input.eventId),
  ])

  const { data, error } = await supabase
    .from('event_pledges')
    .insert({
      user_id: user.id,
      guest_contact_id: guestContactId,
      event_id: eventId,
      ...pledgeColumnsFromInput(input),
    })
    .select('id')
    .single<{ id: string }>()
  if (error || !data) throw new Error(error?.message ?? 'Failed to create pledge')
  revalidateDashboard()
  return data.id
}

export async function updatePledge(id: string, input: PledgeInput): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  if (input.guestContactId && typeof input.max_party_size === 'number') {
    const { error } = await supabase
      .from('guest_contacts')
      .update({ max_party_size: ticketPartySize(input.max_party_size) })
      .eq('id', input.guestContactId)
      .eq('user_id', user.id)
    if (error) throw new Error(error.message)
    await alignPendingInvitationPartySize(user.id, input.guestContactId, input.max_party_size)
  }
  // Allow moving a pledge onto a different existing contributor, but never null it.
  const patch = pledgeColumnsFromInput(input)
  if (input.guestContactId) {
    const contactId = await resolvePledgeContact(user.id, { guestContactId: input.guestContactId })
    ;(patch as Record<string, unknown>).guest_contact_id = contactId
  }
  // Same for the event: an explicit choice is verified, absence means "keep".
  if (input.eventId) {
    patch.event_id = await resolvePledgeEventId(user.id, input.eventId)
  }
  const { error } = await supabase
    .from('event_pledges')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

/** One-click "they paid": set received to the full pledged amount and mark paid. */
export async function markPledgePaid(id: string): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()

  const { data: pledge } = await supabase
    .from('event_pledges')
    .select('pledged_amount')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle<{ pledged_amount: number }>()
  if (!pledge) throw new Error('Pledge not found')

  const { error } = await supabase
    .from('event_pledges')
    .update({
      amount_received: pledge.pledged_amount,
      status: 'paid',
      next_reminder_at: null,
    })
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

export async function deletePledge(id: string): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { error } = await supabase.from('event_pledges').delete().eq('id', id).eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

/** Log a follow-up and advance the reminder schedule (mirrors recordSend). */
export async function recordPledgeReminder(pledgeId: string, channel: SendChannel): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()

  const { data: pledge } = await supabase
    .from('event_pledges')
    .select('reminder_count, reminder_cadence')
    .eq('id', pledgeId)
    .eq('user_id', user.id)
    .maybeSingle<{ reminder_count: number; reminder_cadence: ReminderCadence }>()
  if (!pledge) throw new Error('Pledge not found')

  const now = new Date()
  const { error } = await supabase
    .from('event_pledges')
    .update({
      last_reminded_at: now.toISOString(),
      reminder_count: pledge.reminder_count + 1,
      next_reminder_at: nextReminderAt(pledge.reminder_cadence, now),
    })
    .eq('id', pledgeId)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)

  const { error: logErr } = await supabase
    .from('pledge_reminder_log')
    .insert({ user_id: user.id, pledge_id: pledgeId, channel })
  if (logErr) throw new Error(logErr.message)
  revalidateDashboard()
}

/** Result of an actual (tracked) SMS/email reminder send — as opposed to the
 *  old behaviour of just opening the couple's own SMS/Mail app with a
 *  prefilled draft and optimistically marking it "sent" the moment the link
 *  was clicked, with no confirmation the couple ever pressed send there. */
export interface PledgeReminderSendResult {
  ok: boolean
  /** True when no live gateway is configured — the message was logged, not
   *  actually delivered. */
  dryRun: boolean
  error?: string
}

/** Send a reminder SMS with the given (already-composed, owing-amount-aware)
 *  message text, and only mark the reminder as sent once the provider
 *  confirms it. `message` comes from the caller (pledgeReminderMessage) since
 *  its content — amount owing, due date, payment instructions — depends on
 *  live data the caller already has; this action just delivers it. */
export async function sendPledgeReminderSms(pledgeId: string, message: string): Promise<PledgeReminderSendResult> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const provider = getSmsProvider('pledge')

  const { data: pledge } = await supabase
    .from('event_pledges')
    .select('guest_contact_id')
    .eq('id', pledgeId)
    .eq('user_id', user.id)
    .maybeSingle<{ guest_contact_id: string }>()
  if (!pledge) return { ok: false, dryRun: !provider.live, error: 'Pledge not found' }

  const { data: contact } = await supabase
    .from('guest_contacts')
    .select('phone, whatsapp_phone')
    .eq('id', pledge.guest_contact_id)
    .eq('user_id', user.id)
    .maybeSingle<{ phone: string | null; whatsapp_phone: string | null }>()
  const to = normalizePhone(contact?.phone ?? contact?.whatsapp_phone)
  if (!to) return { ok: false, dryRun: !provider.live, error: 'No phone number on file' }

  const result = await provider.sendText(to, message)
  if (result.ok) await recordPledgeReminder(pledgeId, 'sms')
  return { ok: result.ok, dryRun: Boolean(result.dryRun), error: result.error }
}

/** Send a reminder email with the given (already-composed) message text —
 *  same tracked-on-confirmed-success contract as sendPledgeReminderSms. */
export async function sendPledgeReminderEmail(pledgeId: string, message: string): Promise<PledgeReminderSendResult> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const live = isEmailConfigured()

  const { data: pledge } = await supabase
    .from('event_pledges')
    .select('guest_contact_id')
    .eq('id', pledgeId)
    .eq('user_id', user.id)
    .maybeSingle<{ guest_contact_id: string }>()
  if (!pledge) return { ok: false, dryRun: !live, error: 'Pledge not found' }

  const { data: contact } = await supabase
    .from('guest_contacts')
    .select('email')
    .eq('id', pledge.guest_contact_id)
    .eq('user_id', user.id)
    .maybeSingle<{ email: string | null }>()
  if (!contact?.email) return { ok: false, dryRun: !live, error: 'No email on file' }

  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('partner1_name, partner2_name')
    .eq('user_id', user.id)
    .maybeSingle<{ partner1_name: string | null; partner2_name: string | null }>()
  const coupleName =
    [profile?.partner1_name, profile?.partner2_name]
      .filter(Boolean)
      .map((n) => firstNameOf(n!))
      .join(' & ') || 'The Couple'

  let ok = true
  if (live) {
    ok = (
      await sendEmail({
        to: contact.email,
        subject: `A gentle reminder — ${coupleName}`,
        html: message.replace(/\n/g, '<br>'),
        text: message,
      })
    ).sent
  } else {
    console.warn('[email:dry-run] would send pledge reminder', { to: contact.email })
  }
  if (ok) await recordPledgeReminder(pledgeId, 'email')
  return { ok, dryRun: !live, error: ok ? undefined : 'Send failed' }
}

// ---------------------------------------------------------------- Couple profile

export interface CoupleProfileInput {
  partner1_name: string
  partner2_name?: string | null
  wedding_date?: string | null
  whatsapp_phone?: string | null
  city?: string | null
  pledge_payment_instructions?: string | null
  pledge_goal_amount?: number | null
}

export async function upsertCoupleProfile(input: CoupleProfileInput): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const partner1Name = input.partner1_name.trim()
  const partner2Name = input.partner2_name || null

  // Keep the public share slug (/gift-registry, /guestbook, /i) tracking the
  // couple's current names — it's otherwise frozen at whatever names existed
  // the first time sharing was enabled, which is often a placeholder set
  // before the couple filled in their real names.
  const { data: existing, error: existingErr } = await supabase
    .from('couple_profiles')
    .select('public_slug, registry_header')
    .eq('user_id', user.id)
    .maybeSingle<{ public_slug: string | null; registry_header: string | null }>()
  if (existingErr) throw new Error(existingErr.message)
  const expectedSlugBase = heroSlugBase(existing?.registry_header ?? null, partner1Name, partner2Name)
  let publicSlug = existing?.public_slug ?? null
  if (!publicSlug || slugBaseOf(publicSlug) !== expectedSlugBase) {
    publicSlug = await reserveUniqueSlug(supabase, expectedSlugBase)
  }

  const { error } = await supabase.from('couple_profiles').upsert(
    {
      user_id: user.id,
      partner1_name: partner1Name,
      partner2_name: partner2Name,
      public_slug: publicSlug,
      wedding_date: input.wedding_date || null,
      whatsapp_phone: input.whatsapp_phone || null,
      city: input.city || null,
      pledge_payment_instructions: input.pledge_payment_instructions || null,
      pledge_goal_amount:
        input.pledge_goal_amount && input.pledge_goal_amount > 0 ? input.pledge_goal_amount : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )
  if (error) throw new Error(error.message)
  revalidatePath('/my/dashboard/settings')
  revalidateDashboard()
}

/** Update just the pledge-collection settings (goal + how-to-pay) without
 *  touching the couple's names. Creates a minimal profile row if none exists. */
export async function updatePledgeCollection(input: {
  goalAmount: number | null
  paymentMethods: PledgePaymentMethod[]
}): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  // Keep only filled-in rows; derive the legacy text so reminders keep working.
  const methods = (input.paymentMethods ?? []).filter((m) => m.label?.trim() || m.value?.trim())
  const patch = {
    pledge_goal_amount: input.goalAmount && input.goalAmount > 0 ? input.goalAmount : null,
    pledge_payment_methods: methods,
    pledge_payment_instructions: paymentMethodsToText(methods) || null,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('couple_profiles')
    .update(patch)
    .eq('user_id', user.id)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    const { error: insErr } = await supabase
      .from('couple_profiles')
      .insert({ user_id: user.id, partner1_name: 'The Couple', ...patch })
    if (insErr) throw new Error(insErr.message)
  }
  revalidatePath('/my/dashboard/pledges')
  revalidatePath('/my/dashboard/settings')
}

/** When a couple's first-ever per-event pledge cover is about to be written,
 *  and they have a legacy top-level cover (set before per-event covers
 *  existed — see resolveEventCover's fallback in pledge-page.ts), snapshot
 *  that legacy cover onto every OTHER existing event first. Without this,
 *  the moment eventCovers stops being empty, resolveEventCover's fallback
 *  stops applying — any other event that was silently relying on it would
 *  lose its cover (and its guest-shared link's design) with no warning. */
async function backfillLegacyPledgeCover(
  supabase: ReturnType<typeof createDashboardClient>,
  stored: PledgePageConfig,
  excludeEventId: string | null,
): Promise<NonNullable<PledgePageConfig['eventCovers']>> {
  const hasAnyEventCover = Boolean(stored.eventCovers && Object.keys(stored.eventCovers).length > 0)
  if (hasAnyEventCover || !stored.coverImageUrl) return stored.eventCovers ?? {}
  const events = await getEvents()
  const backfill: NonNullable<PledgePageConfig['eventCovers']> = {}
  for (const e of events) {
    if (e.id === excludeEventId) continue
    backfill[e.id] = { coverImageUrl: stored.coverImageUrl, coverIsFullTemplate: Boolean(stored.coverIsFullTemplate) }
  }
  return backfill
}

/** Set (or clear) the pledge page's cover image for one event, without
 *  touching the rest of the couple's customizations or any other event's
 *  cover — used by the "Share & Preview" pledge card picker (purchased
 *  design or an uploaded photo). */
export async function setPledgeCoverImage(
  eventId: string | null,
  coverImageUrl: string | null,
  coverIsFullTemplate: boolean,
): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('pledge_page')
    .eq('user_id', user.id)
    .maybeSingle<{ pledge_page: PledgePageConfig | null }>()
  const stored = profile?.pledge_page ?? {}
  const backfilledCovers = await backfillLegacyPledgeCover(supabase, stored, eventId)
  const nextConfig: PledgePageConfig = {
    ...stored,
    eventCovers: {
      ...backfilledCovers,
      [eventId ?? EVENTLESS_COVER_KEY]: { coverImageUrl, coverIsFullTemplate },
    },
  }

  const { data, error } = await supabase
    .from('couple_profiles')
    .update({ pledge_page: nextConfig, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    const { error: insErr } = await supabase
      .from('couple_profiles')
      .insert({ user_id: user.id, partner1_name: 'The Couple', pledge_page: nextConfig })
    if (insErr) throw new Error(insErr.message)
  }
  revalidatePath('/my/dashboard/pledges')
}

/** Apply a card design pulled from the invitation catalog as the pledge page
 *  cover. Free for Elegant/Signature (re-derives the event's paid-order tier
 *  server-side rather than trusting a client-supplied tier); everyone else
 *  must have individually bought this exact design (see
 *  templateCardItemId/getPurchasedTemplateIds) — also re-checked
 *  server-side, not trusted from the client's "unlocked" state. */
export async function applyPledgeCardTemplate(eventId: string, cardImageUrl: string, templateId: string): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('whatsapp_phone, pledge_page')
    .eq('user_id', user.id)
    .maybeSingle<{ whatsapp_phone: string | null; pledge_page: PledgePageConfig | null }>()

  const orders = await fetchPaidOrdersForCouple(supabase, user.id, user.email, profile?.whatsapp_phone ?? null)
  const tierId = resolveEventPackageTierId(orders, eventId)
  const hasFreeAccess = Boolean(tierId && PLEDGE_TEMPLATE_FREE_TIER_IDS.includes(tierId))
  // Individual template purchases are event-scoped: buying a design for one
  // event must not unlock it for another event under the same account.
  const purchasedThisDesign = orders.some((o) =>
    o.event_id === eventId &&
    (o.items ?? []).some((it) => {
      const parsed = it.id ? parseTemplateCardItemId(it.id) : null
      return parsed?.type === 'pledge_card' && parsed.templateId === templateId
    }),
  )
  if (!hasFreeAccess && !purchasedThisDesign) {
    throw new Error('Pledge card templates are included with Elegant and Signature packages — unlock this design to use it.')
  }

  const stored = profile?.pledge_page ?? {}
  const backfilledCovers = await backfillLegacyPledgeCover(supabase, stored, eventId)
  const nextConfig: PledgePageConfig = {
    ...stored,
    eventCovers: {
      ...backfilledCovers,
      [eventId]: { coverImageUrl: cardImageUrl, coverIsFullTemplate: true },
    },
  }
  const { data, error } = await supabase
    .from('couple_profiles')
    .update({ pledge_page: nextConfig, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    const { error: insErr } = await supabase
      .from('couple_profiles')
      .insert({ user_id: user.id, partner1_name: 'The Couple', pledge_page: nextConfig })
    if (insErr) throw new Error(insErr.message)
  }
  revalidatePath('/my/dashboard/pledges')
}

/** Set (or clear) the Thank You card image for one event, without touching
 *  any other event's card — used by the card-template picker. Mirrors
 *  setPledgeCoverImage. */
export async function setThankYouCoverImage(
  eventId: string | null,
  coverImageUrl: string | null,
  coverIsFullTemplate: boolean,
): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('thank_you_config')
    .eq('user_id', user.id)
    .maybeSingle<{ thank_you_config: ThankYouCardConfig | null }>()
  const stored = profile?.thank_you_config ?? {}
  const nextConfig: ThankYouCardConfig = {
    ...stored,
    eventCovers: {
      ...stored.eventCovers,
      [eventId ?? EVENTLESS_COVER_KEY]: { coverImageUrl, coverIsFullTemplate },
    },
  }

  const { data, error } = await supabase
    .from('couple_profiles')
    .update({ thank_you_config: nextConfig, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    const { error: insErr } = await supabase
      .from('couple_profiles')
      .insert({ user_id: user.id, partner1_name: 'The Couple', thank_you_config: nextConfig })
    if (insErr) throw new Error(insErr.message)
  }
  revalidatePath('/my/dashboard/thank-you')
}

/** Apply a card design pulled from the invitation catalog as the Thank You
 *  message's header image. Free for Elegant/Signature (re-derives the
 *  event's paid-order tier server-side rather than trusting a
 *  client-supplied tier); everyone else must have individually bought this
 *  exact design (see templateCardItemId/getPurchasedTemplateIds) — also
 *  re-checked server-side, mirroring applyPledgeCardTemplate. */
export async function applyThankYouCardTemplate(
  eventId: string,
  cardImageUrl: string,
  templateId: string,
  templateName?: string,
): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()

  const { data: profileForOrders } = await supabase
    .from('couple_profiles')
    .select('whatsapp_phone')
    .eq('user_id', user.id)
    .maybeSingle<{ whatsapp_phone: string | null }>()
  const orders = await fetchPaidOrdersForCouple(supabase, user.id, user.email, profileForOrders?.whatsapp_phone ?? null)
  const tierId = resolveEventPackageTierId(orders, eventId)
  const hasFreeAccess = Boolean(tierId && THANK_YOU_FREE_TIER_IDS.includes(tierId))
  // Individual template purchases are event-scoped: buying a design for one
  // event must not unlock it for another event under the same account.
  const purchasedThisDesign = orders.some((o) =>
    o.event_id === eventId &&
    (o.items ?? []).some((it) => {
      const parsed = it.id ? parseTemplateCardItemId(it.id) : null
      return parsed?.type === 'thank_you_card' && parsed.templateId === templateId
    }),
  )
  if (!hasFreeAccess && !purchasedThisDesign) {
    throw new Error('Thank-you card designs are included with Elegant and Signature packages — unlock this design to use it.')
  }

  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('thank_you_config')
    .eq('user_id', user.id)
    .maybeSingle<{ thank_you_config: ThankYouCardConfig | null }>()
  const stored = profile?.thank_you_config ?? {}
  const nextConfig: ThankYouCardConfig = {
    ...stored,
    eventCovers: {
      ...stored.eventCovers,
      [eventId]: {
        coverImageUrl: cardImageUrl,
        coverIsFullTemplate: true,
        templateId,
        templateName: templateName ?? null,
      },
    },
  }
  const { data, error } = await supabase
    .from('couple_profiles')
    .update({ thank_you_config: nextConfig, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    const { error: insErr } = await supabase
      .from('couple_profiles')
      .insert({ user_id: user.id, partner1_name: 'The Couple', thank_you_config: nextConfig })
    if (insErr) throw new Error(insErr.message)
  }
  revalidatePath('/my/dashboard/thank-you')
}

/** Upload a cover image OR short video for the pledge page; returns its public URL. */
export async function uploadPledgeCover(formData: FormData): Promise<string> {
  const user = await requireDashboardUser()
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) throw new Error('No file selected')
  const isVideo = file.type.startsWith('video/')
  if (!file.type.startsWith('image/') && !isVideo) throw new Error('Please choose an image or video file')
  const maxSize = isVideo ? 25 * 1024 * 1024 : 5 * 1024 * 1024
  if (file.size > maxSize) throw new Error(isVideo ? 'Video must be 25MB or smaller' : 'Image must be 5MB or smaller')

  const supabase = createDashboardClient()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${user.id}/cover-${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from('pledge-covers')
    .upload(path, file, { contentType: file.type, upsert: true })
  if (error) throw new Error(error.message)

  const { data } = supabase.storage.from('pledge-covers').getPublicUrl(path)
  return data.publicUrl
}

/** Snapshot the legacy top-level Contact Collector fields onto every OTHER
 *  existing event the first time eventContent is used, mirroring
 *  backfillLegacyPledgeCover — otherwise events that were implicitly
 *  sharing the couple's one legacy config would silently go blank the
 *  moment a different event gets its own customization. */
async function backfillLegacyCollectorContent(
  stored: PledgePageConfig,
  excludeEventId: string | null,
): Promise<NonNullable<PledgePageConfig['eventContent']>> {
  const hasAnyEventContent = Boolean(stored.eventContent && Object.keys(stored.eventContent).length > 0)
  const hasLegacyContent = Boolean(
    stored.headingLine2?.trim() ||
      stored.intro?.trim() ||
      stored.buttonLabel?.trim() ||
      stored.privacyNote?.trim() ||
      stored.coverImageUrl ||
      (stored.questions && stored.questions.length > 0),
  )
  if (hasAnyEventContent || !hasLegacyContent) return stored.eventContent ?? {}
  const events = await getEvents()
  const legacy: CollectorEventContent = {
    headingLine2: stored.headingLine2,
    intro: stored.intro,
    buttonLabel: stored.buttonLabel,
    privacyNote: stored.privacyNote,
    coverImageUrl: stored.coverImageUrl,
    coverIsFullTemplate: stored.coverIsFullTemplate,
    questions: stored.questions,
  }
  const backfill: NonNullable<PledgePageConfig['eventContent']> = {}
  for (const e of events) {
    if (e.id === excludeEventId) continue
    backfill[e.id] = legacy
  }
  return backfill
}

/** Save one event's Contact Collector content — cover, wording, and
 *  questions — without touching any other event's, so each event keeps its
 *  own independent collector page instead of sharing one generic page.
 *  Mirrors setPledgeCoverImage's targeted-write pattern. */
export async function updateCollectorEventContent(
  eventId: string | null,
  content: CollectorEventContent,
): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('collector_page')
    .eq('user_id', user.id)
    .maybeSingle<{ collector_page: PledgePageConfig | null }>()
  const stored = profile?.collector_page ?? {}
  const backfilled = await backfillLegacyCollectorContent(stored, eventId)
  const nextConfig: PledgePageConfig = {
    ...stored,
    eventContent: {
      ...backfilled,
      [eventId ?? EVENTLESS_COVER_KEY]: content,
    },
  }

  const { data, error } = await supabase
    .from('couple_profiles')
    .update({ collector_page: nextConfig, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    const { error: insErr } = await supabase
      .from('couple_profiles')
      .insert({ user_id: user.id, partner1_name: 'The Couple', collector_page: nextConfig })
    if (insErr) throw new Error(insErr.message)
  }
  revalidatePath('/my/dashboard/guests')
}

// ---------------------------------------------------------------- Public RSVP submit (token, no auth)

export interface PublicRsvpResponse {
  invitationId: string
  rsvp_status: RsvpStatus
  party_size: number
  meal_choice?: string | null
  dietary_notes?: string | null
  guest_message?: string | null
}

/** A guest's answer to one custom RSVP question, tied to one invitation. */
export interface PublicRsvpAnswerInput {
  invitationId: string
  questionId: string
  answer_text?: string | null
  option_id?: string | null
}

/**
 * Upsert a batch of question answers for one guest. Only answers whose
 * invitation belongs to `guestId` and whose question belongs to `ownerUserId`
 * are written; empty answers are skipped (short answers are skippable).
 */
async function persistRsvpAnswers(
  supabase: ReturnType<typeof createDashboardClient>,
  ownerUserId: string,
  ownedInvitationIds: Set<string>,
  answers: PublicRsvpAnswerInput[],
): Promise<void> {
  if (!answers.length) return

  const questionIds = [...new Set(answers.map((a) => a.questionId))]
  const { data: questions } = await supabase
    .from('rsvp_questions')
    .select('id')
    .eq('user_id', ownerUserId)
    .in('id', questionIds)
  const ownedQuestionIds = new Set((questions ?? []).map((q) => q.id as string))

  const now = new Date().toISOString()
  const rows = answers
    .filter((a) => ownedInvitationIds.has(a.invitationId) && ownedQuestionIds.has(a.questionId))
    .map((a) => ({
      user_id: ownerUserId,
      guest_invitation_id: a.invitationId,
      question_id: a.questionId,
      answer_text: a.answer_text?.trim() || null,
      option_id: a.option_id || null,
      updated_at: now,
    }))
    .filter((r) => r.answer_text !== null || r.option_id !== null)

  if (!rows.length) return
  const { error } = await supabase
    .from('rsvp_answers')
    .upsert(rows, { onConflict: 'guest_invitation_id,question_id' })
  if (error) console.error('[rsvp-answers] upsert failed', error)
}

export async function submitPublicRsvp(
  token: string,
  responses: PublicRsvpResponse[],
  answers: PublicRsvpAnswerInput[] = [],
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createDashboardClient()

  // Resolve the guest by token; this is the bearer secret gating access.
  const { data: guest, error: guestErr } = await supabase
    .from('guest_contacts')
    .select('id, max_party_size, user_id, full_name')
    .eq('public_token', token)
    .maybeSingle<{ id: string; max_party_size: number; user_id: string; full_name: string }>()
  if (guestErr) {
    console.error('[public-rsvp] guest lookup failed', guestErr)
    return { ok: false, error: 'Something went wrong — please try again in a moment.' }
  }
  if (!guest) return { ok: false, error: 'Invitation not found.' }

  // Only allow updates to invitations that belong to this guest.
  const { data: owned, error: ownedErr } = await supabase
    .from('guest_invitations')
    .select('id')
    .eq('guest_contact_id', guest.id)
  if (ownedErr) {
    console.error('[public-rsvp] invitation lookup failed', ownedErr)
    return { ok: false, error: 'Something went wrong — please try again in a moment.' }
  }
  const ownedIds = new Set((owned ?? []).map((r) => r.id as string))

  const now = new Date().toISOString()
  let applied = 0
  // Representative response for the notification: prefer "attending" if the guest
  // is coming to any event, otherwise the last status they submitted.
  let summaryStatus: RsvpStatus | null = null
  let attendingParty = 0
  for (const r of responses) {
    if (!ownedIds.has(r.invitationId)) continue
    const partySize = Math.max(1, Math.min(r.party_size || 1, guest.max_party_size, MAX_TICKET_PARTY))
    const { error } = await supabase
      .from('guest_invitations')
      .update({
        rsvp_status: r.rsvp_status,
        party_size: r.rsvp_status === 'attending' ? partySize : 1,
        meal_choice: r.meal_choice || null,
        dietary_notes: r.dietary_notes || null,
        guest_message: r.guest_message || null,
        responded_at: now,
      })
      .eq('id', r.invitationId)
      .eq('guest_contact_id', guest.id)
    if (error) return { ok: false, error: error.message }
    applied += 1
    if (r.rsvp_status === 'attending') {
      attendingParty = Math.max(attendingParty, partySize)
    }
    if (summaryStatus !== 'attending') summaryStatus = r.rsvp_status
  }

  // Persist answers to any custom RSVP questions.
  await persistRsvpAnswers(supabase, guest.user_id, ownedIds, answers)

  if (applied > 0 && summaryStatus) {
    const label =
      summaryStatus === 'attending'
        ? `Attending${attendingParty > 1 ? ` · party of ${attendingParty}` : ''}`
        : summaryStatus === 'declined'
          ? 'Declined'
          : summaryStatus === 'maybe'
            ? 'Maybe'
            : 'Responded'
    await createNotification({
      userId: guest.user_id,
      type: 'rsvp_received',
      title: `${guest.full_name} responded to your invitation`,
      body: label,
      actorName: guest.full_name,
      href: '/my/dashboard/rsvps',
    })
  }

  revalidatePath(`/rsvp/${token}`)
  return { ok: true }
}

// ---------------------------------------------------------------- Public invitation hub

/**
 * Turn on the couple's public, forwardable invite link, generating a readable
 * slug from their names on first use (collision-suffixed). Idempotent: if a
 * slug already exists it's reused and sharing is simply (re)enabled. Returns
 * the slug so the dashboard can build the share URL.
 */
export async function enablePublicSharing(): Promise<{ slug: string }> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()

  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('partner1_name, partner2_name, public_slug')
    .eq('user_id', user.id)
    .maybeSingle<{ partner1_name: string | null; partner2_name: string | null; public_slug: string | null }>()

  let slug = profile?.public_slug ?? null
  if (!slug) {
    slug = await reserveUniqueSlug(
      supabase,
      coupleSlugBase(profile?.partner1_name ?? null, profile?.partner2_name ?? null),
    )
  }

  const patch = { public_slug: slug, public_sharing_enabled: true, updated_at: new Date().toISOString() }
  const { data: updated, error } = await supabase
    .from('couple_profiles')
    .update(patch)
    .eq('user_id', user.id)
    .select('id')
  if (error) throw new Error(error.message)
  if (!updated || updated.length === 0) {
    const { error: insErr } = await supabase
      .from('couple_profiles')
      .insert({ user_id: user.id, partner1_name: 'The Couple', ...patch })
    if (insErr) throw new Error(insErr.message)
  }

  revalidatePath('/my/dashboard')
  return { slug }
}

/** Find an unused public_slug, appending -2, -3… on collision. */
async function reserveUniqueSlug(
  supabase: ReturnType<typeof createDashboardClient>,
  base: string,
): Promise<string> {
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`
    const { data, error } = await supabase
      .from('couple_profiles')
      .select('id')
      .eq('public_slug', candidate)
      .maybeSingle<{ id: string }>()
    if (error) throw new Error(error.message)
    if (!data) return candidate
  }
  // Extremely unlikely; fall back to a random suffix.
  return `${base}-${Math.floor(Date.now() % 100000)}`
}

/** Toggle the public link on/off (host-revocable kill switch). */
export async function setPublicSharing(enabled: boolean): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { error } = await supabase
    .from('couple_profiles')
    .update({ public_sharing_enabled: enabled, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidatePath('/my/dashboard')
}

/** Upload the cover image used by the public hub + OG card; persists the URL. */
export async function uploadInviteCover(formData: FormData): Promise<string> {
  const user = await requireDashboardUser()
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) throw new Error('No image selected')
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file')
  if (file.size > 5 * 1024 * 1024) throw new Error('Image must be 5MB or smaller')

  const supabase = createDashboardClient()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${user.id}/invite-cover-${Date.now()}.${ext}`
  // Reuse the existing public 'pledge-covers' bucket (couple-owned cover images).
  const { error } = await supabase.storage
    .from('pledge-covers')
    .upload(path, file, { contentType: file.type, upsert: true })
  if (error) throw new Error(error.message)

  const { data } = supabase.storage.from('pledge-covers').getPublicUrl(path)
  const url = data.publicUrl

  const { data: updated, error: upErr } = await supabase
    .from('couple_profiles')
    .update({ cover_image_url: url, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .select('id')
  if (upErr) throw new Error(upErr.message)
  if (!updated || updated.length === 0) {
    await supabase
      .from('couple_profiles')
      .insert({ user_id: user.id, partner1_name: 'The Couple', cover_image_url: url })
  }
  revalidatePath('/my/dashboard')
  return url
}

// ----------------------------------------------- Public self-RSVP (no auth, anti-hijack)

export interface PublicInviteRsvpInput {
  fullName: string
  phone: string
  email?: string | null
  status: RsvpStatus
  partySize: number
  message?: string | null
  /** Answers to the couple's general RSVP questions, keyed by question id. */
  answers?: { questionId: string; answer_text?: string | null; option_id?: string | null }[]
}

/**
 * RSVP submitted from one event's forwardable /rsvp/event/<slug> link by a
 * brand-new guest. Tied to exactly the one wedding_events row the slug
 * resolves to — unlike the old couple-wide /i/<slug>, this never fans a
 * guest's response out to every event the couple runs.
 *
 * Anti-hijack: this ALWAYS lands in the review bucket (source='public',
 * review_status='unconfirmed') and is keyed by phone, so it can never overwrite
 * or impersonate an existing named (host-added) guest. A repeat self-RSVP from
 * the same phone updates the prior self-registration rather than piling up
 * duplicates. The host approves/merges these from the dashboard.
 */
export async function submitPublicInviteRsvp(
  slug: string,
  input: PublicInviteRsvpInput,
): Promise<{ ok: boolean; error?: string }> {
  const fullName = input.fullName?.trim()
  const phone = normalizePhone(input.phone)
  if (!fullName) return { ok: false, error: 'Please enter your name.' }
  if (!phone) return { ok: false, error: 'Please enter a valid phone number.' }

  const supabase = createDashboardClient()

  // Resolve the event by its own slug; sharing must be enabled for it.
  const { data: event, error: eErr } = await supabase
    .from('wedding_events')
    .select('id, user_id, invite_sharing_enabled, allow_rsvp, starts_at')
    .eq('invite_slug', slug)
    .maybeSingle<{
      id: string
      user_id: string
      invite_sharing_enabled: boolean
      allow_rsvp: boolean
      starts_at: string | null
    }>()
  if (eErr) {
    console.error('[public-invite-rsvp] event lookup failed', eErr)
    return { ok: false, error: 'Something went wrong — please try again in a moment.' }
  }
  if (!event || !event.invite_sharing_enabled) return { ok: false, error: 'This invitation link is no longer active.' }
  if (!event.allow_rsvp) return { ok: false, error: 'RSVPs are not open for this invitation.' }
  if (event.starts_at && new Date(event.starts_at).getTime() < Date.now()) {
    return { ok: false, error: 'RSVPs for this celebration have closed.' }
  }

  const partySize = Math.max(1, Math.min(Number(input.partySize) || 1, MAX_TICKET_PARTY))

  // Reuse this phone's prior self-registration; never touch a host-added guest.
  const { data: existing } = await supabase
    .from('guest_contacts')
    .select('id')
    .eq('user_id', event.user_id)
    .eq('source', 'public')
    .eq('phone', phone)
    .maybeSingle<{ id: string }>()

  let guestId = existing?.id ?? null
  if (guestId) {
    await supabase
      .from('guest_contacts')
      .update({
        full_name: fullName,
        email: input.email?.trim() || null,
        whatsapp_phone: phone,
        max_party_size: Math.max(partySize, 1),
        review_status: 'unconfirmed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', guestId)
  } else {
    const { data: created, error: cErr } = await supabase
      .from('guest_contacts')
      .insert({
        user_id: event.user_id,
        full_name: fullName,
        phone,
        whatsapp_phone: phone,
        email: input.email?.trim() || null,
        max_party_size: Math.max(partySize, 1),
        source: 'public',
        review_status: 'unconfirmed',
        group_tag: 'Self-registered',
      })
      .select('id')
      .single<{ id: string }>()
    if (cErr || !created) {
      console.error('[public-invite-rsvp] guest insert failed', cErr)
      return { ok: false, error: 'Something went wrong — please try again in a moment.' }
    }
    guestId = created.id
  }

  // Record their response against this one event only.
  const now = new Date().toISOString()
  const { data: upserted, error: invErr } = await supabase
    .from('guest_invitations')
    .upsert(
      [
        {
          user_id: event.user_id,
          guest_contact_id: guestId as string,
          event_id: event.id,
          rsvp_status: input.status,
          party_size: input.status === 'attending' ? partySize : 1,
          guest_message: input.message?.trim() || null,
          responded_at: now,
        },
      ],
      { onConflict: 'guest_contact_id,event_id' },
    )
    .select('id')
  if (invErr) {
    console.error('[public-invite-rsvp] invitation upsert failed', invErr)
    return { ok: false, error: 'Something went wrong — please try again in a moment.' }
  }

  // Persist answers to this event's questions (general + its own follow-ups).
  if (input.answers?.length) {
    const invitationIds = (upserted ?? []).map((r) => r.id as string)
    const ownedIds = new Set(invitationIds)
    const flattened = invitationIds.flatMap((invitationId) =>
      (input.answers ?? []).map((a) => ({
        invitationId,
        questionId: a.questionId,
        answer_text: a.answer_text,
        option_id: a.option_id,
      })),
    )
    await persistRsvpAnswers(supabase, event.user_id, ownedIds, flattened)
  }

  const statusLabel =
    input.status === 'attending'
      ? `Attending${partySize > 1 ? ` · party of ${partySize}` : ''}`
      : input.status === 'declined'
        ? 'Declined'
        : 'Maybe'
  await createNotification({
    userId: event.user_id,
    type: 'rsvp_received',
    title: `${fullName} RSVP'd via your shared link`,
    body: `${statusLabel} · needs review`,
    actorName: fullName,
    href: '/my/dashboard/guests?review=1',
  })

  revalidatePath(`/rsvp/event/${slug}`)
  revalidatePath(`/save-the-date/${slug}`)
  revalidateDashboard()
  return { ok: true }
}

/** Turn on a specific event's public invite/RSVP link, generating a slug from
 *  its own name on first use. Mirrors enableGuestbookSharing/
 *  enableGiftRegistrySharing — a multi-event couple gets one link per event. */
export async function enableInviteSharing(eventId: string): Promise<{ slug: string }> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()

  const { data: event } = await supabase
    .from('wedding_events')
    .select('name, invite_slug')
    .eq('id', eventId)
    .eq('user_id', user.id)
    .maybeSingle<{ name: string; invite_slug: string | null }>()
  if (!event) throw new Error('Event not found')

  const previousSlug = event.invite_slug
  let slug = event.invite_slug
  const expectedSlugBase = eventSlugBase(event.name)
  if (!slug || slugBaseOf(slug) !== expectedSlugBase) {
    slug = await reserveUniqueInviteSlug(supabase, expectedSlugBase)
  }

  const { error } = await supabase
    .from('wedding_events')
    .update({ invite_slug: slug, invite_sharing_enabled: true, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)

  for (const changedSlug of new Set([previousSlug, slug].filter((s): s is string => Boolean(s)))) {
    revalidatePath(`/rsvp/event/${changedSlug}`)
    revalidatePath(`/save-the-date/${changedSlug}`)
  }
  revalidateDashboard()
  return { slug }
}

/** Select the Save the Date template for one event. This is intentionally
 * separate from paid invitation order imagery: a save-the-date selection
 * controls the Save the dates tab's selected preview/share block only. */
export async function applySaveDateTemplate(
  eventId: string,
  template: { id: string; name: string; imageUrl: string },
): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()

  const { data: event } = await supabase
    .from('wedding_events')
    .select('invite_slug')
    .eq('id', eventId)
    .eq('user_id', user.id)
    .maybeSingle<{ invite_slug: string | null }>()
  if (!event) throw new Error('Event not found')

  // Check the read error: on a transient failure `profile` is null, and merging
  // onto an empty object would overwrite the couple's whole pledge_page blob
  // (pledge cover config plus every other event's save-date template).
  const { data: profile, error: profileErr } = await supabase
    .from('couple_profiles')
    .select('pledge_page')
    .eq('user_id', user.id)
    .maybeSingle<{ pledge_page: PledgePageConfig | null }>()
  if (profileErr) throw new Error(profileErr.message)
  const stored = profile?.pledge_page ?? {}
  const nextConfig: PledgePageConfig = {
    ...stored,
    saveDateTemplates: {
      ...stored.saveDateTemplates,
      [eventId]: template,
    },
  }

  const { data, error } = await supabase
    .from('couple_profiles')
    .update({ pledge_page: nextConfig, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    const { error: insErr } = await supabase
      .from('couple_profiles')
      .insert({ user_id: user.id, partner1_name: 'The Couple', pledge_page: nextConfig })
    if (insErr) throw new Error(insErr.message)
  }
  if (event?.invite_slug) revalidatePath(`/save-the-date/${event.invite_slug}`)
  revalidatePath('/my/dashboard/invitations')
  revalidateDashboard()
}

/** Clear the selected Save the Date template for one event. Mirrors the
 * "click Applied to unselect" behavior used by pledge/thank-you card pickers. */
export async function removeSaveDateTemplate(eventId: string): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()

  const { data: event } = await supabase
    .from('wedding_events')
    .select('invite_slug')
    .eq('id', eventId)
    .eq('user_id', user.id)
    .maybeSingle<{ invite_slug: string | null }>()
  if (!event) throw new Error('Event not found')

  // See applySaveDateTemplate: an unchecked read error here would clobber the
  // couple's entire pledge_page blob instead of removing one template.
  const { data: profile, error: profileErr } = await supabase
    .from('couple_profiles')
    .select('pledge_page')
    .eq('user_id', user.id)
    .maybeSingle<{ pledge_page: PledgePageConfig | null }>()
  if (profileErr) throw new Error(profileErr.message)
  const stored = profile?.pledge_page ?? {}
  const nextSelections = { ...(stored.saveDateTemplates ?? {}) }
  delete nextSelections[eventId]
  const nextConfig: PledgePageConfig = {
    ...stored,
    saveDateTemplates: nextSelections,
  }

  const { error } = await supabase
    .from('couple_profiles')
    .update({ pledge_page: nextConfig, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)

  if (event.invite_slug) revalidatePath(`/save-the-date/${event.invite_slug}`)
  revalidatePath('/my/dashboard/invitations')
  revalidateDashboard()
}

/** Turns a specific event's public invite/RSVP link off (couple can re-enable later, same slug). */
export async function disableInviteSharing(eventId: string): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { error } = await supabase
    .from('wedding_events')
    .update({ invite_sharing_enabled: false, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  const { data: event } = await supabase
    .from('wedding_events')
    .select('invite_slug')
    .eq('id', eventId)
    .eq('user_id', user.id)
    .maybeSingle<{ invite_slug: string | null }>()
  if (event?.invite_slug) {
    revalidatePath(`/rsvp/event/${event.invite_slug}`)
    revalidatePath(`/save-the-date/${event.invite_slug}`)
  }
  revalidateDashboard()
}

/** Find an unused invite_slug, appending -2, -3… on collision. */
async function reserveUniqueInviteSlug(
  supabase: ReturnType<typeof createDashboardClient>,
  base: string,
): Promise<string> {
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`
    const { data, error } = await supabase
      .from('wedding_events')
      .select('id')
      .eq('invite_slug', candidate)
      .maybeSingle<{ id: string }>()
    if (error) throw new Error(error.message)
    if (!data) return candidate
  }
  return `${base}-${Math.floor(Date.now() % 100000)}`
}

/** Approve a self-registered guest into the confirmed roster. */
export async function approveReviewGuest(guestId: string): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { error } = await supabase
    .from('guest_contacts')
    .update({ review_status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('id', guestId)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  // Approved guests join the unified roster like any other guest.
  await ensureInvitationsForAllEvents(user.id, guestId)
  revalidateDashboard()
}

/** Dismiss (delete) a self-registered guest the host doesn't recognise. */
export async function dismissReviewGuest(guestId: string): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { error } = await supabase
    .from('guest_contacts')
    .delete()
    .eq('id', guestId)
    .eq('user_id', user.id)
    .eq('review_status', 'unconfirmed')
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

// ---------------------------------------------------------------------- Guestbook

const GUESTBOOK_PHOTO_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const GUESTBOOK_PHOTO_MAX_BYTES = 8 * 1024 * 1024
const GUESTBOOK_VIDEO_MAX_BYTES = 50 * 1024 * 1024
const GUESTBOOK_RELATIONS = new Set(['Family', 'Friend', 'Colleague'])
// MediaRecorder's mimeType often carries codec params (e.g. "audio/webm;codecs=opus",
// "video/webm;codecs=vp8,opus"), so these are prefixes, matched with startsWith —
// not an exact-match set.
const GUESTBOOK_AUDIO_MIME_PREFIXES = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/aac']
const GUESTBOOK_AUDIO_MAX_BYTES = 10 * 1024 * 1024
const GUESTBOOK_VIDEO_MIME_PREFIXES = ['video/mp4', 'video/quicktime', 'video/webm']

function extForAudioMime(mime: string): string {
  if (mime.startsWith('audio/mp4')) return 'm4a'
  if (mime.startsWith('audio/ogg')) return 'ogg'
  if (mime.startsWith('audio/mpeg')) return 'mp3'
  if (mime.startsWith('audio/aac')) return 'aac'
  return 'webm'
}

function extForVideoMime(mime: string): string {
  if (mime.startsWith('video/quicktime')) return 'mov'
  if (mime.startsWith('video/webm')) return 'webm'
  return 'mp4'
}

/**
 * Public, no-auth submission from a guest visiting the standalone
 * /guestbook/<slug> page. Mirrors submitPublicInviteRsvp: resolves the
 * one wedding_events row the slug belongs to (guestbook_slug, not the
 * couple-wide invite slug), gates on that event's own sharing flag, and
 * writes via the service-role client since the guest has no session.
 * Entries land `pending` — the couple moderates them into view on their
 * dashboard, scoped to this same event.
 */
export async function submitGuestbookEntry(
  slug: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const guestName = String(formData.get('name') ?? '').trim().slice(0, 80)
  const message = String(formData.get('message') ?? '').trim().slice(0, 1000)
  const relationRaw = String(formData.get('relation') ?? '').trim()
  const relation = GUESTBOOK_RELATIONS.has(relationRaw) ? relationRaw : null
  const hasAudio = formData.get('audio') instanceof File && (formData.get('audio') as File).size > 0
  if (!guestName) return { ok: false, error: 'Please enter your name.' }
  // A voice note stands on its own — text is only required when there isn't one.
  if (!message && !hasAudio) return { ok: false, error: 'Please write a short message or record a voice note.' }

  const supabase = createDashboardClient()

  const { data: event, error: eErr } = await supabase
    .from('wedding_events')
    .select('id, user_id, name, guestbook_sharing_enabled')
    .eq('guestbook_slug', slug)
    .maybeSingle<{
      id: string
      user_id: string
      name: string
      guestbook_sharing_enabled: boolean
    }>()
  if (eErr) {
    console.error('[guestbook] event lookup failed', eErr)
    return { ok: false, error: 'Something went wrong — please try again in a moment.' }
  }
  if (!event || !event.guestbook_sharing_enabled) {
    return { ok: false, error: 'This invitation link is no longer active.' }
  }

  // A guest attaches at most one media item — a photo OR a video, picked from
  // the same "media" field — plus an optional voice note above.
  let photoUrl: string | null = null
  let videoUrl: string | null = null
  const media = formData.get('media')
  if (media instanceof File && media.size > 0) {
    if (media.type.startsWith('video/')) {
      if (!GUESTBOOK_VIDEO_MIME_PREFIXES.some((prefix) => media.type.startsWith(prefix))) {
        return { ok: false, error: 'Videos must be MP4, MOV or WebM.' }
      }
      if (media.size > GUESTBOOK_VIDEO_MAX_BYTES) {
        return { ok: false, error: 'Video must be 50MB or smaller.' }
      }
      const ext = extForVideoMime(media.type)
      const path = `${event.user_id}/${randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('guestbook-videos')
        .upload(path, media, { contentType: media.type })
      if (upErr) {
        console.error('[guestbook] video upload failed', upErr)
        return { ok: false, error: 'Something went wrong uploading your video — please try again.' }
      }
      videoUrl = supabase.storage.from('guestbook-videos').getPublicUrl(path).data.publicUrl
    } else {
      if (!GUESTBOOK_PHOTO_MIMES.has(media.type)) {
        return { ok: false, error: 'Photos must be JPEG, PNG or WebP.' }
      }
      if (media.size > GUESTBOOK_PHOTO_MAX_BYTES) {
        return { ok: false, error: 'Photo must be 8MB or smaller.' }
      }
      const ext = media.type === 'image/png' ? 'png' : media.type === 'image/webp' ? 'webp' : 'jpg'
      const path = `${event.user_id}/${randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('guestbook-photos')
        .upload(path, media, { contentType: media.type })
      if (upErr) {
        console.error('[guestbook] photo upload failed', upErr)
        return { ok: false, error: 'Something went wrong uploading your photo — please try again.' }
      }
      photoUrl = supabase.storage.from('guestbook-photos').getPublicUrl(path).data.publicUrl
    }
  }

  let audioUrl: string | null = null
  const audio = formData.get('audio')
  if (audio instanceof File && audio.size > 0) {
    if (!GUESTBOOK_AUDIO_MIME_PREFIXES.some((prefix) => audio.type.startsWith(prefix))) {
      return { ok: false, error: 'Voice notes must be a recorded audio clip.' }
    }
    if (audio.size > GUESTBOOK_AUDIO_MAX_BYTES) {
      return { ok: false, error: 'Voice note must be 10MB or smaller.' }
    }
    const ext = extForAudioMime(audio.type)
    const path = `${event.user_id}/${randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('guestbook-audio')
      .upload(path, audio, { contentType: audio.type || 'audio/webm' })
    if (upErr) {
      console.error('[guestbook] audio upload failed', upErr)
      return { ok: false, error: 'Something went wrong uploading your voice note — please try again.' }
    }
    audioUrl = supabase.storage.from('guestbook-audio').getPublicUrl(path).data.publicUrl
  }

  const { error: insErr } = await supabase.from('guestbook_entries').insert({
    user_id: event.user_id,
    event_id: event.id,
    guest_name: guestName,
    message,
    photo_url: photoUrl,
    video_url: videoUrl,
    audio_url: audioUrl,
    relation,
    review_status: 'pending',
  })
  if (insErr) {
    console.error('[guestbook] insert failed', insErr)
    return { ok: false, error: 'Something went wrong — please try again in a moment.' }
  }

  await createNotification({
    userId: event.user_id,
    type: 'guestbook_received',
    title: `${guestName} left ${event.name} a guestbook message`,
    actorName: guestName,
    body: message.length > 120 ? `${message.slice(0, 117)}…` : message,
    href: '/my/dashboard/guestbook',
  })

  return { ok: true }
}

/** Approve a guestbook entry so it appears on the published site. */
export async function approveGuestbookEntry(id: string): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { error } = await supabase
    .from('guestbook_entries')
    .update({ review_status: 'approved', reviewed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

/** Hide a guestbook entry (kept for the record, no longer shown publicly). */
export async function hideGuestbookEntry(id: string): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { error } = await supabase
    .from('guestbook_entries')
    .update({ review_status: 'hidden', reviewed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

/** Permanently delete a guestbook entry. */
export async function deleteGuestbookEntry(id: string): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { error } = await supabase
    .from('guestbook_entries')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

// ---------------------------------------------------------------- Gift registry
//
// The hero (name/header, banner, cover photo, welcome message) and public
// share link live on the selected wedding_events row, not couple_profiles —
// each event a couple runs (send-off, wedding, reception, ...) gets its own
// registry name and its own /gift-registry/<slug> link. See
// 20260718000001_opuspass_gift_registry_event_scoped_hero.sql.

/** Turn on a specific event's public gift-registry link, generating a slug
 *  from its header override (if set) or its own name on first use. Mirrors
 *  enablePublicSharing()'s reserve-once-then-reuse behavior. */
export async function enableGiftRegistrySharing(eventId: string): Promise<{ slug: string }> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()

  const { data: event } = await supabase
    .from('wedding_events')
    .select('name, gift_registry_header, gift_registry_slug')
    .eq('id', eventId)
    .eq('user_id', user.id)
    .maybeSingle<{ name: string; gift_registry_header: string | null; gift_registry_slug: string | null }>()
  if (!event) throw new Error('Event not found')

  let slug = event.gift_registry_slug
  if (!slug) {
    slug = await reserveUniqueGiftRegistrySlug(supabase, eventHeroSlugBase(event.gift_registry_header, event.name))
  }

  const { error } = await supabase
    .from('wedding_events')
    .update({ gift_registry_slug: slug, gift_registry_sharing_enabled: true, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)

  revalidateDashboard()
  return { slug }
}

/** Find an unused gift_registry_slug, appending -2, -3… on collision. */
async function reserveUniqueGiftRegistrySlug(
  supabase: ReturnType<typeof createDashboardClient>,
  base: string,
): Promise<string> {
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`
    const { data, error } = await supabase
      .from('wedding_events')
      .select('id')
      .eq('gift_registry_slug', candidate)
      .maybeSingle<{ id: string }>()
    if (error) throw new Error(error.message)
    if (!data) return candidate
  }
  return `${base}-${Math.floor(Date.now() % 100000)}`
}

// ---------------------------------------------------------------- Guestbook
//
// Same per-event pattern as the gift registry above: guestbook_entries are
// already scoped by event_id, so the public link/sharing-toggle live on the
// selected wedding_events row too, not the account-wide couple_profiles
// slug shared with the invite hub. See
// 20260718000002_opuspass_guestbook_event_scoped_link.sql.

/** Turn on a specific event's public guestbook link, generating a slug from
 *  its own name on first use (guestbook has no header-override concept). */
export async function enableGuestbookSharing(eventId: string): Promise<{ slug: string }> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()

  const { data: event } = await supabase
    .from('wedding_events')
    .select('name, guestbook_slug')
    .eq('id', eventId)
    .eq('user_id', user.id)
    .maybeSingle<{ name: string; guestbook_slug: string | null }>()
  if (!event) throw new Error('Event not found')

  let slug = event.guestbook_slug
  if (!slug) {
    slug = await reserveUniqueGuestbookSlug(supabase, eventSlugBase(event.name))
  }

  const { error } = await supabase
    .from('wedding_events')
    .update({ guestbook_slug: slug, guestbook_sharing_enabled: true, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)

  revalidateDashboard()
  return { slug }
}

/** Find an unused guestbook_slug, appending -2, -3… on collision. */
async function reserveUniqueGuestbookSlug(
  supabase: ReturnType<typeof createDashboardClient>,
  base: string,
): Promise<string> {
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`
    const { data, error } = await supabase
      .from('wedding_events')
      .select('id')
      .eq('guestbook_slug', candidate)
      .maybeSingle<{ id: string }>()
    if (error) throw new Error(error.message)
    if (!data) return candidate
  }
  return `${base}-${Math.floor(Date.now() % 100000)}`
}

/** Updates a specific event's registry welcome message (null/blank clears it). */
export async function updateGiftRegistryWelcomeMessage(eventId: string, message: string | null): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { error } = await supabase
    .from('wedding_events')
    .update({ gift_registry_welcome_message: message?.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

/** Uploads a specific event's registry hero photo (separate from the couple's
 *  shared cover_image_url used by WhatsApp/pledge/invite-hub) and saves it. */
export async function uploadGiftRegistryCoverImage(eventId: string, formData: FormData): Promise<string> {
  const user = await requireDashboardUser()
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) throw new Error('No file selected')
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file')
  if (file.size > 5 * 1024 * 1024) throw new Error('Image must be 5MB or smaller')

  const supabase = createDashboardClient()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${user.id}/hero-${randomUUID()}.${ext}`
  const { error: uploadError } = await supabase.storage
    .from('gift-registry-images')
    .upload(path, file, { contentType: file.type, upsert: true })
  if (uploadError) throw new Error(uploadError.message)

  const { data } = supabase.storage.from('gift-registry-images').getPublicUrl(path)
  const { error: updateError } = await supabase
    .from('wedding_events')
    .update({ gift_registry_cover_image_url: data.publicUrl, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('user_id', user.id)
  if (updateError) throw new Error(updateError.message)

  revalidateDashboard()
  return data.publicUrl
}

/** Updates a specific event's displayed registry header (blank/null reverts to the event's own
 *  name). Also keeps that event's public share slug tracking whatever's actually shown as the
 *  hero title, since the header overrides the event name there too. */
export async function updateGiftRegistryHeader(eventId: string, header: string | null): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const trimmedHeader = header?.trim() || null

  const { data: existing } = await supabase
    .from('wedding_events')
    .select('name, gift_registry_slug')
    .eq('id', eventId)
    .eq('user_id', user.id)
    .maybeSingle<{ name: string; gift_registry_slug: string | null }>()
  if (!existing) throw new Error('Event not found')

  const expectedSlugBase = eventHeroSlugBase(trimmedHeader, existing.name)
  let slug = existing.gift_registry_slug
  if (!slug || slugBaseOf(slug) !== expectedSlugBase) {
    slug = await reserveUniqueGiftRegistrySlug(supabase, expectedSlugBase)
  }

  const { error } = await supabase
    .from('wedding_events')
    .update({ gift_registry_header: trimmedHeader, gift_registry_slug: slug, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

/** Uploads a specific event's wide registry banner photo (behind the header) and saves it. */
export async function uploadGiftRegistryBannerImage(eventId: string, formData: FormData): Promise<string> {
  const user = await requireDashboardUser()
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) throw new Error('No file selected')
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file')
  if (file.size > 5 * 1024 * 1024) throw new Error('Image must be 5MB or smaller')

  const supabase = createDashboardClient()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${user.id}/banner-${randomUUID()}.${ext}`
  const { error: uploadError } = await supabase.storage
    .from('gift-registry-images')
    .upload(path, file, { contentType: file.type, upsert: true })
  if (uploadError) throw new Error(uploadError.message)

  const { data } = supabase.storage.from('gift-registry-images').getPublicUrl(path)
  const { error: updateError } = await supabase
    .from('wedding_events')
    .update({ gift_registry_banner_image_url: data.publicUrl, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('user_id', user.id)
  if (updateError) throw new Error(updateError.message)

  revalidateDashboard()
  return data.publicUrl
}

/** Clears a specific event's registry banner photo. */
export async function removeGiftRegistryBannerImage(eventId: string): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { error } = await supabase
    .from('wedding_events')
    .update({ gift_registry_banner_image_url: null, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

/** Clears a specific event's registry circular photo. */
export async function removeGiftRegistryCoverImage(eventId: string): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { error } = await supabase
    .from('wedding_events')
    .update({ gift_registry_cover_image_url: null, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

export interface GiftRegistryInput {
  title: string
  description?: string | null
  image_urls?: string[]
  video_url?: string | null
  price_label?: string | null
  product_link?: string | null
  /** Physical shop/vendor where this gift can be bought — Tanzania-first alternative to product_link. */
  shop_name?: string | null
  shop_location?: string | null
  shop_contact?: string | null
  category?: string | null
  quantity_requested?: number
  most_wanted?: boolean
  group_gift?: boolean
  is_cash_fund?: boolean
  /** Which of the couple's wedding_events this gift belongs to — see event-scope.ts. */
  event_id?: string | null
}

export async function createGiftRegistryItem(input: GiftRegistryInput): Promise<string> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { count } = await supabase
    .from('gift_registry_items')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
  const { data, error } = await supabase
    .from('gift_registry_items')
    .insert({
      user_id: user.id,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      image_urls: input.image_urls ?? [],
      video_url: input.video_url || null,
      price_label: input.price_label?.trim() || null,
      product_link: input.product_link?.trim() || null,
      shop_name: input.shop_name?.trim() || null,
      shop_location: input.shop_location?.trim() || null,
      shop_contact: input.shop_contact?.trim() || null,
      category: input.category || null,
      quantity_requested: Math.max(1, Math.trunc(input.quantity_requested ?? 1)),
      most_wanted: input.most_wanted ?? false,
      group_gift: input.group_gift ?? false,
      is_cash_fund: input.is_cash_fund ?? false,
      event_id: input.event_id || null,
      sort_order: count ?? 0,
    })
    .select('id')
    .single<{ id: string }>()
  if (error || !data) throw new Error(error?.message ?? 'Failed to add gift')
  revalidateDashboard()
  return data.id
}

/**
 * Add a real vendor product to the couple's registry in one tap. Links the gift
 * to the product (product_id) with a numeric price_tzs, so guests can BUY it and
 * it dedupes reliably by product id (not the old fragile title match). Returns
 * the existing item id if this product is already on the registry.
 */
export async function addProductToRegistry(
  productId: string,
  eventId: string | null,
): Promise<{ id: string; alreadyAdded: boolean }> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()

  const { data: product } = await supabase
    .from('products')
    .select('id, name, description, images, price_tzs, vendor:vendors!inner(business_name, location, onboarding_status)')
    .eq('id', productId)
    .eq('status', 'approved')
    .eq('published', true)
    .eq('vendor.onboarding_status', 'active')
    .maybeSingle<{
      id: string
      name: string
      description: string | null
      images: string[] | null
      price_tzs: number
      vendor: { business_name: string | null; location: { city?: string; region?: string } | null } | null
    }>()
  if (!product) throw new Error('This product is no longer available')

  // Dedupe by product_id within the same event.
  const existingQuery = supabase
    .from('gift_registry_items')
    .select('id')
    .eq('user_id', user.id)
    .eq('product_id', productId)
  const { data: existing } = await (eventId
    ? existingQuery.eq('event_id', eventId)
    : existingQuery
  ).maybeSingle<{ id: string }>()
  if (existing) return { id: existing.id, alreadyAdded: true }

  const location = product.vendor?.location?.city || product.vendor?.location?.region || 'Tanzania'
  const { count } = await supabase
    .from('gift_registry_items')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
  const { data, error } = await supabase
    .from('gift_registry_items')
    .insert({
      user_id: user.id,
      title: product.name,
      description: product.description,
      image_urls: (product.images ?? []).slice(0, 3),
      price_label: `TZS ${product.price_tzs.toLocaleString('en-US')}`,
      price_tzs: product.price_tzs,
      product_id: product.id,
      shop_name: product.vendor?.business_name ?? null,
      shop_location: location,
      quantity_requested: 1,
      event_id: eventId,
      sort_order: count ?? 0,
    })
    .select('id')
    .single<{ id: string }>()
  if (error || !data) throw new Error(error?.message ?? 'Failed to add product')
  revalidateDashboard()
  return { id: data.id, alreadyAdded: false }
}

export async function updateGiftRegistryItem(id: string, input: GiftRegistryInput): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { error } = await supabase
    .from('gift_registry_items')
    .update({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      image_urls: input.image_urls ?? [],
      video_url: input.video_url || null,
      price_label: input.price_label?.trim() || null,
      product_link: input.product_link?.trim() || null,
      shop_name: input.shop_name?.trim() || null,
      shop_location: input.shop_location?.trim() || null,
      shop_contact: input.shop_contact?.trim() || null,
      category: input.category || null,
      quantity_requested: Math.max(1, Math.trunc(input.quantity_requested ?? 1)),
      most_wanted: input.most_wanted ?? false,
      group_gift: input.group_gift ?? false,
      is_cash_fund: input.is_cash_fund ?? false,
      event_id: input.event_id || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

export async function deleteGiftRegistryItem(id: string): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { error } = await supabase
    .from('gift_registry_items')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

/** Re-open a gift a guest claimed (e.g. they backed out) so it's available again. */
export async function unclaimGiftRegistryItem(id: string): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { error } = await supabase
    .from('gift_registry_items')
    .update({ claimed_by_name: null, claimed_at: null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

/** Host-side counterpart to a guest claim — "we already have this" (e.g. bought it themselves, received it off-registry). */
export async function markGiftRegistryItemReceived(id: string): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { error } = await supabase
    .from('gift_registry_items')
    .update({ claimed_by_name: 'You', claimed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

/** Identifies one row on the Claims table — see GiftRegistryClaimRow. */
export interface GiftRegistryClaimTarget {
  kind: 'claim' | 'item'
  claimId: string
  itemId: string
}

/** Host edit of a guest's claim details (name/phone/email) — e.g. fixing a typo'd phone number. */
export async function updateGiftRegistryClaim(
  target: GiftRegistryClaimTarget,
  input: { guestName: string; guestPhone: string | null; guestEmail: string | null },
): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const guestName = input.guestName.trim().slice(0, 80)
  if (!guestName) throw new Error('Guest name is required')
  const guestPhone = normalizePhone(input.guestPhone)
  const guestEmail = input.guestEmail?.trim() || null

  const { error } =
    target.kind === 'claim'
      ? await supabase
          .from('gift_registry_claims')
          .update({ guest_name: guestName, guest_phone: guestPhone, guest_email: guestEmail })
          .eq('id', target.claimId)
          .eq('user_id', user.id)
      : await supabase
          .from('gift_registry_items')
          .update({
            claimed_by_name: guestName,
            claimed_by_phone: guestPhone,
            claimed_by_email: guestEmail,
            updated_at: new Date().toISOString(),
          })
          .eq('id', target.itemId)
          .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

/** Host removes a guest's claim (e.g. they backed out, or it was claimed by mistake) — frees the unit back up. */
export async function deleteGiftRegistryClaim(target: GiftRegistryClaimTarget): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { error } =
    target.kind === 'claim'
      ? await supabase.from('gift_registry_claims').delete().eq('id', target.claimId).eq('user_id', user.id)
      : await supabase
          .from('gift_registry_items')
          .update({ claimed_by_name: null, claimed_by_phone: null, claimed_by_email: null, claimed_at: null, updated_at: new Date().toISOString() })
          .eq('id', target.itemId)
          .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

/** Upload one gift photo (call once per file for a multi-select picker); returns its public URL. */
export async function uploadGiftRegistryImage(formData: FormData): Promise<string> {
  const user = await requireDashboardUser()
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) throw new Error('No file selected')
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file')
  if (file.size > 5 * 1024 * 1024) throw new Error('Image must be 5MB or smaller')

  const supabase = createDashboardClient()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${user.id}/${randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from('gift-registry-images')
    .upload(path, file, { contentType: file.type, upsert: true })
  if (error) throw new Error(error.message)

  const { data } = supabase.storage.from('gift-registry-images').getPublicUrl(path)
  return data.publicUrl
}

/** Upload a short video clip of a gift; returns its public URL. */
export async function uploadGiftRegistryVideo(formData: FormData): Promise<string> {
  const user = await requireDashboardUser()
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) throw new Error('No file selected')
  if (!file.type.startsWith('video/')) throw new Error('Please choose a video file')
  if (file.size > 25 * 1024 * 1024) throw new Error('Video must be 25MB or smaller')

  const supabase = createDashboardClient()
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${user.id}/${randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from('gift-registry-videos')
    .upload(path, file, { contentType: file.type, upsert: true })
  if (error) throw new Error(error.message)

  const { data } = supabase.storage.from('gift-registry-videos').getPublicUrl(path)
  return data.publicUrl
}

/**
 * Public claim — no auth. The slug resolves the owning couple (same
 * public_slug / public_sharing_enabled gate as the guestbook), then the
 * write happens via the service-role client scoped to that resolved
 * user_id, exactly like submitGuestbookEntry / submitPublicPledge.
 */
export interface GiftClaimReceipt {
  gift: ReceiptGift
  guestEmailSent: boolean
  guestWhatsAppSent: boolean
}

export async function claimGiftRegistryItem(
  slug: string,
  itemId: string,
  guestName: string,
  guestPhoneRaw: string,
  guestEmailRaw: string | null,
  lang: ReceiptLang = 'sw',
): Promise<{ ok: boolean; error?: string; receipt?: GiftClaimReceipt }> {
  const name = guestName.trim().slice(0, 80)
  if (!name) return { ok: false, error: 'Please enter your name.' }
  const guestPhone = normalizePhone(guestPhoneRaw)
  if (!guestPhone) return { ok: false, error: 'Please enter a valid phone number.' }
  const guestEmail = guestEmailRaw?.trim() || null

  const supabase = createDashboardClient()
  const { data: profile, error: pErr } = await supabase
    .from('couple_profiles')
    .select('user_id, public_sharing_enabled, partner1_name, partner2_name, whatsapp_phone')
    .eq('public_slug', slug)
    .maybeSingle<{
      user_id: string
      public_sharing_enabled: boolean
      partner1_name: string | null
      partner2_name: string | null
      whatsapp_phone: string | null
    }>()
  if (pErr) {
    console.error('[gift-registry] profile lookup failed', pErr)
    return { ok: false, error: 'Something went wrong — please try again in a moment.' }
  }
  if (!profile || !profile.public_sharing_enabled) {
    return { ok: false, error: 'This registry link is no longer active.' }
  }

  const { data: item, error: itemErr } = await supabase
    .from('gift_registry_items')
    .select('id, title, quantity_requested, price_label, shop_name, shop_location, shop_contact, product_link')
    .eq('id', itemId)
    .eq('user_id', profile.user_id)
    .maybeSingle<{
      id: string
      title: string
      quantity_requested: number
      price_label: string | null
      shop_name: string | null
      shop_location: string | null
      shop_contact: string | null
      product_link: string | null
    }>()
  if (itemErr || !item) {
    return { ok: false, error: 'This gift is no longer on the registry.' }
  }

  let claimedTitle: string
  if (item.quantity_requested <= 1) {
    // Only claim if still unclaimed — prevents two guests racing on the same gift.
    const { data: claimed, error: updErr } = await supabase
      .from('gift_registry_items')
      .update({
        claimed_by_name: name,
        claimed_by_phone: guestPhone,
        claimed_by_email: guestEmail,
        claimed_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .eq('user_id', profile.user_id)
      .is('claimed_by_name', null)
      .select('id, title')
      .maybeSingle<{ id: string; title: string }>()
    if (updErr) {
      console.error('[gift-registry] claim failed', updErr)
      return { ok: false, error: 'Something went wrong — please try again in a moment.' }
    }
    if (!claimed) {
      return { ok: false, error: 'Someone already claimed this gift.' }
    }
    claimedTitle = claimed.title
  } else {
    // Quantity > 1 — each unit can go to a different guest. The check-and-
    // insert happens atomically in claim_gift_registry_unit (row lock on the
    // item), so concurrent claims on the last unit serialize instead of
    // racing — see supabase/migrations/20260717040000_gift_registry_claim_atomic.sql.
    const { data: claimId, error: claimErr } = await supabase.rpc('claim_gift_registry_unit', {
      p_item_id: itemId,
      p_user_id: profile.user_id,
      p_guest_name: name,
      p_guest_phone: guestPhone,
      p_guest_email: guestEmail,
    })
    if (claimErr) {
      console.error('[gift-registry] claim insert failed', claimErr)
      return { ok: false, error: 'Something went wrong — please try again in a moment.' }
    }
    if (!claimId) {
      return { ok: false, error: 'This gift is fully claimed.' }
    }
    claimedTitle = item.title
  }

  // Couples are addressed by first name only (e.g. "Jonathan & Jenifer", not
  // "Jonathan David & Jenifer Kasala") everywhere they're shown to guests.
  const coupleFirstNames = [profile.partner1_name, profile.partner2_name]
    .filter(Boolean)
    .map((n) => firstNameOf(n!))
    .join(' & ')
  const coupleNames = coupleFirstNames || 'you'
  await createNotification({
    userId: profile.user_id,
    type: 'gift_claimed',
    title: coupleFirstNames
      ? `${name} claimed a gift from ${coupleFirstNames}'s registry`
      : `${name} claimed a gift`,
    body: claimedTitle,
    actorName: name,
    href: '/my/dashboard/gift-registry',
  })

  const receiptGift: ReceiptGift = {
    title: claimedTitle,
    priceLabel: item.price_label,
    shopName: item.shop_name,
    shopLocation: item.shop_location,
    shopContact: item.shop_contact,
    productLink: item.product_link,
  }

  // Best-effort — a couple with no email on file, or a not-yet-configured
  // gateway, must never turn a successful claim into an error response.
  let guestEmailSent = false
  let guestWhatsAppSent = false
  try {
    const { data: coupleUser } = await supabase.from('users').select('email').eq('id', profile.user_id).maybeSingle<{ email: string | null }>()
    const result = await sendGiftClaimReceipts({
      gift: receiptGift,
      coupleName: coupleNames,
      guestName: name,
      guestPhone,
      guestEmail,
      coupleEmail: coupleUser?.email ?? null,
      couplePhone: normalizePhone(profile.whatsapp_phone),
      lang,
    })
    guestEmailSent = result.guestEmailSent
    guestWhatsAppSent = result.guestWhatsAppSent
  } catch (err) {
    console.error('[gift-registry] claim receipt send failed', err)
  }

  revalidatePath(`/gift-registry/${slug}`)
  revalidatePath('/my/dashboard/gift-registry')
  return { ok: true, receipt: { gift: receiptGift, guestEmailSent, guestWhatsAppSent } }
}

/**
 * A guest buys a SHOP-CATALOG gift the couple never added ("surprise" gift):
 * creates the gift_registry_items row for the couple's registry pre-claimed by
 * the guest in one insert (no unclaimed window for another guest to race on),
 * then notifies the couple and sends the guest the usual purchase receipt.
 *
 * Resolves the registry via wedding_events.gift_registry_slug (the slug this
 * public page is actually served under) — NOT couple_profiles.public_slug,
 * which is the older account-wide slug that diverges after an event rename.
 */
export async function claimCatalogGift(
  slug: string,
  catalogId: string,
  guestName: string,
  guestPhoneRaw: string,
  guestEmailRaw: string | null,
  lang: ReceiptLang = 'sw',
): Promise<{ ok: boolean; error?: string; receipt?: GiftClaimReceipt; itemId?: string }> {
  const name = guestName.trim().slice(0, 80)
  if (!name) return { ok: false, error: 'Please enter your name.' }
  const guestPhone = normalizePhone(guestPhoneRaw)
  if (!guestPhone) return { ok: false, error: 'Please enter a valid phone number.' }
  const guestEmail = guestEmailRaw?.trim() || null

  const gift = GIFT_CATALOG.find((g) => g.id === catalogId)
  if (!gift) return { ok: false, error: 'This gift is no longer in the shop.' }

  const supabase = createDashboardClient()
  const { data: event, error: eventErr } = await supabase
    .from('wedding_events')
    .select('id, user_id, gift_registry_sharing_enabled')
    .eq('gift_registry_slug', slug)
    .maybeSingle<{ id: string; user_id: string; gift_registry_sharing_enabled: boolean }>()
  if (eventErr) {
    console.error('[gift-registry] catalog claim event lookup failed', eventErr)
    return { ok: false, error: 'Something went wrong — please try again in a moment.' }
  }
  if (!event || !event.gift_registry_sharing_enabled) {
    return { ok: false, error: 'This registry link is no longer active.' }
  }

  const { data: inserted, error: insErr } = await supabase
    .from('gift_registry_items')
    .insert({
      user_id: event.user_id,
      event_id: event.id,
      title: gift.title,
      description: gift.description,
      image_urls: [gift.image],
      price_label: gift.priceLabel,
      shop_name: gift.shopName,
      shop_location: gift.shopLocation,
      category: gift.category,
      quantity_requested: 1,
      is_cash_fund: gift.priceLabel.trim().toLowerCase() === 'any amount',
      claimed_by_name: name,
      claimed_by_phone: guestPhone,
      claimed_by_email: guestEmail,
      claimed_at: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle<{ id: string }>()
  if (insErr || !inserted) {
    console.error('[gift-registry] catalog claim insert failed', insErr)
    return { ok: false, error: 'Something went wrong — please try again in a moment.' }
  }

  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('partner1_name, partner2_name, whatsapp_phone')
    .eq('user_id', event.user_id)
    .maybeSingle<{ partner1_name: string | null; partner2_name: string | null; whatsapp_phone: string | null }>()

  const coupleFirstNames = [profile?.partner1_name, profile?.partner2_name]
    .filter(Boolean)
    .map((n) => firstNameOf(n!))
    .join(' & ')
  await createNotification({
    userId: event.user_id,
    type: 'gift_claimed',
    title: coupleFirstNames
      ? `${name} is gifting ${coupleFirstNames} something from the shop`
      : `${name} is gifting you something from the shop`,
    body: gift.title,
    actorName: name,
    href: '/my/dashboard/gift-registry',
  })

  const receiptGift: ReceiptGift = {
    title: gift.title,
    priceLabel: gift.priceLabel,
    shopName: gift.shopName,
    shopLocation: gift.shopLocation,
    shopContact: null,
    productLink: null,
  }

  // Best-effort, same as claimGiftRegistryItem — receipt delivery must never
  // turn a successful purchase into an error response.
  let guestEmailSent = false
  let guestWhatsAppSent = false
  try {
    const { data: coupleUser } = await supabase.from('users').select('email').eq('id', event.user_id).maybeSingle<{ email: string | null }>()
    const result = await sendGiftClaimReceipts({
      gift: receiptGift,
      coupleName: coupleFirstNames || 'you',
      guestName: name,
      guestPhone,
      guestEmail,
      coupleEmail: coupleUser?.email ?? null,
      couplePhone: normalizePhone(profile?.whatsapp_phone ?? null),
      lang,
    })
    guestEmailSent = result.guestEmailSent
    guestWhatsAppSent = result.guestWhatsAppSent
  } catch (err) {
    console.error('[gift-registry] catalog claim receipt send failed', err)
  }

  revalidatePath(`/gift-registry/${slug}`)
  revalidatePath('/my/dashboard/gift-registry')
  return { ok: true, receipt: { gift: receiptGift, guestEmailSent, guestWhatsAppSent }, itemId: inserted.id }
}

// ---------------------------------------------------------------- WhatsApp invitations

/** Per-guest outcome of one send run — powers the results drawer. */
/**
 * What a send WOULD do, before it does it.
 *
 * Shown in the confirm step so a couple never discovers on the bill that two
 * guests shared a handset. The eligibility split is computed by the same
 * function the send itself uses, so the preview cannot promise a different
 * outcome to the one they get.
 */
export interface SendPreview {
  /** Guests asked for. */
  requested: number
  /** Guests that will actually receive a message. */
  eligible: number
  /** Held back, each one named with a reason. */
  skipped: { guestId: string; name: string; reason: string; detail: string }[]
  /** Distinct handsets the eligible guests resolve to. */
  distinctNumbers: number
  /** Numbers that would receive more than one message in this run. */
  repeatedRecipients: { phone: string; guests: string[] }[]
}

export async function previewGuestSend(guestIds?: string[]): Promise<SendPreview> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const delivery = await loadDeliveryGate(user.id)

  let q = supabase
    .from('guest_contacts')
    .select('id')
    .eq('user_id', user.id)
    .eq('review_status', 'confirmed')
  if (guestIds && guestIds.length) q = q.in('id', guestIds)
  const { data, error } = await q
  if (error) throw new Error(error.message)

  const ids = (data ?? []).map((r) => r.id as string)
  const split = resolveSendEligibility(ids, delivery)
  return {
    requested: ids.length,
    eligible: split.eligible.length,
    skipped: split.skipped.map((s) => ({
      guestId: s.guestId,
      name: s.name,
      reason: s.reason,
      detail: s.detail,
    })),
    distinctNumbers: split.distinctNumbers,
    repeatedRecipients: split.repeatedRecipients,
  }
}

/**
 * Resolve a shared-number conflict.
 *
 * The gate holds guests back; this is how an admin lets them through, and it
 * is deliberately the ONLY way. Confirming requires a reason, and the reason,
 * the person and the moment are all stored — an override is never anonymous.
 *
 * Confirmation applies to the whole group, not one row: approving one side of
 * a shared number while the other stays pending would leave a pair that is
 * half-resolved, which the gate correctly refuses to send to anyway.
 */
export async function confirmSharedContact(
  guestIds: string[],
  reason: string,
): Promise<{ ok: true; confirmed: number } | { ok: false; error: string }> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()

  const trimmed = reason.trim()
  if (!trimmed) return { ok: false, error: 'Give a reason before confirming a shared number.' }
  if (guestIds.length < 2) {
    return { ok: false, error: 'Confirming a shared number needs the guests who share it.' }
  }

  const { data: rows, error: readErr } = await supabase
    .from('guest_contacts')
    .select('id, full_name, phone, whatsapp_phone')
    .eq('user_id', user.id)
    .in('id', guestIds)
  if (readErr) throw new Error(readErr.message)
  if ((rows ?? []).length !== guestIds.length) {
    return { ok: false, error: 'Some of those guests are not on your list.' }
  }

  // They must genuinely share ONE number. Confirming an unrelated set would
  // silently lift them out of the uniqueness index for numbers they do not
  // actually share, disabling the constraint for those rows.
  const numbers = new Set((rows ?? []).map((r) => guestPhoneKey(r.phone, r.whatsapp_phone)))
  if (numbers.size !== 1 || numbers.has(null)) {
    return { ok: false, error: 'Those guests do not all share one phone number.' }
  }

  const { error } = await supabase
    .from('guest_contacts')
    .update({
      shared_contact_group_id: randomUUID(),
      shared_contact_confirmed: true,
      shared_contact_reason: trimmed,
      shared_contact_approved_at: new Date().toISOString(),
      shared_contact_approved_by: user.email || user.id,
    })
    .eq('user_id', user.id)
    .in('id', guestIds)
  if (error) throw new Error(error.message)

  revalidateDashboard()
  return { ok: true, confirmed: guestIds.length }
}

export interface WhatsAppSendResult {
  id: string
  name: string
  outcome: 'sent' | 'failed' | 'skipped' | 'blocked'
  /** Provider error message, for failed sends. */
  error?: string
  /** Why a guest was held back — a skip is never left as a bare count. */
  reason?: string
  /** True when this was a credit-free re-send to an already-invited guest. */
  resend?: boolean
}

export interface WhatsAppSendSummary {
  sent: number
  failed: number
  /** Held back by the deliverability gate: no number, an unusable number, or
   *  a number shared with another guest that nobody has confirmed. Each one is
   *  named with its reason in `results`. */
  skipped: number
  /** Skipped because the couple has used up their paid invitation quota. */
  blocked: number
  /** True when handled by the dry-run stub (no live Meta account yet). */
  dryRun: boolean
  hasPaidOrder: boolean
  /** Total invitation credits the couple paid for. */
  purchased: number
  /** Credits left after this run. */
  remaining: number
  /** One entry per guest attempted, in send order. */
  results: WhatsAppSendResult[]
}

/**
 * Resolve which event a send is for when the caller doesn't pick one
 * explicitly (e.g. the Guests page's quick-send button, which has no event
 * switcher) — the couple's first event by their own sort order, matching the
 * "primary event" concept every event-scoped surface falls back to.
 */
async function resolveDefaultEventId(explicit?: string): Promise<string | null> {
  if (explicit) return explicit
  const events = await getEvents()
  return events[0]?.id ?? null
}


type GuestCardHeaderResult =
  | { ok: true; url: string }
  | { ok: false; code: PrepareFailureCode | 'DESIGN_RELEASE_NOT_FOUND' | 'GUEST_NOT_OWNED' }

async function currentCardReleaseId(
  user: Awaited<ReturnType<typeof requireDashboardUser>>,
  eventId: string,
): Promise<string | null> {
  const supabase = createDashboardClient()
  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('whatsapp_phone')
    .eq('user_id', user.id)
    .maybeSingle<{ whatsapp_phone: string | null }>()

  const orders = (
    await fetchPaidOrdersForCouple(supabase, user.id, user.email, profile?.whatsapp_phone ?? null)
  ).filter((order) => order.event_id === eventId && isOrderReleasedForInvites(order))
  if (!orders.length) return null

  const { data: designs } = await supabase
    .from('invitation_card_designs')
    .select('order_id, current_release_id, released_at')
    .in('order_id', orders.map((order) => order.id))
    .in('status', ['ready', 'delivered'])
    .not('current_release_id', 'is', null)
    .order('released_at', { ascending: false })
  return (designs?.[0]?.current_release_id as string | null | undefined) ?? null
}

/** Prepare and resolve the immutable public URL for one real guest's card. */
async function guestCardHeaderUrl(
  user: Awaited<ReturnType<typeof requireDashboardUser>>,
  eventId: string,
  guestId: string,
  known?: { releaseId?: string; guestOwned?: boolean; guestName?: string | null },
): Promise<GuestCardHeaderResult> {
  // The name is needed even when ownership is already known, because it decides
  // WHICH asset this is: a renamed guest must not be handed the card drawn for
  // their old name. Callers holding the row pass it; the rest read it here.
  let guestName = known?.guestName ?? null
  if (!known?.guestOwned || guestName === null) {
    const { data: guest } = await createDashboardClient()
      .from('guest_contacts')
      .select('id, full_name')
      .eq('id', guestId)
      .eq('user_id', user.id)
      .maybeSingle<{ id: string; full_name: string | null }>()
    if (!guest) return { ok: false, code: 'GUEST_NOT_OWNED' }
    guestName = guest.full_name
  }

  const releaseId = known?.releaseId ?? await currentCardReleaseId(user, eventId)
  if (!releaseId) return { ok: false, code: 'DESIGN_RELEASE_NOT_FOUND' }

  const subject = { designReleaseId: releaseId, guestId, renderVariant: cardRenderVariant(guestName) }
  const prepared = await prepareGuestCardAsset(subject)
  if (!prepared.ok) return prepared
  const token = deriveAssetToken(subject)
  if (!token) return { ok: false, code: 'TOKEN_SECRET_MISSING' }
  return { ok: true, url: `${publicOrigin()}/invite-card/${token}.png` }
}

/** Couple-facing preview preparation. It is safe to call repeatedly: the
 *  underlying asset is idempotent and reused after its first successful render. */
export async function prepareInviteGuestPreview(
  guestId: string,
  eventId?: string,
): Promise<{ ok: true; imageUrl: string } | { ok: false; error: string }> {
  const user = await requireDashboardUser()
  const resolvedEventId = await resolveDefaultEventId(eventId)
  if (!resolvedEventId) return { ok: false, error: 'Set up an event first.' }
  const result = await guestCardHeaderUrl(user, resolvedEventId, guestId)
  return result.ok
    ? { ok: true, imageUrl: result.url }
    : { ok: false, error: `Could not prepare this guest card (${result.code}).` }
}

/**
 * Send the WhatsApp invitation to the given guests (or all confirmed guests
 * when no ids are passed). The header image is the card the COUPLE PAID FOR
 * (their purchased invitation design); the guest's first name goes in the
 * template body. Gated by entitlement: a paid order grants N credits
 * (= purchased guests) and each NEW guest consumes one — re-sends to a guest
 * already invited are free. Sends stop once the quota is exhausted.
 *
 * Uses the configured provider (Meta when credentials exist, else a dry-run
 * stub). Each send is logged to whatsapp_messages + guest_message_log.
 */
export async function sendWhatsAppInvites(guestIds?: string[], eventId?: string): Promise<WhatsAppSendSummary> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const provider = getWhatsAppProvider()
  const resolvedEventId = await resolveDefaultEventId(eventId)

  const summary: WhatsAppSendSummary = {
    sent: 0,
    failed: 0,
    skipped: 0,
    blocked: 0,
    dryRun: !provider.live,
    hasPaidOrder: false,
    purchased: 0,
    remaining: 0,
    results: [],
  }
  if (!resolvedEventId) return summary // no event set up yet — nothing to send for

  const ent = await getWhatsAppEntitlement(resolvedEventId)
  summary.hasPaidOrder = ent.hasPaidOrder
  summary.purchased = ent.purchased
  summary.remaining = ent.remaining

  // The approved template always carries View Location, so sending without a
  // useful event-owned location would produce a button that lies to the guest.
  if (!ent.invitationDetailsReady) {
    throw new Error('Complete Partner 1 and the event location before sending invitations.')
  }

  // Nothing to send until the couple has paid for a released card FOR THIS EVENT.
  if (!ent.hasPaidOrder || ent.purchased <= 0) return summary

  const releaseId = await currentCardReleaseId(user, resolvedEventId)
  if (!releaseId) throw new Error('No released card is ready for personalised delivery on this event.')

  let q = supabase
    .from('guest_contacts')
    .select('id, full_name, phone, whatsapp_phone, public_token')
    .eq('user_id', user.id)
    .eq('review_status', 'confirmed')
  if (guestIds && guestIds.length) q = q.in('id', guestIds)
  const { data: guests, error } = await q
  if (error) throw new Error(error.message)

  let remaining = ent.remaining // informational only — consumeSendCredit is the actual gate
  const now = new Date().toISOString()

  const delivery = await loadDeliveryGate(user.id)
  for (const g of (guests ?? []) as {
    id: string
    full_name: string
    phone: string | null
    whatsapp_phone: string | null
    public_token: string
  }[]) {
    // Deliverability gate. A guest with no number, an unusable number, or a
    // number shared with another guest that nobody has confirmed is held back
    // AND named — never silently dropped, and never sent twice to one handset.
    const gate = delivery.get(g.id)
    const to = gate?.phoneNormalized ?? null
    if (!gate?.deliverable || !to) {
      summary.skipped += 1
      summary.results.push({
        id: g.id,
        name: g.full_name,
        outcome: 'skipped',
        reason: gate?.detail || 'No phone number',
      })
      continue
    }

    // Prepare before spending a credit or contacting Meta. Every recipient
    // gets a URL bound to their own name and the current approved release.
    const card = await guestCardHeaderUrl(user, resolvedEventId, g.id, { releaseId, guestOwned: true, guestName: g.full_name })
    if (!card.ok) {
      summary.failed += 1
      summary.results.push({
        id: g.id,
        name: g.full_name,
        outcome: 'failed',
        error: `card preparation failed (${card.code})`,
      })
      continue
    }

    const verdict = await consumeSendCredit(supabase, {
      userId: user.id,
      eventId: resolvedEventId,
      guestContactId: g.id,
      kind: 'invite',
      purchased: ent.purchased,
    })
    if (verdict === 'blocked') {
      summary.blocked += 1
      summary.results.push({ id: g.id, name: g.full_name, outcome: 'blocked' })
      continue
    }
    const isResend = verdict === 'resend'
    if (!isResend) remaining -= 1

    const result = await provider.sendInvite({
      to,
      guestName: formatInviteGuestName(g.full_name),
      coupleName: ent.coupleName,
      eventCategory: ent.eventCategory,
      headerImageUrl: card.url,
      token: g.public_token,
      eventId: resolvedEventId,
    })

    await supabase.from('whatsapp_messages').insert({
      user_id: user.id,
      guest_contact_id: g.id,
      event_id: resolvedEventId,
      direction: 'out',
      wamid: result.wamid ?? null,
      kind: 'invite',
      status: result.ok ? 'sent' : 'failed',
      error: result.error ?? null,
    })

    if (result.ok) {
      summary.sent += 1
      summary.results.push({ id: g.id, name: g.full_name, outcome: 'sent', resend: isResend })
      await supabase.from('guest_message_log').insert({
        user_id: user.id,
        guest_contact_id: g.id,
        event_id: resolvedEventId,
        channel: 'whatsapp',
      })
      await supabase
        .from('guest_contacts')
        .update({ last_invited_at: now })
        .eq('id', g.id)
        .eq('user_id', user.id)
    } else {
      summary.failed += 1
      summary.results.push({ id: g.id, name: g.full_name, outcome: 'failed', error: result.error })
    }
    // A failed send or a dry-run simulation (no live Meta account yet) never
    // actually reached the guest — hand back the credit consumeSendCredit
    // reserved so the couple's real quota isn't burned by test traffic.
    if (!isResend && (!result.ok || result.dryRun)) {
      await releaseSendCredit(supabase, { userId: user.id, eventId: resolvedEventId, guestContactId: g.id, kind: 'invite' })
      remaining += 1
    }
  }

  summary.remaining = remaining
  revalidateDashboard()
  return summary
}

/**
 * Send an "OpusPass Entrance Pass" — a ticket image bearing the guest's name
 * and a scannable check-in QR — to guests who have confirmed attending the
 * given event. Metered like invites but from its OWN pool of the same
 * purchased size: buying N guests grants N invite credits AND N entrance-pass
 * credits. The first ticket to a distinct guest consumes one; re-sending that
 * guest their own ticket is free. Guests ticketed before metering shipped
 * keep their free re-sends — only NEW guests are blocked once the pool is dry.
 */
export async function sendEntrancePasses(guestIds?: string[], eventId?: string): Promise<WhatsAppSendSummary> {
  const user = await requireDashboardUser()
  const resolvedEventId = await resolveDefaultEventId(eventId)

  const emptySummary: WhatsAppSendSummary = {
    sent: 0,
    failed: 0,
    skipped: 0,
    blocked: 0,
    dryRun: !getWhatsAppProvider().live,
    hasPaidOrder: false,
    purchased: 0,
    remaining: 0,
    results: [],
  }
  if (!resolvedEventId) return emptySummary

  const summary = await deliverEntrancePasses({
    user: { id: user.id, email: user.email },
    eventId: resolvedEventId,
    guestIds,
  })
  revalidateDashboard()
  return summary
}

/** Outcome of a couple-facing test send of the invite template. */
export interface WhatsAppTestSendResult {
  ok: boolean
  dryRun: boolean
  error?: string
}

/**
 * Send the invitation template to a number the COUPLE controls so they can see
 * exactly what guests receive (their real card, names and buttons) before a
 * bulk send. The couple can override the three template variables from the
 * preview. Free: not tied to a guest, never consumes invitation credits
 * (quota counts distinct guest_contact_ids with kind='invite'; this row has
 * neither). The button payloads carry a 'test' token that maps to no guest, so
 * taps are logged and ignored.
 */
export async function sendWhatsAppTestInvite(
  rawPhone: string,
  guestId: string,
  eventId?: string,
): Promise<WhatsAppTestSendResult> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const provider = getWhatsAppProvider()
  const resolvedEventId = await resolveDefaultEventId(eventId)
  if (!resolvedEventId) return { ok: false, dryRun: !provider.live, error: 'no event set up yet' }
  const ent = await getWhatsAppEntitlement(resolvedEventId)

  const to = normalizePhone(rawPhone)
  if (!to || to.length < 9) return { ok: false, dryRun: !provider.live, error: 'invalid phone number' }
  if (!ent.invitationDetailsReady) {
    return { ok: false, dryRun: !provider.live, error: 'complete Partner 1 and the event location first' }
  }

  const { data: guest } = await supabase
    .from('guest_contacts')
    .select('id, full_name')
    .eq('id', guestId)
    .eq('user_id', user.id)
    .maybeSingle<{ id: string; full_name: string }>()
  if (!guest) return { ok: false, dryRun: !provider.live, error: 'select a guest to preview' }

  const releaseId = await currentCardReleaseId(user, resolvedEventId)
  if (!releaseId) return { ok: false, dryRun: !provider.live, error: 'no released card found for this event' }
  const card = await guestCardHeaderUrl(user, resolvedEventId, guest.id, { releaseId, guestOwned: true, guestName: guest.full_name })
  if (!card.ok) {
    return { ok: false, dryRun: !provider.live, error: `card preparation failed (${card.code})` }
  }

  const result = await provider.sendInvite({
    to,
    guestName: formatInviteGuestName(guest.full_name),
    coupleName: templateParam(ent.coupleName, 'The Couple'),
    eventCategory: templateParam(ent.eventCategory, 'sherehe'),
    headerImageUrl: card.url,
    token: 'test',
    eventId: resolvedEventId,
  })

  await supabase.from('whatsapp_messages').insert({
    user_id: user.id,
    guest_contact_id: null,
    event_id: resolvedEventId,
    direction: 'out',
    wamid: result.wamid ?? null,
    kind: 'invite_test',
    status: result.ok ? 'sent' : 'failed',
    error: result.error ?? null,
  })

  return { ok: result.ok, dryRun: Boolean(result.dryRun), error: result.error }
}

/** Outcome of a thank-you broadcast — no quota/purchase fields since, unlike
 *  invites/entrance passes, this isn't metered. */
export interface ThankYouSendSummary {
  sent: number
  failed: number
  /** Held back by the deliverability gate: no number, an unusable number, or
   *  a number shared with another guest that nobody has confirmed. Each one is
   *  named with its reason in `results`. */
  skipped: number
  /** True when handled by the dry-run stub (no live Meta account yet). */
  dryRun: boolean
  /** One entry per guest attempted, in send order. */
  results: WhatsAppSendResult[]
}

/**
 * Send the post-event "thank you" message to guests confirmed attending the
 * given event (or a subset, when guestIds is passed). Available to every
 * package tier — only the card TEMPLATE used as the header image is
 * paygated (see applyThankYouCardTemplate); everyone else just gets the
 * generic banner header. Not quota-gated either: every eligible guest can
 * always be thanked.
 */
export async function sendThankYouMessages(guestIds?: string[], eventId?: string): Promise<ThankYouSendSummary> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const provider = getWhatsAppProvider()
  const resolvedEventId = await resolveDefaultEventId(eventId)

  const summary: ThankYouSendSummary = { sent: 0, failed: 0, skipped: 0, dryRun: !provider.live, results: [] }
  if (!resolvedEventId) return summary

  const [ent, headerImageUrl] = await Promise.all([
    getWhatsAppEntitlement(resolvedEventId),
    resolveThankYouHeaderImage(supabase, user.id, resolvedEventId),
  ])

  const { data: invitations } = await supabase
    .from('guest_invitations')
    .select('guest_contact_id')
    .eq('user_id', user.id)
    .eq('event_id', resolvedEventId)
    .eq('rsvp_status', 'attending')
  const attendingIds = new Set((invitations ?? []).map((i) => i.guest_contact_id as string))
  if (!attendingIds.size) return summary

  const targetIds = guestIds && guestIds.length ? guestIds.filter((id) => attendingIds.has(id)) : [...attendingIds]
  if (!targetIds.length) return summary

  const { data: guests, error } = await supabase
    .from('guest_contacts')
    .select('id, full_name, phone, whatsapp_phone')
    .eq('user_id', user.id)
    .in('id', targetIds)
  if (error) throw new Error(error.message)

  const delivery = await loadDeliveryGate(user.id)
  for (const g of (guests ?? []) as { id: string; full_name: string; phone: string | null; whatsapp_phone: string | null }[]) {
    // Deliverability gate. A guest with no number, an unusable number, or a
    // number shared with another guest that nobody has confirmed is held back
    // AND named — never silently dropped, and never sent twice to one handset.
    const gate = delivery.get(g.id)
    const to = gate?.phoneNormalized ?? null
    if (!gate?.deliverable || !to) {
      summary.skipped += 1
      summary.results.push({
        id: g.id,
        name: g.full_name,
        outcome: 'skipped',
        reason: gate?.detail || 'No phone number',
      })
      continue
    }

    const result = await provider.sendThankYou({
      to,
      guestFirstName: templateParam(greetingNameOf(g.full_name), g.full_name, 60),
      coupleName: ent.coupleName,
      eventCategory: ent.eventCategory,
      headerImageUrl,
    })

    await supabase.from('whatsapp_messages').insert({
      user_id: user.id,
      guest_contact_id: g.id,
      event_id: resolvedEventId,
      direction: 'out',
      wamid: result.wamid ?? null,
      kind: 'thank_you',
      status: result.ok ? 'sent' : 'failed',
      error: result.error ?? null,
    })

    if (result.ok) {
      summary.sent += 1
      summary.results.push({ id: g.id, name: g.full_name, outcome: 'sent' })
      await supabase.from('guest_message_log').insert({
        user_id: user.id,
        guest_contact_id: g.id,
        event_id: resolvedEventId,
        channel: 'whatsapp',
      })
      await markThankYouSent(supabase, user.id, resolvedEventId, g.id)
    } else {
      summary.failed += 1
      summary.results.push({ id: g.id, name: g.full_name, outcome: 'failed', error: result.error })
    }
  }

  revalidateDashboard()
  return summary
}

/** The thank-you message's header image for one event: the couple's chosen
 *  card design if they've applied one (see applyThankYouCardTemplate),
 *  else a generic OpusPass banner — same fallback sendWhatsAppLinkRequests
 *  uses for collector/pledge links. */
async function resolveThankYouHeaderImage(
  supabase: ReturnType<typeof createDashboardClient>,
  userId: string,
  eventId: string,
): Promise<string> {
  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('thank_you_config')
    .eq('user_id', userId)
    .maybeSingle<{ thank_you_config: ThankYouCardConfig | null }>()
  const cover = resolveThankYouCover(profile?.thank_you_config ?? null, eventId)
  return cover.coverImageUrl ?? `${publicOrigin()}/assets/images/couples_together.jpg`
}

/** Bump the thank-you send tracker on one guest's invitation row for this
 *  event, scoped to guest_invitations since (unlike the pledge ask) this
 *  tracker is per-event, not couple-level. Goes through an atomic RPC (see
 *  migration 20260715000001) rather than a select-then-update in application
 *  code, so two overlapping sends for the same guest can't both read the
 *  same count and undercount. */
async function markThankYouSent(
  supabase: ReturnType<typeof createDashboardClient>,
  userId: string,
  eventId: string,
  guestId: string,
): Promise<void> {
  const { error } = await supabase.rpc('increment_thank_you_count', {
    p_user_id: userId,
    p_event_id: eventId,
    p_guest_contact_id: guestId,
  })
  if (error) throw new Error(error.message)
}

/**
 * Send the thank-you template to a number the COUPLE controls so they can
 * preview exactly what guests will receive before a bulk send. Mirrors
 * sendWhatsAppTestInvite: not tied to a guest, never touches the thank-you
 * tracker.
 */
export async function sendThankYouTestMessage(rawPhone: string, eventId?: string): Promise<WhatsAppTestSendResult> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const provider = getWhatsAppProvider()
  const resolvedEventId = await resolveDefaultEventId(eventId)
  if (!resolvedEventId) return { ok: false, dryRun: !provider.live, error: 'no event set up yet' }
  const [ent, headerImageUrl] = await Promise.all([
    getWhatsAppEntitlement(resolvedEventId),
    resolveThankYouHeaderImage(supabase, user.id, resolvedEventId),
  ])

  const to = normalizePhone(rawPhone)
  if (!to || to.length < 9) return { ok: false, dryRun: !provider.live, error: 'invalid phone number' }

  const result = await provider.sendThankYou({
    to,
    guestFirstName: 'Rafiki',
    coupleName: ent.coupleName,
    eventCategory: ent.eventCategory,
    headerImageUrl,
  })

  await supabase.from('whatsapp_messages').insert({
    user_id: user.id,
    guest_contact_id: null,
    event_id: resolvedEventId,
    direction: 'out',
    wamid: result.wamid ?? null,
    kind: 'thank_you_test',
    status: result.ok ? 'sent' : 'failed',
    error: result.error ?? null,
  })

  return { ok: result.ok, dryRun: Boolean(result.dryRun), error: result.error }
}

/**
 * Attach a paid invitation order to one of the couple's events, so its
 * design/quota becomes visible to that event's Send Invites page instead of
 * sitting unassigned. Ownership is enforced via the user_id/contact match
 * `getWhatsAppEntitlement` already uses to surface `unassignedOrders`.
 */
export async function assignOrderToEvent(orderId: string, eventId: string): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()

  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('whatsapp_phone')
    .eq('user_id', user.id)
    .maybeSingle<{ whatsapp_phone: string | null }>()

  const { data: event } = await supabase
    .from('wedding_events')
    .select('id')
    .eq('id', eventId)
    .eq('user_id', user.id)
    .maybeSingle<{ id: string }>()
  if (!event) throw new Error('Event not found')

  // Ownership match: a guest-checkout order (user_id NULL) may match by
  // email/phone, but an order that already carries a DIFFERENT explicit
  // user_id can never be pulled in this way — this is a write, unlike the
  // read-only entitlement lookups that historically used a looser OR-match.
  const orders = await fetchPaidOrdersForCouple(supabase, user.id, user.email, profile?.whatsapp_phone ?? null)
  const order = orders.find((o) => o.id === orderId)
  if (!order) throw new Error('Order not found')
  if (!isOrderReleasedForInvites(order)) {
    throw new Error('This card is not available yet. It becomes assignable after the design is approved.')
  }

  const { error } = await supabase.from('invitation_orders').update({ event_id: eventId }).eq('id', orderId)
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

/** Undo an `assignOrderToEvent` link — sends the order back to "unassigned"
 *  so it can be re-linked to the correct event instead. */
export async function unassignOrderFromEvent(orderId: string): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()

  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('whatsapp_phone')
    .eq('user_id', user.id)
    .maybeSingle<{ whatsapp_phone: string | null }>()

  const orders = await fetchPaidOrdersForCouple(supabase, user.id, user.email, profile?.whatsapp_phone ?? null)
  const order = orders.find((o) => o.id === orderId)
  if (!order) throw new Error('Order not found')

  const { error } = await supabase.from('invitation_orders').update({ event_id: null }).eq('id', orderId)
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

/**
 * Persist the couple-confirmed WhatsApp template values: {{2}} host name and
 * {{3}} event category. Sending is blocked until these are saved once; the
 * confirm step saves them on every bulk send so edits stick.
 */
/** The Pass Ticket tab's Ticket Details editor payload — edits the REAL
 *  wedding_events row (single source of truth: the same values feed the
 *  ticket image, the WhatsApp pass message, invites and the RSVP hub). */
export interface TicketDetailsInput {
  event_type: string
  partner1_name: string | null
  partner2_name: string | null
  /** YYYY-MM-DD; '' clears the event date. */
  start_date: string
  venue_name: string | null
  city: string | null
  ticket_language: TicketLanguage
}

export async function updateEventTicketDetails(eventId: string, input: TicketDetailsInput): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()

  const { data: existing, error: readErr } = await supabase
    .from('wedding_events')
    .select('starts_at')
    .eq('id', eventId)
    .eq('user_id', user.id)
    .maybeSingle<{ starts_at: string | null }>()
  if (readErr) throw new Error(readErr.message)
  if (!existing) throw new Error('Event not found')

  // The editor only exposes the DATE — carry the stored time-of-day (EAT
  // wall clock; Tanzania has no DST, so a fixed +03:00 is always right)
  // across a date change instead of silently resetting it to midnight.
  let starts_at: string | null = existing.starts_at
  const newDate = input.start_date.trim()
  if (!newDate) {
    starts_at = null
  } else {
    let hour = 0
    let minute = 0
    if (existing.starts_at) {
      const d = new Date(existing.starts_at)
      if (!Number.isNaN(d.getTime())) {
        const parts = eatDateParts(d)
        hour = parts.hour
        minute = parts.minute
      }
    }
    const combined = new Date(`${newDate}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+03:00`)
    if (!Number.isNaN(combined.getTime())) starts_at = combined.toISOString()
  }

  const { error } = await supabase
    .from('wedding_events')
    .update({
      event_type: input.event_type.trim() || 'other',
      partner1_name: input.partner1_name?.trim() || null,
      partner2_name: input.partner2_name?.trim() || null,
      starts_at,
      venue_name: input.venue_name?.trim() || null,
      city: input.city?.trim() || null,
      ticket_language: input.ticket_language === 'sw' ? 'sw' : 'en',
    })
    .eq('id', eventId)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

export async function saveInviteSendSettings(hostName: string, eventCategory: string): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const host = hostName.replace(/\s+/g, ' ').trim().slice(0, 60)
  const category = eventCategory.replace(/\s+/g, ' ').trim().slice(0, 40)
  if (!host || !category) throw new Error('Fill in who the invite is from and the event type')

  const { data: updated, error } = await supabase
    .from('couple_profiles')
    .update({ invite_host_name: host, invite_event_category: category })
    .eq('user_id', user.id)
    .select('user_id')
  if (error) throw new Error(error.message)

  if (!updated || updated.length === 0) {
    // First save with no profile row yet. partner1_name is NOT NULL, so seed
    // the partner names from the host string ("Asha & Juma" / "Asha na Juma").
    const [p1, p2] = host.split(/\s*(?:&|\bna\b)\s*/i)
    const { error: insErr } = await supabase.from('couple_profiles').insert({
      user_id: user.id,
      partner1_name: (p1?.trim() || host).slice(0, 60),
      partner2_name: p2?.trim() ? p2.trim().slice(0, 60) : null,
      invite_host_name: host,
      invite_event_category: category,
    })
    if (insErr) {
      // Concurrent first saves can race past the empty update; the loser hits
      // the user_id unique constraint — retry as a plain update instead.
      if (insErr.code === '23505') {
        const { error: retryErr } = await supabase
          .from('couple_profiles')
          .update({ invite_host_name: host, invite_event_category: category })
          .eq('user_id', user.id)
        if (retryErr) throw new Error(retryErr.message)
      } else {
        throw new Error(insErr.message)
      }
    }
  }
  revalidateDashboard()
}

/**
 * Lightweight inline edit from the Send Invites table: guest display name and
 * phone. Deliberately narrower than updateGuest (which rewrites every column
 * from a full GuestInput) so an inline edit can never clobber unrelated
 * fields. The single phone field drives BOTH phone and whatsapp_phone —
 * fixing a wrong number must fix where invites actually go.
 */
export async function updateGuestBasics(guestId: string, name: string, rawPhone: string): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const fullName = name.replace(/\s+/g, ' ').trim().slice(0, 120)
  if (!fullName) throw new Error('Enter the guest name')
  // A blank phone means "leave the number as it is" — an inline name fix must
  // never silently strip a guest's sendable number.
  const updatePayload: { full_name: string; phone?: string; whatsapp_phone?: string } = {
    full_name: fullName,
  }
  if (rawPhone.trim()) {
    const phone = normalizePhone(rawPhone)
    if (!phone || phone.length < 9) throw new Error('Enter a valid phone number')
    updatePayload.phone = phone
    updatePayload.whatsapp_phone = phone
  }
  const { error } = await supabase
    .from('guest_contacts')
    .update(updatePayload)
    .eq('id', guestId)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

/**
 * Lightweight inline edit from the Pledges guest table: guest display name,
 * phone, and email. By default, blank phone/email fields mean "leave it as it
 * is" for quick inline edits; pledge-row edits can opt into clearing blanks.
 */
export async function updateGuestContactInfo(
  guestId: string,
  name: string,
  rawPhone: string,
  email: string,
  options: { clearBlankFields?: boolean; groupTag?: string | null; maxPartySize?: number } = {},
): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const fullName = name.replace(/\s+/g, ' ').trim().slice(0, 120)
  if (!fullName) throw new Error('Enter the guest name')
  const updatePayload: {
    full_name: string
    phone?: string | null
    whatsapp_phone?: string | null
    email?: string | null
    group_tag?: string | null
    max_party_size?: number
  } = {
    full_name: fullName,
  }
  if (rawPhone.trim()) {
    const phone = normalizePhone(rawPhone)
    if (!phone || phone.length < 9) throw new Error('Enter a valid phone number')
    updatePayload.phone = phone
    updatePayload.whatsapp_phone = phone
  } else if (options.clearBlankFields) {
    updatePayload.phone = null
    updatePayload.whatsapp_phone = null
  }
  if (email.trim()) {
    updatePayload.email = email.trim()
  } else if (options.clearBlankFields) {
    updatePayload.email = null
  }
  if ('groupTag' in options) {
    updatePayload.group_tag = (options.groupTag ?? '').trim() || null
  }
  if (typeof options.maxPartySize === 'number') {
    updatePayload.max_party_size = ticketPartySize(options.maxPartySize)
  }
  const { error } = await supabase
    .from('guest_contacts')
    .update(updatePayload)
    .eq('id', guestId)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  if (typeof options.maxPartySize === 'number') {
    await alignPendingInvitationPartySize(user.id, guestId, options.maxPartySize)
  }
  revalidateDashboard()
}

/**
 * Quick inline fix from the Send Invites table: attach a phone number to a
 * guest who was skipped for having none. Also fills whatsapp_phone when empty
 * so the guest immediately becomes WhatsApp-sendable.
 */
export async function updateGuestPhone(guestId: string, rawPhone: string): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const phone = normalizePhone(rawPhone)
  if (!phone || phone.length < 9) throw new Error('Enter a valid phone number')

  const { data: existing, error: readErr } = await supabase
    .from('guest_contacts')
    .select('id, whatsapp_phone')
    .eq('id', guestId)
    .eq('user_id', user.id)
    .maybeSingle<{ id: string; whatsapp_phone: string | null }>()
  if (readErr) throw new Error(readErr.message)
  if (!existing) throw new Error('Guest not found')

  const { error } = await supabase
    .from('guest_contacts')
    .update({ phone, whatsapp_phone: existing.whatsapp_phone ?? phone })
    .eq('id', guestId)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

/** Result of a Contact Collector / Pledge WhatsApp link-request broadcast. */
export interface WhatsAppLinkSendSummary {
  sent: number
  failed: number
  /** Contacts with no usable phone number. */
  skipped: number
  /** True when handled by the dry-run stub (no live Meta account yet). */
  dryRun: boolean
}

/** Bump the pledge-ask send tracker for one contact — separate from the
 *  wedding-invite tracker (recordSend/invite_count above), since asking for a
 *  pledge is a distinct send from inviting someone to the wedding. Mirrors
 *  recordSend's fetch-then-increment pattern. */
async function markPledgeInviteSent(
  supabase: ReturnType<typeof createDashboardClient>,
  userId: string,
  guestId: string,
): Promise<void> {
  const { data: guest } = await supabase
    .from('guest_contacts')
    .select('pledge_invite_count')
    .eq('id', guestId)
    .eq('user_id', userId)
    .maybeSingle<{ pledge_invite_count: number }>()
  await supabase
    .from('guest_contacts')
    .update({
      pledge_invite_sent_at: new Date().toISOString(),
      pledge_invite_count: (guest?.pledge_invite_count ?? 0) + 1,
    })
    .eq('id', guestId)
    .eq('user_id', userId)
}

/**
 * Send the couple's Contact Collector or Pledge link to the given saved
 * contacts via a templated WhatsApp message (image header + CTA URL button
 * pointing at /collect/<token> or /pledge/<token>). Unlike invites this isn't
 * quota-gated — it's a free-form "please fill this in" nudge.
 */
async function sendWhatsAppLinkRequests(
  kind: LinkRequestKind,
  guestIds: string[],
  token: string | null,
  eventId?: string,
): Promise<WhatsAppLinkSendSummary> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const provider = getWhatsAppProvider()
  const summary: WhatsAppLinkSendSummary = { sent: 0, failed: 0, skipped: 0, dryRun: !provider.live }

  if (!token || !guestIds.length) return summary

  // Collector/pledge links are couple-level, not tied to any one event — but
  // when the caller knows which event is currently in view, prefer that one
  // so `ent.coupleName`/category context matches what's on screen.
  const resolvedEventId = await resolveDefaultEventId(eventId)
  if (!resolvedEventId) return summary
  const ent = await getWhatsAppEntitlement(resolvedEventId)
  // Generic OpusPass banner — used as the WhatsApp template's image header
  // whenever there's no better option (collector links, or a pledge that
  // hasn't had a card design applied to this event yet).
  let headerImageUrl = `${publicOrigin()}/assets/images/couples_together.jpg`
  // For pledge links, lead with the couple's own selected/paid pledge card
  // design for this event (if they've applied one) so the WhatsApp message
  // shows the actual card instead of a generic banner.
  if (kind === 'pledge') {
    const { data: profile } = await supabase
      .from('couple_profiles')
      .select('pledge_page')
      .eq('user_id', user.id)
      .maybeSingle<{ pledge_page: PledgePageConfig | null }>()
    const cover = resolveEventCover(profile?.pledge_page, resolvedEventId)
    if (cover.coverImageUrl) headerImageUrl = cover.coverImageUrl
  }

  const { data: guests, error } = await supabase
    .from('guest_contacts')
    .select('id, full_name, phone, whatsapp_phone')
    .eq('user_id', user.id)
    .in('id', guestIds)
  if (error) throw new Error(error.message)

  const delivery = await loadDeliveryGate(user.id)
  for (const g of (guests ?? []) as {
    id: string
    full_name: string
    phone: string | null
    whatsapp_phone: string | null
  }[]) {
    // Same deliverability gate as every other outbound path.
    const gate = delivery.get(g.id)
    const to = gate?.phoneNormalized ?? null
    if (!gate?.deliverable || !to) {
      summary.skipped += 1
      continue
    }

    const result = await provider.sendLinkRequest(kind, {
      to,
      contactFirstName: templateParam(greetingNameOf(g.full_name), g.full_name, 60),
      coupleName: ent.coupleName,
      headerImageUrl,
      token,
      eventId: resolvedEventId,
    })

    await supabase.from('whatsapp_messages').insert({
      user_id: user.id,
      guest_contact_id: g.id,
      direction: 'out',
      wamid: result.wamid ?? null,
      kind,
      status: result.ok ? 'sent' : 'failed',
      error: result.error ?? null,
    })

    if (result.ok) {
      summary.sent += 1
      await supabase.from('guest_message_log').insert({
        user_id: user.id,
        guest_contact_id: g.id,
        channel: 'whatsapp',
      })
      if (kind === 'pledge') await markPledgeInviteSent(supabase, user.id, g.id)
    } else {
      summary.failed += 1
    }
  }

  revalidateDashboard()
  return summary
}

/** Send the Contact Collector link to selected saved contacts via WhatsApp. */
export async function sendWhatsAppCollectorRequests(guestIds: string[]): Promise<WhatsAppLinkSendSummary> {
  const token = await getMyCollectorToken()
  return sendWhatsAppLinkRequests('collector', guestIds, token)
}

/** Send the self-pledge link to selected saved contacts via WhatsApp. `eventId`,
 *  when passed, should be the event currently in view on the Pledges page so
 *  the resolved coupleName/category context matches what the couple sees. */
export async function sendWhatsAppPledgeRequests(
  guestIds: string[],
  eventId?: string,
): Promise<WhatsAppLinkSendSummary> {
  const token = await getMyPledgeToken()
  return sendWhatsAppLinkRequests('pledge', guestIds, token, eventId)
}

/** Result of a Pledge link broadcast over Email or SMS. */
export interface PledgeLinkSendSummary {
  sent: number
  failed: number
  /** Contacts with no usable email/phone on file. */
  skipped: number
  /** True when handled by a dry-run stub (no live provider configured yet). */
  dryRun: boolean
}

/** Pledge links are couple-level (not tied to one event), but the pledge page
 *  itself can be event-scoped — resolve the given event (falling back to the
 *  couple's default event) the same way the WhatsApp send does, so all three
 *  channels point at the same page the couple currently has open. */
async function resolvePledgeSendContext(
  eventId?: string,
): Promise<{ token: string; coupleName: string; eventId: string } | null> {
  const token = await getMyPledgeToken()
  if (!token) return null
  const resolvedEventId = await resolveDefaultEventId(eventId)
  if (!resolvedEventId) return null
  const ent = await getWhatsAppEntitlement(resolvedEventId)
  return { token, coupleName: ent.coupleName, eventId: resolvedEventId }
}

/**
 * Send the self-pledge link to selected saved contacts by email — a branded
 * HTML message with a CTA button to the couple's pledge page. Real delivery
 * via Resend once RESEND_API_KEY is set, else a dry run (mirrors the
 * WhatsApp stub) so the send pipeline is testable before then.
 */
export async function sendEmailPledgeRequests(
  guestIds: string[],
  eventId?: string,
): Promise<PledgeLinkSendSummary> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const live = isEmailConfigured()
  const summary: PledgeLinkSendSummary = { sent: 0, failed: 0, skipped: 0, dryRun: !live }
  if (!guestIds.length) return summary

  const ctx = await resolvePledgeSendContext(eventId)
  if (!ctx) return summary

  const { data: guests, error } = await supabase
    .from('guest_contacts')
    .select('id, full_name, email')
    .eq('user_id', user.id)
    .in('id', guestIds)
  if (error) throw new Error(error.message)

  const link = pledgeUrl(publicOrigin(), ctx.token, ctx.eventId)

  for (const g of (guests ?? []) as { id: string; full_name: string; email: string | null }[]) {
    if (!g.email) {
      summary.skipped += 1
      continue
    }

    const { subject, html, text } = pledgeRequestEmail(ctx.coupleName, greetingNameOf(g.full_name), link)
    let ok = true
    if (live) {
      ok = (await sendEmail({ to: g.email, subject, html, text })).sent
    } else {
      console.warn('[email:dry-run] would send pledge request', { to: g.email, subject })
    }

    if (ok) {
      summary.sent += 1
      await supabase.from('guest_message_log').insert({
        user_id: user.id,
        guest_contact_id: g.id,
        channel: 'email',
      })
      await markPledgeInviteSent(supabase, user.id, g.id)
    } else {
      summary.failed += 1
    }
  }

  revalidateDashboard()
  return summary
}

/**
 * Send the self-pledge link to selected saved contacts by SMS. No gateway is
 * wired up yet, so every send runs through the dry-run stub — the contact
 * picker, message log, and dashboard UI already work end to end and only the
 * provider (`@/lib/sms`) needs to change once a gateway is chosen.
 */
export async function sendSmsPledgeRequests(
  guestIds: string[],
  eventId?: string,
): Promise<PledgeLinkSendSummary> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const provider = getSmsProvider('pledge')
  const summary: PledgeLinkSendSummary = { sent: 0, failed: 0, skipped: 0, dryRun: !provider.live }
  if (!guestIds.length) return summary

  const ctx = await resolvePledgeSendContext(eventId)
  if (!ctx) return summary

  const { data: guests, error } = await supabase
    .from('guest_contacts')
    .select('id, full_name, phone, whatsapp_phone')
    .eq('user_id', user.id)
    .in('id', guestIds)
  if (error) throw new Error(error.message)

  const link = pledgeUrl(publicOrigin(), ctx.token, ctx.eventId)

  const delivery = await loadDeliveryGate(user.id)
  for (const g of (guests ?? []) as {
    id: string
    full_name: string
    phone: string | null
    whatsapp_phone: string | null
  }[]) {
    // Same deliverability gate as every other outbound path.
    const gate = delivery.get(g.id)
    const to = gate?.phoneNormalized ?? null
    if (!gate?.deliverable || !to) {
      summary.skipped += 1
      continue
    }

    const result = await provider.sendLinkRequest({
      to,
      contactFirstName: templateParam(greetingNameOf(g.full_name), g.full_name, 60),
      coupleName: ctx.coupleName,
      link,
    })

    if (result.ok) {
      summary.sent += 1
      await supabase.from('guest_message_log').insert({
        user_id: user.id,
        guest_contact_id: g.id,
        channel: 'sms',
      })
      await markPledgeInviteSent(supabase, user.id, g.id)
    } else {
      summary.failed += 1
    }
  }

  revalidateDashboard()
  return summary
}

/**
 * Nudge already-invited guests who haven't responded yet. Reuses the same
 * approved invite template (no new Meta template needed) — resends are free
 * per sendWhatsAppInvites' existing quota logic.
 */
export async function sendWhatsAppRsvpReminders(guestIds?: string[]): Promise<WhatsAppSendSummary> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()

  let gq = supabase
    .from('guest_contacts')
    .select('id')
    .eq('user_id', user.id)
    .eq('review_status', 'confirmed')
    .not('last_invited_at', 'is', null)
  if (guestIds && guestIds.length) gq = gq.in('id', guestIds)
  const { data: candidates } = await gq
  const candidateIds = (candidates ?? []).map((g) => g.id as string)

  const zeroSummary: WhatsAppSendSummary = {
    sent: 0,
    failed: 0,
    skipped: 0,
    blocked: 0,
    dryRun: true,
    hasPaidOrder: false,
    purchased: 0,
    remaining: 0,
    results: [],
  }
  if (!candidateIds.length) return zeroSummary

  const { data: invitations } = await supabase
    .from('guest_invitations')
    .select('guest_contact_id, rsvp_status')
    .eq('user_id', user.id)
    .in('guest_contact_id', candidateIds)

  const respondedIds = new Set(
    (invitations ?? [])
      .filter((i) => i.rsvp_status === 'attending' || i.rsvp_status === 'declined')
      .map((i) => i.guest_contact_id as string),
  )
  const pendingIds = candidateIds.filter((id) => !respondedIds.has(id))
  if (!pendingIds.length) return zeroSummary

  return sendWhatsAppInvites(pendingIds)
}

// ---------------------------------------------------------------- Seat collection

/** Add a table to an event's floor plan. Returns the new table id. */
export async function createSeatingTable(input: {
  eventId: string
  name?: string
  capacity?: number
  isHead?: boolean
}): Promise<string> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()

  // Guard: the event must belong to the signed-in couple.
  const { data: event } = await supabase
    .from('wedding_events')
    .select('id')
    .eq('id', input.eventId)
    .eq('user_id', user.id)
    .maybeSingle<{ id: string }>()
  if (!event) throw new Error('Event not found')

  // New tables append after existing ones.
  const { data: last } = await supabase
    .from('seating_tables')
    .select('sort_order')
    .eq('user_id', user.id)
    .eq('event_id', input.eventId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>()

  const { data, error } = await supabase
    .from('seating_tables')
    .insert({
      user_id: user.id,
      event_id: input.eventId,
      name: input.name?.trim() || 'New table',
      capacity: Math.max(0, Math.floor(input.capacity ?? 10)),
      is_head: input.isHead ?? false,
      sort_order: (last?.sort_order ?? 0) + 1,
    })
    .select('id')
    .single<{ id: string }>()
  if (error || !data) throw new Error(error?.message ?? 'Failed to create table')
  revalidateDashboard()
  return data.id
}

/** Rename a table, change its capacity, or toggle its "head table" flag. */
export async function updateSeatingTable(
  tableId: string,
  input: { name?: string; capacity?: number; isHead?: boolean },
): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()

  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name.trim() || 'Table'
  if (input.capacity !== undefined) patch.capacity = Math.max(0, Math.floor(input.capacity))
  if (input.isHead !== undefined) patch.is_head = input.isHead
  if (Object.keys(patch).length === 0) return

  const { error } = await supabase
    .from('seating_tables')
    .update(patch)
    .eq('id', tableId)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

/** Remove a table. Its assignments cascade away, returning guests to the pool. */
export async function deleteSeatingTable(tableId: string): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { error } = await supabase
    .from('seating_tables')
    .delete()
    .eq('id', tableId)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

/**
 * Seat a guest party at a table (or move them between tables). One assignment
 * per guest per event, so this upserts on (guest_contact_id, event_id).
 */
export async function assignGuestToTable(input: {
  eventId: string
  guestContactId: string
  tableId: string
}): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()

  // Guard: the table must belong to this couple AND this event.
  const { data: table } = await supabase
    .from('seating_tables')
    .select('id')
    .eq('id', input.tableId)
    .eq('event_id', input.eventId)
    .eq('user_id', user.id)
    .maybeSingle<{ id: string }>()
  if (!table) throw new Error('Table not found')

  const { error } = await supabase
    .from('seating_assignments')
    .upsert(
      {
        user_id: user.id,
        event_id: input.eventId,
        table_id: input.tableId,
        guest_contact_id: input.guestContactId,
      },
      { onConflict: 'guest_contact_id,event_id' },
    )
  if (error) throw new Error(error.message)
  revalidateDashboard()
}

/** Return a guest to the "to be seated" pool for an event. */
export async function unassignGuest(input: {
  eventId: string
  guestContactId: string
}): Promise<void> {
  const user = await requireDashboardUser()
  const supabase = createDashboardClient()
  const { error } = await supabase
    .from('seating_assignments')
    .delete()
    .eq('user_id', user.id)
    .eq('event_id', input.eventId)
    .eq('guest_contact_id', input.guestContactId)
  if (error) throw new Error(error.message)
  revalidateDashboard()
}
