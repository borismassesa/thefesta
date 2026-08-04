import 'server-only'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getCallerScope } from '@/lib/workforce/identity'
import { narrowEmployeeFilter } from '@/lib/workforce/approvals'
import type { LeaveRequest, LeaveStatus, LeaveType } from '../../_lib/types'
import { LEAVE_APPROVE_PERMISSION, leaveReadScope } from './approval-policy'

// Team-scoped reads for the Workforce leave surface.
//
// The scope is resolved BEFORE the query and applied as an `.in()` filter, so
// a team caller's rows never leave the database in the first place. Fetching
// organisation-wide and filtering in application memory would mean the data
// briefly existed in a process that had no right to it, and one forgotten
// filter would leak it.

export type ScopedLeaveResult = {
  requests: LeaveRequest[]
  /** True when the caller is reading organisation-wide. */
  isOrgScope: boolean
  /** True for a manager whose direct-report set is currently empty. */
  isEmptyTeam: boolean
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
}

function toRequest(r: Row): LeaveRequest {
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
  }
}

const COLUMNS =
  'id, employee_id, leave_type, start_date, end_date, days, status, reason, submitted_at'

/**
 * Leave requests the caller is authorised to see.
 *
 * `requestedEmployeeIds` is a presentation filter from the UI. It can NARROW
 * the authorised population, never widen it: narrowEmployeeFilter intersects
 * it with what the caller may see, so a crafted query parameter naming someone
 * outside scope simply drops out.
 */
export async function getScopedLeaveRequests(
  requestedEmployeeIds: string[] | null = null,
): Promise<ScopedLeaveResult> {
  const scope = await getCallerScope()
  const read = leaveReadScope(scope)

  if (read.kind === 'none') {
    return { requests: [], isOrgScope: false, isEmptyTeam: true }
  }

  const supabase = createSupabaseAdminClient()
  let query = supabase
    .from('workforce_leave_requests')
    .select(COLUMNS)
    .order('submitted_at', { ascending: false })

  if (read.kind === 'org') {
    // Org tier may still narrow by an explicit request.
    const narrowed = narrowEmployeeFilter(
      scope,
      requestedEmployeeIds,
      LEAVE_APPROVE_PERMISSION,
    )
    if (!narrowed.scopeAll) query = query.in('employee_id', narrowed.employeeIds)
  } else {
    const narrowed = narrowEmployeeFilter(
      scope,
      requestedEmployeeIds,
      LEAVE_APPROVE_PERMISSION,
    )
    const ids = narrowed.scopeAll ? read.employeeIds : narrowed.employeeIds
    // An intersection that empties out must return nothing, not everything.
    if (ids.length === 0) {
      return { requests: [], isOrgScope: false, isEmptyTeam: false }
    }
    query = query.in('employee_id', ids)
  }

  const { data, error } = await query.returns<Row[]>()
  if (error) {
    console.error('[workforce-leave] getScopedLeaveRequests failed', error)
    throw new Error('We could not load leave requests.')
  }
  return {
    requests: (data ?? []).map(toRequest),
    isOrgScope: read.kind === 'org',
    isEmptyTeam: false,
  }
}

/**
 * Load one request for a decision, scoped to the caller.
 *
 * Returns the row plus the caller's scope so the action can run the policy
 * without resolving identity twice.
 */
export async function getLeaveRequestForDecision(requestId: string) {
  const scope = await getCallerScope()
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_leave_requests')
    .select('id, employee_id, status, leave_type, days')
    .eq('id', requestId)
    .maybeSingle<{
      id: string
      employee_id: string
      status: LeaveStatus
      leave_type: LeaveType
      days: number
    }>()
  if (error) {
    console.error('[workforce-leave] getLeaveRequestForDecision failed', error)
    throw new Error('We could not load that request.')
  }
  return { scope, row: data }
}
