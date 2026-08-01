// Sanitized logging for anything that handles confidential rows.
//
// WHY: a Supabase/PostgREST error is not a safe thing to log. Verified against
// the live database — a unique-violation returns:
//
//   duplicate key value violates unique constraint "leak_probe_email_key"
//   DETAIL:  Key (email)=(victim@example.test) already exists.
//
// The row value is inside the error. `message`, `details` and `hint` can all
// carry column values, constraint contents and SQL fragments, so none of them
// may be logged from a path that touches approvals, notifications or any other
// confidential table. What survives is the SQLSTATE `code`, which identifies a
// class of failure ('23505' = unique violation) and contains no data.
//
// Correlation is preserved deliberately: an operation string we control plus
// the ids needed to find the row again. That is enough to debug without
// putting a payee, an amount or an address into a log aggregator.

/** Postgres SQLSTATE and nothing else. Never message/details/hint. */
export function dbErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code
  }
  return 'unknown'
}

/**
 * Log a database failure with no row-derived text.
 *
 * @param operation dot-namespaced and caller-authored, e.g. 'approval_request.update'
 * @param error     the raw error — only its SQLSTATE is read
 * @param context   ids only. Never subjects, payees, amounts, notes or emails.
 */
export function logDbError(
  operation: string,
  error: unknown,
  context: Record<string, string | number | null | undefined> = {},
): void {
  console.error('[db]', { operation, code: dbErrorCode(error), ...context })
}

/**
 * Log a non-database failure (a mail provider, a fetch) without its message.
 * Provider errors routinely echo the recipient address back at you.
 */
export function logProviderError(
  operation: string,
  kind: string,
  context: Record<string, string | number | null | undefined> = {},
): void {
  console.error('[provider]', { operation, kind, ...context })
}

/**
 * Reduce an arbitrary provider error to a short, stable, value-free token —
 * for storing in `staff_notifications.last_error`, which is a log that happens
 * to live in a table and is read back by the retry worker and by anyone
 * debugging a stuck send.
 *
 * Keeps the shape of the failure ('rate_limit', 'invalid_recipient') and drops
 * everything that could be a value.
 */
export function errorKind(error: unknown): string {
  const raw =
    error && typeof error === 'object' && 'name' in error && typeof (error as { name?: unknown }).name === 'string'
      ? ((error as { name: string }).name)
      : typeof error === 'string'
        ? error
        : ''
  const text = raw.toLowerCase()
  // Ordered most-specific first. Anything unrecognised becomes 'send_failed'
  // rather than falling through to the original string.
  if (text.includes('rate') && text.includes('limit')) return 'rate_limit'
  if (text.includes('invalid') && (text.includes('recipient') || text.includes('to'))) return 'invalid_recipient'
  if (text.includes('unauthorized') || text.includes('forbidden')) return 'provider_auth'
  if (text.includes('timeout') || text.includes('etimedout')) return 'timeout'
  if (text.includes('network') || text.includes('fetch')) return 'network'
  if (text.includes('validation')) return 'validation'
  return 'send_failed'
}

/**
 * Mask an address for a participant-facing summary: `b***@g***.com`.
 * Enough for the actor to tell which of three approvers failed, without the
 * full address travelling into a toast, a log line or a stored error.
 */
export function maskEmail(email: string): string {
  const trimmed = email.trim()
  const at = trimmed.indexOf('@')
  if (at <= 0) return '***'
  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1)
  const dot = domain.lastIndexOf('.')
  const tld = dot > 0 ? domain.slice(dot) : ''
  return `${local[0]}***@${domain[0] ?? ''}***${tld}`
}
