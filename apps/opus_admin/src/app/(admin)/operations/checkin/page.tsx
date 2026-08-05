import { createSupabaseAdminClient } from '@/lib/supabase'
import { requirePermission } from '@/lib/admin-auth'
import EventsListClient, { type CheckinEventRow } from './EventsListClient'

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

type UserRow = { id: string; name: string | null; email: string | null }

type TokenRow = {
  event_id: string
  assigned_by: string
  attendant_name: string | null
  revoked_at: string | null
  expires_at: string
}

export default async function CheckinEventsPage() {
  await requirePermission('opuspass.checkin')
  const admin = createSupabaseAdminClient()

  const { data: events } = await admin
    .from('wedding_events')
    .select('id, name, event_type, starts_at, ends_at, venue_name, city, user_id')
    .order('starts_at', { ascending: false })
    .limit(500)
    .returns<EventRow[]>()

  const eventIds = (events ?? []).map((e) => e.id)
  const userIds = Array.from(new Set((events ?? []).map((e) => e.user_id)))

  const [{ data: users }, { data: tokens }] = await Promise.all([
    userIds.length > 0
      ? admin.from('users').select('id, name, email').in('id', userIds).returns<UserRow[]>()
      : Promise.resolve({ data: [] as UserRow[] }),
    eventIds.length > 0
      ? admin
          .from('scanner_access_tokens')
          .select('event_id, assigned_by, attendant_name, revoked_at, expires_at')
          .in('event_id', eventIds)
          .returns<TokenRow[]>()
      : Promise.resolve({ data: [] as TokenRow[] }),
  ])

  const userById = new Map<string, UserRow>()
  for (const u of users ?? []) userById.set(u.id, u)

  // Per-event attendant counts — active = not revoked, not expired.
  // Split by who assigned it so the list can show "admin-assigned" vs.
  // "couple's own" without a second round trip. Names are only ever set
  // on admin-assigned rows (couple self-serve tokens have the attendant
  // type their own name client-side, never persisted server-side) — so
  // activeAdminNames is the full set of names we can actually show.
  const activeAdminByEvent = new Map<string, number>()
  const activeAnyByEvent = new Map<string, number>()
  const activeAdminNamesByEvent = new Map<string, string[]>()
  // This is an async Server Component, not a rendered client component —
  // Date.now() here just reflects the request's server time, not a
  // hydration-affecting render impurity. The lint rule can't tell the two
  // apart, hence the inline disable.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  for (const t of tokens ?? []) {
    const active = !t.revoked_at && new Date(t.expires_at).getTime() > now
    if (!active) continue
    activeAnyByEvent.set(t.event_id, (activeAnyByEvent.get(t.event_id) ?? 0) + 1)
    if (t.assigned_by === 'admin') {
      activeAdminByEvent.set(t.event_id, (activeAdminByEvent.get(t.event_id) ?? 0) + 1)
      if (t.attendant_name) {
        const names = activeAdminNamesByEvent.get(t.event_id) ?? []
        names.push(t.attendant_name)
        activeAdminNamesByEvent.set(t.event_id, names)
      }
    }
  }

  const rows: CheckinEventRow[] = (events ?? []).map((e) => {
    const owner = userById.get(e.user_id)
    return {
      id: e.id,
      name: e.name,
      eventType: e.event_type,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      venue: [e.venue_name, e.city].filter(Boolean).join(', ') || null,
      coupleName: owner?.name ?? owner?.email ?? 'Unknown couple',
      activeAdminAttendants: activeAdminByEvent.get(e.id) ?? 0,
      activeAttendantsTotal: activeAnyByEvent.get(e.id) ?? 0,
      activeAdminNames: activeAdminNamesByEvent.get(e.id) ?? [],
    }
  })

  return <EventsListClient events={rows} />
}
