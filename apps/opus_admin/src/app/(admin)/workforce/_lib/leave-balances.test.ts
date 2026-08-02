import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildAnnualLeaveBalances } from './leave-balances'
import type { LeaveRequest } from './types'

const employees = [
  { id: 'emp-1', leaveBalanceDays: 28 },
  { id: 'emp-2', leaveBalanceDays: 28 },
]
const leaveYear = { startDate: '2026-01-01', endDate: '2026-12-31' }

function request(overrides: Partial<LeaveRequest>): LeaveRequest {
  return {
    id: 'req-1',
    employeeId: 'emp-1',
    type: 'Annual',
    startDate: '2026-03-10',
    endDate: '2026-03-12',
    days: 3,
    status: 'Approved',
    reason: 'Planned leave',
    submittedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('buildAnnualLeaveBalances', () => {
  it('derives remaining balance from approved leave weekdays in the leave year', () => {
    const balances = buildAnnualLeaveBalances({
      employees,
      requests: [
        request({}),
        request({ id: 'req-2', startDate: '2026-04-01', endDate: '2026-04-07', days: 7 }),
      ],
      entitlementDays: 28,
      leaveYear,
    })

    assert.deepEqual(balances[0], {
      employeeId: 'emp-1',
      entitlementDays: 28,
      usedDays: 8,
      remainingDays: 20,
      usagePercent: 29,
    })
    assert.equal(balances[1].remainingDays, 28)
  })

  it('counts approved leave requests regardless of leave type policy', () => {
    const [balance] = buildAnnualLeaveBalances({
      employees: [employees[0]],
      requests: [request({ type: 'Sick', days: 3 })],
      entitlementDays: 28,
      leaveYear,
    })

    assert.equal(balance.usedDays, 3)
    assert.equal(balance.remainingDays, 25)
  })

  it('counts only weekdays inside the current leave year', () => {
    const [balance] = buildAnnualLeaveBalances({
      employees: [employees[0]],
      requests: [request({ startDate: '2025-12-29', endDate: '2026-01-03', days: 6 })],
      entitlementDays: 28,
      leaveYear,
    })

    assert.equal(balance.usedDays, 2)
    assert.equal(balance.remainingDays, 26)
  })

  it('does not count weekend-only leave against the balance', () => {
    const [balance] = buildAnnualLeaveBalances({
      employees: [employees[0]],
      requests: [request({ startDate: '2026-08-01', endDate: '2026-08-02', days: 2 })],
      entitlementDays: 28,
      leaveYear,
    })

    assert.equal(balance.usedDays, 0)
    assert.equal(balance.remainingDays, 28)
  })

  it('does not treat a manually stored partial balance as used leave without an approved request', () => {
    const [balance] = buildAnnualLeaveBalances({
      employees: [{ id: 'emp-1', leaveBalanceDays: 21 }],
      requests: [],
      entitlementDays: 28,
      leaveYear,
    })

    assert.equal(balance.usedDays, 0)
    assert.equal(balance.remainingDays, 28)
  })

  it('does not treat a legacy zero balance as fully used without approved leave', () => {
    const [balance] = buildAnnualLeaveBalances({
      employees: [{ id: 'emp-1', leaveBalanceDays: 0 }],
      requests: [],
      entitlementDays: 28,
      leaveYear,
    })

    assert.equal(balance.usedDays, 0)
    assert.equal(balance.remainingDays, 28)
  })
})
