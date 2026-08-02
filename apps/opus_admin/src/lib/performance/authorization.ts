// Who may read and write performance data — pure, no I/O.
//
// Mirrors performance_can_view_review(), performance_can_edit_review(),
// performance_visible_sections() and feedback_for_subject() in the migration.
// The database decides; this exists so the UI does not offer a door that is
// going to be shut in its face, and so the rules can be argued about in a test.
//
// THIS FILE IS DELIBERATELY MORE RESTRICTIVE THAN THE REST OF WORKSPACE.
// A task is visible to anybody connected to it. A review is visible to four
// people and no fifth. If a rule here looks too tight, that is the intent.

export type ReviewSubject = {
  reviewId: string
  employeeId: string
  reviewerEmployeeId: string | null
  kind: 'self' | 'manager' | 'skip_level' | 'final'
}

export type Viewer = {
  employeeId: string
  /** Direct reports only. Not the whole subtree. */
  directReportIds: string[]
  isHr: boolean
}

/**
 * Is this viewer the employee's DIRECT manager?
 *
 * "Managers only review eligible direct reports" is the acceptance criterion.
 * Walking the reporting chain would let a department head open the review of
 * somebody four levels down whom they have never worked with. A skip level
 * review is a review row with a named reviewer, not an implicit consequence of
 * the org chart.
 */
export function isDirectManagerOf(viewer: Viewer, employeeId: string): boolean {
  return viewer.employeeId !== employeeId && viewer.directReportIds.includes(employeeId)
}

/**
 * May this viewer READ the review?
 *
 * The subject, the named reviewer, the subject's direct manager, HR. Note what
 * is absent: a project lead, a department head two levels up, anybody holding a
 * broad workforce permission. There is no legitimate reading of "my colleague
 * can see my performance review".
 */
export function canViewReview(review: ReviewSubject, viewer: Viewer): boolean {
  if (viewer.isHr) return true
  if (review.employeeId === viewer.employeeId) return true
  if (review.reviewerEmployeeId === viewer.employeeId) return true
  return isDirectManagerOf(viewer, review.employeeId)
}

/**
 * May this viewer WRITE the review?
 *
 * Narrower than reading. A direct manager who is not the named reviewer can
 * read but not write, which is what makes freezing reviewer_employee_id
 * meaningful: if somebody changes manager in June, the review still belongs to
 * whoever actually managed them through the cycle.
 */
export function canEditReview(review: ReviewSubject, viewer: Viewer): boolean {
  if (viewer.isHr) return true
  if (review.kind === 'self') return review.employeeId === viewer.employeeId
  return review.reviewerEmployeeId === viewer.employeeId
}

/** Only the subject signs. A manager acknowledging on somebody's behalf is not an acknowledgment. */
export function canAcknowledge(review: ReviewSubject, viewer: Viewer): boolean {
  return review.employeeId === viewer.employeeId
}

// ---------------------------------------------------------------------------
// Section visibility
// ---------------------------------------------------------------------------

export const SECTION_VISIBILITIES = [
  'employee_visible',
  'manager_only',
  'calibration_only',
  'hr_only',
] as const

export type SectionVisibility = (typeof SECTION_VISIBILITIES)[number]

export const SECTION_VISIBILITY_LABELS: Record<SectionVisibility, string> = {
  employee_visible: 'Shared with the employee',
  manager_only: 'Reviewer only',
  calibration_only: 'Calibration only',
  hr_only: 'People Ops only',
}

/**
 * May this viewer see this section of a review they are already entitled to open?
 *
 * THE CALIBRATION RULE. 'calibration_only' is never shown to the subject: not
 * during the cycle, not after it closes, not in the acknowledgment view.
 * Calibration is managers comparing people to one another, and half of what
 * makes it useful is that it is candid about somebody who is not in the room.
 * Closing the cycle does not declassify it.
 *
 * Note the ordering: being the SUBJECT is checked before being a manager. A
 * manager reviewing their own manager review would otherwise read the
 * calibration note about themselves.
 */
