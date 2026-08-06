import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { candidateScannerAccessHashes } from '@/lib/checkin/tokens'
import { RATE_LIMITED_RESPONSE, withinRateLimit } from '@/lib/checkin/rate-limit'
import { normaliseTypedIdentifier, PASS_ID_PATTERN } from '@/lib/checkin/identifiers'
import { acceptsIdentifier, refusalMessage } from '@/lib/checkin/identifier-acceptance'

/**
 * Look up one admission WITHOUT admitting anyone.
 *
 * /api/checkin/scan resolves and admits in a single call, which is right for a
 * camera scan — the attendant has already decided. It is wrong for the case
 * this route exists for: a guest whose QR will not scan reads out their Pass
 * ID, the attendant needs to SEE the record (right guest? right event? already
 * arrived? how many of the party are left?) and only then decide.
 *
 * Folding that into /scan would mean either admitting before the attendant has
 * looked, or adding a "don't actually admit" flag to the admission endpoint —
 * and a flag that suppresses the write is one typo away from an accidental
 * admission. Two endpoints, one of which cannot write, is the safer shape.
 *
 * This route writes NOTHING. No admission, no ledger row, no credential
 * verification record. Admission remains a distinct second call to /scan,
 * which still requires a manualReason for any scan-less entry, so an
 * attendant who looks a guest up never quietly admits them.
 *
 * Credentials (QR tokens) are deliberately NOT accepted here. Verifying one
 * has audit side-effects (recordCredentialVerification), which would make
 * "this route writes nothing" untrue. A scanned QR goes to /scan; this is for
 * identifiers a human types or reads aloud.
 */

interface LookupBody {
  eventId?: string
  /** Door-staff bearer code proving this device may look up for this event. */
  accessToken?: string
  /** Globally unique 8-character admission identifier. */
  passId?: string
  /** Legacy 6-character code, unique only within one event. */
  entryCode?: string
}

/** Which identifier resolved the record. Explicit so the caller never has to
 *  infer it, and so the scanner UI can say what it matched on. */
