// The design turnaround promise.
//
// The clock starts when FINANCE APPROVES the payment, not when a designer picks
// the job up. That is deliberate: the promise is made to the couple at the
// moment their money is confirmed, so a job nobody has started yet is already
// burning its 48 hours. Anchoring to the start of design instead would let an
// untouched queue look permanently healthy.

export const DESIGN_SLA_HOURS = 48

/**
 * Orders approved before this date are not measured.
 *
 * The pipeline didn't exist until 2026-07-30, so every order approved before it
 * was already weeks past a deadline nobody had been told about. Without a
 * cutoff the queue opens 25-of-26 red, and a board that is always red is a
 * board nobody reads — the real breaches would be invisible among the noise.
 *
 * The alternative was to rewrite those orders' `reviewed_at`, and that would be
 * wrong: it is finance's record of when they actually approved a payment.
 * Editing an audit trail so a dashboard looks tidier trades a real record for a
 * cosmetic one. Move this constant instead; it changes what is measured without
 * changing what happened.
 */
export const DESIGN_SLA_START = new Date('2026-07-30T00:00:00.000Z')

const MS_PER_HOUR = 60 * 60 * 1000

export type SlaTone = 'ok' | 'due_soon' | 'overdue'

export type SlaState = {
  dueAt: Date
  /** Negative once the deadline has passed. */
  hoursRemaining: number
  tone: SlaTone
  /** Short human label: "31h left", "Due in 45m", "4h overdue". */
  label: string
  /** Just the magnitude — "31h", "45m" — for a ring or badge with no room for words. */
  short: string
  /**
   * How much of the window has been used, 0 to 1. Clamped, so an overdue job
   * reads as a full ring rather than overshooting it.
   */
  elapsedFraction: number
}

/** When a job approved at `approvedAt` must be submitted by. */
export function designDueAt(approvedAt: string | Date | null | undefined): Date | null {
  if (!approvedAt) return null
  const approved = approvedAt instanceof Date ? approvedAt : new Date(approvedAt)
  if (Number.isNaN(approved.getTime())) return null
  return new Date(approved.getTime() + DESIGN_SLA_HOURS * MS_PER_HOUR)
}

function formatGap(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000)
  if (totalMinutes < 60) return `${Math.max(totalMinutes, 1)}m`
  const hours = Math.floor(totalMinutes / 60)
  if (hours < 48) {
    const minutes = totalMinutes % 60
    // Minutes only matter near the wire; beyond a day they're noise.
    return hours < 6 && minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }
  return `${Math.floor(hours / 24)}d`
}

/**
 * Where a job stands against its deadline.
 *
 * Returns null when there is no deadline to measure — an unapproved order has
 * not started its clock, and inventing one would show a false breach.
 */
export function slaState(
  approvedAt: string | Date | null | undefined,
  now: Date = new Date(),
): SlaState | null {
  const dueAt = designDueAt(approvedAt)
  if (!dueAt) return null

  // Predates the promise — there is no deadline to have missed.
  const approved = approvedAt instanceof Date ? approvedAt : new Date(approvedAt as string)
  if (approved < DESIGN_SLA_START) return null

  const remainingMs = dueAt.getTime() - now.getTime()
  const hoursRemaining = remainingMs / MS_PER_HOUR

  const elapsedFraction = Math.min(
    1,
    Math.max(0, 1 - remainingMs / (DESIGN_SLA_HOURS * MS_PER_HOUR)),
  )

  if (remainingMs <= 0) {
    return {
      dueAt,
      hoursRemaining,
      tone: 'overdue',
      label: `${formatGap(-remainingMs)} overdue`,
      short: formatGap(-remainingMs),
      elapsedFraction: 1,
    }
  }
  // "Due soon" is the last quarter of the window — enough warning to act on,
  // not so early that everything is permanently amber.
  const tone: SlaTone = hoursRemaining <= DESIGN_SLA_HOURS / 4 ? 'due_soon' : 'ok'
  return {
    dueAt,
    hoursRemaining,
    tone,
    label: `${formatGap(remainingMs)} left`,
    short: formatGap(remainingMs),
    elapsedFraction,
  }
}

/**
 * Whether the clock should still be running.
 *
 * Submitted work stops the clock: a job marked ready or delivered has met the
 * promise, and continuing to age it would fill the queue with permanent
 * breaches nobody can clear.
 */
export function slaApplies(status: string): boolean {
  return status !== 'ready' && status !== 'delivered'
}
