// "Overlapping requests are blocked", "respect holidays and work schedules"
// and "support half-day and hourly leave" are decided here.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  LEAVE_PORTIONS,
  PORTION_LABELS,
  expandLeaveDays,
  findOverlaps,
  fractionFor,
  suppressesWholeDay,
  totalDays,
  validateRequest,
  type ExpandInput,
  type LeaveDay,
} from './days'

const WEEK: Pick<ExpandInput, 'workingWeekdays' | 'holidays'> = {
  workingWeekdays: [1, 2, 3, 4, 5],
  holidays: [],
}

describe('expandLeaveDays', () => {
  it('skips the weekend, so Friday to Monday is two days', () => {
    const days = expandLeaveDays({
      ...WEEK,
      startDate: '2026-08-07', // Friday
      endDate: '2026-08-10', // Monday
      portion: 'full',
    })
    assert.deepEqual(days.map((d) => d.date), ['2026-08-07', '2026-08-10'])
    assert.equal(totalDays(days), 2)
  })

  it('SKIPS A PUBLIC HOLIDAY inside the range', () => {
    // A fortnight over Christmas must not spend the public holidays.
    const days = expandLeaveDays({
      ...WEEK,
      holidays: ['2026-08-05'],
      startDate: '2026-08-03',
      endDate: '2026-08-07',
      portion: 'full',
    })
    assert.deepEqual(days.map((d) => d.date), ['2026-08-03', '2026-08-04', '2026-08-06', '2026-08-07'])
    assert.equal(totalDays(days), 4)
  })

  it('honours a schedule that works Saturdays', () => {
    const days = expandLeaveDays({
      holidays: [],
      workingWeekdays: [1, 2, 3, 4, 5, 6],
      startDate: '2026-08-07',
      endDate: '2026-08-08',
      portion: 'full',
    })
    assert.equal(totalDays(days), 2)
  })

  it('costs half a day for a half-day request', () => {
    const days = expandLeaveDays({
      ...WEEK, startDate: '2026-08-05', endDate: '2026-08-05', portion: 'half_am',
    })
    assert.equal(days.length, 1)
    assert.equal(days[0].dayFraction, 0.5)
    assert.equal(totalDays(days), 0.5)
  })

  it('converts hours against the standard working day', () => {
    const days = expandLeaveDays({
      ...WEEK, startDate: '2026-08-05', endDate: '2026-08-05',
      portion: 'hours', hours: 2, standardDailyHours: 8,
    })
    assert.equal(days[0].dayFraction, 0.25)
    assert.equal(days[0].hours, 2)
  })

  it('returns nothing for a range that is entirely non-working', () => {
    const days = expandLeaveDays({
      ...WEEK, startDate: '2026-08-08', endDate: '2026-08-09', portion: 'full',
    })
    assert.deepEqual(days, [])
  })

  it('returns nothing for a reversed range instead of spinning', () => {
    assert.deepEqual(
      expandLeaveDays({ ...WEEK, startDate: '2026-08-09', endDate: '2026-08-03', portion: 'full' }),
      [],
    )
  })

  it('labels every portion', () => {
    assert.equal(LEAVE_PORTIONS.length, 4)
    for (const p of LEAVE_PORTIONS) assert.ok(PORTION_LABELS[p].length > 0)
  })
})

describe('fractionFor', () => {
  it('maps each portion to its cost', () => {
    assert.equal(fractionFor('full', null), 1)
    assert.equal(fractionFor('half_am', null), 0.5)
    assert.equal(fractionFor('half_pm', null), 0.5)
    assert.equal(fractionFor('hours', 4, 8), 0.5)
  })

  it('clamps hours to one day', () => {
    // Eleven hours off in an eight-hour day is one day of leave, not 1.375.
    assert.equal(fractionFor('hours', 11, 8), 1)
  })

  it('never returns zero for an hourly request', () => {
    assert.ok(fractionFor('hours', 0, 8) > 0)
  })
})

