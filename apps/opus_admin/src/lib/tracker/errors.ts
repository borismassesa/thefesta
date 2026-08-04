// Tracker failures, translated.
//
// The database functions raise ERRCODE P0001 with stable dotted tokens. This is
// the only place a database error message is read, and it is read under an
// exact-match whitelist: anything unrecognised is discarded and becomes the
// generic line. We render text WE wrote, keyed by a token WE defined, never the
// database's own string.
//
// Pure, so the client and the server action say the same thing.

export const TRACKER_ERROR_TOKENS = [
  'tracker.not_found',
  'tracker.not_owner',
  'tracker.not_required',
  'tracker.not_permitted',
  'tracker.not_submitted',
  'tracker.already_accepted',
  'tracker.reason_required',
  'tracker.too_late_to_edit',
  'tracker.review_immutable',
  'tracker.no_assignment',
] as const

export type TrackerErrorToken = (typeof TRACKER_ERROR_TOKENS)[number]

const MESSAGES: Record<TrackerErrorToken, string> = {
  'tracker.not_found': 'That tracker entry no longer exists.',
  'tracker.not_owner': 'That entry belongs to someone else.',
  'tracker.not_required':
    'No entry is needed for that day. It falls on leave, a public holiday, a rest day, or it was waived.',
  'tracker.not_permitted': 'You do not have permission to do that to this entry.',
  'tracker.not_submitted': 'There is nothing to review yet. The entry has not been submitted.',
  'tracker.already_accepted': 'This entry has been accepted. Ask an admin to reopen it first.',
  'tracker.reason_required': 'Say why you are returning it, so the author knows what to add.',
  'tracker.too_late_to_edit':
    'That day is outside the window for filling in the tracker. Ask your manager to reopen it.',
  'tracker.review_immutable': 'The review history cannot be edited.',
  'tracker.no_assignment': 'You are not assigned to track anything yet. Ask People Ops to set that up.',
}

const GENERIC = 'The tracker could not save that right now. Try again in a moment.'

const TOKEN_SET = new Set<string>(TRACKER_ERROR_TOKENS)

export function trackerErrorToken(error: unknown): TrackerErrorToken | null {
  if (!error || typeof error !== 'object') return null
  const message = (error as { message?: unknown }).message
  if (typeof message !== 'string') return null
  const trimmed = message.trim()
  return TOKEN_SET.has(trimmed) ? (trimmed as TrackerErrorToken) : null
}

export function trackerMessage(error: unknown): string {
  const token = trackerErrorToken(error)
  return token ? MESSAGES[token] : GENERIC
}

export function messageForToken(token: TrackerErrorToken): string {
  return MESSAGES[token]
}
