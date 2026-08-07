import 'server-only'
import { createDashboardClient } from '@/lib/dashboard/supabase'
import {
  CHECKIN_REPORT_MODEL_VERSION,
  attendantNameFrom,
  bucketAdmissions,
  guestStatusFor,
  rateOf,
  type AdmissionMode,
  type CheckinReportGuest,
  type CheckinReportModel,
  type FinalizationStatus,
  type ResolutionMethod,
  type SeatAdmission,
} from './report-model-core'

/**
 * The one place the check-in facts are assembled.
 *
 * Operations and Audit render from this live. The Client report does NOT: it
 * renders from a snapshot of this output taken at finalization, because live
 * tables keep moving (invitations get edited, seats reassigned, and Meta posts
 * delivery receipts for days) and a permanent record cannot depend on them
 * still agreeing a year later.
 *
 * Caller MUST have verified `eventId` belongs to `userId`. Every query is
 * scoped by both as a backstop, not as the authorization check.
 *
 * PRE-MIGRATION SAFE. The lifecycle columns, the structured admission columns
 * and the snapshots table may not exist yet, so anything that depends on them
 * is read through `select('*')` or a tolerated query failure and degrades to
 * "not recorded" rather than throwing. `integrity.manualAdmissions` is null in
 * that state, never 0 — the distinction the templates render.
 */

