import { createSupabaseAdminClient } from '@/lib/supabase'
import { requirePermission } from '@/lib/admin-auth'
import { eventLifecycle } from '@/lib/checkin-event-status'
import LiveMonitorClient, { type LiveEvent } from './LiveMonitorClient'

export const dynamic = 'force-dynamic'

type EventRow = {
  id: string
  name: string
  event_type: string
  starts_at: string | null
  ends_at: string | null
  venue_name: string | null
  city: string | null
  user_id: string
}

/**
 * Cross-event live view: every event whose doors are open right now, with the
 * numbers that matter while they are open.
 *
 * Scoped to live events on purpose. The whole point is that an operations lead
 * watching a Saturday with six weddings running sees six rows, not four hundred
 * — the full list lives on the Events tab.
 */
export default async function CheckinLiveMonitorPage() {
  await requirePermission('opuspass.checkin')
  const admin = createSupabaseAdminClient()

  // A generous window around "now" so the lifecycle check below has everything
  // it could possibly classify as live, without reading the whole table.
  //
  // This is an async Server Component, not a rendered client component —
  // Date.now() reflects the request's server time, not a hydration-affecting
  // render impurity. The lint rule can't tell the two apart.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const DAY_MS = 24 * 60 * 60 * 1000
  const { data: events } = await admin
    .from('wedding_events')
    .select('id, name, event_type, starts_at, ends_at, venue_name, city, user_id')
    .gte('starts_at', new Date(now - 3 * DAY_MS).toISOString())
    .lte('starts_at', new Date(now + DAY_MS).toISOString())
    .order('starts_at', { ascending: true })
    .returns<EventRow[]>()

  const live = (events ?? []).filter((e) => eventLifecycle(e.starts_at, e.ends_at, now) === 'live')

  if (live.length === 0) {
    return <LiveMonitorClient events={[]} />
  }

  const eventIds = live.map((e) => e.id)
  const userIds = Array.from(new Set(live.map((e) => e.user_id)))

  const [{ data: users }, { data: invitations }, { data: tokens }] = await Promise.all([
    admin.from('users').select('id, name, email').in('id', userIds).returns<{ id: string; name: string | null; email: string | null }[]>(),
    admin
      .from('guest_invitations')
      .select('event_id, checked_in_at, checked_in_door')
      .in('event_id', eventIds)
      .eq('rsvp_status', 'attending')
      .returns<{ event_id: string; checked_in_at: string | null; checked_in_door: string | null }[]>(),
    admin
      .from('scanner_access_tokens')
      .select('event_id, door_label, revoked_at, expires_at')
      .in('event_id', eventIds)
      .returns<{ event_id: string; door_label: string; revoked_at: string | null; expires_at: string }[]>(),
  ])

  const ownerById = new Map((users ?? []).map((u) => [u.id, u.name ?? u.email ?? 'Unknown couple']))

  const expected = new Map<string, number>()
  const arrived = new Map<string, number>()
  const lastArrivalAt = new Map<string, string>()
  for (const inv of invitations ?? []) {
    expected.set(inv.event_id, (expected.get(inv.event_id) ?? 0) + 1)
    if (!inv.checked_in_at) continue
    arrived.set(inv.event_id, (arrived.get(inv.event_id) ?? 0) + 1)
    const seen = lastArrivalAt.get(inv.event_id)
    if (!seen || inv.checked_in_at > seen) lastArrivalAt.set(inv.event_id, inv.checked_in_at)
  }

  // Staff and doors count only codes that can open a door right now: a revoked
  // attendant still listed as "on duty" is exactly the wrong thing to show
  // someone deciding whether an entrance is covered.
  const staffOnDuty = new Map<string, number>()
  const doorsStaffed = new Map<string, Set<string>>()
  for (const t of tokens ?? []) {
    if (t.revoked_at || new Date(t.expires_at).getTime() <= now) continue
    staffOnDuty.set(t.event_id, (staffOnDuty.get(t.event_id) ?? 0) + 1)
    const doors = doorsStaffed.get(t.event_id) ?? new Set<string>()
    doors.add(t.door_label)
    doorsStaffed.set(t.event_id, doors)
  }

  const rows: LiveEvent[] = live.map((e) => ({
    id: e.id,
    name: e.name,
    eventType: e.event_type,
    venue: [e.venue_name, e.city].filter(Boolean).join(', ') || null,
    coupleName: ownerById.get(e.user_id) ?? 'Unknown couple',
    expected: expected.get(e.id) ?? 0,
    checkedIn: arrived.get(e.id) ?? 0,
    staffOnDuty: staffOnDuty.get(e.id) ?? 0,
    doorsStaffed: doorsStaffed.get(e.id)?.size ?? 0,
    lastArrivalAt: lastArrivalAt.get(e.id) ?? null,
  }))

  return <LiveMonitorClient events={rows} />
}
