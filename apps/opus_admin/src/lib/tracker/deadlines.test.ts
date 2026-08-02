// Two acceptance criteria are decided here: deadlines respecting timezone and
// work schedule, and approved leave never producing a missed status. The cases
// below are the ones that put an unfair red mark against somebody.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  addDays,
  deadlineAt,
  isLate,
  isoWeekday,
  missedAfter,
  nextWorkingDay,
  resolveDayState,
  shouldMarkMissed,
  workingDaysBetween,
  type DayState,
  type DayStateInput,
} from './deadlines'

const EAT = 180 // East Africa Time, UTC+3

const BASE: DayStateInput = {
  date: '2026-08-05', // a Wednesday
  workingWeekdays: [1, 2, 3, 4, 5],
  holidays: [],
  leave: [],
  employmentStartDate: '2020-01-01',
  employmentStatus: 'Active',
}

describe('resolveDayState', () => {
  it('is a working day on an ordinary Wednesday', () => {
    assert.deepEqual(resolveDayState(BASE), { working: true })
  })

  it('is a rest day at the weekend', () => {
    assert.deepEqual(resolveDayState({ ...BASE, date: '2026-08-08' }), {
      working: false,
      reason: 'rest_day',
    })
  })

  it('is a public holiday when the calendar says so', () => {
    assert.deepEqual(resolveDayState({ ...BASE, holidays: ['2026-08-05'] }), {
      working: false,
      reason: 'public_holiday',
    })
  })

  it('APPROVED LEAVE suppresses the day', () => {
    // The acceptance criterion. Someone on leave must never be marked missed.
    assert.deepEqual(
      resolveDayState({
        ...BASE,
        leave: [{ startDate: '2026-08-03', endDate: '2026-08-07', status: 'Approved' }],
      }),
      { working: false, reason: 'approved_leave' },
    )
  })

  it('does NOT let pending leave suppress the day', () => {
    // Otherwise anyone could excuse themselves by filing a request nobody
    // approved.
    assert.deepEqual(
      resolveDayState({
        ...BASE,
        leave: [{ startDate: '2026-08-03', endDate: '2026-08-07', status: 'Pending' }],
      }),
      { working: true },
    )
    for (const status of ['Rejected', 'Cancelled']) {
      assert.deepEqual(
        resolveDayState({
          ...BASE,
          leave: [{ startDate: '2026-08-03', endDate: '2026-08-07', status }],
        }),
        { working: true },
        status,
      )
    }
  })

  it('ranks leave above a public holiday inside the same run', () => {
    // A fortnight of leave containing a holiday should read as leave
    // throughout, not as a confusing mixture.
    assert.deepEqual(
      resolveDayState({
        ...BASE,
        holidays: ['2026-08-05'],
        leave: [{ startDate: '2026-08-03', endDate: '2026-08-14', status: 'Approved' }],
      }),
      { working: false, reason: 'approved_leave' },
    )
  })

  it('suppresses days before someone joined and after they left', () => {
    assert.deepEqual(resolveDayState({ ...BASE, employmentStartDate: '2026-09-01' }), {
      working: false,
      reason: 'not_employed',
    })
    for (const status of ['Resigned', 'Terminated']) {
      assert.deepEqual(
        resolveDayState({ ...BASE, employmentStatus: status }),
        { working: false, reason: 'not_employed' },
        status,
      )
    }
  })

  it('keeps tracking someone on a suspension or on leave in the HR sense', () => {
    // Suspended is not the same as gone: their days still exist, and whether
    // they may act is Workspace's access question, not the tracker's.
    assert.deepEqual(resolveDayState({ ...BASE, employmentStatus: 'Suspended' }), {
      working: true,
    })
  })

  it('honours a schedule that works Saturdays', () => {
    assert.deepEqual(
      resolveDayState({ ...BASE, date: '2026-08-08', workingWeekdays: [1, 2, 3, 4, 5, 6] }),
      { working: true },
    )
  })
})

describe('deadlineAt', () => {
  it('builds the deadline in the schedule timezone, not in UTC', () => {
    // 18:00 in Dar es Salaam is 15:00 UTC. A naive implementation marks people
    // late at 21:00 their own time.
    assert.equal(
      deadlineAt({ date: '2026-08-05', deadlineTime: '18:00', offsetMinutes: EAT }),
      '2026-08-05T15:00:00.000Z',
    )
  })

  it('handles a different timezone for a unit that works elsewhere', () => {
    assert.equal(
      deadlineAt({ date: '2026-08-05', deadlineTime: '18:00', offsetMinutes: 0 }),
      '2026-08-05T18:00:00.000Z',
    )
    // UTC-5: 18:00 local is 23:00 UTC the same day.
    assert.equal(
      deadlineAt({ date: '2026-08-05', deadlineTime: '18:00', offsetMinutes: -300 }),
      '2026-08-05T23:00:00.000Z',
    )
  })

  it('rolls into the next UTC day for a late local deadline', () => {
    assert.equal(
      deadlineAt({ date: '2026-08-05', deadlineTime: '23:30', offsetMinutes: -300 }),
      '2026-08-06T04:30:00.000Z',
    )
  })

  it('accepts seconds in the time value', () => {
    assert.equal(
      deadlineAt({ date: '2026-08-05', deadlineTime: '18:00:00', offsetMinutes: EAT }),
      '2026-08-05T15:00:00.000Z',
    )
  })
})

