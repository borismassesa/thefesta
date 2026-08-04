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
 * The company's annual leave allowance, in days.
 *
 * A single pool covering EVERY leave type. There is no per-type entitlement
 * and no separate sick or compassionate allowance.
 */
export const ANNUAL_ENTITLEMENT_DAYS = 28

/**
 * Which leave types draw down the balance. ALL of them.
 *
 * Confirmed as company policy: the 28 days are one pool, and it does not
 * matter whether a day is taken as Sick, Compassionate, Maternity, Paternity
 * or Annual — it comes out of the same allowance.
 *
 * This CORRECTS the previous rule, which deducted only for 'Annual'. Under
 * that rule an employee could take months of Sick or Compassionate leave with
 * their balance untouched, which is exactly what the live data shows: one
 * employee has 98 approved days and still reads 28 of 28 remaining.
 *
 * Kept as a function rather than inlined as `true` because Unpaid is the one
 * type where this deserves a second look — unpaid leave drawing down a paid
 * allowance is unusual — and this is where that exception would go.
 */
export function affectsBalance(_type: LeaveType): boolean {
  return true
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
