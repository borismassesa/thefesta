import { createSupabaseAdminClient } from '@/lib/supabase'
import { requirePermission } from '@/lib/admin-auth'
import { listAttendants } from '../actions'
import EventConsoleClient from './EventConsoleClient'
import type { CheckinBaseline } from './CheckinEventClient'
import type { CheckinReport } from './CheckinReportClient'

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
  const initialTab = tab === 'report' ? 'report' : 'checkin'

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

  return (
    <EventConsoleClient
      eventId={eventId}
      baseline={baseline}
      report={report}
      initialAttendants={attendants}
      initialTab={initialTab}
    />
  )
}
