import assert from 'node:assert/strict'
import test from 'node:test'
import { DESIGN_SLA_HOURS, DESIGN_SLA_START, designDueAt, slaApplies, slaState } from './design-sla'

const APPROVED = '2026-07-31T09:00:00.000Z'
const at = (iso: string) => new Date(iso)

test('the deadline is 48 hours after approval', () => {
  assert.equal(DESIGN_SLA_HOURS, 48)
  assert.equal(designDueAt(APPROVED)?.toISOString(), '2026-08-02T09:00:00.000Z')
})

test('no approval means no clock', () => {
  // An unapproved order hasn't started its window; inventing one would show a
  // breach that never happened.
  assert.equal(designDueAt(null), null)
  assert.equal(designDueAt(''), null)
  assert.equal(slaState(null), null)
})

test('a malformed timestamp does not become an epoch deadline', () => {
  assert.equal(designDueAt('not a date'), null)
  assert.equal(slaState('not a date'), null)
})

test('a fresh job is comfortably within the window', () => {
  const state = slaState(APPROVED, at('2026-07-31T10:00:00.000Z'))
  assert.equal(state?.tone, 'ok')
  assert.equal(state?.label, '47h left')
})

test('the last quarter of the window reads as due soon', () => {
  // The threshold is a quarter of 48h = 12h remaining, i.e. 2026-08-01T21:00Z.
  const justOutside = slaState(APPROVED, at('2026-08-01T20:30:00.000Z'))
  assert.equal(justOutside?.tone, 'ok', '12h30m remaining is not yet urgent')

  const onTheThreshold = slaState(APPROVED, at('2026-08-01T21:00:00.000Z'))
  assert.equal(onTheThreshold?.tone, 'due_soon', 'exactly 12h remaining is urgent')

  const dueSoon = slaState(APPROVED, at('2026-08-01T22:00:00.000Z'))
  assert.equal(dueSoon?.tone, 'due_soon')
  assert.equal(dueSoon?.label, '11h left')
})

test('past the deadline it reports how far overdue', () => {
  const state = slaState(APPROVED, at('2026-08-02T13:00:00.000Z'))
  assert.equal(state?.tone, 'overdue')
  assert.equal(state?.label, '4h overdue')
  assert.ok(state && state.hoursRemaining < 0)
})

test('the moment of the deadline counts as overdue, not ok', () => {
  const state = slaState(APPROVED, at('2026-08-02T09:00:00.000Z'))
  assert.equal(state?.tone, 'overdue')
})

test('minutes show only when they matter', () => {
  // Near the wire, minutes are actionable.
  assert.equal(slaState(APPROVED, at('2026-08-02T06:30:00.000Z'))?.label, '2h 30m left')
  // Under an hour, drop to minutes entirely.
  assert.equal(slaState(APPROVED, at('2026-08-02T08:45:00.000Z'))?.label, '15m left')
  // Far out, minutes are noise.
  assert.equal(slaState(APPROVED, at('2026-07-31T09:30:00.000Z'))?.label, '47h left')
})

test('a sub-minute remainder never renders as "0m left"', () => {
  const state = slaState(APPROVED, at('2026-08-02T08:59:30.000Z'))
  assert.equal(state?.tone, 'due_soon')
  assert.equal(state?.label, '1m left')
})

test('a long overdue job rolls up to days', () => {
  assert.equal(slaState(APPROVED, at('2026-08-07T09:00:00.000Z'))?.label, '5d overdue')
})

test('submitted work stops the clock', () => {
  // Otherwise the queue fills with permanent breaches nobody can clear.
  assert.equal(slaApplies('ready'), false)
  assert.equal(slaApplies('delivered'), false)
  for (const status of ['not_started', 'awaiting_info', 'in_design', 'in_review']) {
    assert.equal(slaApplies(status), true, `${status} is still on the clock`)
  }
})

test('accepts a Date as well as an ISO string', () => {
  assert.equal(designDueAt(at(APPROVED))?.toISOString(), designDueAt(APPROVED)?.toISOString())
})

test('orders approved before the cutoff are not measured', () => {
  // These predate the pipeline. They were never promised 48 hours, so showing
  // them as breached would bury the orders that genuinely are.
  const legacy = new Date(DESIGN_SLA_START.getTime() - 1000).toISOString()
  assert.equal(slaState(legacy, at('2026-08-05T00:00:00.000Z')), null)
})

test('the cutoff moment itself is on the clock', () => {
  const state = slaState(DESIGN_SLA_START.toISOString(), at('2026-07-30T01:00:00.000Z'))
  assert.ok(state, 'an order approved exactly at the cutoff is measured')
  assert.equal(state.tone, 'ok')
})

test('a deadline still computes for a legacy order even though it is not shown', () => {
  // designDueAt is arithmetic; only slaState applies the policy.
  const legacy = '2026-07-01T09:00:00.000Z'
  assert.ok(designDueAt(legacy), 'the maths still works')
  assert.equal(slaState(legacy, at('2026-07-10T00:00:00.000Z')), null, 'but it is not measured')
})

test('exposes a compact label and elapsed fraction for a progress ring', () => {
  const quarterGone = slaState(APPROVED, at('2026-07-31T21:00:00.000Z'))
  assert.equal(quarterGone?.short, '36h', 'no words — the ring supplies the meaning')
  assert.equal(Math.round((quarterGone?.elapsedFraction ?? 0) * 100), 25)

  const half = slaState(APPROVED, at('2026-08-01T09:00:00.000Z'))
  assert.equal(Math.round((half?.elapsedFraction ?? 0) * 100), 50)
})

test('an overdue job fills the ring rather than overshooting it', () => {
  const late = slaState(APPROVED, at('2026-08-09T09:00:00.000Z'))
  assert.equal(late?.elapsedFraction, 1, 'clamped — a ring cannot be more than full')
  assert.equal(late?.short, '7d')
})

test('a brand-new job has an empty ring', () => {
  const fresh = slaState(APPROVED, at('2026-07-31T09:00:00.000Z'))
  assert.equal(fresh?.elapsedFraction, 0)
})
