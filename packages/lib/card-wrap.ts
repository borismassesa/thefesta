// Where a line breaks, defined precisely enough that two implementations agree.
//
// "Wrap to maxLines" is not a specification. The Studio and the render server
// both break the same name and must produce the same lines, so every decision
// below is stated rather than left to whichever implementation happens to run:
//
//   WHITESPACE      collapsed. Runs arrive from the artwork split across tspans
//                   with indentation between the fragments.
//   NON-BREAKING    U+00A0 never breaks, and measures as a space.
//   HYPHENS         a break is allowed AFTER a hyphen inside a word, keeping the
//                   hyphen on the first line. 'Doe-Mwakatobe' may become
//                   'Doe-' / 'Mwakatobe'. We never INSERT a hyphen.
//   LONG TOKENS     a single word wider than the line breaks by GRAPHEME, not by
//                   code unit, and only when the profile allows it. Splitting a
//                   combining mark from its base letter would corrupt the name.
//   EXPLICIT BREAKS a newline in the value is honoured and always breaks.
//   EMPTY LINES     dropped. A trailing newline must not consume a line budget.
//
// PROTECTED PHRASES are the reason this module exists rather than a two-line
// split on spaces. A Tanzanian guest list is full of honorific pairs, and
//
//     Mr. &
//     Mrs. Christopher Alexander
//     Mwakipesile
//
// is a worse card than
//
//     Mr. & Mrs. Christopher
//     Alexander Mwakipesile
//
// even though both fit. The phrase is kept whole, and BALANCING then evens the
// line lengths instead of greedily filling the first one.

import { measureRun, type FontMetrics } from './card-font-metrics'

/** How a particular kind of copy wants to break. */
export type WrapProfile = 'guest-name' | 'venue' | 'body' | 'single-line'

export type BreakMode =
  /** Break between words only. A word wider than the line stays overlong. */
  | 'word'
  /** Break between words, then inside a word by grapheme if it still will not fit. */
  | 'word-then-grapheme'

export type WrapOptions = {
  text: string
  metrics: FontMetrics
  fontSize: number
  letterSpacing: number
  maxWidth: number
  maxLines: number
  breakMode: BreakMode
  /** Even out line lengths instead of greedily filling the first line. */
  balance: boolean
  /** Sequences that must never be split across lines, longest matched first. */
  protectedPhrases: readonly string[]
}

export type WrapResult = {
  lines: string[]
  widths: number[]
  /** True when a line is still wider than maxWidth, i.e. nothing could break it. */
  overfull: boolean
  /** True when the text needed more lines than the budget allowed. */
  truncated: boolean
}

/**
 * Honorific pairs and titles that read as one unit on a Tanzanian invitation.
 *
 * Swahili and English both appear, often on the same card. Ordered longest
 * first so 'Bw & Bi' is matched before 'Bw'.
 */
export const DEFAULT_PROTECTED_PHRASES: readonly string[] = [
  'Bw. na Bi.',
  'Bw na Bi',
  'Bw. & Bi.',
  'Bw & Bi',
  'Mr. & Mrs.',
  'Mr & Mrs',
  'Mr. and Mrs.',
  'Mr and Mrs',
  'Prof. Dr.',
  'Prof Dr',
  'Dr. Eng.',
  'Ndugu na',
]

/** The break policy for each kind of copy. */
export const WRAP_PROFILES: Record<
  WrapProfile,
  Pick<WrapOptions, 'breakMode' | 'balance' | 'protectedPhrases'>
> = {
  // Names are the reason this exists. Never leave an honorific stranded, and
  // even the lines out so a wrapped name reads as a design decision.
  'guest-name': {
    breakMode: 'word-then-grapheme',
    balance: true,
    protectedPhrases: DEFAULT_PROTECTED_PHRASES,
  },
  // A venue is an address; greedy filling reads naturally and balancing would
  // put 'JUU' alone on its own line.
  venue: { breakMode: 'word', balance: false, protectedPhrases: [] },
  body: { breakMode: 'word', balance: false, protectedPhrases: [] },
  'single-line': { breakMode: 'word', balance: false, protectedPhrases: [] },
}

