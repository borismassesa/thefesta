import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { candidateScannerAccessHashes } from '@/lib/checkin/tokens'
import { recordCredentialVerification, verifyAdmissionCredential } from '@/lib/checkin/credentials'
import { legacyCredentialsAllowed } from '@/lib/checkin/credential-core'
import { broadcastCheckin } from '@/lib/checkin/broadcast'
import { RATE_LIMITED_RESPONSE, withinRateLimit } from '@/lib/checkin/rate-limit'
import { normaliseTypedIdentifier, PASS_ID_PATTERN } from '@/lib/checkin/identifiers'
import { acceptsIdentifier, refusalMessage } from '@/lib/checkin/identifier-acceptance'

interface ScanBody {
  eventId?: string
  /** Door-staff bearer code proving this device may scan for this event. */
  accessToken?: string
  /** The scanned QR string. Required unless this is a manual override. */
  qrToken?: string
  /** Manual-override path (guest lost their phone): the attendant picks the
   *  guest from the roster instead of scanning. Requires manualReason. */
  invitationId?: string
  /** Short code printed on the ticket, used when the QR won't scan. Unique
   *  only within one event. */
  entryCode?: string
  /** Globally unique admission identifier, read aloud when the QR won't scan
   *  and the attendant does not know which event the guest belongs to. */
  passId?: string
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

/**
 * One row of checkin_admit_guest()'s result table.
 *
 * Every value here is emitted by the RPC in
 * supabase/migrations/20260802210000_opuspass_admission_counters.sql. Adding a
 * result there without adding it here is silent: the route falls through to
 * whatever its last `else` says, which is how a valid guest once got told they
 * were not attending.
 */
interface AdmitResult {
  result:
    | 'admitted'
    | 'exhausted'
    | 'not_attending'
    | 'wrong_event'
    | 'not_found'
    | 'request_conflict'
    | 'in_progress'
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
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ScanBody
  const { eventId, accessToken, qrToken, invitationId, entryCode, passId, manualReason, doorLabel, attendantName } =
    body

