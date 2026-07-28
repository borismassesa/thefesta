import { createDashboardClient } from '@/lib/dashboard/supabase'
import { createNotification } from '@/lib/dashboard/notifications'
import { formatLongDate } from '@/lib/dashboard/share'
import { BTN, getWhatsAppProvider, parseInboundButtons, parseStatusUpdates, verifyWebhookSignature, webhookVerifyToken } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

type EventVenue = {
  name: string
  venue_name: string | null
  address: string | null
  city: string | null
  starts_at: string | null
}

// Meta Cloud API verification handshake: echo hub.challenge when the token matches.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')
  const expected = webhookVerifyToken()
  if (mode === 'subscribe' && expected && token === expected && challenge) {
    return new Response(challenge, { status: 200, headers: { 'content-type': 'text/plain' } })
  }
  return new Response('forbidden', { status: 403 })
}

// Inbound events: quick-reply button taps → update the guest's RSVP. Always
// returns 200 fast so Meta doesn't retry on slow processing; idempotency is
// enforced by the unique wamid in whatsapp_messages.
export async function POST(req: Request) {
  // Read the raw body first: the signature is computed over the exact bytes,
  // so we cannot let the framework parse/re-serialize it before verifying.
  const raw = await req.text()
  if (!verifyWebhookSignature(raw, req.headers.get('x-hub-signature-256'))) {
    return new Response('invalid signature', { status: 403 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return new Response('ok', { status: 200 })
  }

  const taps = parseInboundButtons(body)
  const statusUpdates = parseStatusUpdates(body)
  if (taps.length === 0 && statusUpdates.length === 0) return new Response('ok', { status: 200 })

  const supabase = createDashboardClient()
  const provider = getWhatsAppProvider()

  // Delivery lifecycle of OUR messages: sent → delivered → read, or failed.
  // Never downgrade (events can arrive out of order); failed is terminal in
  // both directions — it always applies over sent/delivered/read, and a late
  // sent/delivered event must never mask a recorded failure.
  const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 }
  for (const su of statusUpdates) {
    const { data: row } = await supabase
      .from('whatsapp_messages')
      .select('id, status')
      .eq('wamid', su.wamid)
      .eq('direction', 'out')
      .maybeSingle<{ id: string; status: string | null }>()
    if (!row) continue
    if (row.status === 'failed' && su.status !== 'failed') continue
    if (su.status !== 'failed' && (STATUS_RANK[row.status ?? ''] ?? 0) >= STATUS_RANK[su.status]) continue
    await supabase
      .from('whatsapp_messages')
      .update(su.error ? { status: su.status, error: su.error } : { status: su.status })
      .eq('id', row.id)
  }

  for (const tap of taps) {
    // Idempotency: first writer wins; a duplicate wamid is silently skipped.
    const { error: dupeErr } = await supabase
      .from('whatsapp_messages')
      .insert({ direction: 'in', wamid: tap.wamid, kind: tap.kind, status: 'received' })
    if (dupeErr) continue // unique violation → already processed

    // Resolve the guest: token from the button payload, else sender phone.
    const guestQuery = supabase.from('guest_contacts').select('id, user_id, full_name')
    const { data: guest } = tap.token
      ? await guestQuery.eq('public_token', tap.token).maybeSingle<{ id: string; user_id: string; full_name: string }>()
      : await guestQuery.eq('phone', tap.from).maybeSingle<{ id: string; user_id: string; full_name: string }>()
    if (!guest) {
      // No matching guest — the tap is recorded above (for idempotency/audit)
      // but nothing else can happen. Log it: this is the #1 silent-failure
      // mode when a guest sees no reaction to a button tap.
      console.error('[whatsapp webhook] no guest matched for tap', {
        kind: tap.kind,
        hasToken: Boolean(tap.token),
        from: tap.from,
      })
      continue
    }

    await supabase
      .from('whatsapp_messages')
      .update({ user_id: guest.user_id, guest_contact_id: guest.id, status: 'processed' })
      .eq('wamid', tap.wamid)

    // Which event this tap is about. New sends embed the event id directly
    // in the button payload (authoritative — see InviteSend.eventId); older
    // sends predate that and fall back to a best-effort guess from the
    // guest's most recent successfully-delivered invite. The guest's own
    // public_token is per-guest, not per-event, so without an embedded
    // eventId there is no way to know for certain which invite was tapped.
    let resolvedEventId = tap.eventId
    if (!resolvedEventId) {
      // Match any success status — by the time a guest taps a button their
      // invite has been upgraded sent → delivered → read by the receipts
      // above, so matching only 'sent' would never find it.
      const { data: lastInvite } = await supabase
        .from('whatsapp_messages')
        .select('event_id')
        .eq('guest_contact_id', guest.id)
        .eq('direction', 'out')
        .eq('kind', 'invite')
        .in('status', ['sent', 'delivered', 'read'])
        .not('event_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle<{ event_id: string }>()
      resolvedEventId = lastInvite?.event_id ?? null
    }

    if (tap.kind === BTN.RSVP_YES || tap.kind === BTN.RSVP_NO) {
      const status = tap.kind === BTN.RSVP_YES ? 'attending' : 'declined'
      // Unified roster: a tap must never be lost because the guest predates
      // event linking — create any missing invitation rows before recording.
      const { data: evs } = await supabase
        .from('wedding_events')
        .select('id')
        .eq('user_id', guest.user_id)
      const eventIds = (evs ?? []).map((e) => e.id as string)
      if (eventIds.length) {
        const { data: have } = await supabase
          .from('guest_invitations')
          .select('event_id')
          .eq('guest_contact_id', guest.id)
        const haveSet = new Set((have ?? []).map((r) => r.event_id as string))
        const missing = eventIds.filter((id) => !haveSet.has(id))
        if (missing.length) {
          await supabase
            .from('guest_invitations')
            .insert(missing.map((event_id) => ({ user_id: guest.user_id, guest_contact_id: guest.id, event_id })))
        }
      }
      // Scope the RSVP to the specific event this tap was about when known —
      // a guest invited to 2+ events must not have EVERY event flipped by one
      // button tap. Only fall back to updating every invitation when we
      // genuinely can't tell which event this tap belongs to (legacy sends).
      const rsvpUpdate = supabase
        .from('guest_invitations')
        .update({ rsvp_status: status, responded_at: new Date().toISOString() })
        .eq('guest_contact_id', guest.id)
      await (resolvedEventId ? rsvpUpdate.eq('event_id', resolvedEventId) : rsvpUpdate)
      await createNotification({
        userId: guest.user_id,
        type: 'rsvp_received',
        title: `${guest.full_name} responded on WhatsApp`,
        body: status === 'attending' ? 'Attending' : 'Declined',
        actorName: guest.full_name,
        href: '/my/dashboard/rsvps',
      })
      // Without this, tapping a button silently updates the couple's
      // dashboard but the guest who tapped it sees nothing happen at all.
      const confirmMsg =
        status === 'attending'
          ? 'Asante! Tumepokea uthibitisho wako wa kuhudhuria. Tunakusubiri! 🎉'
          : 'Asante kwa kutujulisha. Tunasikitika kwamba hutoweza kuhudhuria. 💐'
      const confirmResult = await provider.sendText(tap.from, confirmMsg)
      await supabase.from('whatsapp_messages').insert({
        user_id: guest.user_id,
        guest_contact_id: guest.id,
        event_id: resolvedEventId,
        direction: 'out',
        wamid: confirmResult.wamid ?? null,
        kind: 'rsvp_confirmation',
        status: confirmResult.ok ? 'sent' : 'failed',
        error: confirmResult.error ?? null,
      })
      if (!confirmResult.ok) {
        console.error('[whatsapp webhook] rsvp confirmation send failed', {
          guestId: guest.id,
          error: confirmResult.error,
        })
      }
    } else if (tap.kind === BTN.VIEW_LOCATION) {
      // Reply with the specific event this tap was about; fall back to the
      // couple's soonest public event only when it can't be determined.
      const eventQuery = supabase
        .from('wedding_events')
        .select('name, venue_name, address, city, starts_at')
        .eq('user_id', guest.user_id)
      const { data: ev } = resolvedEventId
        ? await eventQuery.eq('id', resolvedEventId).maybeSingle<EventVenue>()
        : await eventQuery
            .eq('is_public', true)
            .order('starts_at', { ascending: true, nullsFirst: false })
            .limit(1)
            .maybeSingle<EventVenue>()

      if (ev) {
        const place = [ev.venue_name, ev.address, ev.city].filter(Boolean).join(', ')
        const maps = place ? `https://maps.google.com/?q=${encodeURIComponent(place)}` : ''
        const when = formatLongDate(ev.starts_at)
        const msg =
          `📍 ${ev.name}\n${place || 'Venue TBC'}` +
          (when ? `\n🗓️ ${when}` : '') +
          (maps ? `\n${maps}` : '')
        const locationResult = await provider.sendText(tap.from, msg)
        await supabase.from('whatsapp_messages').insert({
          user_id: guest.user_id,
          guest_contact_id: guest.id,
          event_id: resolvedEventId,
          direction: 'out',
          wamid: locationResult.wamid ?? null,
          kind: 'location_reply',
          status: locationResult.ok ? 'sent' : 'failed',
          error: locationResult.error ?? null,
        })
        if (!locationResult.ok) {
          console.error('[whatsapp webhook] location reply send failed', {
            guestId: guest.id,
            error: locationResult.error,
          })
        }
      } else {
        console.error('[whatsapp webhook] view_location: no event found for guest', {
          guestId: guest.id,
          userId: guest.user_id,
          resolvedEventId,
        })
      }
    }
  }

  return new Response('ok', { status: 200 })
}
