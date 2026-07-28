import assert from 'node:assert/strict'
import test from 'node:test'
import { accessCodeExpiry } from './checkin-code'

// A fixed "now" so every window is deterministic. Event well in the future,
// so the now+lead floor never masks the event-anchored result.
const NOW = new Date('2026-07-01T00:00:00.000Z')
const HOUR = 60 * 60 * 1000

test('fixed durations ignore the event times', () => {
  assert.equal(
    accessCodeExpiry('12h', '2026-08-01T18:00:00.000Z', '2026-08-01T23:00:00.000Z', NOW),
    new Date(NOW.getTime() + 12 * HOUR).toISOString(),
  )
  assert.equal(
    accessCodeExpiry('72h', null, null, NOW),
    new Date(NOW.getTime() + 72 * HOUR).toISOString(),
  )
})

test("'event' anchors to ends_at + 12h trailing window when set", () => {
  const endsAt = '2026-08-01T23:00:00.000Z'
  assert.equal(
    accessCodeExpiry('event', '2026-08-01T18:00:00.000Z', endsAt, NOW),
    new Date(new Date(endsAt).getTime() + 12 * HOUR).toISOString(),
  )
})

test("'event' falls back to starts_at + 12h when no end time is set", () => {
  const startsAt = '2026-08-01T18:00:00.000Z'
  assert.equal(
    accessCodeExpiry('event', startsAt, null, NOW),
    new Date(new Date(startsAt).getTime() + 12 * HOUR).toISOString(),
  )
})

test("'event' with an explicit end anchors past the start (the bug this fixes)", () => {
  // ends_at is 5h after start; the token must live until the *end* + trail,
  // not the old start + trail, so a late-running reception still admits guests.
  const startsAt = '2026-08-01T18:00:00.000Z'
  const endsAt = '2026-08-01T23:00:00.000Z'
  const withEnd = accessCodeExpiry('event', startsAt, endsAt, NOW)
  const withoutEnd = accessCodeExpiry('event', startsAt, null, NOW)
  assert.ok(new Date(withEnd).getTime() > new Date(withoutEnd).getTime())
})

test("'event' never returns an already-expired token (now + lead floor)", () => {
  // Event started in the past; the anchored window would be behind us, so the
  // floor (now + 12h lead) must win instead.
  const past = '2026-06-01T18:00:00.000Z'
  assert.equal(
    accessCodeExpiry('event', past, past, NOW),
    new Date(NOW.getTime() + 12 * HOUR).toISOString(),
  )
})

test("'event' with no times falls back to now + 72h", () => {
  assert.equal(
    accessCodeExpiry('event', null, null, NOW),
    new Date(NOW.getTime() + 72 * HOUR).toISOString(),
  )
})

test('a malformed end time falls back to the start', () => {
  const startsAt = '2026-08-01T18:00:00.000Z'
  assert.equal(
    accessCodeExpiry('event', startsAt, 'not-a-date', NOW),
    new Date(new Date(startsAt).getTime() + 12 * HOUR).toISOString(),
  )
})

test("'event' with ends_at before starts_at anchors on the start, not the earlier end", () => {
  // Corrupt data: the end time precedes the start. Anchoring blindly on the
  // end would give a SHORTER window than the start alone (the exact lock-out
  // this function guards against), so the later time — the start — must win.
  const startsAt = '2026-08-01T18:00:00.000Z'
  const endsAtBeforeStart = '2026-08-01T16:00:00.000Z'
  assert.equal(
    accessCodeExpiry('event', startsAt, endsAtBeforeStart, NOW),
    new Date(new Date(startsAt).getTime() + 12 * HOUR).toISOString(),
  )
})
