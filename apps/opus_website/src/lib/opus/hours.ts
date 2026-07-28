// Support hours for the Opus live-chat handoff.
//
// East Africa Time is UTC+3 year-round (no DST), so we shift the clock rather
// than depend on the server's timezone. Staffed Mon-Sat, 08:00-20:00 EAT.

export const SUPPORT_OPEN_HOUR = 8
export const SUPPORT_CLOSE_HOUR = 20
export const SUPPORT_OPEN_LABEL = '8:00 AM'

/** Typical first-reply target used when we have no measured history yet. */
export const DEFAULT_ETA_MINUTES = 30

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function eatClock(now: Date): Date {
  return new Date(now.getTime() + 3 * 60 * 60 * 1000)
}

export function isAfterHours(now = new Date()): boolean {
  const eat = eatClock(now)
  const day = eat.getUTCDay() // 0 Sun ... 6 Sat
  if (day === 0) return true // Sunday closed
  const hour = eat.getUTCHours()
  return hour < SUPPORT_OPEN_HOUR || hour >= SUPPORT_CLOSE_HOUR
}

/**
 * Human phrase for when support opens next, e.g. "at 8:00 AM tomorrow" or
 * "on Monday at 8:00 AM". Only meaningful while `isAfterHours()` is true.
 */
export function nextOpenLabel(now = new Date()): string {
  const eat = eatClock(now)
  const day = eat.getUTCDay()
  const hour = eat.getUTCHours()
  // Closed early on a working day: we open later the same day.
  if (day !== 0 && hour < SUPPORT_OPEN_HOUR) return `at ${SUPPORT_OPEN_LABEL} today`
  // Otherwise walk forward to the next staffed day, skipping Sunday.
  let add = 1
  while ((day + add) % 7 === 0) add++
  if (add === 1) return `at ${SUPPORT_OPEN_LABEL} tomorrow`
  return `on ${DAY_NAMES[(day + add) % 7]} at ${SUPPORT_OPEN_LABEL}`
}
