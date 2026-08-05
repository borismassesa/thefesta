import assert from 'node:assert/strict'
import test from 'node:test'
import { capacityTone, eventLifecycle } from './checkin-event-status'

const HOUR = 60 * 60 * 1000
// Doors open at 18:00, close at 23:00.
const STARTS = '2026-08-08T18:00:00.000Z'
const ENDS = '2026-08-08T23:00:00.000Z'
const at = (iso: string) => new Date(iso).getTime()

test('an event with no start date is undated, never past or upcoming', () => {
  assert.equal(eventLifecycle(null, null, at('2026-08-08T20:00:00.000Z')), 'undated')
  assert.equal(eventLifecycle('nonsense', null, at('2026-08-08T20:00:00.000Z')), 'undated')
})

test('well before the start it is upcoming', () => {
  assert.equal(eventLifecycle(STARTS, ENDS, at('2026-08-01T12:00:00.000Z')), 'upcoming')
})

test('doors count as open from the lead window, not exactly at starts_at', () => {
  // Staff arrive and start scanning before the published time; 3h lead.
  assert.equal(eventLifecycle(STARTS, ENDS, at('2026-08-08T14:59:00.000Z')), 'upcoming')
  assert.equal(eventLifecycle(STARTS, ENDS, at('2026-08-08T15:30:00.000Z')), 'live')
})

test('it stays live right up to the end time and is ended after', () => {
  assert.equal(eventLifecycle(STARTS, ENDS, at('2026-08-08T22:59:00.000Z')), 'live')
  assert.equal(eventLifecycle(STARTS, ENDS, at('2026-08-08T23:01:00.000Z')), 'ended')
})

test('with no end time an assumed duration keeps it live for the evening', () => {
  assert.equal(eventLifecycle(STARTS, null, at('2026-08-09T05:00:00.000Z')), 'live')
  assert.equal(eventLifecycle(STARTS, null, at('2026-08-09T07:00:00.000Z')), 'ended')
})

test('an end time before the start cannot shorten the window', () => {
  // Corrupt data: taking ends_at blindly would mark a running event ended.
  const badEnd = '2026-08-08T09:00:00.000Z'
  assert.equal(eventLifecycle(STARTS, badEnd, at('2026-08-08T20:00:00.000Z')), 'live')
})

test('capacity thresholds move green → amber → rose', () => {
  assert.equal(capacityTone(0).bar, capacityTone(69).bar)
  assert.notEqual(capacityTone(69).bar, capacityTone(70).bar)
  assert.notEqual(capacityTone(70).bar, capacityTone(90).bar)
  assert.match(capacityTone(95).bar, /rose/)
})
