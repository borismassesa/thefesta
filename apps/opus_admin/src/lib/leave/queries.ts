import 'server-only'
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/supabase'
import { logDbError } from '@/lib/log-safe'
import type { WorkspaceEmployee } from '@/lib/workspace/identity'
import type { LeaveState } from './states'
import type { LeavePortion } from './days'
import { computeBalance, type LeaveBalance, type LeaveTransaction } from './ledger'

// Leave reads, scoped to one employee.
//
// Same rule as the rest of Workspace: every function takes the resolved
// WorkspaceEmployee, never an id. Team availability is the one function that
// returns other people, and it returns only whether they are in — never why,
// because "on leave" is fine to share and "bereavement leave" is not.

export type LeaveTypeSummary = {
  id: string
  code: string
  name: string
  isBalanceBased: boolean
  requiresDocument: boolean
  allowsPartialDay: boolean
  allowsHourly: boolean
  colour: string
}

export type LeaveBalanceRow = LeaveBalance & {
  leaveTypeId: string
  leaveTypeName: string
  leaveYearStart: string
  leaveYearEnd: string
  pendingDays: number
  availableDays: number
}

export type LeaveRequestSummary = {
  id: string
  leaveTypeId: string
  leaveTypeName: string
  startDate: string
  endDate: string
  totalDays: number
  state: LeaveState
  reason: string
  submittedAt: string | null
  decidedAt: string | null
  decisionNote: string | null
  employeeName: string | null
  employeeId: string
  documentCount: number
}

export type LeaveDayRow = { date: string; portion: LeavePortion; dayFraction: number }

export type HolidayRow = { date: string; name: string; isPaid: boolean }

export type AvailabilityRow = {
  employeeId: string
  employeeName: string
  date: string
  status: string
  availableFraction: number
}

export async function getLeaveTypes(): Promise<LeaveTypeSummary[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('leave_types')
      .select('id, code, name, is_balance_based, requires_document, allows_partial_day, allows_hourly, colour')
      .eq('is_active', true)
      .order('sort_order')
      .returns<
        {
          id: string
          code: string
          name: string
          is_balance_based: boolean
          requires_document: boolean
          allows_partial_day: boolean
          allows_hourly: boolean
          colour: string
        }[]
      >()
    if (error) {
      logDbError('leave.types', error)
      return []
    }
    return (data ?? []).map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      isBalanceBased: t.is_balance_based,
      requiresDocument: t.requires_document,
      allowsPartialDay: t.allows_partial_day,
      allowsHourly: t.allows_hourly,
      colour: t.colour,
    }))
  } catch (error) {
    logDbError('leave.types', error)
    return []
  }
}

/** The employee's balances for the current leave year. */
export async function getMyBalances(employee: WorkspaceEmployee): Promise<LeaveBalanceRow[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const supabase = createSupabaseAdminClient()
    const yearStart = `${new Date().getUTCFullYear()}-01-01`
    const { data, error } = await supabase
      .from('leave_balances')
      .select(
        'leave_type_id, leave_year_start, leave_year_end, opening_days, accrued_days, carryover_days, used_days, adjusted_days, expired_days, balance_days, pending_days, leave_types(name)',
      )
      .eq('employee_id', employee.id)
      .eq('leave_year_start', yearStart)
      .returns<
        {
          leave_type_id: string
          leave_year_start: string
          leave_year_end: string
          opening_days: number
          accrued_days: number
          carryover_days: number
          used_days: number
          adjusted_days: number
          expired_days: number
          balance_days: number
          pending_days: number
          leave_types: { name: string } | null
        }[]
      >()
    if (error) {
      logDbError('leave.balances', error, { employeeId: employee.id })
      return []
    }
    return (data ?? []).map((b) => ({
      leaveTypeId: b.leave_type_id,
      leaveTypeName: b.leave_types?.name ?? 'Leave',
      leaveYearStart: b.leave_year_start,
      leaveYearEnd: b.leave_year_end,
      openingDays: Number(b.opening_days),
      accruedDays: Number(b.accrued_days),
      carryoverDays: Number(b.carryover_days),
      usedDays: Number(b.used_days),
      adjustedDays: Number(b.adjusted_days),
      expiredDays: Number(b.expired_days),
      balanceDays: Number(b.balance_days),
      pendingDays: Number(b.pending_days),
      availableDays: Number(b.balance_days) - Number(b.pending_days),
    }))
  } catch (error) {
    logDbError('leave.balances', error, { employeeId: employee.id })
    return []
  }
}

