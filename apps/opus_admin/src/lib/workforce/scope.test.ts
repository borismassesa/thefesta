import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import {
  EMPTY_TEAM_SCOPE,
  LINKABLE_STATUSES,
  TEAM_MEMBER_STATUSES,
  buildCallerScope,
  canAutoLinkIdentity,
  canOpenWorkforceShell,
  deriveTeamScope,
  hasAnyWorkforcePermission,
  resolveSelfIdentity,
  resolveWorkspaceAccess,
  selfIdentityMessage,
  workforceLanding,
  workspaceNavFor,
  type SelfEmployee,
} from './scope'

const employee = (over: Partial<SelfEmployee> = {}): SelfEmployee => ({
  id: 'emp-1',
  fullName: 'Test Person',
  email: 'test@opusfesta.com',
  status: 'Active',
  department: 'Technology',
  managerId: null,
  clerkUserId: null,
  ...over,
})

describe('resolveWorkspaceAccess', () => {
  it('Active, On Leave and Onboarding get full access', () => {
    for (const s of ['Active', 'On Leave', 'Onboarding']) {
      assert.equal(resolveWorkspaceAccess(s), 'full', s)
    }
  })
  it('Resigned gets documents_only', () => {
    assert.equal(resolveWorkspaceAccess('Resigned'), 'documents_only')
  })
  it('an unknown status fails closed', () => {
    assert.equal(resolveWorkspaceAccess('Suspended'), 'denied')
    assert.equal(resolveWorkspaceAccess(''), 'denied')
  })
})

describe('workspaceNavFor', () => {
  it('full access sees every item', () => {
    assert.deepEqual(workspaceNavFor('full'), [
      'home',
      'time-clock',
      'work',
      'leave',
      'tasks',
      'reports',
      'referrals',
      'tracker',
      'performance',
      'calendar',
      'documents',
    ])
  })
  it('documents_only sees Home and Documents only', () => {
    assert.deepEqual(workspaceNavFor('documents_only'), ['home', 'documents'])
  })
  it('documents_only cannot see the time clock or leave', () => {
    const nav = workspaceNavFor('documents_only')
    assert.equal(nav.includes('time-clock'), false)
    assert.equal(nav.includes('leave'), false)
  })
  it('denied sees nothing', () => {
    assert.deepEqual(workspaceNavFor('denied'), [])
  })
})

describe('status allow-lists', () => {
  it('are positive lists that exclude Resigned', () => {
    assert.equal(TEAM_MEMBER_STATUSES.includes('Resigned' as never), false)
    assert.equal(LINKABLE_STATUSES.includes('Resigned' as never), false)
  })
  it('include the three working statuses', () => {
    for (const s of ['Active', 'On Leave', 'Onboarding'] as const) {
      assert.ok(TEAM_MEMBER_STATUSES.includes(s))
      assert.ok(LINKABLE_STATUSES.includes(s))
    }
  })
})

describe('resolveSelfIdentity', () => {
  it('unauthenticated', () => {
    const r = resolveSelfIdentity(false, [])
    assert.deepEqual(r, { ok: false, error: 'UNAUTHENTICATED' })
  })
  it('no candidates means not linked', () => {
    const r = resolveSelfIdentity(true, [])
    assert.deepEqual(r, { ok: false, error: 'EMPLOYEE_NOT_LINKED' })
  })
  it('two candidates fails closed as ambiguous', () => {
    const r = resolveSelfIdentity(true, [employee(), employee({ id: 'emp-2' })])
    assert.deepEqual(r, { ok: false, error: 'AMBIGUOUS_IDENTITY' })
  })
  it('a resigned employee still RESOLVES, with reduced access', () => {
    // Identity success is separate from access policy.
    const r = resolveSelfIdentity(true, [employee({ status: 'Resigned' })])
    assert.equal(r.ok, true)
    if (r.ok) assert.equal(r.access, 'documents_only')
  })
  it('an active employee resolves with full access', () => {
    const r = resolveSelfIdentity(true, [employee()])
    assert.equal(r.ok, true)
    if (r.ok) assert.equal(r.access, 'full')
  })
})

describe('selfIdentityMessage', () => {
  it('distinguishes the admin case from the plain case', () => {
    const admin = selfIdentityMessage('EMPLOYEE_NOT_LINKED', true)
    const plain = selfIdentityMessage('EMPLOYEE_NOT_LINKED', false)
    assert.notEqual(admin, plain)
    assert.match(admin, /administration access/)
    assert.match(plain, /not been activated/)
  })
  it('never returns an empty string', () => {
    for (const e of ['UNAUTHENTICATED', 'EMPLOYEE_NOT_LINKED', 'AMBIGUOUS_IDENTITY'] as const) {
      assert.ok(selfIdentityMessage(e, false).length > 0)
    }
  })
})

describe('canAutoLinkIdentity', () => {
  it('links a single active unclaimed row with a verified email', () => {
    assert.equal(canAutoLinkIdentity([employee()], true), true)
  })
  it('refuses an unverified email', () => {
    assert.equal(canAutoLinkIdentity([employee()], false), false)
  })
  it('refuses when ambiguous', () => {
    assert.equal(canAutoLinkIdentity([employee(), employee({ id: 'e2' })], true), false)
  })
  it('never auto-links a Resigned employee', () => {
    assert.equal(canAutoLinkIdentity([employee({ status: 'Resigned' })], true), false)
  })
  it('refuses a row already claimed by another Clerk user', () => {
    assert.equal(canAutoLinkIdentity([employee({ clerkUserId: 'user_x' })], true), false)
  })
})

