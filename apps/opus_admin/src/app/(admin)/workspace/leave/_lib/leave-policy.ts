import { rangesOverlap, type DateRange, type LeaveType } from './leave-calculation'
import { daysRemainingInYear, exceedsYearAllowance, leaveYearFor } from './leave-year'

// Pure personal-leave policy. No imports beyond sibling pure modules, no I/O.
//
// Answers only "may THIS employee do THIS to THIS request". Manager and
// org-wide decisions (approve, reject, adjust balances) are deliberately
// absent: they arrive in Phase 3C with the approvers who action them.
//
// The client never defines a legal transition. Every mutation re-reads the
// stored row, confirms ownership, and asks this module.

export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'

export type StoredRequest = {
  id: string
  employeeId: string
  status: LeaveStatus
  startDate: string
  endDate: string
  /** Needed for leave-year arithmetic; already stored on every row. */
  days: number
}

export type PolicyDecision =
  | { allowed: true }
  | { allowed: false; reason: string }

const allow = (): PolicyDecision => ({ allowed: true })
const deny = (reason: string): PolicyDecision => ({ allowed: false, reason })

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

/**
 * The single ownership predicate. Every personal mutation runs through it.
 *
 * Note this compares against the SERVER-RESOLVED employee id from
 * requireSelfEmployee, never against anything the client supplied. The
 * IDOR invariant is that no public Workspace boundary accepts an employee_id
 * at all; this is the second line of defence for internal helpers that do.
 */
export function ownsRequest(request: StoredRequest, selfEmployeeId: string): boolean {
  return request.employeeId === selfEmployeeId
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------
// What an EMPLOYEE may do to their own request, given the four statuses the
// schema actually has:
//
//   (new)     -> Pending      create
//   Pending   -> Pending      edit dates / type / reason
//   Pending   -> Cancelled    withdraw
//   Approved  -> (nothing)    see below
//   Rejected  -> (nothing)    raise a fresh request instead
//   Cancelled -> (nothing)    terminal
//
// Approved leave is deliberately NOT self-cancellable. Once approved, rotas,
// payroll and cover may already depend on it, so releasing it is a decision
// someone else has to make. The safer "withdrawal request" flow needs a status
// the schema does not have and an approver to action it, so it lands in 3C
// rather than being faked here as a straight cancel.

export function canEditRequest(
  request: StoredRequest,
  selfEmployeeId: string,
): PolicyDecision {
  if (!ownsRequest(request, selfEmployeeId)) {
    return deny('That request belongs to someone else.')
  }
  if (request.status === 'Pending') return allow()
  if (request.status === 'Approved') {
    return deny(
      'This leave is already approved. Ask People Ops if you need it changed, since cover may already be arranged.',
    )
  }
  return deny(`A ${request.status.toLowerCase()} request can no longer be edited.`)
}

export function canWithdrawRequest(
  request: StoredRequest,
  selfEmployeeId: string,
): PolicyDecision {
  if (!ownsRequest(request, selfEmployeeId)) {
    return deny('That request belongs to someone else.')
  }
  if (request.status === 'Pending') return allow()
  if (request.status === 'Approved') {
    return deny(
      'Approved leave cannot be withdrawn here. Contact People Ops so cover can be adjusted.',
    )
  }
  return deny(`A ${request.status.toLowerCase()} request cannot be withdrawn.`)
}

/**
 * Employees never decide their own outcome. Stated as an explicit rule rather
 * than left implicit in the absence of an approve action, so that adding one
 * later cannot quietly skip the check.
 */
export function canApproveOwnRequest(): PolicyDecision {
  return deny('You cannot approve or reject your own leave request.')
}

// ---------------------------------------------------------------------------
// Creation eligibility
// ---------------------------------------------------------------------------

/** Statuses that still hold the dates, so a new request may not overlap them. */
const BLOCKING_STATUSES: readonly LeaveStatus[] = ['Pending', 'Approved']

export type CreateCheckInput = {
  type: LeaveType
  startDate: string
  endDate: string
  days: number
  /** The employee's own existing requests. */
  existing: readonly StoredRequest[]
  /** Excluded from the overlap check when editing an existing request. */
  ignoreRequestId?: string
}

export function canCreateRequest(input: CreateCheckInput): PolicyDecision {
  if (input.endDate < input.startDate) {
    return deny('The end date must be on or after the start date.')
  }
  if (input.days < 1) {
    return deny('A leave request must cover at least one day.')
  }

  const range: DateRange = { startDate: input.startDate, endDate: input.endDate }
  const clash = input.existing.find(
    (r) =>
      r.id !== input.ignoreRequestId &&
      BLOCKING_STATUSES.includes(r.status) &&
      rangesOverlap(range, { startDate: r.startDate, endDate: r.endDate }),
  )
  if (clash) {
    return deny(
      `You already have a ${clash.status.toLowerCase()} request covering ${clash.startDate} to ${clash.endDate}.`,
    )
  }

  // Checked against the allowance for the leave year the request falls in,
  // so booking into next January is measured against next year's 28 days
  // rather than what is left of this year's.
  if (exceedsYearAllowance(input.existing, input.startDate, input.days)) {
    const year = leaveYearFor(input.startDate)
    const left = daysRemainingInYear(input.existing, year)
    return deny(
      `That is ${input.days} days but you have ${left} left for ${year.label}. Every leave type comes out of the same 28 days.`,
    )
  }

  return allow()
}
