// Reporting periods and due dates — pure, no I/O.
//
// This is what makes obligations generate themselves: given a cadence and a
// date, it says which period that date falls in, when the report for it is due,
// and when it becomes overdue. The background job walks templates and calls
// these; nobody types a due date.
//
// All arithmetic is on 'YYYY-MM-DD' strings so a period boundary is a calendar
// fact rather than an instant that shifts with a timezone. Weeks are ISO:
// Monday starts them, which matches working_weekdays in the attendance module.

export const REPORT_CADENCES = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly'] as const
export type ReportCadence = (typeof REPORT_CADENCES)[number]

export const REPORT_CADENCE_LABELS: Record<ReportCadence, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
}

export type ReportPeriod = {
  start: string
  end: string
  /** Human label: "Week of 3 Aug 2026", "August 2026", "Q3 2026". */
  label: string
}

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number)
  return [y, m, d]
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = parts(date)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function addMonths(date: string, months: number): string {
  const [y, m, d] = parts(date)
  // Day 0 of the following month is the last day of the target month, which
  // clamps 31 January + 1 month to 28 February instead of rolling into March.
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, lastDay)))
    .toISOString()
    .slice(0, 10)
}

/** ISO weekday: Monday = 1 … Sunday = 7. */
export function isoWeekday(date: string): number {
  const [y, m, d] = parts(date)
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return day === 0 ? 7 : day
}

export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = parts(from)
  const [ty, tm, td] = parts(to)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function formatDay(date: string): string {
  const [y, m, d] = parts(date)
  return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`
}

/**
 * Biweekly periods need a fixed origin or they drift: "every two weeks from
 * whenever you asked" produces different periods depending on when the job ran.
 * Anchored to the ISO week containing 2026-01-05 (a Monday), so the boundaries
 * are the same whoever asks and whenever they ask.
 */
const BIWEEKLY_ANCHOR = '2026-01-05'

/** The period a date falls in, for a cadence. */
export function periodFor(cadence: ReportCadence, date: string): ReportPeriod {
  switch (cadence) {
    case 'daily':
      return { start: date, end: date, label: formatDay(date) }

    case 'weekly': {
      const start = addDays(date, -(isoWeekday(date) - 1))
      return { start, end: addDays(start, 6), label: `Week of ${formatDay(start)}` }
    }

    case 'biweekly': {
      const weekStart = addDays(date, -(isoWeekday(date) - 1))
      const weeksFromAnchor = Math.floor(daysBetween(BIWEEKLY_ANCHOR, weekStart) / 7)
      // Math.floor on a negative remainder keeps periods aligned before the
      // anchor too, so a backfill of last year does not produce ragged bounds.
      const start = addDays(weekStart, weeksFromAnchor % 2 === 0 ? 0 : -7)
      return { start, end: addDays(start, 13), label: `Fortnight of ${formatDay(start)}` }
    }

    case 'monthly': {
      const [y, m] = parts(date)
      const start = `${y}-${String(m).padStart(2, '0')}-01`
      const end = addDays(addMonths(start, 1), -1)
      return { start, end, label: `${MONTHS[m - 1]} ${y}` }
    }

    case 'quarterly': {
      const [y, m] = parts(date)
      const quarter = Math.floor((m - 1) / 3)
      const startMonth = quarter * 3 + 1
      const start = `${y}-${String(startMonth).padStart(2, '0')}-01`
      const end = addDays(addMonths(start, 3), -1)
      return { start, end, label: `Q${quarter + 1} ${y}` }
    }
  }
}

/** The period immediately before the one containing `date`. */
export function previousPeriod(cadence: ReportCadence, date: string): ReportPeriod {
  const current = periodFor(cadence, date)
  return periodFor(cadence, addDays(current.start, -1))
}

/** The period immediately after. */
export function nextPeriod(cadence: ReportCadence, date: string): ReportPeriod {
  const current = periodFor(cadence, date)
  return periodFor(cadence, addDays(current.end, 1))
}

/**
 * When the report for a period is due.
 *
 * Measured from the period END, not the start: a monthly report is due some
 * days after the month it covers, because it cannot be written before the month
 * has happened. `dueOffsetDays` of 0 means due on the last day of the period.
 */
export function dueDateFor(period: ReportPeriod, dueOffsetDays: number): string {
  return addDays(period.end, Math.max(0, dueOffsetDays))
}

export type ObligationStatus = 'upcoming' | 'open' | 'due_today' | 'overdue'

/**
 * Where an obligation stands on a given day.
 *
 *   upcoming  — the period has not ended, so nothing is expected yet.
 *   open      — the period has ended and the due date has not passed.
 *   due_today — the last day to file.
 *   overdue   — past the due date plus any grace.
 *
 * Grace exists so a report due Saturday is not flagged overdue before anyone is
 * back at work on Monday.
 */
export function obligationStatus(input: {
  period: ReportPeriod
  dueDate: string
  graceDays: number
  today: string
}): ObligationStatus {
  const { period, dueDate, graceDays, today } = input
  if (today < period.end) return 'upcoming'
  if (today < dueDate) return 'open'
  if (today === dueDate) return 'due_today'
  return daysBetween(dueDate, today) > Math.max(0, graceDays) ? 'overdue' : 'open'
}

/**
 * Every period of `cadence` that ended within the lookback window, most recent
 * first. This is what the obligation generator walks: it creates obligations
 * for periods that have finished, never for one still running, because a report
 * cannot be owed for a month that has not happened.
 *
 * `lookbackPeriods` is capped so a template activated today does not generate
 * two years of retroactive obligations for someone who was not employed then.
 */
export function closedPeriodsSince(
  cadence: ReportCadence,
  today: string,
  lookbackPeriods: number,
): ReportPeriod[] {
  const periods: ReportPeriod[] = []
  const capped = Math.max(0, Math.min(lookbackPeriods, 24))
  // Start from the period before the one currently running.
  let cursor = previousPeriod(cadence, today)
  for (let i = 0; i < capped; i += 1) {
    if (cursor.end >= today) {
      cursor = periodFor(cadence, addDays(cursor.start, -1))
      continue
    }
    periods.push(cursor)
    cursor = periodFor(cadence, addDays(cursor.start, -1))
  }
  return periods
}

/** Days late, or 0. Used for reminder escalation and the overdue badge. */
export function daysOverdue(dueDate: string, today: string): number {
  return Math.max(0, daysBetween(dueDate, today))
}
