// Pure date/cadence maths for Workspace Home.
//
// Split out of home.ts (which is 'server-only') so it can be unit-tested and so
// a client component can import it without dragging Supabase into the browser
// bundle — a pure function exported from a server-only module breaks the
// Turbopack production build the moment that happens.
//
// Everything here works on 'YYYY-MM-DD' strings in the employee's timezone.
// Date objects are only used at the edges, because "is this report overdue"
// must be answered in the employee's day, not the server's.

export type ReportCadence = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly'

/** 'YYYY-MM-DD' for `now` as seen in `timeZone`. */
export function localDate(now: Date, timeZone: string): string {
  // en-CA renders ISO-shaped dates (2026-08-02), which is why it is used here
  // rather than assembling parts by hand.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** ISO weekday for a 'YYYY-MM-DD' date: Monday = 1 … Sunday = 7. */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  // UTC on purpose: the string already names a calendar day, so no timezone
  // shift should be applied to it a second time.
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // Sun = 0
  return jsDay === 0 ? 7 : jsDay
}

/** Add days to a 'YYYY-MM-DD' date, returning the same format. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + days))
  return next.toISOString().slice(0, 10)
}

/** Whole days from `from` to `to`. Negative when `to` is in the past. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  const ms = Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)
  return Math.round(ms / 86_400_000)
}

/** The leave year `date` falls in. Calendar year — matches leave-balances.ts. */
export function leaveYearBounds(date: string): { start: string; end: string } {
  const year = date.slice(0, 4)
  return { start: `${year}-01-01`, end: `${year}-12-31` }
}

/**
 * How long one cadence period runs, in days. Approximate for month and quarter
 * on purpose: this decides "is a report late", where a day either side of a
 * month boundary changes nothing that matters, and an exact calendar walk would
 * add a class of off-by-one bugs for no gain.
 */
const CADENCE_DAYS: Record<ReportCadence, number> = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 91,
}

export type ReportDueState = 'due' | 'overdue' | 'ok'

/**
 * Whether a recurring report needs attention today.
 *
 * `lastSubmitted` is the most recent submitted report_date for this template
 * and employee, or null if they have never filed one.
 *
 *   ok       — filed within the current period.
 *   due      — the period has elapsed; today is the day to file.
 *   overdue  — a full period has elapsed on top of that.
 *
 * A template never filed is 'due' from the employee's start date and 'overdue'
 * once a period has passed since then, so a new joiner is not immediately shown
 * a wall of red.
 */
export function reportDueState(
  cadence: ReportCadence,
  lastSubmitted: string | null,
  today: string,
  startedOn: string,
): ReportDueState {
  const period = CADENCE_DAYS[cadence]
  const since = lastSubmitted ?? startedOn
  const elapsed = daysBetween(since, today)
  if (elapsed < period) return 'ok'
  if (elapsed < period * 2) return 'due'
  return 'overdue'
}

export type TaskUrgency = 'overdue' | 'today' | 'upcoming' | 'none'

export function taskUrgency(dueDate: string | null, today: string): TaskUrgency {
  if (!dueDate) return 'none'
  const delta = daysBetween(today, dueDate)
  if (delta < 0) return 'overdue'
  if (delta === 0) return 'today'
  return 'upcoming'
}

/**
 * Count weekdays (Mon–Fri) in [start, end], clipped to [clipStart, clipEnd].
 * Leave is counted in working days, so a Friday-to-Monday absence is 2 days,
 * not 4. Mirrors workforce/_lib/leave-days.ts, restated here because Home must
 * not import a server-only module.
 */
export function countWeekdaysOverlapping(
  start: string,
  end: string,
  clipStart: string,
  clipEnd: string,
): number {
  const from = start > clipStart ? start : clipStart
  const to = end < clipEnd ? end : clipEnd
  if (from > to) return 0

  let count = 0
  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) {
    const weekday = isoWeekday(cursor)
    if (weekday <= 5) count += 1
    // Guard against a malformed range spinning forever.
    if (count > 400) break
  }
  return count
}
