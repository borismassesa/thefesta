// The tightest authorization rules in the app, so the tests are written as the
// attacks they are meant to stop rather than as coverage of the functions.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  canAcknowledge,
  canApproveGoal,
  canEditReview,
  canUpdateGoal,
  canViewFeedbackResponse,
  canViewGoal,
  canViewReview,
  canViewSection,
  isDirectManagerOf,
  respondentLabel,
  type GoalSubject,
  type ReviewSubject,
  type Viewer,
} from './authorization'

const EMP = 'emp'
const MGR = 'mgr'
const PEER = 'peer'
const OTHER_MGR = 'other-mgr'
const SKIP = 'skip-level-boss'

const viewer = (id: string, reports: string[] = [], isHr = false): Viewer => ({
  employeeId: id,
  directReportIds: reports,
  isHr,
})

const employee = viewer(EMP)
const manager = viewer(MGR, [EMP, PEER])
const peer = viewer(PEER)
const otherManager = viewer(OTHER_MGR, ['someone-else'])
// A department head two levels up. They manage the manager, NOT the employee.
const skipLevel = viewer(SKIP, [MGR])
const hr = viewer('hr', [], true)

const managerReview: ReviewSubject = {
  reviewId: 'r1',
  employeeId: EMP,
  reviewerEmployeeId: MGR,
  kind: 'manager',
}

const selfReview: ReviewSubject = {
  reviewId: 'r2',
  employeeId: EMP,
  reviewerEmployeeId: EMP,
  kind: 'self',
}

describe('isDirectManagerOf', () => {
  it('recognises a direct manager', () => {
    assert.equal(isDirectManagerOf(manager, EMP), true)
  })

  it('does NOT walk the reporting chain', () => {
    // The whole acceptance criterion. A department head manages the manager,
    // not the employee, and must not inherit access to their review.
    assert.equal(isDirectManagerOf(skipLevel, EMP), false)
  })

  it('refuses to make anybody their own manager', () => {
    assert.equal(isDirectManagerOf(viewer(EMP, [EMP]), EMP), false)
  })
})

describe('canViewReview', () => {
  it('lets the subject read their own review', () => {
    assert.equal(canViewReview(managerReview, employee), true)
  })

  it('lets the named reviewer and the direct manager read it', () => {
    assert.equal(canViewReview(managerReview, manager), true)
  })

  it('DOES NOT let a colleague read another employee’s review', () => {
    assert.equal(canViewReview(managerReview, peer), false)
  })

  it('DOES NOT let a manager of somebody else read it', () => {
    assert.equal(canViewReview(managerReview, otherManager), false)
  })

  it('DOES NOT let a skip level manager read it by inheritance', () => {
    assert.equal(canViewReview(managerReview, skipLevel), false)
  })

  it('lets HR read it', () => {
    assert.equal(canViewReview(managerReview, hr), true)
  })
})

describe('canEditReview', () => {
  it('is narrower than reading: the subject cannot write their manager review', () => {
    assert.equal(canViewReview(managerReview, employee), true)
    assert.equal(canEditReview(managerReview, employee), false)
  })

  it('lets the named reviewer write it', () => {
    assert.equal(canEditReview(managerReview, manager), true)
  })

  it('does NOT let a direct manager who is not the named reviewer write it', () => {
    // This is what makes freezing reviewer_employee_id worth doing: somebody
    // who inherits the reporting line in June does not inherit the review.
    const newManager = viewer('new-mgr', [EMP])
    assert.equal(canViewReview(managerReview, newManager), true)
    assert.equal(canEditReview(managerReview, newManager), false)
  })

  it('lets the subject write their own self review', () => {
    assert.equal(canEditReview(selfReview, employee), true)
    assert.equal(canEditReview(selfReview, manager), false)
  })
})

describe('canAcknowledge', () => {
  it('is the subject alone', () => {
    assert.equal(canAcknowledge(managerReview, employee), true)
    assert.equal(canAcknowledge(managerReview, manager), false)
    // Not even HR signs on somebody's behalf. That signature is the employee's
    // or it means nothing.
    assert.equal(canAcknowledge(managerReview, hr), false)
  })
})

describe('canViewSection', () => {
  it('shows the employee-visible section to both sides', () => {
    assert.equal(canViewSection('employee_visible', managerReview, employee), true)
    assert.equal(canViewSection('employee_visible', managerReview, manager), true)
  })

  it('NEVER shows a calibration note to the subject', () => {
    assert.equal(canViewSection('calibration_only', managerReview, employee), false)
  })

  it('does not show the reviewer’s working notes to the subject either', () => {
    assert.equal(canViewSection('manager_only', managerReview, employee), false)
  })

  it('shows calibration to the reviewer', () => {
    assert.equal(canViewSection('calibration_only', managerReview, manager), true)
  })

  it('hides hr_only from everybody but HR', () => {
    assert.equal(canViewSection('hr_only', managerReview, manager), false)
    assert.equal(canViewSection('hr_only', managerReview, employee), false)
    assert.equal(canViewSection('hr_only', managerReview, hr), true)
  })

  it('hides a manager’s OWN calibration note from them', () => {
    // A manager is also somebody's report. Being senior must not mean reading
    // the calibration discussion about yourself.
    const ownReview: ReviewSubject = {
      reviewId: 'r3',
      employeeId: MGR,
      reviewerEmployeeId: SKIP,
      kind: 'manager',
    }
    assert.equal(canViewReview(ownReview, manager), true, 'they can open their own review')
    assert.equal(canViewSection('calibration_only', ownReview, manager), false)
  })
})

