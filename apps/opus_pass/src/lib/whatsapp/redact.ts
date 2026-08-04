/**
 * Scrubbing capabilities out of anything about to be logged.
 *
 * Its own module, free of `server-only`, for two reasons: a pure helper
 * exported from a `server-only` file cannot be unit tested (and breaks the
 * Turbopack production build if a client component ever pulls it in), and this
 * is exactly the kind of function that must be tested rather than assumed.
 */

/**
 * Blank the token out of any `/p/<token>` URL, keeping the shape visible.
 *
 * `/p/<token>` is a capability: whoever holds it can open a guest's pass and
 * mint a wallet object carrying their admission credential. It travels in
 * WhatsApp message bodies, and anything that logs a body would otherwise write
 * live capabilities to stdout.
 *
 * Matches on the PATH rather than on the `WMT1:` prefix, so a later change to
 * the token format cannot silently start logging real tokens again.
 */
export function redactPassLinks(body: string): string {
  return body.replace(/(\/p\/)[^\s]+/g, '$1<redacted>')
}