  if (!eventId || !accessToken) {
    return NextResponse.json({ status: 'error', message: 'Malformed request' }, { status: 400 })
  }
  // A scan carries a QR; every scan-less admission (roster pick or typed code)
  // must carry a reason so the audit trail can explain it. A body carrying
  // both is refused rather than silently resolved as a scan, so an attendant
  // who believes they did a manual override never quietly gets one.
  if (!qrToken && !((invitationId || entryCode || passId) && manualReason)) {
    return NextResponse.json({ status: 'error', message: 'Malformed request' }, { status: 400 })
  }
  if (qrToken && (invitationId || entryCode || passId)) {
    return NextResponse.json({ status: 'error', message: 'Malformed request' }, { status: 400 })
  }
  // Exactly one scan-less identifier. Accepting several and picking one would
  // record an admission against a guest the attendant did not choose.
  if ([invitationId, entryCode, passId].filter(Boolean).length > 1) {
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
  // Typed identifiers share ONE budget. Giving pass_id its own would double
  // the enumeration allowance available to a single door token.
  if ((entryCode || passId) && !(await withinRateLimit(supabase, `scan-code:${access.id}`, 15, 60))) {
    return NextResponse.json(RATE_LIMITED_RESPONSE, { status: 429 })
  }

  // An admin-assigned code carries its own authoritative name; the device
  // holder cannot override it. The request-body name only applies to couple
  // self-serve codes, where the attendant types their own name at login.
  const effectiveAttendantName = access.attendant_name || attendantName

  // Resolve which invitation is being admitted. For a camera scan this comes
  // from the verified credential (never from a client-supplied id, which is
  // why `invitationId` below is only honoured on the manual path); for a
  // manual override the attendant picked it off the roster we issued them.
  let targetInvitationId: string
  let credentialId: string | null = null
  let credentialFormat: 'opaque_v1' | 'legacy_hmac' | null = null
  // Stated rather than inferred, so the response and the audit trail agree on
  // HOW this guest was identified. A caller should never have to reconstruct
  // that from which fields happened to be present.
  let identifierType: 'credential' | 'legacy_entry_code' | 'pass_id' | 'roster_pick'

  // Read once and reuse. The legacy-credential branch below already fetches
  // this row for its own window check; sharing one read keeps the gating from
  // adding a query per identifier type.
  let acceptanceRow: Awaited<ReturnType<typeof loadAcceptanceRow>> | undefined
  async function loadAcceptanceRow() {
    const { data } = await supabase
      .from('wedding_events')
      .select('starts_at, ends_at, created_at, accepts_credential, accepts_entry_code, accepts_pass_id')
      .eq('id', eventId)
      .maybeSingle()
    return data
  }
  async function eventAccepts(kind: 'credential' | 'legacy_entry_code' | 'pass_id') {
    if (acceptanceRow === undefined) acceptanceRow = await loadAcceptanceRow()
    return acceptanceRow ? acceptsIdentifier(acceptanceRow, kind) : false
  }

  if (qrToken) {
    const verification = await verifyAdmissionCredential(qrToken, {
      // Anchored to the event this scanner is authorised for, so a stale
      // ticket cannot reach a more permissive window via its own event.
      legacyAllowed: async () => {
        const { data: ev } = await supabase
          .from('wedding_events')
          .select('starts_at, ends_at')
          .eq('id', eventId)
          .maybeSingle<{ starts_at: string | null; ends_at: string | null }>()
        return ev ? legacyCredentialsAllowed(ev) : false
      },
    })

    if (!verification.valid) {
      await recordCredentialVerification({
        eventId,
        verification,
        verificationResult: verification.reason,
        scannerAccessTokenId: access.id,
        requestId: body.requestId ?? null,
      })
      // One message for every failure mode. Telling the door apart "revoked"
      // from "never issued" would let anyone holding a scanner code probe the
      // credential space for valid values.
      return NextResponse.json({ status: 'invalid', message: 'Not a valid entry pass' })
    }

    targetInvitationId = verification.invitationId
    identifierType = 'credential'
    credentialFormat = verification.format
    credentialId = verification.format === 'opaque_v1' ? verification.credentialId : null

    await recordCredentialVerification({
      eventId,
      verification,
      verificationResult: 'verified',
      scannerAccessTokenId: access.id,
      requestId: body.requestId ?? null,
    })
  } else if (entryCode) {
    if (!(await eventAccepts('legacy_entry_code'))) {
      return NextResponse.json({ status: 'invalid', message: refusalMessage('legacy_entry_code') })
    }
    // Scoped to this event, which is why a 6-character code is enough: it
    // only has to be unique among one guest list, and it identifies rather
    // than authorises — the door token above is what grants access.
    const { data: byCode } = await supabase
      .from('guest_invitations')
      .select('id')
      .eq('event_id', eventId)
      .eq('entry_code', normaliseTypedIdentifier(entryCode))
      .maybeSingle()
    if (!byCode) {
      return NextResponse.json({ status: 'invalid', message: 'No guest found with that code' })
    }
    targetInvitationId = byCode.id
    identifierType = 'legacy_entry_code'
  } else if (passId) {
    if (!(await eventAccepts('pass_id'))) {
      return NextResponse.json({ status: 'invalid', message: refusalMessage('pass_id') })
    }
    // Globally unique, so it resolves without the event — but still filtered
    // to THIS event, so a scanner authorised for one event cannot read
    // another event's roster by trying identifiers.
    const folded = normaliseTypedIdentifier(passId)
    if (!PASS_ID_PATTERN.test(folded)) {
      return NextResponse.json({ status: 'invalid', message: 'No guest found with that Pass ID' })
    }
    const { data: byPassId } = await supabase
      .from('guest_invitations')
      .select('id')
      .eq('event_id', eventId)
      .eq('pass_id', folded)
      .maybeSingle()
    if (!byPassId) {
      return NextResponse.json({ status: 'invalid', message: 'No guest found with that Pass ID' })
    }
    targetInvitationId = byPassId.id
    identifierType = 'pass_id'
  } else {
    targetInvitationId = invitationId as string
    identifierType = 'roster_pick'
  }

  // The invitation must belong to THIS event. That is what stops a pass for
  // another event/couple validating at this door.
  //
  // It no longer has to be an "attending" RSVP. Being invited is enough, and
  // the RSVP status is not read here at all — see the refusal removed below.
  const { data: invitation, error: invitationError } = await supabase
    .from('guest_invitations')
    .select('id, event_id, guest_contact_id, party_size, rsvp_status')
    .eq('id', targetInvitationId)
    .eq('event_id', eventId)
    .maybeSingle()

  // A transient query failure also yields a null row. Reporting that as "not
  // for this event" turns a database blip into a definitive-sounding refusal
  // of a legitimate guest, so the two are answered differently.
  if (invitationError) {
    console.error('[checkin] invitation lookup failed', {
      eventId,
      invitationId: targetInvitationId,
      code: invitationError.code,
      message: invitationError.message,
    })
    return NextResponse.json(
      { status: 'error', message: "Couldn't verify this pass — try again" },
      { status: 503 }
    )
  }

  if (!invitation) {
    return NextResponse.json({ status: 'invalid', message: 'This pass is not for this event' })
  }
  // No RSVP check here on purpose. It used to refuse anyone not marked
  // 'attending', which turned away the guests who were handed a pass by hand
  // because WhatsApp would not deliver, and everyone who simply never replied.
  // checkin_admit_guest() now decides admission on its own, and the allowance
  // bound inside it is what keeps the headcount honest.
  //
  // TRADE-OFF, deliberate: moving a guest off 'attending' was also how a pass
  // got revoked, and it no longer does that. Revoking a specific guest needs
  // its own mechanism; until then, a guest the couple removed from the RSVP
  // tracker can still be admitted.

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
    `[${identifierType}]`,
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
    // over the remainder is rejected outright rather than clamped. Note the
    // RPC reports that as 'exhausted', which reads at the door as a duplicate:
    // it does NOT currently say "that number was impossible".
    p_admit_count: typeof body.checkedInPartySize === 'number' ? body.checkedInPartySize : null,
    p_checked_in_by: auditLabel,
    p_checked_in_door: displayDoor,
    p_request_id: body.requestId ?? null,
  })
  if (error) {
    // The Postgres error is the only thing that distinguishes a constraint
    // breach from an exhausted connection pool at 11pm during an event.
    console.error('[checkin] admit RPC failed', {
      eventId,
      invitationId: targetInvitationId,
      requestId: body.requestId,
      code: error.code,
      message: error.message,
    })
    return NextResponse.json({ status: 'error', message: 'Check-in failed' }, { status: 500 })
  }

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

