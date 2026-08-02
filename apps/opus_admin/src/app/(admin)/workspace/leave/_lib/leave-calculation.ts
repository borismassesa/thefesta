// Pure leave calculation. No imports, no I/O, no `server-only`.
//
// THIS IS THE CANONICAL IMPLEMENTATION. It was extracted verbatim from
// workforce/leave/actions.ts, which held it inline, so that the Workspace and
// Workforce surfaces cannot drift into two different answers for "how many
// days is this" or "does this touch the balance". Both now import from here.
//
// Deliberately NOT changed during extraction: duration counts CALENDAR days,
// not working days. There is no holiday calendar in the schema and no
// working-day logic anywhere in the codebase, so introducing one here would
// silently change every existing request's arithmetic. Phase 5 adds the
// holiday calendar; that is the point to revisit this, as one deliberate
// change with a migration for historical rows, not as a side effect of
// building a new screen.

export type LeaveType =
  | 'Annual'
  | 'Sick'
  | 'Maternity'
  | 'Paternity'
  | 'Compassionate'
  | 'Unpaid'

export const LEAVE_TYPES: readonly LeaveType[] = [
  'Annual',
  'Sick',
  'Maternity',
  'Paternity',
  'Compassionate',
  'Unpaid',
] as const

export function isLeaveType(value: string): value is LeaveType {
  return (LEAVE_TYPES as readonly string[]).includes(value)
}

/**
 * Inclusive calendar-day count between two ISO dates.
 *
 * Matches workforce/leave/actions.ts:20 exactly, including the Math.max(1, …)
 * floor: a same-day request is one day, never zero.
 */
export function daysBetween(startDate: string, endDate: string): number {
  const s = new Date(startDate)
  const e = new Date(endDate)
  return Math.max(1, Math.floor((e.getTime() - s.getTime()) / 86400000) + 1)
}

/**
 * Which leave types draw down the annual balance.
 *
 * Only 'Annual' does. Sick, Maternity, Paternity and Compassionate are
 * separately entitled, and Unpaid by definition costs no balance. This
 * mirrors the deduction rule in decideLeaveRequest, which fires only for
 * Annual on approval.
 */
export function affectsBalance(type: LeaveType): boolean {
  return type === 'Annual'
}

/**
 * Balance remaining if this request were approved. Never returns a negative,
 * matching the Math.max(0, …) clamp the approval path applies when it writes.
 */
export function balanceAfter(
  currentBalance: number,
  type: LeaveType,
  days: number,
): number {
  if (!affectsBalance(type)) return currentBalance
  return Math.max(0, currentBalance - days)
}

/** Would this request exceed the available balance? */
export function exceedsBalance(
  currentBalance: number,
  type: LeaveType,
  days: number,
): boolean {
  return affectsBalance(type) && days > currentBalance
}

export type DateRange = { startDate: string; endDate: string }

/**
 * Do two inclusive date ranges overlap at all?
 *
 * String comparison is safe here because all dates are ISO `YYYY-MM-DD`,
 * which sorts lexicographically in calendar order.
 */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate
}
