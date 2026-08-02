// Leave failures, translated.
//
// The database functions raise ERRCODE P0001 with stable dotted tokens. This is
// the only place a database error message is read, under an exact-match
// whitelist: we render text WE wrote, keyed by a token WE defined. A PostgREST
// error can carry row values, and leave records carry medical and bereavement
// context, so letting one through even once is a leak that matters.

export const LEAVE_ERROR_TOKENS = [
  'leave.not_found',
  'leave.not_owner',
  'leave.not_editable',
  'leave.not_pending',
  'leave.no_policy',
  'leave.no_working_days',
  'leave.insufficient_notice',
  'leave.insufficient_balance',
  'leave.exceeds_maximum',
  'leave.document_required',
  'leave.overlapping_request',
  'leave.outside_approval_scope',
  'leave.reason_required',
  'leave.already_closed',
  'leave.invalid_decision',
  'leave.ledger_immutable',
  'leave.zero_adjustment',
] as const

export type LeaveErrorToken = (typeof LEAVE_ERROR_TOKENS)[number]

const MESSAGES: Record<LeaveErrorToken, string> = {
  'leave.not_found': 'That leave request no longer exists.',
  'leave.not_owner': 'That request belongs to someone else.',
  'leave.not_editable':
    'This request has been submitted, so it cannot be edited. Withdraw it if you need to change the dates.',
  'leave.not_pending': 'That request has already been decided.',
  'leave.no_policy':
    'No leave policy covers this leave type for you yet. Ask People Ops to set one up.',
  'leave.no_working_days':
    'Every day in that range is a weekend or a public holiday, so there is no leave to take.',
  'leave.insufficient_notice': 'This leave type needs more notice than that. Pick a later date.',
  'leave.insufficient_balance':
    'You do not have enough days left, counting requests already waiting for a decision.',
  'leave.exceeds_maximum': 'That is longer than this leave type allows in one go.',
  'leave.document_required':
    'This leave type needs a supporting document. Attach one before submitting.',
  'leave.overlapping_request':
    'You already have leave booked on one of those dates. Check your calendar and adjust the range.',
  'leave.outside_approval_scope':
    'You can only decide leave for people who report to you. Ask People Ops if this needs to go through them.',
  'leave.reason_required': 'Give a reason, so the record explains itself later.',
  'leave.already_closed': 'That request is already closed.',
  'leave.invalid_decision': 'That is not a decision this request can take.',
  'leave.ledger_immutable':
    'Leave history cannot be edited. Make an adjustment instead, so the correction is recorded.',
  'leave.zero_adjustment': 'An adjustment of zero days would change nothing.',
}

const GENERIC = 'The leave request could not be saved right now. Try again in a moment.'

const TOKEN_SET = new Set<string>(LEAVE_ERROR_TOKENS)

export function leaveErrorToken(error: unknown): LeaveErrorToken | null {
  if (!error || typeof error !== 'object') return null
  const message = (error as { message?: unknown }).message
  if (typeof message !== 'string') return null
  const trimmed = message.trim()
  return TOKEN_SET.has(trimmed) ? (trimmed as LeaveErrorToken) : null
}

export function leaveMessage(error: unknown): string {
  const token = leaveErrorToken(error)
  return token ? MESSAGES[token] : GENERIC
}

export function messageForToken(token: LeaveErrorToken): string {
  return MESSAGES[token]
}
