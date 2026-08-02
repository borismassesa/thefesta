'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { recordAuditEvent } from '@/lib/audit-log'
import { requireSelfEmployee } from '@/lib/workforce/identity'
import { daysBetween } from './_lib/leave-calculation'
import {
  canCreateRequest,
  canEditRequest,
  canWithdrawRequest,
} from './_lib/leave-policy'
import { parseCreateInput, parseRequestId } from './_lib/schemas'
import { getMyLeaveBalance, getMyLeaveRequests } from './_lib/queries'

// Personal leave mutations.
//
// Shape of every action here:
//   1. resolve identity server-side  (requireSelfEmployee)
//   2. validate untrusted input      (schemas.ts, pure)
//   3. re-read the STORED row        (never trust client state)
//   4. ask the pure policy           (leave-policy.ts)
//   5. write, audit, revalidate
//
// NO action takes an employeeId. The only client-supplied identifier is a
// request id, and it is used solely to look up a row that is then filtered by
// the resolved employee id AND re-checked for ownership.
//
// Expected failures are RETURNED, not thrown: Next redacts thrown Server
// Action messages in production, so a thrown "you already have leave that
// week" would reach the user as a generic error. Unexpected failures are left
// to throw so they are redacted and logged with a digest.

export type LeaveActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string }

/**
 * Audit metadata deliberately carries identifiers and the action only. The
 * free-text reason is NOT recorded: it routinely contains medical or family
 * detail, and an audit trail is not the place for it.
 */
async function auditLeave(
  eventType: string,
  employeeId: string,
  requestId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await recordAuditEvent({
    eventType,
    severity: 'info',
    message: `Leave request ${requestId}`,
    targetResource: `workforce_leave_requests:${requestId}`,
    metadata: { employeeId, ...metadata },
  })
}

export async function createMyLeaveRequest(raw: unknown): Promise<LeaveActionResult> {
  const employee = await requireSelfEmployee()

  const parsed = parseCreateInput(raw)
  if (!parsed.ok) return { ok: false, error: parsed.error }
  const input = parsed.value

  const days = daysBetween(input.startDate, input.endDate)
  const existing = await getMyLeaveRequests()

  const decision = canCreateRequest({
    type: input.type,
    startDate: input.startDate,
    endDate: input.endDate,
    days,
    existing,
  })
  if (!decision.allowed) return { ok: false, error: decision.reason }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_leave_requests')
    .insert({
      // The resolved id, never anything from `raw`.
      employee_id: employee.id,
      leave_type: input.type,
      start_date: input.startDate,
      end_date: input.endDate,
      days,
      status: 'Pending',
      reason: input.reason,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) {
    console.error('[workspace-leave] create failed', error)
    return { ok: false, error: 'We could not submit that request. Try again.' }
  }

  await auditLeave('workforce.leave_requested', employee.id, data.id, {
    leaveType: input.type,
    startDate: input.startDate,
    endDate: input.endDate,
    days,
  })

  revalidatePath('/workspace/leave')
  revalidatePath('/workspace')
  revalidatePath('/workforce/leave')
  return { ok: true, id: data.id }
}

export async function updateMyLeaveRequest(
  rawId: unknown,
  raw: unknown,
): Promise<LeaveActionResult> {
  const employee = await requireSelfEmployee()

  const idParsed = parseRequestId(rawId)
  if (!idParsed.ok) return { ok: false, error: idParsed.error }
  const parsed = parseCreateInput(raw)
  if (!parsed.ok) return { ok: false, error: parsed.error }
  const input = parsed.value

  const existing = await getMyLeaveRequests()
  // Re-read from the stored set rather than trusting anything sent with the
  // request. If the id is not in the caller's own requests, it is not theirs.
  const stored = existing.find((r) => r.id === idParsed.value)
  if (!stored) return { ok: false, error: 'That request no longer exists.' }

  const editable = canEditRequest(stored, employee.id)
  if (!editable.allowed) return { ok: false, error: editable.reason }

  const days = daysBetween(input.startDate, input.endDate)
  const decision = canCreateRequest({
    type: input.type,
    startDate: input.startDate,
    endDate: input.endDate,
    days,
    existing,
    ignoreRequestId: stored.id,
  })
  if (!decision.allowed) return { ok: false, error: decision.reason }

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('workforce_leave_requests')
    .update({
      leave_type: input.type,
      start_date: input.startDate,
      end_date: input.endDate,
      days,
      reason: input.reason,
    })
    .eq('id', stored.id)
    // Belt and braces: the ownership check above already passed, but the
    // write is scoped again so a logic error upstream cannot touch another
    // employee's row.
    .eq('employee_id', employee.id)
    .eq('status', 'Pending')
  if (error) {
    console.error('[workspace-leave] update failed', error)
    return { ok: false, error: 'We could not save those changes. Try again.' }
  }

  await auditLeave('workforce.leave_updated', employee.id, stored.id, {
    leaveType: input.type,
    startDate: input.startDate,
    endDate: input.endDate,
    days,
  })

  revalidatePath('/workspace/leave')
  revalidatePath('/workforce/leave')
  return { ok: true, id: stored.id }
}

export async function withdrawMyLeaveRequest(rawId: unknown): Promise<LeaveActionResult> {
  const employee = await requireSelfEmployee()

  const idParsed = parseRequestId(rawId)
  if (!idParsed.ok) return { ok: false, error: idParsed.error }

  const existing = await getMyLeaveRequests()
  const stored = existing.find((r) => r.id === idParsed.value)
  if (!stored) return { ok: false, error: 'That request no longer exists.' }

  const decision = canWithdrawRequest(stored, employee.id)
  if (!decision.allowed) return { ok: false, error: decision.reason }

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('workforce_leave_requests')
    .update({ status: 'Cancelled' })
    .eq('id', stored.id)
    .eq('employee_id', employee.id)
    // Only a still-Pending row may be withdrawn. If an approver decided it
    // between the read and this write, the update matches nothing rather than
    // silently reversing their decision.
    .eq('status', 'Pending')
  if (error) {
    console.error('[workspace-leave] withdraw failed', error)
    return { ok: false, error: 'We could not withdraw that request. Try again.' }
  }

  await auditLeave('workforce.leave_withdrawn', employee.id, stored.id, {
    leaveType: stored.type,
    days: stored.days,
  })

  revalidatePath('/workspace/leave')
  revalidatePath('/workspace')
  revalidatePath('/workforce/leave')
  return { ok: true, id: stored.id }
}
