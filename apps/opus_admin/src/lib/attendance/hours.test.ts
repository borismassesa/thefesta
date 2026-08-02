// Attendance arithmetic decides what people are paid, so the cases here are the
// ones that cost someone money if they are wrong: overnight shifts, an open
// break, a weekend, and the auto-deduction that deliberately does not exist.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  crossesMidnight,
  earlyDepartureMinutes,
  formatMinutes,
  lateMinutes,
  overtimeMinutes,
  payableMinutes,
  scheduledWindow,
  sessionMinutes,
  sumTotals,
  toDecimalHours,
} from './hours'

describe('sessionMinutes', () => {
  it('measures a plain day', () => {
    const out = sessionMinutes({
      openedAt: '2026-08-03T05:00:00Z', // 08:00 EAT
      closedAt: '2026-08-03T14:00:00Z', // 17:00 EAT
      breaks: [{ startedAt: '2026-08-03T09:00:00Z', endedAt: '2026-08-03T10:00:00Z' }],
      now: '2026-08-03T14:30:00Z',
    })
    assert.equal(out.grossMinutes, 540)
    assert.equal(out.breakMinutes, 60)
    assert.equal(out.workedMinutes, 480)
  })

  it('handles an overnight shift with no special case', () => {
    // 22:00 Monday to 06:00 Tuesday. Eight hours, because the two instants are
    // eight hours apart — crossing midnight is not an event.
    const out = sessionMinutes({
      openedAt: '2026-08-03T19:00:00Z', // 22:00 EAT Mon
      closedAt: '2026-08-04T03:00:00Z', // 06:00 EAT Tue
      breaks: [],
      now: '2026-08-04T03:00:00Z',
    })
    assert.equal(out.grossMinutes, 480)
    assert.equal(out.workedMinutes, 480)
  })

  it('handles an overnight shift with an overnight break', () => {
    const out = sessionMinutes({
      openedAt: '2026-08-03T19:00:00Z',
      closedAt: '2026-08-04T04:00:00Z',
      // Break spanning midnight itself: 23:45 to 00:15 EAT.
      breaks: [{ startedAt: '2026-08-03T20:45:00Z', endedAt: '2026-08-03T21:15:00Z' }],
      now: '2026-08-04T04:00:00Z',
    })
    assert.equal(out.grossMinutes, 540)
    assert.equal(out.breakMinutes, 30)
    assert.equal(out.workedMinutes, 510)
  })

  it('measures an open session to now', () => {
    const out = sessionMinutes({
      openedAt: '2026-08-03T05:00:00Z',
      closedAt: null,
      breaks: [],
      now: '2026-08-03T07:30:00Z',
    })
    assert.equal(out.workedMinutes, 150)
  })

  it('does not deduct a break that has not ended', () => {
    // Deducting a guess would understate the pay of someone still on break.
    const out = sessionMinutes({
      openedAt: '2026-08-03T05:00:00Z',
      closedAt: null,
      breaks: [{ startedAt: '2026-08-03T07:00:00Z', endedAt: null }],
      now: '2026-08-03T07:30:00Z',
    })
    assert.equal(out.breakMinutes, 0)
    assert.equal(out.workedMinutes, 150)
  })

  it('never returns negative minutes for a reversed range', () => {
    const out = sessionMinutes({
      openedAt: '2026-08-03T14:00:00Z',
      closedAt: '2026-08-03T05:00:00Z',
      breaks: [],
      now: '2026-08-03T14:00:00Z',
    })
    assert.equal(out.grossMinutes, 0)
    assert.equal(out.workedMinutes, 0)
  })
})

describe('payableMinutes', () => {
  it('does not credit unpaid breaks', () => {
    assert.equal(
      payableMinutes({
        workedMinutes: 480,
        breakMinutes: 60,
        paidBreakMinutes: 0,
        breaksArePaid: false,
      }),
      480,
    )
  })

  it('credits breaks back when the schedule pays them', () => {
    assert.equal(
      payableMinutes({
        workedMinutes: 480,
        breakMinutes: 60,
        paidBreakMinutes: 0,
        breaksArePaid: true,
      }),
      540,
    )
  })

  it('never silently deducts an unpunched lunch', () => {
    // The regression this guards: an employee who worked 09:00 to 17:00 without
    // stopping must be paid 8 hours, not 7 because the template says the shift
    // "has" an hour's break.
    assert.equal(
      payableMinutes({
        workedMinutes: 480,
        breakMinutes: 0,
        paidBreakMinutes: 0,
        breaksArePaid: false,
      }),
      480,
    )
  })
})

