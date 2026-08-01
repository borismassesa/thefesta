'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getCallerEmployeeId, listBellNotifications } from './queries'
import type { StaffNotification } from './types'
import { logDbError } from '@/lib/log-safe'

// Lifecycle transitions on your own notifications. Every one of these scopes
// the update by the caller's employee_id as well as the row id — the service
// role bypasses RLS, so the ownership check has to be explicit here or a
// guessed id would let anyone clear someone else's bell.

type Result = { ok: true; notifications: StaffNotification[] } | { ok: false; error: string }

async function setStatus(
  ids: string[],
  status: 'read' | 'archived' | 'dismissed',
): Promise<Result> {
  const employeeId = await getCallerEmployeeId()
  if (!employeeId) return { ok: false, error: 'No employee record for this account.' }
  if (ids.length === 0) return { ok: true, notifications: await listBellNotifications() }

  const stampColumn =
    status === 'read' ? 'read_at' : status === 'archived' ? 'archived_at' : 'dismissed_at'

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('staff_notifications')
    .update({ status, [stampColumn]: new Date().toISOString() })
    .in('id', ids)
    .eq('employee_id', employeeId)

  if (error) {
    logDbError('staff_notification.set_status', error)
    // Never the Postgres message — it can echo row values.
    return { ok: false, error: 'Could not update the notification.' }
  }

  revalidatePath('/')
  return { ok: true, notifications: await listBellNotifications() }
}

export async function markNotificationsRead(ids: string[]): Promise<Result> {
  return setStatus(ids, 'read')
}

export async function archiveNotification(id: string): Promise<Result> {
  return setStatus([id], 'archived')
}

export async function markAllNotificationsRead(): Promise<Result> {
  const employeeId = await getCallerEmployeeId()
  if (!employeeId) return { ok: false, error: 'No employee record for this account.' }

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('staff_notifications')
    .update({ status: 'read', read_at: new Date().toISOString() })
    .eq('employee_id', employeeId)
    .eq('channel', 'bell')
    .eq('status', 'unread')

  if (error) {
    logDbError('staff_notification.mark_all_read', error)
    return { ok: false, error: 'Could not update your notifications.' }
  }

  revalidatePath('/')
  return { ok: true, notifications: await listBellNotifications() }
}

export async function refreshNotifications(): Promise<StaffNotification[]> {
  return listBellNotifications()
}
