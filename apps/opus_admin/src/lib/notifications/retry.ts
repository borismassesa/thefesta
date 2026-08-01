// Retry policy for the staff-notification email queue.
//
// Pure, and separate from the route, because these are the decisions that
// determine whether a message is eventually delivered or quietly dropped, and
// they are worth testing without a database or a provider.
//
// The states come from staff_notifications.delivery_status:
//   pending   — recorded, never attempted (no provider configured at the time)
//   sending   — claimed by a worker right now
//   sent      — delivered
//   failed    — attempt failed, still claimable
//   abandoned — terminal, will never be claimed again

export type DeliveryOutcome = {
  status: 'failed' | 'abandoned'
  // Null when terminal, so the row stops looking like it is waiting for a
  // retry that is never coming.
  nextAttemptAt: string | null
}

export const MAX_ATTEMPTS = 5

// Exponential, capped at an hour. A provider that is down tends to stay down
// for a while: retrying every minute would burn the whole attempt budget
// inside five minutes and abandon messages that would have gone out fine
// twenty minutes later.
export function backoffMs(attempt: number): number {
  return Math.min(60_000 * 2 ** Math.max(0, attempt - 1), 60 * 60_000)
}

/**
 * What to write back after a failed send.
 *
 * @param attemptCount the row's attempt_count AFTER the claim incremented it
 * @param now injected so the caller's clock is testable
 */
export function classifyFailure(
  attemptCount: number,
  now: number,
  maxAttempts: number = MAX_ATTEMPTS,
): DeliveryOutcome {
  // claim_notification_emails only picks up rows with
  // attempt_count < p_max_attempts, so at the ceiling this row would never be
  // claimed again. Recording it as 'failed' would leave something that reads
  // as retryable but is inert; 'abandoned' says what actually happened and
  // makes the stuck-queue metric honest.
  if (attemptCount >= maxAttempts) {
    return { status: 'abandoned', nextAttemptAt: null }
  }
  return {
    status: 'failed',
    nextAttemptAt: new Date(now + backoffMs(attemptCount)).toISOString(),
  }
}

// Reasons a message can never be rendered, however many times it is retried.
// Distinct from a provider failure: retrying is pointless, so the row is
// retired instead of consuming the queue forever.
export type PermanentFailure =
  | 'EVENT_MISSING_OR_UNKNOWN_TYPE'
  | 'PAYLOAD_UNRENDERABLE'
  | 'RECIPIENT_UNRESOLVED'