describe('overtimeMinutes', () => {
  const base = { standardDailyMinutes: 480, thresholdMinutes: 0, isWeekend: false, isHoliday: false }

  it('is zero for a standard day', () => {
    assert.equal(overtimeMinutes({ ...base, payableMinutes: 480 }), 0)
  })

  it('counts minutes past standard', () => {
    assert.equal(overtimeMinutes({ ...base, payableMinutes: 570 }), 90)
  })

  it('measures from standard once the threshold is cleared, not from the threshold', () => {
    // 30-minute threshold: 500 minutes is inside it and pays no overtime; 520
    // clears it and pays 40 (520-480), not 10.
    assert.equal(overtimeMinutes({ ...base, thresholdMinutes: 30, payableMinutes: 500 }), 0)
    assert.equal(overtimeMinutes({ ...base, thresholdMinutes: 30, payableMinutes: 520 }), 40)
  })

  it('treats all weekend and holiday time as overtime', () => {
    assert.equal(overtimeMinutes({ ...base, isWeekend: true, payableMinutes: 240 }), 240)
    assert.equal(overtimeMinutes({ ...base, isHoliday: true, payableMinutes: 60 }), 60)
  })
})

describe('lateMinutes', () => {
  it('is zero inside the grace window', () => {
    assert.equal(
      lateMinutes({
        openedAt: '2026-08-03T05:08:00Z',
        scheduledStart: '2026-08-03T05:00:00Z',
        graceMinutes: 10,
      }),
      0,
    )
  })

  it('reports the true lateness once grace is exceeded, not the remainder', () => {
    // 25 minutes late with 10 minutes' grace is 25 minutes late.
    assert.equal(
      lateMinutes({
        openedAt: '2026-08-03T05:25:00Z',
        scheduledStart: '2026-08-03T05:00:00Z',
        graceMinutes: 10,
      }),
      25,
    )
  })

  it('is zero for an early arrival and for an unscheduled session', () => {
    assert.equal(
      lateMinutes({
        openedAt: '2026-08-03T04:40:00Z',
        scheduledStart: '2026-08-03T05:00:00Z',
        graceMinutes: 10,
      }),
      0,
    )
    assert.equal(
      lateMinutes({ openedAt: '2026-08-03T04:40:00Z', scheduledStart: null, graceMinutes: 10 }),
      0,
    )
  })
})

describe('earlyDepartureMinutes', () => {
  it('reports an early finish', () => {
    assert.equal(
      earlyDepartureMinutes({
        closedAt: '2026-08-03T13:00:00Z',
        scheduledEnd: '2026-08-03T14:00:00Z',
        graceMinutes: 10,
        closedByEmployee: true,
      }),
      60,
    )
  })

  it('does not record an auto-closed session as leaving early', () => {
    // A forgotten clock-out is a missing punch, a different problem with a
    // different fix. Recording it as an early departure would put a
    // disciplinary-looking number against someone who stayed late.
    assert.equal(
      earlyDepartureMinutes({
        closedAt: '2026-08-03T14:00:00Z',
        scheduledEnd: '2026-08-03T14:00:00Z',
        graceMinutes: 10,
        closedByEmployee: false,
      }),
      0,
    )
  })
})

describe('overnight helpers', () => {
  it('detects a shift that crosses midnight', () => {
    assert.equal(crossesMidnight('22:00', '06:00'), true)
    assert.equal(crossesMidnight('08:00', '17:00'), false)
    // A 24-hour shift ending at its start time also crosses.
    assert.equal(crossesMidnight('08:00', '08:00'), true)
  })

  it('lands an overnight shift end on the next calendar day', () => {
    const w = scheduledWindow({ businessDate: '2026-08-03', startTime: '22:00', endTime: '06:00' })
    assert.equal(w.start, '2026-08-03T22:00:00')
    assert.equal(w.end, '2026-08-04T06:00:00')
    assert.equal(w.endDate, '2026-08-04')
  })

  it('keeps a same-day shift on one date', () => {
    const w = scheduledWindow({ businessDate: '2026-08-03', startTime: '08:00', endTime: '17:00' })
    assert.equal(w.end, '2026-08-03T17:00:00')
  })

  it('crosses a month boundary correctly', () => {
    const w = scheduledWindow({ businessDate: '2026-08-31', startTime: '22:00', endTime: '06:00' })
    assert.equal(w.endDate, '2026-09-01')
  })
})

describe('formatting and totals', () => {
  it('formats minutes for display', () => {
    assert.equal(formatMinutes(0), '0m')
    assert.equal(formatMinutes(45), '45m')
    assert.equal(formatMinutes(60), '1h')
    assert.equal(formatMinutes(465), '7h 45m')
    assert.equal(formatMinutes(-10), '0m')
  })

  it('converts to decimal hours for payroll', () => {
    assert.equal(toDecimalHours(465), 7.75)
    assert.equal(toDecimalHours(0), 0)
  })

  it('counts a two-session day as one day worked', () => {
    const totals = sumTotals([
      { businessDate: '2026-08-03', workedMinutes: 240, breakMinutes: 0, payableMinutes: 240, overtimeMinutes: 0 },
      { businessDate: '2026-08-03', workedMinutes: 180, breakMinutes: 0, payableMinutes: 180, overtimeMinutes: 0 },
      { businessDate: '2026-08-04', workedMinutes: 480, breakMinutes: 60, payableMinutes: 480, overtimeMinutes: 0 },
    ])
    assert.equal(totals.daysWorked, 2)
    assert.equal(totals.workedMinutes, 900)
    assert.equal(totals.payableMinutes, 900)
  })
})
