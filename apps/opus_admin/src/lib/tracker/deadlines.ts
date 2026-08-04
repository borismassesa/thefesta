// Tracker deadlines and working days — pure, no I/O.
//
// Two acceptance criteria live here:
//
//   "Tracker deadlines respect timezone and work schedule" — a deadline is a
//   local time on a local date, converted using the unit's own schedule. 18:00
//   means 18:00 where the person works. Getting this wrong marks someone late
//   at 20:00 their time because the server is in UTC.
//
//   "Approved leave does not create missed status" — resolved by
//   resolveDayState, which the generator and the missed-marker both use, so the
//   two can never disagree about whether a day was owed.
//
// Mirrors tracker_day_state() and tracker_deadline_at() in the migration. The
// database is the enforcer; this exists so the UI can show the right thing and
// so the rules are testable without one.

export type SuppressionReason =
  | 'not_employed'
  | 'approved_leave'
  | 'public_holiday'
  | 'rest_day'

export type DayState =
  | { working: true }
  | { working: false; reason: SuppressionReason }

export type LeaveWindow = { startDate: string; endDate: string; status: string }

export type DayStateInput = {
  date: string
  /** ISO weekdays the schedule works. Monday = 1 … Sunday = 7. */
  workingWeekdays: number[]
  /** Dates that are public holidays for this schedule. */
  holidays: string[]
  /** The employee's leave. Only 'Approved' suppresses. */
  leave: LeaveWindow[]
  employmentStartDate?: string | null
  employmentStatus?: string | null
}

export function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return day === 0 ? 7 : day
}

/**
 * Is an entry owed on this date, and if not, why?
 *
 * Precedence runs strongest to weakest, and the order is deliberate:
 *
 *   not_employed    they had not started, or had left
 *   approved_leave  beats everything else a person could be doing
 *   public_holiday  the office is closed
 *   rest_day        outside the working week
 *
 * Leave outranks holiday so someone on a fortnight containing a public holiday
 * gets one consistent reason across the run rather than a confusing mixture.
 */
export function resolveDayState(input: DayStateInput): DayState {
  if (input.employmentStatus === 'Resigned' || input.employmentStatus === 'Terminated') {
    return { working: false, reason: 'not_employed' }
  }
  if (input.employmentStartDate && input.date < input.employmentStartDate) {
    return { working: false, reason: 'not_employed' }
  }

  // Pending leave is a request, not an absence. Only approved leave suppresses,
  // or anyone could excuse themselves by filing a request they never got.
  const onLeave = input.leave.some(
    (l) => l.status === 'Approved' && input.date >= l.startDate && input.date <= l.endDate,
  )
  if (onLeave) return { working: false, reason: 'approved_leave' }

  if (input.holidays.includes(input.date)) return { working: false, reason: 'public_holiday' }

  if (!input.workingWeekdays.includes(isoWeekday(input.date))) {
    return { working: false, reason: 'rest_day' }
  }

  return { working: true }
}

/**
 * The instant an entry for `date` is due.
 *
 * Returns an ISO string built from the local date and the schedule's UTC offset,
 * so the comparison against `now` is a real instant rather than a string
 * compare. `offsetMinutes` is the schedule timezone's offset from UTC (East
 * Africa Time is +180).
 */
export function deadlineAt(input: {
  date: string
  /** 'HH:MM' or 'HH:MM:SS' local time. */
  deadlineTime: string
  offsetMinutes: number
}): string {
  const [hh, mm] = input.deadlineTime.split(':').map(Number)
  const [y, m, d] = input.date.split('-').map(Number)
  const utcMs = Date.UTC(y, m - 1, d, hh, mm) - input.offsetMinutes * 60_000
  return new Date(utcMs).toISOString()
}

/** Deadline plus grace: the moment an unfilled entry becomes missed. */
export function missedAfter(deadlineIso: string, graceMinutes: number): string {
  return new Date(new Date(deadlineIso).getTime() + Math.max(0, graceMinutes) * 60_000).toISOString()
}

export type EntrySnapshot = {
  status: string
  submittedAt: string | null
  deadlineAt: string | null
  suppressionReason: string | null
}

/**
 * Should this entry be marked missed right now?
 *
 * Mirrors tracker_mark_missed(). Every guard matters:
 *   a suppressed day is never missed, whatever else is true;
 *   an entry with no deadline cannot be late;
 *   a submitted entry is late at worst, never missed;
 *   an entry already in a terminal status is left alone.
 */
export function shouldMarkMissed(
  entry: EntrySnapshot,
  graceMinutes: number,
  now: string,
): boolean {
  if (entry.suppressionReason) return false
  if (!entry.deadlineAt) return false
  if (entry.submittedAt) return false
  if (entry.status !== 'not_started' && entry.status !== 'in_progress') return false
  return now > missedAfter(entry.deadlineAt, graceMinutes)
}

/** Was a submission late? Late is not missed: the work was filed, just after time. */
export function isLate(submittedAtIso: string, deadlineIso: string | null): boolean {
  if (!deadlineIso) return false
  return submittedAtIso > deadlineIso
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/**
 * The next date on or after `from` that is actually worked.
 *
 * This is where a Friday item lands on Monday rather than on a Saturday nobody
 * reads. Bounded so a schedule with no working days at all returns null instead
 * of looping.
 */
export function nextWorkingDay(
  from: string,
  resolve: (date: string) => DayState,
  maxLookahead = 14,
): string | null {
  let cursor = from
  for (let i = 0; i < maxLookahead; i += 1) {
    if (resolve(cursor).working) return cursor
    cursor = addDays(cursor, 1)
  }
  return null
}

/** Working days in an inclusive range. The denominator for a completion rate. */
export function workingDaysBetween(
  start: string,
  end: string,
  resolve: (date: string) => DayState,
): string[] {
  const days: string[] = []
  let cursor = start
  // Bounded: a reversed or absurd range must not spin.
  for (let i = 0; i < 400 && cursor <= end; i += 1) {
    if (resolve(cursor).working) days.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return days
}

export { addDays }
