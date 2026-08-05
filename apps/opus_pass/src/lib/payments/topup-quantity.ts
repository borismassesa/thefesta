// Top-up quantities. Pure, and deliberately in its own module: the stepper on
// the top-up page and the authoritative check in the pricing layer must agree
// exactly, and the page is a client component that cannot import a
// 'server-only' file.
//
// The catalogue's 50-guest minimum does not apply here. It exists because a
// first purchase pays for design work, and designing a card for 10 guests is
// not viable. A top-up buys no design work at all — the card is already frozen
// — so the floor is about order economics, not production.

export const TOPUP_MIN_GUESTS = 10
/** Increment above the minimum: 10, 15, 20, 25, … */
export const TOPUP_STEP = 5
/** Upper bound. Not a business rule — a guard against a fat-fingered 100000. */
export const TOPUP_MAX_GUESTS = 2000

export type TopupQuantityError = 'not_a_number' | 'below_minimum' | 'bad_step' | 'above_maximum'

/**
 * The one definition of a valid top-up quantity. Returns the value or the
 * reason it was rejected — callers that only need a number use
 * `clampTopupGuests`, which snaps instead of failing (the stepper's job).
 */
export function validateTopupGuests(
  input: unknown,
): { ok: true; guests: number } | { ok: false; error: TopupQuantityError } {
  // Strict: a real number, not something coercible to one. `Number('20')` is
  // 20 and `Number(null)` is 0, so coercing would quietly accept a malformed
  // payload as a purchase quantity. A client sending anything but a number here
  // is a bug, and failing is how it gets found.
  if (typeof input !== 'number') return { ok: false, error: 'not_a_number' }
  const n = input
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { ok: false, error: 'not_a_number' }
  if (n < TOPUP_MIN_GUESTS) return { ok: false, error: 'below_minimum' }
  if (n > TOPUP_MAX_GUESTS) return { ok: false, error: 'above_maximum' }
  if ((n - TOPUP_MIN_GUESTS) % TOPUP_STEP !== 0) return { ok: false, error: 'bad_step' }
  return { ok: true, guests: n }
}

/** Snap any number onto the nearest valid quantity at or above the minimum. */
export function clampTopupGuests(input: number): number {
  if (!Number.isFinite(input)) return TOPUP_MIN_GUESTS
  const floored = Math.max(TOPUP_MIN_GUESTS, Math.min(TOPUP_MAX_GUESTS, Math.round(input)))
  const stepsAbove = Math.round((floored - TOPUP_MIN_GUESTS) / TOPUP_STEP)
  return Math.min(TOPUP_MAX_GUESTS, TOPUP_MIN_GUESTS + stepsAbove * TOPUP_STEP)
}
