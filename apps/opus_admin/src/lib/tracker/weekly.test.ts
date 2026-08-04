// "Weekly summaries aggregate daily entries accurately" is the acceptance
// criterion, and the accuracy that matters is the denominator: a completion
// rate that counts public holidays as failures punishes people for holidays.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  aggregateWeek,
  draftWeekly,
  kpiAttainment,
  kpiDirection,
  parseKpiMovement,
  type WeeklyEntry,
  type WeeklyItem,
} from './weekly'

function entry(over: Partial<WeeklyEntry> & Pick<WeeklyEntry, 'entryDate'>): WeeklyEntry {
  return {
    status: 'done',
    submittedAt: '2026-08-03T15:00:00.000Z',
    isLate: false,
    suppressionReason: null,
    loggedMinutes: 0,
    ...over,
  }
}

function wItem(over: Partial<WeeklyItem> & Pick<WeeklyItem, 'title'>): WeeklyItem {
  return {
    entryDate: '2026-08-03',
    kind: 'planned',
    status: 'done',
    carriedFromItemId: null,
    carryCount: 0,
    ...over,
  }
}

describe('aggregateWeek', () => {
  // A realistic week: three worked days, a public holiday, a day of approved
  // leave, and the weekend.
  const week: WeeklyEntry[] = [
    entry({ entryDate: '2026-08-03', status: 'done' }),
    entry({ entryDate: '2026-08-04', status: 'blocked', isLate: true, loggedMinutes: 480 }),
    entry({ entryDate: '2026-08-05', status: 'not_working_day', submittedAt: null, suppressionReason: 'public_holiday' }),
    entry({ entryDate: '2026-08-06', status: 'not_working_day', submittedAt: null, suppressionReason: 'approved_leave' }),
    entry({ entryDate: '2026-08-07', status: 'missed', submittedAt: null }),
    entry({ entryDate: '2026-08-08', status: 'not_working_day', submittedAt: null, suppressionReason: 'rest_day' }),
    entry({ entryDate: '2026-08-09', status: 'not_working_day', submittedAt: null, suppressionReason: 'rest_day' }),
  ]

  it('EXCLUDES suppressed days from the denominator', () => {
    const agg = aggregateWeek(week)
    // Three days were actually owed: Mon, Tue, Fri.
    assert.equal(agg.workingDays, 3)
    assert.equal(agg.entriesTotal, 7)
    assert.equal(agg.entriesNotWorking, 4)
  })

  it('computes completion against days owed, not days in the week', () => {
    const agg = aggregateWeek(week)
    // Two submitted out of three owed. Counting all seven would report 29%
    // and make a week with a holiday look like a failure.
    assert.equal(agg.entriesSubmitted, 2)
    assert.equal(agg.completionPercent, 67)
  })

  it('counts each status separately', () => {
    const agg = aggregateWeek(week)
    assert.equal(agg.entriesDone, 1)
    assert.equal(agg.entriesBlocked, 1)
    assert.equal(agg.entriesMissed, 1)
    assert.equal(agg.entriesLate, 1)
  })

  it('sums logged minutes from the prefill', () => {
    assert.equal(aggregateWeek(week).loggedMinutes, 480)
  })

  it('reports 0% rather than dividing by zero in a week nothing was owed', () => {
    const allOff = [
      entry({ entryDate: '2026-08-03', status: 'not_working_day', submittedAt: null, suppressionReason: 'approved_leave' }),
    ]
    const agg = aggregateWeek(allOff)
    assert.equal(agg.workingDays, 0)
    assert.equal(agg.completionPercent, 0)
  })

  it('counts items, carried items and open blockers', () => {
    const items: WeeklyItem[] = [
      wItem({ title: 'a', status: 'done' }),
      wItem({ title: 'b', status: 'carried_over', carriedFromItemId: 'x', carryCount: 1 }),
      wItem({ title: 'c', kind: 'blocker', status: 'blocked' }),
      wItem({ title: 'd', kind: 'blocker', status: 'done' }),
    ]
    const agg = aggregateWeek(week, items)
    assert.equal(agg.itemsCompleted, 2)
    assert.equal(agg.itemsCarried, 1)
    assert.equal(agg.blockersOpen, 1)
  })

  it('handles an empty week without throwing', () => {
    const agg = aggregateWeek([])
    assert.equal(agg.entriesTotal, 0)
    assert.equal(agg.completionPercent, 0)
  })
})

describe('draftWeekly', () => {
  const items: WeeklyItem[] = [
    wItem({ title: 'Shipped the migration', status: 'done' }),
    wItem({ title: 'Shipped the migration', status: 'done' }), // duplicate across days
    wItem({ title: 'Vendor payout review', status: 'not_started' }),
    wItem({ title: 'Waiting on finance', kind: 'blocker', status: 'blocked' }),
    wItem({ title: 'Fix the callback', status: 'carried_over', carryCount: 2 }),
    wItem({ title: 'Closed blocker', kind: 'blocker', status: 'done' }),
  ]

  it('seeds wins from what was actually completed', () => {
    assert.deepEqual(draftWeekly(items).wins, ['Shipped the migration'])
  })

  it('deduplicates an item that appears on several days', () => {
    assert.equal(draftWeekly(items).wins.length, 1)
  })

  it('surfaces commitments nothing happened to', () => {
    assert.deepEqual(draftWeekly(items).missedCommitments, ['Vendor payout review'])
  })

  it('lists what carried forward and what is still blocking', () => {
    assert.deepEqual(draftWeekly(items).carriedForward, ['Fix the callback'])
    assert.deepEqual(draftWeekly(items).keyBlockers, ['Waiting on finance'])
  })

  it('does not treat a resolved blocker as a key blocker', () => {
    assert.ok(!draftWeekly(items).keyBlockers.includes('Closed blocker'))
  })
})

describe('KPI movement', () => {
  it('reads direction from previous to current', () => {
    assert.equal(kpiDirection({ name: 'Bookings', previous: 10, current: 14, target: 20 }), 'up')
    assert.equal(kpiDirection({ name: 'Refunds', previous: 10, current: 4, target: 2 }), 'down')
    assert.equal(kpiDirection({ name: 'Flat', previous: 10, current: 10, target: 10 }), 'flat')
    assert.equal(
      kpiDirection({ name: 'New', previous: null, current: 14, target: 20 }),
      'unknown',
    )
  })

  it('computes attainment against target', () => {
    assert.equal(kpiAttainment({ name: 'x', previous: 0, current: 15, target: 20 }), 75)
  })

  it('returns null rather than 0% when there is no target', () => {
    // "0% of target" reads as failure; absence of a target is not failure.
    assert.equal(kpiAttainment({ name: 'x', previous: 0, current: 15, target: null }), null)
    assert.equal(kpiAttainment({ name: 'x', previous: 0, current: 15, target: 0 }), null)
    assert.equal(kpiAttainment({ name: 'x', previous: 0, current: null, target: 20 }), null)
  })

  it('survives whatever is in the jsonb column', () => {
    assert.deepEqual(parseKpiMovement(null), [])
    assert.deepEqual(parseKpiMovement('nope'), [])
    assert.deepEqual(parseKpiMovement([{ name: '' }, { nope: 1 }]), [])
    const parsed = parseKpiMovement([
      { name: 'Bookings', previous: 10, current: 14, target: 20 },
      { name: 'Partial', current: 'lots' },
    ])
    assert.equal(parsed.length, 2)
    assert.equal(parsed[1].current, null, 'a non-numeric value becomes null, not NaN')
  })
})
