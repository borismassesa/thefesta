import assert from 'node:assert/strict'
import test from 'node:test'
import {
  TOPUP_MAX_GUESTS,
  TOPUP_MIN_GUESTS,
  clampTopupGuests,
  validateTopupGuests,
} from './topup-quantity'

test('the catalogue 50-guest floor does not apply to a top-up', () => {
  assert.equal(TOPUP_MIN_GUESTS, 10)
  assert.deepEqual(validateTopupGuests(10), { ok: true, guests: 10 })
})

test('accepts the minimum and every step of 5 above it', () => {
  for (const n of [10, 15, 20, 25, 100, 505]) {
    assert.deepEqual(validateTopupGuests(n), { ok: true, guests: n }, `${n} should be valid`)
  }
})

test('rejects quantities below the minimum', () => {
  for (const n of [0, 1, 5, 9]) {
    assert.deepEqual(validateTopupGuests(n), { ok: false, error: 'below_minimum' })
  }
})

test('rejects off-step quantities', () => {
  for (const n of [11, 12, 13, 14, 21, 99]) {
    assert.deepEqual(validateTopupGuests(n), { ok: false, error: 'bad_step' }, `${n} is off-step`)
  }
})

test('rejects anything that is not a whole number', () => {
  for (const value of [12.5, NaN, Infinity, '20', null, undefined, {}]) {
    const result = validateTopupGuests(value)
    assert.equal(result.ok, false)
  }
})

test('rejects an implausibly large top-up rather than trying to charge for it', () => {
  assert.deepEqual(validateTopupGuests(TOPUP_MAX_GUESTS + 5), { ok: false, error: 'above_maximum' })
})

test('clamp snaps onto a quantity validate() accepts', () => {
  for (const input of [-100, 0, 7, 11, 13, 14, 998, 1_000_000]) {
    const snapped = clampTopupGuests(input)
    assert.equal(
      validateTopupGuests(snapped).ok,
      true,
      `clamp(${input}) = ${snapped} must be a valid quantity`,
    )
  }
})

test('clamp never drifts a quantity that is already valid', () => {
  for (const n of [10, 15, 40, 1000]) {
    assert.equal(clampTopupGuests(n), n)
  }
})

test('stepping down from the minimum stays at the minimum', () => {
  assert.equal(clampTopupGuests(TOPUP_MIN_GUESTS - 5), TOPUP_MIN_GUESTS)
})