export function canViewSection(
  visibility: SectionVisibility,
  review: ReviewSubject,
  viewer: Viewer,
): boolean {
  if (viewer.isHr) return true

  const isSubject = review.employeeId === viewer.employeeId
  const isReviewer =
    review.reviewerEmployeeId === viewer.employeeId || isDirectManagerOf(viewer, review.employeeId)

  if (visibility === 'hr_only') return false
  if (visibility === 'employee_visible') return isSubject || isReviewer
  // Everything else is reviewer-side, and being the subject disqualifies you
  // however senior you are.
  return isReviewer && !isSubject
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export type FeedbackRequestSubject = {
  requestId: string
  subjectEmployeeId: string
  respondentEmployeeId: string | null
  requestedByEmployeeId: string | null
  isAnonymous: boolean
  sharedWithSubject: boolean
}

/**
 * May this viewer read the ANSWER?
 *
 * Three separate questions live here, and collapsing them is how an anonymous
 * 360 stops being anonymous:
 *   can you see that feedback was requested,
 *   can you see the answer,
 *   can you see who wrote it.
 */
export function canViewFeedbackResponse(
  request: FeedbackRequestSubject,
  viewer: Viewer,
): boolean {
  if (viewer.isHr) return true
  // The author always reads back what they wrote.
  if (request.respondentEmployeeId === viewer.employeeId) return true

  // BEING THE SUBJECT IS DECIDED BEFORE ANYTHING ELSE, and it is the narrower
  // answer. People usually request their own 360, so the requester branch below
  // would otherwise hand a subject the very responses somebody marked as not
  // for them.
  if (request.subjectEmployeeId === viewer.employeeId) return request.sharedWithSubject

  if (request.requestedByEmployeeId === viewer.employeeId) return true
  return isDirectManagerOf(viewer, request.subjectEmployeeId)
}

/**
 * What name goes next to a piece of feedback.
 *
 * Anonymity was decided when the request was sent, and it is applied at READ
 * time to everybody, HR included. Deciding afterwards would let whoever reads
 * it choose to unmask the author, which is the one thing an anonymous
 * respondent was promised would not happen.
 */
export function respondentLabel(
  request: FeedbackRequestSubject,
  relationship: string,
  name: string | null,
): string {
  if (request.isAnonymous) return `Anonymous (${relationship.replace(/_/g, ' ')})`
  return name ?? 'Unnamed'
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export type GoalSubject = {
  ownerEmployeeId: string | null
  createdByEmployeeId: string | null
  visibility: 'private' | 'manager' | 'team' | 'department' | 'organisation'
  level: 'company' | 'brand' | 'department' | 'team' | 'employee'
  department: string | null
  deleted?: boolean
}

/**
 * May this viewer see the goal?
 *
 * Looser than a review on purpose: a company goal everybody can read is the
 * point of having one. 'private' is honoured against the manager too, because
 * a goal marked private and then shown to a manager is worse than having no
 * private option at all.
 */
export function canViewGoal(
  goal: GoalSubject,
  viewer: Viewer & { department?: string | null },
): boolean {
  if (goal.deleted) return false
  if (goal.ownerEmployeeId === viewer.employeeId) return true
  if (goal.createdByEmployeeId === viewer.employeeId) return true
  if (goal.visibility === 'private') return viewer.isHr
  if (viewer.isHr) return true
  if (goal.ownerEmployeeId && isDirectManagerOf(viewer, goal.ownerEmployeeId)) return true
  if (goal.visibility === 'organisation') return true
  if (goal.level === 'company' || goal.level === 'brand') return true
  if (goal.visibility === 'department') {
    return Boolean(goal.department) && goal.department === (viewer.department ?? null)
  }
  return false
}

/** Seeing a goal is not owning it. Only the owner and their manager move it. */
export function canUpdateGoal(goal: GoalSubject, viewer: Viewer): boolean {
  if (viewer.isHr) return true
  if (goal.ownerEmployeeId === viewer.employeeId) return true
  return Boolean(goal.ownerEmployeeId) && isDirectManagerOf(viewer, goal.ownerEmployeeId!)
}

/**
 * May this viewer decide on the goal's approval?
 *
 * Nobody approves their own goals, HR included. That is the entire point of
 * having an approval step, and it is the one rule here with no exception.
 */
export function canApproveGoal(goal: GoalSubject, viewer: Viewer): boolean {
  if (goal.ownerEmployeeId === viewer.employeeId) return false
  if (viewer.isHr) return true
  return Boolean(goal.ownerEmployeeId) && isDirectManagerOf(viewer, goal.ownerEmployeeId!)
}
