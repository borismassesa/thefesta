// Attendance arithmetic — pure, no I/O.
//
// Mirrors attendance_recalculate_session() in
// 20260802140100_attendance_functions.sql. The database owns the stored totals;
// this module computes the same numbers for the live counter on an open session
// (which has no stored total yet) and for display, and it is where the rules are
// unit-tested.
//
// EVERYTHING IS AN INSTANT. Durations are computed from timestamps, never from
// wall-clock times of day, which is what makes overnight shifts fall out for
// free: 22:00 to 06:00 is eight hours because the two instants are eight hours
// apart, not because of any special case for crossing midnight.
//
// Browser time is used for ONE thing: how long the counter has been running
// since a server-supplied opened_at, for display. No value derived from the
// browser clock is ever sent back to be stored.

export type BreakInterval = {
  startedAt: string
  /** Null while the break is still running. */
  endedAt: string | null
}

const MS_PER_MINUTE = 60_000

function minutesBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime()
  return Math.max(0, Math.round(ms / MS_PER_MINUTE))
}

export type SessionMinutes = {
  /** Wall time from clock-in to clock-out (or now), breaks included. */
  grossMinutes: number
  /** Completed breaks only. */
  breakMinutes: number
  /** Of which were paid breaks. */
  paidBreakMinutes: number
  /** Gross minus every completed break. The time actually worked. */
  workedMinutes: number
}

/**
 * Split a session into gross, break and worked minutes.
 *
 * Only COMPLETED breaks are subtracted. An open break has no length yet, and
 * assuming one would understate the pay of someone still on it. The moment it
 * ends, the deduction appears.
 */
export function sessionMinutes(input: {
  openedAt: string
  /** Null for an open session; pass `now` to measure the live counter. */
  closedAt: string | null
  breaks: BreakInterval[]
  now: string
}): SessionMinutes {
  const end = input.closedAt ?? input.now
  const grossMinutes = minutesBetween(input.openedAt, end)

  let breakMinutes = 0
  for (const b of input.breaks) {
    if (!b.endedAt) continue
    breakMinutes += minutesBetween(b.startedAt, b.endedAt)
  }

  return {
    grossMinutes,
    breakMinutes,
    paidBreakMinutes: 0,
    workedMinutes: Math.max(0, grossMinutes - breakMinutes),
  }
}

/**
 * Payable time.
 *
 * NOTE what is absent: no automatic lunch deduction. A shift template's
 * `unpaid_break_minutes` describes the EXPECTED shift and is never subtracted
 * from time actually worked. Deducting an hour someone may have worked through
 * is a silent pay cut, and it is the most common way an attendance system
 * quietly takes time from people. If a break happened, it was punched.
 */
export function payableMinutes(input: {
  workedMinutes: number
  breakMinutes: number
  paidBreakMinutes: number
  breaksArePaid: boolean
}): number {
  const credited = input.breaksArePaid ? input.breakMinutes : input.paidBreakMinutes
  return Math.max(0, input.workedMinutes + credited)
}

/**
 * Overtime.
 *
 * On a weekend or public holiday every payable minute is overtime: the employee
 * was not scheduled to be there at all. On a working day, only the minutes past
 * the standard day, and only once any threshold is cleared — the threshold
 * decides WHETHER overtime accrues, not from where it is measured.
 */
export function overtimeMinutes(input: {
  payableMinutes: number
  standardDailyMinutes: number
  thresholdMinutes: number
  isWeekend: boolean
  isHoliday: boolean
}): number {
  if (input.isWeekend || input.isHoliday) return input.payableMinutes
  if (input.payableMinutes <= input.standardDailyMinutes + input.thresholdMinutes) return 0
  return input.payableMinutes - input.standardDailyMinutes
}

/**
 * How late an arrival was, in minutes, or 0 when inside the grace window.
 *
 * Grace decides whether someone is late; it does not shrink the number. Someone
 * 25 minutes late with a 10-minute grace is 25 minutes late, not 15.
 */
export function lateMinutes(input: {
  openedAt: string
  scheduledStart: string | null
  graceMinutes: number
}): number {
  if (!input.scheduledStart) return 0
  const delta = minutesBetween(input.scheduledStart, input.openedAt)
  return delta > input.graceMinutes ? delta : 0
}

/** Same shape for leaving early. Only meaningful for a session that was closed
 *  by the employee — an auto-closed session is a missing clock-out, not an
 *  early departure, and must not be recorded as one. */
export function earlyDepartureMinutes(input: {
  closedAt: string | null
  scheduledEnd: string | null
  graceMinutes: number
  closedByEmployee: boolean
}): number {
  if (!input.closedAt || !input.scheduledEnd || !input.closedByEmployee) return 0
  const delta = minutesBetween(input.closedAt, input.scheduledEnd)
  return delta > input.graceMinutes ? delta : 0
}

/** A shift whose end time is at or before its start time runs past midnight. */
export function crossesMidnight(startTime: string, endTime: string): boolean {
  return endTime <= startTime
}

/**
 * The scheduled window for a business date, as local-time ISO strings without a
 * zone. The caller converts using the schedule's timezone; the important part
 * here is that an overnight shift's end lands on the NEXT day.
 */
export function scheduledWindow(input: {
  businessDate: string
  startTime: string
  endTime: string
}): { start: string; end: string; endDate: string } {
  const overnight = crossesMidnight(input.startTime, input.endTime)
  const endDate = overnight ? addDays(input.businessDate, 1) : input.businessDate
  return {
    start: `${input.businessDate}T${normalizeTime(input.startTime)}`,
    end: `${endDate}T${normalizeTime(input.endTime)}`,
    endDate,
  }
}

function normalizeTime(time: string): string {
  const parts = time.split(':')
  const hh = (parts[0] ?? '00').padStart(2, '0')
  const mm = (parts[1] ?? '00').padStart(2, '0')
  const ss = (parts[2] ?? '00').padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** "7h 45m", "45m", "0m". Used everywhere hours are shown. */
export function formatMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes))
  const hours = Math.floor(safe / 60)
  const mins = safe % 60
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}

/** Decimal hours to two places, for payroll export. */
export function toDecimalHours(minutes: number): number {
  return Math.round((Math.max(0, minutes) / 60) * 100) / 100
}

export type WeekTotals = {
  workedMinutes: number
  breakMinutes: number
  payableMinutes: number
  overtimeMinutes: number
  daysWorked: number
}

export function sumTotals(
  entries: {
    workedMinutes: number
    breakMinutes: number
    payableMinutes: number
    overtimeMinutes: number
    businessDate: string
  }[],
): WeekTotals {
  const days = new Set<string>()
  let workedMinutes = 0
  let breakMinutes = 0
  let payableMinutes = 0
  let overtimeMinutes = 0
  for (const e of entries) {
    workedMinutes += e.workedMinutes
    breakMinutes += e.breakMinutes
    payableMinutes += e.payableMinutes
    overtimeMinutes += e.overtimeMinutes
    // A day with two sessions is one day worked, not two.
    if (e.payableMinutes > 0) days.add(e.businessDate)
  }
  return {
    workedMinutes,
    breakMinutes,
    payableMinutes,
    overtimeMinutes,
    daysWorked: days.size,
  }
}
