// The report submission state machine — pure, no I/O.
//
// Mirrored by report_apply_transition() in the migration, which is the enforcer:
// it holds the row lock and refuses the same moves. This module exists so the UI
// offers only the actions that exist, and so the rules are readable and testable
// in one place rather than scattered across server actions.
//
// WHO may act matters as much as WHAT. Every transition names the roles allowed
// to make it, because "returned -> resubmitted" performed by the reviewer would
// let a reviewer edit somebody's report and re-file it under their name.

export const REPORT_STATES = [
  /** Being written. Only the owner sees it. */
  'draft',
  /** Filed. The content is frozen; further edits go through a new version. */
  'submitted',
  /** A reviewer has opened it. */
  'under_review',
  /** Sent back for correction, with a reason. Previous versions are kept. */
  'returned',
  /** Filed again after a return. */
  'resubmitted',
  /** Signed off. */
  'accepted',
  /** Sealed. Nothing can change it, by anyone, ever. */
  'locked',
  /** Withdrawn before acceptance. */
  'cancelled',
  /** The obligation was excused, so no report is owed. */
  'waived',
] as const

export type ReportState = (typeof REPORT_STATES)[number]

export const REPORT_ACTIONS = [
  'submit',
  'start_review',
  'return_for_correction',
  'resubmit',
  'accept',
  'lock',
  'cancel',
  'waive',
  'reopen',
] as const

export type ReportAction = (typeof REPORT_ACTIONS)[number]

/**
 * Who is acting.
 *   owner    — the employee the report belongs to
 *   reviewer — a resolved recipient of this submission
 *   admin    — holds workforce.write; People Ops
 *   system   — a background job
 */
export type ReportActor = 'owner' | 'reviewer' | 'admin' | 'system'

/** States in which the content may still be edited by the owner. */
const EDITABLE: readonly ReportState[] = ['draft', 'returned']

/** States nothing can move out of. */
const TERMINAL: readonly ReportState[] = ['locked', 'cancelled', 'waived']

type Rule = { from: readonly ReportState[]; to: ReportState; actors: readonly ReportActor[] }

const RULES: Record<ReportAction, Rule> = {
  submit: { from: ['draft'], to: 'submitted', actors: ['owner', 'admin'] },
  // A reviewer opening the report. Recorded so "nobody looked at it for nine
  // days" is answerable.
  start_review: { from: ['submitted', 'resubmitted'], to: 'under_review', actors: ['reviewer', 'admin'] },
  return_for_correction: {
    from: ['submitted', 'under_review', 'resubmitted'],
    to: 'returned',
    actors: ['reviewer', 'admin'],
  },
  // Only the owner may re-file. A reviewer who could resubmit could rewrite
  // someone's report and file it under their name.
  resubmit: { from: ['returned'], to: 'resubmitted', actors: ['owner'] },
  accept: {
    from: ['submitted', 'under_review', 'resubmitted'],
    to: 'accepted',
    actors: ['reviewer', 'admin'],
  },
  // Locking is separate from accepting: acceptance is a judgement, locking is
  // the moment the record stops being changeable. The background job locks
  // accepted reports after the grace window so a mistake can still be reopened
  // the same day.
  lock: { from: ['accepted'], to: 'locked', actors: ['admin', 'system'] },
  cancel: {
    from: ['draft', 'submitted', 'under_review', 'returned', 'resubmitted'],
    to: 'cancelled',
    actors: ['owner', 'admin'],
  },
  // Excusing an obligation. Never the owner: excusing your own report is not a
  // thing.
  waive: { from: ['draft', 'submitted', 'under_review', 'returned', 'resubmitted'], to: 'waived', actors: ['admin'] },
  // An accepted report can be reopened for correction before it locks. After
  // locking there is no route back, which is what makes locked mean anything.
  reopen: { from: ['accepted'], to: 'returned', actors: ['admin'] },
}

export type TransitionRefusal =
  | 'invalid_from_state'
  | 'not_permitted_for_actor'
  | 'immutable'

export type TransitionResult =
  | { ok: true; next: ReportState }
  | { ok: false; reason: TransitionRefusal }

/** Can `actor` perform `action` from `state`, and where does it land? */
export function transition(
  state: ReportState,
  action: ReportAction,
  actor: ReportActor,
): TransitionResult {
  const rule = RULES[action]
  // Terminal first, so a locked report reports 'immutable' rather than the
  // vaguer 'invalid_from_state'. The distinction is what the employee is told.
  if (TERMINAL.includes(state)) return { ok: false, reason: 'immutable' }
  if (!rule.from.includes(state)) return { ok: false, reason: 'invalid_from_state' }
  if (!rule.actors.includes(actor)) return { ok: false, reason: 'not_permitted_for_actor' }
  return { ok: true, next: rule.to }
}

export function canPerform(state: ReportState, action: ReportAction, actor: ReportActor): boolean {
  return transition(state, action, actor).ok
}

/** Every action this actor may take right now. Drives the buttons. */
export function availableActions(state: ReportState, actor: ReportActor): ReportAction[] {
  return REPORT_ACTIONS.filter((action) => canPerform(state, action, actor))
}

/**
 * May the owner edit the content?
 *
 * This is the guard behind "submitted reports cannot be silently edited". A
 * submitted report is frozen: the only route to different content is a return,
 * which creates a new version and preserves the old one.
 */
export function isContentEditable(state: ReportState): boolean {
  return EDITABLE.includes(state)
}

/** True once nothing can change, by anyone. */
export function isImmutable(state: ReportState): boolean {
  return TERMINAL.includes(state)
}

/** True when the report is with a reviewer rather than the employee. */
export function isAwaitingReview(state: ReportState): boolean {
  return state === 'submitted' || state === 'under_review' || state === 'resubmitted'
}

export function stateLabel(state: ReportState): string {
  switch (state) {
    case 'draft': return 'Draft'
    case 'submitted': return 'Submitted'
    case 'under_review': return 'Under review'
    case 'returned': return 'Returned for correction'
    case 'resubmitted': return 'Resubmitted'
    case 'accepted': return 'Accepted'
    case 'locked': return 'Locked'
    case 'cancelled': return 'Cancelled'
    case 'waived': return 'Waived'
  }
}

/**
 * Whether filing this action should cut a new immutable version of the content.
 *
 * Submitting and resubmitting do. Reviewer actions do not: a return does not
 * change what the employee wrote, so minting a version for it would make the
 * history claim an edit that never happened.
 */
export function createsVersion(action: ReportAction): boolean {
  return action === 'submit' || action === 'resubmit'
}
