/**
 * What a message will actually cost, before it is sent.
 *
 * Beem bills per *segment*, not per message, and the segment size depends on
 * encoding: 160 characters of GSM-7, but only 70 of UCS-2. A single curly
 * apostrophe pasted in from a word processor drops the budget by more than
 * half, so a message that looks ordinary can quietly cost 3x. A character
 * count alone cannot express that, which is why nothing should gate on
 * `body.length`.
 *
 * Free of `server-only`: the invitation composer will need this in the browser
 * to show segments and cost as the user types, and it is asserted in tests.
 */

/** The GSM 03.38 basic alphabet. */
const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'

/** Characters reachable in GSM-7 only via an escape, costing two septets. */
const GSM7_EXTENDED = '^{}\\[~]|€'

const GSM7_SINGLE = 160
const GSM7_CONCAT = 153 // 7 septets go to the concatenation header
const UCS2_SINGLE = 70
const UCS2_CONCAT = 67

export type SmsEncoding = 'gsm7' | 'unicode'

export interface SmsLengthAnalysis {
  encoding: SmsEncoding
  /** Visible characters, as a human would count them. */
  characters: number
  /** Billable units — what Beem actually charges for. */
  segments: number
  /** How many more characters fit before another segment is charged. */
  remainingInSegment: number
  /**
   * Characters that forced Unicode. Deduplicated and in first-seen order, so
   * a composer can point at exactly what to remove — usually a curly quote,
   * an en dash, a non-breaking space or an emoji.
   */
  unsupportedCharacters: string[]
}

/**
 * Render one offending character so it is safe to put in an error message.
 *
 * The characters that force Unicode are frequently the ones you cannot see: a
 * non-breaking space, a zero-width joiner, a stray control code. Interpolated
 * raw, they produce an error that reads as though it is complaining about
 * nothing, and a newline or an ANSI escape lands inside a log line and can
 * forge a second entry. Always pairing the glyph with its code point makes the
 * invisible ones nameable; printable-only rendering keeps the log intact.
 */
export function describeUnsupportedCharacter(char: string): string {
  const code = char.codePointAt(0) ?? 0
  const point = `U+${code.toString(16).toUpperCase().padStart(4, '0')}`
  return isInvisible(code) ? point : `${char} (${point})`
}

/**
 * Code points with no visible glyph, written as numeric ranges rather than as
 * themselves — a source file containing literal zero-width characters is
 * unreviewable, which is the same problem in a different place.
 */
function isInvisible(code: number): boolean {
  return (
    code < 0x20 || // C0 controls, incl. newline and tab
    (code >= 0x7f && code <= 0x9f) || // DEL and C1 controls
    code === 0x00a0 || // no-break space
    (code >= 0x2000 && code <= 0x200f) || // en/em spaces, ZWSP, ZWJ, LRM/RLM
    (code >= 0x2028 && code <= 0x202f) || // line/para separators, bidi overrides
    code === 0x2060 || // word joiner
    code === 0xfeff // BOM / zero-width no-break space
  )
}

/** The whole unsupported set, rendered for an error message or a composer. */
export function describeUnsupportedCharacters(chars: readonly string[]): string {
  return chars.map(describeUnsupportedCharacter).join(', ')
}

/** Cost in GSM-7 septets: 1 normally, 2 for an escaped extension character. */
function septets(char: string): number {
  if (GSM7_BASIC.includes(char)) return 1
  if (GSM7_EXTENDED.includes(char)) return 2
  return 0
}

export function analyzeSmsLength(body: string): SmsLengthAnalysis {
  // Iterating the string (not indexing) keeps astral characters — emoji — as
  // single units here; their true UTF-16 cost is applied below.
  const chars = [...body]

  const unsupported: string[] = []
  let units = 0
  for (const char of chars) {
    const cost = septets(char)
    if (cost === 0) {
      if (!unsupported.includes(char)) unsupported.push(char)
    } else {
      units += cost
    }
  }

  if (unsupported.length === 0) {
    return {
      encoding: 'gsm7',
      characters: chars.length,
      ...split(units, GSM7_SINGLE, GSM7_CONCAT),
      unsupportedCharacters: [],
    }
  }

  // UCS-2 is billed in 16-bit code units, so an emoji outside the BMP counts
  // twice. `body.length` is exactly that count.
  return {
    encoding: 'unicode',
    characters: chars.length,
    ...split(body.length, UCS2_SINGLE, UCS2_CONCAT),
    unsupportedCharacters: unsupported,
  }
}

function split(
  units: number,
  single: number,
  concat: number,
): { segments: number; remainingInSegment: number } {
  if (units === 0) return { segments: 0, remainingInSegment: single }
  if (units <= single) return { segments: 1, remainingInSegment: single - units }
  const segments = Math.ceil(units / concat)
  return { segments, remainingInSegment: segments * concat - units }
}
