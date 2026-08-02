// "Calendar entries respect employee timezone" is the acceptance criterion, and
// it is mostly about which DAY an entry lands on.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CALENDAR_SOURCES,
  SOURCE_LABELS,
  addDays,
  buildDays,
  commitments,
  conflictsOn,
  localDate,
  localTime,
  placeEntry,
  sortEntries,
  type CalendarEntry,
} from './calendar'

const EAT = 'Africa/Dar_es_Salaam' // UTC+3, no DST

function entry(over: Partial<CalendarEntry> & Pick<CalendarEntry, 'source' | 'date'>): CalendarEntry {
  return {
    startsAt: null,
    endsAt: null,
    allDay: true,
    title: 'Something',
    detail: null,
    refId: null,
    ...over,
  }
}

describe('timezone handling', () => {
  it('puts a late-evening local meeting on the RIGHT day', () => {
    // 23:00 EAT is 20:00 UTC the same day. The regression to avoid is the
    // reverse: an instant near midnight landing on the wrong date.
    assert.equal(localDate('2026-08-05T20:00:00.000Z', EAT), '2026-08-05')
  })

  it('rolls a late-UTC instant into the next local day', () => {
    // 22:30 UTC is 01:30 the NEXT day in East Africa Time.
    assert.equal(localDate('2026-08-05T22:30:00.000Z', EAT), '2026-08-06')
    assert.equal(localDate('2026-08-05T22:30:00.000Z', 'UTC'), '2026-08-05')
  })

  it('renders the local clock time', () => {
    assert.equal(localTime('2026-08-05T20:00:00.000Z', EAT), '23:00')
    assert.equal(localTime('2026-08-05T20:00:00.000Z', 'UTC'), '20:00')
  })

  it('handles a timezone WITH daylight saving correctly', () => {
    // London is UTC+1 in August. A 23:30 UTC instant is 00:30 the next day.
    assert.equal(localDate('2026-08-05T23:30:00.000Z', 'Europe/London'), '2026-08-06')
    // ...and UTC+0 in January, so the same wall time stays on the same day.
    assert.equal(localDate('2026-01-05T23:30:00.000Z', 'Europe/London'), '2026-01-05')
  })
})

describe('placeEntry', () => {
  it('derives a timed entry’s date from its start instant', () => {
    const placed = placeEntry(
      {
        source: 'meeting',
        startsAt: '2026-08-05T22:30:00.000Z',
        endsAt: '2026-08-05T23:00:00.000Z',
        allDay: false,
        title: 'Late sync',
        detail: null,
        refId: null,
      },
      EAT,
    )
    assert.equal(placed.date, '2026-08-06')
  })

  it('keeps an all-day entry on the date it was given', () => {
    // A public holiday is a date, not an instant, and must not be shifted.
    const placed = placeEntry(
      {
        source: 'holiday',
        date: '2026-08-05',
        startsAt: null,
        endsAt: null,
        allDay: true,
        title: 'Nane Nane',
        detail: null,
        refId: null,
      },
      EAT,
    )
    assert.equal(placed.date, '2026-08-05')
  })
})

describe('sortEntries', () => {
  it('puts the day’s context before its appointments', () => {
    const entries = [
      entry({ source: 'task', date: '2026-08-05', title: 'Ship it' }),
      entry({ source: 'meeting', date: '2026-08-05', allDay: false, startsAt: '2026-08-05T07:00:00Z', title: 'Standup' }),
      entry({ source: 'holiday', date: '2026-08-05', title: 'Nane Nane' }),
      entry({ source: 'leave', date: '2026-08-05', title: 'Annual leave' }),
    ]
    assert.deepEqual(
      sortEntries(entries).map((e) => e.source),
      ['holiday', 'leave', 'task', 'meeting'],
      'all-day context first, then timed entries',
    )
  })

  it('orders across days first of all', () => {
    const entries = [
      entry({ source: 'task', date: '2026-08-06' }),
      entry({ source: 'task', date: '2026-08-05' }),
    ]
    assert.deepEqual(sortEntries(entries).map((e) => e.date), ['2026-08-05', '2026-08-06'])
  })
})

describe('buildDays', () => {
  const entries = [
    entry({ source: 'holiday', date: '2026-08-05', title: 'Nane Nane' }),
    entry({ source: 'leave', date: '2026-08-06', title: 'Annual leave', allDay: true }),
    entry({ source: 'leave', date: '2026-08-07', title: 'Half day', allDay: false }),
    entry({ source: 'task', date: '2026-08-04', title: 'Ship it' }),
  ]

  it('includes EVERY day in the range, including quiet ones', () => {
    // A calendar that skips empty days is a list, and reading it as a week
    // becomes guesswork.
    const days = buildDays(entries, '2026-08-03', '2026-08-09')
    assert.equal(days.length, 7)
    assert.deepEqual(days[0], { date: '2026-08-03', entries: [], isHoliday: false, isOnLeave: false })
  })

  it('flags holidays and full days of leave', () => {
    const days = buildDays(entries, '2026-08-03', '2026-08-09')
    assert.equal(days.find((d) => d.date === '2026-08-05')?.isHoliday, true)
    assert.equal(days.find((d) => d.date === '2026-08-06')?.isOnLeave, true)
  })

  it('does NOT mark a half day of leave as away', () => {
    // Half a day of leave still has work in it.
    assert.equal(buildDays(entries, '2026-08-03', '2026-08-09').find((d) => d.date === '2026-08-07')?.isOnLeave, false)
  })

  it('drops entries outside the range rather than widening it', () => {
    const days = buildDays(entries, '2026-08-05', '2026-08-06')
    assert.equal(days.length, 2)
    assert.ok(days.every((d) => d.entries.every((e) => e.date >= '2026-08-05' && e.date <= '2026-08-06')))
  })

  it('returns nothing for a reversed range instead of spinning', () => {
    assert.deepEqual(buildDays(entries, '2026-08-09', '2026-08-03'), [])
  })
})

describe('commitments and conflicts', () => {
  it('counts only what the employee owes', () => {
    const entries = [
      entry({ source: 'task', date: '2026-08-05' }),
      entry({ source: 'report_due', date: '2026-08-05' }),
      entry({ source: 'tracker_due', date: '2026-08-05' }),
      entry({ source: 'milestone', date: '2026-08-05' }),
      entry({ source: 'holiday', date: '2026-08-05' }),
      entry({ source: 'shift', date: '2026-08-05' }),
    ]
    assert.deepEqual(
      commitments(entries).map((e) => e.source),
      ['task', 'report_due', 'tracker_due', 'milestone'],
    )
  })

  it('reports a holiday or leave as a scheduling conflict', () => {
    const days = buildDays(
      [
        entry({ source: 'holiday', date: '2026-08-05' }),
        entry({ source: 'leave', date: '2026-08-06', allDay: true }),
      ],
      '2026-08-05',
      '2026-08-07',
    )
    assert.deepEqual(conflictsOn(days[0]), ['holiday'])
    assert.deepEqual(conflictsOn(days[1]), ['leave'])
    assert.deepEqual(conflictsOn(days[2]), [])
  })
})

describe('sources', () => {
  it('labels all eight', () => {
    assert.equal(CALENDAR_SOURCES.length, 8)
    for (const s of CALENDAR_SOURCES) assert.ok(SOURCE_LABELS[s].length > 0, s)
  })
})

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    assert.equal(addDays('2026-08-31', 1), '2026-09-01')
    assert.equal(addDays('2026-01-01', -1), '2025-12-31')
  })
})