/** Rows come back with whatever columns the database currently has. */
type Row = Record<string, unknown>

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export async function buildCheckinReportModel(
  userId: string,
  eventId: string,
): Promise<CheckinReportModel | null> {
  const supabase = createDashboardClient()

  // select('*') rather than a column list: the lifecycle columns land in a
  // migration that may not be applied yet, and a named select would 400 on a
  // column that does not exist. Absent keys read as undefined.
  const { data: eventRow } = await supabase
    .from('wedding_events')
    .select('*')
    .eq('id', eventId)
    .eq('user_id', userId)
    .maybeSingle<Row>()
  if (!eventRow) return null

  const [invitationsRes, ledgerRes, deliveryRes, snapshotRes] = await Promise.all([
    supabase
      .from('guest_invitations')
      .select(
        'id, guest_contact_id, rsvp_status, party_size, entry_allowance, checked_in_count, checked_in_at, checked_in_by, checked_in_door, pass_id',
      )
      .eq('user_id', userId)
      .eq('event_id', eventId)
      .eq('rsvp_status', 'attending'),
    supabase.from('checkin_scan_events').select('*').eq('event_id', eventId),
    supabase
      .from('whatsapp_messages')
      .select('guest_contact_id, status, error, created_at')
      .eq('user_id', userId)
      .eq('event_id', eventId)
      .eq('direction', 'out')
      .eq('kind', 'invite')
      .not('guest_contact_id', 'is', null)
      .order('created_at', { ascending: true }),
    // Tolerated failure: the snapshots table arrives with the lifecycle
    // migration. Absent means "no report has been finalized", which is the
    // correct reading either way.
    supabase
      .from('checkin_report_snapshots')
      .select('id, version, superseded_at')
      .eq('event_id', eventId)
      .eq('report_type', 'client_final')
      .is('superseded_at', null)
      .maybeSingle<{ id: string; version: number }>(),
  ])

  const invitations = (invitationsRes.data ?? []) as Row[]
  const ledger = (ledgerRes.data ?? []) as Row[]

  // ── Guests ────────────────────────────────────────────────────────────────
  const guestIds = invitations.map((i) => String(i.guest_contact_id))

  const [contactsRes, seatingRes] = await Promise.all([
    guestIds.length
      ? supabase
          .from('guest_contacts')
          .select('id, full_name, review_status')
          .eq('user_id', userId)
          .in('id', guestIds)
      : Promise.resolve({ data: [] as Row[] }),
    guestIds.length
      ? supabase
          .from('seating_assignments')
          .select('guest_contact_id, seating_tables(name)')
          .eq('user_id', userId)
          .eq('event_id', eventId)
      : Promise.resolve({ data: [] as Row[] }),
  ])

  const contactById = new Map<string, Row>()
  for (const c of (contactsRes.data ?? []) as Row[]) contactById.set(String(c.id), c)

  const tableByGuest = new Map<string, string>()
  for (const a of (seatingRes.data ?? []) as Row[]) {
    const name = (a.seating_tables as { name?: string } | null)?.name
    if (name) tableByGuest.set(String(a.guest_contact_id), name)
  }

  // The ledger's first successful admission per invitation carries the
  // structured attribution. guest_invitations.checked_in_* is frozen to the
  // first entry and cannot describe a party admitted across two doors.
  const firstAdmitByInvitation = new Map<string, Row>()
  for (const e of ledger) {
    if (e.result !== 'admitted') continue
    const key = String(e.guest_invitation_id)
    const prior = firstAdmitByInvitation.get(key)
    if (!prior || String(e.created_at) < String(prior.created_at)) {
      firstAdmitByInvitation.set(key, e)
    }
  }

  const guests: CheckinReportGuest[] = []
  let confirmedSeats = 0
  let admittedSeats = 0
  let admittedInvitations = 0
  let singleInvitations = 0
  let doubleInvitations = 0
  let partiallyAdmittedInvitations = 0

  for (const inv of invitations) {
    const contact = contactById.get(String(inv.guest_contact_id))
    // A public self-RSVP awaiting review is not yet a guest. The dashboard
    // roster excludes these, so the report must too or the two disagree on the
    // guest count.
    if (!contact || contact.review_status === 'unconfirmed') continue

    const entryAllowance = Math.max(num(inv.entry_allowance) || num(inv.party_size) || 1, 1)
    const seats = num(inv.checked_in_count)
    const status = guestStatusFor(seats, entryAllowance)
    const admission = firstAdmitByInvitation.get(String(inv.id))

    confirmedSeats += entryAllowance
    admittedSeats += seats
    if (seats > 0) admittedInvitations += 1
    if (status === 'partial') partiallyAdmittedInvitations += 1
    if (entryAllowance >= 2) doubleInvitations += 1
    else singleInvitations += 1

    guests.push({
      invitationId: String(inv.id),
      name: str(contact.full_name) ?? 'Guest',
      passId: str(inv.pass_id),
      entryAllowance,
      admittedSeats: seats,
      status,
      firstAdmittedAt: str(inv.checked_in_at),
      door: seats > 0 ? str(inv.checked_in_door) : null,
      tableName: tableByGuest.get(String(inv.guest_contact_id)) ?? null,
      // Prefer the column; fall back to parsing the audit label for rows
      // written before it existed.
      attendantName:
        seats > 0
          ? str(admission?.attendant_name) ?? attendantNameFrom(str(inv.checked_in_by))
          : null,
      resolutionMethod: (str(admission?.resolution_method) as ResolutionMethod | null) ?? null,
      admissionMode: (str(admission?.admission_mode) as AdmissionMode | null) ?? null,
      manualReason: str(admission?.manual_reason),
    })
  }

  guests.sort((a, b) => a.name.localeCompare(b.name))

  // ── Arrivals, doors, staff ────────────────────────────────────────────────
  const admissions = ledger.filter((e) => e.result === 'admitted' && num(e.admitted_count) > 0)

  const seatAdmissions: SeatAdmission[] = admissions.map((e) => ({
    at: String(e.created_at),
    seats: num(e.admitted_count),
  }))
  const { buckets, bucketMinutes, peak } = bucketAdmissions(seatAdmissions)

  const admissionTimes = admissions.map((e) => String(e.created_at)).sort()

  const doorTotals = new Map<string, { admittedSeats: number; invitations: Set<string> }>()
  const staffTotals = new Map<string, { doors: Set<string>; admittedSeats: number }>()
  for (const e of admissions) {
    const door = str(e.checked_in_door) ?? 'Unrecorded'
    const doorEntry = doorTotals.get(door) ?? { admittedSeats: 0, invitations: new Set<string>() }
    doorEntry.admittedSeats += num(e.admitted_count)
    doorEntry.invitations.add(String(e.guest_invitation_id))
    doorTotals.set(door, doorEntry)

    const person = str(e.attendant_name) ?? attendantNameFrom(str(e.checked_in_by))
    if (person) {
      const staffEntry = staffTotals.get(person) ?? { doors: new Set<string>(), admittedSeats: 0 }
      staffEntry.doors.add(door)
      staffEntry.admittedSeats += num(e.admitted_count)
      staffTotals.set(person, staffEntry)
    }
  }

  // ── Integrity ─────────────────────────────────────────────────────────────
  // manualAdmissions is null, not 0, until the column exists anywhere in the
  // ledger: "we did not record this" and "it never happened" are different
  // claims and the templates render them differently.
  const hasAdmissionMode = ledger.some((e) => e.admission_mode !== undefined)
  const manualAdmissions = hasAdmissionMode
    ? ledger.filter((e) => e.admission_mode === 'manual' && e.result === 'admitted').length
    : null

  // ── Delivery ──────────────────────────────────────────────────────────────
  // Newest row per guest wins: a re-send that succeeded must replace an earlier
  // failure, or a fixed guest shows the old error forever.
  const deliveryByGuest = new Map<string, { state: string; error: string | null }>()
  for (const row of (deliveryRes.data ?? []) as Row[]) {
    const raw = str(row.status)
    const state =
      raw === 'failed' ? 'failed' : raw === 'read' ? 'read' : raw === 'delivered' ? 'delivered' : 'pending'
    deliveryByGuest.set(String(row.guest_contact_id), { state, error: str(row.error) })
  }

  let confirmed = 0
  let read = 0
  let failed = 0
  let noReceipt = 0
  const failureCounts = new Map<string, number>()
  for (const { state, error } of deliveryByGuest.values()) {
    if (state === 'read') {
      read += 1
      confirmed += 1
    } else if (state === 'delivered') {
      confirmed += 1
    } else if (state === 'failed') {
      failed += 1
      const reason = error?.replace(/^\d{6}:\s*/, '') ?? 'Delivery failed'
      failureCounts.set(reason, (failureCounts.get(reason) ?? 0) + 1)
    } else {
      // Accepted by Meta and nothing heard since. Genuinely unknown, so it is
      // never folded into either success or failure.
      noReceipt += 1
    }
  }
  const attempted = deliveryByGuest.size

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  const checkinClosedAt = str(eventRow.checkin_closed_at)
  const finalizedAt = str(eventRow.report_finalized_at)
  const snapshot = snapshotRes.data ?? null
  // FINAL means a valid ACTIVE snapshot exists, not merely that a timestamp is
  // set. If those disagree the report is not final, and the caller surfaces a
  // data-integrity error rather than regenerating from live tables.
  const status: FinalizationStatus =
    finalizedAt && snapshot ? 'final' : checkinClosedAt ? 'closed' : 'live'

  const confirmedInvitations = guests.length

  return {
    modelVersion: CHECKIN_REPORT_MODEL_VERSION,
    event: {
      id: String(eventRow.id),
      name: str(eventRow.name) ?? 'Event',
      partner1Name: str(eventRow.partner1_name),
      partner2Name: str(eventRow.partner2_name),
      eventType: str(eventRow.event_type),
      startsAt: str(eventRow.starts_at),
      endsAt: str(eventRow.ends_at),
      venueName: str(eventRow.venue_name),
      city: str(eventRow.city),
    },
    finalization: {
      status,
      snapshotId: snapshot?.id ?? null,
      version: snapshot?.version ?? null,
      checkinClosedAt,
      checkinClosedBy: str(eventRow.checkin_closed_by),
      finalizedAt,
      finalizedBy: str(eventRow.report_finalized_by),
    },
    counts: {
      confirmedInvitations,
      confirmedSeats,
      admittedInvitations,
      admittedSeats,
      singleInvitations,
      doubleInvitations,
      partiallyAdmittedInvitations,
      noShowInvitations: confirmedInvitations - admittedInvitations,
    },
    rates: {
      seatAttendance: rateOf(admittedSeats, confirmedSeats),
      invitationAttendance: rateOf(admittedInvitations, confirmedInvitations),
      confirmedDelivery: rateOf(confirmed, attempted),
    },
    arrivals: {
      firstAdmittedAt: admissionTimes[0] ?? null,
      lastAdmittedAt: admissionTimes[admissionTimes.length - 1] ?? null,
      buckets,
      bucketMinutes,
      peak,
    },
    doors: [...doorTotals.entries()]
      .map(([label, v]) => ({
        label,
        admittedSeats: v.admittedSeats,
        admittedInvitations: v.invitations.size,
      }))
      .sort((a, b) => b.admittedSeats - a.admittedSeats),
    integrity: {
      exhaustedAttempts: ledger.filter((e) => e.result === 'exhausted').length,
      notAttendingBlocked: ledger.filter((e) => e.result === 'not_attending').length,
      manualAdmissions,
      amendments: ledger.filter((e) => num(e.admitted_count) < 0).length,
    },
    delivery: {
      attempted,
      confirmed,
      read,
      failed,
      noReceipt,
      failureReasons: [...failureCounts.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
    },
    guests,
    staff: [...staffTotals.entries()]
      .map(([name, v]) => ({ name, doors: [...v.doors], admittedSeats: v.admittedSeats }))
      .sort((a, b) => b.admittedSeats - a.admittedSeats),
    generatedAt: new Date().toISOString(),
  }
}