/** The ledger behind one balance, for the history view. */
export async function getLedger(
  employee: WorkspaceEmployee,
  leaveTypeId: string,
  yearStart: string,
): Promise<{ transactions: LeaveTransaction[]; computed: LeaveBalance }> {
  const empty = { transactions: [] as LeaveTransaction[], computed: computeBalance([]) }
  if (!hasSupabaseAdminConfig()) return empty
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('leave_transactions')
      .select('id, kind, days, effective_date, reason, request_id, reverses_transaction_id, actor_employee_id')
      .eq('employee_id', employee.id)
      .eq('leave_type_id', leaveTypeId)
      .eq('leave_year_start', yearStart)
      .order('effective_date')
      .returns<
        {
          id: string
          kind: LeaveTransaction['kind']
          days: number
          effective_date: string
          reason: string | null
          request_id: string | null
          reverses_transaction_id: string | null
          actor_employee_id: string | null
        }[]
      >()
    if (error) {
      logDbError('leave.ledger', error, { employeeId: employee.id })
      return empty
    }
    const transactions: LeaveTransaction[] = (data ?? []).map((t) => ({
      id: t.id,
      kind: t.kind,
      days: Number(t.days),
      effectiveDate: t.effective_date,
      reason: t.reason,
      requestId: t.request_id,
      reversesTransactionId: t.reverses_transaction_id,
      actorEmployeeId: t.actor_employee_id,
    }))
    return { transactions, computed: computeBalance(transactions) }
  } catch (error) {
    logDbError('leave.ledger', error, { employeeId: employee.id })
    return empty
  }
}

export async function getMyRequests(
  employee: WorkspaceEmployee,
  limit = 50,
): Promise<LeaveRequestSummary[]> {
  return listRequests({ employeeId: employee.id, limit })
}

/** Requests waiting on this employee as an approver, within their scope. */
export async function getApprovalQueue(
  employee: WorkspaceEmployee,
  options: { isHr?: boolean } = {},
): Promise<LeaveRequestSummary[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    // HR sees everything pending. A manager sees only their own reports, which
    // is resolved from the management chain rather than from a role.
    let reportIds: string[] = []
    if (!options.isHr) {
      reportIds = await directReports(employee.id)
      if (reportIds.length === 0) return []
    }
    return listRequests({
      states: ['submitted', 'under_review'],
      employeeIds: options.isHr ? undefined : reportIds,
      limit: 100,
    })
  } catch (error) {
    logDbError('leave.approval_queue', error, { employeeId: employee.id })
    return []
  }
}

/** Everyone below this employee in the management chain, depth-capped. */
async function directReports(managerId: string): Promise<string[]> {
  const supabase = createSupabaseAdminClient()
  const found = new Set<string>()
  let frontier = [managerId]
  for (let depth = 0; depth < 5 && frontier.length > 0; depth += 1) {
    const { data, error } = await supabase
      .from('workforce_employees')
      .select('id')
      .in('manager_id', frontier)
      .returns<{ id: string }[]>()
    if (error) {
      logDbError('leave.reports', error)
      break
    }
    const next = (data ?? []).map((r) => r.id).filter((id) => !found.has(id))
    next.forEach((id) => found.add(id))
    frontier = next
  }
  return [...found]
}