describe('canViewFeedbackResponse', () => {
  const shared = {
    requestId: 'q1',
    subjectEmployeeId: EMP,
    respondentEmployeeId: PEER,
    requestedByEmployeeId: EMP,
    isAnonymous: true,
    sharedWithSubject: true,
  }

  it('lets the subject read feedback that was shared with them', () => {
    assert.equal(canViewFeedbackResponse(shared, employee), true)
  })

  it('withholds it when the request was not shared with the subject', () => {
    // Upward feedback about a manager is routinely not shown to them verbatim.
    assert.equal(
      canViewFeedbackResponse({ ...shared, sharedWithSubject: false }, employee),
      false,
    )
  })

  it('still lets their manager read the unshared answer', () => {
    assert.equal(
      canViewFeedbackResponse({ ...shared, sharedWithSubject: false }, manager),
      true,
    )
  })

  it('lets the author read what they wrote', () => {
    assert.equal(canViewFeedbackResponse(shared, peer), true)
  })

  it('shuts out an unrelated manager entirely', () => {
    assert.equal(canViewFeedbackResponse(shared, otherManager), false)
  })
})

describe('respondentLabel', () => {
  it('never names an anonymous respondent, to anybody', () => {
    const request = {
      requestId: 'q1',
      subjectEmployeeId: EMP,
      respondentEmployeeId: PEER,
      requestedByEmployeeId: EMP,
      isAnonymous: true,
      sharedWithSubject: true,
    }
    const label = respondentLabel(request, 'peer', 'Asha Mrema')
    assert.ok(!label.includes('Asha'), 'the name must not survive anonymity')
    assert.equal(label, 'Anonymous (peer)')
  })

  it('names a named one', () => {
    const request = {
      requestId: 'q1',
      subjectEmployeeId: EMP,
      respondentEmployeeId: PEER,
      requestedByEmployeeId: EMP,
      isAnonymous: false,
      sharedWithSubject: true,
    }
    assert.equal(respondentLabel(request, 'peer', 'Asha Mrema'), 'Asha Mrema')
  })
})

describe('canViewGoal', () => {
  const base: GoalSubject = {
    ownerEmployeeId: EMP,
    createdByEmployeeId: EMP,
    visibility: 'manager',
    level: 'employee',
    department: 'Technology',
  }

  it('shows a manager-visibility goal to the owner and their manager', () => {
    assert.equal(canViewGoal(base, employee), true)
    assert.equal(canViewGoal(base, manager), true)
  })

  it('hides it from a peer', () => {
    assert.equal(canViewGoal(base, peer), false)
  })

  it('honours private against the manager AND against HR’s convenience', () => {
    const priv = { ...base, visibility: 'private' as const }
    assert.equal(canViewGoal(priv, employee), true)
    assert.equal(canViewGoal(priv, manager), false)
    // HR retains access because they have to be able to investigate. Everybody
    // else, including the manager, does not.
    assert.equal(canViewGoal(priv, hr), true)
  })

  it('shows company and brand goals to everybody', () => {
    assert.equal(canViewGoal({ ...base, level: 'company', ownerEmployeeId: null }, peer), true)
    assert.equal(canViewGoal({ ...base, level: 'brand', ownerEmployeeId: null }, peer), true)
  })

  it('scopes a department goal to that department', () => {
    const dept = { ...base, visibility: 'department' as const, level: 'department' as const, ownerEmployeeId: null }
    assert.equal(canViewGoal(dept, { ...peer, department: 'Technology' }), true)
    assert.equal(canViewGoal(dept, { ...peer, department: 'Operations' }), false)
  })

  it('hides a deleted goal from everybody', () => {
    assert.equal(canViewGoal({ ...base, deleted: true }, employee), false)
    assert.equal(canViewGoal({ ...base, deleted: true }, hr), false)
  })
})

describe('canUpdateGoal', () => {
  it('is the owner and their manager', () => {
    const goal: GoalSubject = {
      ownerEmployeeId: EMP,
      createdByEmployeeId: EMP,
      visibility: 'organisation',
      level: 'employee',
      department: null,
    }
    assert.equal(canUpdateGoal(goal, employee), true)
    assert.equal(canUpdateGoal(goal, manager), true)
    // Visible to the whole company does not mean writable by it.
    assert.equal(canViewGoal(goal, peer), true)
    assert.equal(canUpdateGoal(goal, peer), false)
  })
})

describe('canApproveGoal', () => {
  const goal: GoalSubject = {
    ownerEmployeeId: EMP,
    createdByEmployeeId: EMP,
    visibility: 'manager',
    level: 'employee',
    department: null,
  }

  it('lets the direct manager approve', () => {
    assert.equal(canApproveGoal(goal, manager), true)
  })

  it('NEVER lets somebody approve their own goals', () => {
    assert.equal(canApproveGoal(goal, employee), false)
    // Including HR, and including an HR person approving their own.
    const hrOwnGoal = { ...goal, ownerEmployeeId: 'hr' }
    assert.equal(canApproveGoal(hrOwnGoal, hr), false)
  })

  it('does not let an unrelated manager approve', () => {
    assert.equal(canApproveGoal(goal, otherManager), false)
    assert.equal(canApproveGoal(goal, skipLevel), false)
  })
})
