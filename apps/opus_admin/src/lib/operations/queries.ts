import 'server-only'

import { createSupabaseAdminClient } from '@/lib/supabase'
import { getWorkspaceSession } from '@/lib/workspace/identity'
import { getMyTasks } from '@/lib/work/queries'
import { addDays } from '@/lib/work/calendar'
import { logDbError } from '@/lib/log-safe'
import { resolveApprovalActor } from '@/app/(admin)/approvals/actor'
import {
  listApprovalCategories,
  listApprovalRequests,
} from '@/app/(admin)/approvals/queries'
import { categoryLabel } from '@/app/(admin)/approvals/catalog'
import { isWaitingOn } from '@/app/(admin)/approvals/scoping'
import {
  buildCommandCenter,
  commandCenterAccess,
  type CommandCenterSnapshot,
  type OperationsApproval,
  type OperationsBooking,
  type OperationsEvent,
  type OperationsTask,
} from './command-center'

const TIME_ZONE = 'Africa/Dar_es_Salaam'

function todayInOperationsTimeZone(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

type LaneResult<T> = { data: T; failed: boolean }

async function loadLane<T>(
  name: string,
  enabled: boolean,
  fallback: T,
  load: () => Promise<T>,
): Promise<LaneResult<T>> {
  if (!enabled) return { data: fallback, failed: false }
  try {
    return { data: await load(), failed: false }
  } catch (error) {
    logDbError(`operations.command_center.${name}`, error)
    return { data: fallback, failed: true }
  }
}

async function loadEvents(today: string, weekEnd: string): Promise<OperationsEvent[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('wedding_events')
    .select('id, name, event_type, starts_at, venue_name, city, user_id')
    .not('starts_at', 'is', null)
    .gte('starts_at', `${today}T00:00:00+03:00`)
    .lte('starts_at', `${weekEnd}T23:59:59+03:00`)
    .order('starts_at')
    .limit(100)
    .returns<
      {
        id: string
        name: string
        event_type: string
        starts_at: string
        venue_name: string | null
        city: string | null
        user_id: string
      }[]
    >()
  if (error) throw error

  const events = data ?? []
  if (events.length === 0) return []
  const eventIds = events.map((event) => event.id)
  const userIds = [...new Set(events.map((event) => event.user_id))]
  const nowIso = new Date().toISOString()

  const [{ data: users, error: usersError }, { data: tokens, error: tokensError }] =
    await Promise.all([
      supabase
        .from('users')
        .select('id, name, email')
        .in('id', userIds)
        .returns<{ id: string; name: string | null; email: string | null }[]>(),
      supabase
        .from('scanner_access_tokens')
        .select('event_id')
        .in('event_id', eventIds)
        .is('revoked_at', null)
        .gt('expires_at', nowIso)
        .returns<{ event_id: string }[]>(),
    ])
  if (usersError) throw usersError
  if (tokensError) throw tokensError

  const owners = new Map(
    (users ?? []).map((user) => [user.id, user.name?.trim() || user.email || 'Unknown couple']),
  )
  const attendants = new Map<string, number>()
  for (const token of tokens ?? []) {
    attendants.set(token.event_id, (attendants.get(token.event_id) ?? 0) + 1)
  }

  return events.map((event) => ({
    id: event.id,
    name: event.name,
    eventType: event.event_type,
    startsAt: event.starts_at,
    venue: [event.venue_name, event.city].filter(Boolean).join(', ') || null,
    ownerName: owners.get(event.user_id) ?? 'Unknown couple',
    activeAttendants: attendants.get(event.id) ?? 0,
  }))
}

async function loadTasks(
  permissions: ReadonlySet<string>,
): Promise<OperationsTask[]> {
  const session = await getWorkspaceSession()
  if (session.status !== 'resolved') return []
  const rows = await getMyTasks(session.employee, {
    isAdmin: permissions.has('workforce.write'),
  })
  return rows.map((task) => ({
    id: task.id,
    reference: task.reference,
    title: task.title,
    status: task.status,
    priority: task.priority,
    ownerName: task.ownerName,
    dueDate: task.dueDate,
    blockerReason: task.blockerReason,
  }))
}

type BookingLane = { items: OperationsBooking[]; count: number }

async function loadBookings(): Promise<BookingLane> {
  const supabase = createSupabaseAdminClient()
  const { data, error, count } = await supabase
    .from('inquiries')
    .select(
      'id, name, event_type, event_date, vendor_name, location, created_at',
      { count: 'exact' },
    )
    .or('status.eq.pending,status.is.null')
    .order('created_at', { ascending: true })
    .limit(8)
    .returns<
      {
        id: string
        name: string
        event_type: string
        event_date: string | null
        vendor_name: string | null
        location: string | null
        created_at: string | null
      }[]
    >()
  if (error) throw error
  return {
    items: (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      eventType: row.event_type,
      eventDate: row.event_date,
      vendorName: row.vendor_name,
      location: row.location,
      createdAt: row.created_at,
    })),
    count: count ?? data?.length ?? 0,
  }
}

async function loadApprovals(): Promise<OperationsApproval[]> {
  const [actor, categories] = await Promise.all([
    resolveApprovalActor(),
    listApprovalCategories(),
  ])
  const snapshot = await listApprovalRequests({ viewerEmail: actor.email })
  return snapshot.requests
    .filter((request) => isWaitingOn(request, actor.email))
    .map((request) => ({
      id: request.id,
      subject: request.subject,
      categoryLabel: categoryLabel(categories, request.category),
      ownerName: request.owner,
      submittedAt: request.submittedAt ?? request.updatedAt,
    }))
}

export async function getOperationsCommandCenter(
  permissions: ReadonlySet<string>,
): Promise<CommandCenterSnapshot> {
  const access = commandCenterAccess(permissions)
  const now = new Date()
  const today = todayInOperationsTimeZone(now)
  const weekEnd = addDays(today, 6)

  const [events, tasks, bookings, approvals] = await Promise.all([
    loadLane('events', access.events, [] as OperationsEvent[], () =>
      loadEvents(today, weekEnd),
    ),
    loadLane('tasks', access.tasks, [] as OperationsTask[], () =>
      loadTasks(permissions),
    ),
    loadLane(
      'bookings',
      access.bookings,
      { items: [], count: 0 } as BookingLane,
      loadBookings,
    ),
    loadLane('approvals', access.approvals, [] as OperationsApproval[], loadApprovals),
  ])

  return buildCommandCenter({
    access,
    today,
    weekEnd,
    events: events.data,
    tasks: tasks.data,
    bookings: bookings.data.items,
    pendingBookingCount: bookings.data.count,
    approvals: approvals.data,
    errorCount: [events, tasks, bookings, approvals].filter((lane) => lane.failed).length,
    generatedAt: now.toISOString(),
  })
}