describe('deriveTeamScope', () => {
  it('includes reports in working statuses', () => {
    const t = deriveTeamScope([
      { id: 'a', status: 'Active' },
      { id: 'b', status: 'On Leave' },
      { id: 'c', status: 'Onboarding' },
    ])
    assert.deepEqual(t.directReportIds, ['a', 'b', 'c'])
  })
  it('excludes Resigned reports', () => {
    const t = deriveTeamScope([
      { id: 'a', status: 'Active' },
      { id: 'b', status: 'Resigned' },
    ])
    assert.deepEqual(t.directReportIds, ['a'])
  })
  it('excludes an unknown future status', () => {
    const t = deriveTeamScope([{ id: 'a', status: 'Suspended' }])
    assert.deepEqual(t.directReportIds, [])
  })
  it('leaves the reserved delegation fields empty', () => {
    const t = deriveTeamScope([{ id: 'a', status: 'Active' }])
    assert.deepEqual(t.descendantReportIds, [])
    assert.deepEqual(t.delegatedEmployeeIds, [])
    assert.deepEqual(t.actingForManagerIds, [])
  })
})

describe('buildCallerScope', () => {
  const org = new Set(['workforce.employees.read'])

  it('an Org-only administrator with no employee row still gets a scope', () => {
    const s = buildCallerScope({
      employee: null, access: null, team: EMPTY_TEAM_SCOPE, permissions: org,
    })
    assert.equal(s.employee, null)
    assert.equal(s.workspaceAccess, null)
    assert.equal(s.tiers.has('self'), false)
    assert.equal(s.tiers.has('org'), true)
  })

  it('a plain employee is self only', () => {
    const s = buildCallerScope({
      employee: employee(), access: 'full', team: EMPTY_TEAM_SCOPE, permissions: new Set(),
    })
    assert.deepEqual([...s.tiers], ['self'])
  })

  it('a manager is self AND team, not one or the other', () => {
    const s = buildCallerScope({
      employee: employee(),
      access: 'full',
      team: deriveTeamScope([{ id: 'r1', status: 'Active' }]),
      permissions: new Set(),
    })
    assert.equal(s.tiers.has('self'), true)
    assert.equal(s.tiers.has('team'), true)
    assert.equal(s.tiers.has('org'), false)
  })

  it('People Ops can hold all three tiers at once', () => {
    const s = buildCallerScope({
      employee: employee(),
      access: 'full',
      team: deriveTeamScope([{ id: 'r1', status: 'Active' }]),
      permissions: org,
    })
    assert.equal(s.tiers.size, 3)
  })

  it('team tier requires an employee row', () => {
    const s = buildCallerScope({
      employee: null,
      access: null,
      team: { ...EMPTY_TEAM_SCOPE, directReportIds: ['r1'] },
      permissions: org,
    })
    assert.equal(s.tiers.has('team'), false)
  })

  it('copies permissions rather than aliasing the input', () => {
    const input = new Set(['workforce.employees.read'])
    const s = buildCallerScope({
      employee: null, access: null, team: EMPTY_TEAM_SCOPE, permissions: input,
    })
    input.add('platform.admin')
    assert.equal(s.permissions.has('platform.admin'), false)
  })
})

describe('hasAnyWorkforcePermission', () => {
  it('detects a granular key', () => {
    assert.equal(hasAnyWorkforcePermission(new Set(['workforce.leave.read'])), true)
  })
  it('ignores unrelated keys', () => {
    assert.equal(hasAnyWorkforcePermission(new Set(['cms.read', 'support.read'])), false)
  })
})

describe('Workforce shell access', () => {
  const managerScope = buildCallerScope({
    employee: employee(),
    access: 'full',
    team: deriveTeamScope([{ id: 'r1', status: 'Active' }]),
    permissions: new Set(),
  })
  const plainScope = buildCallerScope({
    employee: employee(), access: 'full', team: EMPTY_TEAM_SCOPE, permissions: new Set(),
  })
  const orgScope = buildCallerScope({
    employee: employee(),
    access: 'full',
    team: EMPTY_TEAM_SCOPE,
    permissions: new Set(['workforce.employees.read']),
  })

  it('opens for a Team-scope manager holding no Workforce key', () => {
    assert.equal(canOpenWorkforceShell(managerScope), true)
  })
  it('opens for an Org permission holder', () => {
    assert.equal(canOpenWorkforceShell(orgScope), true)
  })
  it('stays shut for a plain employee', () => {
    assert.equal(canOpenWorkforceShell(plainScope), false)
  })
  it('lands a Team-only caller on /workforce/team', () => {
    assert.equal(workforceLanding(managerScope), '/workforce/team')
  })
  it('lands an Org caller on the Overview', () => {
    assert.equal(workforceLanding(orgScope), '/workforce')
  })
  it('lands a plain employee nowhere', () => {
    assert.equal(workforceLanding(plainScope), null)
  })
})
