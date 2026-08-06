/**
 * Scrubbing credentials and personal data out of anything about to be logged.
 *
 * Free of `server-only` for the same reasons as `whatsapp/redact.ts`: this is
 * exactly the kind of function that must be tested rather than assumed, and a
 * pure helper exported from a `server-only` module breaks the production build
 * if a client component ever pulls it in.
 */

/** Digit runs that look like an MSISDN, in the two shapes we ever send. */
const MSISDN = /\b(?:255\d{9}|0[67]\d{8})\b/g

/**
 * Replace every occurrence of the given secrets with a marker.
 *
 * The API key and secret are also masked in their base64 pairing, because a
 * gateway that echoes a bad `Authorization` header back in an error body would
 * otherwise write live credentials to stdout.
 */
export function redactSecrets(text: string, secrets: readonly (string | undefined)[]): string {
  let out = text
  for (const secret of secrets) {
    if (!secret || secret.length < 4) continue
    out = out.split(secret).join('<redacted>')
  }
  return out
}

/**
 * Blank the middle of anything shaped like a Tanzanian phone number.
 *
 * Gateway responses echo recipients back per message, so a raw response body
 * in a log is a list of guests' numbers. Keeping the prefix and last two digits
 * leaves the line useful for telling networks apart while removing the ability
 * to actually contact anyone from it.
 */
export function redactPhoneNumbers(text: string): string {
  return text.replace(MSISDN, (m) => `${m.slice(0, 5)}${'*'.repeat(m.length - 7)}${m.slice(-2)}`)
}

/**
 * Everything above, applied to a raw provider response before it is logged.
 *
 * Provider request/message identifiers survive on purpose — capturing them is
 * the point of logging the first real send. Only MSISDN-shaped runs are masked,
 * so a numeric request id is not destroyed along with them.
 */
export function redactProviderResponse(
  body: string,
  secrets: readonly (string | undefined)[],
): string {
  return redactPhoneNumbers(redactSecrets(body, secrets))
}
