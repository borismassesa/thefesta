/**
 * Pure, directive-free helpers for the door-staff access code.
 *
 * Deliberately NOT in checkin-tokens.ts: that file is `server-only` (it
 * imports node:crypto), and Next treats a server-only module as poisoned for
 * the whole client graph — importing even a pure formatter from it into a
 * 'use client' component breaks the build. The alphabet lives here too so
 * the generator and the display logic can never drift apart.
 */

/**
 * Crockford-style base32 minus I, L, O and U. I/L/O are excluded because
 * they're indistinguishable from 1/1/0 on a phone screen at a dark venue
 * door; U is excluded to avoid accidental profanity. Exactly 32 symbols,
 * which also makes `byte % 32` an unbiased pick in the generator.
 *
 * Must stay in sync with apps/opus_pass/src/lib/checkin/tokens.ts, which
 * verifies codes minted here.
 */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const CODE_LENGTH = 8

/** Display form, grouped for legibility: ABCD-EFGH. */
export function formatScannerAccessCode(rawToken: string): string {
  if (rawToken.length !== CODE_LENGTH) return rawToken
  return `${rawToken.slice(0, 4)}-${rawToken.slice(4)}`
}

/**
 * How long a door code stays valid. 'event' is the default and the only
 * option that tracks the shift the code actually exists for; the fixed
 * durations are deliberate overrides (testing, or an event with no time set).
 */
export type AccessCodeValidity = 'event' | '12h' | '72h' | '7d'

export const ACCESS_CODE_VALIDITY_OPTIONS: { value: AccessCodeValidity; label: string }[] = [
  { value: 'event', label: 'Until the event ends' },
  { value: '12h', label: '12 hours' },
  { value: '72h', label: '72 hours' },
  { value: '7d', label: '7 days' },
]

const FIXED_VALIDITY_HOURS: Record<Exclude<AccessCodeValidity, 'event'>, number> = {
  '12h': 12,
  '72h': 72,
  '7d': 24 * 7,
}

/** Doors open before the published start and close well after it, so the
 *  event window is padded either side rather than being exactly starts_at. */
const EVENT_WINDOW_LEAD_HOURS = 12
const EVENT_WINDOW_TRAIL_HOURS = 12

/** Fallback when 'event' is asked for but the event has no start time. */
const NO_START_FALLBACK_HOURS = 72

const HOUR_MS = 60 * 60 * 1000

/**
 * When a door code should expire.
 *
 * The naive fixed-duration expiry is wrong in both directions: a code minted a week
 * before the wedding is dead by the time the doors open, and one minted on
 * the morning stays live long after the last guest has gone. Anchoring to
 * the event instead means the credential lasts exactly as long as the shift
 * it was issued for.
 *
 * Returns an ISO string. `now` is injected so this stays pure and testable.
 */
export function accessCodeExpiry(
  validity: AccessCodeValidity,
  eventStartsAt: string | null,
  eventEndsAt: string | null = null,
  now: Date = new Date(),
): string {
  if (validity !== 'event') {
    return new Date(now.getTime() + FIXED_VALIDITY_HOURS[validity] * HOUR_MS).toISOString()
  }

  // Anchor to the couple's explicit end time when they set one — that's the
  // truest "the event is over" signal — and fall back to the start otherwise.
  // Either way a trailing window is added so late arrivals can still be
  // admitted after the published time.
  const end = eventEndsAt ? new Date(eventEndsAt) : null
  const start = eventStartsAt ? new Date(eventStartsAt) : null
  const validEnd = end && !Number.isNaN(end.getTime()) ? end : null
  const validStart = start && !Number.isNaN(start.getTime()) ? start : null
  // Anchor on the LATER of the two when both are set. Normally that's the end
  // time, but if the data is corrupt (ends_at before starts_at) picking the
  // end blindly would give a shorter window than the start alone — the exact
  // lock-out this function exists to prevent — so max() guards that.
  const anchor =
    validEnd && validStart
      ? validEnd.getTime() >= validStart.getTime()
        ? validEnd
        : validStart
      : (validEnd ?? validStart)
  if (!anchor) {
    return new Date(now.getTime() + NO_START_FALLBACK_HOURS * HOUR_MS).toISOString()
  }

  const eventEnd = new Date(anchor.getTime() + EVENT_WINDOW_TRAIL_HOURS * HOUR_MS)
  // A code re-issued mid-event (dead phone, extra attendant) must still be
  // usable, so never hand back an already-expired token: give it the lead
  // window from now instead.
  const floor = new Date(now.getTime() + EVENT_WINDOW_LEAD_HOURS * HOUR_MS)
  return (eventEnd > floor ? eventEnd : floor).toISOString()
}
