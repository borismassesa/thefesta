/**
 * How a typed admission identifier is folded onto its stored form.
 *
 * Shared by /api/checkin/lookup and /api/checkin/scan. It used to live as a
 * private helper inside the scan route; once a second endpoint accepts the
 * same typed values, two copies of this rule would eventually disagree about
 * what an attendant typed, and the disagreement would show up as "the code
 * works when I look it up but not when I admit them".
 *
 * Pure — no database, no request — so it can be tested directly.
 */

/**
 * Crockford-style base32 without I, L, O or U.
 *
 * The exclusion is the point: nothing in a generated identifier can be
 * confused with 1 or 0, so the folding below is unambiguous rather than
 * lossy. Mirrors the alphabet in
 * 20260805000000_guest_invitation_pass_id.sql and
 * 20260721000003_opuspass_guest_entry_code.sql.
 */
export const IDENTIFIER_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** A generated Pass ID: exactly 8 characters from the alphabet above. */
export const PASS_ID_PATTERN = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/

/** A legacy entry code: 6 characters, unique only within one event. */
export const ENTRY_CODE_PATTERN = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{6}$/

/**
 * Fold typing variations onto the stored form.
 *
 * Uppercases, drops separators a human adds when reading a code aloud
 * ("9KYS-ZTNF", "9KYS ZTNF"), and maps the look-alike characters onto the
 * ones actually in the alphabet:
 *
 *   O -> 0        I, L -> 1
 *
 * That direction is safe precisely because the alphabet excludes O, I and L:
 * a stored identifier can never contain them, so folding can never turn one
 * valid identifier into a different valid identifier. It only rescues a guest
 * who read a 0 as an "oh".
 *
 * U is deliberately not folded. Crockford excludes it too, so it never appears
 * in a generated value, and there is no character it is plausibly mistaken
 * for — a typed U simply fails to match, which is the correct answer.
 */
export function normaliseTypedIdentifier(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
}

/**
 * Which kind of identifier a typed value looks like, by shape alone.
 *
 * Returns null when it matches neither, so a caller can refuse before
 * querying rather than sending an arbitrary string to the database as a
 * filter. Shape only: whether it EXISTS is a separate question, and answering
 * "that isn't a Pass ID" is safe where answering "that Pass ID isn't issued"
 * would let someone probe the identifier space.
 */
export function classifyTypedIdentifier(input: string): 'pass_id' | 'legacy_entry_code' | null {
  const folded = normaliseTypedIdentifier(input)
  if (PASS_ID_PATTERN.test(folded)) return 'pass_id'
  if (ENTRY_CODE_PATTERN.test(folded)) return 'legacy_entry_code'
  return null
}
