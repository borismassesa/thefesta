// How many working days a leave range costs, for the workforce UI.
//
// The authority is leave_expand_days() in the database, which reads the
// employee's own work_schedules.working_weekdays and also skips public
// holidays. This is the display-side approximation, so it takes the working
// week as a parameter rather than assuming one: it used to hardcode Mon-Fri,
// which quietly made every Saturday of leave free once Saturday became a
// working day.

import { COMPANY_WORKING_WEEKDAYS } from '@/lib/leave/days'

const DAY_MS = 86_400_000

/** getUTCDay is 0=Sun..6=Sat; the schedule column is ISO 1=Mon..7=Sun. */
function isoWeekdayFromUtcDay(utcDay: number): number {
  return utcDay === 0 ? 7 : utcDay
}

export function countLeaveWeekdaysInclusive(
  startDate: string,
  endDate: string,
  workingWeekdays: readonly number[] = COMPANY_WORKING_WEEKDAYS,
): number {
  let count = 0
  const end = parseDateOnlyUtc(endDate)

  for (let day = parseDateOnlyUtc(startDate); day <= end; day += DAY_MS) {
    const weekday = isoWeekdayFromUtcDay(new Date(day).getUTCDay())
    if (workingWeekdays.includes(weekday)) count += 1
  }

  return count
}

export function countLeaveWeekdaysOverlapping(
  startDate: string,
  endDate: string,
  rangeStartDate: string,
  rangeEndDate: string,
  workingWeekdays: readonly number[] = COMPANY_WORKING_WEEKDAYS,
): number {
  const start = parseDateOnlyUtc(startDate)
  const end = parseDateOnlyUtc(endDate)
  const rangeStart = parseDateOnlyUtc(rangeStartDate)
  const rangeEnd = parseDateOnlyUtc(rangeEndDate)

  if (end < rangeStart || start > rangeEnd) return 0

  return countLeaveWeekdaysInclusive(
    formatDateOnlyUtc(Math.max(start, rangeStart)),
    formatDateOnlyUtc(Math.min(end, rangeEnd)),
    workingWeekdays,
  )
}

function parseDateOnlyUtc(value: string): number {
  const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10))
  return Date.UTC(year, month - 1, day)
}

function formatDateOnlyUtc(value: number): string {
  return new Date(value).toISOString().slice(0, 10)
}
