import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CHECKIN_TIME_ZONE,
  bucketArrivals,
  bucketMinutesFor,
  formatReportDateTime,
  formatReportLongDateTime,
  formatReportTime,
  ticketLabel,
  type ReportArrival,
} from './checkin-report'

const MIN = 60 * 1000

function arrival(iso: string, partySize = 1): ReportArrival {
  return { guestName: 'Guest', doorLabel: 'Main Gate', partySize, checkedInAt: iso }
}

// ---------------------------------------------------------------- ticketLabel

test('party size uses the sold ticket names, not "party of N"', () => {
  assert.equal(ticketLabel(1), 'Single')
  assert.equal(ticketLabel(2), 'Double')
  assert.equal(ticketLabel(10), 'Wakwe')
})

test('a size between two sold tickets falls back to a counted label', () => {
  // Exact match, not a floor: calling 9 a "Double" would understate the report
  // by seven people.
  assert.equal(ticketLabel(3), 'Party of 3')
  assert.equal(ticketLabel(9), 'Party of 9')
  assert.equal(ticketLabel(12), 'Party of 12')
})

test('report clocks use Dar es Salaam time instead of the viewer time zone', () => {
  assert.equal(CHECKIN_TIME_ZONE, 'Africa/Dar_es_Salaam')
  const iso = '2026-08-08T21:30:00.000Z'
  assert.equal(formatReportTime(iso), '00:30')
  assert.equal(formatReportDateTime(iso), '9 Aug 2026, 00:30')
})

test('the letterhead date is long form, on the same clock, comma-joined', () => {
  // "at" is what toLocaleString would join with, and it reads nothing like the
  // timestamps in the rest of the report.
  const iso = '2026-08-08T21:30:00.000Z'
  assert.equal(formatReportLongDateTime(iso), '9 August 2026, 00:30')
})

// ---------------------------------------------------------------- bucket width

test('bucket width steps up with the span so the axis stays readable', () => {
  assert.equal(bucketMinutesFor(30 * MIN), 5)
  assert.equal(bucketMinutesFor(60 * MIN), 5)
  assert.equal(bucketMinutesFor(90 * MIN), 15)
  assert.equal(bucketMinutesFor(180 * MIN), 15)
  assert.equal(bucketMinutesFor(300 * MIN), 30)
  assert.equal(bucketMinutesFor(480 * MIN), 30)
  assert.equal(bucketMinutesFor(600 * MIN), 60)
})

// ---------------------------------------------------------------- bucketArrivals

test('no arrivals produces no buckets rather than an empty axis', () => {
  const { points, bucketMinutes } = bucketArrivals([])
  assert.deepEqual(points, [])
  assert.equal(bucketMinutes, 0)
})

test('a single arrival produces exactly one bucket holding it', () => {
  const { points } = bucketArrivals([arrival('2026-08-08T14:03:00.000Z')])
  assert.equal(points.length, 1)
  assert.equal(points[0].count, 1)
  assert.equal(points[0].cumulative, 1)
})

test('every arrival lands in exactly one bucket', () => {
  const arrivals = [
    arrival('2026-08-08T14:00:00.000Z'),
    arrival('2026-08-08T14:04:59.000Z'),
    arrival('2026-08-08T14:05:00.000Z'),
    arrival('2026-08-08T14:31:00.000Z'),
  ]
  const { points } = bucketArrivals(arrivals)
  const total = points.reduce((sum, p) => sum + p.count, 0)
  assert.equal(total, arrivals.length, 'counts must re-sum to the arrivals given')
})

test('the last arrival is never dropped off the end', () => {
  // Guards the Math.min clamp: without it the final timestamp can index one
  // past the last bucket and vanish from the chart.
  const { points } = bucketArrivals([
    arrival('2026-08-08T14:00:00.000Z'),
    arrival('2026-08-08T14:30:00.000Z'),
  ])
  assert.equal(points.reduce((s, p) => s + p.count, 0), 2)
  assert.equal(points[points.length - 1].count, 1)
})

test('quiet intervals are zeros, not gaps', () => {
  // 14:00 then 14:20, at a 5-minute width: three empty buckets in between.
  const { points, bucketMinutes } = bucketArrivals([
    arrival('2026-08-08T14:00:00.000Z'),
    arrival('2026-08-08T14:20:00.000Z'),
  ])
  assert.equal(bucketMinutes, 5)
  assert.equal(points.length, 5)
  assert.deepEqual(
    points.map((p) => p.count),
    [1, 0, 0, 0, 1],
  )
})

test('cumulative rises monotonically and ends at the arrival count', () => {
  const arrivals = [
    arrival('2026-08-08T14:00:00.000Z'),
    arrival('2026-08-08T14:20:00.000Z'),
    arrival('2026-08-08T14:22:00.000Z'),
    arrival('2026-08-08T15:10:00.000Z'),
  ]
  const { points } = bucketArrivals(arrivals)
  for (let i = 1; i < points.length; i += 1) {
    assert.ok(points[i].cumulative >= points[i - 1].cumulative, 'cumulative must never fall')
  }
  assert.equal(points[points.length - 1].cumulative, arrivals.length)
})

test('input order does not matter — the server sends newest first', () => {
  const newestFirst = [
    arrival('2026-08-08T15:10:00.000Z'),
    arrival('2026-08-08T14:20:00.000Z'),
    arrival('2026-08-08T14:00:00.000Z'),
  ]
  const { points } = bucketArrivals(newestFirst)
  assert.equal(points[0].count, 1, 'oldest arrival must open the series')
  assert.equal(points[points.length - 1].cumulative, 3)
})

test('an unparseable timestamp is skipped rather than poisoning the axis', () => {
  const { points } = bucketArrivals([
    arrival('2026-08-08T14:00:00.000Z'),
    arrival('not-a-date'),
    arrival('2026-08-08T14:10:00.000Z'),
  ])
  assert.equal(points.reduce((s, p) => s + p.count, 0), 2)
})
