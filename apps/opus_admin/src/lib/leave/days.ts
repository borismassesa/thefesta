// Expanding a leave request into the days it actually costs — pure, no I/O.
//
// A date range and an integer day count cannot express a half day, cannot skip
// a public holiday in the middle of a fortnight, and cannot be checked for
// overlap against somebody's existing half day. One row per day can do all
// three, and this is where the rows are worked out.
//
// Mirrors leave_expand_days() and the overlap trigger in the migration.

export const LEAVE_PORTIONS = ['full', 'half_am', 'half_pm', 'hours'] as const
export type LeavePortion = (typeof LEAVE_PORTIONS)[number]

export const PORTION_LABELS: Record<LeavePortion, string> = {
  full: 'Full day',
  half_am: 'Half day (morning)',
  half_pm: 'Half day (afternoon)',
  hours: 'Hours',
}

export type LeaveDay = {
  date: string
  portion: LeavePortion
  hours: number | null
  /** The fraction of a working day consumed. The overlap guard sums this. */
  dayFraction: number
}

export type ExpandInput = {
  startDate: string
  endDate: string
  portion: LeavePortion
  /** Only for portion 'hours'. */
  hours?: number | null
  /** ISO weekdays worked, Monday = 1. */
  workingWeekdays: number[]
  /** Dates that are public holidays. */
  holidays: string[]
  /** Length of a standard working day, for converting hours to a fraction. */
  standardDailyHours?: number
}

export function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return day === 0 ? 7 : day
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

export function fractionFor(
  portion: LeavePortion,
  hours: number | null | undefined,
  standardDailyHours = 8,
): number {
  switch (portion) {
    case 'full': return 1
    case 'half_am':
    case 'half_pm': return 0.5
    case 'hours': {
      const daily = Math.max(1, standardDailyHours)
      // Clamped to one day: eleven hours of leave in an eight-hour day is still
      // one day of leave, not 1.375.
      return round3(Math.min(1, Math.max(0.001, (hours ?? 0) / daily)))
    }
  }
}

/**
 * Turn a request into the days it consumes.
 *
 * Rest days and public holidays inside the range contribute nothing, which is
 * why a Friday-to-Monday request costs two days and a fortnight over Christmas
 * does not spend the public holidays.
 */
export function expandLeaveDays(input: ExpandInput): LeaveDay[] {
  const days: LeaveDay[] = []
  if (input.endDate < input.startDate) return days

  const fraction = fractionFor(input.portion, input.hours, input.standardDailyHours)
  const holidays = new Set(input.holidays)

  let cursor = input.startDate
  // Bounded so a reversed or absurd range cannot spin.
  for (let i = 0; i < 400 && cursor <= input.endDate; i += 1) {
    const isWorkingWeekday = input.workingWeekdays.includes(isoWeekday(cursor))
    if (isWorkingWeekday && !holidays.has(cursor)) {
      days.push({
        date: cursor,
        portion: input.portion,
        hours: input.portion === 'hours' ? (input.hours ?? null) : null,
        dayFraction: fraction,
      })
    }
    cursor = addDays(cursor, 1)
  }

  return days
}

/** The billable total: what the ledger will be debited. */
export function totalDays(days: LeaveDay[]): number {
  return round3(days.reduce((acc, d) => acc + d.dayFraction, 0))
}

export type OverlapConflict = { date: string; alreadyCommitted: number; requested: number }

/**
 * Which of these days clash with what is already committed.
 *
 * The rule is a sum, not an equality: two half days on one date are fine, a
 * half and a full are not. Expressing it as a fraction sum is what lets
 * morning-off and afternoon-off coexist without a special case.
 */
export function findOverlaps(
  requested: LeaveDay[],
  committedByDate: Map<string, number>,
): OverlapConflict[] {
  const conflicts: OverlapConflict[] = []
  for (const day of requested) {
    const committed = committedByDate.get(day.date) ?? 0
    // Tolerance for the 3-decimal rounding of hourly fractions.
    if (committed + day.dayFraction > 1.0001) {
      conflicts.push({
        date: day.date,
        alreadyCommitted: round3(committed),
        requested: day.dayFraction,
      })
    }
  }
  return conflicts
}

export type ValidationInput = {
  days: LeaveDay[]
  portion: LeavePortion
  allowsPartialDay: boolean
  allowsHourly: boolean
  minNoticeDays: number
  maxConsecutiveDays: number | null
  startDate: string
  today: string
}

export type LeaveValidation =
  | { ok: true; totalDays: number }
  | { ok: false; reason: string }

/** Everything checkable before the balance is consulted. */
export function validateRequest(input: ValidationInput): LeaveValidation {
  if (input.days.length === 0) {
    // Every day in the range was a holiday or a rest day.
    return { ok: false, reason: 'no_working_days' }
  }
  if (input.portion !== 'full' && !input.allowsPartialDay) {
    return { ok: false, reason: 'partial_not_allowed' }
  }
  if (input.portion === 'hours' && !input.allowsHourly) {
    return { ok: false, reason: 'hourly_not_allowed' }
  }
  if (input.minNoticeDays > 0) {
    const earliest = addDays(input.today, input.minNoticeDays)
    if (input.startDate < earliest) return { ok: false, reason: 'insufficient_notice' }
  }

  const total = totalDays(input.days)
  if (input.maxConsecutiveDays !== null && total > input.maxConsecutiveDays) {
    return { ok: false, reason: 'exceeds_maximum' }
  }

  return { ok: true, totalDays: total }
}

/**
 * A partial day is still a working day.
 *
 * Someone on half a day's leave was in for the other half, so attendance and
 * the tracker still expect something from them. Only a full day suppresses,
 * and getting this backwards would silently excuse half the company.
 */
export function suppressesWholeDay(day: LeaveDay): boolean {
  return day.dayFraction >= 1
}
