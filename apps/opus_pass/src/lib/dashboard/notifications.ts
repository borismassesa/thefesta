import 'server-only'
import { createDashboardClient } from '@/lib/dashboard/supabase'

// Kept in sync with the DB CHECK constraint in migration 20260613000003_notifications.sql
// (extended for 'gift_claimed' by 20260716170000_opuspass_gift_registry.sql).
export type NotificationType =
  | 'rsvp_received'
  | 'pledge_received'
  | 'payment_confirmed'
  | 'payment_submitted'
  | 'guestbook_received'
  | 'gift_claimed'
  | 'system'

export interface NotificationRecord {
  id: string
  type: NotificationType
  title: string
  body: string | null
  href: string | null
  read: boolean
  created_at: string
  /** Person the notification is about (guest name); drives the initials avatar. */
  actor_name: string | null
}

const LIST_LIMIT = 20

/**
 * Inserts a notification for a couple. Best-effort: a failure here must never
 * break the user-facing flow that produced the event (an RSVP or a pledge), so
 * we swallow errors and only log them.
 */
export async function createNotification(input: {
  userId: string
  type: NotificationType
  title: string
  body?: string | null
  href?: string | null
  /** Guest name this notification is about — powers the initials avatar. */
  actorName?: string | null
}): Promise<void> {
  try {
    const supabase = createDashboardClient()
    const { error } = await supabase.from('notifications').insert({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
      actor_name: input.actorName ?? null,
    })
    if (error) console.error('[notifications] insert failed', error)
  } catch (err) {
    console.error('[notifications] insert threw', err)
  }
}

/** Most recent notifications for a couple, newest first. */
export async function listNotifications(userId: string): Promise<NotificationRecord[]> {
  const supabase = createDashboardClient()
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, body, href, read, created_at, actor_name')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT)
  if (error) {
    console.error('[notifications] list failed', error)
    return []
  }
  return (data ?? []) as NotificationRecord[]
}

/** Count of unread notifications for the badge. */
export async function getUnreadCount(userId: string): Promise<number> {
  const supabase = createDashboardClient()
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false)
  if (error) {
    console.error('[notifications] unread count failed', error)
    return 0
  }
  return count ?? 0
}

/** Marks one notification (scoped to its owner) as read. */
export async function markNotificationRead(userId: string, id: string): Promise<void> {
  const supabase = createDashboardClient()
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', id)
    .eq('user_id', userId)
  if (error) console.error('[notifications] mark read failed', error)
}

/** Marks every unread notification for a couple as read. */
export async function markAllNotificationsRead(userId: string): Promise<void> {
  const supabase = createDashboardClient()
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false)
  if (error) console.error('[notifications] mark all read failed', error)
}
