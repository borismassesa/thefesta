import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import {
  canActOnEmployee,
  canApprove,
  canCompleteTask,
  canManageTask,
  isSelfApproval,
  narrowEmployeeFilter,
} from './approvals'
import {
  EMPTY_TEAM_SCOPE,
  buildCallerScope,
  deriveTeamScope,
  type SelfEmployee,
} from './scope'

const SELF = 'emp-self'
const REPORT = 'emp-report'
const PEER = 'emp-peer'

const me = (id = SELF): SelfEmployee => ({
  id,
  fullName: 'Test Person',
  email: 'test@opusfesta.com',
  status: 'Active',
  department: 'Technology',
  managerId: null,
  clerkUserId: null,
})

const managerScope = buildCallerScope({
  employee: me(),
  access: 'full',
  team: deriveTeamScope([{ id: REPORT, status: 'Active' }]),
  permissions: new Set(),
})

// A manager who ALSO holds the org-wide approval key. The self-approval rule
// must still beat it.
const managerWithOrgKey = buildCallerScope({
  employee: me(),
  access: 'full',
  team: deriveTeamScope([{ id: REPORT, status: 'Active' }]),
  permissions: new Set(['workforce.leave.approve']),
})

const plainScope = buildCallerScope({
  employee: me(), access: 'full', team: EMPTY_TEAM_SCOPE, permissions: new Set(),
})

const orgOnlyScope = buildCallerScope({
  employee: null,
  access: null,
  team: EMPTY_TEAM_SCOPE,
  permissions: new Set(['workforce.leave.approve']),
})

describe('segregation of duties', () => {
  it('a manager cannot approve their own leave', () => {
    const d = canApprove({ employeeId: SELF }, managerScope, 'workforce.leave.approve')
    assert.equal(d.allowed, false)
  })

  it('self-approval is blocked EVEN holding the org-wide approval key', () => {
    const d = canApprove({ employeeId: SELF }, managerWithOrgKey, 'workforce.leave.approve')
    assert.equal(d.allowed, false)
    assert.match(d.allowed === false ? d.reason : '', /your own/i)
  })

  it('the same key still approves someone else', () => {
    const d = canApprove({ employeeId: PEER }, managerWithOrgKey, 'workforce.leave.approve')
    assert.equal(d.allowed, true)
  })

  it('applies to attendance corrections and timesheets alike', () => {
    for (const key of ['workforce.attendance.approve', 'workforce.timesheets.approve']) {
      const d = canApprove({ employeeId: SELF }, managerWithOrgKey, key)
      assert.equal(d.allowed, false, key)
    }
  })

  it('isSelfApproval is false for an Org-only administrator with no employee row', () => {
    assert.equal(isSelfApproval({ employeeId: SELF }, orgOnlyScope), false)
  })
})

describe('Team approval scope', () => {
  it('a manager approves a direct report without any Workforce key', () => {
    const d = canApprove({ employeeId: REPORT }, managerScope, 'workforce.leave.approve')
    assert.equal(d.allowed, true)
  })
  it('a manager cannot approve a peer', () => {
    const d = canApprove({ employeeId: PEER }, managerScope, 'workforce.leave.approve')
    assert.equal(d.allowed, false)
  })
  it('a plain employee approves nobody', () => {
    const d = canApprove({ employeeId: PEER }, plainScope, 'workforce.leave.approve')
    assert.equal(d.allowed, false)
  })
  it('a Resigned report confers no approval authority', () => {
    const scope = buildCallerScope({
      employee: me(),
      access: 'full',
      team: deriveTeamScope([{ id: REPORT, status: 'Resigned' }]),
      permissions: new Set(),
    })
    assert.equal(canApprove({ employeeId: REPORT }, scope, 'workforce.leave.approve').allowed, false)
  })
})

describe('canActOnEmployee', () => {
  it('org permission reaches anyone', () => {
    assert.equal(canActOnEmployee(orgOnlyScope, PEER, 'workforce.leave.approve'), true)
  })
  it('team scope reaches reports only', () => {
    assert.equal(canActOnEmployee(managerScope, REPORT, 'workforce.leave.approve'), true)
    assert.equal(canActOnEmployee(managerScope, PEER, 'workforce.leave.approve'), false)
  })
})

describe('query parameters never grant authority', () => {
  const key = 'workforce.employees.read'

  it('a requested id outside team scope is DROPPED, not honoured', () => {
    const out = narrowEmployeeFilter(managerScope, [REPORT, PEER], key)
    assert.equal(out.scopeAll, false)
    if (!out.scopeAll) assert.deepEqual(out.employeeIds, [REPORT])
  })

  it('?scope=team with no reports grants nothing', () => {
    const out = narrowEmployeeFilter(plainScope, null, key)
    assert.equal(out.scopeAll, false)
    if (!out.scopeAll) assert.deepEqual(out.employeeIds, [])
  })

  it('a manager asking for everything gets only their reports', () => {
    const out = narrowEmployeeFilter(managerScope, null, key)
    assert.equal(out.scopeAll, false)
    if (!out.scopeAll) assert.deepEqual(out.employeeIds, [REPORT])
  })

  it('an org holder asking for everything gets everything', () => {
    const orgScope = buildCallerScope({
      employee: me(), access: 'full', team: EMPTY_TEAM_SCOPE, permissions: new Set([key]),
    })
    assert.equal(narrowEmployeeFilter(orgScope, null, key).scopeAll, true)
  })

  it('an org holder can still narrow to a subset', () => {
    const orgScope = buildCallerScope({
      employee: me(), access: 'full', team: EMPTY_TEAM_SCOPE, permissions: new Set([key]),
    })
    const out = narrowEmployeeFilter(orgScope, [PEER], key)
    assert.equal(out.scopeAll, false)
    if (!out.scopeAll) assert.deepEqual(out.employeeIds, [PEER])
  })
})

describe('task authority', () => {
  it('completing your own task needs no permission', () => {
    assert.equal(canCompleteTask({ assigneeId: SELF }, plainScope), true)
  })
  it('you cannot complete someone else’s task via the self path', () => {
    assert.equal(canCompleteTask({ assigneeId: PEER }, plainScope), false)
  })
  it('a manager manages a direct report’s task', () => {
    assert.equal(canManageTask({ assigneeId: REPORT }, managerScope), true)
  })
  it('a manager CANNOT manage a department peer (narrowed from today)', () => {
    // task-scope.ts:42 currently grants department-wide reach to anyone with
    // one direct report. This is the narrowing to directReportIds.
    assert.equal(canManageTask({ assigneeId: PEER }, managerScope), false)
  })
  it('department-wide reach requires workforce.tasks.assign', () => {
    const assigner = buildCallerScope({
      employee: me(),
      access: 'full',
      team: deriveTeamScope([{ id: REPORT, status: 'Active' }]),
      permissions: new Set(['workforce.tasks.assign']),
    })
    assert.equal(canManageTask({ assigneeId: PEER }, assigner), true)
  })
  it('a plain employee manages nobody’s tasks', () => {
    assert.equal(canManageTask({ assigneeId: PEER }, plainScope), false)
  })
})
