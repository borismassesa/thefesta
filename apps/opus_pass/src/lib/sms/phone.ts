/**
 * Tanzanian MSISDN normalisation for the SMS gateway.
 *
 * Free of `server-only` so it can be unit tested (see the note in
 * `whatsapp/redact.ts` for why that matters here).
 *
 * This is deliberately stricter than `dashboard/share.ts`'s `normalizePhone`,
 * which is a display/deep-link helper and passes unknown country codes through
 * untouched. A number handed to Beem is a number we are billed for and that a
 * stranger may receive, so anything we cannot resolve with certainty is
 * rejected rather than guessed at.
 */

/** Canonical form Beem expects: country code, no plus, no separators. */
const TZ_COUNTRY_CODE = '255'

/**
 * Structure only: 9 digits. Whether a given prefix can actually receive an SMS
 * is a separate, changeable policy — see `isSupportedTanzanianMobilePrefix`.
 */
const TZ_SUBSCRIBER = /^\d{9}$/

/**
 * Prefixes we will send to today.
 *
 * Deliberately a mutable allowlist rather than a rule baked into the parser:
 * operator ranges are assigned by the regulator and change, and discovering a
 * missing one should mean editing this array, not rewriting number parsing.
 * Landline ranges (22…) are absent because they cannot receive SMS at all —
 * sending to one is money spent on a message that can never arrive.
 */
const SUPPORTED_MOBILE_PREFIXES = ['6', '7'] as const

/** Characters people legitimately type inside a phone number. */
const SEPARATORS = /[\s()\-.]/g

/**
 * Whether a canonical number's prefix is one we can deliver SMS to.
 *
 * Separate from parsing on purpose, so the allowlist can be widened when a new
 * operator range appears without touching the code that decides what a
 * Tanzanian number *is*, and so a rejection can say "unsupported prefix"
 * rather than the misleading "invalid number".
 */
export function isSupportedTanzanianMobilePrefix(canonical: string): boolean {
  const subscriber = canonical.slice(TZ_COUNTRY_CODE.length)
  return SUPPORTED_MOBILE_PREFIXES.some((p) => subscriber.startsWith(p))
}

/** Why a number was refused — distinguishes "we cannot parse this" from "we
 *  parsed it and choose not to send there". */
export type PhoneRejection = 'unparseable' | 'unsupported_prefix'

export interface PhoneCheck {
  /** Canonical `255XXXXXXXXX`, present only when structurally valid. */
  canonical: string | null
  /** True when canonical AND on the supported-prefix allowlist. */
  sendable: boolean
  rejection?: PhoneRejection
}

/**
 * Parse structure and apply prefix policy in one call, keeping the two
 * outcomes distinguishable.
 */
export function checkTanzanianPhone(raw: string | null | undefined): PhoneCheck {
  const canonical = parseTanzanianPhone(raw)
  if (!canonical) return { canonical: null, sendable: false, rejection: 'unparseable' }
  if (!isSupportedTanzanianMobilePrefix(canonical)) {
    return { canonical, sendable: false, rejection: 'unsupported_prefix' }
  }
  return { canonical, sendable: true }
}

/**
 * Canonical `255XXXXXXXXX` for any structurally valid Tanzanian number, or
 * `null`. Says nothing about whether the prefix can receive SMS.
 *
 * Accepted: `0712345678`, `712345678`, `255712345678`, `+255712345678`, and
 * the same with spaces, dashes, dots or parentheses.
 *
 * Rejected (all return `null`, never a "repaired" number):
 *  - wrong lengths, e.g. a digit short or a digit long
 *  - doubled country codes and mixed prefixes (`2550255…`, `00255…`, `2550…`)
 *  - other countries' numbers — we have no basis to rewrite them as Tanzanian
 *  - anything containing letters or stray symbols
 */
export function parseTanzanianPhone(raw: string | null | undefined): string | null {
  if (!raw) return null

  const trimmed = raw.trim().replace(SEPARATORS, '')
  if (!trimmed) return null

  // A leading plus is the only non-digit that survives. Anything else (letters,
  // `*`, `#`, a second plus) means we are not looking at a phone number and we
  // must not strip our way to a plausible one.
  const hadPlus = trimmed.startsWith('+')
  const digits = hadPlus ? trimmed.slice(1) : trimmed
  if (!/^\d+$/.test(digits)) return null

  // Already carries the country code.
  if (digits.startsWith(TZ_COUNTRY_CODE)) {
    const subscriber = digits.slice(TZ_COUNTRY_CODE.length)
    return TZ_SUBSCRIBER.test(subscriber) ? `${TZ_COUNTRY_CODE}${subscriber}` : null
  }

  // A `+` says the caller gave us a full international number. If it is not
  // Tanzanian, it is not ours to rewrite.
  if (hadPlus) return null

  // National format: 0 + 9-digit subscriber.
  if (digits.startsWith('0')) {
    const subscriber = digits.slice(1)
    return TZ_SUBSCRIBER.test(subscriber) ? `${TZ_COUNTRY_CODE}${subscriber}` : null
  }

  // Bare subscriber number, as typed into a local handset.
  if (TZ_SUBSCRIBER.test(digits)) return `${TZ_COUNTRY_CODE}${digits}`

  return null
}

/**
 * A phone number reduced to what is useful in a log line and useless to anyone
 * reading it: `255712345678` → `25571****78`.
 *
 * Server logs are retained and searchable; a guest's full number in them is a
 * standing disclosure. Enough of the prefix survives to tell networks apart
 * when debugging routing.
 */
export function maskPhone(phone: string): string {
  if (phone.length <= 7) return '*'.repeat(phone.length)
  return `${phone.slice(0, 5)}${'*'.repeat(phone.length - 7)}${phone.slice(-2)}`
}
