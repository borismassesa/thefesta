import assert from 'node:assert/strict'
import test from 'node:test'
import { UNASSIGNED } from './card-layer-groups'
import {
  announceAssignment,
  describeRow,
  groupForRole,
  latestRecovery,
  needsScroll,
  resolveRowRecovery,
  type RowRecovery,
} from './card-row-recovery'

// ── Destination group ──

test('a role resolves to the group it belongs to', () => {
  assert.equal(groupForRole('guest_name'), 'Hosts')
  assert.equal(groupForRole('couple_name_1'), 'Couple')
  assert.equal(groupForRole('palette_1'), 'Design')
})

test('nothing, empty and unknown all resolve to unassigned', () => {
  assert.equal(groupForRole(undefined), UNASSIGNED)
  assert.equal(groupForRole(''), UNASSIGNED)
  assert.equal(groupForRole('role_deleted_in_a_refactor'), UNASSIGNED)
})

// ── Did the row actually move? ──

test('assigning an unmapped layer moves it out of unassigned', () => {
  const recovery = resolveRowRecovery({
    layerId: 'Bi._Fabiola_Thomas',
    previousRole: undefined,
    nextRole: 'guest_name',
    revision: 1,
  })
  assert.deepEqual(recovery, {
    layerId: 'Bi._Fabiola_Thomas',
    destination: 'Hosts',
    revision: 1,
  })
})

test('unmapping a layer moves it back to unassigned', () => {
  const recovery = resolveRowRecovery({
    layerId: 'x',
    previousRole: 'guest_name',
    nextRole: '',
    revision: 2,
  })
  assert.equal(recovery?.destination, UNASSIGNED)
})

test('re-picking the same role is not a move', () => {
  assert.equal(
    resolveRowRecovery({
      layerId: 'x',
      previousRole: 'guest_name',
      nextRole: 'guest_name',
      revision: 1,
    }),
    null,
  )
})

test('changing role WITHIN a group is not a move', () => {
  // Ceremony venue to Reception venue: both Venue, so the row does not go
  // anywhere. Scrolling and refocusing here would be movement nobody asked for.
  assert.equal(
    resolveRowRecovery({
      layerId: 'x',
      previousRole: 'venue_1_place',
      nextRole: 'venue_2_place',
      revision: 1,
    }),
    null,
  )
})

test('a layer that was never mapped and still is not is not a move', () => {
  // Choosing "Not a field" on an already-unassigned row.
  assert.equal(
    resolveRowRecovery({ layerId: 'x', previousRole: undefined, nextRole: '', revision: 1 }),
    null,
  )
})

// ── Races ──

test('the later revision wins', () => {
  const first: RowRecovery = { layerId: 'a', destination: 'Hosts', revision: 1 }
  const second: RowRecovery = { layerId: 'b', destination: 'Venue', revision: 2 }
  assert.deepEqual(latestRecovery(first, second), second)
})

test('an older revision arriving late does not displace the newer one', () => {
  const newer: RowRecovery = { layerId: 'b', destination: 'Venue', revision: 5 }
  const stale: RowRecovery = { layerId: 'a', destination: 'Hosts', revision: 3 }
  assert.deepEqual(latestRecovery(newer, stale), newer)
})

test('a non-move leaves any pending recovery alone rather than clearing it', () => {
  const pending: RowRecovery = { layerId: 'a', destination: 'Hosts', revision: 1 }
  assert.deepEqual(latestRecovery(pending, null), pending)
  assert.equal(latestRecovery(null, null), null)
})

// ── Scrolling ──

const VIEWPORT = { top: 0, bottom: 800 }

test('a row already fully in view is not scrolled to', () => {
  assert.equal(needsScroll({ top: 300, bottom: 340 }, VIEWPORT), false)
})

test('a row above or below the fold is scrolled to', () => {
  assert.equal(needsScroll({ top: -50, bottom: -10 }, VIEWPORT), true)
  assert.equal(needsScroll({ top: 900, bottom: 940 }, VIEWPORT), true)
})

test('a row only partly in view is scrolled to', () => {
  assert.equal(needsScroll({ top: 780, bottom: 820 }, VIEWPORT), true)
  assert.equal(needsScroll({ top: -5, bottom: 35 }, VIEWPORT), true)
})

test('a row exactly filling the viewport edges counts as visible', () => {
  assert.equal(needsScroll({ top: 0, bottom: 800 }, VIEWPORT), false)
})

test('a row flush to the edge is visible despite sub-pixel layout rounding', () => {
  // Real numbers from the mapper: scrollIntoView put the row at 29.83 against a
  // container top of 30. Compared exactly, that reads as off-screen and
  // scrolls again on every recovery, never converging.
  assert.equal(needsScroll({ top: 29.828125, bottom: 88.33 }, { top: 30, bottom: 690 }), false)
  assert.equal(needsScroll({ top: 689.6, bottom: 690.4 }, { top: 30, bottom: 690 }), false)
})

test('slack is sub-pixel only, not a way to miss a row that is genuinely off', () => {
  assert.equal(needsScroll({ top: 25, bottom: 60 }, { top: 30, bottom: 690 }), true)
  assert.equal(needsScroll({ top: 660, bottom: 695 }, { top: 30, bottom: 690 }), true)
})

// ── What focus lands on, and what is announced ──

test('the row says what it is, what it maps to and where it sits', () => {
  assert.equal(
    describeRow('Bi. Fabiola Thomas', 'Bi._Fabiola_Thomas', 'guest_name'),
    'Bi. Fabiola Thomas, mapped to Guest name, in Hosts.',
  )
})

test('a layer with no text of its own falls back to its id', () => {
  // Every colour and image layer, which have no sample text to show.
  assert.equal(describeRow('   ', 'palette_swatch_1', 'palette_1'), 'palette_swatch_1, mapped to Colour 1, in Design.')
  assert.equal(describeRow('', 'Rectangle_2', undefined), 'Rectangle_2, not mapped.')
})

test('the announcement names the destination only when there was one', () => {
  assert.equal(
    announceAssignment('Bi. Fabiola Thomas', 'Bi._Fabiola_Thomas', 'guest_name', true),
    'Bi. Fabiola Thomas mapped to Guest name and moved to Hosts.',
  )
  // Same group, so saying it "moved" would be a lie.
  assert.equal(
    announceAssignment('KKKT Sala sala JUU', 'x', 'venue_2_place', false),
    'KKKT Sala sala JUU mapped to Reception venue.',
  )
})

test('unmapping is announced as unmapping', () => {
  assert.equal(
    announceAssignment('Moses Seeta', 'couple_name_1', '', true),
    `Moses Seeta is no longer mapped and moved to ${UNASSIGNED}.`,
  )
})
