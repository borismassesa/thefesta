// Due dates decide who gets chased and who gets marked overdue, so the cases
// here are the ones that produce an unfair red badge if they are wrong: month
// and quarter boundaries, the biweekly anchor, and the grace window.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  addDays,
  addMonths,
  closedPeriodsSince,
  daysBetween,
  daysOverdue,
  dueDateFor,
  isoWeekday,
  nextPeriod,
  obligationStatus,
  periodFor,
  previousPeriod,
  REPORT_CADENCES,
} from './periods'

describe('date arithmetic', () => {
  it('adds days across a month and a year boundary', () => {
    assert.equal(addDays('2026-08-31', 1), '2026-09-01')
    assert.equal(addDays('2026-12-31', 1), '2027-01-01')
    assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  })

  it('clamps a month addition instead of rolling over', () => {
    // 31 January + 1 month is 28 February, not 3 March.
    assert.equal(addMonths('2026-01-31', 1), '2026-02-28')
    assert.equal(addMonths('2028-01-31', 1), '2028-02-29') // leap year
    assert.equal(addMonths('2026-08-15', 3), '2026-11-15')
    assert.equal(addMonths('2026-01-15', -1), '2025-12-15')
  })

  it('numbers weekdays the ISO way', () => {
    assert.equal(isoWeekday('2026-08-03'), 1) // Monday
    assert.equal(isoWeekday('2026-08-09'), 7) // Sunday
  })

  it('measures whole days in both directions', () => {
    assert.equal(daysBetween('2026-08-01', '2026-08-08'), 7)
    assert.equal(daysBetween('2026-08-08', '2026-08-01'), -7)
    assert.equal(daysBetween('2026-08-01', '2026-08-01'), 0)
  })
})

describe('periodFor', () => {
  it('makes a daily period one day', () => {
    const p = periodFor('daily', '2026-08-05')
    assert.equal(p.start, '2026-08-05')
    assert.equal(p.end, '2026-08-05')
  })

  it('starts weeks on Monday', () => {
    // 2026-08-05 is a Wednesday.
    const p = periodFor('weekly', '2026-08-05')
    assert.equal(p.start, '2026-08-03')
    assert.equal(p.end, '2026-08-09')
    assert.equal(isoWeekday(p.start), 1)
    // A Sunday belongs to the week that started the previous Monday.
    assert.equal(periodFor('weekly', '2026-08-09').start, '2026-08-03')
  })

  it('anchors biweekly periods so they do not drift', () => {
    // Two dates a fortnight apart must land in different periods, and two in
    // the same fortnight must agree, whatever order they are asked in.
    const a = periodFor('biweekly', '2026-08-05')
    const b = periodFor('biweekly', '2026-08-12')
    const c = periodFor('biweekly', '2026-08-19')
    assert.equal(a.start, b.start, 'same fortnight')
    assert.notEqual(a.start, c.start, 'next fortnight')
    assert.equal(daysBetween(a.start, a.end), 13)
    assert.equal(daysBetween(a.start, c.start), 14)
  })

  it('keeps biweekly periods aligned before the anchor date too', () => {
    const before = periodFor('biweekly', '2025-06-11')
    assert.equal(daysBetween(before.start, before.end), 13)
    assert.equal(isoWeekday(before.start), 1)
    // Exactly a whole number of fortnights from the anchor.
    assert.equal(daysBetween(before.start, periodFor('biweekly', '2026-01-05').start) % 14, 0)
  })

  it('covers whole months, including February', () => {
    const august = periodFor('monthly', '2026-08-15')
    assert.equal(august.start, '2026-08-01')
    assert.equal(august.end, '2026-08-31')
    assert.equal(august.label, 'August 2026')

    const february = periodFor('monthly', '2026-02-10')
    assert.equal(february.end, '2026-02-28')
    assert.equal(periodFor('monthly', '2028-02-10').end, '2028-02-29')
  })

  it('covers whole quarters', () => {
    assert.deepEqual(
      { ...periodFor('quarterly', '2026-08-15') },
      { start: '2026-07-01', end: '2026-09-30', label: 'Q3 2026' },
    )
    assert.equal(periodFor('quarterly', '2026-01-01').label, 'Q1 2026')
    assert.equal(periodFor('quarterly', '2026-12-31').end, '2026-12-31')
  })

  it('gives every cadence a non-empty label and an end at or after the start', () => {
    for (const cadence of REPORT_CADENCES) {
      const p = periodFor(cadence, '2026-08-05')
      assert.ok(p.label.length > 0, cadence)
      assert.ok(p.end >= p.start, cadence)
    }
  })
})

