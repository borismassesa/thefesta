// Report engine failures, translated.
//
// The database functions raise ERRCODE P0001 with stable dotted tokens. This is
// the only place a database error message is read, and it is read under an
// exact-match whitelist: an unrecognised string is discarded and becomes the
// generic line.
//
// The distinction matters. We are not wrapping the database's text in something
// friendlier; we are matching a token WE defined and rendering text WE wrote. A
// PostgREST error can carry row values in its message, so letting one through
// even once is a leak.
//
// Pure, so the client form and the server action render the same words.

export const REPORT_ERROR_TOKENS = [
  'report.not_found',
  'report.not_owner',
  'report.not_editable',
  'report.draft_conflict',
  'report.immutable',
  'report.invalid_transition',
  'report.not_permitted',
  'report.reason_required',
  'report.template_version_immutable',
  'report.version_immutable',
  'report.review_immutable',
  'report.no_template_version',
  'report.recipients_unresolved',
  'report.validation_failed',
] as const

export type ReportErrorToken = (typeof REPORT_ERROR_TOKENS)[number]

const MESSAGES: Record<ReportErrorToken, string> = {
  'report.not_found': 'That report no longer exists.',
  'report.not_owner': 'That report belongs to someone else.',
  'report.not_editable':
    'This report has been filed, so it cannot be edited. If something is wrong, ask your reviewer to return it.',
  'report.draft_conflict':
    'This report was saved somewhere else after you opened it, so your changes were not applied. Reload to see the newer version before editing again.',
  'report.immutable': 'This report is locked. Nothing can change it now.',
  'report.invalid_transition': 'That is not something you can do to this report right now.',
  'report.not_permitted': 'You do not have permission to do that to this report.',
  'report.reason_required': 'Say why you are returning it, so the author knows what to fix.',
  'report.template_version_immutable':
    'That version of the template has been published and cannot be changed. Create a new version instead.',
  'report.version_immutable': 'Filed reports cannot be rewritten.',
  'report.review_immutable': 'The review history cannot be edited.',
  'report.no_template_version':
    'This report type has no published version yet. Ask People Ops to publish one.',
  'report.recipients_unresolved':
    'This report could not work out who to send it to. Check that your manager is set on your record.',
  'report.validation_failed': 'Some answers need fixing before this can be filed.',
}

const GENERIC = 'The report could not be saved right now. Try again in a moment.'

const TOKEN_SET = new Set<string>(REPORT_ERROR_TOKENS)

/**
 * Pull a known token out of a thrown value, or null.
 *
 * Exact match only. A message that merely CONTAINS a token is rejected: a
 * Postgres DETAIL that happens to quote our text must not be able to steer what
 * the employee is shown.
 */
export function reportErrorToken(error: unknown): ReportErrorToken | null {
  if (!error || typeof error !== 'object') return null
  const message = (error as { message?: unknown }).message
  if (typeof message !== 'string') return null
  const trimmed = message.trim()
  return TOKEN_SET.has(trimmed) ? (trimmed as ReportErrorToken) : null
}

export function reportMessage(error: unknown): string {
  const token = reportErrorToken(error)
  return token ? MESSAGES[token] : GENERIC
}

export function messageForToken(token: ReportErrorToken): string {
  return MESSAGES[token]
}

/**
 * A conflict is recoverable by reloading, not a fault. The form treats it
 * differently: it offers the newer content rather than reporting a failure.
 */
export function isRecoverableConflict(token: ReportErrorToken | null): boolean {
  return token === 'report.draft_conflict'
}
