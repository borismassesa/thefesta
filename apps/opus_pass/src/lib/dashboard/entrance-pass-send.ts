import 'server-only'
import { createDashboardClient } from './supabase'
import {
  computeEntrancePassVars,
  consumeSendCredit,
  entranceCoupleName,
  getWhatsAppEntitlement,
  releaseSendCredit,
} from './queries'
import { fullNameOf, normalizePhone, publicOrigin, templateParam } from './share'
import { getWhatsAppProvider } from '@/lib/whatsapp'
import type { WhatsAppSendSummary } from './actions'
import type { EventType } from './types'

/**
 * Delivering the entrance-pass ticket, with the couple named explicitly.
 *
 * Two callers want the same send with different notions of "who": the
 * dashboard's Pass Ticket tab, where the signed-in couple picks guests, and
 * the WhatsApp webhook, where a guest has just confirmed and NOBODY is signed
 * in. Splitting the identity out of the send is what lets the automatic path
 * exist without a second, drifting copy of the credit and template logic.
 *
 * The couple is passed in rather than resolved here on purpose: this module
 * has no way to tell a legitimate caller from a wrong one, so authorising the
 * send stays the caller's job. Every query below is still scoped by that
 * user id, so a wrong couple reads an empty roster rather than someone else's.
 */

/** The couple whose event, roster and ticket quota this send draws on. */
export interface EntrancePassSender {
  /** public.users.id */
  id: string
  /** Matches guest-checkout orders that were never attached to the account. */
  email: string
}

/**
 * Send the "OpusPass Entrance Pass" — a ticket image bearing the guest's name
 * and a scannable check-in QR — to guests who have confirmed attending the
 * given event. Metered from the entrance-pass credit pool: the first ticket to
 * a distinct guest consumes one, re-sending that guest their own ticket is
 * free, and a guest needing a NEW credit is blocked once the pool is dry.
 */
