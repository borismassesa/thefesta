import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { candidateScannerAccessHashes } from '@/lib/checkin/tokens'
import { recordCredentialVerification, verifyAdmissionCredential } from '@/lib/checkin/credentials'
import { legacyCredentialsAllowed } from '@/lib/checkin/credential-core'
import { broadcastCheckin } from '@/lib/checkin/broadcast'
import { RATE_LIMITED_RESPONSE, withinRateLimit } from '@/lib/checkin/rate-limit'

interface AmendBody {
  eventId?: string
  accessToken?: string
  /** Identify the guest the same two ways a scan can. */
  qrToken?: string
  invitationId?: string
  /** The corrected number of people who actually arrived. 0 fully reverses
   *  the check-in. */
  checkedInPartySize?: number
  /** Why the headcount was corrected. Recorded in the audit ledger. */
  reason?: string
  /** Stable id for one correction, reused across its retries. */
  requestId?: string
  doorLabel?: string
}

/** One row of amend_guest_invitation_checkin()'s result table. */
interface AmendResult {
  result: 'amended' | 'not_found' | 'wrong_event' | 'invalid_count' | 'not_checked_in' | 'request_conflict' | 'in_progress'
  is_replay: boolean
  total_admitted: number
  allowance: number
  first_admitted_at: string | null
  rsvp_party_size: number
}

/**
 * Corrects how many of an already-admitted party actually arrived.
 *
 * Exists as its own route because a re-scan can only ever admit MORE of a
 * party: checkin_admit_guest() adds to the counter and refuses once the
 * allowance is spent, so it can never bring a headcount down. Correcting
 * "RSVP'd 3, only 2 came" needs the one path allowed to lower the counter.
 *
 * Keeping it separate from /scan also means every reduction is an explicit,
 * intentional act carrying a reason, rather than a side effect of re-scanning.
 */
