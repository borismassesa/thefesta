import assert from 'node:assert/strict'
import test from 'node:test'
import {
  attendantNameFrom,
  bucketAdmissions,
  bucketMinutesFor,
  guestStatusFor,
  metricDefinitions,
  rateOf,
  ticketLabelFor,
} from './report-model-core'

// The three real admissions from the Moses Seeta ledger, in UTC as stored.
const REAL_ADMISSIONS = [
  { at: '2026-08-06T05:00:46.834Z', seats: 1 },
  { at: '2026-08-06T06:14:41.561Z', seats: 1 },
  { at: '2026-08-07T07:52:30.843Z', seats: 2 },
]

test('a rate is null rather than zero when nothing can be measured', () => {
  // "0% turnout" and "nobody has RSVP'd yet" are different facts. A report
  // that prints 0% before a single guest is confirmed is stating something
  // false about the wedding.
  assert.equal(rateOf(0, 0), null)
  assert.deepEqual(rateOf(0, 93), { numerator: 0, denominator: 93 })
  assert.deepEqual(rateOf(78, 93), { numerator: 78, denominator: 93 })
})

test('a rate keeps its denominator so "78 of 93" can be printed beside the percent', () => {
  const r = rateOf(78, 93)
  assert.ok(r)
  assert.equal(r.numerator, 78)
  assert.equal(r.denominator, 93)
  // The model never rounds; that is the template's decision.
  assert.equal(Math.round((r.numerator / r.denominator) * 1000) / 10, 83.9)
})

test('the timeline counts SEATS, not scans', () => {
  // A Double card walking in is two people through the door. Counting the scan
  // once would understate the busiest moment, which is the one number this
  // chart exists to show.
  const { buckets } = bucketAdmissions([
    { at: '2026-08-07T18:00:00.000Z', seats: 2 },
    { at: '2026-08-07T18:01:00.000Z', seats: 2 },
  ])
  assert.equal(buckets[0].seats, 4)
  assert.equal(buckets[0].cumulativeSeats, 4)
})

test('buckets are dense, so a lull reads as a lull', () => {
  // Twenty minutes apart at a 5-minute width: the three empty intervals
  // between must be present as zeros, not skipped.
  const { buckets, bucketMinutes } = bucketAdmissions([
    { at: '2026-08-07T18:00:00.000Z', seats: 1 },
    { at: '2026-08-07T18:20:00.000Z', seats: 1 },
  ])
  assert.equal(bucketMinutes, 5)
  assert.equal(buckets.length, 5)
  assert.deepEqual(
    buckets.map((b) => b.seats),
    [1, 0, 0, 0, 1],
  )
  // The running total never goes backwards across a gap.
  assert.deepEqual(
    buckets.map((b) => b.cumulativeSeats),
    [1, 1, 1, 1, 2],
  )
})

test('bucket width widens with the span so the chart stays readable', () => {
  assert.equal(bucketMinutesFor(30 * 60000), 5)
  assert.equal(bucketMinutesFor(120 * 60000), 15)
  assert.equal(bucketMinutesFor(300 * 60000), 30)
  assert.equal(bucketMinutesFor(600 * 60000), 60)
})

test('peak reports a window and prefers the earlier of two equally busy ones', () => {
  const { peak } = bucketAdmissions([
    { at: '2026-08-07T18:00:00.000Z', seats: 3 },
    { at: '2026-08-07T18:30:00.000Z', seats: 3 },
  ])
  assert.ok(peak)
  assert.equal(peak.seats, 3)
  assert.equal(peak.startsAt, '2026-08-07T18:00:00.000Z')
  // A window, not an instant: the couple reads "between X and Y".
  assert.equal(peak.endsAt, '2026-08-07T18:05:00.000Z')
})

test('an empty door produces no buckets and no peak, not a zero-width chart', () => {
  const empty = bucketAdmissions([])
  assert.deepEqual(empty.buckets, [])
  assert.equal(empty.peak, null)
  assert.equal(empty.bucketMinutes, 0)
})

