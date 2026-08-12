/**
 * The commercial terms a quotation prints, in a module both sides can import.
 *
 * Deliberately NOT in cart-storage.ts, which is `'use client'`: the PDF is
 * rendered on the server, and a value imported from a client module arrives
 * there as a client-reference stub rather than a number. That stub is truthy,
 * so `d.setDate(d.getDate() + stub)` produced an Invalid Date and the quotation
 * printed the words "VALID UNTIL INVALID DATE" to customers. Nothing here may
 * import a client module, or the same trap reopens.
 */

/**
 * How long a quotation holds its prices.
 *
 * Tier prices are CMS-editable, so a quote with no expiry is an open-ended
 * promise the catalogue can't keep. A week is long enough for a couple to take
 * the PDF to whoever is paying and get an answer, and short enough that a
 * price edit can't be held against us.
 *
 * Change this and the PDF follows, but the cart's `quote_hint` CMS string
 * spells the number out in words. Update that too.
 */
export const QUOTE_VALID_DAYS = 7
