// Attendance failures, translated.
//
// The transition functions raise ERRCODE P0001 with a stable dotted token as
// the message ('attendance.already_clocked_in'). This module is the ONLY place
// that reads a database error message, and it does so under a whitelist: an
// unrecognised string is discarded entirely and becomes the generic line.
//
// That distinction is the whole point. We are not rendering the database's text
// with a friendly wrapper; we are matching a token WE defined and rendering
// text WE wrote. A PostgREST error can carry row values in its message, so
// passing one through, even once, is a leak.
//
// Pure — no 'server-only' — so client components can render the same messages.

export const ATTENDANCE_ERROR_TOKENS = [
  'attendance.already_clocked_in',
  'attendance.not_clocked_in',
  'attendance.already_on_break',
  'attendance.not_on_break',
  'attendance.no_schedule',
  'attendance.location_required',
  'attendance.geofence_unavailable',
  'attendance.outside_geofence',
  'attendance.correction_not_found',
  'attendance.correction_already_decided',
  'attendance.correction_self_approval',
  'attendance.correction_incomplete',
  'attendance.timesheet_locked',
  'attendance.timesheet_not_ready',
] as const

export type AttendanceErrorToken = (typeof ATTENDANCE_ERROR_TOKENS)[number]

const MESSAGES: Record<AttendanceErrorToken, string> = {
  'attendance.already_clocked_in':
    "You're already clocked in. Clock out first if you want to start a new session.",
  'attendance.not_clocked_in': "You're not currently clocked in.",
  'attendance.already_on_break': "You're already on a break. End it to go back on the clock.",
  'attendance.not_on_break': "You don't have a break running.",
  'attendance.no_schedule':
    'No work schedule is set up for your account yet. Ask People Ops to assign one.',
  'attendance.location_required':
    'This shift needs your location to clock in. Allow location access in your browser and try again.',
  'attendance.geofence_unavailable':
    'This shift requires a location check, but no work site is set for it. Ask People Ops to add one.',
  'attendance.outside_geofence':
    "You're outside the work site for this shift, so the punch was not recorded. Ask your manager if you're working elsewhere today.",
  'attendance.correction_not_found': 'That correction request no longer exists.',
  'attendance.correction_already_decided': 'That correction has already been decided.',
  'attendance.correction_self_approval': 'You cannot approve your own correction request.',
  'attendance.correction_incomplete':
    'A correction for a whole missing day needs both a start and an end time.',
  'attendance.timesheet_locked':
    'That timesheet has been approved and locked. Ask People Ops to reopen it.',
  'attendance.timesheet_not_ready':
    'This timesheet still has an open session or a pending correction. Resolve those first.',
}

const GENERIC = 'The time clock could not complete that right now. Try again in a moment.'

const TOKEN_SET = new Set<string>(ATTENDANCE_ERROR_TOKENS)

/**
 * Pull a known token out of a thrown value, or null.
 *
 * Matching is exact and against the whitelist. A message that merely CONTAINS a
 * token is not accepted: a Postgres error whose DETAIL happens to quote our
 * text must not be able to steer the message the employee sees.
 */
export function attendanceErrorToken(error: unknown): AttendanceErrorToken | null {
  if (!error || typeof error !== 'object') return null
  const message = (error as { message?: unknown }).message
  if (typeof message !== 'string') return null
  const trimmed = message.trim()
  return TOKEN_SET.has(trimmed) ? (trimmed as AttendanceErrorToken) : null
}

/** Text for a token, or the generic line for anything else. */
export function attendanceMessage(error: unknown): string {
  const token = attendanceErrorToken(error)
  return token ? MESSAGES[token] : GENERIC
}

export function messageForToken(token: AttendanceErrorToken): string {
  return MESSAGES[token]
}

/**
 * Tokens raised by the state machine rather than by a system problem. The UI
 * treats these as "refresh and look again" rather than "something broke" —
 * being told you are already clocked in usually means another tab won the race.
 */
export function isTransitionRefusal(token: AttendanceErrorToken | null): boolean {
  return (
    token === 'attendance.already_clocked_in' ||
    token === 'attendance.not_clocked_in' ||
    token === 'attendance.already_on_break' ||
    token === 'attendance.not_on_break'
  )
}
