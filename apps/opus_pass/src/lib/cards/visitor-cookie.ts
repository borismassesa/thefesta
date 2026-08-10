// A stable, meaningless id for one browser, used only to scope card artwork.
//
// WHY IT EXISTS. Card artwork is trace-stamped with a code derived from whoever
// was shown it (see protected-art.ts). For a signed-in couple that is their
// Clerk id. The catalogue, though, is public — most people browsing designs have
// no account, and without something to key on, every anonymous visitor would
// receive the same stamp and a leak would trace back to "the internet".
//
// WHAT IT IS NOT. Not analytics, not a profile, not a join key. It is a random
// value with no meaning outside this application, never written to a table, and
// read by exactly one code path. It is deliberately NOT derived from an IP or a
// user agent: a fingerprint would be a privacy problem that a random value is
// not, and would be less stable anyway.

/** Random per browser, so nothing about the visitor can be read out of it. */
export const VISITOR_COOKIE = 'of-cardview'

/**
 * A year. The cookie only has to outlive the interval between someone seeing a
 * design and that design turning up somewhere it should not be, which is
 * measured in months.
 */
export const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/**
 * 16 bytes of randomness, hex-encoded.
 *
 * `crypto.getRandomValues` rather than `node:crypto`, because this runs in
 * middleware on the edge runtime where the Node built-in is unavailable.
 */
export function newVisitorId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Rejects anything not minted by newVisitorId, so a crafted cookie cannot steer the stamp. */
export function isVisitorId(value: string | undefined): value is string {
  return typeof value === 'string' && /^[0-9a-f]{32}$/.test(value)
}