  // The scan id was already claimed against a DIFFERENT guest, so nothing was
  // admitted and nothing was replayed. This says nothing about the guest in
  // front of the attendant, and must not be reported as though it did: the
  // pass may be perfectly valid and the right answer is simply to scan again.
  if (admit.result === 'request_conflict') {
    return NextResponse.json(
      { status: 'error', message: 'That scan was already used for another guest — scan again' },
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
      identifierType,
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

  // Tag the admission ledger with the credential that opened the door. Done
  // as its own write rather than through the admission RPC so PR 1's
  // counter contract stays exactly as reviewed. Best-effort: a missing tag
  // must never undo an admission that already happened.
  if (body.requestId && credentialFormat) {
    const { error: tagError } = await supabase
      .from('checkin_scan_events')
      .update({ credential_id: credentialId, credential_format: credentialFormat })
      .eq('request_id', body.requestId)
    if (tagError) console.error('[checkin] could not tag scan with credential', { code: tagError.code })
  }

  // A replay is reported exactly like the response it is replacing, so a
  // scanner that retried a lost request sees the same card it would have
  // seen the first time.
  // Not on a replay: the arrival was already announced by the delivery that
  // actually admitted them, and the couple's live feed would otherwise show
  // the same guest walking in once per retry.
  if (!admit.is_replay) {
    await broadcastCheckin(eventId, {
      status: 'success',
      guestName,
      partySize: admit.total_admitted,
      doorLabel: displayDoor,
      at: admit.first_admitted_at ?? new Date().toISOString(),
    })
  }

  return NextResponse.json({
    status: 'success',
    identifierType,
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
