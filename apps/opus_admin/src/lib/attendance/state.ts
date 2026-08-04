// The attendance state machine — pure, no I/O.
//
// This mirrors the transition guards in 20260802140100_attendance_functions.sql.
// The database is the enforcer: it holds the locks and the partial unique
// indexes, and a transition it refuses is refused however the request arrived.
// This module exists so the UI can offer the right buttons and reject an
// obviously invalid action before a round-trip, and so the rules are readable
// and testable in one place.
//
// Deliberate duplication, then. If you change a rule here, change it in the SQL
// too — and the SQL is the one that decides.

export const ATTENDANCE_STATES = [
  /** Not working. No open session. */
  'off_clock',
  /** Open session, working. */
  'clocked_in',
  /** Open session, on a break. */
  'on_break',
  /** Today's session was closed normally by the employee. */
  'clocked_out',
  /** Today's session was closed by the nightly job; a clock-out was missed. */
  'auto_closed',
  /** Today's session is closed and a correction is awaiting a decision. */
  'pending_correction',
] as const

export type AttendanceState = (typeof ATTENDANCE_STATES)[number]

export const ATTENDANCE_ACTIONS = ['clock_in', 'start_break', 'end_break', 'clock_out'] as const
export type AttendanceAction = (typeof ATTENDANCE_ACTIONS)[number]

/** States in which a session is open, so the clock is running. */
const OPEN_STATES: readonly AttendanceState[] = ['clocked_in', 'on_break']

/**
 * States a day can end in. Reaching one of these does NOT end the day: a second
 * session is a normal thing (a split shift, back from a client site), so
 * clock_in is valid from all of them.
 */
const CLOSED_STATES: readonly AttendanceState[] = [
  'off_clock',
  'clocked_out',
  'auto_closed',
  'pending_correction',
]

export function isOpenState(state: AttendanceState): boolean {
  return OPEN_STATES.includes(state)
}

export type TransitionRefusal =
  | 'already_clocked_in'
  | 'not_clocked_in'
  | 'already_on_break'
  | 'not_on_break'

export type TransitionResult =
  | { ok: true; next: AttendanceState }
  | { ok: false; reason: TransitionRefusal }

/**
 * Can this action be taken from this state, and where does it land?
 *
 * The refusal reasons are the same tokens the SQL raises, so a client-side
 * rejection and a server-side one produce the same message.
 */
export function transition(
  state: AttendanceState,
  action: AttendanceAction,
): TransitionResult {
  switch (action) {
    case 'clock_in':
      // Off clock (or done for now) -> clocked in. Refused while a session is
      // already open; that is the duplicate the unique index also stops.
      if (CLOSED_STATES.includes(state)) return { ok: true, next: 'clocked_in' }
      return { ok: false, reason: 'already_clocked_in' }

    case 'start_break':
      if (state === 'clocked_in') return { ok: true, next: 'on_break' }
      if (state === 'on_break') return { ok: false, reason: 'already_on_break' }
      // Starting a break while off clock is not a transition.
      return { ok: false, reason: 'not_clocked_in' }

    case 'end_break':
      if (state === 'on_break') return { ok: true, next: 'clocked_in' }
      // Clocked in but not on a break: the break is what is missing.
      if (state === 'clocked_in') return { ok: false, reason: 'not_on_break' }
      return { ok: false, reason: 'not_clocked_in' }

    case 'clock_out':
      // From on_break too: an open break is closed at the same instant rather
      // than trapping someone on the clock for forgetting to end it.
      if (isOpenState(state)) return { ok: true, next: 'clocked_out' }
      return { ok: false, reason: 'not_clocked_in' }
  }
}

export function canPerform(state: AttendanceState, action: AttendanceAction): boolean {
  return transition(state, action).ok
}

/** Every action currently available. Drives which buttons the clock renders. */
export function availableActions(state: AttendanceState): AttendanceAction[] {
  return ATTENDANCE_ACTIONS.filter((action) => canPerform(state, action))
}

export type SessionSnapshot = {
  state: 'clocked_in' | 'on_break' | 'clocked_out' | 'auto_closed' | 'pending_correction'
  closedAt: string | null
}

/**
 * The employee's current state, from their open session if there is one and
 * otherwise from the most recent session of the current business day.
 *
 * 'off_clock' is not a stored value — no row ever says "this person is not
 * working". It is the absence of an open session, which is why it is derived
 * here rather than read.
 *
 * Yesterday's closed session does not colour today: with no session today the
 * answer is off_clock, so the clock reads as a fresh day rather than showing a
 * stale "clocked out" from a shift that ended two days ago.
 */
export function deriveState(input: {
  openSession: SessionSnapshot | null
  latestSessionToday: SessionSnapshot | null
}): AttendanceState {
  if (input.openSession) {
    return input.openSession.state === 'on_break' ? 'on_break' : 'clocked_in'
  }
  const today = input.latestSessionToday
  if (!today) return 'off_clock'
  switch (today.state) {
    case 'auto_closed': return 'auto_closed'
    case 'pending_correction': return 'pending_correction'
    case 'clocked_out': return 'clocked_out'
    // An open session that was not passed as openSession is a caller mistake;
    // treating it as off_clock would offer a clock-in that the database will
    // refuse, so report the truth.
    default: return 'clocked_in'
  }
}

export function stateLabel(state: AttendanceState): string {
  switch (state) {
    case 'off_clock': return 'Off clock'
    case 'clocked_in': return 'Clocked in'
    case 'on_break': return 'On break'
    case 'clocked_out': return 'Clocked out'
    case 'auto_closed': return 'Closed automatically'
    case 'pending_correction': return 'Correction pending'
  }
}
