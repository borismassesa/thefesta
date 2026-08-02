'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { logDbError } from '@/lib/log-safe'
import { hasPermission } from '@/lib/admin-auth'
import { recordAuditEvent } from '@/lib/audit-log'
import { requireWorkspaceCapability } from '@/lib/workspace/guards'
import { recordSensitiveWorkspaceAction } from '@/lib/workspace/activity'
import { toSafeMessage } from '@/lib/workspace/errors'
import { leaveErrorToken, leaveMessage } from '@/lib/leave/errors'
import { LEAVE_PORTIONS, type LeavePortion } from '@/lib/leave/days'

// Leave server actions.
//
// THE IDENTITY RULE. None of these takes an employee id; it comes from
// requireWorkspaceCapability, and the database functions re-check ownership and
// approval scope under a row lock.
//
// THE LEDGER RULE. No action writes to leave_balances, and none writes a
// leave_transactions row by hand except through leave_adjust_balance, which
// demands a reason and is audited. Everything else moves the balance by calling
// a function that records WHY.

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export type CreateRequestInput = {
  leaveTypeId: string
  startDate: string
  endDate: string
  portion: LeavePortion
  hours?: number | null
  reason: string
  contactDuringLeave?: string | null
}

/** Create a draft and expand it into days, so the cost is visible before submitting. */
export async function createRequest(
  input: CreateRequestInput,
): Promise<ActionResult<{ requestId: string; totalDays: number }>> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'leave.create' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  if (!DATE_RE.test(input.startDate) || !DATE_RE.test(input.endDate)) {
    return { ok: false, error: 'Pick valid dates.' }
  }
  if (input.endDate < input.startDate) {
    return { ok: false, error: 'The end date has to be on or after the start date.' }
  }
  if (!LEAVE_PORTIONS.includes(input.portion)) {
    return { ok: false, error: 'Choose how much of the day you are taking.' }
  }
  if (input.portion === 'hours' && (!input.hours || input.hours <= 0)) {
    return { ok: false, error: 'Enter how many hours.' }
  }
  const reason = input.reason.trim()
  if (reason.length > 2000) return { ok: false, error: 'Keep the reason under 2000 characters.' }

  const supabase = createSupabaseAdminClient()
  const { data: created, error } = await supabase
    .from('leave_requests')
    .insert({
      employee_id: employee.id,
      leave_type_id: input.leaveTypeId,
      start_date: input.startDate,
      end_date: input.endDate,
      reason,
      contact_during_leave: input.contactDuringLeave ?? null,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) {
    logDbError('leave.create', error, { employeeId: employee.id })
    return { ok: false, error: leaveMessage(error) }
  }

  const { data: days, error: expandError } = await supabase.rpc('leave_expand_days', {
    p_request_id: created.id,
    p_portion: input.portion,
    p_hours: input.hours ?? null,
  })
  if (expandError) {
    if (!leaveErrorToken(expandError)) {
      logDbError('leave.expand', expandError, { employeeId: employee.id })
    }
    return { ok: false, error: leaveMessage(expandError) }
  }

  revalidatePath('/workspace/leave')
  return { ok: true, requestId: created.id, totalDays: Number(days ?? 0) }
}

export async function submitRequest(requestId: string): Promise<ActionResult<{ totalDays: number }>> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'leave.submit' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc('leave_submit_request', {
    p_request_id: requestId,
    p_employee_id: employee.id,
  })
  if (error) {
    if (!leaveErrorToken(error)) logDbError('leave.submit', error, { employeeId: employee.id })
    return { ok: false, error: leaveMessage(error) }
  }

  void recordSensitiveWorkspaceAction({
    employeeId: employee.id,
    eventType: 'workspace.leave.submitted',
    summary: `Requested ${Number(data ?? 0)} days of leave`,
    actorEmployeeId: employee.id,
    actorClerkId: employee.clerkUserId,
    targetResource: `leave_requests:${requestId}`,
    metadata: { requestId, totalDays: data },
  })

  revalidatePath('/workspace/leave')
  return { ok: true, totalDays: Number(data ?? 0) }
}

export async function decideRequest(
  requestId: string,
  decision: 'approve' | 'reject' | 'return',
  note?: string,
): Promise<ActionResult<{ state: string }>> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('workspace.read', {
      action: `leave.${decision}`,
    }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  // HR authority is an application fact; the reporting-scope walk is the
  // database's. Both are needed, and neither is taken from the client.
  const isHr = await hasPermission('workforce.write')

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc('leave_decide', {
    p_request_id: requestId,
    p_actor_employee_id: employee.id,
    p_decision: decision,
    p_note: note ?? null,
    p_is_hr: isHr,
  })
  if (error) {
    if (!leaveErrorToken(error)) logDbError('leave.decide', error, { employeeId: employee.id })
    return { ok: false, error: leaveMessage(error) }
  }

  void recordSensitiveWorkspaceAction({
    employeeId: employee.id,
    eventType: `workspace.leave.${decision}`,
    summary: `Leave request ${decision}d`,
    actorEmployeeId: employee.id,
    actorClerkId: employee.clerkUserId,
    targetResource: `leave_requests:${requestId}`,
    metadata: { requestId, decision, asHr: isHr, newState: data },
    severity: 'info',
    auditMessage: `${employee.employeeCode} ${decision}d a leave request`,
  })

  revalidatePath('/workspace/leave')
  return { ok: true, state: typeof data === 'string' ? data : decision }
}

/**
 * Cancel or withdraw.
 *
 * Cancelling APPROVED leave adds a reversal to the ledger; withdrawing an
 * undecided request does not, because nothing was taken. The database decides
 * which happened from the request's state.
 */
