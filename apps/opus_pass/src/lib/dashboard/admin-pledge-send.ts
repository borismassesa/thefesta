import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createDashboardClient } from './supabase'
import { resolveEventCover, type PledgePageConfig } from './pledge-page'
import { firstNameOf, normalizePhone, pledgeUrl, publicOrigin } from './share'
import { assessRosterDelivery } from './guest-delivery'
import { loadRosterIdentities } from './queries'
import { getWhatsAppProvider } from '@/lib/whatsapp'
import { getSmsProvider } from '@/lib/sms'
import type { ReminderCadence, SendChannel } from './types'

// Staff-triggered pledge sends (OpusFesta admin's Pledge Concierge), called
// only from the internal /api/internal/admin/pledges/send route — never
// exposed to the couple's own dashboard. Every query is explicitly scoped by
// a `userId` the caller already resolved and authorized (there's no Clerk
// session here to derive it from), so this deliberately does NOT reuse
// requireDashboardUser()-based dashboard/actions.ts functions. It does reuse
// the same WhatsApp/SMS provider libs so there is exactly one integration
// with Meta/the SMS gateway, not two.

const CADENCE_DAYS: Record<ReminderCadence, number | null> = {
  none: null,
  weekly: 7,
  biweekly: 14,
}

function nextReminderAt(cadence: ReminderCadence, from = new Date()): string | null {
  const days = CADENCE_DAYS[cadence]
  if (!days) return null
  const next = new Date(from)
  next.setDate(next.getDate() + days)
  return next.toISOString()
}

export interface AdminSendSummary {
  sent: number
  failed: number
  skipped: number
  dryRun: boolean
}

export interface AdminReminderResult {
  ok: boolean
  dryRun: boolean
  error?: string
}

async function resolveCoupleNameForAdmin(
  supabase: SupabaseClient,
  userId: string,
  eventId: string | null,
): Promise<string> {
  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('partner1_name, partner2_name, invite_host_name')
    .eq('user_id', userId)
    .maybeSingle<{ partner1_name: string | null; partner2_name: string | null; invite_host_name: string | null }>()
  const hostOverride = profile?.invite_host_name?.trim() || null
  if (hostOverride) return hostOverride
  const coupleNames = [profile?.partner1_name, profile?.partner2_name].filter(Boolean)
  if (coupleNames.length) return coupleNames.join(' & ')
  if (eventId) {
    const { data: event } = await supabase
      .from('wedding_events')
      .select('name')
      .eq('user_id', userId)
      .eq('id', eventId)
      .maybeSingle<{ name: string | null }>()
    if (event?.name?.trim()) return event.name.trim()
  }
  return 'The Couple'
}

