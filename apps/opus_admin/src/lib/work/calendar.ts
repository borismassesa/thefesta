// Calendar merging — pure, no I/O.
//
// "Calendar entries respect employee timezone" is the acceptance criterion, and
// it is mostly about which DAY something lands on. A meeting at 23:00 East
// Africa Time is a today meeting; computing its date in UTC puts it on
// tomorrow, and the employee misses it.
//
// Mirrors work_calendar() in the migration, which does the same merge in SQL.
// Nothing here is stored: leave, holidays, shifts, task due dates and report
// deadlines are read from the modules that own them, so the calendar cannot
// drift from them.

export const CALENDAR_SOURCES = [
  'meeting',
  'task',
  'leave',
  'holiday',
  'shift',
  'report_due',
  'tracker_due',
  'milestone',
] as const

export type CalendarSource = (typeof CALENDAR_SOURCES)[number]

export const SOURCE_LABELS: Record<CalendarSource, string> = {
  meeting: 'Meeting',
  task: 'Task due',
  leave: 'Leave',
  holiday: 'Public holiday',
  shift: 'Shift',
  report_due: 'Report due',
  tracker_due: 'Tracker due',
  milestone: 'Milestone',
}

export type CalendarEntry = {
  source: CalendarSource
  /** The local calendar date this belongs on, in the employee's timezone. */
  date: string
  /** Null for all-day entries. */
  startsAt: string | null
  endsAt: string | null
  allDay: boolean
  title: string
  detail: string | null
  refId: string | null
}

/**
 * The local calendar date of an instant, in a timezone.
 *
 * Uses Intl rather than offset arithmetic so it stays correct across DST in any
 * timezone the platform is later used in, not just East Africa Time which has
 * none.
 */
export function localDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

export function localTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/**
 * Place a timed entry on the right local day.
 *
 * The regression this exists to prevent: a 23:00 EAT meeting stored as
 * 20:00 UTC appearing on tomorrow's column.
 */
export function placeEntry(
  entry: Omit<CalendarEntry, 'date'> & { date?: string },
  timeZone: string,
): CalendarEntry {
  const date =
    entry.startsAt && !entry.allDay
      ? localDate(entry.startsAt, timeZone)
      : (entry.date ?? (entry.startsAt ? localDate(entry.startsAt, timeZone) : ''))
  return { ...entry, date }
}

/** Ordering within a day: all-day context first, then timed entries by start. */
const SOURCE_RANK: Record<CalendarSource, number> = {
  holiday: 0,
  leave: 1,
  shift: 2,
  meeting: 3,
  tracker_due: 4,
  report_due: 5,
  milestone: 6,
  task: 7,
}

export function sortEntries(entries: CalendarEntry[]): CalendarEntry[] {
  return [...entries].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      Number(b.allDay) - Number(a.allDay) ||
      SOURCE_RANK[a.source] - SOURCE_RANK[b.source] ||
      (a.startsAt ?? '').localeCompare(b.startsAt ?? '') ||
      a.title.localeCompare(b.title),
  )
}

export type CalendarDay = {
  date: string
  entries: CalendarEntry[]
  isHoliday: boolean
  isOnLeave: boolean
}

/**
 * Group entries into a continuous run of days.
 *
 * Every day in the range appears, including empty ones: a calendar that skips
 * quiet days is a list, and reading it as a week becomes guesswork.
 */
export function buildDays(entries: CalendarEntry[], from: string, to: string): CalendarDay[] {
  const byDate = new Map<string, CalendarEntry[]>()
  for (const entry of sortEntries(entries)) {
    if (entry.date < from || entry.date > to) continue
    const list = byDate.get(entry.date) ?? []
    list.push(entry)
    byDate.set(entry.date, list)
  }

  const days: CalendarDay[] = []
  let cursor = from
  for (let i = 0; i < 400 && cursor <= to; i += 1) {
    const dayEntries = byDate.get(cursor) ?? []
    days.push({
      date: cursor,
      entries: dayEntries,
      isHoliday: dayEntries.some((e) => e.source === 'holiday'),
      // Only a full day of leave marks the day as away; a half day still has
      // work in it.
      isOnLeave: dayEntries.some((e) => e.source === 'leave' && e.allDay),
    })
    cursor = addDays(cursor, 1)
  }
  return days
}

/** Entries that represent a commitment the employee owes, for the summary row. */
export function commitments(entries: CalendarEntry[]): CalendarEntry[] {
  return entries.filter(
    (e) => e.source === 'task' || e.source === 'report_due' || e.source === 'tracker_due' || e.source === 'milestone',
  )
}

/**
 * Does this day already have a conflicting commitment?
 *
 * Used when proposing a meeting: booking one on somebody's approved leave or a
 * public holiday is the commonest scheduling mistake.
 */
export function conflictsOn(day: CalendarDay): CalendarSource[] {
  const conflicts: CalendarSource[] = []
  if (day.isHoliday) conflicts.push('holiday')
  if (day.isOnLeave) conflicts.push('leave')
  return conflicts
}
