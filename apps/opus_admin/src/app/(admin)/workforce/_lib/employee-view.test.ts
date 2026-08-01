import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { toEmployeeDirectoryView, type Employee } from './types'

// Props passed from a server component to a client component are serialised
// into the RSC payload and are readable in the browser's devtools. Passing a
// full `Employee` therefore publishes salary, phone, private notes and the
// Clerk user id to anyone who can open the page.
//
// These tests pin the projection so a future edit cannot quietly widen it
// back. If a screen genuinely needs another field, add it to
// EmployeeDirectoryView deliberately and update the expected key list here.

const FULL: Employee = {
  id: 'emp-1',
  employeeCode: 'OF-001',
  name: 'Test Person',
  email: 'test@opusfesta.com',
  phone: '+255700000000',
  jobTitle: 'Engineer',
  department: 'Technology',
  manager: 'Someone Else',
  managerId: 'emp-2',
  notes: 'Private HR note about performance',
  employmentType: 'Permanent',
  status: 'Active',
  location: 'Dar es Salaam',
  startDate: '2026-01-01',
  salaryTzs: 4_500_000,
  leaveBalanceDays: 18,
  avatarColor: '#9FE870',
  avatarUrl: null,
  dashboardAccess: true,
  dashboardRoleId: 'role-1',
  invitedAt: null,
  lastDashboardLogin: null,
  clerkUserId: 'user_abc123',
}

// Fields that must NEVER cross the server/client boundary from this helper.
const FORBIDDEN = [
  'salaryTzs',
  'phone',
  'notes',
  'clerkUserId',
  'managerId',
  'manager',
  'employmentType',
  'location',
  'startDate',
  'leaveBalanceDays',
  'invitedAt',
] as const

describe('toEmployeeDirectoryView', () => {
  const view = toEmployeeDirectoryView(FULL)

  for (const field of FORBIDDEN) {
    it(`omits ${field}`, () => {
      assert.equal(
        Object.hasOwn(view, field),
        false,
        `${field} would be serialised into the RSC payload and readable in the browser`,
      )
    })
  }

  it('carries exactly the expected keys and no more', () => {
    assert.deepEqual(Object.keys(view).sort(), [
      'avatarColor',
      'avatarUrl',
      'dashboardAccess',
      'dashboardRoleId',
      'department',
      'email',
      'employeeCode',
      'id',
      'jobTitle',
      'lastDashboardLogin',
      'name',
      'status',
    ])
  })

  it('preserves the values it does carry', () => {
    assert.equal(view.id, 'emp-1')
    assert.equal(view.name, 'Test Person')
    assert.equal(view.dashboardRoleId, 'role-1')
  })

  // Guards the specific regression: salary must not survive a round trip
  // through JSON, which is what serialisation into the payload amounts to.
  it('salary does not survive serialisation', () => {
    assert.equal(JSON.stringify(view).includes('4500000'), false)
    assert.equal(JSON.stringify(view).includes('Private HR note'), false)
  })
})