async function resolveDefaultEventIdForAdmin(
  supabase: SupabaseClient,
  userId: string,
  explicit?: string,
): Promise<string | null> {
  if (explicit) {
    const { data } = await supabase
      .from('wedding_events')
      .select('id')
      .eq('user_id', userId)
      .eq('id', explicit)
      .maybeSingle<{ id: string }>()
    if (data) return data.id
  }
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

async function markPledgeInviteSentForAdmin(
  supabase: SupabaseClient,
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

async function recordPledgeReminderForAdmin(
  supabase: SupabaseClient,
  userId: string,
  pledgeId: string,
  channel: SendChannel,
): Promise<void> {
  const { data: pledge } = await supabase
    .from('event_pledges')
    .select('reminder_count, reminder_cadence')
    .eq('id', pledgeId)
    .eq('user_id', userId)
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
    .eq('user_id', userId)
  if (error) throw new Error(error.message)

  const { error: logErr } = await supabase
    .from('pledge_reminder_log')
    .insert({ user_id: userId, pledge_id: pledgeId, channel })
  if (logErr) throw new Error(logErr.message)
}

/** Send the couple's self-pledge link to the given guests, on staff's behalf. */
export async function sendPledgeRequestForCouple(
  userId: string,
  channel: 'whatsapp' | 'sms',
  guestIds: string[],
  eventId?: string,
): Promise<AdminSendSummary> {
  const supabase = createDashboardClient()
  const live = channel === 'whatsapp' ? getWhatsAppProvider().live : getSmsProvider().live
  const summary: AdminSendSummary = { sent: 0, failed: 0, skipped: 0, dryRun: !live }
  if (!guestIds.length) return summary

  const { data: userRow } = await supabase
    .from('users')
    .select('pledge_token')
    .eq('id', userId)
    .maybeSingle<{ pledge_token: string | null }>()
  const token = userRow?.pledge_token ?? null
  if (!token) return summary

  const resolvedEventId = await resolveDefaultEventIdForAdmin(supabase, userId, eventId)
  const coupleName = await resolveCoupleNameForAdmin(supabase, userId, resolvedEventId)

  const { data: guests, error } = await supabase
    .from('guest_contacts')
    .select('id, full_name, phone, whatsapp_phone')
    .eq('user_id', userId)
    .in('id', guestIds)
  if (error) throw new Error(error.message)
  const rows = (guests ?? []) as { id: string; full_name: string; phone: string | null; whatsapp_phone: string | null }[]

  if (channel === 'whatsapp') {
    const provider = getWhatsAppProvider()
    let headerImageUrl = `${publicOrigin()}/assets/images/couples_together.jpg`
    if (resolvedEventId) {
      const { data: profile } = await supabase
        .from('couple_profiles')
        .select('pledge_page')
        .eq('user_id', userId)
        .maybeSingle<{ pledge_page: PledgePageConfig | null }>()
      const cover = resolveEventCover(profile?.pledge_page, resolvedEventId)
      if (cover.coverImageUrl) headerImageUrl = cover.coverImageUrl
    }
    // A pledge request asks for money. Two requests to one handset reads as a
    // double ask, and pledges recorded against the wrong guest inflate the
    // expected total.
    const delivery = assessRosterDelivery(await loadRosterIdentities(userId))
    for (const g of rows) {
      const gate = delivery.get(g.id)
      const to = gate?.phoneNormalized ?? null
      if (!gate?.deliverable || !to) {
        summary.skipped += 1
        continue
      }
      const result = await provider.sendLinkRequest('pledge', {
        to,
        contactFirstName: firstNameOf(g.full_name),
        coupleName,
        headerImageUrl,
        token,
        eventId: resolvedEventId,
      })
      await supabase.from('whatsapp_messages').insert({
        user_id: userId,
        guest_contact_id: g.id,
        direction: 'out',
        wamid: result.wamid ?? null,
        kind: 'pledge',
        status: result.ok ? 'sent' : 'failed',
        error: result.error ?? null,
      })
      if (result.ok) {
        summary.sent += 1
        await supabase.from('guest_message_log').insert({ user_id: userId, guest_contact_id: g.id, channel: 'whatsapp' })
        await markPledgeInviteSentForAdmin(supabase, userId, g.id)
      } else {
        summary.failed += 1
      }
    }
    return summary
  }

  const provider = getSmsProvider()
  const link = pledgeUrl(publicOrigin(), token, resolvedEventId ?? undefined)
  for (const g of rows) {
    const to = normalizePhone(g.phone ?? g.whatsapp_phone)
    if (!to) {
      summary.skipped += 1
      continue
    }
    const result = await provider.sendLinkRequest({ to, contactFirstName: firstNameOf(g.full_name), coupleName, link })
    if (result.ok) {
      summary.sent += 1
      await supabase.from('guest_message_log').insert({ user_id: userId, guest_contact_id: g.id, channel: 'sms' })
      await markPledgeInviteSentForAdmin(supabase, userId, g.id)
    } else {
      summary.failed += 1
    }
  }
  return summary
}

/** Send a follow-up reminder for one pledge, on staff's behalf. WhatsApp
 *  reminders reuse the pledge-request template (targeted at the pledge's
 *  own contact); SMS uses the free-form `message` the caller composed
 *  (mirrors the couple's own sendPledgeReminderSms). */
export async function sendPledgeReminderForCouple(
  userId: string,
  pledgeId: string,
  channel: 'whatsapp' | 'sms',
  message: string,
): Promise<AdminReminderResult> {
  const supabase = createDashboardClient()

  if (channel === 'sms') {
    const provider = getSmsProvider()
    const { data: pledge } = await supabase
      .from('event_pledges')
      .select('guest_contact_id')
      .eq('id', pledgeId)
      .eq('user_id', userId)
      .maybeSingle<{ guest_contact_id: string }>()
    if (!pledge) return { ok: false, dryRun: !provider.live, error: 'Pledge not found' }

    const { data: contact } = await supabase
      .from('guest_contacts')
      .select('phone, whatsapp_phone')
      .eq('id', pledge.guest_contact_id)
      .eq('user_id', userId)
      .maybeSingle<{ phone: string | null; whatsapp_phone: string | null }>()
    const to = normalizePhone(contact?.phone ?? contact?.whatsapp_phone)
    if (!to) return { ok: false, dryRun: !provider.live, error: 'No phone number on file' }

    const result = await provider.sendText(to, message)
    if (result.ok) await recordPledgeReminderForAdmin(supabase, userId, pledgeId, 'sms')
    return { ok: result.ok, dryRun: Boolean(result.dryRun), error: result.error }
  }

  const provider = getWhatsAppProvider()
  const { data: pledge } = await supabase
    .from('event_pledges')
    .select('guest_contact_id, event_id')
    .eq('id', pledgeId)
    .eq('user_id', userId)
    .maybeSingle<{ guest_contact_id: string; event_id: string | null }>()
  if (!pledge) return { ok: false, dryRun: !provider.live, error: 'Pledge not found' }

  const summary = await sendPledgeRequestForCouple(userId, 'whatsapp', [pledge.guest_contact_id], pledge.event_id ?? undefined)
  if (summary.sent > 0) {
    await recordPledgeReminderForAdmin(supabase, userId, pledgeId, 'whatsapp')
    return { ok: true, dryRun: summary.dryRun }
  }
  return { ok: false, dryRun: summary.dryRun, error: summary.skipped > 0 ? 'No phone number on file' : 'Send failed' }
}
