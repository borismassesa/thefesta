import 'server-only'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { requireSelfEmployee } from '@/lib/workforce/identity'
import type { LeaveType } from './leave-calculation'
import type { LeaveStatus, StoredRequest } from './leave-policy'

// Server-only reads for the personal leave surface.
//
// THE IDOR INVARIANT: none of these accept an employee id. Each resolves the
// caller internally via requireSelfEmployee and filters on the resolved id.
// There is no parameter a client could supply to widen the result, which is
// why query strings can filter what comes back but never broaden it.

export type MyLeaveRequest = StoredRequest & {
  type: LeaveType
  days: number
  reason: string
  submittedAt: string
  reviewedAt: string | null
}

type Row = {
  id: string
  employee_id: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  days: number
  status: LeaveStatus
  reason: string
  submitted_at: string
  reviewed_at: string | null
}

function toRequest(r: Row): MyLeaveRequest {
  return {
    id: r.id,
    employeeId: r.employee_id,
    type: r.leave_type,
    startDate: r.start_date,
    endDate: r.end_date,
    days: r.days,
    status: r.status,
    reason: r.reason,
    submittedAt: r.submitted_at,
    reviewedAt: r.reviewed_at,
  }
}

const COLUMNS =
  'id, employee_id, leave_type, start_date, end_date, days, status, reason, submitted_at, reviewed_at'

/** Every leave request belonging to the caller, newest first. */
export async function getMyLeaveRequests(): Promise<MyLeaveRequest[]> {
  const employee = await requireSelfEmployee()
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_leave_requests')
    .select(COLUMNS)
    .eq('employee_id', employee.id)
    .order('start_date', { ascending: false })
    .returns<Row[]>()
  if (error) {
    // Deliberately not surfaced to the client. The caller renders a generic
    // message; the detail stays in the server log.
    console.error('[workspace-leave] getMyLeaveRequests failed', error)
    throw new Error('We could not load your leave requests.')
  }
  return (data ?? []).map(toRequest)
}

/** The caller's current annual-leave balance in days. */
export async function getMyLeaveBalance(): Promise<number> {
  const employee = await requireSelfEmployee()
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_employees')
    .select('leave_balance_days')
    .eq('id', employee.id)
    .maybeSingle<{ leave_balance_days: number }>()
  if (error) {
    console.error('[workspace-leave] getMyLeaveBalance failed', error)
    throw new Error('We could not load your leave balance.')
  }
  return data?.leave_balance_days ?? 0
}

/**
 * Load one request BY ID, scoped to the caller in the same query.
 *
 * The employee_id filter is applied server-side alongside the id, so a
 * tampered id cannot return someone else's row in the first place. Callers
 * still re-check ownership through leave-policy, because defence in depth is
 * cheap and this function may be reused.
 */
export async function getMyLeaveRequestById(
  requestId: string,
): Promise<MyLeaveRequest | null> {
  const employee = await requireSelfEmployee()
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_leave_requests')
    .select(COLUMNS)
    .eq('id', requestId)
    .eq('employee_id', employee.id)
    .maybeSingle<Row>()
  if (error) {
    console.error('[workspace-leave] getMyLeaveRequestById failed', error)
    throw new Error('We could not load that request.')
  }
  return data ? toRequest(data) : null
}
