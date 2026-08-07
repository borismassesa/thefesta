import { createSupabaseAdminClient } from '@/lib/supabase'
import { requirePermission } from '@/lib/admin-auth'
import { listAttendants } from '../actions'
import EventConsoleClient from './EventConsoleClient'
import type { CheckinBaseline } from './CheckinEventClient'
import type { CheckinReport } from './CheckinReportClient'
import type { AuditLedgerRow, AuditSnapshotRow } from './CheckinAuditClient'

export const dynamic = 'force-dynamic'

export default async function CheckinEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { eventId } = await params
  const { tab } = await searchParams
  const initialTab = tab === 'report' ? 'report' : tab === 'audit' ? 'audit' : 'checkin'

  // Both tabs are views of the same check-in data — the live console and the
  // after-the-fact report — so one permission covers the whole console.
  await requirePermission('opuspass.checkin')
  const admin = createSupabaseAdminClient()

  const { data: event } = await admin
    .from('wedding_events')
    .select('id, name, event_type, starts_at, ends_at, venue_name, city, user_id')
    .eq('id', eventId)
    .maybeSingle<{
      id: string
      name: string
      event_type: string
      starts_at: string | null
      ends_at: string | null
      venue_name: string | null
      city: string | null
      user_id: string
    }>()

  let coupleName: string | null = null
  if (event) {
    const { data: owner } = await admin
      .from('users')
      .select('name, email')
      .eq('id', event.user_id)
      .maybeSingle<{ name: string | null; email: string | null }>()
    coupleName = owner?.name ?? owner?.email ?? null
  }

  // Baseline snapshot — admin needs cross-couple visibility, so this reads
  // via the service-role client with no owner filter (unlike opus_pass's
  // getEventCheckinSummary, which is scoped to requireDashboardUser()'s
  // user_id). The Realtime Broadcast feed layered on top in
  // CheckinEventClient is identical to the couple's own LiveAttendance.
  const { data: invitations } = await admin
    .from('guest_invitations')
    .select('guest_contact_id, party_size, checked_in_at, checked_in_door')
    .eq('event_id', eventId)
    .eq('rsvp_status', 'attending')

  const rows = (invitations ?? []) as {
    guest_contact_id: string
    party_size: number | null
    checked_in_at: string | null
    checked_in_door: string | null
  }[]
  const checkedIn = rows.filter((r) => r.checked_in_at)

  // Names for EVERY attending guest, not just the ones who turned up — the
  // report's value is largely in the no-show list, which needs the other half.
  const nameById = new Map<string, string>()
  const guestIds = rows.map((r) => r.guest_contact_id)
  if (guestIds.length > 0) {
    const { data: contacts } = await admin.from('guest_contacts').select('id, full_name').in('id', guestIds)
    for (const c of (contacts ?? []) as { id: string; full_name: string }[]) nameById.set(c.id, c.full_name)
  }

  const arrivals = checkedIn
    .sort((a, b) => new Date(b.checked_in_at!).getTime() - new Date(a.checked_in_at!).getTime())
    .map((r) => ({
      guestName: nameById.get(r.guest_contact_id) ?? 'Guest',
      doorLabel: r.checked_in_door,
      partySize: r.party_size ?? 1,
      checkedInAt: r.checked_in_at!,
    }))

  const noShows = rows
    .filter((r) => !r.checked_in_at)
    .map((r) => ({
      guestName: nameById.get(r.guest_contact_id) ?? 'Guest',
      partySize: r.party_size ?? 1,
    }))
    .sort((a, b) => a.guestName.localeCompare(b.guestName))

  // Arrivals per entrance. Scans recorded before doors were labelled (and
  // any older rows predating checked_in_door) collapse into one bucket
  // rather than being dropped, so these counts always re-sum to totalCheckedIn.
  const doorTally = new Map<string, number>()
  for (const r of checkedIn) {
    const door = r.checked_in_door?.trim() || 'Unrecorded door'
    doorTally.set(door, (doorTally.get(door) ?? 0) + 1)
  }
  const doorCounts = Array.from(doorTally, ([doorLabel, count]) => ({ doorLabel, count })).sort(
    (a, b) => b.count - a.count || a.doorLabel.localeCompare(b.doorLabel),
  )

  const baseline: CheckinBaseline = {
    event: event
      ? {
          id: event.id,
          name: event.name,
          eventType: event.event_type,
          startsAt: event.starts_at,
          endsAt: event.ends_at,
          venueName: event.venue_name,
          city: event.city,
          coupleName,
        }
      : null,
    totalAttending: rows.length,
    totalCheckedIn: checkedIn.length,
    doorCounts,
    recent: arrivals.slice(0, 12),
  }

  // Request time on this force-dynamic page, so the report states exactly
  // when its figures were true. Server-side, not in the client component,
  // to keep the printed timestamp out of hydration.
  const report: CheckinReport = { arrivals, noShows, generatedAt: new Date().toISOString() }

  const attendants = await listAttendants(eventId)

  // ── Audit ledger ──────────────────────────────────────────────────────────
  // select('*') rather than a column list: resolution_method, admission_mode,
  // manual_reason and attendant_name arrive in a migration that may not be
  // applied yet, and a named select would 400 on a column that does not exist.
  // Absent keys read as undefined and render as "not recorded".
  const { data: ledgerRows } = await admin
    .from('checkin_scan_events')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  const rawLedger = (ledgerRows ?? []) as Record<string, unknown>[]

  // Name each mutation's guest. The ledger keys on guest_invitation_id, which
  // is meaningless in a dispute; the point of this page is to be readable by
  // someone reconstructing an evening.
  const ledgerInvitationIds = [
    ...new Set(rawLedger.map((r) => String(r.guest_invitation_id))),
  ]
  const guestByInvitation = new Map<string, { name: string | null; passId: string | null }>()
  if (ledgerInvitationIds.length > 0) {
    const { data: invRows } = await admin
      .from('guest_invitations')
      .select('id, pass_id, guest_contact_id')
      .in('id', ledgerInvitationIds)
    const contactIds = [...new Set((invRows ?? []).map((r) => r.guest_contact_id as string))]
    const nameByContact = new Map<string, string | null>()
    if (contactIds.length > 0) {
      const { data: contacts } = await admin
        .from('guest_contacts')
        .select('id, full_name')
        .in('id', contactIds)
      for (const c of contacts ?? []) {
        nameByContact.set(c.id as string, (c.full_name as string | null) ?? null)
      }
    }
    for (const inv of invRows ?? []) {
      guestByInvitation.set(inv.id as string, {
        name: nameByContact.get(inv.guest_contact_id as string) ?? null,
        passId: (inv.pass_id as string | null) ?? null,
      })
    }
  }

  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null)
  const ledger: AuditLedgerRow[] = rawLedger.map((r) => {
    const guest = guestByInvitation.get(String(r.guest_invitation_id))
    return {
      id: String(r.id),
      requestId: String(r.request_id),
      guestName: guest?.name ?? null,
      passId: guest?.passId ?? null,
      result: str(r.result) ?? 'unknown',
      admittedCount: typeof r.admitted_count === 'number' ? r.admitted_count : 0,
      totalAfter: typeof r.total_after === 'number' ? r.total_after : null,
      allowanceAfter: typeof r.allowance_after === 'number' ? r.allowance_after : null,
      source: str(r.source) ?? 'api',
      resolutionMethod: str(r.resolution_method),
      admissionMode: str(r.admission_mode),
      manualReason: str(r.manual_reason),
      reason: str(r.reason),
      attendantName: str(r.attendant_name),
      checkedInBy: str(r.checked_in_by),
      checkedInDoor: str(r.checked_in_door),
      credentialFormat: str(r.credential_format),
      createdAt: String(r.created_at),
      completedAt: str(r.completed_at),
    }
  })

  // Tolerated failure: the snapshots table arrives with the lifecycle
  // migration. Absent means no client report has ever been finalized.
  const { data: snapshotRows } = await admin
    .from('checkin_report_snapshots')
    .select('id, version, model_version, finalized_at, superseded_at')
    .eq('event_id', eventId)
    .order('version', { ascending: false })

  const snapshots: AuditSnapshotRow[] = ((snapshotRows ?? []) as Record<string, unknown>[]).map(
    (r) => ({
      id: String(r.id),
      version: Number(r.version),
      modelVersion: Number(r.model_version),
      finalizedAt: String(r.finalized_at),
      supersededAt: str(r.superseded_at),
    }),
  )

  return (
    <EventConsoleClient
      eventId={eventId}
      baseline={baseline}
      report={report}
      initialAttendants={attendants}
      initialTab={initialTab}
      ledger={ledger}
      snapshots={snapshots}
    />
  )
}
