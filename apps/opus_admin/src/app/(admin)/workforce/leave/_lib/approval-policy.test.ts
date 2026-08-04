import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import type { CallerScope, SelfEmployee } from '@/lib/workforce/scope'
import { narrowEmployeeFilter } from '@/lib/workforce/approvals'
import {
  LEAVE_APPROVE_PERMISSION,
  canDecideLeaveRequest,
  leaveReadScope,
  type DecidableRequest,
} from './approval-policy'

// Phase 3C. Team callers decide for their direct reports only; org callers
// decide organisation-wide; nobody decides their own.

const MANAGER: SelfEmployee = {
  id: 'emp-manager',
  fullName: 'Manager',
  email: 'manager@opusfesta.com',
  status: 'Active',
  department: 'Technology',
  managerId: null,
  clerkUserId: 'user_mgr',
}

function scope(over: Partial<CallerScope> = {}): CallerScope {
  return {
    employee: MANAGER,
    workspaceAccess: 'full',
    team: {
      directReportIds: ['emp-report-1', 'emp-report-2'],
      descendantReportIds: [],
      delegatedEmployeeIds: [],
      actingForManagerIds: [],
    },
    permissions: new Set<string>(),
    tiers: new Set(['self', 'team'] as const),
    ...over,
  } as CallerScope
}

const orgScope = () =>
  scope({
    permissions: new Set([LEAVE_APPROVE_PERMISSION]),
    tiers: new Set(['self', 'org'] as const),
  } as Partial<CallerScope>)

function request(over: Partial<DecidableRequest> = {}): DecidableRequest {
  return { id: 'req-1', employeeId: 'emp-report-1', status: 'Pending', ...over }
}

describe('leave read scope', () => {
  it('org permission reads organisation-wide', () => {
    assert.deepEqual(leaveReadScope(orgScope()), { kind: 'org' })
  })
  it('a manager reads exactly their direct reports', () => {
    const read = leaveReadScope(scope())
    assert.equal(read.kind, 'team')
    if (read.kind === 'team') {
      assert.deepEqual(read.employeeIds, ['emp-report-1', 'emp-report-2'])
    }
  })
  // Regression 11: an empty team must NOT widen to department or org.
  it('a manager with zero reports reads nothing, never everything', () => {
    const empty = scope({
      team: {
        directReportIds: [],
        descendantReportIds: [],
        delegatedEmployeeIds: [],
        actingForManagerIds: [],
      },
    })
    assert.deepEqual(leaveReadScope(empty), { kind: 'none' })
  })
})

describe('decision authority', () => {
  // Regression 5.
  it('a manager may decide a direct report’s pending request', () => {
    assert.equal(canDecideLeaveRequest(request(), scope()).allowed, true)
  })
  // Regression 2 + 6: peers and non-reports are out of reach.
  it('a manager cannot decide a peer’s request', () => {
    const decision = canDecideLeaveRequest(request({ employeeId: 'emp-peer' }), scope())
    assert.equal(decision.allowed, false)
    assert.match(decision.allowed === false ? decision.reason : '', /direct reports/i)
  })
  it('a manager cannot decide another manager’s report', () => {
    assert.equal(
      canDecideLeaveRequest(request({ employeeId: 'emp-other-report' }), scope()).allowed,
      false,
    )
  })
  // Regression 7.
  it('an org caller may decide anyone’s request', () => {
    assert.equal(
      canDecideLeaveRequest(request({ employeeId: 'emp-anyone' }), orgScope()).allowed,
      true,
    )
  })
  // Regression 8, and the important one: org permission must NOT buy your own
  // signature. Self-approval is checked before any permission is consulted.
  it('nobody decides their own request, even with org permission', () => {
    const own = request({ employeeId: MANAGER.id })
    assert.equal(canDecideLeaveRequest(own, scope()).allowed, false)
    const orgDecision = canDecideLeaveRequest(own, orgScope())
    assert.equal(orgDecision.allowed, false)
    assert.match(orgDecision.allowed === false ? orgDecision.reason : '', /your own/i)
  })
  // Regression 9.
  it('already-decided requests cannot be decided again', () => {
    for (const status of ['Approved', 'Rejected', 'Cancelled'] as const) {
      const decision = canDecideLeaveRequest(request({ status }), orgScope())
      assert.equal(decision.allowed, false, `${status} should be undecidable`)
    }
  })
  it('reports authority failure before status, so scope is not leaked', () => {
    // An out-of-scope caller must not learn the request's status from the
    // error message: that is itself information about someone else's leave.
    const decision = canDecideLeaveRequest(
      request({ employeeId: 'emp-peer', status: 'Approved' }),
      scope(),
    )
    assert.equal(decision.allowed, false)
    assert.doesNotMatch(decision.allowed === false ? decision.reason : '', /approved/i)
  })
})

// Regression 4: a query parameter narrows, never widens.
describe('filters cannot widen team scope', () => {
  it('a requested id outside the team is dropped', () => {
    const narrowed = narrowEmployeeFilter(
      scope(),
      ['emp-report-1', 'emp-peer', 'emp-anyone'],
      LEAVE_APPROVE_PERMISSION,
    )
    assert.equal(narrowed.scopeAll, false)
    if (!narrowed.scopeAll) {
      assert.deepEqual(narrowed.employeeIds, ['emp-report-1'])
    }
  })
  it('requesting only out-of-scope ids yields an empty set, not the team', () => {
    const narrowed = narrowEmployeeFilter(scope(), ['emp-peer'], LEAVE_APPROVE_PERMISSION)
    assert.equal(narrowed.scopeAll, false)
    if (!narrowed.scopeAll) assert.deepEqual(narrowed.employeeIds, [])
  })
  it('no filter gives a manager their own team only', () => {
    const narrowed = narrowEmployeeFilter(scope(), null, LEAVE_APPROVE_PERMISSION)
    assert.equal(narrowed.scopeAll, false)
    if (!narrowed.scopeAll) {
      assert.deepEqual(narrowed.employeeIds, ['emp-report-1', 'emp-report-2'])
    }
  })
  it('an org caller with no filter reads everything', () => {
    assert.equal(
      narrowEmployeeFilter(orgScope(), null, LEAVE_APPROVE_PERMISSION).scopeAll,
      true,
    )
  })
})
