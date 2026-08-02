'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { requirePermission } from '@/lib/admin-auth'
import { recordAuditEvent } from '@/lib/audit-log'
import { canDecideLeaveRequest, type LeaveDecision } from './_lib/approval-policy'
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

function daysBetween(start: string, end: string): number {
  const s = new Date(start)
  const e = new Date(end)
  return Math.max(1, Math.floor((e.getTime() - s.getTime()) / 86400000) + 1)
}

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

  const supabase = createSupabaseAdminClient()
  // The status predicate is what makes this safe against a stale page. If
  // another approver decided between the read above and this write, zero rows
  // match and we report the conflict instead of silently overwriting their
  // decision. Without it, two approvers could approve and reject the same
  // request, and the balance below could be deducted twice.
  const { data: updated, error: updateError } = await supabase
    .from('workforce_leave_requests')
    .update({ status: decision, reviewed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'Pending')
    .select('id')
    .returns<Array<{ id: string }>>()
  if (updateError) {
    console.error('[workforce-leave] decide failed', updateError)
    return { ok: false, error: 'We could not record that decision. Try again.' }
  }
  if ((updated?.length ?? 0) !== 1) {
    return {
      ok: false,
      error: 'Someone else decided this request first. Refresh to see the current status.',
    }
  }

  // Deduct only on approval, only for Annual, and only now that the
  // conditional update has confirmed WE are the decider.
  if (decision === 'Approved' && row.leave_type === 'Annual') {
    const { data: emp, error: balanceError } = await supabase
      .from('workforce_employees')
      .select('leave_balance_days')
      .eq('id', row.employee_id)
      .single<{ leave_balance_days: number }>()
    if (balanceError) {
      console.error('[workforce-leave] balance read failed', balanceError)
    } else {
      const { error: deductError } = await supabase
        .from('workforce_employees')
        .update({ leave_balance_days: Math.max(0, emp.leave_balance_days - row.days) })
        .eq('id', row.employee_id)
      if (deductError) console.error('[workforce-leave] balance write failed', deductError)
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