describe('missedAfter and isLate', () => {
  it('adds the grace window to the deadline', () => {
    assert.equal(missedAfter('2026-08-05T15:00:00.000Z', 60), '2026-08-05T16:00:00.000Z')
    assert.equal(missedAfter('2026-08-05T15:00:00.000Z', 0), '2026-08-05T15:00:00.000Z')
    assert.equal(missedAfter('2026-08-05T15:00:00.000Z', -5), '2026-08-05T15:00:00.000Z')
  })

  it('separates late from on time', () => {
    assert.equal(isLate('2026-08-05T15:30:00.000Z', '2026-08-05T15:00:00.000Z'), true)
    assert.equal(isLate('2026-08-05T14:30:00.000Z', '2026-08-05T15:00:00.000Z'), false)
    assert.equal(isLate('2026-08-05T14:30:00.000Z', null), false)
  })
})

describe('shouldMarkMissed', () => {
  const deadline = '2026-08-05T15:00:00.000Z'
  const open = {
    status: 'not_started',
    submittedAt: null,
    deadlineAt: deadline,
    suppressionReason: null,
  }

  it('marks an unfilled entry missed after the grace window', () => {
    assert.equal(shouldMarkMissed(open, 60, '2026-08-05T16:01:00.000Z'), true)
  })

  it('does not mark it during the grace window', () => {
    assert.equal(shouldMarkMissed(open, 60, '2026-08-05T15:30:00.000Z'), false)
  })

  it('NEVER marks a suppressed day, whatever else is true', () => {
    // The acceptance criterion, at the point it is enforced.
    for (const reason of ['approved_leave', 'public_holiday', 'rest_day', 'waived']) {
      assert.equal(
        shouldMarkMissed(
          { ...open, suppressionReason: reason },
          60,
          '2026-09-01T00:00:00.000Z',
        ),
        false,
        reason,
      )
    }
  })

  it('does not mark a submitted entry, however late', () => {
    assert.equal(
      shouldMarkMissed(
        { ...open, submittedAt: '2026-08-06T09:00:00.000Z' },
        60,
        '2026-09-01T00:00:00.000Z',
      ),
      false,
    )
  })

  it('does not re-mark an entry already in a terminal status', () => {
    for (const status of ['done', 'missed', 'carried_over', 'waived', 'not_working_day']) {
      assert.equal(
        shouldMarkMissed({ ...open, status }, 60, '2026-09-01T00:00:00.000Z'),
        false,
        status,
      )
    }
  })

  it('cannot mark an entry that never had a deadline', () => {
    assert.equal(
      shouldMarkMissed({ ...open, deadlineAt: null }, 60, '2026-09-01T00:00:00.000Z'),
      false,
    )
  })
})

describe('nextWorkingDay', () => {
  const resolve = (holidays: string[] = []) => (date: string): DayState =>
    resolveDayState({ ...BASE, date, holidays })

  it('lands a Friday item on Monday, not Saturday', () => {
    assert.equal(nextWorkingDay('2026-08-08', resolve()), '2026-08-10')
  })

  it('skips a public holiday too', () => {
    // Monday is a holiday, so the item lands on Tuesday.
    assert.equal(nextWorkingDay('2026-08-08', resolve(['2026-08-10'])), '2026-08-11')
  })

  it('returns the day itself when it is already a working day', () => {
    assert.equal(nextWorkingDay('2026-08-05', resolve()), '2026-08-05')
  })

  it('gives up rather than looping when nothing is ever a working day', () => {
    const never = (): DayState => ({ working: false, reason: 'rest_day' })
    assert.equal(nextWorkingDay('2026-08-05', never), null)
  })
})

describe('workingDaysBetween', () => {
  it('counts only the days actually worked', () => {
    const resolve = (date: string): DayState =>
      resolveDayState({
        ...BASE,
        date,
        holidays: ['2026-08-05'],
        leave: [{ startDate: '2026-08-06', endDate: '2026-08-06', status: 'Approved' }],
      })
    // Mon 3 to Sun 9: Mon, Tue, Fri are worked; Wed is a holiday, Thu is leave,
    // Sat and Sun are rest days.
    const days = workingDaysBetween('2026-08-03', '2026-08-09', resolve)
    assert.deepEqual(days, ['2026-08-03', '2026-08-04', '2026-08-07'])
  })

  it('returns nothing for a reversed range instead of spinning', () => {
    assert.deepEqual(
      workingDaysBetween('2026-08-09', '2026-08-03', () => ({ working: true })),
      [],
    )
  })
})

describe('date helpers', () => {
  it('numbers weekdays the ISO way', () => {
    assert.equal(isoWeekday('2026-08-03'), 1)
    assert.equal(isoWeekday('2026-08-09'), 7)
  })

  it('adds days across boundaries', () => {
    assert.equal(addDays('2026-08-31', 1), '2026-09-01')
    assert.equal(addDays('2026-01-01', -1), '2025-12-31')
  })
})