const NBSP = '\u00A0'

/**
 * A word: anything that is not BREAKING whitespace, U+00A0 included.
 *
 * `[^\\s]` alone is wrong, because `\\s` matches the non-breaking space — so a
 * word regex built on it stops at exactly the character a designer used to
 * prevent a break, and the NBSP run then becomes a token of its own. 'Saa 12:00'
 * is the case that matters: the time and its unit are one unbreakable token.
 */
const WORD = /^(?:[^\s]|\u00A0)+/

/** Whitespace a line MAY break at: everything except U+00A0. */
const BREAKING_WS = /^[^\S\u00A0]+/

/** A token, and whether a line may end after it. */
type Token = { text: string; breakAfter: boolean; forcedBreak: boolean }

/**
 * Split a value into the smallest units a line may end on.
 *
 * Protected phrases are matched FIRST, on the raw text, so a phrase spanning a
 * space survives the split that would otherwise separate its words.
 */
export function tokenise(text: string, protectedPhrases: readonly string[]): Token[] {
  const normalised = text.replace(/\r\n?/g, '\n')
  const phrases = [...protectedPhrases].sort((a, b) => b.length - a.length)
  const tokens: Token[] = []

  // Split on explicit newlines first: they always break, whatever else applies.
  const paragraphs = normalised.split('\n')
  paragraphs.forEach((paragraph, index) => {
    for (const token of tokenieParagraph(paragraph, phrases)) tokens.push(token)
    if (index < paragraphs.length - 1 && tokens.length > 0) {
      tokens[tokens.length - 1] = { ...tokens[tokens.length - 1], forcedBreak: true, breakAfter: true }
    }
  })

  return tokens
}

function tokenieParagraph(paragraph: string, phrases: readonly string[]): Token[] {
  const tokens: Token[] = []
  let rest = paragraph

  while (rest.length > 0) {
    const leading = BREAKING_WS.exec(rest)
    if (leading) {
      // Collapsed: a run of whitespace is one break opportunity, not several.
      if (tokens.length > 0) tokens[tokens.length - 1].breakAfter = true
      rest = rest.slice(leading[0].length)
      continue
    }

    const phrase = phrases.find((candidate) => rest.startsWith(candidate))
    if (phrase) {
      tokens.push({ text: phrase, breakAfter: false, forcedBreak: false })
      rest = rest.slice(phrase.length)
      continue
    }

    // A word runs to the next breakable whitespace. A non-breaking space is
    // deliberately NOT a boundary: it is what a designer uses to hold two words
    // together, and honouring it is cheaper than another protected phrase.
    const word = WORD.exec(rest)![0]
    tokens.push({ text: word, breakAfter: false, forcedBreak: false })
    rest = rest.slice(word.length)
  }

  return tokens
}

/**
 * Break a value into lines.
 *
 * Deterministic: same inputs, same output, on any implementation that shares
 * the metrics table. That is the contract the Studio preview depends on.
 */
export function wrapText(options: WrapOptions): WrapResult {
  const { metrics, fontSize, letterSpacing, maxWidth, maxLines } = options
  // NBSP is measured as an ordinary space: it is the same glyph, and a face
  // that has no separate advance for it would otherwise report a missing glyph.
  const width = (value: string) =>
    measureRun(value.replaceAll(NBSP, ' '), metrics, fontSize, letterSpacing).width

  const tokens = tokenise(options.text, options.protectedPhrases)
  if (tokens.length === 0) return { lines: [], widths: [], overfull: false, truncated: false }

  const units = options.breakMode === 'word-then-grapheme' ? splitOverlong(tokens, width, maxWidth) : tokens

  let lines = greedy(units, width, maxWidth)
  if (options.balance && lines.length > 1 && lines.length <= maxLines) {
    lines = balanceLines(units, width, lines.length, maxWidth)
  }

  const truncated = lines.length > maxLines
  const kept = truncated ? lines.slice(0, maxLines) : lines
  const widths = kept.map(width)

  return {
    lines: kept,
    widths,
    overfull: widths.some((value) => value > maxWidth),
    truncated,
  }
}