export async function POST(request: Request) {
  const { eventId, accessToken, qrToken, invitationId, checkedInPartySize, reason, requestId, doorLabel } =
    (await request.json().catch(() => ({}))) as AmendBody

  if (!eventId || !accessToken || typeof checkedInPartySize !== 'number') {
    return NextResponse.json({ status: 'error', message: 'Malformed request' }, { status: 400 })
  }
  if (!qrToken && !invitationId) {
    return NextResponse.json({ status: 'error', message: 'Malformed request' }, { status: 400 })
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
      { status: 401 }
    )
  }

  // Corrections are rare, deliberate actions — a tight per-token cap costs
  // legitimate use nothing.
  if (!(await withinRateLimit(supabase, `amend:${access.id}`, 30, 60))) {
    return NextResponse.json(RATE_LIMITED_RESPONSE, { status: 429 })
  }

  // Same verifier as /scan: a correction identifies the guest by exactly the
  // credentials an admission does, so the two must not drift apart.
  let targetInvitationId: string
  if (qrToken) {
    const verification = await verifyAdmissionCredential(qrToken, {
      legacyAllowed: async () => {
        const { data: ev } = await supabase
          .from('wedding_events')
          .select('starts_at, ends_at')
          .eq('id', eventId)
          .maybeSingle<{ starts_at: string | null; ends_at: string | null }>()
        return ev ? legacyCredentialsAllowed(ev) : false
      },
    })

    await recordCredentialVerification({
      eventId,
      verification,
      verificationResult: verification.valid ? 'verified' : verification.reason,
      scannerAccessTokenId: access.id,
      requestId: requestId ?? null,
    })

    if (!verification.valid) {
      return NextResponse.json({ status: 'invalid', message: 'Not a valid entry pass' })
    }
    targetInvitationId = verification.invitationId
  } else {
    targetInvitationId = invitationId as string
  }

  const { data: invitation } = await supabase
    .from('guest_invitations')
    .select('id, event_id, guest_contact_id, party_size, entry_allowance, checked_in_at')
    .eq('id', targetInvitationId)
    .eq('event_id', eventId)
    .maybeSingle()

  if (!invitation) {
    return NextResponse.json({ status: 'invalid', message: 'This pass is not for this event' })
  }

  // The correction goes through the one RPC allowed to lower the counter. It
  // writes checked_in_count and its deprecated mirror together, enforces the
  // allowance and the event binding, and records the reason. Updating the two
  // columns from here would put a second source of truth in the same row.
  const { data: amendRows, error } = await supabase.rpc('amend_guest_invitation_checkin', {
    p_guest_invitation_id: targetInvitationId,
    p_event_id: eventId,
    p_new_count: checkedInPartySize,
    // The DB requires a reason for every hand-corrected headcount. The
    // attendant's own words when they gave them, otherwise what this endpoint
    // exists to do.
    p_reason: reason?.trim() || 'Attendant corrected the arrival headcount at the door',
    p_amended_by: doorLabel || 'Main Gate',
    p_request_id: requestId ?? null,
  })
  if (error) {
    // Without this the on-call engineer gets a 500 and a five-word string.
    // A constraint breach and a dead connection pool look identical otherwise.
    console.error('[checkin] amend RPC failed', {
      eventId,
      invitationId: targetInvitationId,
      requestId,
      code: error.code,
      message: error.message,
    })
    return NextResponse.json({ status: 'error', message: 'Could not update headcount' }, { status: 500 })
  }

  const amendResult = (amendRows as AmendResult[] | null)?.[0]
  if (!amendResult) {
    return NextResponse.json({ status: 'error', message: 'Could not update headcount' }, { status: 500 })
  }

  if (amendResult.result === 'in_progress') {
    return NextResponse.json(
      { status: 'error', message: 'Still processing that correction — try again' },
      { status: 409 }
    )
  }
  if (amendResult.result !== 'amended') {
    // A conflict says nothing about the pass: the request id was claimed
    // against a different guest, so nothing was amended and nothing replayed.
    // Reporting it as a wrong-event pass would be a false statement about a
    // guest standing at the door.
    if (amendResult.result === 'request_conflict') {
      return NextResponse.json(
        { status: 'error', message: 'That correction id was already used for another guest — try again' },
        { status: 409 }
      )
    }
    const message =
      amendResult.result === 'not_checked_in'
        ? 'This guest has not been checked in yet'
        : amendResult.result === 'invalid_count'
          ? `Enter a number between 0 and ${amendResult.allowance}`
          : 'This pass is not for this event'
    return NextResponse.json({ status: 'invalid', message })
  }

  const rsvpd = invitation.party_size ?? 1
  const amended = amendResult.total_admitted

  const { data: guest } = await supabase
    .from('guest_contacts')
    .select('full_name, group_tag')
    .eq('id', invitation.guest_contact_id)
    .maybeSingle()

  const groupTag = guest?.group_tag ?? null
  const isVip = /vip/i.test(groupTag ?? '')

  // Keep the guest's table on the corrected result so the scan card stays
  // whole after a headcount fix (same read-only seating lookup as /scan).
  const { data: seatAssignment } = await supabase
    .from('seating_assignments')
    .select('seating_tables(name)')
    .eq('event_id', eventId)
    .eq('guest_contact_id', invitation.guest_contact_id)
    .maybeSingle<{ seating_tables: { name: string } | null }>()
  const tableName = seatAssignment?.seating_tables?.name ?? null

  // Re-broadcast so live dashboards converge on the corrected number rather
  // than keeping the optimistic full-party figure from the original scan.
  //
  // Skipped entirely for a full reversal: the admin console increments its
  // arrivals counter on every 'success', so broadcasting one here would add an
  // arrival for the guest this correction just recorded as never having come.
  if (amended > 0) {
    await broadcastCheckin(eventId, {
      status: 'success',
      guestName: guest?.full_name ?? 'Guest',
      partySize: amended,
      doorLabel: doorLabel || 'Main Gate',
    // From the RPC, not the row read before the write: a correction to 0 is a
    // full reversal and clears the arrival, so the pre-write value is stale.
      at: amendResult.first_admitted_at ?? new Date().toISOString(),
    })
  }

  return NextResponse.json({
    status: 'success',
    guestName: guest?.full_name ?? 'Guest',
    partySize: rsvpd,
    checkedInPartySize: amended,
    checkedInAt: amendResult.first_admitted_at,
    entryAllowance: amendResult.allowance,
    remainingAllowance: Math.max(amendResult.allowance - amended, 0),
    isReplay: amendResult.is_replay,
    isVip,
    groupTag,
    table: tableName,
  })
}