export type LookupIdentifierType = 'pass_id' | 'legacy_entry_code'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as LookupBody
  const { eventId, accessToken, passId, entryCode } = body

  if (!eventId || !accessToken) {
    return NextResponse.json({ status: 'error', message: 'Malformed request' }, { status: 400 })
  }
  // Exactly one identifier. Accepting both and picking one silently would mean
  // the attendant cannot tell which value actually matched.
  if (!passId === !entryCode) {
    return NextResponse.json(
      { status: 'error', message: 'Provide exactly one of passId or entryCode' },
      { status: 400 },
    )
  }

  const supabase = createSupabaseServerClient()

  const { data: access } = await supabase
    .from('scanner_access_tokens')
    .select('id, revoked_at, expires_at')
    .in('token_hash', candidateScannerAccessHashes(accessToken))
    .eq('event_id', eventId)
    .maybeSingle()
  if (!access || access.revoked_at || new Date(access.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { status: 'error', message: 'Scanner session expired — log in again' },
      { status: 401 },
    )
  }

  // Its own budget, keyed on the verified door token rather than IP, because
  // attendants share venue wifi. Tighter than /scan's 120/min: a typed
  // identifier is the enumerable surface, and looking a guest up is a
  // deliberate act that is never faster than a few seconds. Deliberately the
  // same 15/min the typed-code path on /scan already uses, so moving a lookup
  // here does not hand anyone a larger budget than they had before.
  if (!(await withinRateLimit(supabase, `lookup:${access.id}`, 15, 60))) {
    return NextResponse.json(RATE_LIMITED_RESPONSE, { status: 429 })
  }

  const identifierType: LookupIdentifierType = passId ? 'pass_id' : 'legacy_entry_code'
  const typed = normaliseTypedIdentifier(passId ?? entryCode ?? '')

  // Does this event's door still take this kind of identifier? Checked before
  // the query, so a retired entry code cannot even be used to confirm that a
  // guest exists. The refusal is worded identically to "not found" on purpose.
  const { data: eventRow } = await supabase
    .from('wedding_events')
    .select('starts_at, ends_at, created_at, accepts_credential, accepts_entry_code, accepts_pass_id')
    .eq('id', eventId)
    .maybeSingle()
  if (!eventRow || !acceptsIdentifier(eventRow, identifierType)) {
    return NextResponse.json({ status: 'not_found', message: refusalMessage(identifierType) })
  }

  // Reject a malformed Pass ID before querying. Saves a round trip, and stops
  // a stray paste of a whole QR token being sent to the database as a filter.
  if (identifierType === 'pass_id' && !PASS_ID_PATTERN.test(typed)) {
    return NextResponse.json({ status: 'not_found', message: 'No guest found with that Pass ID' })
  }

  // A Pass ID is globally unique, so it does not need the event to resolve —
  // but it is still constrained to THIS event, because a scanner authorised
  // for one event must not be able to read another event's roster by trying
  // identifiers. Same rule the admission path applies.
  const query = supabase
    .from('guest_invitations')
    .select('id, event_id, guest_contact_id, party_size, rsvp_status, checked_in_at, checked_in_party_size, pass_id, entry_code')
    .eq('event_id', eventId)
  const { data: invitation, error } = await (identifierType === 'pass_id'
    ? query.eq('pass_id', typed)
    : query.eq('entry_code', typed)
  ).maybeSingle()

  // A transient failure also yields a null row. Reporting that as "not found"
  // turns a database blip into a definitive-sounding refusal of a real guest.
  if (error) {
    console.error('[checkin] lookup failed', {
      eventId,
      identifierType,
      code: error.code,
      message: error.message,
    })
    return NextResponse.json(
      { status: 'error', message: "Couldn't look that up — try again" },
      { status: 503 },
    )
  }

  if (!invitation) {
    return NextResponse.json({
      status: 'not_found',
      message:
        identifierType === 'pass_id'
          ? 'No guest found with that Pass ID'
          : 'No guest found with that code',
    })
  }

  const { data: guest } = await supabase
    .from('guest_contacts')
    .select('full_name, group_tag, phone, whatsapp_phone')
    .eq('id', invitation.guest_contact_id)
    .maybeSingle()

  const { data: seatAssignment } = await supabase
    .from('seating_assignments')
    .select('seating_tables(name)')
    .eq('event_id', eventId)
    .eq('guest_contact_id', invitation.guest_contact_id)
    .maybeSingle<{ seating_tables: { name: string } | null }>()

  const groupTag = guest?.group_tag ?? null
  const rsvpdPartySize = invitation.party_size ?? 1
  const alreadyIn = invitation.checked_in_party_size ?? 0

  // Everything the attendant needs to decide, and nothing more: no email, no
  // address. The phone number is the one contact detail that IS a door
  // decision — a manual admission has no scanned pass behind it, so when two
  // guests share a name the number on the invitation is what separates them.
  //
  // This route is the ONLY one that returns it, and that is the boundary
  // worth keeping: /validate reads the roster in bulk, this reads one guest
  // the attendant has already resolved, /scan admits. Putting the number here
  // means a device holds one guest's number at a time, for as long as that
  // card is open, rather than the whole guest list's for the whole shift.
  // Anything personal added to the roster route instead would undo that, so
  // it belongs here even when the roster is the more convenient place.
  return NextResponse.json({
    status: 'found',
    identifierType,
    invitationId: invitation.id,
    passId: invitation.pass_id,
    entryCode: invitation.entry_code,
    guestName: guest?.full_name ?? 'Guest',
    guestPhone: guest?.whatsapp_phone?.trim() || guest?.phone?.trim() || null,
    groupTag,
    isVip: /vip/i.test(groupTag ?? ''),
    tableName: seatAssignment?.seating_tables?.name ?? null,
    rsvpStatus: invitation.rsvp_status,
    /** False when the guest is no longer attending — /scan would refuse them. */
    admissible: invitation.rsvp_status === 'attending',
    rsvpdPartySize,
    alreadyAdmitted: alreadyIn,
    remainingAllowance: Math.max(0, rsvpdPartySize - alreadyIn),
    firstCheckedInAt: invitation.checked_in_at,
  })
}
