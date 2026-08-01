import 'server-only'

import { cache } from 'react'
import { auth } from '@clerk/nextjs/server'
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/supabase'
import type {
  NotificationCategory,
  NotificationPriority,
  NotificationStatus,
  StaffNotification,
} from './types'
import { logDbError } from '@/lib/log-safe'
import { PROVIDER_UNCONFIGURED } from './emit'

type Row = {
  id: string
  event_id: string
  category: string
  priority: string
  title: string
  body: string | null
  href: string | null
  status: string
  created_at: string
  workflow_events: { event_type: string; entity_type: string; entity_id: string } | null
}

// The signed-in staff member's employee row. Cached per request so the bell
// and any other consumer share one round-trip.
export const getCallerEmployeeId = cache(async (): Promise<string | null> => {
  if (!hasSupabaseAdminConfig()) return null
  const { userId } = await auth()
  if (!userId) return null
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_employees')
    .select('id')
    .eq('clerk_user_id', userId)
    .maybeSingle<{ id: string }>()
  if (error) {
    logDbError('workforce_employee.lookup', error)
    return null
  }
  return data?.id ?? null
})

// Bell contents. Archived and dismissed entries are excluded here but never
// deleted — the history view reads the same table without this filter.
export async function listBellNotifications(limit = 30): Promise<StaffNotification[]> {
  const employeeId = await getCallerEmployeeId()
  if (!employeeId) return []

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('staff_notifications')
    .select(
      'id, event_id, category, priority, title, body, href, status, created_at, workflow_events(event_type, entity_type, entity_id)',
    )
    .eq('employee_id', employeeId)
    .eq('channel', 'bell')
    .in('status', ['unread', 'read'])
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<Row[]>()

  if (error) {
    logDbError('staff_notification.list', error)
    return []
  }

  return (data ?? []).map((r) => ({
    id: r.id,
    eventId: r.event_id,
    eventType: r.workflow_events?.event_type ?? '',
    channel: 'bell' as const,
    category: r.category as NotificationCategory,
    priority: r.priority as NotificationPriority,
    title: r.title,
    body: r.body,
    href: r.href,
    status: r.status as NotificationStatus,
    createdAt: r.created_at,
    entityType: r.workflow_events?.entity_type ?? '',
    entityId: r.workflow_events?.entity_id ?? '',
  }))
}

// ---------------------------------------------------------------------------
// Operational backlog signal
// ---------------------------------------------------------------------------
// An absent provider now records obligations instead of dropping them, which
// is correct — but it means an indefinitely absent provider builds a silent
// backlog. This is the counter that makes it not silent.
//
// Aggregate only: counts and one timestamp. No recipient, no employee id, no
// title, no address. Safe to log, alert on, or render on an ops dashboard.
export type EmailBacklog = {
  // The read stamps its own clock, matching ApprovalRequestSnapshot and
  // ApprovalAnalytics. Ages are relative to when the rows were read, so
  // computing "now" in the component would be impure during render and would
  // let a server render and a client render disagree on the same age.
  fetchedAt: number
  pending: number
  // Of those, the ones waiting purely because no provider was configured.
  awaitingProvider: number
  failed: number
  abandoned: number
  oldestPendingAt: string | null
}

export async function emailDeliveryBacklog(): Promise<EmailBacklog> {
  const empty: EmailBacklog = {
    fetchedAt: Date.now(),
    pending: 0, awaitingProvider: 0, failed: 0, abandoned: 0, oldestPendingAt: null,
  }
  if (!hasSupabaseAdminConfig()) return empty
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('staff_notifications')
    .select('delivery_status, last_error, created_at')
    .eq('channel', 'email')
    .in('delivery_status', ['pending', 'failed', 'abandoned'])
    .returns<{ delivery_status: string; last_error: string | null; created_at: string }[]>()
  if (error) {
    logDbError('staff_notification.backlog', error)
    return empty
  }

  const out = { ...empty }
  for (const row of data ?? []) {
    if (row.delivery_status === 'pending') {
      out.pending += 1
      if (row.last_error === PROVIDER_UNCONFIGURED) out.awaitingProvider += 1
      if (!out.oldestPendingAt || row.created_at < out.oldestPendingAt) {
        out.oldestPendingAt = row.created_at
      }
    } else if (row.delivery_status === 'failed') out.failed += 1
    else if (row.delivery_status === 'abandoned') out.abandoned += 1
  }
  return out
}