export async function deliverEntrancePasses(args: {
  user: EntrancePassSender
  eventId: string
  /** Restrict to these guests; omitted means every attending guest. */
  guestIds?: string[]
}): Promise<WhatsAppSendSummary> {
  const { user, eventId, guestIds } = args
  const supabase = createDashboardClient()
  const provider = getWhatsAppProvider()

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

  const [{ data: event }, { data: profile }] = await Promise.all([
    supabase
      .from('wedding_events')
      .select('name, starts_at, event_type, partner1_name, partner2_name, venue_name, address, city')
      .eq('id', eventId)
      .eq('user_id', user.id)
      .maybeSingle<{
        name: string
        starts_at: string | null
        event_type: EventType | null
        partner1_name: string | null
        partner2_name: string | null
        venue_name: string | null
        address: string | null
        city: string | null
      }>(),
    supabase
      .from('couple_profiles')
      .select('partner1_name, partner2_name, invite_host_name, invite_event_category')
      .eq('user_id', user.id)
      .maybeSingle<{
        partner1_name: string | null
        partner2_name: string | null
        invite_host_name: string | null
        invite_event_category: string | null
      }>(),
  ])
  if (!event) return summary

  // Celebrant first names — same derivation the ticket image and the
  // dashboard preview use, so message and ticket always agree.
  const coupleName = entranceCoupleName(event, profile)
  const categoryOverride = profile?.invite_event_category?.trim() || null
  const { eventCategory, dateLabel, timeLabel, venue } = computeEntrancePassVars(event, categoryOverride)

  // Ticket credits come from the same paid order as invite credits, but are
  // a separate pool — see getWhatsAppEntitlement.
  const ent = await getWhatsAppEntitlement(eventId, { actingUser: user })
  summary.hasPaidOrder = ent.hasPaidOrder
  summary.purchased = ent.entrancePassPurchased
  summary.remaining = ent.entrancePassRemaining
  // No blanket bail-out on a dry pool: a guest who already holds a ticket
  // (an existing credit_consumptions row) is still entitled to a free
  // resend regardless of remaining purchased quota — consumeSendCredit
  // below is the real gate, and it only blocks guests needing a NEW credit.

  const { data: invitations } = await supabase
    .from('guest_invitations')
    .select('guest_contact_id')
    .eq('user_id', user.id)
    .eq('event_id', eventId)
    .eq('rsvp_status', 'attending')
  const attendingIds = new Set((invitations ?? []).map((i) => i.guest_contact_id as string))
  if (!attendingIds.size) return summary

  const targetIds = guestIds && guestIds.length ? guestIds.filter((id) => attendingIds.has(id)) : [...attendingIds]
  if (!targetIds.length) return summary

  const { data: guests, error } = await supabase
    .from('guest_contacts')
    .select('id, full_name, phone, whatsapp_phone, public_token')
    .eq('user_id', user.id)
    .in('id', targetIds)
  if (error) throw new Error(error.message)

  const origin = publicOrigin()
  let remaining = ent.entrancePassRemaining // informational only — consumeSendCredit is the actual gate

  for (const g of (guests ?? []) as {
    id: string
    full_name: string
    phone: string | null
    whatsapp_phone: string | null
    public_token: string
  }[]) {
    const to = normalizePhone(g.whatsapp_phone ?? g.phone)
    if (!to) {
      summary.skipped += 1
      summary.results.push({ id: g.id, name: g.full_name, outcome: 'skipped' })
      continue
    }

    const verdict = await consumeSendCredit(supabase, {
      userId: user.id,
      eventId,
      guestContactId: g.id,
      kind: 'entrance_pass',
      purchased: ent.entrancePassPurchased,
    })
    if (verdict === 'blocked') {
      summary.blocked += 1
      summary.results.push({ id: g.id, name: g.full_name, outcome: 'blocked' })
      continue
    }
    const isResend = verdict === 'resend'
    if (!isResend) remaining -= 1

    const result = await provider.sendEntrancePass({
      to,
      // Meta rejects/limits overlong template params — a full name is
      // unbounded (unlike firstNameOf's realistically-short single word),
      // so cap it the same way the test-send flow already does.
      guestName: templateParam(fullNameOf(g.full_name), g.full_name, 60),
      eventCategory,
      coupleName,
      dateLabel,
      timeLabel,
      venue,
      // Cache-buster (`v`): Meta downloads and caches header media keyed by URL,
      // so a guest re-sent their pass — or sent one after the couple edits the
      // ticket or we ship a new template — would otherwise receive Meta's stale
      // cached image forever (the URL is stable per guest+event). A per-send
      // timestamp forces a fresh fetch every time. The route ignores `v`.
      headerImageUrl: `${origin}/entrance-pass/${g.public_token}?event=${eventId}&v=${Date.now()}`,
    })

    // Delivery-status log only now — credit_consumptions (written by
    // consumeSendCredit above) is the quota ledger; this intentionally still
    // doesn't touch guest_message_log / last_invited_at, which drive the
    // invite-quota UI ("already invited"), a separate pool's send.
    await supabase.from('whatsapp_messages').insert({
      user_id: user.id,
      guest_contact_id: g.id,
      event_id: eventId,
      direction: 'out',
      wamid: result.wamid ?? null,
      kind: 'entrance_pass',
      status: result.ok ? 'sent' : 'failed',
      error: result.error ?? null,
    })

    if (result.ok) {
      summary.sent += 1
      summary.results.push({ id: g.id, name: g.full_name, outcome: 'sent', resend: isResend })
    } else {
      summary.failed += 1
      summary.results.push({ id: g.id, name: g.full_name, outcome: 'failed', error: result.error })
    }
    // A failed send or a dry-run simulation (no live Meta account yet) never
    // actually reached the guest — hand back the credit consumeSendCredit
    // reserved so the couple's real quota isn't burned by test traffic.
    if (!isResend && (!result.ok || result.dryRun)) {
      await releaseSendCredit(supabase, { userId: user.id, eventId, guestContactId: g.id, kind: 'entrance_pass' })
      remaining += 1
    }
  }

  summary.remaining = remaining
  return summary
}
