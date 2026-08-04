// Tracker statuses — pure, no I/O.
//
// Eight statuses, and the important distinction is that two of them are not
// about work at all: 'not_working_day' and 'waived' say no entry was owed. A
// tracker that cannot say that treats a public holiday and a skipped Tuesday as
// the same blank cell, and then every completion rate is wrong.
//
// 'missed' is SYSTEM-CALCULATED. It is deliberately absent from the statuses an
// employee can select: a self-reported miss is either never selected or
// selected out of guilt, and both make the number meaningless.

export const TRACKER_STATUSES = [
  'not_started',
  'in_progress',
  'done',
  'blocked',
  'carried_over',
  'missed',
  'not_working_day',
  'waived',
] as const

export type TrackerStatus = (typeof TRACKER_STATUSES)[number]

/** What an employee may set on an entry or item. */
export const SELECTABLE_STATUSES: readonly TrackerStatus[] = [
  'not_started',
  'in_progress',
  'done',
  'blocked',
]

/** Set only by a background job or a reviewer, never by the person tracking. */
export const SYSTEM_STATUSES: readonly TrackerStatus[] = [
  'carried_over',
  'missed',
  'not_working_day',
  'waived',
]

/** No entry was owed. Excluded from completion rates and from missed-marking. */
export const SUPPRESSED_STATUSES: readonly TrackerStatus[] = ['not_working_day', 'waived']

/** Work remains. These are what carry to the next working day. */
export const OPEN_STATUSES: readonly TrackerStatus[] = ['not_started', 'in_progress', 'blocked']

export const TRACKER_STATUS_LABELS: Record<TrackerStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
  blocked: 'Blocked',
  carried_over: 'Carried over',
  missed: 'Missed',
  not_working_day: 'Not a working day',
  waived: 'Waived',
}

export function isSelectable(status: TrackerStatus): boolean {
  return SELECTABLE_STATUSES.includes(status)
}

export function isSuppressed(status: TrackerStatus): boolean {
  return SUPPRESSED_STATUSES.includes(status)
}

export function isOpen(status: TrackerStatus): boolean {
  return OPEN_STATUSES.includes(status)
}

/**
 * Does an item in this status move to the next working day?
 *
 * Done does not. Carried over does not either: it has ALREADY moved, and
 * carrying it again would duplicate it every time the job ran.
 */
export function shouldCarryOver(status: TrackerStatus): boolean {
  return OPEN_STATUSES.includes(status)
}

/**
 * The status an entry lands in when its owner submits, derived from its items.
 *
 * Mirrors tracker_submit_entry(). Blocked wins over incomplete, because a
 * blocker is the thing a reviewer needs to see; incomplete wins over done,
 * because an entry with unfinished commitments is not done.
 */
export function deriveEntryStatus(
  items: { kind: string; status: TrackerStatus }[],
): TrackerStatus {
  if (items.some((i) => i.status === 'blocked')) return 'blocked'
  const commitments = items.filter((i) => i.kind === 'planned' || i.kind === 'next_step')
  if (commitments.some((i) => i.status === 'not_started' || i.status === 'in_progress')) {
    return 'in_progress'
  }
  return 'done'
}

export type ReviewStatus = 'pending' | 'under_review' | 'returned' | 'accepted'

export const REVIEW_ACTIONS = ['start_review', 'return', 'accept', 'waive', 'reopen'] as const
export type ReviewAction = (typeof REVIEW_ACTIONS)[number]

export type ReviewActor = 'owner' | 'reviewer' | 'admin'

export type ReviewRefusal = 'not_permitted' | 'not_submitted' | 'already_accepted'

export type ReviewResult =
  | { ok: true; next: ReviewStatus }
  | { ok: false; reason: ReviewRefusal }

/**
 * Can this actor take this review action?
 *
 * Owners never can, on their own entry or anyone's. An owner who could accept
 * their own tracker entry makes the review step decorative.
 */
export function reviewTransition(
  current: ReviewStatus,
  action: ReviewAction,
  actor: ReviewActor,
  options: { submitted: boolean },
): ReviewResult {
  if (actor === 'owner') return { ok: false, reason: 'not_permitted' }
  if (action === 'waive' && actor !== 'admin') return { ok: false, reason: 'not_permitted' }

  if (current === 'accepted' && action !== 'reopen') {
    return { ok: false, reason: 'already_accepted' }
  }
  // Reviewing something nobody filed in is reviewing a blank form.
  if (!options.submitted && (action === 'start_review' || action === 'return' || action === 'accept')) {
    return { ok: false, reason: 'not_submitted' }
  }

  switch (action) {
    case 'start_review': return { ok: true, next: 'under_review' }
    case 'return': return { ok: true, next: 'returned' }
    case 'accept': return { ok: true, next: 'accepted' }
    case 'reopen': return { ok: true, next: 'pending' }
    case 'waive': return { ok: true, next: current }
  }
}

export function reviewStatusLabel(status: ReviewStatus): string {
  switch (status) {
    case 'pending': return 'Awaiting review'
    case 'under_review': return 'Under review'
    case 'returned': return 'Returned'
    case 'accepted': return 'Accepted'
  }
}
