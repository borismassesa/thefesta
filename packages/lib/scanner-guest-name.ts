/**
 * Remove legacy spreadsheet decorations from a guest name before it reaches
 * the door scanner UI.
 *
 * Some older guest lists stored the source row number, pledge amount and a
 * payment/status emoji inside `full_name`, for example
 * `33.Mariam Werema 100K 🅰️`. Those values remain useful in their original
 * worksheet, but they are not part of the person's name and must never be
 * shown to an attendant or printed in a scanner report.
 *
 * The patterns are deliberately narrow: only a leading numbered-list marker,
 * a trailing K/M shorthand amount, and known trailing status emoji are
 * removed. Names containing ordinary numbers or a final letter A survive.
 */
export function scannerGuestDisplayName(value: string | null | undefined): string {
  const original = value?.trim() || 'Guest'
  let name = original

  // Spreadsheet/list ordinal: `33.Mariam`, `33) Mariam`, `33 - Mariam`.
  //
  // A bare hyphen is NOT a marker, because a leading number joined by one is
  // usually part of the name: `3-D Productions`, `24-7 Events`, `7-Eleven`.
  // Only a spaced hyphen counts, which is the form the legacy sheets used.
  //
  // The marker must also be followed by a non-digit. `1.5M` is an amount, not
  // row 1 of a guest called "5M", and the digit test is what tells them apart.
  name = name.replace(/^\d{1,4}(?:\s*[.)]|\s+-)\s*(?=\D)/, '')

  const stripStatusMarks = (s: string) => s.replace(/(?:\s*(?:🅰️?|✅|✔️?|☑️|❌))+\s*$/u, '').trim()
  const stripPledgeAmount = (s: string) =>
    s.replace(/\s+(?:TZS\s*)?\d+(?:[.,]\d+)?\s*[KM]\s*$/i, '').trim()

  // Status decorations may follow the amount with or without a separating
  // space. Repeat so a row carrying more than one legacy mark is cleaned too.
  name = stripStatusMarks(name)

  // Legacy pledge shorthand: `100K`, `200 k`, `1.5M`, optionally prefixed by
  // the currency. It must be at the end after status marks were removed.
  name = stripPledgeAmount(name)

  // The two decorations appear in either order (`… 🅰️ 100K` as well as
  // `… 100K 🅰️`), and each rule is anchored to the end, so whichever came
  // second hid the other from its own pass. One more round clears it.
  name = stripPledgeAmount(stripStatusMarks(name))

  return name || original
}