/** Greedy fill: the classic algorithm, and the baseline balancing improves on. */
function greedy(tokens: Token[], width: (value: string) => number, maxWidth: number): string[] {
  const lines: string[] = []
  let current = ''

  for (const token of tokens) {
    const joiner = current && !current.endsWith(NBSP) ? ' ' : ''
    const candidate = current ? `${current}${joiner}${token.text}` : token.text
    if (!current || width(candidate) <= maxWidth) {
      current = candidate
    } else {
      lines.push(current)
      current = token.text
    }
    if (token.forcedBreak) {
      lines.push(current)
      current = ''
    }
  }
  if (current) lines.push(current)
  return lines.length > 0 ? lines : ['']
}

/**
 * Fill to a target line count with the lines as even as possible.
 *
 * Minimises the WIDEST line, found by binary search on a width budget: the
 * narrowest budget that still fits the text in `target` lines is the most even
 * arrangement. Deterministic, and far simpler to reason about than a penalty
 * function nobody can predict the output of.
 */
function balanceLines(
  tokens: Token[],
  width: (value: string) => number,
  target: number,
  maxWidth: number,
): string[] {
  const longest = Math.max(...tokens.map((token) => width(token.text)))
  let low = Math.ceil(longest)
  let high = Math.ceil(maxWidth)
  let best = greedy(tokens, width, maxWidth)

  while (low <= high) {
    const budget = Math.floor((low + high) / 2)
    const attempt = greedy(tokens, width, budget)
    if (attempt.length <= target) {
      best = attempt
      high = budget - 1
    } else {
      low = budget + 1
    }
  }
  return best
}

/**
 * Break tokens that no line could ever hold.
 *
 * After a hyphen where there is one, and otherwise by grapheme. Graphemes
 * rather than code units because splitting a combining mark from its base
 * letter turns a name into mojibake, and because a surrogate pair split in half
 * is not text at all.
 */
function splitOverlong(
  tokens: Token[],
  width: (value: string) => number,
  maxWidth: number,
): Token[] {
  const out: Token[] = []
  for (const token of tokens) {
    if (width(token.text) <= maxWidth) {
      out.push(token)
      continue
    }

    // Prefer the designer's own break points: a hyphen already says "this word
    // may be read in two parts".
    const hyphenated = token.text.split(/(?<=-)/)
    const pieces =
      hyphenated.length > 1 && hyphenated.every((piece) => width(piece) <= maxWidth)
        ? hyphenated
        : byGrapheme(token.text, width, maxWidth)

    pieces.forEach((piece, index) => {
      out.push({
        text: piece,
        // Pieces of one word rejoin without a space, which `greedy` handles by
        // treating them as separate tokens only when a break is needed.
        breakAfter: index === pieces.length - 1 ? token.breakAfter : false,
        forcedBreak: index === pieces.length - 1 ? token.forcedBreak : false,
      })
    })
  }
  return out
}

function byGrapheme(
  text: string,
  width: (value: string) => number,
  maxWidth: number,
): string[] {
  const graphemes = segment(text)
  const pieces: string[] = []
  let current = ''

  for (const grapheme of graphemes) {
    const candidate = current + grapheme
    if (current && width(candidate) > maxWidth) {
      pieces.push(current)
      current = grapheme
    } else {
      current = candidate
    }
  }
  if (current) pieces.push(current)
  return pieces
}

/**
 * Grapheme clusters, using Intl where the runtime has it.
 *
 * The fallback is code POINTS rather than code units, so a surrogate pair is
 * never cut in half even on a runtime with no segmenter. A combining mark can
 * still be separated there, which is why the segmenter is preferred.
 */
function segment(text: string): string[] {
  const Segmenter = (Intl as { Segmenter?: new (locale?: string, options?: object) => { segment(input: string): Iterable<{ segment: string }> } })
    .Segmenter
  if (Segmenter) {
    return [...new Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(
      (entry) => entry.segment,
    )
  }
  return [...text]
}
