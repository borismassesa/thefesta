import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import {
  daysRemainingInYear,
  daysTakenInYear,
  exceedsYearAllowance,
  isInLeaveYear,
  leaveYearFor,
  type CountableRequest,
} from './leave-year'

// The 28 days are PER YEAR. Before this the balance was a running counter
// that never reset, so an allowance spent in 2026 stayed spent forever.

const r = (over: Partial<CountableRequest> = {}): CountableRequest => ({
  status: 'Approved',
  startDate: '2026-06-01',
  days: 5,
  ...over,
})

describe('leaveYearFor', () => {
  it('resolves the calendar year', () => {
    const y = leaveYearFor('2026-06-15')
    assert.equal(y.label, '2026')
    assert.equal(y.startDate, '2026-01-01')
    assert.equal(y.endDate, '2026-12-31')
  })
  it('the first day belongs to the year it opens', () => {
    assert.equal(leaveYearFor('2026-01-01').label, '2026')
  })
  it('the last day belongs to the year it closes', () => {
    assert.equal(leaveYearFor('2026-12-31').label, '2026')
  })
  it('adjacent years do not overlap', () => {
    assert.equal(leaveYearFor('2025-12-31').label, '2025')
    assert.equal(leaveYearFor('2026-01-01').label, '2026')
  })
})

describe('isInLeaveYear', () => {
  const y2026 = leaveYearFor('2026-06-01')
  it('includes both boundaries', () => {
    assert.equal(isInLeaveYear('2026-01-01', y2026), true)
    assert.equal(isInLeaveYear('2026-12-31', y2026), true)
  })
  it('excludes the days either side', () => {
    assert.equal(isInLeaveYear('2025-12-31', y2026), false)
    assert.equal(isInLeaveYear('2027-01-01', y2026), false)
  })
})

describe('daysTakenInYear', () => {
  const y2026 = leaveYearFor('2026-06-01')

  it('sums approved days inside the year', () => {
    assert.equal(daysTakenInYear([r({ days: 5 }), r({ days: 3 })], y2026), 8)
  })
  // The whole point: last year's leave does not eat this year's allowance.
  it('ignores approved leave from another year', () => {
    const reqs = [r({ startDate: '2025-06-01', days: 20 }), r({ days: 5 })]
    assert.equal(daysTakenInYear(reqs, y2026), 5)
  })
  it('ignores anything not approved', () => {
    const reqs = [
      r({ status: 'Pending', days: 10 }),
      r({ status: 'Rejected', days: 10 }),
      r({ status: 'Cancelled', days: 10 }),
      r({ days: 4 }),
    ]
    assert.equal(daysTakenInYear(reqs, y2026), 4)
  })
  // Documented rule: a request is counted whole, against the year it began in.
  it('attributes a boundary-spanning request to the year it started', () => {
    const spanning = r({ startDate: '2026-12-28', days: 10 })
    assert.equal(daysTakenInYear([spanning], y2026), 10)
    assert.equal(daysTakenInYear([spanning], leaveYearFor('2027-06-01')), 0)
  })
})

describe('daysRemainingInYear', () => {
  const y2026 = leaveYearFor('2026-06-01')

  it('starts at the full entitlement', () => {
    assert.equal(daysRemainingInYear([], y2026), 28)
  })
  it('subtracts approved days', () => {
    assert.equal(daysRemainingInYear([r({ days: 8 })], y2026), 20)
  })
  it('never goes negative', () => {
    assert.equal(daysRemainingInYear([r({ days: 98 })], y2026), 0)
  })
  // The reset. This is what the stored counter could never do.
  it('a new leave year restores the full allowance', () => {
    const lastYear = [r({ startDate: '2025-03-01', days: 28 })]
    assert.equal(daysRemainingInYear(lastYear, leaveYearFor('2025-06-01')), 0)
    assert.equal(daysRemainingInYear(lastYear, y2026), 28)
  })
  it('applies a carry-over or pro-rata adjustment', () => {
    assert.equal(daysRemainingInYear([r({ days: 8 })], y2026, 5), 25)
    assert.equal(daysRemainingInYear([], y2026, -21), 7)
  })
})

describe('exceedsYearAllowance', () => {
  it('allows a request inside the remaining allowance', () => {
    assert.equal(exceedsYearAllowance([r({ days: 20 })], '2026-09-01', 8), false)
  })
  it('rejects a request beyond it', () => {
    assert.equal(exceedsYearAllowance([r({ days: 25 })], '2026-09-01', 8), true)
  })
  // Booking into next year is checked against NEXT year's allowance.
  it('checks against the leave year the request falls in', () => {
    const spent2026 = [r({ startDate: '2026-02-01', days: 28 })]
    assert.equal(exceedsYearAllowance(spent2026, '2026-09-01', 1), true)
    assert.equal(exceedsYearAllowance(spent2026, '2027-01-05', 1), false)
  })
})
