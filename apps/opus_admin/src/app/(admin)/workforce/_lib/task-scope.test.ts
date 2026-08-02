import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { isInTaskScope, type CallerScope } from './task-scope-policy'

// Phase 3A. task-scope previously granted a manager authority over their whole
// DEPARTMENT on the strength of a single direct report, so one report let you
// manage tasks for every peer who shared your department. Team tier is now
// directReportIds only, matching every other Workforce module.
//
// These pin the boundary. The failure mode being guarded is silent
// over-assignment: a manager acting on someone who does not report to them
// looks identical to a legitimate action in the UI.

const orgScope: CallerScope = { canAssignAll: true, employeeId: 'emp-admin' }

const teamScope: CallerScope = {
  canAssignAll: false,
  reportIds: ['emp-report-1', 'emp-report-2'],
  employeeId: 'emp-manager',
}

describe('isInTaskScope', () => {
  it('org tier reaches anyone', () => {
    assert.equal(isInTaskScope(orgScope, 'emp-anyone'), true)
  })

  it('team tier reaches a direct report', () => {
    assert.equal(isInTaskScope(teamScope, 'emp-report-1'), true)
    assert.equal(isInTaskScope(teamScope, 'emp-report-2'), true)
  })

  // The regression this phase exists to prevent.
  it('team tier does NOT reach a department peer who is not a report', () => {
    assert.equal(isInTaskScope(teamScope, 'emp-peer-same-dept'), false)
  })

  it('team tier does not reach another manager’s report', () => {
    assert.equal(isInTaskScope(teamScope, 'emp-other-manager-report'), false)
  })

  it('team tier does not reach the manager themselves by default', () => {
    // The manager's own id is not in reportIds, so self-assignment goes
    // through the same denial as anyone else out of scope. Completing your
    // OWN task is a separate, unpermissioned path (canCompleteTask).
    assert.equal(isInTaskScope(teamScope, 'emp-manager'), false)
  })

  it('an empty report list reaches nobody', () => {
    const empty: CallerScope = {
      canAssignAll: false,
      reportIds: [],
      employeeId: 'emp-manager',
    }
    assert.equal(isInTaskScope(empty, 'emp-anyone'), false)
    assert.equal(isInTaskScope(empty, 'emp-manager'), false)
  })
})
