import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import {
  ANNUAL_ENTITLEMENT_DAYS,
  balanceAfter,
  daysBetween,
  exceedsBalance,
  rangesOverlap,
} from './leave-calculation'
import {
  canCreateRequest,
  canEditRequest,
  canWithdrawRequest,
  ownsRequest,
  type StoredRequest,
} from './leave-policy'
import { isValidIsoDate, parseCreateInput } from './schemas'

const SELF = 'emp-self'
const OTHER = 'emp-other'

function req(over: Partial<StoredRequest> = {}): StoredRequest {
  return {
    id: 'req-1',
    employeeId: SELF,
    status: 'Pending',
    startDate: '2026-08-10',
    endDate: '2026-08-12',
    days: 3,
    ...over,
  }
}

describe('leave calculation matches the canonical Workforce implementation', () => {
  it('counts inclusive calendar days', () => {
    assert.equal(daysBetween('2026-08-10', '2026-08-12'), 3)
  })
  it('a same-day request is one day, never zero', () => {
    assert.equal(daysBetween('2026-08-10', '2026-08-10'), 1)
  })
  // Company policy: 28 days a year, ONE pool. It does not matter which type
  // a day is taken as. This replaces the old Annual-only rule, under which
  // months of Sick or Compassionate leave cost nothing.
  it('every leave type draws down the same pool', () => {
    assert.equal(balanceAfter(18, 'Annual', 3), 15)
    assert.equal(balanceAfter(18, 'Sick', 3), 15)
    assert.equal(balanceAfter(18, 'Compassionate', 3), 15)
    assert.equal(balanceAfter(18, 'Maternity', 3), 15)
    assert.equal(balanceAfter(18, 'Unpaid', 3), 15)
  })
  it('the entitlement is 28 days', () => {
    assert.equal(ANNUAL_ENTITLEMENT_DAYS, 28)
  })
  it('balance never goes negative, matching the approval clamp', () => {
    assert.equal(balanceAfter(2, 'Annual', 10), 0)
  })
  it('exceedsBalance fires for every type', () => {
    assert.equal(exceedsBalance(2, 'Annual', 10), true)
    assert.equal(exceedsBalance(2, 'Sick', 10), true)
    assert.equal(exceedsBalance(2, 'Unpaid', 10), true)
    assert.equal(exceedsBalance(20, 'Sick', 10), false)
  })
  it('detects touching and contained ranges', () => {
    const a = { startDate: '2026-08-10', endDate: '2026-08-12' }
    assert.equal(rangesOverlap(a, { startDate: '2026-08-12', endDate: '2026-08-14' }), true)
    assert.equal(rangesOverlap(a, { startDate: '2026-08-11', endDate: '2026-08-11' }), true)
    assert.equal(rangesOverlap(a, { startDate: '2026-08-13', endDate: '2026-08-14' }), false)
  })
})

describe('ownership', () => {
  // Regression 1 + 3: an employee acts only on their own records.
  it('an employee owns only their own request', () => {
    assert.equal(ownsRequest(req(), SELF), true)
    assert.equal(ownsRequest(req({ employeeId: OTHER }), SELF), false)
  })
  it('cannot edit or withdraw another employee’s request', () => {
    assert.equal(canEditRequest(req({ employeeId: OTHER }), SELF).allowed, false)
    assert.equal(canWithdrawRequest(req({ employeeId: OTHER }), SELF).allowed, false)
  })
  // Regression 2: a tampered id cannot widen scope. Ownership is decided
  // against the server-resolved id, so passing someone else's request id
  // simply fails the check rather than acting on their row.
  it('a tampered request id still fails ownership', () => {
    const someoneElses = req({ id: 'req-999', employeeId: OTHER })
    assert.equal(canWithdrawRequest(someoneElses, SELF).allowed, false)
  })
})

describe('personal transitions', () => {
  it('Pending may be edited and withdrawn', () => {
    assert.equal(canEditRequest(req({ status: 'Pending' }), SELF).allowed, true)
    assert.equal(canWithdrawRequest(req({ status: 'Pending' }), SELF).allowed, true)
  })
  // Regression 4: immutable once decided.
  it('Approved cannot be edited or withdrawn by the employee', () => {
    assert.equal(canEditRequest(req({ status: 'Approved' }), SELF).allowed, false)
    assert.equal(canWithdrawRequest(req({ status: 'Approved' }), SELF).allowed, false)
  })
  it('Rejected and Cancelled are terminal for the employee', () => {
    for (const status of ['Rejected', 'Cancelled'] as const) {
      assert.equal(canEditRequest(req({ status }), SELF).allowed, false)
      assert.equal(canWithdrawRequest(req({ status }), SELF).allowed, false)
    }
  })
})