test('admissions that admitted nobody never reach the timeline', () => {
  // An exhausted re-scan has admitted_count 0. Bucketing it would invent an
  // arrival that did not happen.
  const { buckets, peak } = bucketAdmissions([
    { at: '2026-08-07T18:00:00.000Z', seats: 0 },
    { at: '2026-08-07T18:02:00.000Z', seats: 0 },
  ])
  assert.deepEqual(buckets, [])
  assert.equal(peak, null)
})

test('unsorted and malformed timestamps do not corrupt the ordering', () => {
  const { buckets } = bucketAdmissions([
    { at: '2026-08-07T18:20:00.000Z', seats: 1 },
    { at: 'not a date', seats: 5 },
    { at: '2026-08-07T18:00:00.000Z', seats: 1 },
  ])
  assert.equal(buckets.length, 5)
  assert.equal(buckets[0].seats, 1)
  assert.equal(buckets[buckets.length - 1].cumulativeSeats, 2)
})

test('the real ledger spans two days and buckets hourly', () => {
  const { bucketMinutes, buckets, peak } = bucketAdmissions(REAL_ADMISSIONS)
  assert.equal(bucketMinutes, 60)
  // 4 seats admitted across the three real admissions (1 + 1 + 2).
  assert.equal(buckets[buckets.length - 1].cumulativeSeats, 4)
  assert.ok(peak)
  assert.equal(peak.seats, 2)
})

test('ticket labels use the language the cards are sold in', () => {
  assert.equal(ticketLabelFor(1), 'Single')
  assert.equal(ticketLabelFor(2), 'Double')
  // Defensive: an allowance of 0 would still be a card someone holds.
  assert.equal(ticketLabelFor(0), 'Single')
  assert.equal(ticketLabelFor(4), 'Party of 4')
})

test('a partly-admitted party is neither arrived nor absent', () => {
  // Two of a party of four walked in. Calling that "admitted" overstates the
  // headcount and "not arrived" erases two people who are in the room.
  assert.equal(guestStatusFor(0, 2), 'not_arrived')
  assert.equal(guestStatusFor(1, 2), 'partial')
  assert.equal(guestStatusFor(2, 2), 'admitted')
  // More admitted than the allowance (an amendment) still reads as admitted.
  assert.equal(guestStatusFor(3, 2), 'admitted')
})

test('the attendant name is recovered from a real audit label', () => {
  assert.equal(
    attendantNameFrom('Boris Massesa (Main Gate) [roster_pick] (manual: QR could not be scanned)'),
    'Boris Massesa',
  )
  assert.equal(attendantNameFrom('Asha (Gate 2) [pass_id]'), 'Asha')
})

test('a label that does not match the shape is returned whole, not guessed at', () => {
  // Guessing here is what the structured columns exist to stop.
  assert.equal(attendantNameFrom('imported from old scanner'), 'imported from old scanner')
  assert.equal(attendantNameFrom(null), null)
  assert.equal(attendantNameFrom('   '), null)
  assert.equal(attendantNameFrom(undefined), null)
})

test('metric definitions name their unit, and attendance is measured in seats', () => {
  // The whole point of this map: the PDF, the dashboard and the CSV cannot
  // grow three different meanings of "attendance".
  assert.equal(metricDefinitions.confirmedInvitations.unit, 'invitation')
  assert.equal(metricDefinitions.confirmedSeats.unit, 'seat')
  assert.equal(metricDefinitions.admittedSeats.unit, 'seat')
  assert.equal(metricDefinitions.seatAttendance.source, 'admittedSeats / confirmedSeats')
})

test('the exhausted metric admits in writing that it cannot prove intent', () => {
  // If this note ever disappears, someone is about to label it "fraud".
  assert.match(metricDefinitions.exhaustedAttempts.note, /Cannot distinguish/)
  assert.match(metricDefinitions.confirmedDelivery.note, /Never counts unknowns/)
})
