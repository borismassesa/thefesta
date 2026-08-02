import { ANNUAL_ENTITLEMENT_DAYS } from './leave-calculation'

// Pure leave-year policy. No imports beyond the sibling constant, no I/O.
//
// THE PROBLEM THIS SOLVES
//
// The company grants 28 days PER YEAR, but nothing in the system had a year.
// `workforce_employees.leave_balance_days` was a single running counter,
// decremented on approval and never reset, so:
//
//   - the allowance never renewed; a balance spent in 2026 stayed spent
//   - the counter drifted from reality whenever the deduction rule changed,
//     which is exactly what happened when only Annual was deducted: one
//     employee had 98 approved days and still read 28 of 28 remaining
//   - two approvals racing could both decrement it
//
// A stored mutable counter is the wrong shape for this. The balance is not a
// fact to be maintained; it is a CONSEQUENCE of approved leave within a
// period. Deriving it makes drift impossible, makes the annual reset
// automatic, and removes the balance from the concurrency surface entirely.

/**
 * The month and day the leave year starts on. 1 January.
 *
 * Kept as a named constant because it is a policy choice, not a law of
 * nature: some organisations run the leave year from the fiscal year or from
 * each employee's start date. Changing it here changes it everywhere.
 */
export const LEAVE_YEAR_START_MONTH = 1 // January
export const LEAVE_YEAR_START_DAY = 1

export type LeaveYear = {
  /** Label, e.g. "2026". */
  label: string
  /** Inclusive ISO start date. */
  startDate: string
  /** Inclusive ISO end date. */
  endDate: string
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * The leave year containing an ISO date.
 *
 * With a 1 January start this is simply the calendar year. The arithmetic is
 * written generally so moving the start date does not require rewriting it.
 */
export function leaveYearFor(isoDate: string): LeaveYear {
  const [y, m, d] = isoDate.split('-').map(Number)
  const startsThisYear =
    m > LEAVE_YEAR_START_MONTH ||
    (m === LEAVE_YEAR_START_MONTH && d >= LEAVE_YEAR_START_DAY)
  const startYear = startsThisYear ? y : y - 1

  const startDate = iso(startYear, LEAVE_YEAR_START_MONTH, LEAVE_YEAR_START_DAY)
  // One day before the same point next year.
  const endExclusive = new Date(
    Date.UTC(startYear + 1, LEAVE_YEAR_START_MONTH - 1, LEAVE_YEAR_START_DAY),
  )
  endExclusive.setUTCDate(endExclusive.getUTCDate() - 1)
  const endDate = endExclusive.toISOString().slice(0, 10)

  const label =
    LEAVE_YEAR_START_MONTH === 1 && LEAVE_YEAR_START_DAY === 1
      ? String(startYear)
      : `${startYear}/${startYear + 1}`

  return { label, startDate, endDate }
}

export function isInLeaveYear(isoDate: string, year: LeaveYear): boolean {
  // ISO dates sort lexicographically in calendar order.
  return isoDate >= year.startDate && isoDate <= year.endDate
}

export type CountableRequest = {
  status: string
  startDate: string
  days: number
}

/**
 * Days consumed within a leave year.
 *
 * Counted by the request's START date. A request spanning the year boundary
 * therefore falls wholly into the year it began in, rather than being split.
 * That is the simpler rule and matches how the days figure is already stored
 * as a single total on the row; splitting would require recomputing the
 * portion either side, which the schema cannot express.
 *
 * Only Approved counts. Pending is not yet consumed, and Rejected and
 * Cancelled never were.
 */
export function daysTakenInYear(
  requests: readonly CountableRequest[],
  year: LeaveYear,
): number {
  return requests
    .filter((r) => r.status === 'Approved' && isInLeaveYear(r.startDate, year))
    .reduce((sum, r) => sum + r.days, 0)
}

/**
 * Days remaining in a leave year. Never negative.
 *
 * `adjustmentDays` carries anything the entitlement alone cannot express:
 * carry-over from last year, a pro-rated allowance for someone who joined
 * mid-year, or a manual correction. Zero for the common case.
 *
 * NOTE: pro-rating for mid-year joiners is NOT currently applied anywhere.
 * workforce_employees.start_date exists, so it could be, but whether a
 * October joiner gets 28 days or 7 is a policy decision nobody has stated.
 * Until then everyone gets the full entitlement regardless of start date.
 */
export function daysRemainingInYear(
  requests: readonly CountableRequest[],
  year: LeaveYear,
  adjustmentDays = 0,
): number {
  const taken = daysTakenInYear(requests, year)
  return Math.max(0, ANNUAL_ENTITLEMENT_DAYS + adjustmentDays - taken)
}

/** Would this request exceed the remaining allowance for its leave year? */
export function exceedsYearAllowance(
  requests: readonly CountableRequest[],
  startDate: string,
  days: number,
  adjustmentDays = 0,
): boolean {
  const year = leaveYearFor(startDate)
  return days > daysRemainingInYear(requests, year, adjustmentDays)
}
