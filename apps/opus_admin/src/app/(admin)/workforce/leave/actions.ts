'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { requirePermission } from '@/lib/admin-auth'
import { recordAuditEvent } from '@/lib/audit-log'
import { canDecideLeaveRequest, type LeaveDecision } from './_lib/approval-policy'
// The canonical duration + type helpers. This file used to carry its own
// copy of daysBetween; both surfaces now share one implementation so they
// cannot drift on "how many days is this".
import { daysBetween, isLeaveType } from '../../workspace/leave/_lib/leave-calculation'
import { getLeaveRequestForDecision } from './_lib/queries'
import type { LeaveStatus, LeaveType } from '../_lib/types'

const LEAVE_TYPES = new Set<LeaveType>([
  'Annual',
  'Sick',
  'Maternity',
  'Paternity',
  'Compassionate',
  'Unpaid',
])


export type SubmitLeaveInput = {
  employeeId: string
  type: LeaveType
  startDate: string
  endDate: string
  reason: string
}

export async function submitLeaveRequest(input: SubmitLeaveInput): Promise<{ id: string }> {
  await requirePermission('workforce.write')

  if (!LEAVE_TYPES.has(input.type)) throw new Error('Pick a known leave type.')
  if (new Date(input.endDate) < new Date(input.startDate)) {
    throw new Error('End date must be on or after the start date.')
  }
  const reason = input.reason.trim()
  if (reason.length < 3) throw new Error('Provide a short reason.')

  const days = daysBetween(input.startDate, input.endDate)
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_leave_requests')
    .insert({
      employee_id: input.employeeId,
      leave_type: input.type,
      start_date: input.startDate,
      end_date: input.endDate,
      days,
      status: 'Pending',
      reason,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw error

  revalidatePath('/workforce/leave')
  return { id: data.id }
}

export type DecideResult = { ok: true } | { ok: false; error: string }

/**
 * Approve or reject a leave request.
 *
 * Authority is TEAM or ORG (spec 4): a manager may decide for their direct
 * reports without holding any Workforce key, and workforce.leave.approve
 * grants it organisation-wide. Legacy workforce.write expands into that key,
 * so today's approvers are unaffected.
 *
 * Boundary, in order:
 *   1. resolve the caller
 *   2. load the stored row
 *   3. confirm it exists
 *   4+5. confirm scope AND not self-approval  (canDecideLeaveRequest)
 *   6+7. confirm status is Pending and the transition is legal
 *   8. CONDITIONAL update on (id, status='Pending'), verifying one row
 *   9. audit
 *   10. revalidate both surfaces
 */
export async function decideLeaveRequest(
  id: string,
  decision: LeaveDecision,
  note?: string,
): Promise<DecideResult> {
  if (decision !== 'Approved' && decision !== 'Rejected') {
    return { ok: false, error: 'Pick approve or reject.' }
  }

  const { scope, row } = await getLeaveRequestForDecision(id)
  if (!row) return { ok: false, error: 'That request no longer exists.' }

  const allowed = canDecideLeaveRequest(
    { id: row.id, employeeId: row.employee_id, status: row.status },
    scope,
  )
  if (!allowed.allowed) return { ok: false, error: allowed.reason }

  // ONE transaction. The conditional update alone made this single-winner but
  // not atomic: the transition and the balance deduction were separate
  // round-trips, so an approval could commit while the deduction failed,
  // leaving an employee holding days they had already been granted with the
  // request looking correctly approved. The RPC does both or neither.
  const supabase = createSupabaseAdminClient()
  const { data: outcome, error: rpcError } = await supabase
    .rpc('workforce_decide_leave_request', {
      p_request_id: id,
      p_decision: decision,
      p_reviewer_employee_id: scope.employee?.id ?? null,
      p_decision_note: typeof note === 'string' && note.trim() ? note.trim().slice(0, 1000) : null,
    })
    .maybeSingle<{
      decided: boolean
      subject_employee_id: string | null
      leave_type: string | null
      days: number | null
      balance_after: number | null
    }>()
  if (rpcError) {
    console.error('[workforce-leave] decide rpc failed', rpcError)
    return { ok: false, error: 'We could not record that decision. Try again.' }
  }
  const result = outcome
  if (!result?.decided) {
    return {
      ok: false,
      error: 'Someone else decided this request first. Refresh to see the current status.',
    }
  }

  // Identifiers, subject, actor, transition and timestamp — but NOT the
  // employee's free-text reason, which routinely carries medical or family
  // detail that does not belong in an audit trail.
  //
  // NOTE: workforce_leave_requests.reviewed_by is NOT written. Its foreign key
  // points at admin_whitelist, the legacy table superseded by
  // workforce_employees, so it cannot hold a real approver id. The actor is
  // recorded here instead. Repointing that FK is tracked as follow-up work.
  await recordAuditEvent({
    eventType: decision === 'Approved' ? 'workforce.leave_approved' : 'workforce.leave_rejected',
    severity: 'info',
    message: `Leave request ${id} ${decision.toLowerCase()}`,
    targetResource: `workforce_leave_requests:${id}`,
    metadata: {
      subjectEmployeeId: row.employee_id,
      actorEmployeeId: scope.employee?.id ?? null,
      from: 'Pending',
      to: decision,
      leaveType: row.leave_type,
      days: row.days,
      viaOrgPermission: scope.permissions.has('workforce.leave.approve'),
      // Whether a note was left, not what it said: the note may discuss
      // health or family circumstances and belongs on the row, not in an
      // audit trail that is read far more widely.
      hasDecisionNote: Boolean(note && note.trim()),
    },
  })

  revalidatePath('/workforce/leave')
  revalidatePath('/workforce/employees')
  // The subject sees the outcome on their own surface.
  revalidatePath('/workspace/leave')
  revalidatePath('/workspace')
  return { ok: true }
}

export async function cancelLeaveRequest(id: string): Promise<void> {
  await requirePermission('workforce.write')
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('workforce_leave_requests')
    .update({ status: 'Cancelled', reviewed_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  revalidatePath('/workforce/leave')
}

// --- Attendance ---

export type UpsertAttendanceInput = {
  employeeId: string
  date: string
  clockIn?: string | null
  clockOut?: string | null
  status: 'Present' | 'Late' | 'Absent' | 'Remote' | 'Leave'
  workedHours?: number
}

export async function upsertAttendance(input: UpsertAttendanceInput): Promise<void> {
  await requirePermission('workforce.write')
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('workforce_attendance')
    .upsert(
      {
        employee_id: input.employeeId,
        work_date: input.date,
        clock_in: input.clockIn ?? null,
        clock_out: input.clockOut ?? null,
        status: input.status,
        worked_hours: input.workedHours ?? 0,
      },
      { onConflict: 'employee_id,work_date' },
    )
  if (error) throw error
  revalidatePath('/workforce/leave')
}


// ---------------------------------------------------------------------------
// Admin edit of a pending request
// ---------------------------------------------------------------------------

export type EditLeaveInput = {
  type: LeaveType
  startDate: string
  endDate: string
  reason: string
}

/**
 * Correct the details of a request before deciding it.
 *
 * Same authority as deciding: team scope for your own direct reports, or
 * workforce.leave.approve organisation-wide. Editing someone's request is at
 * least as consequential as approving it, so it is not a lesser gate.
 *
 * PENDING ONLY. A decided request is deliberately immutable here: the balance
 * has already been drawn down against the stored day count, so changing the
 * dates afterwards would leave the deduction and the record disagreeing with
 * no compensating adjustment. Correcting a decided request means reversing the
 * balance too, which is a People Ops operation rather than an inline edit.
 */
export async function editLeaveRequest(
  id: string,
  input: EditLeaveInput,
): Promise<DecideResult> {
  const { scope, row } = await getLeaveRequestForDecision(id)
  if (!row) return { ok: false, error: 'That request no longer exists.' }

  // canDecideLeaveRequest already checks scope, self-approval and Pending
  // status — exactly the conditions that should gate an edit.
  const allowed = canDecideLeaveRequest(
    { id: row.id, employeeId: row.employee_id, status: row.status },
    scope,
  )
  if (!allowed.allowed) return { ok: false, error: allowed.reason }

  if (!isLeaveType(input.type)) return { ok: false, error: 'Pick a known leave type.' }
  if (input.endDate < input.startDate) {
    return { ok: false, error: 'The end date must be on or after the start date.' }
  }
  const reason = input.reason.trim()
  if (reason.length < 3) return { ok: false, error: 'Give a short reason for the request.' }

  const days = daysBetween(input.startDate, input.endDate)
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_leave_requests')
    .update({
      leave_type: input.type,
      start_date: input.startDate,
      end_date: input.endDate,
      days,
      reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    // Re-asserted at write time: if an approver decided between the read and
    // this update, the edit matches nothing rather than quietly altering a
    // request whose balance has already been deducted.
    .eq('status', 'Pending')
    .select('id')
    .returns<Array<{ id: string }>>()
  if (error) {
    console.error('[workforce-leave] edit failed', error)
    return { ok: false, error: 'We could not save those changes. Try again.' }
  }
  if ((data?.length ?? 0) !== 1) {
    return {
      ok: false,
      error: 'Someone decided this request while you were editing. Refresh to see it.',
    }
  }

  await recordAuditEvent({
    eventType: 'workforce.leave_edited',
    severity: 'warn',
    message: `Leave request ${id} edited before decision`,
    targetResource: `workforce_leave_requests:${id}`,
    metadata: {
      subjectEmployeeId: row.employee_id,
      actorEmployeeId: scope.employee?.id ?? null,
      leaveTypeFrom: row.leave_type,
      leaveTypeTo: input.type,
      daysFrom: row.days,
      daysTo: days,
    },
  })

  revalidatePath('/workforce/leave')
  revalidatePath('/workspace/leave')
  return { ok: true }
}