describe('previous and next periods', () => {
  it('steps back and forward without gaps or overlaps', () => {
    for (const cadence of REPORT_CADENCES) {
      const current = periodFor(cadence, '2026-08-15')
      const prev = previousPeriod(cadence, '2026-08-15')
      const next = nextPeriod(cadence, '2026-08-15')
      assert.equal(addDays(prev.end, 1), current.start, `${cadence} previous is contiguous`)
      assert.equal(addDays(current.end, 1), next.start, `${cadence} next is contiguous`)
    }
  })
})

describe('dueDateFor', () => {
  it('measures from the period end, because you cannot report a month early', () => {
    const august = periodFor('monthly', '2026-08-15')
    assert.equal(dueDateFor(august, 0), '2026-08-31')
    assert.equal(dueDateFor(august, 5), '2026-09-05')
  })

  it('treats a negative offset as zero rather than pulling the date earlier', () => {
    const week = periodFor('weekly', '2026-08-05')
    assert.equal(dueDateFor(week, -3), week.end)
  })
})

describe('obligationStatus', () => {
  const period = periodFor('weekly', '2026-08-05') // 03 to 09 Aug
  const dueDate = dueDateFor(period, 2) // 11 Aug

  it('expects nothing while the period is still running', () => {
    assert.equal(
      obligationStatus({ period, dueDate, graceDays: 0, today: '2026-08-06' }),
      'upcoming',
    )
  })

  it('opens once the period ends', () => {
    assert.equal(obligationStatus({ period, dueDate, graceDays: 0, today: '2026-08-10' }), 'open')
  })

  it('flags the due date itself', () => {
    assert.equal(
      obligationStatus({ period, dueDate, graceDays: 0, today: '2026-08-11' }),
      'due_today',
    )
  })

  it('goes overdue only after the grace window', () => {
    // Two days' grace: still open on the 13th, overdue on the 14th. This is why
    // a report due on a Saturday is not red before anyone is back at work.
    assert.equal(obligationStatus({ period, dueDate, graceDays: 2, today: '2026-08-13' }), 'open')
    assert.equal(
      obligationStatus({ period, dueDate, graceDays: 2, today: '2026-08-14' }),
      'overdue',
    )
    // With no grace, the day after due is overdue.
    assert.equal(
      obligationStatus({ period, dueDate, graceDays: 0, today: '2026-08-12' }),
      'overdue',
    )
  })
})

describe('closedPeriodsSince', () => {
  it('never includes the period currently running', () => {
    // A report cannot be owed for a month that has not finished.
    const periods = closedPeriodsSince('monthly', '2026-08-15', 3)
    for (const p of periods) {
      assert.ok(p.end < '2026-08-15', `${p.label} has not ended`)
    }
    assert.equal(periods[0].label, 'July 2026')
  })

  it('returns closed periods most recent first, contiguously', () => {
    const periods = closedPeriodsSince('weekly', '2026-08-15', 4)
    assert.equal(periods.length, 4)
    for (let i = 1; i < periods.length; i += 1) {
      assert.equal(
        addDays(periods[i].end, 1),
        periods[i - 1].start,
        'periods must be contiguous and descending',
      )
    }
  })

  it('caps the lookback so activating a template does not backfill two years', () => {
    assert.equal(closedPeriodsSince('daily', '2026-08-15', 500).length, 24)
    assert.equal(closedPeriodsSince('daily', '2026-08-15', 0).length, 0)
    assert.equal(closedPeriodsSince('daily', '2026-08-15', -5).length, 0)
  })
})

describe('daysOverdue', () => {
  it('counts only lateness', () => {
    assert.equal(daysOverdue('2026-08-11', '2026-08-14'), 3)
    assert.equal(daysOverdue('2026-08-11', '2026-08-11'), 0)
    assert.equal(daysOverdue('2026-08-11', '2026-08-01'), 0)
  })
})
