// Leave day counting decides how much of somebody's balance a request costs,
// so the cases below are the ones that would quietly give days away.
//
// The database (leave_expand_days) is authoritative and also skips public
// holidays. This module is the workforce UI's approximation, and these tests
// pin the part that used to be wrong: the working week was hardcoded Mon-Fri,
// which made every Saturday of leave free after Saturday became a working day.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { COMPANY_WORKING_WEEKDAYS } from '@/lib/leave/days'
import { countLeaveWeekdaysInclusive, countLeaveWeekdaysOverlapping } from './leave-days'

// 2026-08-03 is a Monday. 2026-08-08 is the Saturday, 2026-08-09 the Sunday.
const MON = '2026-08-03'
const SAT = '2026-08-08'
const SUN = '2026-08-09'

describe('countLeaveWeekdaysInclusive', () => {
  it('counts Saturday, because Saturday is a working day', () => {
    assert.equal(countLeaveWeekdaysInclusive(SAT, SAT), 1)
  })

  it('never counts Sunday', () => {
    assert.equal(countLeaveWeekdaysInclusive(SUN, SUN), 0)
  })

  it('costs six days for a full Mon-to-Sat week', () => {
    assert.equal(countLeaveWeekdaysInclusive(MON, SAT), 6)
  })

  it('does not charge for the Sunday in a Mon-to-Sun range', () => {
    assert.equal(countLeaveWeekdaysInclusive(MON, SUN), 6)
  })

  it('honours an explicit working week over the company default', () => {
    // An employee on a Mon-Fri schedule still gets Saturday free.
    assert.equal(countLeaveWeekdaysInclusive(MON, SAT, [1, 2, 3, 4, 5]), 5)
  })

  it('handles a single day and an inverted range', () => {
    assert.equal(countLeaveWeekdaysInclusive(MON, MON), 1)
    assert.equal(countLeaveWeekdaysInclusive(SAT, MON), 0)
  })
})

describe('countLeaveWeekdaysOverlapping', () => {
  it('clips to the range and still counts Saturday', () => {
    // Request Mon-Sat, but only the Thu-Sat window is in scope.
    assert.equal(countLeaveWeekdaysOverlapping(MON, SAT, '2026-08-06', SAT), 3)
  })

  it('returns zero when the request falls entirely outside the range', () => {
    assert.equal(countLeaveWeekdaysOverlapping(MON, SAT, '2026-09-01', '2026-09-30'), 0)
  })

  it('passes the working week through to the inner count', () => {
    assert.equal(countLeaveWeekdaysOverlapping(MON, SAT, MON, SAT, [1, 2, 3, 4, 5]), 5)
  })
})

describe('COMPANY_WORKING_WEEKDAYS', () => {
  it('is Monday to Saturday, and is the single definition the UI shares', () => {
    assert.deepEqual([...COMPANY_WORKING_WEEKDAYS], [1, 2, 3, 4, 5, 6])
  })
})
