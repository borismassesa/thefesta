// Performance module failures, translated.
//
// The database functions raise ERRCODE P0001 with stable dotted tokens, read
// here under an exact-match whitelist. This matters more here than anywhere
// else in the app: a PostgREST error message can carry a row value, and the row
// values on this module are somebody's rating, their manager's private note,
// and the text of a calibration discussion.
//
// We render text WE wrote, keyed by a token WE defined. Anything unrecognised
// becomes one generic sentence.

export const PERFORMANCE_ERROR_TOKENS = [
  // Goals
  'goal.not_found',
  'goal.not_owner',
  'goal.closed',
  'goal.progress_out_of_range',
  'goal.parent_not_found',
  'goal.alignment_inverted',
  'goal.alignment_cycle',
  'goal.already_approved',
  'goal.not_pending',
  'goal.not_manager',
  'goal.self_approval',
  'goal.decision_note_required',
  'goal.unknown_decision',
  'goal.weights_over',
  'goal.weights_under',
  'goal.weights_invalid',
  'goal.too_few',
  'goal.too_many',
  'goal.history_immutable',
  // Cycles
  'performance.cycle_not_found',
  'performance.cycle_closed',
  'performance.unknown_stage',
  'performance.stage_skipped',
  'performance.stage_locked',
  'performance.not_permitted',
  // Reviews
  'performance.review_not_found',
  'performance.not_reviewer',
  'performance.not_subject',
  'performance.review_closed',
  'performance.review_finalised',
  'performance.already_submitted',
  'performance.not_finalised',
  'performance.self_review_not_permitted',
  'performance.disagreement_note_required',
  'performance.correction_reason_required',
  'performance.nothing_to_correct',
  // Ratings
  'performance.rating_subject_required',
  'performance.rationale_required',
  'performance.change_reason_required',
  'performance.rating_out_of_scale',
  'performance.rating_immutable',
  'performance.no_component_ratings',
  // Feedback and evidence
  'performance.feedback_not_permitted',
  'performance.evidence_not_permitted',
] as const

export type PerformanceErrorToken = (typeof PERFORMANCE_ERROR_TOKENS)[number]

const MESSAGES: Record<PerformanceErrorToken, string> = {
  // Deliberately identical to a genuinely missing goal. Telling somebody "you
  // lack permission" confirms the goal exists and who it belongs to.
  'goal.not_found': 'That goal is not available to you.',
  'goal.not_owner': 'You can see this goal but not change it. It belongs to somebody else.',
  'goal.closed': 'This goal is closed. Reopen it before recording more progress.',
  'goal.progress_out_of_range': 'Progress has to be between 0 and 100.',
  'goal.parent_not_found': 'The goal you are aligning to is not available.',
  'goal.alignment_inverted':
    'A goal cannot roll up to one below it. A company goal does not report to a personal goal.',
  'goal.alignment_cycle':
    'That would make two goals depend on each other, and neither could ever roll up.',
  'goal.already_approved': 'This goal is already approved.',
  'goal.not_pending': 'This goal is not waiting for a decision.',
  'goal.not_manager': 'Only this person’s own manager can decide on their goals.',
  'goal.self_approval': 'You cannot approve your own goals. That is what the approval step is for.',
  'goal.decision_note_required': 'Say what needs to change. It goes back to them with your decision.',
  'goal.unknown_decision': 'That is not a decision this step accepts.',
  'goal.weights_over': 'Your goals add up to more than this cycle allows. Reduce a weight and try again.',
  'goal.weights_under': 'Your goals do not add up to the full weight this cycle asks for yet.',
  'goal.weights_invalid': 'Your goal weights do not satisfy this cycle’s policy yet.',
  'goal.too_few': 'This cycle asks for more goals than you have set.',
  'goal.too_many': 'This cycle allows fewer goals than you have set.',
  'goal.history_immutable': 'Goal history cannot be edited.',

  'performance.cycle_not_found': 'That performance cycle is not available.',
  'performance.cycle_closed': 'This cycle is closed.',
  'performance.unknown_stage': 'That is not a stage of the cycle.',
  'performance.stage_skipped':
    'The cycle moves one stage at a time. Complete the stage before this one first.',
  'performance.stage_locked':
    'Calibration has already run. The cycle cannot go back to an earlier stage.',
  'performance.not_permitted': 'Only People Ops can do that.',

  // Same message whether it does not exist or is not yours: the existence of a
  // review, and who it is about, is itself sensitive.
  'performance.review_not_found': 'That review is not available to you.',
  'performance.not_reviewer': 'You can read this review but not write it.',
  'performance.not_subject': 'Only the person being reviewed can acknowledge their review.',
  'performance.review_closed':
    'This review is closed. People Ops can open a correction if something in it is wrong.',
  'performance.review_finalised':
    'This review has been finalised. Ask People Ops to open a correction.',
  'performance.already_submitted': 'This review has already been submitted.',
  'performance.not_finalised': 'This review is not finished yet, so there is nothing to acknowledge.',
  'performance.self_review_not_permitted': 'You cannot write the manager review of yourself.',
  'performance.disagreement_note_required':
    'Say what you disagree with. It stays on the record next to the review.',
  'performance.correction_reason_required': 'Give the reason for opening a correction. It is recorded.',
  'performance.nothing_to_correct': 'This review has not been finalised, so there is nothing to correct.',

  'performance.rating_subject_required': 'A rating has to be about one competency or one goal.',
  'performance.rationale_required':
    'Say why you are giving this rating. An unexplained rating cannot be discussed.',
  'performance.change_reason_required':
    'This rating has already been given. Say why you are changing it.',
  'performance.rating_out_of_scale': 'That rating is outside the scale this cycle uses.',
  'performance.rating_immutable':
    'A rating cannot be edited or deleted. Setting a new one keeps both on the record.',
  'performance.no_component_ratings':
    'Rate the competencies and goals first. An overall rating with nothing under it cannot be explained.',

  'performance.feedback_not_permitted': 'That feedback is not available to you.',
  'performance.evidence_not_permitted': 'That activity record is not available to you.',
}

const GENERIC = 'That could not be saved right now. Try again in a moment.'

const TOKEN_SET = new Set<string>(PERFORMANCE_ERROR_TOKENS)

export function performanceErrorToken(error: unknown): PerformanceErrorToken | null {
  if (!error || typeof error !== 'object') return null
  const message = (error as { message?: unknown }).message
  if (typeof message !== 'string') return null
  const trimmed = message.trim()
  return TOKEN_SET.has(trimmed) ? (trimmed as PerformanceErrorToken) : null
}

export function performanceMessage(error: unknown): string {
  const token = performanceErrorToken(error)
  return token ? MESSAGES[token] : GENERIC
}

export function messageForToken(token: PerformanceErrorToken): string {
  return MESSAGES[token]
}
