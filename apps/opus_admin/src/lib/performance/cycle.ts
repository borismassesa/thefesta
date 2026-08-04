// Performance cycle stages and review states — pure, no I/O.
//
// Mirrors performance_cycle_advance() and the review lifecycle functions in the
// migration. The database is the enforcer; this exists so the UI offers only
// what will actually be accepted, and so the order is testable without one.

export const CYCLE_STAGES = [
  'goal_setting',
  'manager_approval',
  'active_cycle',
  'mid_cycle_check_in',
  'self_review',
  'manager_review',
  'calibration',
  'final_review',
  'employee_acknowledgment',
  'development_planning',
  'closed',
] as const

export type CycleStage = (typeof CYCLE_STAGES)[number]

export const CYCLE_STAGE_LABELS: Record<CycleStage, string> = {
  goal_setting: 'Goal setting',
  manager_approval: 'Manager approval',
  active_cycle: 'Active cycle',
  mid_cycle_check_in: 'Mid cycle check in',
  self_review: 'Self review',
  manager_review: 'Manager review',
  calibration: 'Calibration',
  final_review: 'Final review',
  employee_acknowledgment: 'Acknowledgment',
  development_planning: 'Development planning',
  closed: 'Closed',
}

/** What the employee is being asked to do at each stage. */
export const CYCLE_STAGE_ASKS: Record<CycleStage, string> = {
  goal_setting: 'Write your goals for the cycle and send them to your manager.',
  manager_approval: 'Your manager is reviewing the goals you proposed.',
  active_cycle: 'Do the work. Keep progress and evidence up to date as you go.',
  mid_cycle_check_in: 'Have your mid cycle conversation and record what you agreed.',
  self_review: 'Write your own account of the cycle before your manager writes theirs.',
  manager_review: 'Your manager is writing their review.',
  calibration: 'Managers are comparing reviews across teams. Nothing is asked of you.',
  final_review: 'Your review is being finalised.',
  employee_acknowledgment: 'Read your review and acknowledge it. You can disagree in writing.',
  development_planning: 'Turn the conversation into development actions you actually want.',
  closed: 'This cycle is closed.',
}

export function stageRank(stage: CycleStage): number {
  return CYCLE_STAGES.indexOf(stage) + 1
}

export type StageChange =
  | { ok: true }
  | { ok: false; reason: 'not_permitted' | 'cycle_closed' | 'stage_skipped' | 'stage_locked' }

/**
 * May the cycle move from one stage to another?
 *
 * Forward one stage at a time: skipping self review to reach calibration means
 * calibrating on nothing. Backwards is allowed only before calibration, because
 * once managers have compared people against each other, reopening goal setting
 * changes the basis they were compared on.
 */
export function checkStageChange(
  from: CycleStage,
  to: CycleStage,
  isHr: boolean,
): StageChange {
  if (!isHr) return { ok: false, reason: 'not_permitted' }
  if (from === 'closed') return { ok: false, reason: 'cycle_closed' }

  const a = stageRank(from)
  const b = stageRank(to)
  if (b > a + 1) return { ok: false, reason: 'stage_skipped' }
  if (b < a && a >= stageRank('calibration')) return { ok: false, reason: 'stage_locked' }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Review states
// ---------------------------------------------------------------------------

export const REVIEW_STATES = [
  'not_started',
  'in_progress',
  'submitted',
  'in_calibration',
  'finalised',
  'acknowledged',
  'closed',
  'correction_open',
] as const

export type ReviewState = (typeof REVIEW_STATES)[number]

export const REVIEW_STATE_LABELS: Record<ReviewState, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  submitted: 'Submitted',
  in_calibration: 'In calibration',
  finalised: 'Finalised',
  acknowledged: 'Acknowledged',
  closed: 'Closed',
  correction_open: 'Correction open',
}

/**
 * A closed review takes no writes at all.
 *
 * 'correction_open' is deliberately writable: it is the state a review is put
 * into by review_open_correction(), which needs HR and records a reason. That
 * is the authorized workflow, and it is the only door.
 */
export function isReviewLocked(state: ReviewState): boolean {
  return state === 'closed'
}

/** Finalised and acknowledged reviews are settled: only HR may still write. */
export function isReviewSettled(state: ReviewState): boolean {
  return state === 'finalised' || state === 'acknowledged'
}

export function canWriteReview(state: ReviewState, isHr: boolean): boolean {
  if (isReviewLocked(state)) return false
  if (isReviewSettled(state)) return isHr
  return true
}

export const REVIEW_KINDS = ['self', 'manager', 'skip_level', 'final'] as const
export type ReviewKind = (typeof REVIEW_KINDS)[number]

export const REVIEW_KIND_LABELS: Record<ReviewKind, string> = {
  self: 'Self review',
  manager: 'Manager review',
  skip_level: 'Skip level review',
  final: 'Final review',
}
