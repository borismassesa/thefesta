import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { candidateScannerAccessHashes } from '@/lib/checkin/tokens'
import { clientIp, withinRateLimit } from '@/lib/checkin/rate-limit'

export interface RosterEntry {
  invitationId: string
  fullName: string
  /** Headcount this guest RSVP'd for — the default offered at the door. */
  partySize: number
  /** Short code printed on the ticket, for the manual fallback. */
  entryCode: string | null
  /** Globally unique admission identifier, so the scanner can look a guest up
   *  from what they read out without knowing the event. */
  passId: string | null
  checkedInAt: string | null
  /** How many actually arrived, once scanned. Null until then. */
  checkedInPartySize: number | null
  /** Which door admitted them, for the arrivals log. */
  checkedInDoor: string | null
  /** Audit label of who admitted them, e.g. "Asha (Main Gate) (manual: …)". */
  checkedInBy: string | null
  /** Free-text guest-list grouping the couple entered, e.g. "Bride's Family". */
  groupTag: string | null
  /** Heuristic only: the couple wrote "VIP" somewhere in the group tag.
   *  There is no dedicated VIP tier in OpusPass's data model. */
  isVip: boolean
  /** Seating table this guest is assigned to (from the couple's Seat
   *  collection), so the attendant can point them to their seat. Null when
   *  the guest hasn't been seated yet. */
  table: string | null
}

/**
 * Validates a door-staff bearer token for one event and returns the guest
 * roster powering the manual-override search.
 *
 * Deliberate difference from apps/opus_scanner's equivalent route: that one
 * also returns a signed `qrToken` per guest so it can scan offline from an
 * IndexedDB cache. We omit it. Shipping every guest's valid entry-pass token
 * to a device means a lost or compromised phone hands over credentials that
 * would admit the entire guest list. The mobile scanner is online-first
 * (offline queue is explicitly out of scope for now), and its manual-override
 * path sends `invitationId` instead — so nothing here needs the token, and
 * the blast radius of a stolen device stays limited to the door code itself,
 * which the couple can revoke.
 *
 * The same reasoning governs contact details, and it is the reason this route
 * carries none. A roster is a bulk read: everything returned here lands on the
 * device in one call, for every attending guest, and stays there for the
 * shift. So it is limited to what the door needs to FIND a guest — the name
 * and the couple's own grouping. Anything that identifies a guest personally,
 * the phone number being the one the confirm card wants, is guest-specific
 * detail and comes from /lookup, one resolved guest at a time. Adding a
 * personal field here would widen a lost device from "the door code, which is
 * revocable" to "the whole guest list's contact details, which are not".
 */
export async function POST(request: Request) {
  const { eventId, token } = (await request.json().catch(() => ({}))) as {
    eventId?: string
    token?: string
  }
  if (!eventId || !token) {
    return NextResponse.json({ ok: false, error: 'Missing eventId or token' }, { status: 400 })
  }

  const supabase = createSupabaseServerClient()

  // Loose per-IP cap: the arrivals screen legitimately polls this every 15s
  // per device and a venue's attendants share one NAT, so this only stops
  // scripted hammering, not real use.
  if (!(await withinRateLimit(supabase, `validate:${clientIp(request)}`, 240, 60))) {
    return NextResponse.json(
      { ok: false, error: 'Too many attempts — wait a moment and try again' },
      { status: 429 }
    )
  }

  const { data: row, error } = await supabase
    .from('scanner_access_tokens')
    .select('id, door_label, event_id, expires_at, revoked_at, attendant_name')
    .in('token_hash', candidateScannerAccessHashes(token))
    .eq('event_id', eventId)
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: 'Lookup failed' }, { status: 500 })
  if (!row) return NextResponse.json({ ok: false, error: 'Invalid code' }, { status: 401 })
  if (row.revoked_at) return NextResponse.json({ ok: false, error: 'This code has been revoked' }, { status: 401 })
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: 'This code has expired' }, { status: 401 })
  }

  await supabase
    .from('scanner_access_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', row.id)

  const { data: event } = await supabase
    .from('wedding_events')
    .select('id, name, event_type, venue_name, starts_at')
    .eq('id', eventId)
    .maybeSingle()

  const { data: invitations } = await supabase
    .from('guest_invitations')
    .select(
      'id, guest_contact_id, entry_code, pass_id, party_size, checked_in_at, checked_in_party_size, checked_in_door, checked_in_by, guest_contacts(full_name, group_tag)'
    )
    .eq('event_id', eventId)
    .eq('rsvp_status', 'attending')

  // Seat collection assignments → each guest's table name. One event-wide
  // read (not per-guest) mapped by contact id, so the roster can show where
  // each arrival sits without an extra round-trip per row.
  const { data: seatAssignments } = await supabase
    .from('seating_assignments')
    .select('guest_contact_id, seating_tables(name)')
    .eq('event_id', eventId)
  const tableByGuest = new Map<string, string>()
  for (const a of seatAssignments ?? []) {
    // to-one embed: one assignment points at one table (or none).
    const table = a.seating_tables as unknown as { name: string } | null
    if (table?.name) tableByGuest.set(a.guest_contact_id as string, table.name)
  }

  const roster: RosterEntry[] = (invitations ?? []).map((inv) => {
    const contact = inv.guest_contacts as unknown as {
      full_name: string
      group_tag: string | null
    } | null
    return {
      invitationId: inv.id,
      fullName: contact?.full_name ?? 'Guest',
      entryCode: inv.entry_code,
      passId: inv.pass_id,
      partySize: inv.party_size ?? 1,
      checkedInAt: inv.checked_in_at,
      checkedInPartySize: inv.checked_in_party_size,
      checkedInDoor: inv.checked_in_door,
      checkedInBy: inv.checked_in_by,
      groupTag: contact?.group_tag ?? null,
      isVip: /vip/i.test(contact?.group_tag ?? ''),
      table: tableByGuest.get(inv.guest_contact_id) ?? null,
    }
  })

  return NextResponse.json({
    ok: true,
    doorLabel: row.door_label,
    /** Non-null when an admin assigned this code to a named attendant at
     *  issuance — authoritative, so the app must skip the name-entry step. */
    attendantName: row.attendant_name,
    /** When this door code (and therefore the attendant's shift) stops being
     *  valid. The scanner ends the shift automatically once this passes, so a
     *  forgotten shift can't stay open after the event. */
    expiresAt: row.expires_at,
    event,
    roster,
  })
}