async function listRequests(input: {
  employeeId?: string
  employeeIds?: string[]
  states?: LeaveState[]
  limit: number
}): Promise<LeaveRequestSummary[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const supabase = createSupabaseAdminClient()
    let query = supabase
      .from('leave_requests')
      .select(
        'id, employee_id, leave_type_id, start_date, end_date, total_days, state, reason, submitted_at, decided_at, decision_note, leave_types(name), workforce_employees!employee_id(full_name)',
      )
      .order('start_date', { ascending: false })
      .limit(input.limit)

    if (input.employeeId) query = query.eq('employee_id', input.employeeId)
    if (input.employeeIds) query = query.in('employee_id', input.employeeIds)
    if (input.states) query = query.in('state', input.states)

    const { data, error } = await query.returns<
      {
        id: string
        employee_id: string
        leave_type_id: string
        start_date: string
        end_date: string
        total_days: number
        state: LeaveState
        reason: string
        submitted_at: string | null
        decided_at: string | null
        decision_note: string | null
        leave_types: { name: string } | null
        workforce_employees: { full_name: string } | null
      }[]
    >()
    if (error) {
      logDbError('leave.requests', error)
      return []
    }

    const ids = (data ?? []).map((r) => r.id)
    const docCounts = await documentCounts(ids)

    return (data ?? []).map((r) => ({
      id: r.id,
      leaveTypeId: r.leave_type_id,
      leaveTypeName: r.leave_types?.name ?? 'Leave',
      startDate: r.start_date,
      endDate: r.end_date,
      totalDays: Number(r.total_days),
      state: r.state,
      reason: r.reason,
      submittedAt: r.submitted_at,
      decidedAt: r.decided_at,
      decisionNote: r.decision_note,
      employeeName: r.workforce_employees?.full_name ?? null,
      employeeId: r.employee_id,
      documentCount: docCounts.get(r.id) ?? 0,
    }))
  } catch (error) {
    logDbError('leave.requests', error)
    return []
  }
}

async function documentCounts(requestIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (requestIds.length === 0) return counts
  const supabase = createSupabaseAdminClient()
  const { data } = await supabase
    .from('leave_documents')
    .select('request_id')
    .in('request_id', requestIds)
    .returns<{ request_id: string }[]>()
  for (const row of data ?? []) {
    counts.set(row.request_id, (counts.get(row.request_id) ?? 0) + 1)
  }
  return counts
}

/** Approved leave in the future, for the employee's own calendar. */
export async function getUpcomingLeave(
  employee: WorkspaceEmployee,
): Promise<LeaveRequestSummary[]> {
  const all = await getMyRequests(employee, 100)
  const today = new Date().toISOString().slice(0, 10)
  return all.filter((r) => r.state === 'approved' && r.endDate >= today)
}

export async function getHolidays(from: string, to: string): Promise<HolidayRow[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('holiday_calendars')
      .select('holiday_date, observed_date, name, is_paid')
      .gte('holiday_date', from)
      .lte('holiday_date', to)
      .order('holiday_date')
      .returns<
        { holiday_date: string; observed_date: string | null; name: string; is_paid: boolean }[]
      >()
    if (error) {
      logDbError('leave.holidays', error)
      return []
    }
    return (data ?? []).map((h) => ({
      date: h.observed_date ?? h.holiday_date,
      name: h.name,
      isPaid: h.is_paid,
    }))
  } catch (error) {
    logDbError('leave.holidays', error)
    return []
  }
}

/**
 * Who is in, across the employee's own department.
 *
 * Returns WHETHER somebody is available, never WHY. "On leave" is reasonable
 * for a colleague to see; "bereavement leave" is not, and the difference is one
 * join nobody would notice was missing until it had already leaked.
 */
export async function getTeamAvailability(
  employee: WorkspaceEmployee,
  from: string,
  to: string,
): Promise<AvailabilityRow[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { data: team, error: teamError } = await supabase
      .from('workforce_employees')
      .select('id, full_name')
      .eq('department', employee.department)
      .in('status', ['Active', 'On Leave', 'Onboarding'])
      .returns<{ id: string; full_name: string }[]>()
    if (teamError) {
      logDbError('leave.team', teamError, { employeeId: employee.id })
      return []
    }
    const names = new Map((team ?? []).map((t) => [t.id, t.full_name]))
    if (names.size === 0) return []

    const { data, error } = await supabase
      .from('employee_availability')
      .select('employee_id, availability_date, status, available_fraction')
      .in('employee_id', [...names.keys()])
      .gte('availability_date', from)
      .lte('availability_date', to)
      .order('availability_date')
      .returns<
        {
          employee_id: string
          availability_date: string
          status: string
          available_fraction: number
        }[]
      >()
    if (error) {
      logDbError('leave.availability', error, { employeeId: employee.id })
      return []
    }
    return (data ?? []).map((a) => ({
      employeeId: a.employee_id,
      employeeName: names.get(a.employee_id) ?? 'Colleague',
      date: a.availability_date,
      // Deliberately NOT the leave type. Availability is shareable; the reason
      // for an absence is not.
      status: a.status,
      availableFraction: Number(a.available_fraction),
    }))
  } catch (error) {
    logDbError('leave.availability', error, { employeeId: employee.id })
    return []
  }
}