describe('creation eligibility', () => {
  const base = {
    type: 'Annual' as const,
    startDate: '2026-09-01',
    endDate: '2026-09-03',
    days: 3,
    existing: [] as StoredRequest[],
  }

  it('accepts a clean request', () => {
    assert.equal(canCreateRequest(base).allowed, true)
  })
  it('rejects an inverted range', () => {
    assert.equal(
      canCreateRequest({ ...base, startDate: '2026-09-05', endDate: '2026-09-01' }).allowed,
      false,
    )
  })
  // Regression 6: overlap policy.
  it('rejects overlap with a Pending request', () => {
    const existing = [req({ status: 'Pending', startDate: '2026-09-02', endDate: '2026-09-04' })]
    assert.equal(canCreateRequest({ ...base, existing }).allowed, false)
  })
  it('rejects overlap with an Approved request', () => {
    const existing = [req({ status: 'Approved', startDate: '2026-09-03', endDate: '2026-09-06' })]
    assert.equal(canCreateRequest({ ...base, existing }).allowed, false)
  })
  it('ignores Cancelled and Rejected requests when checking overlap', () => {
    const existing = [
      req({ id: 'r-c', status: 'Cancelled', startDate: '2026-09-01', endDate: '2026-09-05' }),
      req({ id: 'r-r', status: 'Rejected', startDate: '2026-09-01', endDate: '2026-09-05' }),
    ]
    assert.equal(canCreateRequest({ ...base, existing }).allowed, true)
  })
  it('an edit does not clash with the request being edited', () => {
    const existing = [req({ id: 'r-self', status: 'Pending', startDate: '2026-09-01', endDate: '2026-09-03' })]
    assert.equal(
      canCreateRequest({ ...base, existing, ignoreRequestId: 'r-self' }).allowed,
      true,
    )
  })
  it('rejects a request beyond the 28-day year allowance', () => {
    assert.equal(canCreateRequest({ ...base, days: 30 }).allowed, false)
  })
  it('rejects Sick leave beyond it too, since it is one pool', () => {
    assert.equal(canCreateRequest({ ...base, type: 'Sick', days: 30 }).allowed, false)
  })
  // The allowance is PER YEAR, so last year's leave does not block this year.
  it('last year’s approved leave does not consume this year’s allowance', () => {
    const lastYear = [
      req({ id: 'r-old', status: 'Approved', startDate: '2025-03-01', endDate: '2025-03-28', days: 28 }),
    ]
    assert.equal(canCreateRequest({ ...base, days: 20, existing: lastYear }).allowed, true)
  })
  it('this year’s approved leave does consume it', () => {
    const thisYear = [
      req({ id: 'r-now', status: 'Approved', startDate: '2026-03-01', endDate: '2026-03-28', days: 25 }),
    ]
    assert.equal(canCreateRequest({ ...base, days: 20, existing: thisYear }).allowed, false)
  })
})

describe('input validation rejects untrusted values', () => {
  const good = {
    type: 'Annual',
    startDate: '2026-09-01',
    endDate: '2026-09-03',
    reason: 'Family visit',
  }

  it('accepts well-formed input', () => {
    assert.equal(parseCreateInput(good).ok, true)
  })
  it('rejects an unknown leave type', () => {
    assert.equal(parseCreateInput({ ...good, type: 'Sabbatical' }).ok, false)
  })
  it('rejects a date that parses but rolls over', () => {
    assert.equal(isValidIsoDate('2026-02-30'), false)
    assert.equal(parseCreateInput({ ...good, startDate: '2026-02-30' }).ok, false)
  })
  it('rejects non-ISO dates', () => {
    assert.equal(isValidIsoDate('01/09/2026'), false)
  })
  it('rejects an empty reason', () => {
    assert.equal(parseCreateInput({ ...good, reason: '  ' }).ok, false)
  })
  // The IDOR invariant, asserted structurally: the parser has no employeeId
  // field, so a supplied one cannot survive into the insert.
  it('silently drops any employeeId supplied by the client', () => {
    const parsed = parseCreateInput({ ...good, employeeId: OTHER })
    assert.equal(parsed.ok, true)
    if (parsed.ok) {
      assert.equal(Object.hasOwn(parsed.value, 'employeeId'), false)
    }
  })
})