export async function cancelRequest(
  requestId: string,
  reason: string,
): Promise<ActionResult<{ state: string }>> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'leave.cancel' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  const trimmed = reason.trim()
  if (trimmed.length === 0) {
    return { ok: false, error: leaveMessage({ message: 'leave.reason_required' }) }
  }

  const isHr = await hasPermission('workforce.write')
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc('leave_cancel', {
    p_request_id: requestId,
    p_actor_employee_id: employee.id,
    p_reason: trimmed,
    p_is_hr: isHr,
  })
  if (error) {
    if (!leaveErrorToken(error)) logDbError('leave.cancel', error, { employeeId: employee.id })
    return { ok: false, error: leaveMessage(error) }
  }

  void recordSensitiveWorkspaceAction({
    employeeId: employee.id,
    eventType: 'workspace.leave.cancelled',
    summary: `Leave ${data === 'cancelled' ? 'cancelled' : 'withdrawn'}`,
    actorEmployeeId: employee.id,
    actorClerkId: employee.clerkUserId,
    targetResource: `leave_requests:${requestId}`,
    metadata: { requestId, resultingState: data, reversalCreated: data === 'cancelled' },
    severity: 'warn',
  })

  revalidatePath('/workspace/leave')
  return { ok: true, state: typeof data === 'string' ? data : 'cancelled' }
}

/**
 * A manual balance adjustment.
 *
 * People Ops only, reason mandatory, and audited separately from the activity
 * feed. Changing somebody's leave entitlement by hand is exactly the action
 * that has to be answerable months later.
 */
export async function adjustBalance(input: {
  employeeId: string
  leaveTypeId: string
  yearStart: string
  days: number
  reason: string
}): Promise<ActionResult> {
  let actor
  try {
    ;({ employee: actor } = await requireWorkspaceCapability('workspace.read', {
      action: 'leave.adjust',
    }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  // Not a manager's power. Adjusting a balance is not approving leave; it is
  // changing what somebody is owed.
  if (!(await hasPermission('workforce.write'))) {
    return { ok: false, error: 'Only People Ops can adjust a leave balance.' }
  }

  const reason = input.reason.trim()
  if (reason.length < 5) {
    return { ok: false, error: 'Explain the adjustment. It goes on the permanent record.' }
  }
  if (!Number.isFinite(input.days) || input.days === 0) {
    return { ok: false, error: leaveMessage({ message: 'leave.zero_adjustment' }) }
  }
  if (Math.abs(input.days) > 365) {
    return { ok: false, error: 'That is not a plausible adjustment.' }
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc('leave_adjust_balance', {
    p_employee_id: input.employeeId,
    p_leave_type_id: input.leaveTypeId,
    p_year_start: input.yearStart,
    p_days: input.days,
    p_reason: reason,
    p_actor_employee_id: actor.id,
    p_actor_clerk_id: actor.clerkUserId,
  })
  if (error) {
    if (!leaveErrorToken(error)) logDbError('leave.adjust', error, { employeeId: actor.id })
    return { ok: false, error: leaveMessage(error) }
  }

  // Audited in its own right, at critical severity: this is the one action in
  // the module that changes an entitlement without anybody requesting anything.
  void recordAuditEvent({
    eventType: 'leave.balance_adjusted',
    severity: 'critical',
    message: `Leave balance adjusted by ${input.days} days`,
    actorClerkId: actor.clerkUserId,
    targetResource: `leave_transactions:${data}`,
    metadata: {
      subjectEmployeeId: input.employeeId,
      leaveTypeId: input.leaveTypeId,
      days: input.days,
      yearStart: input.yearStart,
      reason,
    },
    resolveActor: false,
  })

  revalidatePath('/workspace/leave')
  return { ok: true }
}

export async function attachDocument(input: {
  requestId: string
  fileName: string
  storagePath: string
  mimeType?: string | null
  sizeBytes?: number | null
  documentType?: string
}): Promise<ActionResult> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'leave.attach' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  const supabase = createSupabaseAdminClient()
  const { data: request } = await supabase
    .from('leave_requests')
    .select('id, employee_id, state')
    .eq('id', input.requestId)
    .maybeSingle<{ id: string; employee_id: string; state: string }>()
  if (!request) return { ok: false, error: leaveMessage({ message: 'leave.not_found' }) }
  if (request.employee_id !== employee.id) {
    return { ok: false, error: leaveMessage({ message: 'leave.not_owner' }) }
  }

  const fileName = input.fileName.trim()
  if (fileName.length === 0) return { ok: false, error: 'The file needs a name.' }
  // The storage path is derived by the upload route, never accepted raw from a
  // client: a caller-supplied path is a way to point a record at somebody
  // else's file.
  if (!input.storagePath.startsWith(`leave/${employee.id}/`)) {
    return { ok: false, error: 'That upload does not belong to this request.' }
  }

  const allowed = ['supporting', 'medical_certificate', 'court_document', 'admission_letter', 'other']
  const { error } = await supabase.from('leave_documents').insert({
    request_id: input.requestId,
    employee_id: employee.id,
    file_name: fileName,
    storage_path: input.storagePath,
    mime_type: input.mimeType ?? null,
    size_bytes: input.sizeBytes ?? null,
    document_type: allowed.includes(input.documentType ?? '') ? input.documentType : 'supporting',
    uploaded_by: employee.id,
  })
  if (error) {
    logDbError('leave.attach', error, { employeeId: employee.id })
    return { ok: false, error: leaveMessage(error) }
  }

  revalidatePath('/workspace/leave')
  return { ok: true }
}
