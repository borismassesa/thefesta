import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { candidateScannerAccessHashes, verifyEntryPassToken } from '@/lib/checkin/tokens'
import { broadcastCheckin } from '@/lib/checkin/broadcast'
import { RATE_LIMITED_RESPONSE, withinRateLimit } from '@/lib/checkin/rate-limit'

interface ScanBody {
  eventId?: string
  /** Door-staff bearer code proving this device may scan for this event. */
  accessToken?: string
  /** The scanned QR string. Required unless this is a manual override. */
  qrToken?: string
  /** Manual-override path (guest lost their phone): the attendant picks the
   *  guest from the roster instead of scanning. Requires manualReason. */
  invitationId?: string
  /** Short code printed on the ticket, used when the QR won't scan. */
  entryCode?: string
  manualReason?: string
  /** How many of the party actually walked in. Defaults to the whole
   *  remaining allowance server-side when omitted. */
  checkedInPartySize?: number
  /** Stable per-scan id, reused across retries of the SAME scan. Check-in is
   *  a counter now, so without this a retry after a dropped venue connection
   *  would admit the same people twice. */
  requestId?: string
  doorLabel?: string
  attendantName?: string
}

/** One row of checkin_admit_guest()'s result table. */
interface AdmitResult {
  result: 'admitted' | 'exhausted' | 'not_attending' | 'wrong_event' | 'not_found' | 'in_progress'
  is_replay: boolean
  admitted_now: number
  total_admitted: number
  allowance: number
  first_admitted_at: string | null
  rsvp_party_size: number
}

/**
 * Scans a guest's entry-pass QR and checks them in, or reports why not.
 *
 * Two independent credentials are verified server-side on every request, and
 * neither is ever trusted from the client:
 *  - accessToken: proves this device may scan for this event
 *  - qrToken: proves this QR is a genuine, unmodified entry pass
 *
 * CHECKIN_TOKEN_SECRET stays server-side by design — the mobile app relays
 * the scanned string and never verifies it, because a secret shipped in an
 * app bundle can be extracted and used to forge passes.
 *
 * Ported from apps/opus_scanner/src/app/api/checkin/route.ts, extended with
 * partial-party arrival and a token-free manual-override path.
 */
/** Fold typing variations onto the stored form: uppercase, no separators,
 *  and look-alike characters mapped onto the alphabet actually in use. */
function normaliseEntryCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ScanBody
  const { eventId, accessToken, qrToken, invitationId, entryCode, manualReason, doorLabel, attendantName } =
    body

  if (!eventId || !accessToken) {
    return NextResponse.json({ status: 'error', message: 'Malformed request' }, { status: 400 })
  }
  // Exactly one admission path must be supplied. A manual override must carry
  // a reason so the audit trail can always explain a scan-less admission.
  // A scan carries a QR; every scan-less admission (roster pick or typed
  // code) must carry a reason so the audit trail can explain it.
  if (!qrToken && !((invitationId || entryCode) && manualReason)) {
    return NextResponse.json({ status: 'error', message: 'Malformed request' }, { status: 400 })
  }

  const supabase = createSupabaseServerClient()

  const { data: access } = await supabase
    .from('scanner_access_tokens')
    .select('id, revoked_at, expires_at, attendant_name')
    .in('token_hash', candidateScannerAccessHashes(accessToken))
    .eq('event_id', eventId)
    .maybeSingle()
  if (!access || access.revoked_at || new Date(access.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { status: 'error', message: 'Scanner session expired — log in again' },
      { status: 401 }
    )
  }

  // Keyed on the verified door token, not IP — attendants share venue wifi.
  // 120/min comfortably covers a busy door (a scan every couple of seconds);
  // the entry-code path below gets its own much tighter budget because a
  // typed 6-char code is the one credential-shaped thing short enough to
  // enumerate, and manual entry is never faster than a few seconds per try.
  if (!(await withinRateLimit(supabase, `scan:${access.id}`, 120, 60))) {
    return NextResponse.json(RATE_LIMITED_RESPONSE, { status: 429 })
  }
  if (entryCode && !(await withinRateLimit(supabase, `scan-code:${access.id}`, 15, 60))) {
    return NextResponse.json(RATE_LIMITED_RESPONSE, { status: 429 })
  }

  // An admin-assigned code carries its own authoritative name; the device
  // holder cannot override it. The request-body name only applies to couple
  // self-serve codes, where the attendant types their own name at login.
  const effectiveAttendantName = access.attendant_name || attendantName

  // Resolve which invitation is being admitted. For a camera scan this comes
  // from the signed token (never from a client-supplied id); for a manual
  // override the attendant picked it off the roster we issued them.
  let targetInvitationId: string
  if (qrToken) {
    const payload = verifyEntryPassToken(qrToken)
    if (!payload) {
      return NextResponse.json({ status: 'invalid', message: 'Not a valid entry pass' })
    }
    targetInvitationId = payload.invitationId
  } else if (entryCode) {
    // Scoped to this event, which is why a 6-character code is enough: it
    // only has to be unique among one guest list, and it identifies rather
    // than authorises — the door token above is what grants access.
    const { data: byCode } = await supabase
      .from('guest_invitations')
      .select('id')
      .eq('event_id', eventId)
      .eq('entry_code', normaliseEntryCode(entryCode))
      .maybeSingle()
    if (!byCode) {
      return NextResponse.json({ status: 'invalid', message: 'No guest found with that code' })
    }
    targetInvitationId = byCode.id
  } else {
    targetInvitationId = invitationId as string
  }

  // The invitation must belong to THIS event and still be an active
  // "attending" RSVP. This is what stops a pass for another event/couple
  // validating at this door, and is also how revocation works: a guest the
  // couple later moved off "attending" is refused even though their token is
  // still cryptographically valid — no separate revocation table needed.
  const { data: invitation } = await supabase
    .from('guest_invitations')
    .select(
      'id, event_id, guest_contact_id, party_size, entry_allowance, checked_in_count, checked_in_at, checked_in_party_size, rsvp_status'
    )
    .eq('id', targetInvitationId)
    .eq('event_id', eventId)
    .maybeSingle()

  if (!invitation) {
    return NextResponse.json({ status: 'invalid', message: 'This pass is not for this event' })
  }
  if (invitation.rsvp_status !== 'attending') {
    return NextResponse.json({ status: 'invalid', message: 'This guest is no longer marked as attending' })
  }

  const { data: guest } = await supabase
    .from('guest_contacts')
    .select('full_name, group_tag')
    .eq('id', invitation.guest_contact_id)
    .maybeSingle()

  const guestName = guest?.full_name ?? 'Guest'
  const groupTag = guest?.group_tag ?? null
  const isVip = /vip/i.test(groupTag ?? '')
  const displayDoor = doorLabel || 'Main Gate'
  const rsvpdPartySize = invitation.party_size ?? 1

  // The guest's seating table for this event, so the attendant can point them
  // to their seat on arrival. Read-only: the seating itself is arranged on the
  // couple's Seat collection page. Null when the guest isn't seated yet.
  const { data: seatAssignment } = await supabase
    .from('seating_assignments')
    .select('seating_tables(name)')
    .eq('event_id', eventId)
    .eq('guest_contact_id', invitation.guest_contact_id)
    .maybeSingle<{ seating_tables: { name: string } | null }>()
  const tableName = seatAssignment?.seating_tables?.name ?? null

  // The audit trail records who was holding the device and why, while the
  // broadcast/UI door label stays plain so the live feed reads cleanly.
  const auditLabel = [
    effectiveAttendantName || 'Unknown attendant',
    `(${displayDoor})`,
    manualReason ? `(manual: ${manualReason})` : null,
  ]
    .filter(Boolean)
    .join(' ')

  // No pre-emptive duplicate check any more: a party of four that has had two
  // members admitted is a legitimate scan, not a duplicate. Only the RPC can
  // tell "some entries left" from "none left", and only it can do so without
  // a race, so every outcome is decided there.
  const { data: admitRows, error } = await supabase.rpc('checkin_admit_guest', {
    p_guest_invitation_id: targetInvitationId,
    p_event_id: eventId,
    // Null admits the whole remaining allowance, which is the common
    // "everyone in this party walked in together" case. An explicit count
    // over the remainder is rejected outright rather than clamped, so an
    // attendant is told their number was impossible instead of silently
    // getting a different one.
    p_admit_count: typeof body.checkedInPartySize === 'number' ? body.checkedInPartySize : null,
    p_checked_in_by: auditLabel,
    p_checked_in_door: displayDoor,
    p_request_id: body.requestId ?? null,
  })
  if (error) return NextResponse.json({ status: 'error', message: 'Check-in failed' }, { status: 500 })

  const admit = (admitRows as AdmitResult[] | null)?.[0]
  if (!admit) return NextResponse.json({ status: 'error', message: 'Check-in failed' }, { status: 500 })

  // The first delivery of this request id is still running on another
  // connection. Drawing a result now would either double-count or show an
  // outcome that is about to change, so the device is told to retry.
  if (admit.result === 'in_progress') {
    return NextResponse.json(
      { status: 'error', message: 'Still processing that scan — try again' },
      { status: 409 }
    )
  }

  const remaining = Math.max(admit.allowance - admit.total_admitted, 0)

  if (admit.result !== 'admitted') {
    // 'exhausted' is the door-facing duplicate: this pass has no entries
    // left. The other codes are guarded above and only reachable if the
    // roster changed between that read and this call.
    const duplicate = admit.result === 'exhausted'
    if (duplicate) {
      await broadcastCheckin(eventId, {
        status: 'duplicate',
        guestName,
        partySize: admit.total_admitted,
        doorLabel: displayDoor,
        at: admit.first_admitted_at ?? new Date().toISOString(),
      })
    }
    return NextResponse.json({
      status: duplicate ? 'duplicate' : 'invalid',
      message: duplicate ? undefined : 'This guest is no longer marked as attending',
      guestName,
      partySize: rsvpdPartySize,
      checkedInPartySize: admit.total_admitted,
      checkedInAt: admit.first_admitted_at,
      entryAllowance: admit.allowance,
      remainingAllowance: remaining,
      isVip,
      groupTag,
      table: tableName,
    })
  }

  // A replay is reported exactly like the response it is replacing, so a
  // scanner that retried a lost request sees the same card it would have
  // seen the first time.
  await broadcastCheckin(eventId, {
    status: 'success',
    guestName,
    partySize: admit.total_admitted,
    doorLabel: displayDoor,
    at: admit.first_admitted_at ?? new Date().toISOString(),
  })

  return NextResponse.json({
    status: 'success',
    guestName,
    partySize: rsvpdPartySize,
    checkedInPartySize: admit.total_admitted,
    checkedInAt: admit.first_admitted_at,
    admittedNow: admit.admitted_now,
    entryAllowance: admit.allowance,
    remainingAllowance: remaining,
    isReplay: admit.is_replay,
    isVip,
    groupTag,
    table: tableName,
  })
}
