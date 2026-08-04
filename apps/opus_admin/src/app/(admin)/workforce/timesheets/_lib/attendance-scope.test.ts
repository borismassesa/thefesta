import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { narrowEmployeeFilter } from '@/lib/workforce/approvals'
import type { CallerScope, SelfEmployee } from '@/lib/workforce/scope'
import {
  ATTENDANCE_ADMIN_KEY,
  ATTENDANCE_READ_KEYS,
  attendanceReadScope,
  canCorrectAttendance,
} from './attendance-scope'

// Phase 3D. Attendance is more revealing than the UI suggests: it exposes
// working hours, absence, lateness and habits. Team callers see their current
// direct reports only.

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

const withPerms = (keys: string[]) =>
  scope({ permissions: new Set(keys), tiers: new Set(['self', 'org'] as const) } as Partial<CallerScope>)

describe('attendance read scope', () => {
  // 1 + 2: reports yes, peers no.
  it('a manager reads exactly their direct reports', () => {
    const read = attendanceReadScope(scope())
    assert.equal(read.kind, 'team')
    if (read.kind === 'team') {
      assert.deepEqual(read.employeeIds, ['emp-report-1', 'emp-report-2'])
      assert.equal(read.employeeIds.includes('emp-peer'), false)
    }
  })
  // 3: empty team is empty, never widened.
  it('a manager with no current reports reads nothing', () => {
    const empty = scope({
      team: {
        directReportIds: [],
        descendantReportIds: [],
        delegatedEmployeeIds: [],
        actingForManagerIds: [],
      },
    })
    assert.deepEqual(attendanceReadScope(empty), { kind: 'none' })
  })
  // 6: org read.
  it('workforce.attendance.read reads organisation-wide', () => {
    assert.deepEqual(attendanceReadScope(withPerms(['workforce.attendance.read'])), {
      kind: 'org',
    })
  })
  it('workforce.attendance.admin also grants the org view', () => {
    assert.deepEqual(attendanceReadScope(withPerms([ATTENDANCE_ADMIN_KEY])), { kind: 'org' })
  })
})

describe('correction authority is separate from visibility', () => {
  // 7: team-only callers cannot correct.
  it('a team manager cannot correct punches', () => {
    assert.equal(canCorrectAttendance(scope()), false)
  })
  // 8: read alone does not grant correction.
  it('attendance.read alone does not grant correction', () => {
    assert.equal(canCorrectAttendance(withPerms(['workforce.attendance.read'])), false)
  })
  it('attendance.admin grants correction', () => {
    assert.equal(canCorrectAttendance(withPerms([ATTENDANCE_ADMIN_KEY])), true)
  })
  it('a manager who is also an org reader still cannot correct', () => {
    const readerManager = scope({ permissions: new Set(['workforce.attendance.read']) })
    assert.equal(canCorrectAttendance(readerManager), false)
  })
})

// 4 + 5: filters intersect; the date range is orthogonal to employee scope.
describe('filters narrow but never widen', () => {
  it('a requested id outside the team is dropped', () => {
    const narrowed = narrowEmployeeFilter(
      scope(),
      ['emp-report-1', 'emp-peer'],
      ATTENDANCE_READ_KEYS[0],
    )
    assert.equal(narrowed.scopeAll, false)
    if (!narrowed.scopeAll) assert.deepEqual(narrowed.employeeIds, ['emp-report-1'])
  })
  it('requesting only out-of-scope ids yields nothing, not the team', () => {
    const narrowed = narrowEmployeeFilter(scope(), ['emp-peer'], ATTENDANCE_READ_KEYS[0])
    assert.equal(narrowed.scopeAll, false)
    if (!narrowed.scopeAll) assert.deepEqual(narrowed.employeeIds, [])
  })
  it('an org reader with no filter sees everyone', () => {
    assert.equal(
      narrowEmployeeFilter(withPerms(['workforce.attendance.read']), null, ATTENDANCE_READ_KEYS[0])
        .scopeAll,
      true,
    )
  })
})

// 11 + 12: authority follows the current org chart, not a cached one.
describe('team membership is current, not historical', () => {
  it('a removed report drops out of scope immediately', () => {
    const before = attendanceReadScope(scope())
    const after = attendanceReadScope(
      scope({
        team: {
          directReportIds: ['emp-report-2'],
          descendantReportIds: [],
          delegatedEmployeeIds: [],
          actingForManagerIds: [],
        },
      }),
    )
    assert.equal(before.kind === 'team' && before.employeeIds.length, 2)
    assert.equal(after.kind === 'team' && after.employeeIds.includes('emp-report-1'), false)
  })
})