describe('findOverlaps', () => {
  const day = (date: string, dayFraction: number): LeaveDay => ({
    date, portion: dayFraction === 1 ? 'full' : 'half_am', hours: null, dayFraction,
  })

  it('BLOCKS a full day against an existing full day', () => {
    const conflicts = findOverlaps([day('2026-08-05', 1)], new Map([['2026-08-05', 1]]))
    assert.equal(conflicts.length, 1)
    assert.equal(conflicts[0].date, '2026-08-05')
  })

  it('blocks a full day against an existing half day', () => {
    assert.equal(findOverlaps([day('2026-08-05', 1)], new Map([['2026-08-05', 0.5]])).length, 1)
  })

  it('ALLOWS two half days on the same date', () => {
    // Morning off from one request, afternoon off from another, is legitimate.
    assert.deepEqual(findOverlaps([day('2026-08-05', 0.5)], new Map([['2026-08-05', 0.5]])), [])
  })

  it('blocks a third half day', () => {
    assert.equal(findOverlaps([day('2026-08-05', 0.5)], new Map([['2026-08-05', 1]])).length, 1)
  })

  it('allows a day with nothing committed', () => {
    assert.deepEqual(findOverlaps([day('2026-08-05', 1)], new Map()), [])
  })

  it('tolerates the rounding of hourly fractions', () => {
    // Three 1/3-day blocks sum to 0.999 after rounding, and must not be
    // reported as an overlap.
    const third = { date: '2026-08-05', portion: 'hours' as const, hours: 2.67, dayFraction: 0.333 }
    assert.deepEqual(findOverlaps([third], new Map([['2026-08-05', 0.666]])), [])
  })

  it('reports every conflicting date, not just the first', () => {
    const conflicts = findOverlaps(
      [day('2026-08-05', 1), day('2026-08-06', 1), day('2026-08-07', 1)],
      new Map([['2026-08-05', 1], ['2026-08-07', 1]]),
    )
    assert.deepEqual(conflicts.map((c) => c.date), ['2026-08-05', '2026-08-07'])
  })
})

describe('validateRequest', () => {
  const base = {
    portion: 'full' as const,
    allowsPartialDay: true,
    allowsHourly: true,
    minNoticeDays: 0,
    maxConsecutiveDays: null,
    startDate: '2026-08-20',
    today: '2026-08-01',
  }
  const days = expandLeaveDays({ ...WEEK, startDate: '2026-08-20', endDate: '2026-08-21', portion: 'full' })

  it('accepts a well-formed request', () => {
    assert.deepEqual(validateRequest({ ...base, days }), { ok: true, totalDays: 2 })
  })

  it('rejects a range with no working days in it', () => {
    assert.deepEqual(validateRequest({ ...base, days: [] }), { ok: false, reason: 'no_working_days' })
  })

  it('enforces the notice period', () => {
    assert.deepEqual(
      validateRequest({ ...base, days, minNoticeDays: 30 }),
      { ok: false, reason: 'insufficient_notice' },
    )
    assert.equal(validateRequest({ ...base, days, minNoticeDays: 7 }).ok, true)
  })

  it('enforces the maximum consecutive days', () => {
    assert.deepEqual(
      validateRequest({ ...base, days, maxConsecutiveDays: 1 }),
      { ok: false, reason: 'exceeds_maximum' },
    )
  })

  it('refuses a partial day on a type that does not allow one', () => {
    // Maternity leave is not taken in half days.
    assert.deepEqual(
      validateRequest({ ...base, days, portion: 'half_am', allowsPartialDay: false }),
      { ok: false, reason: 'partial_not_allowed' },
    )
  })

  it('refuses hourly leave on a type that does not allow it', () => {
    assert.deepEqual(
      validateRequest({ ...base, days, portion: 'hours', allowsHourly: false }),
      { ok: false, reason: 'hourly_not_allowed' },
    )
  })
})

describe('suppressesWholeDay', () => {
  it('is true only for a full day', () => {
    // A half day off still leaves half a day worked, so attendance and the
    // tracker still expect something. Getting this backwards would silently
    // excuse half the company.
    assert.equal(suppressesWholeDay({ date: 'x', portion: 'full', hours: null, dayFraction: 1 }), true)
    assert.equal(suppressesWholeDay({ date: 'x', portion: 'half_am', hours: null, dayFraction: 0.5 }), false)
    assert.equal(suppressesWholeDay({ date: 'x', portion: 'hours', hours: 2, dayFraction: 0.25 }), false)
  })
})
