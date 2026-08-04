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

    // Mar 10-12 is Tue-Thu (3 days). Apr 1-7 is Wed-Tue and now includes
    // Saturday the 4th (6 days, Sunday the 5th excluded). Saturday is a working
    // day at OpusFesta, so it costs a day of leave like any other.
    assert.deepEqual(balances[0], {
      employeeId: 'emp-1',
      entitlementDays: 28,
      usedDays: 9,
      remainingDays: 19,
      usagePercent: 32,
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

  it('counts only working days inside the current leave year', () => {
    const [balance] = buildAnnualLeaveBalances({
      employees: [employees[0]],
      requests: [request({ startDate: '2025-12-29', endDate: '2026-01-03', days: 6 })],
      entitlementDays: 28,
      leaveYear,
    })

    // Clipped to the leave year, the range is Thu 1, Fri 2 and Sat 3 January.
    // The December days fall in the previous leave year and are not charged here.
    assert.equal(balance.usedDays, 3)
    assert.equal(balance.remainingDays, 25)
  })

  it('charges a Saturday but never a Sunday', () => {
    // 2026-08-01 is a Saturday, 2026-08-02 the Sunday. Saturday is a working
    // day, so a Saturday-Sunday absence costs one day, not zero and not two.
    const [balance] = buildAnnualLeaveBalances({
      employees: [employees[0]],
      requests: [request({ startDate: '2026-08-01', endDate: '2026-08-02', days: 2 })],
      entitlementDays: 28,
      leaveYear,
    })

    assert.equal(balance.usedDays, 1)
    assert.equal(balance.remainingDays, 27)
  })

  it('does not count Sunday-only leave against the balance', () => {
    const [balance] = buildAnnualLeaveBalances({
      employees: [employees[0]],
      requests: [request({ startDate: '2026-08-02', endDate: '2026-08-02', days: 1 })],
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
