import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { candidateScannerAccessHashes, verifyEntryPassToken } from '@/lib/checkin/tokens'
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
 * Exists as its own route because check-in is deliberately first-scan-wins:
 * checkin_guest_invitation() only updates rows where checked_in_at IS NULL,
 * so a second scan can never silently rewrite an admission. That's the right
 * default for the door, but it leaves no way to fix "RSVP'd 3, only 2 came"
 * once the pass is scanned.
 *
 * Keeping it separate from /scan means a genuine duplicate scan still reads
 * as a duplicate, and every headcount correction is an explicit, intentional
 * action rather than a side effect of re-scanning.
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

  let targetInvitationId: string
  if (qrToken) {
    const payload = verifyEntryPassToken(qrToken)
    if (!payload) return NextResponse.json({ status: 'invalid', message: 'Not a valid entry pass' })
    targetInvitationId = payload.invitationId
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
  await broadcastCheckin(eventId, {
    status: 'success',
    guestName: guest?.full_name ?? 'Guest',
    partySize: amended,
    doorLabel: doorLabel || 'Main Gate',
    // From the RPC, not the row read before the write: a correction to 0 is a
    // full reversal and clears the arrival, so the pre-write value is stale.
    at: amendResult.first_admitted_at ?? new Date().toISOString(),
  })

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
