import assert from 'node:assert/strict'
import test from 'node:test'
import {
  acceptedIdentifiers,
  acceptsIdentifier,
  refusalMessage,
  type EventAcceptanceRow,
} from './identifier-acceptance'

const NOW = new Date('2026-08-05T12:00:00Z')
const daysFromNow = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString()

function event(over: Partial<EventAcceptanceRow> = {}): EventAcceptanceRow {
  return { starts_at: daysFromNow(7), ends_at: daysFromNow(7), created_at: daysFromNow(-30), ...over }
}

test('a QR credential is accepted by default', () => {
  assert.equal(acceptsIdentifier(event(), 'credential', NOW), true)
})

test('a Pass ID is accepted by default and does not expire', () => {
  // The point of a Pass ID is that a guest can read it out; retiring it on a
  // timer would defeat that.
  assert.equal(acceptsIdentifier(event(), 'pass_id', NOW), true)
  assert.equal(acceptsIdentifier(event({ ends_at: daysFromNow(-3650) }), 'pass_id', NOW), true)
})

test('an entry code is accepted while the event is current', () => {
  assert.equal(acceptsIdentifier(event(), 'legacy_entry_code', NOW), true)
  assert.equal(acceptsIdentifier(event({ ends_at: daysFromNow(-1) }), 'legacy_entry_code', NOW), true)
})

test('an entry code retires well after the event, not on the day', () => {
  // A guest arriving with a printed ticket the day after must still get in;
  // the same code typed at an unrelated event months later must not.
  assert.equal(acceptsIdentifier(event({ ends_at: daysFromNow(-29) }), 'legacy_entry_code', NOW), true)
  assert.equal(acceptsIdentifier(event({ ends_at: daysFromNow(-31) }), 'legacy_entry_code', NOW), false)
})

test('an undated event still ages out', () => {
  // "Date to be announced" is normal here. Anchoring to created_at means the
  // compatibility window drains to zero instead of staying open forever.
  const undated = { starts_at: null, ends_at: null }
  assert.equal(
    acceptsIdentifier(event({ ...undated, created_at: daysFromNow(-1) }), 'legacy_entry_code', NOW),
    true,
  )
  assert.equal(
    acceptsIdentifier(event({ ...undated, created_at: daysFromNow(-3650) }), 'legacy_entry_code', NOW),
    false,
  )
})

test('an event with no dates at all refuses the legacy code', () => {
  assert.equal(
    acceptsIdentifier({ starts_at: null, ends_at: null, created_at: null }, 'legacy_entry_code', NOW),
    false,
  )
})

// ── Overrides ─────────────────────────────────────────────────────────────

test('an explicit false wins over an otherwise-accepted default', () => {
  assert.equal(acceptsIdentifier(event({ accepts_credential: false }), 'credential', NOW), false)
  assert.equal(acceptsIdentifier(event({ accepts_pass_id: false }), 'pass_id', NOW), false)
  assert.equal(acceptsIdentifier(event({ accepts_entry_code: false }), 'legacy_entry_code', NOW), false)
})

test('an explicit true keeps a long-retired entry code working', () => {
  // The reason the override exists: a venue reprinting old tickets, or a
  // guest list that never migrated.
  const longGone = event({ ends_at: daysFromNow(-3650), accepts_entry_code: true })
  assert.equal(acceptsIdentifier(longGone, 'legacy_entry_code', NOW), true)
})

test('NULL means derive, and is not the same as false', () => {
  // The distinction the migration deliberately preserves by not backfilling:
  // a NULL keeps tracking the default, an explicit value stops tracking it.
  const derived = event({ accepts_entry_code: null, ends_at: daysFromNow(-31) })
  const forced = event({ accepts_entry_code: true, ends_at: daysFromNow(-31) })
  assert.equal(acceptsIdentifier(derived, 'legacy_entry_code', NOW), false)
  assert.equal(acceptsIdentifier(forced, 'legacy_entry_code', NOW), true)
})

test('a missing column reads as NULL, so an unmigrated row still works', () => {
  // Rows read before the migration lands have no such property at all.
  const bare: EventAcceptanceRow = { starts_at: daysFromNow(7), ends_at: daysFromNow(7) }
  assert.deepEqual(acceptedIdentifiers(bare, NOW), ['credential', 'legacy_entry_code', 'pass_id'])
})

test('acceptedIdentifiers reports exactly what the door will take', () => {
  assert.deepEqual(acceptedIdentifiers(event(), NOW), ['credential', 'legacy_entry_code', 'pass_id'])
  assert.deepEqual(acceptedIdentifiers(event({ ends_at: daysFromNow(-31) }), NOW), [
    'credential',
    'pass_id',
  ])
  assert.deepEqual(
    acceptedIdentifiers(event({ accepts_credential: false, accepts_entry_code: false }), NOW),
    ['pass_id'],
  )
})

test('a refused identifier reads the same as one that does not exist', () => {
  // Telling an attendant a code is the right SHAPE but not accepted here
  // leaks something about the identifier space, and about other events.
  assert.equal(refusalMessage('pass_id'), 'No guest found with that Pass ID')
  assert.equal(refusalMessage('legacy_entry_code'), 'No guest found with that code')
})
